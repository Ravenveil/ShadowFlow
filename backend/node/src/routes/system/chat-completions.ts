/**
 * routes/system/chat-completions.ts — 单后端迁移：Chat Completions API（BYOK）
 *
 * 移植自 python backend/python/shadowflow/api/groups/chat.py：
 *   POST /api/chat/completions
 *     headers: X-LLM-Key（必填）/ X-LLM-Provider（默认 zhipu）/ X-LLM-Model
 *     body:    {messages, agent_id?, stream?}
 *
 * 与 Python 的差异（主理人裁决）：
 *   - stream 接受但忽略：永远单次 JSON（不流式）
 *   - LLM 调用走 Node transport/api-clients 的 callProvider（claude→anthropic
 *     映射 + DEFAULT_MODELS 按 provider 取默认模型）；密钥经 transport/byokKey
 *     的 resolveProviderKey 四级解析（header 通用头 → settings/byok → env）
 *   - 断连中止监听 res 'close'（req 'close' 在 Node 16+ body 消费完即触发，
 *     会把调用掐死在起步——llm.ts 同款处理）
 *
 * 响应 {data:{content,model,provider,tokens_used}, meta:{}}；provider 回显
 * header 原名（claude 不改写成 anthropic）；usage 缺失回 0。provider 异常统一
 * 502 LLM_ERROR；白名单外 provider 400 UNKNOWN_PROVIDER。
 */

import express, { Router, Request, Response } from 'express';
import { callProvider, type ProviderChunk } from '../../transport/api-clients';
import { resolveProviderKey } from '../../transport/byokKey';
import { repoDataFile } from '../../storage/repo-root';

const router = Router();

// 全局 body 限制 1mb 会挡带图 content parts（messages[].content 数组可含
// image_url 块）——本 router 顶部放宽到 10mb。
router.use(express.json({ limit: '10mb' }));

// Allowlist for agent_id to prevent path traversal
const AGENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

// 照抄 chat.py DEFAULT_MODELS（前端 chat 名 → 默认模型）
const DEFAULT_MODELS: Record<string, string> = {
  zhipu: 'glm-4-flash',
  openai: 'gpt-4o-mini',
  claude: 'claude-3-5-haiku-20241022',
  ollama: 'llama3.2',
  deepseek: 'deepseek-chat',
};

// 照抄 chat.py provider_map 的白名单（claude → anthropic 走 callProvider）
const PROVIDER_MAP: Record<string, string> = {
  zhipu: 'zhipu',
  openai: 'openai',
  claude: 'anthropic',
  ollama: 'ollama',
  deepseek: 'deepseek',
};

interface ChatMessage {
  role: string;
  content: string | unknown[];
}

/** FastAPI HTTPException(detail={error:{code,message}}) 的 JSON 等价体。 */
function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** Express 头取值（可能 string[]），取首值 trim。 */
function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

function textOfContent(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        parts.push(block);
      } else if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>;
        if (typeof b['text'] === 'string') parts.push(b['text']);
      }
    }
    return parts.join('\n\n');
  }
  return '';
}

router.post('/completions', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    messages?: unknown;
    agent_id?: unknown;
    stream?: unknown;
  };

  const providerName = (headerValue(req, 'x-llm-provider') ?? 'zhipu').toLowerCase();

  const apiKeyHeader = headerValue(req, 'x-llm-key');
  if (!apiKeyHeader) {
    fail(res, 401, 'NO_API_KEY', 'X-LLM-Key header required');
    return;
  }

  const ptype = PROVIDER_MAP[providerName];
  if (!ptype) {
    fail(res, 400, 'UNKNOWN_PROVIDER', `Unknown provider: ${providerName}`);
    return;
  }

  const model = headerValue(req, 'x-llm-model') ?? DEFAULT_MODELS[providerName] ?? '';

  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[]).filter(
        (m) => m && typeof m === 'object' && typeof (m as ChatMessage).role === 'string',
      )
    : [];

  // Try to load agent soul if agent_id provided
  if (typeof body.agent_id === 'string' && body.agent_id) {
    try {
      // Validate agent_id to prevent path traversal attacks
      if (!AGENT_ID_RE.test(body.agent_id)) {
        throw new Error(`Invalid agent_id format: ${JSON.stringify(body.agent_id)}`);
      }
      const agentFile = repoDataFile('agents', `${body.agent_id}.json`);
      const fsMod = await import('fs');
      if (fsMod.existsSync(agentFile)) {
        const agentData = JSON.parse(fsMod.readFileSync(agentFile, 'utf-8')) as Record<
          string,
          unknown
        >;
        const soul = typeof agentData['soul'] === 'string' ? agentData['soul'] : '';
        if (soul) {
          // Prepend system message if not already present
          const hasSystem = messages.some((m) => m.role === 'system');
          if (!hasSystem) {
            messages.unshift({ role: 'system', content: soul });
          }
        }
      }
    } catch {
      // ignore agent load errors, proceed without soul
    }
  }

  const systemPrompt = messages
    .filter((m) => m.role === 'system')
    .map((m) => textOfContent(m.content))
    .join('\n\n');
  const userMessage = messages
    .filter((m) => m.role !== 'system')
    .map((m) => textOfContent(m.content))
    .join('\n\n');

  // 密钥四级解析：per-provider 头 → 通用 X-LLM-* 头 → settings/byok → env
  const apiKey = resolveProviderKey(ptype, req.headers as Record<string, string | string[]>) ?? apiKeyHeader;

  const ac = new AbortController();
  // 客户端断连挂 res 'close'（不是 req 'close'——见 llm.ts 同款注释）：
  // Node 16+ 的 req 'close' 在 body 消费完即触发，会在调用起步前就 abort。
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });

  try {
    const stream = callProvider(ptype, {
      systemPrompt,
      userMessage,
      model,
      api_key: apiKey,
      signal: ac.signal,
    });
    let content = '';
    let usageTokens = 0;
    let failed: { code?: string; message: string } | null = null;
    for await (const chunk of stream) {
      const c = chunk as ProviderChunk;
      if (c.type === 'text-delta') {
        content += c.text;
      } else if (c.type === 'error') {
        failed = { code: c.code, message: c.message };
        break;
      } else if (c.type === 'end') {
        break;
      }
    }
    if (failed) {
      fail(res, 502, 'LLM_ERROR', failed.message);
      return;
    }
    // chat.py 直接透传 response.tokens_used；callProvider shim 不吐 usage
    // 事件，此处无从取值时回 0（Story 9.4 式占位，接入 usage 事件后再透传）。
    res.status(200).json({
      data: {
        content,
        model,
        provider: providerName, // 回显 header 原名（claude 不改写）
        tokens_used: usageTokens,
      },
      meta: {},
    });
  } catch (err) {
    fail(res, 502, 'LLM_ERROR', (err as Error).message ?? String(err));
  }
});

export default router;

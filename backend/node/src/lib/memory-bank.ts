/**
 * memory-bank.ts — 多模态记忆库检索辅助（对话框知识库接线，2026-11-06）。
 *
 * run-sessions / groups-chat 组装提示词前调用 knowledgeBlock()：按用户消息
 * 检索命中，渲染成「知识库参考」文本块，与经验记忆块并列注入 skill 层尾部，
 * 让 Agent 回答真正引用知识库内容。
 *
 * 单后端迁移（2026-11-18）：不再硬编码 Python URL。分流规则（team-lead 裁决）：
 *   - SF_BACKEND_MODE=single 或 SF_MEMORY_BANK_MODE=node → 直调本地 Node 实现
 *     （backend/node/src/memory-bank/service.ts），零网络；
 *   - SF_MEMORY_BANK_MODE=python → 维持原 HTTP 到 Python sidecar；
 *   - 默认 auto → 先本地，本地抛错时回退 HTTP（Python 未起则按 fail-soft 跳包）。
 *
 * fail-soft 契约（与经验记忆块一致，保持不变）：本地异常 / Python 未起 / 超时 /
 * 单包失败 → 跳过该包；全军覆没或零命中 → 返回 ''，绝不阻塞 run。
 *
 * 导出签名不变：coercePackIds / fetchMemoryBankHits / renderKnowledgeBlock /
 * knowledgeBlock —— 调用方（run-sessions、groups-chat）零改动。
 */
import { PYTHON_BACKEND_URL } from '../python-backend';
import { isSingleBackend } from '../config/backend-mode';

export interface MemoryBankHitLite {
  text: string;
  source: string;
  score: number;
}

/** 每包命中条数（对话场景 4 条够用，控上下文长度）。 */
const TOP_K = 4;
/** 单包 HTTP 检索超时（毫秒）。仅 python/auto 回退路径使用；本地路径同步无需超时。 */
const TIMEOUT_MS = 4000;
/** pack id 数量上限（防御：别让一个 payload 拖一串请求）。 */
const MAX_PACKS = 8;
/** 单条命中文本截断（字符）。 */
const HIT_TEXT_CAP = 400;
/** 整块渲染上限（字符），超限丢尾部命中。 */
const BLOCK_CAP = 4000;

type DispatchMode = 'node' | 'python' | 'auto';

function dispatchMode(): DispatchMode {
  const raw = (process.env.SF_MEMORY_BANK_MODE ?? '').trim().toLowerCase();
  if (raw === 'node' || raw === 'python' || raw === 'auto') return raw;
  return 'auto';
}

/** auto/local 语义：本地优先（本地 fail 时回退 HTTP；node 模式不回退）。 */
function prefersLocal(): boolean {
  const mode = dispatchMode();
  if (mode === 'node') return true;
  if (mode === 'python') return false;
  return true; // auto
}

/** 请求体/会话字段里的 pack id 数组 → 干净的 id 列表（非法项丢弃）。 */
export function coercePackIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || id.length > 200) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_PACKS) break;
  }
  return out;
}

/** 本地实现检索单包。异常抛给上层分流回退。 */
async function localHits(packId: string, q: string): Promise<MemoryBankHitLite[]> {
  // 动态 import：避免冷启动加载整条解析/检索链
  const { query } = await import('../memory-bank/service');
  const result = query(packId, { query: q, top_k: TOP_K });
  const hits: MemoryBankHitLite[] = [];
  for (const h of result.data.hits) {
    if (typeof h.text !== 'string' || !h.text.trim()) continue;
    hits.push({
      text: h.text.trim(),
      source: typeof h.source === 'string' && h.source ? h.source : packId,
      score: typeof h.score === 'number' ? h.score : 0,
    });
  }
  return hits;
}

/** HTTP Python 检索单包（原实现保留，作为 python/auto 回退路径）。 */
async function httpHits(packId: string, q: string): Promise<MemoryBankHitLite[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${PYTHON_BACKEND_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, top_k: TOP_K }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: { hits?: Array<{ text?: unknown; source?: unknown; score?: unknown }> };
    };
    const hits: MemoryBankHitLite[] = [];
    for (const h of body.data?.hits ?? []) {
      if (typeof h.text !== 'string' || !h.text.trim()) continue;
      hits.push({
        text: h.text.trim(),
        source: typeof h.source === 'string' && h.source ? h.source : packId,
        score: typeof h.score === 'number' ? h.score : 0,
      });
    }
    return hits;
  } finally {
    clearTimeout(timer);
  }
}

/** 单包检索：分流核心。single 强制本地不回退；auto 本地失败回退 HTTP。 */
async function hitsForPack(packId: string, q: string): Promise<MemoryBankHitLite[]> {
  const mode = dispatchMode();
  const forcedPython = mode === 'python';
  const single = isSingleBackend();
  if (!forcedPython) {
    try {
      return await localHits(packId, q);
    } catch {
      if (mode === 'node' || single) return []; // 无 HTTP 可回退 → fail-soft 跳包
      // auto：继续尝试 HTTP
    }
  }
  try {
    return await httpHits(packId, q);
  } catch {
    return [];
  }
}

/**
 * 对每个 pack 发一次 top_k 检索，聚平命中（按 score 降序）。
 * 单包失败只跳过该包；查询串空 / 无 pack → 直接 []。
 */
export async function fetchMemoryBankHits(
  packIds: string[],
  query: string,
): Promise<MemoryBankHitLite[]> {
  const q = query.trim();
  if (!q || packIds.length === 0) return [];
  const hits: MemoryBankHitLite[] = [];
  await Promise.all(
    packIds.map(async (packId) => {
      try {
        const packHits = await hitsForPack(packId, q);
        hits.push(...packHits);
      } catch {
        /* fail-soft：单包任何异常不阻塞整体 */
      }
    }),
  );
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/** 命中列表 → 「知识库参考」块；零命中返回 ''。 */
export function renderKnowledgeBlock(hits: MemoryBankHitLite[]): string {
  if (hits.length === 0) return '';
  const lines: string[] = [
    '## 知识库参考（记忆库检索命中，回答时优先引用；引用时注明「来源」）',
    '',
  ];
  for (const h of hits) {
    const text =
      h.text.length > HIT_TEXT_CAP ? `${h.text.slice(0, HIT_TEXT_CAP)}…` : h.text;
    lines.push(`- （来源：${h.source}）${text}`);
  }
  let block = lines.join('\n');
  if (block.length > BLOCK_CAP) block = `${block.slice(0, BLOCK_CAP)}\n…（已截断）`;
  return block;
}

/** 检索 + 渲染一把梭（fail-soft，异常返回 ''）。 */
export async function knowledgeBlock(
  packIds: string[] | undefined,
  query: string,
): Promise<string> {
  try {
    const hits = await fetchMemoryBankHits(packIds ?? [], query);
    return renderKnowledgeBlock(hits);
  } catch {
    return '';
  }
}

/** auto 语义常量：本地优先。保留 prefersLocal 供测试断言分流逻辑。 */
export const _prefersLocal = prefersLocal;

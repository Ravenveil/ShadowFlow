/**
 * news 域 — AIHOT 式内容管线（2026-11-25）。
 *
 * 参考开源项目 KKKKhazix/AIHOT（aihot.news）的核心编辑管线，精简为单步批量评分：
 *   抓取(RSS) → LLM 批量评分（价值分 + 中文标题 + 中文摘要 + 推荐理由 + 分类）
 *
 * AIHOT 原版是逐条双独立评分 + 向量聚簇 + 事件热度；本仓库条目量级小（≤400），
 * 精简为「一批 10 条、一次调用出全部字段」，省 token 且延迟可控。
 *
 * 与 lib/run-suggestions.ts 同一注入模式（callImpl ?? callProvider）；
 * LLM 不可用 / 失败 / 解析为空 → 该批返回 null，绝不编造评分。
 */

import { callProvider, type ProviderChunk, type ProviderId } from '../adapters/transport/api-clients/index';
import type { NewsCategory, NewsVerdict } from './model';

/** 一批喂给模型多少条（太多输出截断风险高）。 */
export const ENRICH_BATCH_SIZE = 10;
/** 单次 enrich 任务最多评多少条（防一次烧光 token）。 */
export const ENRICH_MAX_ITEMS = 40;

export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  'model',
  'industry',
  'opinion',
  'product',
  'dev',
];

const CATEGORY_LIST = NEWS_CATEGORIES.join(' / ');

export interface VerdictInput {
  item_id: string;
  title: string;
  summary: string;
}

export interface EnrichLlmOptions {
  provider: ProviderId;
  apiKey?: string;
  model?: string;
  /** 测试注入；默认走 transport/api-clients 的 callProvider。 */
  callImpl?: typeof callProvider;
}

/** 组装 system / user prompt（约束模型只输出 JSON 数组）。批内用短编号 #1..#N，模型不用回显长 id。 */
export function buildEnrichPrompts(batch: readonly VerdictInput[]): {
  systemPrompt: string;
  userMessage: string;
} {
  const systemPrompt = [
    '你是 AI 领域新闻编辑，为技术团队的信息看板评分和改写内容。对每条输入新闻输出：',
    `1. score：0-10 价值分（一位小数）。按 AI/技术相关度、时效性、对从业者的信息量评分；营销软文给低分。`,
    '2. title_zh：中文标题（不超过 24 字），意译不直译，信息量优先。',
    '3. summary_zh：中文摘要（不超过 60 字），说清「发生了什么、为什么重要」。',
    '4. reason：一句话推荐理由（不超过 20 字），说明值得读的点。',
    `5. category：从 ${CATEGORY_LIST} 中选一个。`,
    '每条输入有编号（#1、#2…）。只输出 JSON 数组，形如 [{"id":1,"score":7.5,"title_zh":"...","summary_zh":"...","reason":"...","category":"model"}]，id 就是输入编号的数字。不要解释、标题或代码块包裹。',
  ].join('\n');

  const lines = batch.map(
    (item, i) =>
      `#${i + 1}\n标题：${item.title}\n摘要：${item.summary.slice(0, 200) || '（无）'}`,
  );
  return { systemPrompt, userMessage: lines.join('\n\n') };
}

const SUMMARY_MAX = 80;
const REASON_MAX = 40;

/** 把模型给的任意的值收敛成合法 verdict；字段缺失就丢字段，不硬造。 */
function toVerdict(raw: Record<string, unknown>): NewsVerdict | null {
  const scoreNum = Number(raw.score);
  if (!Number.isFinite(scoreNum)) return null;
  const score = Math.round(Math.min(Math.max(scoreNum, 0), 10) * 10) / 10;
  const category = NEWS_CATEGORIES.includes(raw.category as NewsCategory)
    ? (raw.category as NewsCategory)
    : undefined;
  const str = (v: unknown, max: number): string | undefined => {
    const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    return s ? (s.length > max ? `${s.slice(0, max)}…` : s) : undefined;
  };
  const verdict: NewsVerdict = {
    score,
    ...(category ? { category } : {}),
    ...{ title_zh: str(raw.title_zh, 40) },
    ...{ summary_zh: str(raw.summary_zh, SUMMARY_MAX) },
    ...{ reason: str(raw.reason, REASON_MAX) },
  };
  return verdict;
}

/**
 * 剥掉模型的思考标签（glm 系会输出 <sf:thinking>…</sf:thinking> / <think>…</think>），
 * 留下正文再抠 JSON。
 */
function stripThinking(raw: string): string {
  return raw
    .replace(/<sf:thinking>[\s\S]*?<\/sf:thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

/**
 * 解析模型输出 → 批内序号 → verdict。模型回的是短编号（id: 数字），
 * 这里映射回调用批的 item_id；序号越界 / 字段缺失的丢弃。
 */
export function parseVerdicts(
  raw: string,
  batch: readonly VerdictInput[],
): Map<string, NewsVerdict> {
  const out = new Map<string, NewsVerdict>();
  const text = stripThinking(raw.trim());
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(`[news-enrich] parse: no JSON array in output (${text.slice(0, 120)})`);
    return out;
  }
  let arr: unknown;
  try {
    arr = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('[news-enrich] parse: JSON.parse failed');
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const idx = Number(rec.id);
    if (!Number.isInteger(idx) || idx < 1 || idx > batch.length || out.has(batch[idx - 1].item_id)) {
      continue;
    }
    const verdict = toVerdict(rec);
    if (verdict) out.set(batch[idx - 1].item_id, verdict);
  }
  return out;
}

/**
 * 单批 LLM 调用：prompt → 流式收全文 → parseVerdicts。
 * 任何失败（无 key / error chunk / 抛错 / 解析为空）→ null。
 */
export async function enrichBatch(
  opts: EnrichLlmOptions,
  batch: readonly VerdictInput[],
): Promise<Map<string, NewsVerdict> | null> {
  const call = opts.callImpl ?? callProvider;
  const { systemPrompt, userMessage } = buildEnrichPrompts(batch);
  let text = '';
  try {
    const stream: AsyncGenerator<ProviderChunk> = call(opts.provider, {
      systemPrompt,
      userMessage,
      model: opts.model,
      max_tokens: 4000,
      temperature: 0.3,
      api_key: opts.apiKey,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text;
      } else if (chunk.type === 'error') {
        console.warn(`[news-enrich] batch error: ${chunk.code} ${chunk.message}`);
        return null;
      }
    }
  } catch (err) {
    console.warn(`[news-enrich] batch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const parsed = parseVerdicts(text, batch);
  return parsed.size > 0 ? parsed : null;
}

/**
 * run-sessions/tool-projection.ts — tool-call 投影层（clawsgo 左栏对齐）。
 * 从 run-sessions.ts 抽出的纯函数块（零依赖）；公共 API 由 ../run-sessions/index.ts re-export。
 */

// ── Tool-call projection (clawsgo left-pane parity) ──────────────────────────
// Extracted as a pure, exported factory so it can be unit-tested in isolation
// (mirrors the `emitToolChunk` contract test). It translates the runtime's
// structured `tool-use` / `tool-result` SSE payloads into normalized
// `tool-call` frames the StepList nests under the owning step:
//   { id, tool, title, input_summary, status: 'running'|'done'|'failed',
//     result_summary?, result_count?, links?, elapsed_ms?, step_index?, node_id? }
// Every field is derived from REAL runtime data — no fabrication. The projector
// keeps an in-flight map keyed by the tool_use call id so the matching
// `tool-result` flips status + attaches result summary, result_count, links and
// elapsed timing. `node_id` already scopes calls per agent, so team/DAG runs
// (whose chunks are node-stamped by executor.ts before pipeChunksToSse) project
// through this exact path with no extra wiring.

/** A normalized tool-call SSE payload. */
export interface ToolCallProjection {
  id: string;
  tool: string;
  title: string;
  input_summary: string;
  status: 'running' | 'done' | 'failed';
  result_summary?: string;
  /** clawsgo "找到 N 个结果" — real hit count parsed from the result, when known. */
  result_count?: number;
  links?: Array<{ label: string; url: string }>;
  elapsed_ms?: number;
  step_index?: number;
  node_id?: string;
}

interface InFlightToolCall {
  id: string;
  tool: string;
  step_index: number | null;
  node_id?: string;
  started_at: number;
}

/** Collapse an arbitrary tool input object into a one-line human summary. */
export function summarizeToolInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input.slice(0, 160);
  if (typeof input !== 'object') return String(input).slice(0, 160);
  const obj = input as Record<string, unknown>;
  for (const key of ['query', 'q', 'search', 'url', 'path', 'file_path', 'command', 'cmd', 'pattern', 'prompt']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return `${key}: ${v.trim()}`.slice(0, 160);
  }
  try {
    return JSON.stringify(obj).slice(0, 160);
  } catch {
    return '';
  }
}

/** Collapse a tool result payload into a one-line summary. */
export function summarizeToolResult(output: unknown): string {
  if (output == null) return '';
  const text = typeof output === 'string' ? output : (() => {
    try { return JSON.stringify(output); } catch { return String(output); }
  })();
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Extract clickable result links (http(s) URLs) from a tool output — deduped,
 * capped at 5, host+path labelled — so the StepList can render clawsgo's
 * "found N results → clickable links". Only URLs that really appeared.
 */
export function extractToolLinks(output: unknown): Array<{ label: string; url: string }> {
  const text = typeof output === 'string' ? output : (() => {
    try { return JSON.stringify(output); } catch { return ''; }
  })();
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s"'<>)\]]+/g);
  if (!urls) return [];
  const seen = new Set<string>();
  const links: Array<{ label: string; url: string }> = [];
  for (const url of urls) {
    const clean = url.replace(/[.,;]+$/, '');
    if (seen.has(clean)) continue;
    seen.add(clean);
    let label = clean;
    try {
      const u = new URL(clean);
      label = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
    } catch { /* keep raw */ }
    links.push({ label: label.slice(0, 60), url: clean });
    if (links.length >= 5) break;
  }
  return links;
}

/**
 * Parse a structured result count out of a tool result — clawsgo's
 * "找到 N 个结果" beat. Search / lookup tools announce their hit count in a
 * leading phrase ("found 12 results", "12 个结果", "3 matches", "5 行" …); we
 * pull the FIRST such number. Returns undefined when no count phrase is found,
 * so callers fall back to the link count. Only REAL numbers are surfaced.
 */
export function parseResultCount(output: unknown): number | undefined {
  const text = typeof output === 'string' ? output : (() => {
    try { return JSON.stringify(output); } catch { return ''; }
  })();
  if (!text) return undefined;
  const patterns: RegExp[] = [
    /found\s+(\d[\d,]*)\s+(?:results?|matches|hits|items|files?|rows?)/i,
    /(\d[\d,]*)\s+(?:results?|matches|hits|items|files?|rows?)\b/i,
    /找到\s*(\d[\d,]*)\s*(?:个|条)?\s*(?:结果|匹配|项|条目|文件|行)/,
    /(\d[\d,]*)\s*(?:个|条)\s*(?:结果|匹配|项|条目|文件)/,
    /(\d[\d,]*)\s*行/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
}

/**
 * Create a stateful tool-call projector. `idSeed` seeds the synthetic call-id
 * fallback used when the runtime omits a tool_use id. `now` is injectable for
 * deterministic elapsed timing in tests.
 *
 * `onToolUse` / `onToolResult` each return the projected `tool-call` payload to
 * forward over SSE, or null when the event carries no usable tool data.
 */
export function createToolCallProjector(opts?: { idSeed?: string; now?: () => number }) {
  const idSeed = (opts?.idSeed ?? 'sess').slice(0, 6);
  const now = opts?.now ?? (() => Date.now());
  const inFlight = new Map<string, InFlightToolCall>();
  let seq = 0;

  return {
    onToolUse(data: unknown, currentStepIndex: number | null): ToolCallProjection | null {
      if (!data || typeof data !== 'object') return null;
      const d = data as { name?: unknown; input?: unknown; id?: unknown; node_id?: unknown };
      const tool = typeof d.name === 'string' && d.name ? d.name : 'tool';
      const callId = typeof d.id === 'string' && d.id ? d.id : `tc-${idSeed}-${seq++}`;
      const node_id = typeof d.node_id === 'string' ? d.node_id : undefined;
      inFlight.set(callId, { id: callId, tool, step_index: currentStepIndex, node_id, started_at: now() });
      return {
        id: callId,
        tool,
        title: summarizeToolInput(d.input) || tool,
        input_summary: summarizeToolInput(d.input),
        status: 'running',
        ...(currentStepIndex !== null ? { step_index: currentStepIndex } : {}),
        ...(node_id ? { node_id } : {}),
      };
    },

    onToolResult(data: unknown): ToolCallProjection | null {
      if (!data || typeof data !== 'object') return null;
      const d = data as { for?: unknown; output?: unknown; is_error?: unknown; node_id?: unknown };
      const callId = typeof d.for === 'string' ? d.for : undefined;
      const tracked = callId ? inFlight.get(callId) : undefined;
      const isError = d.is_error === true;
      const links = extractToolLinks(d.output);
      // clawsgo "找到 N 个结果" — real count phrase first, else link count.
      const parsedCount = parseResultCount(d.output);
      const resultCount = parsedCount != null ? parsedCount : links.length > 0 ? links.length : undefined;
      const resolvedNode = typeof d.node_id === 'string' ? d.node_id : tracked?.node_id;
      const out: ToolCallProjection = {
        id: callId ?? `tc-${idSeed}-${seq++}`,
        tool: tracked?.tool ?? 'tool',
        title: tracked?.tool ?? 'tool',
        input_summary: '',
        status: isError ? 'failed' : 'done',
        result_summary: summarizeToolResult(d.output),
        ...(resultCount != null ? { result_count: resultCount } : {}),
        ...(links.length > 0 ? { links } : {}),
        ...(tracked ? { elapsed_ms: now() - tracked.started_at } : {}),
        ...(tracked?.step_index != null ? { step_index: tracked.step_index } : {}),
        ...(resolvedNode ? { node_id: resolvedNode } : {}),
      };
      if (callId) inFlight.delete(callId);
      return out;
    },
  };
}

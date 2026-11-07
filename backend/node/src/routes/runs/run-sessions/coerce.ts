/**
 * run-sessions/coerce.ts — POST /api/run-sessions 请求体校验/归一（Story 15.9/15.13）。
 */
import type { LayerToggles } from '../../../prompts/prompt-assembly';
import type { UserAttachment } from '../../../lib/contracts';

// ── Story 15.13 — layer_toggles + project_meta validators ────────────────────

// 2026-05-11 review M1 (15.29): 加 'conversation_history' — 否则 client 通过
// POST layer_toggles.conversation_history=false 想关闭历史会被 coerceLayerToggles
// 静默丢弃 → 服务端永远 always-on，违反 spec AC3 toggle 契约。
const LAYER_KEYS: ReadonlyArray<keyof LayerToggles> = [
  'discovery',
  'identity',
  'ds',
  'skill',
  'project',
  'conversation_history',
  'sides',
  'framework',
];

export function coerceLayerToggles(raw: unknown): LayerToggles | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: LayerToggles = {};
  for (const k of LAYER_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function coerceProjectMeta(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  // Shallow copy — composer handles per-value JSON.stringify.
  return { ...(raw as Record<string, unknown>) };
}

// ── Story 15.9 — generation override validators ──────────────────────────────
//
// 2026-05-16 — Removed the claude-only MODEL_ALLOWLIST. Previously this Set
// of 3 ids silently dropped every non-Claude model the user picked, so a
// BYOK selection like `glm-5.1` / `gpt-4o` / `deepseek-chat` was coerced to
// undefined and the server fell back to the default Claude model — the
// classic "frontend done, backend not wired up" failure mode. We now accept
// any non-empty string and let the per-provider streamCompletion surface
// MODEL_NOT_FOUND if the id is bogus.

const MODEL_MAX_LEN = 200;
const MAX_TOKENS_MIN = 1024;
const MAX_TOKENS_MAX = 32768;

export function coerceModel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MODEL_MAX_LEN) return undefined;
  // Reject suspicious patterns (whitespace mid-id, control chars) — anything
  // that wouldn't be a legal LLM model identifier — to avoid downstream
  // weirdness without enforcing a per-provider allowlist.
  if (/[\s\x00-\x1f]/.test(trimmed)) return undefined;
  return trimmed;
}

export function coerceMaxTokens(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  return n >= MAX_TOKENS_MIN && n <= MAX_TOKENS_MAX ? n : undefined;
}

export function coerceTemperature(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return raw >= 0 && raw <= 1 ? raw : undefined;
}

/**
 * 2026-11-07 拖拽传图 — 附件数组清洗。只保留 name/path/url 均为非空字符串的
 * 项（is_image 归一布尔、size 归一非负整数）；上限 9 个（与 composer 同限）。
 * 非数组 → undefined（调用方区分「未传」与「显式清空」）。
 */
export function coerceAttachments(raw: unknown): UserAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: UserAttachment[] = [];
  for (const item of raw.slice(0, 9)) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const p = typeof rec.path === 'string' ? rec.path.trim() : '';
    const url = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!name || !p || !url) continue;
    out.push({
      name: name.slice(0, 255),
      path: p.slice(0, 1024),
      url: url.slice(0, 1024),
      is_image: rec.is_image === true,
      size: typeof rec.size === 'number' && Number.isFinite(rec.size) && rec.size >= 0
        ? Math.floor(rec.size)
        : undefined,
    });
  }
  return out;
}

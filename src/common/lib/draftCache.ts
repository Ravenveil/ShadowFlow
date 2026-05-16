/**
 * draftCache — 24h-TTL input draft persistence per scope key.
 *
 * Inspired by Cherry Studio's `inputbar-draft` pattern: keep an unsent message
 * around long enough that a refresh / accidental session switch won't wipe
 * what the user just typed, but evict stale drafts so storage doesn't grow
 * without bound.
 *
 * Storage layout: `localStorage['sf.draft.' + key] = JSON.stringify({ text, ts })`
 *   - `text` is the raw textarea value (no trim).
 *   - `ts` is `Date.now()` at write time.
 *   - Empty / whitespace-only `text` removes the entry entirely.
 *
 * All functions swallow QuotaExceeded / disabled-storage / JSON errors —
 * a draft is a nice-to-have, never load-bearing.
 */

const KEY_PREFIX = 'sf.draft.';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface DraftEntry {
  text: string;
  ts: number;
}

function fullKey(key: string): string {
  return KEY_PREFIX + key;
}

/**
 * Persist `text` for `key`. Empty / whitespace-only `text` clears the entry.
 */
export function saveDraft(key: string, text: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (text.trim().length === 0) {
      localStorage.removeItem(fullKey(key));
      return;
    }
    const entry: DraftEntry = { text, ts: Date.now() };
    localStorage.setItem(fullKey(key), JSON.stringify(entry));
  } catch {
    /* quota / disabled / serialization — drafts are best-effort */
  }
}

/**
 * Load draft for `key`. Returns `''` when missing, expired, or malformed.
 * Expired entries are evicted as a side effect.
 */
export function loadDraft(key: string, ttlMs: number = DEFAULT_TTL_MS): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Partial<DraftEntry> | null;
    if (
      !parsed ||
      typeof parsed.text !== 'string' ||
      typeof parsed.ts !== 'number'
    ) {
      localStorage.removeItem(fullKey(key));
      return '';
    }
    if (Date.now() - parsed.ts > ttlMs) {
      localStorage.removeItem(fullKey(key));
      return '';
    }
    return parsed.text;
  } catch {
    return '';
  }
}

/**
 * Drop the draft for `key`. Idempotent.
 */
export function clearDraft(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(fullKey(key));
  } catch {
    /* ignore */
  }
}

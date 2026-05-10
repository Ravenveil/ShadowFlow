/**
 * settings.ts — KV settings API client (Story 15.17).
 *
 * Talks to the four endpoints introduced by `server/src/routes/settings.ts`:
 *   GET    /api/settings              → { settings: { key: value, ... } }
 *   GET    /api/settings/:key         → { key, value }   |   404
 *   PUT    /api/settings/:key { value } → { key, value }
 *   DELETE /api/settings/:key         → 204
 *
 * Design contract for callers (mostly `useSettings` hook):
 *   - Network failure / 5xx / 401 → resolve to `null` / `{}` / void; never throw.
 *   - All errors are surfaced as `console.warn(...)` so a tab without backend
 *     reachability still works against localStorage (offline degradation).
 *   - `value` round-trips through the JSON envelope, so callers can pass any
 *     JSON-serialisable type. The server re-encodes on disk.
 *
 * BYOK boundary (top half): we **refuse** to send PUT/DELETE/GET for any key
 * that looks like a BYOK key (`sf_anthropic_key*`). This complements the
 * server's bottom-half rejection — keeps the leaky data path closed even if
 * a future caller forgets the rule.
 */

import { getApiBase } from './_base';

const FORBIDDEN_PREFIX = 'sf_anthropic_key';

/**
 * True if a key must stay client-only (BYOK / API tokens).
 * Public so `useSettings` and other helpers can short-circuit before fetch.
 */
export function isClientOnlyKey(key: string): boolean {
  return !!key && key.startsWith(FORBIDDEN_PREFIX);
}

/**
 * GET /api/settings → key/value map. Used by App-level hydrate-on-boot.
 *
 * Returns `{}` on any failure (network / 4xx / 5xx / malformed JSON).
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${getApiBase()}/api/settings`);
    if (!res.ok) {
      console.warn(`[settings] hydrate failed: ${res.status}, using local cache`);
      return {};
    }
    const data = (await res.json()) as { settings?: Record<string, unknown> };
    return data?.settings ?? {};
  } catch (err) {
    console.warn('[settings] hydrate failed, using local cache', err);
    return {};
  }
}

/**
 * GET /api/settings/:key → value (or `null` on miss / failure).
 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  if (isClientOnlyKey(key)) {
    // BYOK keys never live on the server.
    return null;
  }
  try {
    const res = await fetch(
      `${getApiBase()}/api/settings/${encodeURIComponent(key)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: unknown };
    return (data.value as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * PUT /api/settings/:key { value } — fire-and-forget on the failure path.
 *
 * Resolves `void` regardless of outcome; logs a warning when the request
 * fails so callers (typically a React state setter) never block the UI.
 *
 * BYOK guard: refuses to send `sf_anthropic_key*`. Caller is expected to
 * handle BYOK persistence in localStorage directly (see ApiKeySettings).
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (isClientOnlyKey(key)) {
    console.warn(
      `[settings] refusing to PUT BYOK key "${key}" — keep client-only`,
    );
    return;
  }
  try {
    const res = await fetch(
      `${getApiBase()}/api/settings/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      },
    );
    if (!res.ok) {
      console.warn(
        `[settings] put ${key} failed (${res.status}), kept in localStorage only`,
      );
    }
  } catch (err) {
    console.warn(`[settings] put ${key} failed (network), kept in localStorage only`, err);
  }
}

/**
 * DELETE /api/settings/:key — also fire-and-forget.
 */
export async function deleteSetting(key: string): Promise<void> {
  if (isClientOnlyKey(key)) {
    console.warn(`[settings] refusing to DELETE BYOK key "${key}"`);
    return;
  }
  try {
    await fetch(`${getApiBase()}/api/settings/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  } catch {
    /* swallow — settings cleanup is best-effort */
  }
}

/**
 * useSettings.ts — React hook for server-backed settings (Story 15.17).
 *
 * Three-state lifecycle:
 *   1. **hydrating** — initial render reads localStorage synchronously
 *      (fast path, never blocks UI), and a useEffect fires `getSetting`
 *      against the server in the background.
 *   2. **synced**   — server returns a value; if it disagrees with local,
 *      the hook overwrites localStorage and re-renders with the canonical
 *      remote value. Tabs converge on first hydrate.
 *   3. **offline**  — server unreachable / 5xx / network error: hook stays
 *      on the localStorage value indefinitely; setter writes only succeed
 *      locally. UI never blocks.
 *
 * Multi-tab sync: a `window.storage` event listener keeps every mounted
 * useSetting hook in lock-step with localStorage writes from sibling tabs.
 * (storage events do not fire in the originating tab; Pencil-style cross-
 * window updates rely entirely on this listener.)
 *
 * Setter contract:
 *   - Updates React state immediately (synchronous re-render).
 *   - Writes localStorage synchronously (so a refresh in this tab keeps
 *     the new value even if server PUT is in flight).
 *   - Fires `setSetting` to the server (fire-and-forget — failures already
 *     reduce to console.warn inside `src/api/settings.ts`).
 *
 * Generics:
 *   `useSetting<number>('sf.maxTokens', 8192)` returns
 *   `[number, (v: number) => void]`. Default value is used both for the
 *   initial state and as fallback when localStorage is malformed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSetting, setSetting, isClientOnlyKey } from '../../api/settings';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    // Try JSON first; fall back to raw string so legacy plain-string entries
    // (`sf.theme = "dark"` written before this hook existed) still hydrate.
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / unavailable — UI tolerates */
  }
}

/**
 * `useSetting<T>(key, defaultValue)` — server-hydrated, multi-tab synced,
 * BYOK-aware key/value pair backed by localStorage + the 15.17 API.
 *
 * Returns `[value, setter]`. Calling the setter triggers immediate
 * React state update + localStorage write + fire-and-forget server PUT.
 */
export function useSetting<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  // Initial state is synchronous from localStorage — never blocks render.
  const [value, setValue] = useState<T>(() => readLocal<T>(key, defaultValue));

  // Track whether we've already written this value back from a remote
  // hydrate, so we don't redundantly setState when the server agrees with
  // local (avoids one extra render in the steady-state path).
  const hydratedRef = useRef(false);

  // ── Hydrate from server on mount ──────────────────────────────────────────
  useEffect(() => {
    if (isClientOnlyKey(key)) {
      // BYOK keys never round-trip through server — short-circuit hydration.
      hydratedRef.current = true;
      return;
    }
    let cancelled = false;
    getSetting<T>(key).then((remote) => {
      if (cancelled) return;
      hydratedRef.current = true;
      if (remote === null || remote === undefined) return;
      // Compare via stringify so structurally-equal objects don't trigger a
      // re-render. Cheap enough for the typical scalar settings store.
      const local = readLocal<T>(key, defaultValue);
      if (JSON.stringify(local) === JSON.stringify(remote)) return;
      writeLocal(key, remote);
      setValue(remote);
    });
    return () => {
      cancelled = true;
    };
    // We intentionally re-run when `key` changes; defaultValue churn is OK
    // because `readLocal` is the canonical source — it only matters when
    // localStorage is empty AND remote is empty AND key changes mid-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Multi-tab sync via `storage` event ────────────────────────────────────
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return;
      if (e.newValue === null) {
        // Sibling tab cleared the key — restore default.
        setValue(defaultValue);
        return;
      }
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // Malformed peer write — ignore rather than crash.
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // Same rationale as the hydrate effect: defaultValue is read inside the
    // handler at event time; we only need to re-bind when the key flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── Setter: state + local + server (fire-and-forget) ──────────────────────
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writeLocal(key, next);
      // setSetting handles BYOK / network failure internally; we never await
      // so the UI stays responsive on slow / offline connections.
      void setSetting(key, next);
    },
    [key],
  );

  return [value, set];
}

export default useSetting;

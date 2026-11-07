/**
 * usePythonBackendStatus — surfaces Python FastAPI backend availability.
 *
 * Architecture context
 * --------------------
 * ShadowFlow runs two backends:
 *   - Node Express on :8002 (run-sessions, agents, runs — SQLite-backed)
 *   - Python FastAPI on :8000 (teams, groups, inbox, workflows — file/JSON-backed)
 *
 * Express's `proxy-fallback` middleware forwards any `/api/*` it doesn't own
 * to Python. When Python is down, those requests return HTTP 503 with body
 * `{ error: { code: 'PYTHON_BACKEND_UNAVAILABLE', message, hint } }`.
 *
 * Front-end consequence: createTeam / createGroup / listTeams all silently
 * fail through `.catch(console.warn)`, leaving the user staring at "还没有
 * 团队" with no clue why. This hook centralises detection so a single
 * red banner can be rendered wherever Python-dependent UI lives.
 *
 * How it stays cheap
 * ------------------
 *   - Module-level singleton state (one in-flight check across all consumers)
 *   - 20s poll interval, only while document is visible
 *   - `markPythonDown(detail)` allows API clients to push status without an
 *     extra round-trip — call it from response-error paths
 *
 * Initial state
 * -------------
 * `available === null` means "haven't checked yet" — callers should NOT
 * render the failure banner in this state to avoid first-paint flicker.
 * Only `false` means "confirmed down".
 */
import { useEffect, useState } from 'react';
import { getApiBase } from '../../api/_base';

export interface PythonBackendStatusDetail {
  code: string;
  message: string;
  hint?: string;
}

export interface PythonBackendStatus {
  /** null = not yet checked; true = reachable; false = confirmed down */
  available: boolean | null;
  lastError: PythonBackendStatusDetail | null;
  /** Force an immediate re-probe (returns the next status). */
  recheck: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level singleton state — one in-flight check shared across consumers
// ---------------------------------------------------------------------------

type Listener = (s: { available: boolean | null; lastError: PythonBackendStatusDetail | null }) => void;

let _available: boolean | null = null;
let _lastError: PythonBackendStatusDetail | null = null;
let _inFlight = false;
const _listeners = new Set<Listener>();

function _emit() {
  for (const l of _listeners) l({ available: _available, lastError: _lastError });
}

/**
 * Allow API clients (teams.ts, groupApi.ts, …) to push a known failure
 * without forcing the hook to do its own probe. Idempotent.
 */
export function markPythonDown(detail: PythonBackendStatusDetail): void {
  _available = false;
  _lastError = detail;
  _emit();
}

/** Mark Python back up (called on successful response). */
export function markPythonUp(): void {
  if (_available !== true) {
    _available = true;
    _lastError = null;
    _emit();
  }
}

async function _probe(): Promise<void> {
  if (_inFlight) return;
  _inFlight = true;
  try {
    // GET /api/teams is a Python-owned endpoint that returns 200 quickly when
    // up. We use HEAD-equivalent semantics (no payload parsing) for cheapness.
    const res = await fetch(`${getApiBase()}/api/teams`, { method: 'GET' });
    if (res.status === 503) {
      const body = await res.text().catch(() => '');
      let detail: PythonBackendStatusDetail = {
        code: 'PYTHON_BACKEND_UNAVAILABLE',
        message: 'Python backend not reachable',
      };
      try {
        const parsed = JSON.parse(body) as { error?: PythonBackendStatusDetail };
        if (parsed.error?.code === 'PYTHON_BACKEND_UNAVAILABLE') {
          detail = parsed.error;
        }
      } catch {
        // body wasn't JSON; keep defaults
      }
      markPythonDown(detail);
    } else if (res.ok) {
      markPythonUp();
    }
    // Other statuses (401, 5xx besides 503) — treat as "unknown", don't flip
    // the banner. Most likely transient.
  } catch {
    // Network failure (e.g. Express itself down) — also treat as unknown.
  } finally {
    _inFlight = false;
  }
}

/**
 * React hook returning the current status + a recheck handle.
 *
 * Mounts once per consumer but shares state across all consumers. Polling
 * lifecycle is also shared: the first consumer to mount starts the interval,
 * the last to unmount clears it.
 */
let _pollInterval: ReturnType<typeof setInterval> | null = null;
let _mountCount = 0;
let _visibilityHandler: (() => void) | null = null;

const POLL_MS = 20_000;

function _startPolling() {
  if (_pollInterval) return;
  // Probe immediately on first mount so the banner shows fast.
  void _probe();
  _pollInterval = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void _probe();
    }
  }, POLL_MS);

  // Also re-probe whenever the tab regains visibility (user returned from
  // another tab — Python may have been started in the meantime).
  if (typeof document !== 'undefined' && !_visibilityHandler) {
    _visibilityHandler = () => {
      if (document.visibilityState === 'visible') void _probe();
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
  }
}

function _stopPolling() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
  if (_visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
}

export function usePythonBackendStatus(): PythonBackendStatus {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener: Listener = () => setTick((t) => t + 1);
    _listeners.add(listener);
    _mountCount++;
    if (_mountCount === 1) _startPolling();
    return () => {
      _listeners.delete(listener);
      _mountCount--;
      if (_mountCount === 0) _stopPolling();
    };
  }, []);

  return {
    available: _available,
    lastError: _lastError,
    recheck: _probe,
  };
}

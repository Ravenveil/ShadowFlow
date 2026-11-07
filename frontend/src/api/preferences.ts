/**
 * preferences.ts — UI preferences client (theme / language / zoom)
 *
 * Server contract: server/src/routes/settings.ts
 *   GET /api/settings/preferences  → { preferences: { theme?, language?, zoom? } }
 *   PUT /api/settings/preferences  → partial merge, per-field validation
 *
 * Semantics: server is the cross-device source of truth, localStorage is the
 * offline fallback. Every write path is best-effort — a failed PUT must never
 * block or revert the local change; a failed GET must never clobber local
 * state. Mirrors the Open WebUI / hermes-agent settings-server pattern.
 */
import { getApiBase } from './_base';

export interface UiPreferences {
  theme?: 'dark' | 'light' | 'system' | 'paper';
  language?: 'en' | 'zh';
  zoom?: number;
}

const THEMES = new Set(['dark', 'light', 'system', 'paper']);
const LANGUAGES = new Set(['en', 'zh']);
export const ZOOM_MIN = 0.85;
export const ZOOM_MAX = 1.4;

/** Parse + defensively validate the server payload; drop unknown fields. */
function sanitize(raw: unknown): UiPreferences {
  const out: UiPreferences = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.theme === 'string' && THEMES.has(obj.theme)) {
    out.theme = obj.theme as UiPreferences['theme'];
  }
  if (typeof obj.language === 'string' && LANGUAGES.has(obj.language)) {
    out.language = obj.language as UiPreferences['language'];
  }
  if (
    typeof obj.zoom === 'number' && Number.isFinite(obj.zoom) &&
    obj.zoom >= ZOOM_MIN && obj.zoom <= ZOOM_MAX
  ) {
    out.zoom = obj.zoom;
  }
  return out;
}

/**
 * Fetch server preferences once. Never rejects — resolves `null` when the
 * backend is offline so callers can silently keep local state.
 */
export async function fetchPreferences(): Promise<UiPreferences | null> {
  try {
    // no-store: the snapshot must never come from browser heuristic cache —
    // a stale cached GET can arrive after a user action and revert it.
    const res = await fetch(`${getApiBase()}/api/settings/preferences`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences?: unknown };
    return sanitize(data?.preferences);
  } catch {
    return null;
  }
}

// Bootstrap dedupe: many components mount useTheme/I18nProvider concurrently;
// they all want the same server snapshot. One promise per page load.
let bootPromise: Promise<UiPreferences | null> | null = null;

/** Share a single in-flight GET across all bootstrap consumers. */
export function fetchPreferencesOnce(): Promise<UiPreferences | null> {
  bootPromise ??= fetchPreferences();
  return bootPromise;
}

/**
 * Persist a partial update (best-effort, fire-and-forget). Never rejects —
 * callers must not await correctness from it.
 */
export async function putPreferences(patch: Partial<UiPreferences>): Promise<void> {
  try {
    await fetch(`${getApiBase()}/api/settings/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    // Offline / backend down — localStorage already holds the change.
  }
}

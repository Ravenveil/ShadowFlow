/**
 * useTheme — reads/writes appearance preference and installs `data-theme`
 * on the document element so the Hi-Fi v2 token system flips Day ↔ Night.
 *
 * Mapping from preference value → `data-theme`:
 *   "dark"   → "night"
 *   "light"  → "day"
 *   "system" → matches `prefers-color-scheme: dark` → "night" else "day"
 *
 * Server sync (2026-08): GET/PUT `/api/settings/preferences` via
 * src/api/preferences.ts (theme + language + zoom in one blob). Falls back
 * silently when the backend is offline so the UI still renders; localStorage
 * stays the offline source of truth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPreferencesOnce, putPreferences } from '../../api/preferences';
import { applyCustomTheme, loadCustomTheme } from './customTheme';
import { initFontScale, applyZoom, saveZoom, loadZoom, zoomUserAdjusted, DEFAULT_ZOOM, ZOOM_MIN, ZOOM_MAX } from './fontScale';

// 2026-05-28 — added 'paper' as a third skin pack (warm cream/sepia aesthetic),
// alongside dark/light/system. Aligns with the design package's 7-slot Skin
// Pack model. UI mapping: 'paper' → data-theme="paper".
export type ThemePref = 'dark' | 'light' | 'system' | 'paper';
type DataTheme = 'night' | 'day' | 'paper';

const SYSTEM_QUERY = '(prefers-color-scheme: dark)';
const STORAGE_KEY = 'sf-theme';

function isPref(v: unknown): v is ThemePref {
  return v === 'dark' || v === 'light' || v === 'system' || v === 'paper';
}

function readStoredPref(): ThemePref {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isPref(raw)) return raw;
  } catch { /* ignore */ }
  return 'dark';
}

function writeStoredPref(pref: ThemePref): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
}

function resolveDataTheme(pref: ThemePref): DataTheme {
  if (pref === 'dark') return 'night';
  if (pref === 'light') return 'day';
  if (pref === 'paper') return 'paper';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia(SYSTEM_QUERY).matches ? 'night' : 'day';
  }
  return 'night';
}

function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  const t = resolveDataTheme(pref);
  document.documentElement.setAttribute('data-theme', t);
}

/**
 * Cross-tab sync: when one tab calls setTheme it writes to localStorage and
 * dispatches a 'storage' event in OTHER tabs (browsers don't fire it in the
 * same tab). For same-tab sync between hook instances we use a custom event.
 */
const SAME_TAB_EVENT = 'sf-theme-change';

// Session guard: once the user picks a theme in this tab, a late-arriving
// bootstrap GET (stale snapshot) must not revert their choice.
let userPickedTheme = false;

export function useTheme(): {
  theme: ThemePref;
  setTheme: (t: ThemePref) => Promise<void>;
} {
  // Synchronous init from localStorage so navigating between pages preserves
  // whatever the user just chose — no flicker, no clobber-on-fetch-fail.
  const [theme, setThemeState] = useState<ThemePref>(readStoredPref);
  const themeRef = useRef<ThemePref>(theme);
  themeRef.current = theme;

  // Apply on every mount (covers route changes where the previous instance
  // unmounted but documentElement was untouched). Cheap, idempotent.
  // Custom slot overrides (accent/bg/fg) are reapplied alongside so they
  // survive page reloads — inline style takes precedence over the data-theme
  // token, so this works whether theme is dark/light/system.
  useEffect(() => {
    applyTheme(theme);
    applyCustomTheme(loadCustomTheme());
    initFontScale();  // 2026-06-01 — 应用用户存的全局字号(无则用 CSS 默认)
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Background sync from backend on FIRST mount of the app session. If backend
  // disagrees with localStorage, prefer backend (cross-device source of truth)
  // — but only when fetch succeeds. Fetch failure must NEVER clobber.
  // Theme AND zoom ride the same snapshot (one GET per page load, shared via
  // fetchPreferencesOnce); language is applied by I18nProvider the same way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await fetchPreferencesOnce();
      if (!prefs || cancelled) return;
      if (
        !userPickedTheme &&
        isPref(prefs.theme) &&
        prefs.theme !== themeRef.current
      ) {
        setThemeState(prefs.theme);
        applyTheme(prefs.theme);
        writeStoredPref(prefs.theme);
      }
      if (
        !zoomUserAdjusted() &&
        typeof prefs.zoom === 'number' &&
        prefs.zoom >= ZOOM_MIN && prefs.zoom <= ZOOM_MAX &&
        prefs.zoom !== (loadZoom() ?? DEFAULT_ZOOM)
      ) {
        applyZoom(prefs.zoom);
        saveZoom(prefs.zoom, { syncRemote: false });  // echo guard: no PUT back
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // OS color-scheme listener for "system" mode.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(SYSTEM_QUERY);
    const handler = () => {
      if (themeRef.current === 'system') applyTheme('system');
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Cross-instance sync: another useTheme() instance (e.g. AppearanceSection
  // and HfTopBar's ThemeToggle in the same tab, or another tab) called setTheme
  // → catch the event and update local state so the UI reflects it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = isPref(e.newValue) ? e.newValue : null;
      if (next && next !== themeRef.current) {
        setThemeState(next);
        applyTheme(next);
      }
    };
    const onSameTab = (e: Event) => {
      const detail = (e as CustomEvent<ThemePref>).detail;
      if (isPref(detail) && detail !== themeRef.current) {
        setThemeState(detail);
        applyTheme(detail);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    };
  }, []);

  const setTheme = useCallback(async (next: ThemePref) => {
    userPickedTheme = true;
    // 1. Local state + DOM attr + localStorage — synchronous, no flicker.
    setThemeState(next);
    applyTheme(next);
    writeStoredPref(next);
    // 2. Notify other useTheme() instances in this tab.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<ThemePref>(SAME_TAB_EVENT, { detail: next }));
    }
    // 3. Persist to backend (best-effort, cross-device).
    void putPreferences({ theme: next });
  }, []);

  return { theme, setTheme };
}

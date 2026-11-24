import { useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import i18n from 'i18next';
import { useTranslation, initReactI18next } from 'react-i18next';

import enResources from './locales/en.json';
import zhResources from './locales/zh.json';
import { fetchPreferencesOnce, putPreferences } from '../../api/preferences';

export type Language = 'en' | 'zh';

const STORAGE_KEY = 'sf_language';

function detectLanguage(): Language {
  // Prefer the navigator hint when the user has never picked manually.
  // navigator.language is "zh-CN" / "zh-TW" / etc on Chinese browsers; we
  // only branch on the primary tag.
  try {
    const nav = (navigator?.language || '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
  } catch {}
  return 'zh';   // Project default — primary audience is zh; en is opt-in
}

function getStoredLanguage(defaultLanguage: Language): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {}
  return defaultLanguage;
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: enResources },
        zh: { translation: zhResources },
      },
      lng: getStoredLanguage(detectLanguage()),
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
      keySeparator: false,
    });
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Session guard against stale bootstrap snapshots: once the user picks a
// language (this tab), a late-arriving GET response must not revert it.
// Module-scope so every I18nProvider instance shares it.
let userPickedLanguage = false;

interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
  /** If provided, the provider becomes controlled — internal state syncs with this value. */
  language?: Language;
}

export function I18nProvider({ children, defaultLanguage = 'zh', language: controlledLanguage }: I18nProviderProps) {
  const { t: tFn, i18n: i18nInstance } = useTranslation();
  const language = (i18nInstance.language as Language) || getStoredLanguage(defaultLanguage);

  useEffect(() => {
    if (controlledLanguage && i18nInstance.language !== controlledLanguage) {
      i18nInstance.changeLanguage(controlledLanguage);
    }
  }, [controlledLanguage, i18nInstance]);

  // Bootstrap sync: the shared server preferences snapshot (one GET per page
  // load) may carry a language saved on another device/tab. Skip when the
  // provider is controlled — the controlling component owns the language —
  // or when the user already picked a language this session (their click may
  // have landed while the GET was still in flight; the stale response must
  // lose). A failed fetch resolves null and never touches local state.
  useEffect(() => {
    if (controlledLanguage) return;
    let cancelled = false;
    void fetchPreferencesOnce().then((prefs) => {
      if (cancelled || !prefs || userPickedLanguage) return;
      const lang = prefs.language;
      if ((lang === 'en' || lang === 'zh') && i18nInstance.language !== lang) {
        i18nInstance.changeLanguage(lang);
        try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
      }
    });
    return () => { cancelled = true; };
  }, [controlledLanguage, i18nInstance]);

  const setLanguage = useCallback((lang: Language) => {
    userPickedLanguage = true;
    i18nInstance.changeLanguage(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    void putPreferences({ language: lang });  // best-effort cross-device sync
  }, [i18nInstance]);

  const translate = useCallback((key: string, options?: Record<string, unknown>) => tFn(key, options) as string, [tFn]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t: translate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export { i18n };

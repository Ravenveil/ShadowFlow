import { useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import i18n from 'i18next';
import { useTranslation, initReactI18next } from 'react-i18next';

import enResources from './locales/en.json';
import zhResources from './locales/zh.json';

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

  const setLanguage = useCallback((lang: Language) => {
    i18nInstance.changeLanguage(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
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

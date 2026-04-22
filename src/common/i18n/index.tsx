// ============================================================================
// 国际化 Hook
// ============================================================================

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { t } from './locales';

interface I18nContextType {
  language: 'en' | 'zh';
  setLanguage: (lang: 'en' | 'zh') => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: 'en' | 'zh';
  /** If provided, the provider becomes controlled — internal state syncs with this value. */
  language?: 'en' | 'zh';
}

export function I18nProvider({ children, defaultLanguage = 'en', language: controlledLanguage }: I18nProviderProps) {
  const [language, setLanguageState] = useState<'en' | 'zh'>(controlledLanguage ?? defaultLanguage);

  // When parent passes a controlled language, sync our internal state
  useEffect(() => {
    if (controlledLanguage && controlledLanguage !== language) {
      setLanguageState(controlledLanguage);
    }
  }, [controlledLanguage]);

  const setLanguage = useCallback((lang: 'en' | 'zh') => {
    setLanguageState(lang);
  }, []);

  const translate = useCallback((key: string) => {
    return t(key, language);
  }, [language]);

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

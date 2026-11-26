/**
 * i18n — 最小国际化：一个 Provider + 一个 useI18n()。
 *
 * lang 落 localStorage（'sf.paper.lang'）；首次进来读 navigator.language，
 * zh 开头用中文，其余一律英文。t(key) 查当前语言词典，缺键回落中文，
 * 再缺就返回 key（第二个参数可给兜底文案，导航/设置就用它保底）。
 *
 * 用法：
 *   const { lang, setLang, t } = useI18n();
 *   <span>{t('nav.chat')}</span>
 *   <span>{t('nav.project', RAIL.workspace[0].label)}</span>
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DICTS, type DictValue, type Lang } from './dict';

export type { Lang };

const STORAGE_KEY = 'sf.paper.lang';

function isLang(v: string | null): v is Lang {
  return v === 'zh' || v === 'en';
}

function fromNavigator(): Lang {
  try {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

function readInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* 隐私模式下不记也行 */
  }
  return fromNavigator();
}

export interface I18n {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** 点号键取值；缺键时用第二个参数（若有）当兜底文案。 */
  t: (key: string, ...args: unknown[]) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (key: string, ...args: unknown[]): string => {
      const value: DictValue | undefined = DICTS[lang][key] ?? DICTS.zh[key];
      if (value === undefined) {
        return typeof args[0] === 'string' ? args[0] : key;
      }
      return typeof value === 'function' ? value(...args) : value;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

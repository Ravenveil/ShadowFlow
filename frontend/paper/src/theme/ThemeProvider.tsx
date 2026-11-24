import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeName = 'ink' | 'clean' | 'night';

const STORAGE_KEY = 'sf-paper-theme';
const ORDER: ThemeName[] = ['ink', 'clean', 'night'];

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function isTheme(v: string | null): v is ThemeName {
  return v === 'ink' || v === 'clean' || v === 'night';
}

function readInitial(): ThemeName {
  // ?theme= 优先：Figma 抓稿需要按主题逐张截图，不能依赖浏览器里的 localStorage。
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (isTheme(q)) return q;
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* 隐私模式忽略 */
  }
  return 'ink';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readInitial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]),
    [],
  );

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

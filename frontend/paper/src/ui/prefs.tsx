/**
 * ui/prefs.tsx — 纯客户端的外观偏好（界面密度、动效）。
 *
 * 和主题一样属于「这台设备的显示习惯」，不进步后端的 AppSettings：
 * 落 localStorage，同时把结果写到 `<html data-density/data-motion>`，
 * 具体表现交给 CSS（见 styles/base.css 末尾），组件不写死任何像素。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Density = 'compact' | 'cozy' | 'wide';

export const DENSITY_ORDER: Density[] = ['compact', 'cozy', 'wide'];

const STORAGE_KEY = 'sf-paper-ui';

interface UiPrefs {
  density: Density;
  /** true = 有动效；false = 全部直接到位。 */
  motion: boolean;
  setDensity: (d: Density) => void;
  setMotion: (on: boolean) => void;
}

const Ctx = createContext<UiPrefs | null>(null);

interface Stored {
  density?: Density;
  motion?: boolean;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(() => {
    const d = read().density;
    return d && DENSITY_ORDER.includes(d) ? d : 'cozy';
  });
  const [motion, setMotionState] = useState<boolean>(() => read().motion ?? true);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;
    root.dataset.motion = motion ? 'full' : 'reduced';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ density, motion }));
    } catch {
      /* 隐私模式下不记也行，本次会话内仍然生效 */
    }
  }, [density, motion]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);
  const setMotion = useCallback((on: boolean) => setMotionState(on), []);

  const value = useMemo(
    () => ({ density, motion, setDensity, setMotion }),
    [density, motion, setDensity, setMotion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUiPrefs(): UiPrefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUiPrefs must be used inside <UiPrefsProvider>');
  return ctx;
}

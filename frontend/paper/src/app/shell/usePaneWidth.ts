/**
 * usePaneWidth — 子页第二栏的宽度（记忆 + 夹取 + window pointer 跟随）。
 *
 * 与会话列表同一手感：拖右缘改宽、双击回默认。夹取范围只在 tokens.css 里定义，
 * 这里读出来用，不再抄一份数字。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

const WIDTH_KEY = 'sf.paper.paneWidth';

function cssPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function usePaneWidth() {
  const [bounds] = useState(() => ({
    min: cssPx('--pane-min-w', 176),
    max: cssPx('--pane-max-w', 360),
    base: cssPx('--pane-w', 240),
  }));
  const [width, setWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(v) && v >= bounds.min && v <= bounds.max ? v : null;
    } catch {
      return null;
    }
  });
  const dragging = useRef(false);
  /** pointermove 里读，避免把 width/bounds 塞进空依赖的 useCallback。 */
  const widthRef = useRef(width);
  widthRef.current = width;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const clamp = useCallback((px: number) => {
    const { min, max } = boundsRef.current;
    return Math.max(min, Math.min(max, Math.round(px)));
  }, []);

  const startResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('sf-pane-resizing');
    const startWidth = widthRef.current ?? boundsRef.current.base;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return;
      setWidth(clamp(startWidth + (ev.clientX - startX)));
    };
    const up = () => {
      dragging.current = false;
      document.body.classList.remove('sf-pane-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [clamp]);

  /** 双击把手：回主题默认宽度，并清掉记忆。 */
  const resetWidth = useCallback(() => {
    setWidth(null);
    try {
      localStorage.removeItem(WIDTH_KEY);
    } catch {
      // 隐私模式下删不掉也无所谓，下次打开仍是默认宽度
    }
  }, []);

  useEffect(() => {
    if (width === null) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // localStorage 不可用时只留内存态
    }
  }, [width]);

  const style = width === null ? undefined : ({ '--pane-w': `${width}px` } as CSSProperties);

  return { style, startResize, resetWidth };
}

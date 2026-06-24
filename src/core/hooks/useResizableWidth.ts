/**
 * useResizableWidth — 右栏可拖拽宽度 hook。
 *
 * 用法：
 *   const { width, onDragStart, dragging } = useResizableWidth('sf-rightpane-w', 312);
 *
 * 在容器左边缘渲染一个竖条拖拽手柄，调用 onDragStart 开始拖拽。
 * 宽度自动 clamp 到 [min, max] 并存入 localStorage。
 */
import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseResizableWidthOptions {
  min?: number;
  max?: number;
}

export interface UseResizableWidthResult {
  width: number;
  dragging: boolean;
  onDragStart: (e: React.MouseEvent) => void;
}

/** 纯函数：把 value clamp 到 [min, max]。 */
export function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useResizableWidth(
  storageKey: string,
  initial: number,
  opts?: UseResizableWidthOptions,
): UseResizableWidthResult {
  const min = opts?.min ?? 280;
  const max = opts?.max ?? 720;

  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed)) {
          return clampWidth(parsed, min, max);
        }
      }
    } catch {
      // localStorage 不可用（隐私模式等），忽略
    }
    return initial;
  });

  const [dragging, setDragging] = useState(false);

  // 拖拽时的起点 x 和起点宽度
  const dragStart = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStart.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      // 手柄在容器左边缘：向左拖 = 增宽，向右拖 = 减宽
      const delta = dragStart.current.startX - e.clientX;
      const next = clampWidth(dragStart.current.startWidth + delta, min, max);
      setWidth(next);
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore
      }
    };

    const onMouseUp = () => {
      setDragging(false);
      dragStart.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, storageKey, min, max]);

  return { width, dragging, onDragStart };
}

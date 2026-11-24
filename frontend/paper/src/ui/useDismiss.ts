/**
 * useDismiss — 点面板外部或按 Esc 时关掉它（弹出层的公共行为）。
 *
 * 用 mousedown 而不是 click：晚一步关会在按钮上留下一次「刚关又被点开」的抖动。
 */
import { useEffect, type RefObject } from 'react';

export function useDismiss(
  active: boolean,
  container: RefObject<HTMLElement | null>,
  dismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    function onDown(e: MouseEvent) {
      if (container.current?.contains(e.target as Node)) return;
      dismiss();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, container, dismiss]);
}

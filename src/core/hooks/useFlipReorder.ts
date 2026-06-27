import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * useFlipReorder — 侧栏列表「重排 / 删除补位」的 FLIP 平滑位移动画（clawsgo 化）。
 *
 * FLIP = First, Last, Invert, Play。容器内每个带 `[data-flip-id]` 的子节点，在每次
 * DOM 提交后比对上一帧记录的 `offsetTop`（offsetTop 抗滚动，比 getBoundingClientRect
 * 稳），对发生纵向位移的节点用 WAAPI `element.animate` 跑一次 invert(从旧位置)→play
 * (回到新位置)的过渡。整段在浏览器合成线程跑，**不触发任何 React 重渲染 / state**。
 *
 * 典型场景：删除一行后下方各行平滑上滑补位、未读会话跳顶时其余行让位——而不是瞬跳。
 *
 * 安全：
 *   - 尊重 prefers-reduced-motion（reduce 时只记录位置、不动画）。
 *   - jsdom / 老环境无 Element.animate 时跳过（测试不炸）。
 *   - 只对 1px<|Δ|<2000px 的位移做动画，避开首次挂载/切视图的大跳。
 *
 * @param containerRef 列表滚动容器（其后代里带 data-flip-id 的才被追踪）
 * @param dep          列表顺序/内容的指纹（如有序 id join）——变化时重算位置触发 FLIP
 */
export function useFlipReorder(
  containerRef: RefObject<HTMLElement | null>,
  dep: unknown,
): void {
  const prevTops = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const nodes = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    const nextTops = new Map<string, number>();

    nodes.forEach((node) => {
      const id = node.dataset.flipId;
      if (!id) return;
      const top = node.offsetTop;
      nextTops.set(id, top);
      if (reduce) return;

      const prev = prevTops.current.get(id);
      if (prev === undefined || prev === top) return;
      const dy = prev - top;
      if (Math.abs(dy) <= 1 || Math.abs(dy) >= 2000) return;
      if (typeof node.animate !== 'function') return;

      node.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });

    prevTops.current = nextTops;
  }, [containerRef, dep]);
}

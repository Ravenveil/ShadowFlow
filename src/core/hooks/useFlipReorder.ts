import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

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
 * 基线刷新策略（修 reviewer-D 陈旧基线）：
 *   - 每次 commit（useLayoutEffect 无 dep）都测量并对位移行 FLIP —— 不再用 dep gating，
 *     这样未读角标/副标题改变行高等「不改顺序但改布局」的 render 也会刷新基线，避免
 *     下一次真重排从陈旧位置起跳 snap。位移为 0 时自然 skip，无多余动画。
 *   - ResizeObserver 监听容器尺寸变化（resize / 换行 rewrap，不经 React render），
 *     只刷新基线、不播动画，杜绝纯 resize 后的 snap。
 *
 * 安全：
 *   - 尊重 prefers-reduced-motion（reduce 时只记录位置、不动画）。
 *   - jsdom / 老环境无 Element.animate / ResizeObserver 时跳过（测试不炸）。
 *   - 只对 1px<|Δ|<2000px 的位移做动画，避开首次挂载/切视图的大跳。
 *
 * @param containerRef 列表滚动容器（其后代里带 data-flip-id 的才被追踪）。
 *                     建议容器设 position:relative，让 offsetParent 收敛到容器本身。
 */
export function useFlipReorder(containerRef: RefObject<HTMLElement | null>): void {
  const prevTops = useRef<Map<string, number>>(new Map());

  // measure(true)=测量并对位移行 FLIP；measure(false)=只刷新基线（resize 用）。
  const measure = useCallback(
    (play: boolean) => {
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
        if (!play || reduce) return;

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
    },
    [containerRef],
  );

  // 每次 commit 测量 + FLIP（无 dep：基线始终最新，见上「基线刷新策略」）。
  useLayoutEffect(() => {
    measure(true);
  });

  // 容器 resize / 内容 rewrap（不经 React render）时只刷新基线，防纯 resize 后 snap。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, measure]);
}

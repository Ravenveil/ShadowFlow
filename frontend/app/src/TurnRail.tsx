/**
 * TurnRail.tsx — 会话侧轮次锚点垂直滚动条（2026-11-08）。
 *
 * 职责：
 *  1) 自定义竖直滚动条：滑块可拖拽滑动页面、轨道点击按比例跳转；
 *  2) 轨道按「每一轮对话」分格（一格一轮）：轮 = 一条 user_turn + 其后
 *     所有 agent 回复；点击某格平滑定位到该轮首条消息；
 *  3) 悬停格子显示该轮用户原话预览；
 *  4) 顺手修滚动链：实测输入框坞（sf-composer-dock，含任务面板）高度写入
 *     --sf-dock-h，消息列表底部留白随坞高伸缩，最后一轮不再被遮挡。
 *
 * 挂载位置：ProductApp 的 <section className="sf-chat"> 内（sf-chat-scroll 的
 * 兄弟节点）。全部 DOM 自发现（closest/querySelector），无需外部 ref 接线。
 */

import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import type { TimelineMessage } from "./chat-api";
import { userVisibleText } from "./TimelineView";
import "./turn-rail.css";

type Seg = {
  /** 1 基轮次序号 */
  no: number;
  /** 用户原话预览（剥协议标记） */
  label: string;
  /** 轨道内百分比定位 */
  topPct: number;
  heightPct: number;
  /** 滚动容器内容坐标里该轮首条消息的 offsetTop */
  anchor: number;
};

const MIN_THUMB = 28;

export function TurnRail({ messages }: { messages: TimelineMessage[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [segs, setSegs] = useState<Seg[]>([]);
  const segsRef = useRef<Seg[]>([]);
  const [thumb, setThumb] = useState({ topPct: 0, heightPct: 100 });
  const [active, setActive] = useState(-1);
  const [dragging, setDragging] = useState(false);

  // 拖拽起始状态（不进渲染）
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const host = rail.parentElement; // section.sf-chat
    if (!host) return;

    let scrollEl: HTMLElement | null = null;
    let raf = 0;

    const elTopIn = (el: HTMLElement, container: HTMLElement): number =>
      el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;

    /** 全量重算：--sf-dock-h / 分格 / 滑块几何。 */
    const layout = () => {
      raf = 0;
      const sc = host.querySelector<HTMLElement>(".sf-chat-scroll");
      if (!sc) return;
      if (sc !== scrollEl) {
        scrollEl?.removeEventListener("scroll", onScroll);
        scrollEl = sc;
        sc.addEventListener("scroll", onScroll, { passive: true });
      }

      // 输入框坞高度 → 底部留白自适应（修「底部对话被遮挡」）
      const dock = host.querySelector<HTMLElement>(".sf-composer-dock");
      host.style.setProperty("--sf-dock-h", `${dock ? dock.offsetHeight : 0}px`);

      const contentH = sc.scrollHeight || 1;
      const viewH = sc.clientHeight || 1;

      // 轮次锚点：.sf-user-message 元素顺序 = user_turn 消息顺序
      const userEls = Array.from(sc.querySelectorAll<HTMLElement>(".sf-user-message"));
      const turns = messages.filter((m) => m.kind === "user_turn");
      const n = Math.min(userEls.length, turns.length);
      const anchors: number[] = [];
      for (let i = 0; i < n; i += 1) anchors.push(elTopIn(userEls[i], sc));

      const next: Seg[] = [];
      for (let i = 0; i < n; i += 1) {
        const start = i === 0 ? 0 : anchors[i];
        const end = i + 1 < n ? anchors[i + 1] : contentH;
        const text = userVisibleText(turns[i].text ?? "").replace(/\s+/g, " ").trim();
        next.push({
          no: i + 1,
          label: text.length > 36 ? `${text.slice(0, 36)}…` : text || `第 ${i + 1} 轮`,
          topPct: (start / contentH) * 100,
          heightPct: ((end - start) / contentH) * 100,
          anchor: anchors[i],
        });
      }
      segsRef.current = next;
      setSegs(next);

      // 滑块几何（轨道坐标百分比；高度下限 MIN_THUMB 由样式钳制）
      const thumbH = Math.min(100, (viewH / contentH) * 100);
      const maxScroll = contentH - viewH;
      const topPct = maxScroll > 0 ? (sc.scrollTop / maxScroll) * (100 - thumbH) : 0;
      setThumb({ topPct, heightPct: Math.max(thumbH, (MIN_THUMB / (rail.clientHeight || 1)) * 100) });
      updateActive(sc.scrollTop, next);
    };

    const updateActive = (scrollTop: number, list: Seg[] = segsRef.current) => {
      const probe = scrollTop + 12;
      let idx = list.length - 1;
      for (let i = 0; i < list.length; i += 1) {
        const start = list[i].anchor;
        const end = i + 1 < list.length ? list[i + 1].anchor : Number.POSITIVE_INFINITY;
        if (probe >= start && probe < end) {
          idx = i;
          break;
        }
      }
      setActive(list.length ? idx : -1);
    };

    const onScroll = () => {
      if (!scrollEl) return;
      const sc = scrollEl;
      const contentH = sc.scrollHeight || 1;
      const viewH = sc.clientHeight || 1;
      const maxScroll = contentH - viewH;
      const thumbH = Math.min(100, (viewH / contentH) * 100);
      const topPct = maxScroll > 0 ? (sc.scrollTop / maxScroll) * (100 - thumbH) : 0;
      setThumb((t) => ({ ...t, topPct }));
      updateActive(sc.scrollTop);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(layout);
    };

    // 内容流式增长 / 消息更新 → 重算锚点；group 切换会重挂 sf-chat-scroll → 自动重绑
    const mo = new MutationObserver(schedule);
    mo.observe(host, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      scrollEl?.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // messages 变化（新轮次出现）时整链重绑一次兜底
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  /** 滚动到某内容坐标（带顶部小留白） */
  const scrollTo = (top: number, smooth = true) => {
    const sc = railRef.current?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    sc?.scrollTo({ top: Math.max(0, top - 12), behavior: smooth ? "smooth" : "auto" });
  };

  // ── 滑块拖拽 ────────────────────────────────────────────────────────
  const onThumbDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const thumbEl = thumbRef.current;
    if (!thumbEl) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startTop: thumbEl.offsetTop };
    setDragging(true);
  };

  const onRailMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rail = railRef.current;
    const sc = rail?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    if (!d || !rail || !sc) return;
    const trackH = rail.clientHeight || 1;
    const thumbH = thumbRef.current?.offsetHeight ?? MIN_THUMB;
    const top = Math.max(0, Math.min(trackH - thumbH, d.startTop + (e.clientY - d.startY)));
    const maxScroll = sc.scrollHeight - sc.clientHeight;
    sc.scrollTop = trackH - thumbH > 0 ? (top / (trackH - thumbH)) * maxScroll : 0;
  };

  const onRailUp = () => {
    drag.current = null;
    setDragging(false);
  };

  // ── 轨道交互 ────────────────────────────────────────────────────────
  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 点到格子/滑块上则不处理（各自有 handler）
    if ((e.target as HTMLElement).closest(".sf-turn-cell, .sf-turn-thumb")) return;
    const rail = railRef.current;
    const sc = rail?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    if (!rail || !sc) return;
    const ratio = e.nativeEvent.offsetY / (rail.clientHeight || 1);
    sc.scrollTo({ top: ratio * sc.scrollHeight, behavior: "smooth" });
  };

  const onCellClick = (anchor: number) => scrollTo(anchor);

  // 滚轮悬停在滚动条上时也要能滚内容（rail 是 sf-chat-scroll 的兄弟节点）
  const onWheel = (e: React.WheelEvent) => {
    const sc = railRef.current?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    if (sc) sc.scrollTop += e.deltaY;
  };

  /** 上下箭头按钮：按一下滚一屏弱（网页滚动条步进感） */
  const scrollBy = (delta: number) => {
    const sc = railRef.current?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    sc?.scrollBy({ top: delta, behavior: "smooth" });
  };

  // 键盘可达性
  const onKeyDown = (e: React.KeyboardEvent) => {
    const sc = railRef.current?.parentElement?.querySelector<HTMLElement>(".sf-chat-scroll");
    if (!sc) return;
    const step = e.key === "PageDown" || e.key === "PageUp" ? sc.clientHeight * 0.9 : 120;
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      sc.scrollTop += step;
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      sc.scrollTop -= step;
    } else if (e.key === "Home") {
      e.preventDefault();
      sc.scrollTop = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      sc.scrollTop = sc.scrollHeight;
    }
  };

  return (
    <div
      className="sf-turn-rail"
      ref={railRef}
      role="scrollbar"
      aria-label="会话轮次导航"
      aria-orientation="vertical"
      tabIndex={0}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onPointerMove={onRailMove}
      onPointerUp={onRailUp}
      onPointerCancel={onRailUp}
    >
      <button
        type="button"
        className="sf-turn-arrow up"
        aria-label="向上滚动"
        onClick={() => scrollBy(-240)}
      />
      <div className="sf-turn-track" onPointerDown={onTrackDown}>
        {segs.map((s, i) => (
          <button
            key={s.no}
            type="button"
            className={`sf-turn-cell ${i === active ? "on" : ""}`}
            style={{ top: `${s.topPct}%`, height: `${s.heightPct}%` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onCellClick(s.anchor)}
            aria-label={`定位到第 ${s.no} 轮：${s.label}`}
          >
            {s.heightPct > 7 && <em>{s.no}</em>}
            <span className="sf-turn-tip">
              <strong>第 {s.no} 轮</strong> · {s.label}
            </span>
          </button>
        ))}
        <div
          ref={thumbRef}
          className={`sf-turn-thumb ${dragging ? "dragging" : ""}`}
          style={{ top: `${thumb.topPct}%`, height: `${thumb.heightPct}%` }}
          onPointerDown={onThumbDown}
        />
      </div>
      <button
        type="button"
        className="sf-turn-arrow down"
        aria-label="向下滚动"
        onClick={() => scrollBy(240)}
      />
    </div>
  );
}

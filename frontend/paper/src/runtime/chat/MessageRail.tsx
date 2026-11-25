/**
 * MessageRail — 聊天区右缘消息导航条（学习 WorkBuddy 移动端设计，2026-11-25）。
 *
 * 一根细条上每条用户/助手消息画一小格（横线），当前视口位置画高亮游标，
 * 点击/拖动任意位置平滑跳到对应消息。消息多时压缩映射到固定轨道数，
 * 保证长会话也不超高。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineMessage } from '@/shared/data/types';

/** 轨道数上限：超出按比例折叠（两格贴一起）。 */
const MAX_TRACKS = 64;

interface RailTick {
  /** 折叠后的轨道下标 0..MAX_TRACKS-1。 */
  track: number;
  /** 消息 id（点击滚动锚点）。 */
  id: string;
  /** 用户消息（高亮深一点）/ 助手消息。 */
  kind: 'user' | 'assistant';
}

export function MessageRail({
  messages,
  scrollRef,
}: {
  messages: TimelineMessage[];
  /** 外层滚动容器（chat-scroll），游标位置据此计算。 */
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ticks = useMemo<RailTick[]>(() => {
    const turns = messages.filter((m) => m.kind === 'user_turn' || m.kind === 'assistant_text');
    if (!turns.length) return [];
    const n = turns.length;
    return turns.map((m, i) => ({
      track: n <= MAX_TRACKS ? Math.round((i * (MAX_TRACKS - 1)) / Math.max(1, n - 1)) : Math.round((i * (MAX_TRACKS - 1)) / (n - 1)),
      id: m.id,
      kind: m.kind === 'user_turn' ? 'user' : 'assistant',
    }));
  }, [messages]);

  /** 视口进度 0..1（游标位置）。 */
  const [progress, setProgress] = useState(0);
  const rafPending = useRef(false);

  const onScroll = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
    });
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, onScroll]);

  const jumpTo = useCallback(
    (id: string) => {
      const el = scrollRef.current;
      if (!el) return;
      const node = el.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [scrollRef],
  );

  /** 点轨道空白 → 按比例跳。 */
  const jumpRatio = useCallback(
    (ratio: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * ratio, behavior: 'smooth' });
    },
    [scrollRef],
  );

  if (!ticks.length) return null;

  return (
    <nav
      className="msg-rail"
      aria-label="消息导航"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        jumpRatio(Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)));
      }}
    >
      <span className="msg-rail-cursor" style={{ top: `${progress * 100}%` }} />
      {ticks.map((t) => (
        <button
          key={t.id}
          type="button"
          className="msg-rail-tick"
          data-kind={t.kind}
          style={{ top: `${(t.track / (MAX_TRACKS - 1)) * 100}%` }}
          title="跳到这条消息"
          onClick={(e) => {
            e.stopPropagation();
            jumpTo(t.id);
          }}
        />
      ))}
    </nav>
  );
}

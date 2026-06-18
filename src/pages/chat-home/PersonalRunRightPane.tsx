/**
 * PersonalRunRightPane — 个人态 run 进行时的右栏（2026-06-18）。
 *
 * 用户反馈三连（2026-06-18）：
 *   1. 侧边栏可拖动；出现时以原 run-session 布局为默认（左窄右宽）。
 *   2. run 不再只是组队——只有确有组队意图才该出团队栏。
 *   3. 个人简单任务/寒暄不该套 team 侧边栏。
 *
 * 落地：
 *   - 自订阅 useRunSession，**只有真的组了团队**（coordinator + agents ≥ 2
 *     节点）才渲染 run-session 右栏 RunSessionRightPane；否则 return null，
 *     右栏不出现，中栏对话全宽（治第 2/3 点的视觉面）。
 *   - 出现时默认宽（占可用宽 ~58%，对齐原 run-session 420|flex 的左窄右宽），
 *     左缘带拖拽手柄，宽度持久化 localStorage（第 1 点）。
 *   - saveState='idle' 隐藏 run-session 页的「去聊天」悬浮 dock（已在 /chat 内）。
 */
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunSession } from '../../core/hooks/useRunSession';
import { RunSessionRightPane } from '../RunSessionPage';

const W_KEY = 'sf.personalRun.rightW';
const MIN_W = 380;
const RAIL_W = 264;
const MIN_CHAT_W = 420; // 中栏对话最窄

function maxWidth(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  return Math.max(MIN_W, vw - RAIL_W - MIN_CHAT_W);
}

export function PersonalRunRightPane({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const session = useRunSession(sessionId);
  // 2026-06-18 — 活跃 run 一律显示 run-session 右栏（单 agent / 团队都显示），
  // 治「runsession 的右侧栏没有」。是否 team 框架由面板内容自适应，不再前置 gate。

  const [width, setWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(W_KEY));
      if (v >= MIN_W) return Math.min(v, maxWidth());
    } catch { /* ignore */ }
    // 默认右宽左窄（对齐原 run-session）：右栏取可用宽 ~58%
    const avail = (typeof window !== 'undefined' ? window.innerWidth : 1440) - RAIL_W;
    return Math.min(maxWidth(), Math.max(MIN_W, Math.round(avail * 0.58)));
  });

  const draggingRef = useRef(false);
  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = Math.min(Math.max(MIN_W, window.innerWidth - e.clientX), maxWidth());
    setWidth(next);
  }, []);
  const onUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setWidth((w) => { try { localStorage.setItem(W_KEY, String(w)); } catch { /* ignore */ } return w; });
  }, []);

  return (
    <div style={{ width, flexShrink: 0, minHeight: 0, display: 'flex', position: 'relative' }}>
      {/* 拖拽手柄 —— 调左窄右宽比例 */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        title="拖动调整宽度"
        style={{
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          background: 'transparent',
          borderLeft: '1px solid var(--t-border)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <RunSessionRightPane
          session={session}
          sessionId={sessionId}
          onNavigate={navigate}
          chatGroupId={null}
          saveState="idle"
        />
      </div>
    </div>
  );
}

/**
 * Timeline — main container for the S6.10-B incremental message stream.
 *
 * Owns:
 *   - vertical scroll of all `messages` (except `status_line`, which is a
 *     separate sticky slot rendered by the parent)
 *   - smart auto-scroll: follows the bottom while the user is near it,
 *     pauses when the user manually scrolls up (>100px from bottom)
 *   - per-message id-keyed mounting so React doesn't rebuild the DOM when
 *     a patch lands; only the changed message re-renders
 *
 * The component is purely presentational — state comes from useRunSession
 * (S6.10-B reducer extension) and SSE 'message' / 'message-patch' events
 * driven by the projector in server/src/lib/timeline-projector.ts.
 *
 * Visual ref: docs/design/platform-v5/run-session-v8.html line 1568-1716
 * (the `.tl` container).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TimelineMessage } from './types';
import { MessageRegistry } from './MessageRegistry';
import { StatusLine } from './messages/StatusLine';
import { ToolGroup } from './messages/ToolGroup';
import { TopStatusBar } from './TopStatusBar';
import styles from './timeline.module.css';

/**
 * A single rendered row in the stream: either one standalone message, or a
 * run of consecutive tool_call/tool_echo messages collapsed into one group.
 * Grouping happens at the render layer only — message data is untouched.
 */
type RenderRow =
  | { type: 'single'; msg: TimelineMessage }
  | { type: 'tool-group'; key: string; msgs: TimelineMessage[]; callCount: number };

const isToolKind = (k: TimelineMessage['kind']): boolean =>
  k === 'tool_call' || k === 'tool_echo';

/**
 * Walk the stream and merge each maximal run of adjacent tool_call/tool_echo
 * messages into one `tool-group` row. Everything else passes through as a
 * `single` row. Mirrors OpenDesign's buildBlocks tool-group collapsing, but
 * over our already-projected TimelineMessage stream (no AgentEvent replay).
 */
function buildRenderRows(messages: TimelineMessage[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i]!;
    if (!isToolKind(m.kind)) {
      rows.push({ type: 'single', msg: m });
      i += 1;
      continue;
    }
    // Greedily consume the contiguous tool run.
    const run: TimelineMessage[] = [];
    let j = i;
    while (j < messages.length && isToolKind(messages[j]!.kind)) {
      run.push(messages[j]!);
      j += 1;
    }
    const callCount = run.filter((r) => r.kind === 'tool_call').length;
    // A lone tool_echo with no preceding chip in the run is unusual but
    // harmless — still render it inside the group frame for consistency.
    rows.push({
      type: 'tool-group',
      key: `tg-${run[0]!.id}`,
      msgs: run,
      callCount,
    });
    i = j;
  }
  return rows;
}

export interface TimelineProps {
  messages: TimelineMessage[];
  /**
   * Override the container class — e.g. for an additional wrapper background.
   * Internal `.container` class is always applied first.
   */
  className?: string;
  /**
   * When true, render the bottom always-on `status_line` slot. Default is
   * now `false` per v8 design (2026-05-28): the design package uses msg-foot
   * (per-turn, running→done with full metrics) as the single live activity
   * surface, and only keeps the `.statusline` CSS as a v7 leftover with no
   * body usage. Callers who specifically want a Codex/Claude Code-style
   * sticky strip can opt in with `renderStatusLine={true}`.
   */
  renderStatusLine?: boolean;
  /**
   * Round 2 (2026-05-24) — top status bar (wall-clock + cost chip).
   * When true and `startedAt` is provided, renders v8 .app-pill + .app-run-meta
   * (line 1545-1547) above the scrolling stream. Default false to avoid
   * surprising existing callers — RunSessionPage opts in.
   */
  renderTopBar?: boolean;
  startedAt?: number;
  isComplete?: boolean;
  hasError?: boolean;
  finalElapsedMs?: number;
  costCny?: number;
  /**
   * Round 2 (2026-05-24) — user message hover-retry. When provided, each
   * `user_turn` row gets a RotateCcw button (opacity:0 default, fades in
   * on hover) wired to onUserRetry(text).
   */
  onUserRetry?: (text: string) => void;
  resending?: boolean;
}

const STICK_THRESHOLD_PX = 100;

export const Timeline = memo(function Timeline({
  messages,
  className,
  renderStatusLine = false,
  renderTopBar = false,
  startedAt,
  isComplete = false,
  hasError = false,
  finalElapsedMs,
  costCny,
  onUserRetry,
  resending = false,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the user is "stuck" to the bottom (default true). Flips
  // false once the user scrolls up more than STICK_THRESHOLD_PX, and flips
  // back to true if they scroll back down to the bottom.
  const [stickToBottom, setStickToBottom] = useState(true);

  // Filter the status_line out of the scrolling stream — it's a slot.
  const streamMessages = messages.filter((m) => m.kind !== 'status_line');
  // 2026-05-24 Round 2 fix (P0): the projector emits a fresh status_line
  // message id per verb-change (see server/src/lib/timeline-projector.ts
  // bumpStatusLine`). `.find()` returns the *first* match, so the statusline
  // froze on `elapsed_s = 0` from the first event. We need the *latest*
  // status_line. Use a reverse for-loop to avoid an O(n) reverse() copy.
  let statusLineMsg: Extract<TimelineMessage, { kind: 'status_line' }> | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'status_line') {
      statusLineMsg = m;
      break;
    }
  }

  // Detect when the user scrolls. If they're within STICK_THRESHOLD_PX of the
  // bottom, keep auto-scrolling; otherwise pause.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(distFromBottom <= STICK_THRESHOLD_PX);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Whenever messages change, if we're stuck to bottom, scroll there.
  // Use useLayoutEffect to avoid a flash where new content appears above the
  // fold for one frame.
  useLayoutEffect(() => {
    if (!stickToBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, stickToBottom]);

  const containerClass = className
    ? `${styles.container} ${className}`
    : styles.container;

  // Derive a sane startedAt if caller didn't pass one — use the earliest
  // message's `ts`. Falls back to undefined when no messages yet (TopStatusBar
  // renders `—`).
  const derivedStartedAt = startedAt ?? (messages.length > 0
    ? messages.reduce((min, m) => (m.ts < min ? m.ts : min), messages[0]!.ts)
    : undefined);

  const topBarState: 'running' | 'done' | 'error' = hasError
    ? 'error'
    : isComplete
      ? 'done'
      : 'running';

  return (
    <>
      {renderTopBar && (
        <TopStatusBar
          startedAt={derivedStartedAt}
          state={topBarState}
          finalElapsedMs={finalElapsedMs}
          costCny={costCny}
        />
      )}
      <div className={containerClass} ref={containerRef}>
        {buildRenderRows(streamMessages).map((row) =>
          row.type === 'single' ? (
            <div
              key={row.msg.id}
              className={styles.item}
              data-kind={row.msg.kind}
            >
              <MessageRegistry
                msg={row.msg}
                onUserRetry={onUserRetry}
                resending={resending}
              />
            </div>
          ) : (
            <div key={row.key} className={styles.item} data-kind="tool-group">
              <ToolGroup callCount={row.callCount}>
                {row.msgs.map((m) => (
                  <MessageRegistry
                    key={m.id}
                    msg={m}
                    onUserRetry={onUserRetry}
                    resending={resending}
                  />
                ))}
              </ToolGroup>
            </div>
          ),
        )}
      </div>
      {renderStatusLine && statusLineMsg && <StatusLine msg={statusLineMsg} />}
    </>
  );
});

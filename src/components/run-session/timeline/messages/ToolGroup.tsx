/**
 * ToolGroup — a bordered container that visually groups a run of consecutive
 * `tool_call` + `tool_echo` messages into a single "tool-group" block, à la
 * Claude Code / OpenDesign (where `tool_use` + the following `tool_result`
 * collapse into one bordered card rather than scattering as loose lines).
 *
 * Pure presentational wrapper: it does NOT change the message data structure.
 * The parent Timeline detects adjacent tool_call/tool_echo runs and feeds the
 * already-rendered child rows here. Each child stays the existing
 * ToolCallChip / ToolEchoLine renderer — we only wrap them in a frame so the
 * chip sits on top and its echo continuation lines nest below it.
 *
 * Visual ref: OpenDesign AssistantMessage `tool-group` block — a single
 * outlined container per consecutive tool run. We keep ShadowFlow's flat
 * `.tool` / `.echo` aesthetic inside; the frame just supplies the boundary.
 */
import { memo, type ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import styles from '../timeline.module.css';

interface Props {
  /** Number of tool_call chips in this group (drives the header count). */
  callCount: number;
  /** Pre-rendered child rows (ToolCallChip / ToolEchoLine). */
  children: ReactNode;
}

export const ToolGroup = memo(function ToolGroup({ callCount, children }: Props) {
  return (
    <div className={styles.toolGroup}>
      <div className={styles.toolGroupHead} aria-hidden>
        <Wrench size={11} className={styles.toolGroupIcon} />
        <span className={styles.toolGroupLabel}>工具调用</span>
        {callCount > 1 && (
          <span className={styles.toolGroupCount}>×{callCount}</span>
        )}
      </div>
      <div className={styles.toolGroupBody}>{children}</div>
    </div>
  );
});

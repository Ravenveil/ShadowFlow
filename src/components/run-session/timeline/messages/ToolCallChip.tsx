/**
 * ToolCallChip — single-line tool invocation chip:
 *   ● fork_template  academic-paper · @ravenveil      查看模板 ↗
 * Visual ref: v8 .tl-tool (line 1387-1393).
 */
import { memo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'tool_call' }>;
}

export const ToolCallChip = memo(function ToolCallChip({ msg }: Props) {
  return (
    <div className={styles.tool}>
      <span className={styles.toolLead}>●</span>
      <span className={styles.toolName}>{msg.name}</span>
      <span className={styles.toolArgs}>{msg.args_summary}</span>
      {msg.link && (
        <a
          className={styles.toolLink}
          href={msg.link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {msg.link.label}
          <ArrowUpRight size={11} aria-hidden />
        </a>
      )}
    </div>
  );
});

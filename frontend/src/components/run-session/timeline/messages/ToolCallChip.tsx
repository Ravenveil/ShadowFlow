/**
 * ToolCallChip — 单行工具调用卡（gap #2/#3 · 2026-06-24 对齐 Hermes 工具卡）：
 *   [类别图标] Read File  methodology.md   3.6s  · 3 行   [状态 ✓/✗/转圈]   查看 ↗
 * - 名称走 humanizeToolName（read_file → Read File，剥 MCP server__ 前缀）。
 * - 图标走 toolIconFor（按类别：file/terminal/web/vision…）。
 * - status: running→转圈 / ok→✓ / error→✗；duration_ms→ "43ms"/"3.6s"；result_summary 附后。
 * Visual ref: v8 .tl-tool + Hermes chat tool-activity row。
 */
import { memo } from 'react';
import { ArrowUpRight, Check, X, Loader2 } from 'lucide-react';
import type { TimelineMessage } from '../types';
import { humanizeToolName, toolIconFor } from '../toolMeta';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'tool_call' }>;
}

/** ms → "43ms" / "3.6s" / "12s"（对齐 Hermes 的耗时格式）。 */
function fmtDuration(ms?: number): string {
  if (ms == null || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

export const ToolCallChip = memo(function ToolCallChip({ msg }: Props) {
  const Icon = toolIconFor(msg.name);
  const label = humanizeToolName(msg.name);
  const dur = fmtDuration(msg.duration_ms);
  const status = msg.status ?? 'ok';

  return (
    <div className={styles.tool}>
      {/* 类别图标替代旧的 ● 圆点 */}
      <Icon size={12} strokeWidth={2} className={styles.toolLead} aria-hidden />
      <span className={styles.toolName}>{label}</span>
      <span className={styles.toolArgs}>{msg.args_summary}</span>

      {/* 耗时 + 结果摘要（gap #2） */}
      {(dur || msg.result_summary) && (
        <span className={styles.toolMeta}>
          {dur}
          {dur && msg.result_summary ? ' · ' : ''}
          {msg.result_summary ?? ''}
        </span>
      )}

      {/* 状态图标（gap #2）：转圈 / ✓ / ✗ */}
      {status === 'running' && (
        <Loader2 size={12} strokeWidth={2.4} className={styles.toolSpin} aria-label="运行中" />
      )}
      {status === 'ok' && (
        <Check size={12} strokeWidth={2.6} className={styles.toolOk} aria-label="成功" />
      )}
      {status === 'error' && (
        <X size={12} strokeWidth={2.6} className={styles.toolErr} aria-label="失败" />
      )}

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

// 2026-05-16 — Live token estimate for Run Session composer.
// Inspired by Cherry Studio Inputbar/TokenCount.tsx. Pure heuristic
// (chars/4) — fast, dependency-free, good enough for "warn before send".
// Mounted at the composer-bar right side, next to the send button.
import React from 'react';

export interface InputTokenCountProps {
  /** Current textarea value. */
  text: string;
  /** Files queued via Paperclip. File name + size are folded into the estimate. */
  attachedFiles?: File[];
  /** Soft cap above which the label turns warn/error. Default 8000. */
  threshold?: number;
}

function estimateTokens(text: string, files: File[]): number {
  let chars = text.length;
  for (const f of files) {
    // Filename + a rough "size in chars" proxy. We don't read file contents
    // here (would require async); size is a usable upper bound for chunked
    // text/code uploads. Binary blobs over-estimate — that's the safer side.
    chars += f.name.length;
    chars += f.size;
  }
  if (chars <= 0) return 0;
  return Math.ceil(chars / 4);
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    // 1 decimal up to 99.9k, drop decimal beyond that
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}

const InputTokenCount: React.FC<InputTokenCountProps> = ({
  text,
  attachedFiles,
  threshold = 8000,
}) => {
  const files = attachedFiles ?? [];
  const tokens = estimateTokens(text, files);
  if (tokens === 0) return null;

  const ratio = tokens / threshold;
  let color = 'var(--t-fg-4)';
  if (ratio >= 0.95) color = 'var(--t-err, #ef4444)';
  else if (ratio >= 0.8) color = 'var(--t-warn, #f59e0b)';
  else if (ratio >= 0.5) color = 'var(--t-fg-3)';

  const over = tokens > threshold;
  const label = over
    ? `~${formatTokens(tokens)} / ${formatTokens(threshold)} (超)`
    : `~${formatTokens(tokens)} tok`;

  return (
    <span
      title={`估算 ${tokens.toLocaleString()} tokens · 阈值 ${threshold.toLocaleString()}`}
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        lineHeight: 1,
        color,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
};

export default InputTokenCount;

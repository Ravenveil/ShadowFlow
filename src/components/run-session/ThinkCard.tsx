/**
 * ThinkCard — collapsible "thinking" card shown in the left stream of
 * RunSessionPage. Replaces the inline thinking-bubble block previously
 * built directly inside RunSessionPage (lines ~2460-2527).
 *
 * Design spec (task brief, 设计点 6):
 *   - default folded:   "💭 思考中 · {firstLine} · {tokenCount} tokens ›"
 *   - expanded:         3 lines with timestamps of the reasoning stream
 *
 * Current backend limitation (2026-05-18):
 *   `useRunSession` only exposes a single accumulating `thinkingMessage`
 *   string. There is no per-line timestamp stream yet (the daemon
 *   collapses reasoning frames into one stitched text). So this card
 *   renders:
 *     - folded:   one-line summary + token count + state icon (spinner /
 *                 check) — same chrome as the design spec.
 *     - expanded: full thinkingMessage text with a single "now" timestamp
 *                 at the top.
 *
 * TODO (待 §4.3 thinking extended-thinking API 接入后升级):
 *   When the backend grows a `thinking_stream: Array<{ts, line}>` event
 *   shape, replace the single-timestamp render with a per-line ordered
 *   list and animate new lines in via `rs-fade-up`.
 *
 * This component is presentational + holds its own folded/expanded state.
 * It deliberately does NOT mock data; if `thinkingMessage` is null /
 * empty it renders nothing.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';

export interface ThinkCardProps {
  /** Fallback single-string thinking message (legacy / placeholder path). */
  thinkingMessage: string | null;
  /**
   * 2026-05-19 — structured reasoning stream. When non-empty, takes priority
   * over `thinkingMessage` and renders one timestamped row per chunk (设计点
   * 6 "3 行带时间戳的 reasoning 流").
   */
  thinkingStream?: Array<{ ts: string; step: string | null; text: string }>;
  /** True while the stream is still producing thinking content. */
  isStreaming: boolean;
  /** Live elapsed ms while streaming (null otherwise). */
  liveThinkMs: number | null;
  /** Final elapsed ms once streaming completed (null while still streaming). */
  thinkDurationMs: number | null;
  /** Approximate token count for the thinking text. Hidden when 0. */
  tokenCount?: number;
  /** Initial folded state (default true). */
  defaultExpanded?: boolean;
}

const InlineSpinner: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <span
    aria-hidden
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      border: '1.5px solid transparent',
      borderTopColor: 'var(--t-accent, #A855F7)',
      borderRightColor: 'var(--t-accent, #A855F7)',
      animation: 'sf-spin 0.9s linear infinite',
    }}
  />
);

function formatThinkDuration(ms: number): string {
  const sec = ms / 1000;
  if (sec < 1) return `${ms}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m${rem}s`;
}

function formatNowTimestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const ThinkCard: React.FC<ThinkCardProps> = ({
  thinkingMessage,
  thinkingStream,
  isStreaming,
  liveThinkMs,
  thinkDurationMs,
  tokenCount = 0,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [titleHover, setTitleHover] = useState(false);
  // Fallback timestamp for the legacy single-string thinkingMessage path.
  const fallbackTsRef = useRef<string>(formatNowTimestamp());
  useEffect(() => {
    if (!isStreaming) fallbackTsRef.current = formatNowTimestamp();
  }, [isStreaming]);

  const hasStream = Array.isArray(thinkingStream) && thinkingStream.length > 0;
  if (!hasStream && !thinkingMessage) return null;

  // Folded summary: latest stream entry's first line, else fall back to
  // thinkingMessage's first line.
  const latestText = hasStream
    ? thinkingStream![thinkingStream!.length - 1].text
    : (thinkingMessage ?? '');
  const firstLine = latestText.split('\n').find((l) => l.trim().length > 0) ?? '';
  const folded = firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine;

  const statusLabel = isStreaming
    ? `正在思考${liveThinkMs !== null ? ` · ${formatThinkDuration(liveThinkMs)}` : '…'}`
    : `已思考 ${thinkDurationMs !== null ? formatThinkDuration(thinkDurationMs) : ''}`.trim();

  return (
    <div
      data-component="think-card"
      style={{
        borderRadius: 6,
        background: 'var(--t-bg, var(--bg))',
        borderLeft: '2px solid var(--t-run, #3B82F6)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={() => setTitleHover(true)}
        onMouseLeave={() => setTitleHover(false)}
        data-testid="think-card-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 12px',
          textAlign: 'left',
          fontFamily: 'inherit',
          color: 'inherit',
        }}
      >
        {isStreaming ? (
          <InlineSpinner size={10} />
        ) : (
          <Check size={12} color="var(--t-fg-4, var(--fg-4))" strokeWidth={2.5} />
        )}
        <span style={{ fontSize: 12, color: 'var(--t-fg-3, var(--fg-3))', fontWeight: 500 }}>
          {statusLabel}
        </span>
        {!expanded && folded && (
          <span
            style={{
              fontSize: 11.5,
              color: 'var(--t-fg-4, var(--fg-4))',
              fontWeight: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flexShrink: 1,
            }}
            title={folded}
          >
            · {folded}
          </span>
        )}
        {tokenCount > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-5, var(--fg-5))',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {tokenCount.toLocaleString()} tokens
          </span>
        )}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            marginLeft: 'auto',
            opacity: titleHover ? 1 : 0.45,
            color: 'var(--t-fg-4, var(--fg-4))',
            transition: 'opacity 120ms ease',
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded && (
        <div
          style={{
            padding: '4px 12px 10px 12px',
            fontSize: 11,
            color: 'var(--t-fg-3, var(--fg-3))',
            lineHeight: 1.55,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {hasStream ? (
            // Per-row timestamped reasoning stream (design-spec "3 行带时间戳的 reasoning 流")
            thinkingStream!.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: i === thinkingStream!.length - 1 ? 0 : 8,
                  paddingBottom: i === thinkingStream!.length - 1 ? 0 : 8,
                  borderBottom:
                    i === thinkingStream!.length - 1
                      ? 'none'
                      : '1px dashed var(--t-border, var(--border))',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 9.5,
                    color: 'var(--t-fg-5, var(--fg-5))',
                    letterSpacing: '0.08em',
                    flexShrink: 0,
                    minWidth: 56,
                  }}
                >
                  {row.ts}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {row.step && (
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9.5,
                        color: 'var(--t-accent, #A855F7)',
                        marginBottom: 2,
                        letterSpacing: '0.04em',
                      }}
                    >
                      [{row.step}]
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.text}
                  </div>
                </div>
              </div>
            ))
          ) : (
            // Legacy single-string fallback (no <sf:thinking> emitted yet).
            <>
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 9.5,
                  color: 'var(--t-fg-5, var(--fg-5))',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                {fallbackTsRef.current}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {thinkingMessage}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ThinkCard;

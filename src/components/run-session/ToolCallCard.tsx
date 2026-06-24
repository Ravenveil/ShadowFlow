/**
 * ToolCallCard — compact, line-icon card for a single agent tool invocation,
 * rendered nested under its owning step in the RunSession left step list.
 *
 * clawsgo parity: the run "feels alive" because you see what the agent is
 * actually doing — a search term, a fetched URL, a file read — with a tool
 * icon, a live status dot, per-call elapsed time, and (when expanded) the
 * input summary, result summary, and clickable result links.
 *
 * Driven entirely by REAL SSE `tool-call` frames (see RunSessionToolCall in
 * useRunSession.ts) — no fabricated data. The running frame shows a pulsing
 * dot; the result frame flips it to a green check / red alert and reveals the
 * result summary + links.
 *
 * Pure presentational + a tiny local expand toggle. Matches the surrounding
 * inline-style + CSS-var conventions (--t-fg, --t-accent, --t-panel, …).
 */
import React, { useState } from 'react';
import {
  Search,
  Globe,
  FileText,
  FileEdit,
  Terminal,
  Wrench,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FolderSearch,
  Download,
  Check,
} from 'lucide-react';
import type { RunSessionToolCall } from '../../core/hooks/useRunSession';

export interface ToolCallCardProps {
  call: RunSessionToolCall;
}

// ── Tool → line icon mapping ─────────────────────────────────────────────────
// Match on common tool-name substrings (case-insensitive) so a wide variety of
// runtime tool ids resolve to a sensible icon. Falls back to a generic wrench.
function toolIcon(tool: string, size = 13): React.ReactNode {
  const t = tool.toLowerCase();
  const color = 'var(--t-accent-bright, var(--t-accent, #1890FF))';
  const common = { size, color, strokeWidth: 2 } as const;
  if (/search|grep|find|lookup/.test(t)) return <Search {...common} />;
  if (/glob|ls|list|dir/.test(t)) return <FolderSearch {...common} />;
  if (/fetch|http|url|browse|web|crawl/.test(t)) return <Globe {...common} />;
  if (/download|pull|get_file/.test(t)) return <Download {...common} />;
  if (/write|edit|patch|create_file|apply/.test(t)) return <FileEdit {...common} />;
  if (/read|cat|view|open|file/.test(t)) return <FileText {...common} />;
  if (/bash|shell|exec|run|command|terminal|cmd/.test(t)) return <Terminal {...common} />;
  return <Wrench {...common} />;
}

// ── Status dot ───────────────────────────────────────────────────────────────
const statusDot = (status: RunSessionToolCall['status']): React.CSSProperties => {
  const base: React.CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  };
  switch (status) {
    case 'running':
      return {
        ...base,
        background: 'var(--t-run, #3B82F6)',
        boxShadow: '0 0 0 3px rgba(59,130,246,.16)',
        animation: 'sf-pulse 1.4s ease-in-out infinite',
      };
    case 'failed':
      return { ...base, background: 'var(--t-err, #EF4444)' };
    case 'done':
    default:
      return { ...base, background: 'var(--t-ok, #10B981)' };
  }
};

function formatElapsed(ms: number | undefined, status: RunSessionToolCall['status']): string {
  if (ms == null || ms <= 0) return status === 'running' ? '…' : '';
  const sec = ms / 1000;
  if (sec < 1) return `${ms}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return `${m}m${r}s`;
}

// Short, friendly label for the raw tool id (e.g. "web_search" → "web search").
function prettyTool(tool: string): string {
  return tool.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * clawsgo "找到 N 个结果" — derive the real result count for the links header.
 *
 * The backend tool-call projection now parses a structured `result_count` from
 * the runtime output (run-sessions.ts parseResultCount) and also surfaces it in
 * the result summary text. Because the SSE→hook reducer only forwards a fixed
 * field set, we re-parse the same count phrases out of `resultSummary` here so
 * the card shows the REAL hit count (e.g. "找到 12 个结果") rather than the bare
 * number of extracted links — which is capped at 5 and only counts URLs. When
 * no count phrase is present we fall back to the link count (still real data).
 *
 * Returns undefined only when there is neither a parsed count nor any links.
 */
function resolveResultCount(
  resultSummary: string | undefined,
  linkCount: number,
): number | undefined {
  if (resultSummary) {
    const patterns: RegExp[] = [
      /found\s+(\d[\d,]*)\s+(?:results?|matches|hits|items|files?|rows?)/i,
      /(\d[\d,]*)\s+(?:results?|matches|hits|items|files?|rows?)\b/i,
      /找到\s*(\d[\d,]*)\s*(?:个|条)?\s*(?:结果|匹配|项|条目|文件|行)/,
      /(\d[\d,]*)\s*(?:个|条)\s*(?:结果|匹配|项|条目|文件)/,
      /(\d[\d,]*)\s*行/,
    ];
    for (const re of patterns) {
      const m = resultSummary.match(re);
      if (m && m[1]) {
        const n = Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
  }
  return linkCount > 0 ? linkCount : undefined;
}

const ToolCallCard: React.FC<ToolCallCardProps> = ({ call }) => {
  const [expanded, setExpanded] = useState(false);
  const links = call.links ?? [];
  // clawsgo "找到 N 个结果" beat — the real hit count when known, else link count.
  const resultCount = resolveResultCount(call.resultSummary, links.length);
  // Expandable iff there is something worth revealing.
  const hasDetail =
    !!call.inputSummary || !!call.resultSummary || links.length > 0;

  const showInput = call.inputSummary && call.inputSummary !== call.title;

  return (
    <div
      data-component="tool-call-card"
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 9,
        background: 'var(--t-panel-2, var(--t-bg-elev-2, var(--t-panel)))',
        overflow: 'hidden',
        transition: 'border-color .15s ease, background .15s ease',
      }}
    >
      {/* ── Header row: chevron · tool icon · title · status dot · elapsed ── */}
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        title={hasDetail ? (expanded ? '收起' : '展开详情') : call.title}
        style={{
          display: 'grid',
          gridTemplateColumns: '14px 18px 1fr auto auto',
          gap: 7,
          alignItems: 'center',
          width: '100%',
          padding: '6px 9px',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
          cursor: hasDetail ? 'pointer' : 'default',
          fontFamily: 'inherit',
          color: 'var(--t-fg)',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14,
            height: 14,
            color: 'var(--t-fg-5)',
            opacity: hasDetail ? 1 : 0,
          }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
          }}
        >
          {toolIcon(call.tool)}
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.01em',
              color: 'var(--t-fg-3)',
              textTransform: 'capitalize',
              lineHeight: 1.2,
            }}
          >
            {prettyTool(call.tool)}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--t-fg)',
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={call.title}
          >
            {call.title}
          </span>
          {/* clawsgo beat — "search term → 找到 N 个结果". Shown inline (collapsed)
              once the call is done and a real count is known, so the left pane
              reads like a search log without needing to expand. */}
          {call.status === 'done' && resultCount != null && (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--t-ok, #10B981)',
                fontWeight: 600,
                lineHeight: 1.2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Check size={10} strokeWidth={2.5} />
              {`找到 ${resultCount} 个结果`}
            </span>
          )}
        </span>
        <span
          aria-hidden
          style={{ ...statusDot(call.status), marginRight: 2 }}
          title={call.status}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color:
              call.status === 'running'
                ? 'var(--t-accent-bright, var(--t-accent))'
                : call.status === 'failed'
                ? 'var(--t-err, #EF4444)'
                : 'var(--t-fg-4)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatElapsed(call.elapsedMs, call.status)}
        </span>
      </button>

      {/* ── Expanded detail: input / result / clickable links ── */}
      {expanded && hasDetail && (
        <div
          style={{
            padding: '2px 10px 9px 39px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            borderTop: '1px solid var(--t-border)',
          }}
        >
          {showInput && (
            <DetailRow label="输入" value={call.inputSummary} mono />
          )}
          {call.resultSummary && (
            <DetailRow
              label="结果"
              value={call.resultSummary}
              tone={call.status === 'failed' ? 'err' : undefined}
            />
          )}
          {links.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 1 }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--t-ok, #10B981)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Check size={10} strokeWidth={2.5} />
                {/* Real hit count when the runtime announced one ("找到 N 个结果"),
                    else the number of clickable links surfaced. */}
                {resultCount != null && resultCount !== links.length
                  ? `找到 ${resultCount} 个结果 · ${links.length} 个链接`
                  : `找到 ${resultCount ?? links.length} 个结果`}
              </span>
              {links.map((lnk, i) => (
                <a
                  key={`${lnk.url}-${i}`}
                  href={lnk.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={lnk.url}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--t-accent-bright, var(--t-accent, #1890FF))',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <ExternalLink size={10} style={{ flexShrink: 0 }} />
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {lnk.label}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Small labelled detail row ────────────────────────────────────────────────
const DetailRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'err';
}> = ({ label, value, mono, tone }) => (
  <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
    <span
      style={{
        fontSize: 10,
        color: 'var(--t-fg-5)',
        fontWeight: 600,
        flexShrink: 0,
        paddingTop: 1,
        minWidth: 26,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: 11.5,
        fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
        color: tone === 'err' ? 'var(--t-err, #EF4444)' : 'var(--t-fg-2)',
        lineHeight: 1.4,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        // Clamp long bodies so the card stays compact.
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {value}
    </span>
  </div>
);

export default ToolCallCard;

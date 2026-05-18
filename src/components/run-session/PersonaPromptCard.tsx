/**
 * PersonaPromptCard — system-prompt preview block under the 5-slot
 * timeline. Mirrors run-session-v2.html `.ag-persona` styles (lines
 * ~700-722).
 *
 * Highlighting is intentionally lightweight (no Prism / Shiki) — just
 * regex sweeps for:
 *   - `#`-prefix lines  → comment (var(--fg-5))
 *   - YAML keys like `role:` / `tools:` → accent
 *   - "quoted strings"  → status-ok green
 *
 * Status dot:
 *   - persona present                                 → "cached" (idle, gray)
 *   - persona absent + agent.status === 'building'    → "waiting" (accent
 *                                                       pulse via sf-pulse)
 *   - otherwise                                       → "pending" (gray)
 *
 * NOTE: when `persona` is undefined, we render the literal placeholder
 * "未设置 system prompt" (string spec'd by the task brief) — not a
 * fabricated sample prompt. Token count meta shows "— tokens" in that
 * state.
 */
import React from 'react';

export interface PersonaPromptCardProps {
  persona: string | undefined;
  /** Used to pick the status dot when persona is missing. */
  agentStatus?: 'building' | 'ready' | 'pending';
  /** Optional agent id/title for the header label (e.g. "reader.persona"). */
  agentLabel?: string;
}

type StreamState = 'cached' | 'waiting' | 'pending';

function pickStreamState(
  persona: string | undefined,
  agentStatus: PersonaPromptCardProps['agentStatus'],
): StreamState {
  if (persona && persona.trim().length > 0) return 'cached';
  if (agentStatus === 'building') return 'waiting';
  return 'pending';
}

/** Lightweight token-by-line highlighter. Returns React fragments. */
function renderHighlighted(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();

    // Comment line.
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return (
        <span key={idx} style={{ color: 'var(--fg-5)' }}>
          {line}
          {idx < lines.length - 1 ? '\n' : ''}
        </span>
      );
    }

    // YAML keyword + value + strings.
    const parts: React.ReactNode[] = [];
    let rest = line;
    let cursor = 0;

    // Match leading `keyword:` (optional indent).
    const kwMatch = rest.match(/^(\s*)([A-Za-z_][\w-]*)(\s*:\s*)/);
    if (kwMatch) {
      parts.push(<span key={`pre-${idx}`}>{kwMatch[1]}</span>);
      parts.push(
        <span key={`kw-${idx}`} style={{ color: 'var(--accent-bright)', fontWeight: 600 }}>
          {kwMatch[2]}
        </span>,
      );
      parts.push(<span key={`col-${idx}`}>{kwMatch[3]}</span>);
      rest = rest.slice(kwMatch[0].length);
    }

    // Highlight remaining quoted strings.
    const re = /"([^"]*)"|'([^']*)'/g;
    let match: RegExpExecArray | null;
    cursor = 0;
    while ((match = re.exec(rest)) !== null) {
      if (match.index > cursor) {
        parts.push(
          <span key={`t-${idx}-${cursor}`} style={{ color: 'var(--fg-2)' }}>
            {rest.slice(cursor, match.index)}
          </span>,
        );
      }
      parts.push(
        <span key={`s-${idx}-${match.index}`} style={{ color: 'var(--status-ok)' }}>
          {match[0]}
        </span>,
      );
      cursor = match.index + match[0].length;
    }
    if (cursor < rest.length) {
      parts.push(
        <span key={`tail-${idx}`} style={{ color: 'var(--fg-2)' }}>
          {rest.slice(cursor)}
        </span>,
      );
    }
    if (parts.length === 0) {
      parts.push(<span key={`raw-${idx}`}>{line}</span>);
    }

    return (
      <React.Fragment key={idx}>
        {parts}
        {idx < lines.length - 1 ? '\n' : ''}
      </React.Fragment>
    );
  });
}

const STREAM_LABELS: Record<StreamState, string> = {
  cached: 'cached',
  waiting: 'waiting',
  pending: 'pending',
};

export const PersonaPromptCard: React.FC<PersonaPromptCardProps> = ({
  persona,
  agentStatus,
  agentLabel,
}) => {
  const stream = pickStreamState(persona, agentStatus);
  const hasPersona = !!persona && persona.trim().length > 0;
  const tokenCountLabel = hasPersona
    ? `${Math.ceil((persona as string).length / 4)} tokens`
    : '— tokens';

  const dotColor =
    stream === 'cached'
      ? 'var(--fg-5)'
      : stream === 'waiting'
        ? 'var(--accent)'
        : 'var(--fg-5)';
  const labelColor =
    stream === 'waiting' ? 'var(--accent-bright)' : 'var(--fg-5)';

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 13,
        background: 'var(--bg-elev-1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 13px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elev-2)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--fg-4)',
          fontWeight: 700,
        }}
      >
        <span>SYSTEM PROMPT</span>
        {agentLabel && (
          <span
            style={{
              color: 'var(--fg-2)',
              letterSpacing: '0.08em',
            }}
          >
            · {agentLabel}.persona
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          style={{
            color: 'var(--fg-5)',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'none',
          }}
        >
          {tokenCountLabel}
        </span>
        <span
          style={{
            color: labelColor,
            textTransform: 'none',
            letterSpacing: '0.04em',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: dotColor,
              animation:
                stream === 'waiting'
                  ? 'sf-pulse 1.4s ease-in-out infinite'
                  : 'none',
            }}
          />
          {STREAM_LABELS[stream]}
        </span>
      </div>
      <pre
        style={{
          padding: '13px 16px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11.5,
          lineHeight: 1.85,
          color: hasPersona ? 'var(--fg-2)' : 'var(--fg-5)',
          whiteSpace: 'pre-wrap',
          margin: 0,
          fontStyle: hasPersona ? 'normal' : 'italic',
          wordBreak: 'break-word',
        }}
      >
        {hasPersona ? renderHighlighted(persona as string) : '未设置 system prompt'}
        {/* 2026-05-18 (agent-4) — blinking caret during 'waiting' state,
            so when LLM is still producing persona the user sees a live
            cursor. Uses sf-cur keyframe now globally defined. */}
        {stream === 'waiting' && (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 7,
              height: 13,
              marginLeft: 2,
              verticalAlign: '-2px',
              background: 'var(--accent)',
              animation: 'sf-cur 1s steps(2) infinite',
            }}
          />
        )}
      </pre>
    </div>
  );
};

export default PersonaPromptCard;

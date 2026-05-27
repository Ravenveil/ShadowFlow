/**
 * RawMessage — T3 first-class `raw` block.
 *
 * Renders content the server could NOT classify as a normal answer/tag
 * (leaked SSE wire frames, off-protocol JSON blobs, raw CLI lines) in a
 * COLLAPSED, dimmed, monospace block — so it is inspectable but never pollutes
 * the answer bubble. Mirrors OpenDesign's `raw` event kind
 * (apps/web/src/providers/daemon.ts → `{ kind: 'raw', line }`).
 *
 * Collapsed by default (raw content is noise); the user can expand to debug.
 * No emoji icons (lucide line icons per project convention).
 */
import { memo, useState } from 'react';
import { ChevronRight, ChevronDown, FileWarning } from 'lucide-react';
import type { TimelineMessage } from '../types';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'raw' }>;
}

export const RawMessage = memo(function RawMessage({ msg }: Props) {
  const [open, setOpen] = useState(false);
  const body = msg.body?.trim() ?? '';
  if (!body) return null;

  const lineCount = body.split('\n').length;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      style={{
        margin: '4px 0',
        border: '1px solid var(--t-border)',
        borderRadius: 8,
        background: 'var(--t-bg-2, rgba(127,127,127,0.06))',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--t-fg-4)',
          fontSize: 12,
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <Chevron size={13} aria-hidden />
        <FileWarning size={13} aria-hidden />
        <span style={{ fontWeight: 500 }}>原始输出</span>
        {msg.source && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--t-border)',
              color: 'var(--t-fg-4)',
            }}
          >
            {msg.source}
          </span>
        )}
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
          {lineCount} 行{!open ? ' · 点击展开' : ''}
        </span>
      </button>
      {open && (
        <pre
          style={{
            margin: 0,
            padding: '8px 12px',
            borderTop: '1px solid var(--t-border)',
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: 'var(--t-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            color: 'var(--t-fg-3, var(--t-fg-4))',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowX: 'auto',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {body}
        </pre>
      )}
    </div>
  );
});

/**
 * AgentPickerModal — quick-picker popover for the AgentRoster.
 *
 * Triggered by either the roster's `[+N ▾]` overflow chip OR the global
 * ⌘K shortcut (see `useCommandK`). The modal is uncontrolled internally
 * apart from search query + keyboard highlight; selection state lives in
 * the parent (agent-1's AgentPanel) and is reported via `onSelect`.
 *
 * Layout (matches run-session-v2.html `.ag-sw-pop`):
 *   ● 340px wide popover, centered over the page with a translucent
 *     backdrop. Backdrop click → onClose().
 *   ● Top: text input, auto-focused on open, placeholder "⌘K 搜索 agent…".
 *     Typing fuzzy-filters by title (case-insensitive substring).
 *   ● Body: 2-column grid of agent cells (avatar mark + title + status dot).
 *     Filtered out agents are not rendered. Empty state shows a muted hint.
 *   ● Footer: kbd legend "↑↓ 移动 · ↵ 选中 · esc 关闭".
 *
 * Keyboard:
 *   ↑ / ↓ → highlight prev / next visible agent (wraps)
 *   ← / → → highlight prev / next visible agent (since grid is 2-col,
 *           we treat ←→ the same as ↑↓ — the visual jump is similar and
 *           it avoids surprising users on a one-row grid)
 *   ↵    → onSelect(highlighted.id) + onClose()
 *   esc  → onClose()
 *
 * Mouse:
 *   hover → highlight follows mouse
 *   click → onSelect + onClose (immediate)
 *
 * The component clears search + highlight when `open` flips to false so
 * the next open starts fresh.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';

export interface AgentPickerModalProps {
  /** When false, nothing renders. */
  open: boolean;
  /** Full agent list (search filters against this). */
  agents: RunSessionNode[];
  /** Currently-selected agent id (highlighted with accent ring). */
  selectedId: string;
  /** Fires when the user picks an agent. */
  onSelect: (id: string) => void;
  /** Fires when the user dismisses the modal (esc, backdrop, or click). */
  onClose: () => void;
}

type ChipState = 'running' | 'ok' | 'pending' | 'idle';
function deriveChipState(node: RunSessionNode): ChipState {
  switch (node.status) {
    case 'building': return 'running';
    case 'ready':    return 'ok';
    case 'pending':  return 'pending';
    default:         return 'idle';
  }
}

const STATE_LABEL: Record<ChipState, string> = {
  running: 'RUNNING',
  ok:      'READY',
  pending: 'WAITING',
  idle:    'IDLE',
};

export const AgentPickerModal: React.FC<AgentPickerModalProps> = ({
  open,
  agents,
  selectedId,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset search + highlight whenever the modal opens, and autofocus.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
      return;
    }
    // Seed highlight on the currently selected agent so ↵ on first keypress
    // is a no-op rather than "jump to first regardless of selection".
    const selIdx = agents.findIndex(a => a.id === selectedId);
    setHighlight(selIdx >= 0 ? selIdx : 0);
    // Defer focus to next frame so the input is mounted before .focus().
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(t);
  }, [open, agents, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a => a.title.toLowerCase().includes(q));
  }, [query, agents]);

  // Clamp highlight when filtered list shrinks.
  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(filtered.length > 0 ? filtered.length - 1 : 0);
    }
  }, [filtered.length, highlight]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[highlight] ?? filtered[0];
      if (pick) {
        onSelect(pick.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="选择 agent"
      data-testid="agent-picker-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340,
          padding: 12,
          borderRadius: 14,
          background: 'var(--t-bg-elev-1, #0C0C10)',
          border: '1px solid var(--t-border, #27272A)',
          boxShadow:
            '0 18px 44px -8px rgba(0,0,0,0.5), 0 2px 6px -2px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={13}
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--t-fg-5, #52525B)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="⌘K 搜索 agent…"
            data-testid="agent-picker-search"
            style={{
              width: '100%',
              padding: '8px 10px 8px 28px',
              borderRadius: 8,
              background: 'var(--t-bg-elev-2, #141414)',
              border: '1px solid var(--t-border, #27272A)',
              color: 'var(--t-fg, #FAFAFA)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: '20px 8px',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--t-fg-4, #71717A)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            无匹配 agent
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {filtered.map((agent, idx) => {
              const state = deriveChipState(agent);
              const isHover = idx === highlight;
              const isSelected = agent.id === selectedId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  data-testid="agent-picker-row"
                  data-role={agent.id}
                  data-highlight={isHover ? '1' : '0'}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => {
                    onSelect(agent.id);
                    onClose();
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '7px 8px',
                    borderRadius: 8,
                    border: `1px solid ${
                      isSelected
                        ? 'var(--t-accent, #A855F7)'
                        : isHover
                          ? 'var(--t-border-2, #3F3F46)'
                          : 'transparent'
                    }`,
                    background: isSelected
                      ? 'var(--t-accent-tint, rgba(168,85,247,0.14))'
                      : isHover
                        ? 'var(--t-bg-elev-3, #1A1A1A)'
                        : 'var(--t-bg-elev-2, #141414)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    color: 'var(--t-fg-2, #E4E4E7)',
                    minWidth: 0,
                    transition: 'background 120ms ease, border-color 120ms ease',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected
                        ? 'var(--t-accent-tint, rgba(168,85,247,0.14))'
                        : 'var(--t-bg-elev-3, #1A1A1A)',
                      color: isSelected
                        ? 'var(--t-accent-bright, #D8B4FE)'
                        : 'var(--t-fg-2, #E4E4E7)',
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontWeight: 700,
                      fontSize: 11,
                      border: `1px solid ${
                        isSelected
                          ? 'var(--t-accent, #A855F7)'
                          : 'var(--t-border, #27272A)'
                      }`,
                    }}
                  >
                    {agent.avatarChar || agent.title.charAt(0) || '?'}
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--t-fg, #FAFAFA)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.title}
                    </span>
                    {agent.sub && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                          fontSize: 9.5,
                          color: 'var(--t-fg-4, #71717A)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {agent.sub}
                      </span>
                    )}
                  </span>
                  <StatusPill state={state} />
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            paddingTop: 8,
            borderTop: '1px solid var(--t-border, #27272A)',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 9.5,
            color: 'var(--t-fg-5, #52525B)',
            textAlign: 'right',
            letterSpacing: '0.04em',
          }}
        >
          <Kbd>↑↓</Kbd> 移动 · <Kbd>↵</Kbd> 选中 · <Kbd>esc</Kbd> 关闭
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Local atoms
// ─────────────────────────────────────────────────────────────────────────────

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    style={{
      padding: '1px 5px',
      borderRadius: 3,
      background: 'var(--t-bg-elev-3, #1A1A1A)',
      border: '1px solid var(--t-border, #27272A)',
      color: 'var(--t-fg-3, #A1A1AA)',
      margin: '0 2px',
      fontFamily: 'inherit',
    }}
  >
    {children}
  </kbd>
);

const StatusPill: React.FC<{ state: ChipState }> = ({ state }) => {
  const color =
    state === 'running' ? 'var(--status-run, #3B82F6)'
    : state === 'ok'    ? 'var(--status-ok, #10B981)'
    : 'var(--t-fg-4, #71717A)';
  const border = state === 'pending'
    ? '1px dashed var(--t-border, #27272A)'
    : `1px solid ${color}`;
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 8.5,
        textTransform: 'uppercase',
        padding: '2px 6px',
        borderRadius: 999,
        background: 'transparent',
        color,
        border,
        letterSpacing: '0.04em',
        opacity: state === 'idle' ? 0.6 : 1,
      }}
    >
      {STATE_LABEL[state]}
    </span>
  );
};

export default AgentPickerModal;

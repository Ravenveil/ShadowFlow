/**
 * AgentRoster — compact horizontal rail matching v3 `.ag-sw` design
 * (run-session-v3.html lines ~543-620 and agent-section-card-redesign).
 *
 * 2026-05-20 — visual rewrite per user feedback (the previous version had
 * 48×48 squared chips with full Chinese names underneath, which doesn't
 * match the v3 design): each agent is now a 30×30 rounded-square mini
 * avatar showing ONE letter, status dot top-right, label moves to a
 * native tooltip. Selected avatar uses an accent tint + accent border.
 *
 * Status data-state map (kept from previous build, just rewired to v3
 * styling — the parent contract didn't change):
 *   building → 'running'   accent dot + halo ring
 *   ready    → 'ok'        green dot top-right
 *   pending  → 'pending'   dashed border + 0.55 opacity
 *   other    → 'idle'      faint, 0.42 opacity
 *
 * `selectedId` is scrolled into the rail's center via scrollIntoView
 * whenever it changes (preserved behavior, useful for keyboard nav).
 *
 * The `[+N ▾]` overflow chip is preserved — clicking still fires
 * `onOpenPicker`, so the existing AgentPickerModal (⌘K) handles search +
 * navigation. Only the rail visuals changed.
 */
import React, { useEffect, useRef } from 'react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';

export interface AgentRosterProps {
  agents: RunSessionNode[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenPicker: () => void;
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

const VISIBLE_BEFORE_OVERFLOW = 8;

export const AgentRoster: React.FC<AgentRosterProps> = ({
  agents,
  selectedId,
  onSelect,
  onOpenPicker,
}) => {
  const chipRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    const el = chipRefs.current.get(selectedId);
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      } catch { /* jsdom shim noop */ }
    }
  }, [selectedId]);

  const overflowCount = agents.length > VISIBLE_BEFORE_OVERFLOW
    ? agents.length - (VISIBLE_BEFORE_OVERFLOW - 1)
    : 0;

  return (
    <div
      data-testid="agent-roster"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px 6px 14px',
        width: '100%',
        boxSizing: 'border-box',
        borderBottom: '1px solid var(--t-border)',
      }}
    >
      <style>{rosterStyles}</style>

      <div className="sf-roster-rail">
        {agents.map((agent) => {
          const state = deriveChipState(agent);
          const isSelected = agent.id === selectedId;
          return (
            <button
              key={agent.id}
              type="button"
              ref={(el) => { chipRefs.current.set(agent.id, el); }}
              onClick={() => onSelect(agent.id)}
              title={`${agent.title}${agent.sub ? ` · ${agent.sub}` : ''} · ${state}`}
              data-st={state}
              data-selected={isSelected ? '1' : '0'}
              className={`sf-roster-av ${isSelected ? 'on' : ''}`}
            >
              {agent.avatarChar || agent.title.charAt(0) || '?'}
            </button>
          );
        })}
      </div>

      {overflowCount > 0 && (
        <button
          type="button"
          onClick={onOpenPicker}
          title="查看全部 agent · ⌘K"
          data-testid="agent-roster-overflow"
          className="sf-roster-more"
        >
          +{overflowCount}
          <span className="chev">▾</span>
        </button>
      )}
    </div>
  );
};

/* prettier-ignore */
const rosterStyles = `
.sf-roster-rail {
  display: flex; gap: 6px; align-items: center;
  overflow-x: auto; scroll-behavior: smooth; scroll-snap-type: x proximity;
  scrollbar-width: none; -ms-overflow-style: none;
  padding: 3px 14px 3px 3px;
  flex: 1; min-width: 0;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent 100%);
}
.sf-roster-rail::-webkit-scrollbar { display: none; }

.sf-roster-av {
  position: relative; flex: 0 0 auto;
  width: 30px; height: 30px; border-radius: 9px;
  background: var(--t-panel-2); border: 1.5px solid var(--t-border);
  color: var(--t-fg-3);
  font-family: var(--font-mono, ui-monospace, monospace); font-weight: 700; font-size: 11px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  scroll-snap-align: start;
  transition: background .14s, border-color .14s, color .14s, transform .12s;
  padding: 0;
}
.sf-roster-av:hover {
  background: var(--t-panel-3);
  color: var(--t-fg);
  transform: translateY(-1px);
}
.sf-roster-av:active { transform: scale(.92); }
.sf-roster-av.on {
  background: var(--t-accent-tint);
  border-color: var(--t-accent);
  color: var(--t-accent-bright);
}

/* status: running → accent dot + halo */
.sf-roster-av[data-st="running"]::before {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-accent);
  box-shadow: 0 0 0 2px var(--t-panel);
  z-index: 2;
}
.sf-roster-av[data-st="running"]::after {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-accent); pointer-events: none;
  transform-origin: center;
  animation: sfRosterHalo 1.6s ease-out infinite;
}
@keyframes sfRosterHalo {
  0%   { opacity: .55; transform: scale(1); }
  100% { opacity: 0;   transform: scale(3.2); }
}

/* status: ok → green dot */
.sf-roster-av[data-st="ok"]::before {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-ok);
  box-shadow: 0 0 0 2px var(--t-panel);
}

/* status: pending / idle */
.sf-roster-av[data-st="pending"] { opacity: .55; border-style: dashed; }
.sf-roster-av[data-st="idle"]    { opacity: .42; }
.sf-roster-av[data-st="idle"]:hover { opacity: .85; }

.sf-roster-more {
  flex: 0 0 auto;
  height: 30px; padding: 0 10px; border-radius: 9px;
  border: 1px dashed var(--t-border);
  background: transparent;
  color: var(--t-fg-4);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  transition: color .14s, border-color .14s, background .14s;
}
.sf-roster-more:hover {
  color: var(--t-fg);
  border-color: var(--t-fg-4);
  background: var(--t-panel-2);
}
.sf-roster-more .chev { font-size: 8px; opacity: .7; }
`;

export default AgentRoster;

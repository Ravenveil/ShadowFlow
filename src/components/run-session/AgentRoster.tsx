/**
 * AgentRoster — horizontal, scroll-snapping rail of agent avatars rendered
 * at the top of the right-pane Agent tab.
 *
 * Visual spec (negotiated with agent-1):
 *   ● Container ~80px tall: 48 avatar + 12 gap + 12 title + vertical padding
 *   ● Each chip is a 48×48 rounded square with the agent's `avatarChar`,
 *     plus the (truncated) title under it in 12px.
 *   ● Status ring around the avatar:
 *       'running' → spinning accent arc (sf-spin keyframe, 1.2s linear)
 *       'ready' / 'done' → 6px green dot pinned top-right (status-ok)
 *       'pending'        → dashed gray ring + reduced opacity
 *       other / undefined → faint solid gray ring
 *   ● Selected chip gets a 2px accent ring around the whole 48×48 frame.
 *   ● `scrollIntoView({ inline: 'center', behavior: 'smooth' })` is called
 *     on the chip matching `selectedId` whenever it changes — useEffect
 *     keyed on selectedId + a per-chip ref map.
 *   ● Right edge fades out via `mask-image` so chips beyond the viewport
 *     hint at overflow without a scrollbar.
 *   ● When `agents.length > 6`, a `[+N ▾]` overflow button trails the rail
 *     (N = agents.length - 5) and invokes `onOpenPicker()` when clicked.
 *
 * This component is presentational only — selection state lives in the
 * parent (agent-1's AgentPanel). The roster keeps no internal state.
 *
 * 2026-05-18 (agent-4) — sf-spin is now permanently defined in src/index.css
 * along with sf-pulse / sf-cur. The previous runtime <style> injection
 * (`ensureKeyframes`) has been removed.
 */
import React, { useEffect, useRef } from 'react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';

export interface AgentRosterProps {
  /** Full agent list, in display order. */
  agents: RunSessionNode[];
  /** Currently-selected agent id; chip gets the accent ring. */
  selectedId: string;
  /** Fires when the user clicks any agent chip. */
  onSelect: (id: string) => void;
  /** Fires when the user clicks the `[+N ▾]` overflow chip. */
  onOpenPicker: () => void;
}

type ChipState = 'running' | 'ok' | 'pending' | 'idle';
function deriveChipState(node: RunSessionNode): ChipState {
  // RunSessionNode.status is currently 'building' | 'ready' | 'pending'.
  // We treat 'building' as visually-running so the spinner is honest about
  // "this agent is mid-configuration", and 'ready' as the green-dot done
  // state. Anything else falls through to 'idle' (faint gray ring).
  switch (node.status) {
    case 'building':
      return 'running';
    case 'ready':
      return 'ok';
    case 'pending':
      return 'pending';
    default:
      return 'idle';
  }
}

const AVATAR_SIZE = 48;
const VISIBLE_BEFORE_OVERFLOW = 6;

export const AgentRoster: React.FC<AgentRosterProps> = ({
  agents,
  selectedId,
  onSelect,
  onOpenPicker,
}) => {
  // Map id → chip DOM ref so we can scrollIntoView on selection change.
  const chipRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (!selectedId) return;
    const node = chipRefs.current.get(selectedId);
    if (node && typeof node.scrollIntoView === 'function') {
      // Wrapped in try because jsdom (vitest) doesn't implement smooth
      // scrolling and may throw on the options arg in older shims.
      try {
        node.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      } catch {
        // no-op
      }
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
        alignItems: 'flex-start',
        gap: 8,
        height: 80,
        padding: '6px 4px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        // Horizontally-scrolling rail. Scrollbar is hidden via the inline
        // ::-webkit-scrollbar trick on a child <style> would be heavy —
        // instead we lean on `scrollbarWidth: 'none'` (FF) + the mask-image
        // edge fade to imply scroll affordance without chrome.
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          overflowX: 'auto',
          overflowY: 'hidden',
          flex: 1,
          minWidth: 0,
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          // FF: hide scrollbar
          scrollbarWidth: 'none',
          // Edge fade so chips spilling out hint at overflow.
          maskImage:
            'linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)',
          paddingRight: 12,
        }}
      >
        {agents.map((agent) => {
          const state = deriveChipState(agent);
          const isSelected = agent.id === selectedId;
          return (
            <button
              key={agent.id}
              type="button"
              ref={(el) => {
                chipRefs.current.set(agent.id, el);
              }}
              onClick={() => onSelect(agent.id)}
              title={`${agent.title}${agent.sub ? ` · ${agent.sub}` : ''}`}
              data-state={state}
              data-selected={isSelected ? '1' : '0'}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                scrollSnapAlign: 'center',
                width: 60,
                color: 'var(--t-fg-2, #E4E4E7)',
                fontFamily: 'inherit',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'relative',
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isSelected
                    ? 'var(--t-accent-tint, rgba(168,85,247,.14))'
                    : 'var(--t-bg-elev-2, #141414)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--t-accent, #A855F7)'
                      : 'var(--t-border, #27272A)'
                  }`,
                  color: isSelected
                    ? 'var(--t-accent-bright, #D8B4FE)'
                    : 'var(--t-fg-2, #E4E4E7)',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: '-0.01em',
                  opacity: state === 'idle' ? 0.55 : state === 'pending' ? 0.7 : 1,
                  transition:
                    'background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease',
                }}
              >
                {agent.avatarChar || agent.title.charAt(0) || '?'}
                {/* running: spinning accent arc */}
                {state === 'running' && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: -4,
                      borderRadius: 14,
                      border: '2px solid transparent',
                      borderTopColor: 'var(--t-accent, #A855F7)',
                      borderRightColor: 'var(--t-accent, #A855F7)',
                      animation: 'sf-spin 1.2s linear infinite',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {/* ok: green dot top-right */}
                {state === 'ok' && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--status-ok, #10B981)',
                      boxShadow: '0 0 0 2px var(--t-bg, #0A0A0A)',
                    }}
                  />
                )}
                {/* pending: dashed gray ring overlay */}
                {state === 'pending' && !isSelected && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: -3,
                      borderRadius: 13,
                      border: '1.5px dashed var(--t-border-2, #3F3F46)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.2,
                  maxWidth: 60,
                  textAlign: 'center',
                  color: isSelected
                    ? 'var(--t-fg, #FAFAFA)'
                    : 'var(--t-fg-3, #A1A1AA)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                {agent.title}
              </span>
            </button>
          );
        })}
      </div>

      {overflowCount > 0 && (
        <button
          type="button"
          onClick={onOpenPicker}
          title="查看全部 agent（⌘K）"
          data-testid="agent-roster-overflow"
          style={{
            flex: '0 0 auto',
            alignSelf: 'flex-start',
            marginTop: 8,
            height: AVATAR_SIZE,
            padding: '0 12px',
            borderRadius: 12,
            border: '1px dashed var(--t-border-2, #3F3F46)',
            background: 'transparent',
            color: 'var(--t-fg-3, #A1A1AA)',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition:
              'color 140ms ease, border-color 140ms ease, background 140ms ease',
          }}
        >
          <span>+{overflowCount}</span>
          <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
        </button>
      )}
    </div>
  );
};

export default AgentRoster;

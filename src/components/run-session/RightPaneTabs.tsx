/**
 * RightPaneTabs — shell for the four right-pane tabs (Overview / Team /
 * Agent / Preview) used by RunSessionPage. The shell owns:
 *
 *   - toolbar row:  FollowChip slot (left) + tab button group (right)
 *   - followed-tab indicator dot pulsing in the upper-right corner
 *   - content area that renders the panel matching `activeTab`
 *
 * Panel implementations are passed in via the `panels` prop so agent-1 /
 * agent-2 / agent-3 can drop their own implementations without touching
 * this shell. The shell does NOT mock any data.
 *
 * Layout / tokens follow design-spec run-session-v2.html `.toolbar-v2 +
 * .pane-tabs`. We reuse var(--t-*) tokens for theme parity and the
 * existing sf-pulse keyframe for live indicators.
 */
import React from 'react';

export type TabId = 'overview' | 'team' | 'agent' | 'preview';

export interface RightPaneTabsProps {
  /** Currently visible tab. */
  activeTab: TabId;
  /** Fired when the user clicks a tab button. Parent decides whether the
   *  click also flips follow mode to 'locked' (typically yes — see
   *  useFollowMode.setActiveTab). */
  onTabChange: (tab: TabId) => void;
  /** Optional follow chip rendered at the left of the toolbar. Pass
   *  <FollowChip ... /> from useFollowMode. */
  followChip?: React.ReactNode;
  /**
   * Which tab the live run step is currently mapped to. The matching tab
   * button shows a pulsing dot in its top-right corner. Pass null when
   * follow mode is locked or no step maps to a tab.
   */
  followedTab?: TabId | null;
  /** Panel renderers — one per tab. Required so the shell knows what to
   *  draw inside the content area for each tab. */
  panels: Record<TabId, React.ReactNode>;
}

const TAB_DEFS: { key: TabId; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'team', label: 'Team' },
  { key: 'agent', label: 'Agent' },
  { key: 'preview', label: 'Preview' },
];

export function RightPaneTabs({
  activeTab,
  onTabChange,
  followChip,
  followedTab,
  panels,
}: RightPaneTabsProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Toolbar — left: follow chip, right: tab button group */}
      <div
        className="rs-pane-tabs-toolbar"
        style={{
          height: 44,
          background: 'var(--t-panel)',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 14px',
          flexShrink: 0,
        }}
      >
        {followChip && <div style={{ display: 'flex', alignItems: 'center' }}>{followChip}</div>}

        <div
          role="tablist"
          aria-label="Run session right pane tabs"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {TAB_DEFS.map(({ key, label }) => {
            const isActive = activeTab === key;
            const isFollowed = followedTab === key;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={isActive}
                data-tab={key}
                data-followed={isFollowed ? '1' : undefined}
                onClick={() => onTabChange(key)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 28,
                  padding: '0 12px',
                  borderRadius: 6,
                  background: isActive ? 'var(--t-bg)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--t-border)' : 'transparent'}`,
                  color: isActive ? 'var(--t-fg)' : 'var(--t-fg-3)',
                  fontFamily: 'inherit',
                  fontSize: 11.5,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                }}
              >
                {label}
                {isFollowed && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 3,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'currentColor',
                      color: 'var(--t-accent)',
                      boxShadow: '0 0 0 2px var(--t-panel)',
                      animation: 'sf-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area — only the active panel is rendered (no display:none
          juggling) so stubs stay simple and so agent-1/2/3 don't need to
          guard their own mount logic. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          data-tab={activeTab}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {panels[activeTab]}
        </div>
      </div>
    </section>
  );
}

export default RightPaneTabs;

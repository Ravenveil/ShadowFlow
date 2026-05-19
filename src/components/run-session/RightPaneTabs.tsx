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

export type RunPillStatus = 'building' | 'done' | 'error';

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
  /** Run title shown in the toolbar between the chip and the tab buttons
   *  (e.g. "run_54cc04ef-…"). Truncated with ellipsis when narrow. */
  runTitle?: string;
  /** Status pill shown next to the run title. */
  runStatus?: RunPillStatus;
  /** Optional per-tab count badge (mirrors design `<span class="ct">N</span>`).
   *  Renders only when the value is > 0. */
  tabCounts?: Partial<Record<TabId, number>>;
}

const PILL_TEXT: Record<RunPillStatus, string> = {
  building: '构建中',
  done: '已完成',
  error: '出错',
};

const PILL_BG: Record<RunPillStatus, string> = {
  building: 'var(--t-accent)',
  done: 'var(--t-ok, #16a34a)',
  error: 'var(--t-warn, #dc2626)',
};

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
  runTitle,
  runStatus,
  tabCounts,
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

        {/* Run title + status pill — task spec Item 8. Centered/left-grouped
            between the chip and the tab strip. Truncates with ellipsis so a
            long run id never pushes the tabs off-screen. */}
        {(runTitle || runStatus) && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {runTitle && (
              <span
                title={runTitle}
                style={{
                  fontFamily: 'var(--t-mono, ui-monospace, "SF Mono", Menlo, monospace)',
                  fontSize: 11.5,
                  color: 'var(--t-fg-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 220,
                }}
              >
                {runTitle}
              </span>
            )}
            {runStatus && (
              <span
                data-status={runStatus}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 8px',
                  borderRadius: 10,
                  background: PILL_BG[runStatus],
                  color: 'var(--t-accent-ink, #fff)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                {PILL_TEXT[runStatus]}
              </span>
            )}
          </div>
        )}

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
            const count = tabCounts?.[key];
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
                  gap: 5,
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
                {typeof count === 'number' && count > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                      height: 14,
                      padding: '0 5px',
                      borderRadius: 7,
                      background: isActive
                        ? 'var(--t-accent-tint, rgba(168,85,247,.14))'
                        : 'var(--t-panel-3, var(--bg-elev-3))',
                      color: isActive ? 'var(--t-accent, #A855F7)' : 'var(--t-fg-4)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 9.5,
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                )}
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

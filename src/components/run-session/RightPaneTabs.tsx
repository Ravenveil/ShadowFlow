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
  onTabChange: (tab: TabId) => void;
  /** Optional follow chip rendered at the left of the toolbar. */
  followChip?: React.ReactNode;
  followedTab?: TabId | null;
  panels: Record<TabId, React.ReactNode>;
  /** 2026-05-20 — runTitle / runStatus 字段保留但不再在 toolbar 渲染。
   *  v3 设计稿把 run id + 状态 pill 放在左 pane 的 Run Session header，
   *  右 pane toolbar 只放 follow chip + tabs + Blueprint。
   *  保留 prop 名兼容现有 RunSessionPage 调用，避免回归 props 删除。 */
  runTitle?: string;
  runStatus?: RunPillStatus;
  tabCounts?: Partial<Record<TabId, number>>;
  /** v3 toolbar 右端的 Blueprint file tag — 显示当前 run 产出的 artifact 文件名。 */
  blueprintFilename?: string | null;
}

// PILL_TEXT / PILL_BG retained for back-compat in case another caller imports
// the same status semantics; not used in the new underline-style toolbar.
// (Kept un-exported & unused-tolerant via `void` reference below.)
const _PILL_TEXT: Record<RunPillStatus, string> = {
  building: '构建中',
  done: '已完成',
  error: '出错',
};
void _PILL_TEXT;

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
  runTitle: _runTitle,
  runStatus: _runStatus,
  tabCounts,
  blueprintFilename,
}: RightPaneTabsProps) {
  // 2026-05-20 — runTitle / runStatus 不再渲染（v3 设计稿把它们放在左 pane header）。
  // 显式 void 标记给 lint/读代码的人看，避免被当成 bug 删掉。
  void _runTitle; void _runStatus;
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
      {/* Toolbar — v3 design: [follow chip] [sep] [tabs underline] [...] [Blueprint] */}
      <style>{toolbarStyles}</style>
      <div className="rs-toolbar">
        {followChip && <div className="rs-toolbar-l">{followChip}</div>}
        <div className="rs-toolbar-sep" />

        <div role="tablist" aria-label="Run session right pane tabs" className="rs-tabs">
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
                className={`rs-tab ${isActive ? 'on' : ''}`}
                onClick={() => onTabChange(key)}
              >
                {label}
                {typeof count === 'number' && count > 0 && (
                  <span className="rs-tab-ct">{count}</span>
                )}
                {isFollowed && <span aria-hidden className="rs-tab-dot" />}
              </button>
            );
          })}
        </div>

        {blueprintFilename && (
          <div className="rs-toolbar-r" title={blueprintFilename}>
            <span className="rs-bp-lbl">Blueprint</span>
            <span className="rs-bp-id">{blueprintFilename}</span>
          </div>
        )}
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

/* prettier-ignore */
const toolbarStyles = `
.rs-toolbar {
  display: flex; align-items: stretch;
  height: 44px;
  background: var(--t-panel);
  border-bottom: 1px solid var(--t-border);
  padding: 0 14px;
  flex-shrink: 0;
}
.rs-toolbar-l { display: flex; align-items: center; padding-right: 10px; }
.rs-toolbar-sep {
  width: 1px; align-self: center; height: 18px;
  background: var(--t-border);
  margin: 0 6px 0 4px;
}
.rs-tabs { display: inline-flex; align-items: stretch; gap: 0; }
.rs-tab {
  position: relative;
  display: inline-flex; align-items: center; gap: 6px;
  height: 44px; padding: 0 14px;
  border: none; background: none; cursor: pointer;
  font-family: inherit; font-size: 11.5px;
  color: var(--t-fg-4);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color .12s ease, border-color .12s ease;
}
.rs-tab:hover:not(.on) { color: var(--t-fg-2); }
.rs-tab.on { color: var(--t-fg); border-bottom-color: var(--t-accent); font-weight: 600; }
.rs-tab-ct {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  padding: 1px 5px; border-radius: 4px;
  background: var(--t-panel-3, var(--t-bg-elev-3));
  color: var(--t-fg-4);
}
.rs-tab.on .rs-tab-ct {
  background: var(--t-accent-tint);
  color: var(--t-accent);
}
.rs-tab-dot {
  position: absolute; top: 6px; right: 6px;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--t-accent);
  box-shadow: 0 0 0 2px var(--t-panel);
  animation: sf-pulse 1.4s ease-in-out infinite;
}

.rs-toolbar-r {
  margin-left: auto;
  align-self: center;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 6px;
  background: var(--t-panel-2);
  border: 1px solid var(--t-border);
  font-size: 10.5px;
  max-width: 280px;
  min-width: 0;
}
.rs-bp-lbl {
  font-family: var(--font-mono, monospace);
  font-size: 9px; font-weight: 700;
  letter-spacing: .14em; text-transform: uppercase;
  color: var(--t-fg-4);
  flex: none;
}
.rs-bp-id {
  font-family: var(--font-mono, monospace);
  font-size: 11px; color: var(--t-fg-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
`;

export default RightPaneTabs;

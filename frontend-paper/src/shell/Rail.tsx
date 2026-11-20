/**
 * Rail — 第一栏：全局导航。文案见 `content/app.ts` 的 RAIL，只负责布局与选中态。
 */
import { RAIL } from '../content/app';
import { IconBook, IconChat, IconClock, IconFolder, IconGrid, IconSettings, IconUsers } from './icons';

/** 导航图标按 id 注册；新增一项 = 这里加一行 + content 里加一项。 */
const NAV_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  chat: IconChat,
  team: IconUsers,
  kb: IconBook,
  dash: IconGrid,
  project: IconFolder,
  cron: IconClock,
};

/** 默认选中的导航项（真接口接入后由路由决定）。 */
const ACTIVE_ID = 'chat';

export function Rail({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <aside className="rail">
      <div className="rail-brand">
        <span className="rail-logo">
          <i />
          <i />
          <i />
        </span>
        <span className="rail-brand-name">{RAIL.brand}</span>
      </div>

      <nav className="rail-nav">
        {RAIL.nav.map(({ id, label, badge }) => {
          const Icon = NAV_ICON[id] ?? IconChat;
          return (
            <button key={id} className="rail-nav-item" data-active={id === ACTIVE_ID ? 'true' : undefined}>
              <Icon size={15} />
              <span>{label}</span>
              {badge ? <i className="rail-nav-badge">{badge}</i> : null}
            </button>
          );
        })}
      </nav>

      <div className="rail-group">
        <div className="rail-group-title">{RAIL.workspaceTitle}</div>
        {RAIL.workspace.map(({ id, label }) => {
          const Icon = NAV_ICON[id] ?? IconFolder;
          return (
            <button key={id} className="rail-nav-item">
              <Icon size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="rail-foot">
        <button className="rail-nav-item rail-settings" onClick={onOpenSettings}>
          <IconSettings size={15} />
          <span>{RAIL.settings}</span>
        </button>
      </div>
    </aside>
  );
}

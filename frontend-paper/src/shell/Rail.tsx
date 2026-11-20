import {
  IconBook,
  IconChat,
  IconClock,
  IconFolder,
  IconGrid,
  IconSettings,
  IconUsers,
} from './icons';

const NAV = [
  { id: 'chat', label: '对话', Icon: IconChat, badge: null },
  { id: 'team', label: 'Agent 团队', Icon: IconUsers, badge: '4' },
  { id: 'kb', label: '知识库', Icon: IconBook, badge: null },
  { id: 'dash', label: '数据看板', Icon: IconGrid, badge: null },
];

const WORKSPACE = [
  { id: 'project', label: '项目', Icon: IconFolder },
  { id: 'cron', label: '定时任务', Icon: IconClock },
];

/** 第一栏：全局导航（对应设计稿 Rail）。 */
export function Rail({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <aside className="rail">
      <div className="rail-brand">
        <span className="rail-logo">
          <i />
          <i />
          <i />
        </span>
        <span className="rail-brand-name">ShadowFlow</span>
      </div>

      <nav className="rail-nav">
        {NAV.map(({ id, label, Icon, badge }, i) => (
          <button key={id} className="rail-nav-item" data-active={i === 0 ? 'true' : undefined}>
            <Icon size={15} />
            <span>{label}</span>
            {badge ? <i className="rail-nav-badge">{badge}</i> : null}
          </button>
        ))}
      </nav>

      <div className="rail-group">
        <div className="rail-group-title">工作空间</div>
        {WORKSPACE.map(({ id, label, Icon }) => (
          <button key={id} className="rail-nav-item">
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="rail-foot">
        <button className="rail-nav-item rail-settings" onClick={onOpenSettings}>
          <IconSettings size={15} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

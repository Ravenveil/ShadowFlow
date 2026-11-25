/**
 * Rail — 第一栏：全局导航。文案见 `content/app.ts` 的 RAIL，只负责布局与选中态。
 *
 * 品牌区同时是「回首页」入口（2026-11-24 用户需求：删掉浮层透明按钮，
 * 点左上角品牌回落地页）。
 */
import { CHAT, RAIL } from '@/shared/content/app';
import {
  IconBrain,
  IconChat,
  IconClock,
  IconFolder,
  IconLibrary,
  IconNews,
  IconServer,
  IconSettings,
  IconUsers,
} from '@/shared/ui/icons';

/** 导航视图 id（与 Shell 的 ViewId 对齐）。 */
export type ViewId = string;

/** 导航图标按 id 注册；新增一项 = 这里加一行 + content 里加一项。 */
const NAV_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  chat: IconChat,
  team: IconUsers,
  soul: IconBrain,
  kb: IconLibrary,
  cron: IconClock,
  news: IconNews,
  project: IconFolder,
  host: IconServer,
  files: IconFolder,
};

export function Rail({
  onOpenSettings,
  onHome,
  activeView = 'chat',
  onNavigate,
}: {
  onOpenSettings: () => void;
  onHome: () => void;
  activeView?: ViewId;
  onNavigate: (id: ViewId) => void;
}) {
  return (
    <aside className="rail">
      <button className="rail-brand" onClick={onHome} title={CHAT.backHome} aria-label={CHAT.backHome}>
        <span className="rail-logo">
          <i />
          <i />
          <i />
        </span>
        <span className="rail-brand-name">{RAIL.brand}</span>
      </button>

      <nav className="rail-nav">
        {RAIL.nav.map(({ id, label }) => {
          const Icon = NAV_ICON[id] ?? IconChat;
          return (
            <button
              key={id}
              className="rail-nav-item"
              data-active={id === activeView ? 'true' : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="rail-group">
        <div className="rail-group-title">{RAIL.workspaceTitle}</div>
        {RAIL.workspace.map(({ id, label }) => {
          const Icon = NAV_ICON[id] ?? IconFolder;
          return (
            <button
              key={id}
              className="rail-nav-item"
              data-active={id === activeView ? 'true' : undefined}
              onClick={() => onNavigate(id)}
            >
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

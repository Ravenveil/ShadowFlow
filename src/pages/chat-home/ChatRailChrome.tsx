/**
 * ChatRailChrome — M3b 侧边栏合并（三栏融合）。
 *
 * /chat 路由下全局 HfSidebar 隐藏（HfLayout），聊天列表栏升格为唯一侧边栏：
 *   - ChatRailHeader：顶部「个人 | 团队」切换（从 HfSidebar 顶部迁来，同一交互）
 *   - ChatRailFooter：底部图标行（开始/团队/员工/日历/项目/设置 + ⌘K 搜索）
 *     ——全局导航的低频去向，路由全部保留（UI 保护规则：只能加不能删）。
 *
 * 团队态包 InboxPanelFB、个人态包助手列表，两边复用同一对 header/footer。
 */
import { Link, useNavigate } from 'react-router-dom';
import { Home, Users, Bot, CalendarDays, Folder, Search, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Settings as HfSettingsIcon } from '../../common/icons/iconRegistry';
import { openQuickSwitcher } from '../../components/hifi/QuickSwitcher';
import { PersonalTeamToggle, type ChatHomeView } from './PersonalTeamToggle';

export function ChatRailHeader({ view, bordered = false }: { view: ChatHomeView; bordered?: boolean }) {
  const navigate = useNavigate();
  const goChatView = (v: ChatHomeView) =>
    navigate(v === 'personal' ? '/chat?view=personal' : '/chat');
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '10px 10px 8px',
        borderBottom: '1px solid var(--t-border)',
        // 团队态包 InboxPanelFB（自带右边框）时需补齐 header 段的右边框；
        // 个人态外层列已有 borderRight，传 false 避免双线。
        borderRight: bordered ? '1px solid var(--t-border)' : undefined,
        background: 'var(--t-panel)',
        display: 'flex',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PersonalTeamToggle view={view} onChange={goChatView} />
        {/* M3c start 吸收 — 团队态「+ 新任务」：goal → run-session 的聊天内入口。
            个人态列表区已有「+ 新员工」，不重复放。 */}
        {view === 'team' && (
          <button
            type="button"
            data-testid="chatrail-newtask"
            onClick={() => navigate('/chat?new=1')}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--t-accent)',
              color: 'var(--t-accent-ink)',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Plus size={15} aria-hidden /> 新任务
          </button>
        )}
      </div>
    </div>
  );
}

interface FooterItem {
  key: string;
  Icon: LucideIcon;
  label: string;
  to: string;
}

const FOOTER_ITEMS: FooterItem[] = [
  { key: 'start', Icon: Home, label: '开始', to: '/start' },
  { key: 'teams', Icon: Users, label: '团队', to: '/teams' },
  { key: 'agents', Icon: Bot, label: '员工', to: '/agents' },
  { key: 'calendar', Icon: CalendarDays, label: '日历', to: '/calendar' },
  { key: 'projects', Icon: Folder, label: '项目', to: '/projects' },
];

export function ChatRailFooter({ bordered = false }: { bordered?: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 2,
        padding: '6px 8px',
        borderTop: '1px solid var(--t-border)',
        borderRight: bordered ? '1px solid var(--t-border)' : undefined,
        background: 'var(--t-panel)',
      }}
    >
      <button
        type="button"
        title="搜索 ⌘K"
        aria-label="搜索"
        onClick={openQuickSwitcher}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 7,
          borderRadius: 7,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: 'var(--t-fg-4)',
        }}
      >
        <Search size={15} strokeWidth={1.75} aria-hidden />
      </button>
      {FOOTER_ITEMS.map(({ key, Icon, label, to }) => (
        <Link
          key={key}
          to={to}
          title={label}
          aria-label={label}
          data-testid={`chatrail-${key}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 7,
            borderRadius: 7,
            color: 'var(--t-fg-4)',
            textDecoration: 'none',
          }}
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden />
        </Link>
      ))}
      <Link
        to="/settings"
        title="设置 ⌘,"
        aria-label="设置"
        data-testid="chatrail-settings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 7,
          borderRadius: 7,
          color: 'var(--t-fg-4)',
          textDecoration: 'none',
        }}
      >
        <HfSettingsIcon size={15} strokeWidth={1.75} />
      </Link>
    </div>
  );
}

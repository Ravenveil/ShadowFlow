/**
 * ChatRailChrome — M3b/M3d 侧边栏合并（三栏融合）。
 *
 * /chat 路由下全局 HfSidebar 隐藏（HfLayout），聊天列表栏升格为唯一侧边栏：
 *   - ChatRail：容器（M3d 可收起——clawsgo/VSCode 式，收起成 48px 窄条，
 *     宽度 transition 丝滑过渡；收起状态 localStorage 持久化并通过
 *     onCollapsedChange 通知父级做「左收起↔右展开」互斥联动）
 *   - ChatRailHeader：顶部「个人 | 团队」切换 + 团队态「+ 新任务」+ 收起按钮
 *   - ChatRailFooter：底部图标行（开始/团队/员工/日历/项目/设置 + ⌘K 搜索）
 *     ——全局导航的低频去向，路由全部保留（UI 保护规则：只能加不能删）。
 *
 * 团队态包 InboxPanelFB、个人态包助手列表，两边复用同一套 chrome。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Home, Users, Bot, CalendarDays, Folder, Search, Plus,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Settings as HfSettingsIcon } from '../../common/icons/iconRegistry';
import { openQuickSwitcher } from '../../components/hifi/QuickSwitcher';
import { PersonalTeamToggle, type ChatHomeView } from './PersonalTeamToggle';

const RAIL_COLLAPSED_KEY = 'sf.chat.railCollapsed';

const iconBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 7,
  borderRadius: 7,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--t-fg-4)',
  textDecoration: 'none',
};

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

export function ChatRailHeader({
  view,
  bordered = false,
  onCollapse,
}: {
  view: ChatHomeView;
  bordered?: boolean;
  /** M3d — 传入则在切换行右侧渲染收起按钮。 */
  onCollapse?: () => void;
}) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <PersonalTeamToggle view={view} onChange={goChatView} />
          </div>
          {onCollapse && (
            <button
              type="button"
              aria-label="收起侧边栏"
              title="收起侧边栏"
              data-testid="chatrail-collapse"
              onClick={onCollapse}
              style={{ ...iconBtnStyle, padding: 4, flexShrink: 0 }}
            >
              <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
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
      <button type="button" title="搜索 ⌘K" aria-label="搜索" onClick={openQuickSwitcher} style={iconBtnStyle}>
        <Search size={15} strokeWidth={1.75} aria-hidden />
      </button>
      {FOOTER_ITEMS.map(({ key, Icon, label, to }) => (
        <Link key={key} to={to} title={label} aria-label={label} data-testid={`chatrail-${key}`} style={iconBtnStyle}>
          <Icon size={15} strokeWidth={1.75} aria-hidden />
        </Link>
      ))}
      <Link to="/settings" title="设置 ⌘," aria-label="设置" data-testid="chatrail-settings" style={iconBtnStyle}>
        <HfSettingsIcon size={15} strokeWidth={1.75} />
      </Link>
    </div>
  );
}

/**
 * ChatRail — M3d 可收起容器。展开 = header + children(列表区) + footer；
 * 收起 = 48px 窄条（展开按钮 + compact 个人/团队切换 + 竖排低频导航）。
 * 收起状态持久化到 localStorage，并经 onCollapsedChange 通知父级
 * 做「左栏收起 ↔ 右栏展开」互斥联动（clawsgo/VSCode 式）。
 */
export function ChatRail({
  view,
  width,
  bordered = false,
  containerStyle,
  onCollapsedChange,
  children,
}: {
  view: ChatHomeView;
  /** 展开态宽度（团队 296 对齐 InboxPanelFB / 个人 264）——定宽才能做 width transition。 */
  width: number;
  bordered?: boolean;
  containerStyle?: CSSProperties;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    onCollapsedChange?.(collapsed);
    // onCollapsedChange 引用变化不重触发——只在 collapsed 实际变化时通知
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用就只用内存态
      }
      return next;
    });

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        width: collapsed ? 48 : width,
        transition: 'width 200ms ease',
        overflow: 'hidden',
        ...(collapsed
          ? { borderRight: '1px solid var(--t-border)', background: 'var(--t-panel)' }
          : containerStyle),
      }}
    >
      {collapsed ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px' }}>
          <button
            type="button"
            aria-label="展开侧边栏"
            title="展开侧边栏"
            data-testid="chatrail-expand"
            onClick={toggle}
            style={iconBtnStyle}
          >
            <PanelLeftOpen size={15} strokeWidth={1.75} aria-hidden />
          </button>
          <div style={{ width: '100%', marginTop: 4 }}>
            <PersonalTeamToggle
              view={view}
              onChange={(v) => navigate(v === 'personal' ? '/chat?view=personal' : '/chat')}
              compact
            />
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" title="搜索 ⌘K" aria-label="搜索" onClick={openQuickSwitcher} style={iconBtnStyle}>
            <Search size={15} strokeWidth={1.75} aria-hidden />
          </button>
          {FOOTER_ITEMS.map(({ key, Icon, label, to }) => (
            <Link key={key} to={to} title={label} aria-label={label} data-testid={`chatrail-${key}`} style={iconBtnStyle}>
              <Icon size={15} strokeWidth={1.75} aria-hidden />
            </Link>
          ))}
          <Link to="/settings" title="设置 ⌘," aria-label="设置" data-testid="chatrail-settings" style={iconBtnStyle}>
            <HfSettingsIcon size={15} strokeWidth={1.75} />
          </Link>
        </div>
      ) : (
        <>
          <ChatRailHeader view={view} bordered={bordered} onCollapse={toggle} />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
          <ChatRailFooter bordered={bordered} />
        </>
      )}
    </div>
  );
}

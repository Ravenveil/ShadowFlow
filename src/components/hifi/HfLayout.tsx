/**
 * Hi-Fi v2 Layout — wraps an `<Outlet />` with the 220px sidebar rail.
 *
 * Pages that render their own HfTopBar (AgentPage, TeamPage, SettingsPage …)
 * supply per-route right-slot actions and own their workspace crumb.
 *
 * Pages that don't render HfTopBar (ChatPage, CalendarPage, ProjectsPage …)
 * receive a default HfTopBar injected here so the workspace crumb is always
 * visible. Excluded: /start (cross-workspace by definition) and /templates
 * (design decision — workspace context isn't meaningful there).
 */
import { Outlet, useLocation } from 'react-router-dom';
import { HfSidebar, type HfSidebarActive } from './HfSidebar';
import { HfTopBar } from './HfTopBar';
import { useTheme } from './useTheme';
import { PetRail } from '../../core/components/pet/PetRail';
import { QuickSwitcher } from './QuickSwitcher';

function pathToActive(pathname: string): HfSidebarActive {
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/agent-dm')) return 'chat';
  if (pathname.startsWith('/teams')) return 'teams';
  if (pathname.startsWith('/agents')) return 'agents';
  if (pathname.startsWith('/templates')) return 'templates';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/run-session')) return 'start';
  if (pathname.startsWith('/projects')) return 'projects';
  return 'start';
}

// Pages without their own HfTopBar — layout provides the workspace crumb.
const LAYOUT_TOPBAR_PREFIXES = [
  '/chat', '/agent-dm', '/calendar', '/inbox', '/editor',
  '/knowledge', '/evals', '/builder', '/catalog',
  '/run-session', '/projects', '/memory',
];

export function HfLayout() {
  useTheme();
  const { pathname } = useLocation();
  const active = pathToActive(pathname);
  const needsLayoutTopBar = LAYOUT_TOPBAR_PREFIXES.some(p => pathname.startsWith(p));
  // M3b 侧边栏合并（三栏融合）：/chat 下聊天列表栏升格为唯一侧边栏
  // （ChatRailChrome 承载 个人/团队切换 + 低频导航），全局 HfSidebar 不再渲染。
  // 其余页面保持原全局侧边栏不变。
  // PagePeekOverlay 以同源 iframe 弹出 /teams /agents 原页面——iframe 环境下
  // 同样隐藏全局侧边栏/宠物栏，只留页面本体（任何内部跳转都保持）。
  const embedded = typeof window !== 'undefined' && window.self !== window.top;
  const hideSidebar = pathname.startsWith('/chat') || embedded;

  // zoom-shell:height 抵消全局 --app-zoom,放大后内容不超物理视口(见 index.css)。
  return (
    <div className="hf-root zoom-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {!hideSidebar && <HfSidebar active={active} />}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {needsLayoutTopBar && <HfTopBar />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          <Outlet />
        </div>
        {!embedded && <PetRail />}
      </main>
      <QuickSwitcher />
    </div>
  );
}

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
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { HfTopBar } from './HfTopBar';
import { useTheme } from './useTheme';
import { PetRail } from '../../core/components/pet/PetRail';
import { QuickSwitcher } from './QuickSwitcher';
import { ChatRail } from '../../pages/chat-home/ChatRailChrome';
import { SidebarSlotProvider, SidebarSlotMount } from '../../pages/chat-home/SidebarSlotContext';

// Pages without their own HfTopBar — layout provides the workspace crumb.
const LAYOUT_TOPBAR_PREFIXES = [
  '/chat', '/agent-dm', '/calendar', '/inbox', '/editor',
  '/knowledge', '/evals', '/builder', '/catalog',
  '/run-session', '/projects', '/memory',
];

// 2026-06-23 统一侧栏（路B）：恒定宽度——个人/团队/非 chat 同宽，切换不跳。
const SIDEBAR_W = 288;

export function HfLayout() {
  useTheme();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const needsLayoutTopBar = LAYOUT_TOPBAR_PREFIXES.some(p => pathname.startsWith(p));
  // PagePeekOverlay 以同源 iframe 弹出原页面——iframe 内隐藏侧栏/宠物栏，只留页面本体。
  const embedded = typeof window !== 'undefined' && window.self !== window.top;

  // 全站统一侧栏：HfLayout 渲染唯一一条 ChatRail（常驻、不随路由重挂 → 纹丝不动）。
  // 列表内容由聊天页通过 SidebarSlot portal 注入（个人=助手列表/团队=收件箱）；
  // 非 chat 页槽为空。view 仅在 /chat 时按 ?view= 区分，其余固定 team（导航组照常）。
  const railView: 'personal' | 'team' =
    pathname.startsWith('/chat') && searchParams.get('view') === 'personal' ? 'personal' : 'team';

  // zoom-shell:height 抵消全局 --app-zoom,放大后内容不超物理视口(见 index.css)。
  return (
    <div className="hf-root zoom-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SidebarSlotProvider>
        {!embedded && (
          <ChatRail
            view={railView}
            width={SIDEBAR_W}
            containerStyle={{ borderRight: '1px solid var(--t-border)', background: 'var(--t-panel)' }}
          >
            <SidebarSlotMount />
          </ChatRail>
        )}
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
      </SidebarSlotProvider>
    </div>
  );
}

/**
 * Hi-Fi v2 Layout — wraps an `<Outlet />` with the 220px sidebar rail.
 *
 * Pages render their own `HfTopBar` so they can supply per-route crumbs
 * and right-slot actions. This layout only owns the sidebar shell and
 * theme installation (`useTheme` writes `data-theme` on documentElement).
 */
import { Outlet, useLocation } from 'react-router-dom';
import { HfSidebar, type HfSidebarActive } from './HfSidebar';
import { useTheme } from './useTheme';
import { PetRail } from '../../core/components/pet/PetRail';
import { QuickSwitcher } from './QuickSwitcher';

function pathToActive(pathname: string): HfSidebarActive {
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/teams')) return 'teams';
  if (pathname.startsWith('/agents')) return 'agents';
  if (pathname.startsWith('/templates')) return 'templates';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/run-session')) return 'start';
  if (pathname.startsWith('/projects')) return 'projects';
  return 'start';
}

export function HfLayout() {
  // Side-effect: installs `data-theme` on documentElement.
  useTheme();
  const { pathname } = useLocation();
  const active = pathToActive(pathname);

  return (
    <div className="hf-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <HfSidebar active={active} />
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        <Outlet />
        <PetRail />
      </main>
      <QuickSwitcher />
    </div>
  );
}

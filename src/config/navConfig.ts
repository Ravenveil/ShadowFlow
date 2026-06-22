/**
 * navConfig — 单一导航真相源（对标 Hermes web `NavItem[]`）。
 *
 * 背景（2026-06-22 侧栏统一，见 docs/design/sidebar-unification-2026-06-22.md）：
 * 此前导航散在四处各写一份——HfSidebar.NAV_ITEMS / ChatRail.FOOTER_ITEMS /
 * QuickSwitcher / NarrowNav——导致「同一个图标去不同地方」的分叉 + i18n 写死中文。
 * 这里收敛成一份：路由 + i18n key + 图标在同一条记录里，谁渲染谁取这份。
 *
 * 规则（同 Hermes）：
 *   - 文案一律走 `labelKey` → t(labelKey)，禁止在组件里写死中文。
 *   - 一个 key 只对应一个 `to`，消除「同图标两去处」。
 *
 * 迁移状态：ChatRail（顶部导航组 + 收起态竖排）已接入；HfSidebar / QuickSwitcher /
 * NarrowNav 逐步迁来同一份（批2/批3）。
 */
import { Plus, Inbox, Users, Bot, CalendarDays, Folder } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavEntry {
  key: string;
  /** i18n key — UI 用 t(labelKey) 取文案。 */
  labelKey: string;
  Icon: LucideIcon;
  to: string;
}

/**
 * 主导航（聊天优先产品的克制集）。顺序即展示顺序。
 * 「新建任务」收口到 /chat?new=1（聊天内新任务），替代旧的 /start「开始」入口。
 */
export const PRIMARY_NAV: NavEntry[] = [
  { key: 'newtask',  labelKey: 'shell.navNewTask',  Icon: Plus,         to: '/chat?new=1' },
  { key: 'inbox',    labelKey: 'shell.navInbox',    Icon: Inbox,        to: '/inbox' },
  { key: 'teams',    labelKey: 'shell.navTeams',    Icon: Users,        to: '/teams' },
  { key: 'agents',   labelKey: 'shell.navAgents',   Icon: Bot,          to: '/agents' },
  { key: 'calendar', labelKey: 'shell.navCalendar', Icon: CalendarDays, to: '/calendar' },
  { key: 'projects', labelKey: 'shell.navProjects', Icon: Folder,       to: '/projects' },
];

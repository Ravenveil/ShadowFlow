/**
 * EmbeddedPage — 把「整页级」组件(CalendarPage / ProjectsPage 等自带 height:100%
 * 布局的页面)塞进右栏标签页内容区时的高度撑满包装。
 *
 * 背景(2026-06-22)：用户要求把日历/项目整页放进 run-session/DM/团队三处右栏的
 * 标签页里(「直接塞完整大页」)。这些页面根节点是 height:100%，但作为 column flex
 * 容器(.rs-pane-fade / .drPane)的直接子项时，没有 flex-grow 上下文会塌成内容高度。
 * 这个包装提供 flex:1 + minHeight:0 的 flex column 上下文，让整页正常撑满 + 内部
 * 自滚动。不改页面本身(UI 保护规则：只加不删)。
 */
import type { ReactNode } from 'react';

export function EmbeddedPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

export default EmbeddedPage;

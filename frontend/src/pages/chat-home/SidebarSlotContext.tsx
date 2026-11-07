/**
 * SidebarSlotContext — 统一侧栏的「列表槽」传送门（2026-06-23 路B 统一侧栏）。
 *
 * 背景：HfLayout 现在渲染唯一一条 ChatRail（全站常驻，纹丝不动）。但 ChatRail
 * 里那段「列表」是页面特有的（个人态=助手列表，团队态=收件箱），不能写死在
 * HfLayout。做法：ChatRail 内放一个空的「槽」DOM 节点，聊天页用 createPortal 把
 * 自己的列表渲染进这个槽。
 *
 * 为什么用 portal 而非「setSlot(JSX)」：列表里有搜索框/选中高亮/点击回调，全依赖
 * 页面 state；JSX 快照会 stale，portal 传送的是活的 React 子树，state 更新照常。
 *
 * 用法：
 *   - HfLayout：<SidebarSlotProvider><ChatRail><SidebarSlotMount/></ChatRail>…</SidebarSlotProvider>
 *   - 聊天页：const el = useSidebarSlotEl(); {el && createPortal(<列表/>, el)}
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

// 槽 DOM 节点（给聊天页 portal 用）。
const SlotElContext = createContext<HTMLElement | null>(null);
// 注册槽节点的 setter（给 SidebarSlotMount 用）。setter 来自 useState，引用稳定。
const RegisterSlotContext = createContext<(el: HTMLElement | null) => void>(() => {});

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <RegisterSlotContext.Provider value={setEl}>
      <SlotElContext.Provider value={el}>{children}</SlotElContext.Provider>
    </RegisterSlotContext.Provider>
  );
}

/** ChatRail 的 children 用它占位：一个撑满的 flex 列，注册自己为 portal 目标。 */
export function SidebarSlotMount() {
  const register = useContext(RegisterSlotContext);
  return (
    <div
      ref={register}
      style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    />
  );
}

/** 聊天页用：拿到槽 DOM 做 createPortal（未就绪时为 null）。 */
export function useSidebarSlotEl(): HTMLElement | null {
  return useContext(SlotElContext);
}

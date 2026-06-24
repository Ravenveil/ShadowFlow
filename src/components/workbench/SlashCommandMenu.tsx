/**
 * SlashCommandMenu — Studio 输入框的 `/` 斜杠命令菜单。
 *
 * 参考 src/components/composer/CommandMenu.tsx 的 detectTrigger / 键盘导航思路，
 * 在 Studio 中栏场景下做轻封装：
 *  - 真实命令源 = `defaultStudioSlashCommands`（/new /clear /web /code /files …），
 *    StudioChat 据此驱动菜单（非纯展示）。
 *  - 键盘导航：未受控（不传 activeIndex）时本组件内部管理高亮 + ↑↓ + ↵ 选择 + esc 关闭；
 *    受控（传 activeIndex）时沿用调用方索引（向后兼容契约）。
 *  - `detectSlashTrigger` 复用 CommandMenu detectTrigger 思路，供调用方在 textarea
 *    onChange 时判断是否打开菜单 + 过滤 query。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Eraser, Globe, Code2, FolderTree, HelpCircle } from 'lucide-react';

export interface SlashCommand {
  id: string;
  label: string;
  hint?: string;
  /** 可选图标节点。 */
  icon?: React.ReactNode;
}

/**
 * Studio 中栏内置斜杠命令（真实命令源）。StudioChat 注入并在挑选时分发动作。
 * label 不带前导 `/`（渲染时统一补 `/`），hint 为右侧灰字说明。
 */
export const defaultStudioSlashCommands: SlashCommand[] = [
  { id: 'new', label: 'new', hint: '新会话', icon: <Plus size={13} strokeWidth={2} /> },
  { id: 'clear', label: 'clear', hint: '清空当前对话', icon: <Eraser size={13} strokeWidth={2} /> },
  { id: 'web', label: 'web', hint: '联网搜索', icon: <Globe size={13} strokeWidth={2} /> },
  { id: 'code', label: 'code', hint: '代码模式', icon: <Code2 size={13} strokeWidth={2} /> },
  { id: 'files', label: 'files', hint: '聚焦右栏文件', icon: <FolderTree size={13} strokeWidth={2} /> },
  { id: 'help', label: 'help', hint: '快捷键', icon: <HelpCircle size={13} strokeWidth={2} /> },
];

/** 从 `/<query>` 过滤命令（label / id / hint 模糊匹配）。 */
export function filterSlashCommands(items: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.hint ?? '').toLowerCase().includes(q),
  );
}

/**
 * 检测 textarea 行首的 `/` 触发（复用 CommandMenu detectTrigger 思路，但只认 `/`，
 * 且只在「整段文本以 / 开头」时触发——Studio 斜杠命令是整条消息级动作，不做行内 mention）。
 * 返回 query（/ 之后到光标的非空白串）或 null。
 */
export function detectSlashTrigger(text: string, caret: number): { query: string } | null {
  if (!text.startsWith('/')) return null;
  // / 之后出现空格即认为是普通文本（命令名通常无空格）。
  const head = text.slice(1, Math.max(1, caret));
  if (/\s/.test(head)) return null;
  return { query: head };
}

export interface SlashCommandMenuProps {
  open: boolean;
  items: SlashCommand[];
  /** 受控高亮 index；不传 = 本组件内部管理键盘导航（推荐）。 */
  activeIndex?: number;
  onPick: (cmd: SlashCommand) => void;
  onClose?: () => void;
}

export function SlashCommandMenu({ open, items, activeIndex, onPick, onClose }: SlashCommandMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 受控 vs 内部：activeIndex 传入则受控，否则本组件自管理。
  const controlled = activeIndex !== undefined;
  const [internalIdx, setInternalIdx] = useState(0);
  const idx = controlled ? Math.max(0, Math.min(activeIndex!, items.length - 1)) : internalIdx;

  // 菜单打开 / items 变化时把内部高亮夹回有效区间并复位到 0。
  useEffect(() => {
    if (!controlled) setInternalIdx(0);
  }, [open, items.length, controlled]);

  // 键盘导航（仅未受控时接管 ↑↓↵；esc 始终关闭）。capture 阶段以抢在 textarea 之前。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (controlled || items.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setInternalIdx((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setInternalIdx((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onPick(items[internalIdx % items.length]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, controlled, items, internalIdx, onPick, onClose]);

  // 高亮行滚动进视口。
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLButtonElement>(`[data-slash-row="${idx}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, idx]);

  const rows = useMemo(() => items, [items]);

  if (!open || rows.length === 0) return null;

  return (
    <div
      ref={ref}
      className="sf-anim-slide-up"
      role="listbox"
      aria-label="斜杠命令"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: 0,
        minWidth: 240,
        maxHeight: 280,
        overflowY: 'auto',
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        padding: 4,
        zIndex: 50,
      }}
    >
      {/* key=item-ids → filter 变化时整列 cross-fade（sf-switch-fade，round-2 切换层） */}
      <div ref={listRef} className="sf-switch-fade" key={rows.map((c) => c.id).join('|')}>
        {rows.map((c, i) => {
          const on = i === idx;
          return (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={on}
              data-slash-row={i}
              className="sf-press"
              onMouseEnter={() => !controlled && setInternalIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 7,
                fontSize: 12.5,
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid transparent',
                background: on ? 'color-mix(in oklab, var(--t-accent) 12%, transparent)' : 'transparent',
                color: on ? 'var(--t-accent)' : 'var(--t-fg-2)',
              }}
            >
              {c.icon && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{c.icon}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>/{c.label}</span>
              {c.hint && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', flexShrink: 0 }}>
                  {c.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SlashCommandMenu;

// ─────────────────────────────────────────────────────────────────────────────
// StudioTabs — clawsgo 风「滑动下划线 + 内容横滑」切换原语（polish owner 提供）。
//
// REVIEWER PUNCH-LIST 兑现：round-2 的 sf-tabs / sf-tab / sf-tab-underline /
// sf-switch-slide 切换层此前 0 个 tsx 采用（dead CSS）。这里把它们封进一个可复用
// 受控组件，shell-left（Agents/Teams 模式切换）与 right-files（代码/预览 tab）
// 可直接 drop-in，无需各自重写 inline transition。本文件即首个真实采用点。
//
// 用法：
//   <StudioTabs
//     items={[{id:'agents',label:'Agents'},{id:'teams',label:'Teams'}]}
//     value={mode} onChange={setMode} />
// 选中变化时下划线平滑滑到激活 tab（measure offsetLeft/offsetWidth → CSS var）。
// ─────────────────────────────────────────────────────────────────────────────

export interface StudioTabItem {
  id: string;
  label: React.ReactNode;
  /** 可选左侧图标。 */
  icon?: React.ReactNode;
  /** 无障碍标题。 */
  title?: string;
}

export interface StudioTabsProps {
  items: StudioTabItem[];
  /** 当前激活 tab id（受控）。 */
  value: string;
  onChange: (id: string) => void;
  /** 紧凑内边距。 */
  compact?: boolean;
  /**
   * 下划线方向：'h'（横向，默认，工作空间 tab）/ 'v'（纵向高亮条，左栏导航）。
   * 'v' 采用 sf-tab-underline--v：滑动高亮条沿 Y 轴移动（hermes 侧栏导航手感）。
   */
  orientation?: 'h' | 'v';
  /** 容器额外样式。 */
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * 测量激活子项的 offsetLeft/offsetWidth，写回 CSS var（--sf-tab-x/--sf-tab-w），
 * 驱动 .sf-tab-underline 平滑滑动。返回容器 ref + 下划线内联 style。
 * 纯 measure，无外部副作用；ResizeObserver 兜底容器/字体尺寸变化时重算。
 */
export function useSlidingUnderline(
  activeIndex: number,
  deps: ReadonlyArray<unknown> = [],
  orientation: 'h' | 'v' = 'h',
): { containerRef: React.RefObject<HTMLDivElement>; underlineStyle: React.CSSProperties } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number; y: number; h: number }>({ x: 0, w: 0, y: 0, h: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const node = el.querySelector<HTMLElement>(`[data-tab-index="${activeIndex}"]`);
      if (node) {
        setBox({ x: node.offsetLeft, w: node.offsetWidth, y: node.offsetTop, h: node.offsetHeight });
      }
    };
    measure();
    // 字体/容器尺寸变化时重测（避免下划线错位）。
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, orientation, ...deps]);

  return {
    containerRef,
    underlineStyle:
      orientation === 'v'
        ? { ['--sf-tab-y' as string]: `${box.y}px`, ['--sf-tab-h' as string]: `${box.h}px` }
        : { ['--sf-tab-x' as string]: `${box.x}px`, ['--sf-tab-w' as string]: `${box.w}px` },
  };
}

export function StudioTabs({
  items,
  value,
  onChange,
  compact,
  orientation = 'h',
  style,
  ...aria
}: StudioTabsProps) {
  const activeIndex = Math.max(0, items.findIndex((t) => t.id === value));
  const { containerRef, underlineStyle } = useSlidingUnderline(
    activeIndex,
    [items.length, value],
    orientation,
  );

  return (
    <div
      ref={containerRef}
      className="sf-tabs"
      role="tablist"
      aria-orientation={orientation === 'v' ? 'vertical' : 'horizontal'}
      aria-label={aria['aria-label']}
      style={
        orientation === 'v'
          ? { flexDirection: 'column', alignItems: 'stretch', ...style }
          : style
      }
    >
      {items.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-on={on}
            data-tab-index={i}
            title={t.title}
            className="sf-tab"
            onClick={() => onChange(t.id)}
            style={
              compact
                ? { padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }
                : { display: 'inline-flex', alignItems: 'center', gap: 6 }
            }
          >
            {t.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{t.icon}</span>}
            {t.label}
          </button>
        );
      })}
      <span
        className={`sf-tab-underline${orientation === 'v' ? ' sf-tab-underline--v' : ''}`}
        style={underlineStyle}
        aria-hidden
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StudioTabPanel — 与 StudioTabs 配套的内容切换容器（采用 round-2 sf-switch-slide /
// sf-switch-slide--back / sf-view 切换层）。把激活 tab 的方向（前进/回退）映射为
// 横滑入场方向，clawsgo「工作空间 tab 内容横滑」手感。shell-left / right-files
// 可直接 drop-in 包住各 tab 的内容区。
//
// 用法：
//   <StudioTabPanel activeId={mode} order={['code','preview']}>{panel}</StudioTabPanel>
// activeId 变化 → 内层用 key=activeId 重挂载触发横滑；据 order 推导前进/回退方向。
// ─────────────────────────────────────────────────────────────────────────────

export interface StudioTabPanelProps {
  /** 当前激活的 tab id（驱动重挂载 + 方向）。 */
  activeId: string;
  /** tab 顺序（用于推导横滑方向：右进 vs 左进）。不传则恒为右进。 */
  order?: ReadonlyArray<string>;
  /** 容器样式。 */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function StudioTabPanel({ activeId, order, style, children }: StudioTabPanelProps) {
  const prevId = useRef<string>(activeId);
  // 据 order 推导方向：新 index < 旧 index → 回退（左进，--back）。
  let back = false;
  if (order && order.length) {
    const a = order.indexOf(prevId.current);
    const b = order.indexOf(activeId);
    if (a >= 0 && b >= 0) back = b < a;
  }
  useEffect(() => {
    prevId.current = activeId;
  }, [activeId]);

  return (
    <div className="sf-view" style={style}>
      <div
        key={activeId}
        className={`sf-switch-slide${back ? ' sf-switch-slide--back' : ''}`}
        style={{ height: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}

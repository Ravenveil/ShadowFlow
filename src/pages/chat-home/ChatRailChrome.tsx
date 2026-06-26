/**
 * ChatRailChrome — M3b/M3d 侧边栏合并（三栏融合）。
 *
 * /chat 路由下全局 HfSidebar 隐藏（HfLayout），聊天列表栏升格为唯一侧边栏：
 *   - ChatRail：容器（M3d 可收起——clawsgo/VSCode 式，收起成 48px 窄条，
 *     宽度 transition 丝滑过渡；收起状态 localStorage 持久化并通过
 *     onCollapsedChange 通知父级做「左收起↔右展开」互斥联动）
 *   - ChatRailHeader：顶部「个人 | 团队」切换 + 收起按钮（团队态另带工作区选择器）
 *   - PrimaryNavGroup：顶部带文字导航组（新建会话/消息/团队/员工/日历/产物），
 *     取单一真相源 src/config/navConfig.ts。搜索/设置工具行已上移至 header。
 *
 * 团队态包 InboxPanelFB、个人态包助手列表，两边复用同一套 chrome。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Layers } from 'lucide-react';
import { WorkspaceSelector } from '../../components/workspace/WorkspaceStrip';
import { PersonalTeamToggle, type ChatHomeView } from './PersonalTeamToggle';
import { useI18n } from '../../common/i18n';
import { PRIMARY_NAV } from '../../config/navConfig';

const RAIL_COLLAPSED_KEY = 'sf.chat.railCollapsed';

// R5 — 折叠态图标按钮样式收口到 index.css 的 .sf-rail-icon/.sf-rail-toggle
// （inline style 会压制 class 的 :hover，故改用 class 才能有 hover/按压反馈）。

// 2026-06-22 侧栏统一 — 导航从写死的 FOOTER_ITEMS 收口到单一真相源
// src/config/navConfig.ts（PRIMARY_NAV），文案走 i18n。底部图标行升格为顶部
// 带文字导航组（Hermes 式）。详见 docs/design/sidebar-unification-2026-06-22.md。

const railNavStyles = `
.sf-rail-nav-row {
  display:flex; align-items:center; gap:9px;
  padding:6px 8px; border-radius:7px;
  color:var(--t-fg-3); text-decoration:none;
  font-size:12.5px;
  transition:background var(--dur-1,120ms) ease, color var(--dur-1,120ms) ease;
}
.sf-rail-nav-row:hover { background:var(--t-panel-2); color:var(--t-fg); }
.sf-rail-nav-row.on { background:var(--t-accent-tint); color:var(--t-accent); font-weight:600; }
`;

/**
 * PrimaryNavGroup — Hermes 式「带文字」导航组（图标 + 文字 + i18n + 高亮）。
 * 取 PRIMARY_NAV 单一数组渲染，一个图标只去一个地方。展开态紧贴 header 下方。
 */
function PrimaryNavGroup({ bordered = false }: { bordered?: boolean }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t('shell.navigation')}
      style={{
        flexShrink: 0,
        padding: '6px 8px',
        borderBottom: '1px solid var(--t-border)',
        borderRight: bordered ? '1px solid var(--t-border)' : undefined,
        background: 'var(--t-panel)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <style>{railNavStyles}</style>
      {PRIMARY_NAV.map(({ key, labelKey, Icon, to }) => (
        <NavLink
          key={key}
          to={to}
          data-testid={`chatrail-${key}`}
          className={({ isActive }) => `sf-rail-nav-row${isActive ? ' on' : ''}`}
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden />
          <span>{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

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
  const goWorkbench = () => navigate('/chat?view=workbench');
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
          {/* 搜索/设置已移至全局顶栏 HfTopBar（与主题/语言同处）。 */}
          {onCollapse && (
            <button
              type="button"
              aria-label="收起侧边栏"
              title="收起侧边栏"
              data-testid="chatrail-collapse"
              onClick={onCollapse}
              className="sf-rail-icon sf-rail-toggle"
              style={{ padding: 4, flexShrink: 0 }}
            >
              <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
        {/* 工作区/团队选择器 — 从全宽顶条迁入侧边栏（团队态，切换下方/搜索上方），
            选 context 再开工，不再占一整条横幅。 */}
        {view === 'team' && (
          <div style={{ width: '100%', minWidth: 0 }}>
            <WorkspaceSelector />
          </div>
        )}
        {/* 工作台入口（2026-06-24 三栏改造）——既有 chat 体验的进化态：
            左挑 Agent/Team · 中对话 · 右项目文件。additive，不替换个人/团队切换。 */}
        <button
          type="button"
          onClick={goWorkbench}
          data-testid="chatrail-workbench-entry"
          className="sf-rail-nav-row sf-press"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '6px 8px',
            borderRadius: 7,
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
            color: 'var(--t-fg-3)',
            cursor: 'pointer',
            fontSize: 12.5,
            fontWeight: 600,
            width: '100%',
          }}
          title="三栏工作台：左挑 Agent/Team · 中对话 · 右项目文件"
        >
          <Layers size={15} strokeWidth={1.9} aria-hidden style={{ color: 'var(--t-accent)' }} />
          <span>工作台</span>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--t-fg-5)', letterSpacing: '.06em' }}>
            3-COL
          </span>
        </button>
        {/* 团队态「+ 新任务」按钮已删（2026-06-22 用户要求）——「新建会话」入口
            已在 PrimaryNavGroup 顶部导航组，不重复放。 */}
      </div>
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
  forceCollapsed = false,
  children,
}: {
  view: ChatHomeView;
  /** 展开态宽度（团队 296 对齐 InboxPanelFB / 个人 264）——定宽才能做 width transition。 */
  width: number;
  bordered?: boolean;
  containerStyle?: CSSProperties;
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * 强制折叠成 48px 细导轨（不写 localStorage，不动用户偏好）。
   * 三栏工作台（?view=workbench）用：内容区自带 AgentTeamRail 左栏，此时全局 ChatRail
   * 收成 hermes 风的细 app 侧栏，避免双左栏。退出 workbench 视图自动恢复用户偏好。
   */
  forceCollapsed?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [collapsedPref, setCollapsedPref] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  // forceCollapsed 覆盖用户偏好（只在渲染期生效，不持久化）。
  const collapsed = forceCollapsed || collapsedPref;
  const setCollapsed = setCollapsedPref;

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
        /* F6 批3 — 互斥面板时长曲线统一走 token（polish-plan §4 互斥面板）。 */
        transition: 'width var(--dur-3) var(--ease-in-out)',
        overflow: 'hidden',
        ...(collapsed
          ? { borderRight: '1px solid var(--t-border)', background: 'var(--t-panel)' }
          : containerStyle),
      }}
    >
      {collapsed ? (
        // R5 — 折叠态图标轨随宽度收起淡入（clawsgo 折叠手感），不再瞬切。
        <div className="sf-rail-fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px' }}>
          <button
            type="button"
            aria-label="展开侧边栏"
            title="展开侧边栏"
            data-testid="chatrail-expand"
            onClick={toggle}
            className="sf-rail-icon sf-rail-toggle"
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
          {/* 收起态竖排导航 — 走同一份 PRIMARY_NAV（图标 + tooltip）。
              搜索/设置已移至全局顶栏 HfTopBar。 */}
          {PRIMARY_NAV.map(({ key, labelKey, Icon, to }) => (
            <Link key={key} to={to} title={t(labelKey)} aria-label={t(labelKey)} data-testid={`chatrail-${key}`} className="sf-rail-icon">
              <Icon size={15} strokeWidth={1.75} aria-hidden />
            </Link>
          ))}
          <div style={{ flex: 1 }} />
        </div>
      ) : (
        // R9 — 展开态内容整体淡入（与 R5 折叠列淡入对称），消除展开瞬间内容「啪」一下
        // 出现的突兀；宽度 --dur-3 过渡与内容 --dur-2 淡入错峰，折叠/展开都顺滑。
        <div className="sf-rail-fade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ChatRailHeader view={view} bordered={bordered} onCollapse={toggle} />
          <PrimaryNavGroup bordered={bordered} />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
        </div>
      )}
    </div>
  );
}

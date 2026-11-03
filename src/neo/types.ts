/**
 * Neo (clawsgo-style chat-first 重构) 共享类型契约。
 * 所有 src/neo/ 组件跨文件引用此文件，禁止各自重复定义。
 */

/** 左栏当前选中对象：单个 Agent（个人）或一个 Team（团队）。 */
export interface NeoTarget {
  kind: 'agent' | 'team';
  id: string;
  name: string;
}

/**
 * 唯一导航状态（2026-08-19 收敛）：中栏视图、左栏列表区、选中高亮全部由它
 * 派生，NeoApp 单点持有。此前 target/midView/section/view 分散三处、各入口
 * 手工拼线，漏一根就是「点了没跳」——收敛后加导航入口 = 加一个变体 + 一行
 * 渲染映射。
 */
export type NeoNav =
  /** 新任务 hero（左栏列表 = 会话）。 */
  | { view: 'home' }
  /** 知识库内嵌页（左栏列表 = 统一知识源：本地仓库 + 知识包）。
   *  sourceId = 'vault:<id>' | 'pack:<id>' 深链预选（2026-08-19 知识库统一批）。 */
  | { view: 'knowledge'; sourceId?: string }
  /** 记忆内嵌页（左栏列表 = 记忆条目）。 */
  | { view: 'memory' }
  /** ClawHub 内嵌页（2026-10-30，左栏常驻；中栏 = Claw 目录/安装/卸载）。 */
  | { view: 'clawhub' }
  /** 历史 runs 列表（GAP B39；左栏列表保持不动，行链接 /?run=<id>）。
   *  os-unified（2026-11-04）：左栏「历史」按钮移除（会话列表即历史），
   *  但 composer /inspect 仍走本视图，变体保留。 */
  | { view: 'runs' }
  /** os-unified（2026-11-04 Grok Bot 范式批）：agents/teams 浏览视图移除——
   *  成员即会话、团队即会话区分组，全部并入 home 列表区，无独立页面。 */
  /** DM/群聊内嵌（左栏列表保持不动）。 */
  | { view: 'conversation'; groupId: string }
  /** 员工编排目标兜底（resolve DM 失败/后端不可用）：中栏 composer 面向该 agent。 */
  | { view: 'agent-target'; agentId: string; name: string }
  /** Agent「灵魂」编辑页（左栏列表 = 员工）：soul/persona + 名称，PATCH /api/agents。 */
  | { view: 'agent-soul'; agentId: string }
  /** 团队编排目标兜底（resolve 团队群失败）：中栏 composer 面向该 team。 */
  | { view: 'team-target'; teamId: string; name: string };

/**
 * 左栏列表区内容（由 NeoApp 按 nav 派生并下发给 NeoRail）。
 * os-unified（2026-11-04 Grok Bot 范式批）：agents/teams 分区移除——成员即会话、
 * 团队即分组，全部并入 home 列表区。
 */
export type RailSection = 'home' | 'knowledge' | 'memory';

/** NeoRail props — 左栏导航（纯受控：状态全部来自 NeoApp）。 */
export interface NeoRailProps {
  nav: NeoNav;
  /** 列表区内容（nav 派生；conversation/兜底目标态保持进入前的列表）。 */
  section: RailSection;
  onNavigate: (nav: NeoNav) => void;
  onNewTask: () => void;
  /** 折叠态由 NeoApp 持有（中栏顶栏的 panel-left 折叠钮也要触发）。 */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** NeoChat props — 中栏聊天 + inline 任务执行。 */
export interface NeoChatProps {
  target: NeoTarget | null;
  /** 当前关联的 workflow run（右栏 NeoHost 同步展示）；无运行为 null。 */
  runId: string | null;
  /** run 启动/结束时回调，NeoApp 持有 runId 状态。 */
  onRunChange: (runId: string | null) => void;
  /** 中栏内打开会话（顶栏「群聊现场」入口）——统一走 onNavigate。 */
  onNavigate: (nav: NeoNav) => void;
}

/** NeoHost props — 右栏「Agent 的主机」。 */
export interface NeoHostProps {
  target: NeoTarget | null;
  runId: string | null;
  /** 当前 agent 上下文（agent-target / agent 的 DM 会话）——非空时露出「灵魂」tab。 */
  soulAgent?: { id: string; name: string } | null;
  /**
   * 当前会话上下文（2026-08-22 W2 钉钉式融合）：中栏开着 conversation 时由
   * NeoApp 下发。非 DM（团队群）→ 标题变「团队的主机」并露出「成员」tab
   * （GroupMembersPanel：成员列表 + 团队 DAG 摘要 + 审批门）；DM/无会话 → null，
   * 保持「Agent 的主机」。
   */
  conversation?: {
    groupId: string;
    kind: string | null;
    teamId?: string | null;
    teamName?: string | null;
  } | null;
}

/**
 * app.ts — 工作台（四栏）的**全部可见文案**。
 *
 * 约定：`src/shell/**`、`src/chat/**`、`src/panel/**` 里不出现中文内容，
 * 只负责把这里的字符串摆到位置上。产品改口播、改 tab 名、改提示语 —— 改这一个文件。
 *
 * 分节与视图一一对应：rail / list / chat / composer / panel / policy / dag / settings。
 */
import type { PolicyState, Session } from '../data/types';

export interface RailItem {
  id: string;
  label: string;
  badge?: string;
}

export const RAIL = {
  brand: 'ShadowFlow',
  nav: [
    { id: 'chat', label: '对话' },
    { id: 'team', label: 'Agent 团队', badge: '4' },
    { id: 'kb', label: '知识库' },
    { id: 'dash', label: '数据看板' },
  ] satisfies RailItem[],
  workspaceTitle: '工作空间',
  workspace: [
    { id: 'project', label: '项目' },
    { id: 'cron', label: '定时任务' },
  ] satisfies RailItem[],
  settings: '设置',
};

export const LIST = {
  collapse: '收起列表',
  close: '收起',
  create: '新建',
  searchPlaceholder: '搜索对话、项目或 Agent',
  searchKey: '⌘K',
  empty: '没有匹配的会话',
  groupTitle: '项目与 AGENT',
  /** 会话列表底部常驻的快捷入口（真接口接入前是静态项）。 */
  shortcuts: ['实验设计与消融', '图表与配图', '投稿材料'],
  memberCount: (n: number) => `${n} 位成员`,
  kindLabel: { dm: '单聊', group: '群聊', project: '项目' } satisfies Record<Session['kind'], string>,
};

export const CHAT = {
  subtitle: {
    dm: '接需求、拆任务、派活、汇总产出',
    group: '群聊 · 主控调度，角色可各自发言',
    project: '项目会话 · 主控牵头推进',
  } satisfies Record<Session['kind'], string>,
  members: (n: number) => `${n} 位`,
  more: '更多',
  panelHide: '收起面板',
  panelShow: '展开面板',
  emptyTitle: (title: string) => `与 ${title} 开始对话`,
  emptyBody: {
    group: '在群里发消息，主控会接住需求并拆给对应角色；也可以 @ 某位角色直接提问。',
    dm: '发消息，TA 就开始干活。试试 @ 提及角色，或用 / 调起命令。',
  },
  /** 空会话的引导句（按会话类型）。 */
  emptyChips: {
    group: ['把组会稿整理成投稿稿', '核对第 3 节引用', '生成章节骨架'],
    other: ['列个提纲', '看看当前进度', '复盘上周产出'],
  },
  placeholder: {
    group: '在群里发消息，主控会接住并派给角色 · @ 可直接点某位角色',
    dm: '发消息，TA 就开始干活 · 试试 @ 提及角色 或 / 命令',
  },
  backHome: '回到首页',
  home: '首页',
  loading: '正在加载工作台…',
  loadError: (reason: string) => `工作台加载失败：${reason}`,
  retry: '重试',
};

export const COMPOSER = {
  models: ['Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 3 Pro'],
  attach: '添加附件',
  slash: '斜杠命令',
  mention: '提及角色',
  send: '发送',
  hintKeys: 'Enter 发送 · Shift + Enter 换行',
  hintTools: '@ 提及角色 · / 调用命令',
};

/** 步骤状态的中文说法（RunBlock / TeamBlock / DAG 共用）。 */
export const STEP_STATUS_TEXT = {
  done: '已完成',
  running: '进行中',
  wait: '等待中',
  failed: '失败',
} as const;

export const RUN = {
  running: '运行',
  steps: (n: number) => `${n} 个步骤`,
  allDone: '全部完成',
};

export const PANEL = {
  title: '执行详情',
  liveRunning: '运行中',
  liveDone: '已完成',
  close: '收起面板',
  tabsLabel: '面板分区',
  /**
   * 右栏 tab 的唯一真源：id 决定组件里的图标与状态，label 只是显示文案。
   *
   * 形态对齐旧前端（neo 的「编队」pane）：**编队与工作流不是两页** ——
   * 成员、工作流、策略举证是同一个编队面板里纵向排布的三节；
   * 所以这里只有三个 tab，加 tab = 这里加一项 + AgentPanel 的 TAB_ICON 加一行。
   */
  tabs: [
    { id: 'run', label: '执行' },
    { id: 'team', label: '编队' },
    { id: 'artifacts', label: '产物' },
  ] as const,
  runKicker: 'ACTIVE RUN',
  elapsed: (v: string) => `耗时 ${v}`,
  stepsDone: (done: number, total: number) => `${done} / ${total} 步已交`,
  stepsSection: (n: number) => `步骤 · ${n}`,
  viewDag: '查看编队',
  usageTitle: '用量',
  usageMeta: '本会话',
  contextLabel: (pct: number) => `上下文 ${pct}%`,
  rosterSection: (n: number) => `成员 · ${n}`,
  rosterMeta: '群会话派发范围',
  busy: '执行中',
  standby: '待命',
  policySection: '策略举证',
  savePolicy: '保存策略',
  policySaved: '已保存',
  policyDir: '行→列',
  dagSection: '工作流',
  dagMeta: (nodes: number, edges: number) => `${nodes} 节点 · ${edges} 边`,
  artifactsSection: (n: number) => `产物 · ${n}`,
  artifactsMeta: '本轮',
  stepState: { done: '已完成', running: '进行中', wait: '等待' } as const,
};

export const POLICY = {
  /** 三态的中文说法与标记（矩阵、图例、行尾 chip 共用）。 */
  states: {
    permit: { label: '直通', mark: '●' },
    warn: { label: '需复核', mark: '▲' },
    deny: { label: '禁止', mark: '✕' },
  } satisfies Record<PolicyState, { label: string; mark: string }>,
  corner: '行→列',
  cornerTitle: '行 = 发起方 · 列 = 接收方',
  worst: '最严',
  total: (n: number) => `共 ${n} 条已配置`,
  hint: '点格子循环：直通 → 需复核 → 禁止 → 清除。限制会同步染到工作流连线。',
  noteTitle: '这套矩阵在论文里管什么',
  noteBody:
    '每个格子是「A 的产出，B 能不能直接当真」。设成「禁止」，B 就不能拿 A 的结论当证据，双向都受限；改动会立刻反映到工作流连线的颜色上。',
  cellTitle: (from: string, to: string, label?: string | null) =>
    `${from} → ${to}：${label ? `${label}（点击切换）` : '未配置（点击设限）'}`,
  cellAria: (from: string, to: string, state: string | null) => `${from} to ${to}: ${state ?? 'none'}`,
};

export const DAG = {
  footHint: (nodes: number, edges: number) =>
    `${nodes} 节点 · ${edges} 边 · 线型看交接方式，颜色看策略举证`,
  selSeparator: ' · ',
  legendTitle: '线型 = 交接方式',
  legendMode: {
    direct: '直接交接',
    conditional: '条件',
    approve: '审批门',
  } as const,
  status: { done: '已完成', running: '执行中', wait: '等待中', failed: '失败' } as const,
  empty: '暂无节点',
};

export const SETTINGS = {
  title: '设置',
  close: '关闭',
  appearanceTitle: '外观风格',
  appearanceNote: '切换后立即生效，并记住你的选择。',
  modelsTitle: '模型',
  modelsNote: '默认模型（每个会话可单独覆盖）。',
  models: [
    { label: '默认对话模型', value: 'Claude Sonnet 4.6' },
    { label: '写作/润色模型', value: 'Claude Sonnet 4.6' },
  ],
  collabTitle: '协作偏好',
  collabNote: '决定主控怎么派活。',
  collab: [
    { label: '群里默认只跟主控对话', state: '已开启' },
    { label: '关键节点需人工确认', state: '已开启' },
  ],
  footHint: '风格偏好保存在本地浏览器',
  done: '完成',
};

/** 首页按钮与空态里的通用措辞（跨视图复用）。 */
export const COMMON = {
  approveGate: '审批门',
};

/**
 * 真接口接入前的演示态文案（主控的自动应答）。
 * 接上 /api 后整块可以删掉，组件不需要动。
 */
export const DEMO = {
  /** 用户消息超过这么长就在应答里截断。 */
  quoteLimit: 40,
  leadAuthor: '主控',
  leadReply: (text: string) => {
    const quote = text.slice(0, DEMO.quoteLimit) + (text.length > DEMO.quoteLimit ? '…' : '');
    return `收到，我按这条推进：${quote}\n\n先拆成可执行的步骤，再分给对应的角色。中途要你拍板的地方，我会单独挂出来，不打断你别的活。`;
  },
};

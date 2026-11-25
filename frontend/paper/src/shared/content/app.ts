/**
 * app.ts — 工作台（四栏）的**全部可见文案**。
 *
 * 约定：`src/shell/**`、`src/chat/**`、`src/panel/**` 里不出现中文内容，
 * 只负责把这里的字符串摆到位置上。产品改口播、改 tab 名、改提示语 —— 改这一个文件。
 *
 * 分节与视图一一对应：rail / list / chat / composer / panel / policy / dag / settings。
 */
import type { PolicyState, Session } from '@/shared/data/types';

export interface RailItem {
  id: string;
  label: string;
  badge?: string;
}

export const RAIL = {
  brand: 'ShadowFlow',
  /** 主导航，对齐 app（Figma 工作台）：对话/管理团队/知识库/备忘录/定时任务/新闻。 */
  nav: [
    { id: 'chat', label: '对话' },
    { id: 'team', label: '管理团队' },
    { id: 'kb', label: '知识库' },
    { id: 'cron', label: '定时任务' },
    { id: 'news', label: '新闻' },
  ] satisfies RailItem[],
  workspaceTitle: '项目',
  /** 项目 = 会话分组 + 项目文件（files 视图保留给会话列表跳转，不再单独占导航位）。 */
  workspace: [
    { id: 'project', label: '项目' },
  ] satisfies RailItem[],
  settings: '设置',
};

export const LIST = {
  collapse: '收起列表',
  close: '收起',
  create: '新建',
  cancel: '取消',
  searchPlaceholder: '搜索对话、项目或 Agent',
  searchKey: '⌘K',
  empty: '没有匹配的会话',
  groupTitle: '项目与 AGENT',
  /** 会话列表底部常驻的快捷入口（真接口接入前是静态项）。 */
  shortcuts: ['实验设计与消融', '图表与配图', '投稿材料'],
  memberCount: (n: number) => `${n} 位成员`,
  kindLabel: { dm: '单聊', group: '群聊', project: '项目' } satisfies Record<Session['kind'], string>,
  /** 抽屉头 */
  drawerTitle: '对话',
  drawerSubtitle: '搜索、新建或继续任何会话',
  /** 新建菜单 */
  newConversation: '新建对话',
  /** 顶层新建未命名时落的默认标题。 */
  untitledConversation: '新对话',
  newGroup: '发起群聊',
  groupPickHint: '在下方选择成员',
  groupNamePlaceholder: '群名称（可留空）',
  groupSelectAll: '全选',
  groupClearAll: '清空',
  groupUseTemplate: '一键使用',
  groupPreparing: '准备中…',
  groupCreating: '创建中…',
  groupCreateConfirm: '建群',
  groupNoAgents: '还没有可拉进群的成员',
  groupFallbackName: '新群聊',
  newProject: '新建项目',
  newProjectName: '输入项目名称',
  newProjectConfirm: '创建',
  creating: '创建中…',
  /** 主控（董事长）置顶卡 */
  ceoTitle: '董事长',
  ceoSubtitle: '全局调度 · 任务拆解与决策',
  ceoAvatarLabel: '董事长',
  openAgentDmTitle: '点击打开单聊',
  /** 相对时间（会话卡右上角） */
  yesterday: '昨天',
  weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  /** 分组标题 */
  recentTitle: '最近对话',
  /** 最近对话只显示 5 条，其余收进「查看更多」。 */
  recentLimit: 5,
  viewMore: '查看更多',
  viewLess: '收起',
  /** 「最近」标题行的折叠与更多按钮。 */
  recentMore: '更多操作',
  recentCollapse: '折叠最近对话',
  /** 会话列表右缘拖动热区的无障碍标签。 */
  resizeLabel: '拖动调整侧边栏宽度',
  /** 分组卡片菜单（对齐参考设计）。 */
  groupNewTask: '新建任务',
  /** 一键建项目的默认名。 */
  untitledProject: '新项目',
  groupNew: '新建分组',
  groupNewName: '输入分组名称',
  groupNewFolder: '关联文件夹路径（可选）',
  groupCreate: '创建',
  groupPin: '置顶',
  groupUnpin: '取消置顶',
  groupOpenFolder: '打开文件夹',
  groupEdit: '编辑分组',
  groupEditName: '修改分组名称',
  groupRemove: '移除分组',
  groupRemoveConfirm: (name: string) => `确定移除分组「${name}」？会话不会被删除。`,
  groupNewConversation: '在此分组新建对话',
  groupNewConversationName: '输入对话标题',
  groupMenu: '分组操作',
  projectsTitle: '项目与 Agent',
  noConversations: '还没有会话 —— 点「新建」开始。',
  noMatches: '没有匹配的会话',
  noProjects: '暂无项目与 Agent（尚未创建）',
  loading: '正在加载会话…',
  retry: '重试',
  unnamed: '未命名会话',
};

export const CHAT = {
  /** 群消息悬浮操作（搬 legacy NeoGroupMsgActions）。 */
  msg: {
    react: (emoji: string) => `反应 ${emoji}`,
    pin: '置顶',
    unpin: '取消置顶',
  },
  members: (n: number) => `${n} 位`,
  /** 点击成员头像弹出的微信式成员卡。 */
  memberTitle: '群成员',
  memberHint: '点击成员发起单聊',
  memberOpenDm: '发消息',
  noRoster: '暂无成员信息',
  /** 群会话里的「团队成员」卡：折叠头 + 成员行，点谁看谁的产物（对齐 WorkBuddy）。 */
  teamTitle: (n: number) => `${n} 位团队成员`,
  teamToggle: '展开 / 收起团队成员',
  teamState: { done: '已完成', busy: '进行中', idle: '待命' } as const,
  teamStripJump: (name: string) => `在右栏看 ${name} 的产物`,
  teamStripAll: '全部',
  more: '更多',
  /** 会话列表收起后，聊天区头部这个按钮把它拿回来。 */
  showList: '展开会话列表',
  /**
   * 董事长卡在后端名册里认人的线索：名字或角色里含这些词的那位就是主控。
   * 写死 agent id 会随后端换人失联，匹配词留着可改。
   */
  ceoMatch: ['主控', 'coordinator'],
  moreInspect: '查看执行详情',
  moreCopy: '复制会话标题',
  copied: '已复制',
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
  loading: '正在加载工作台…',
  loadError: (reason: string) => `工作台加载失败：${reason}`,
  loadErrorHint: '后端没起或端口不对？检查 :8002 是否在跑；只想看界面可用 ?mock=1 切演示数据。',
  retry: '重试',
};

/**
 * 输入框的全部措辞。功能对照旧前端 NeoComposer：
 * 多行输入 / ⌘⏎ / @ 提及 / 斜杠命令 / 模型 / 知识包 / 附件 / 拖拽 / 语音 / 停止。
 */
export const COMPOSER = {
  placeholderHint: '@ 提及角色 · / 调命令',
  /* 工具条 */
  attach: '添加图片 / 文件（也可直接拖入）',
  slash: '斜杠命令',
  mention: '提及角色或知识包',
  send: '发送',
  stop: '停止生成',
  knowledge: '引用知识包',
  voice: '语音输入',
  /* 键盘提示 */
  hintKeys: 'Enter 发送 · Shift + Enter 换行',
  hintTools: '@ 提及 · / 命令',
  /* 触发菜单 */
  menuMentionTitle: '提及',
  menuCommandTitle: '命令',
  menuGroupMember: '成员',
  menuGroupKnowledge: '知识包',
  menuGroupCommand: '内置命令',
  menuGroupTemplate: '指令模板',
  menuEmpty: (q: string) => `没有匹配「${q}」的项`,
  /* 模型面板 */
  modelTitle: '选择模型',
  modelManage: '管理模型',
  /* 知识包面板 */
  knowledgeTitle: '本轮引用的知识包',
  knowledgeDocs: (n: number) => `${n} 篇`,
  knowledgeSelected: (n: number) => `已选 ${n} 个知识包`,
  /* 语音 */
  voiceStarting: '正在请求麦克风…',
  voiceRecording: '录音中',
  voiceStop: '完成录音',
  voiceCancel: '取消录音',
  voiceTranscribing: '正在转写…',
  voiceUnsupported: '当前环境不支持录音',
  voiceEmpty: '没听到内容，再说一次',
  voiceAppended: '语音已转写',
  /* 拖拽 */
  dropHint: '松开以添加图片 / 文件',
  /* 附件 chip */
  attachRemove: '移除附件',
  /* 帮助面板 */
  helpTitle: '快捷键与命令',
  helpKeys: [
    ['Enter', '发送消息'],
    ['Shift + Enter', '换行'],
    ['⌘ / Ctrl + Enter', '发送消息（备用）'],
    ['@', '提及成员或知识包'],
    ['/', '调起命令'],
    ['↑ ↓', '在菜单里移动'],
    ['Enter / Tab', '选中菜单项'],
    ['Esc', '关闭菜单'],
  ],
  helpCommands: '在输入框敲 / 即可看到全部命令',
  /* 通用 */
  close: '关闭',
  cleared: '已清空输入内容',
  submitFailed: (reason: string) => `发送失败：${reason}`,
  sizeKB: (kb: number) => `${kb} KB`,
  sizeMB: (mb: string) => `${mb} MB`,
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

/**
 * 时间线的文案（`runtime/chat/TimelineList`）。
 *
 * 只有「人给这类块起的名字」在这里：思考、工具输出、原始输出、裁决…
 * 块里的内容是数据（后端推来的 body / 参数 / 步骤名），不在这份表里，
 * 也不该为了对齐设计稿去改它们。
 */
/** run 完成后的后续建议卡（搬 legacy NeoRunSuggestions） */
export const RUN_SUGGEST = {
  title: '后续建议',
};

/** 团队已保存引导卡（搬 legacy NeoTeamSavedCard） */
export const TEAM_SAVED = {
  title: '团队已保存',
  members: (n: number) => `${n} 名成员`,
  goto: '去群聊运行',
  hint: '下一步：从左侧「团队」进入该团队的群聊，描述任务即可让整个团队协同运行。',
};

/** 表格文件预览（搬 legacy XlsxPreview） */
export const XLSX_VIEW = {
  tooLarge: '工作表超过 65,536 行，预览已跳过；请下载查看',
  empty: '工作簿中没有可显示的工作表',
  parseFailed: '解析失败',
  failed: (reason: string) => `表格预览失败：${reason}`,
};

export const TIMELINE = {
  /* 折叠卡抬头 */
  thinkingFallback: '思考',
  thinkingLive: '思考中',
  toolCall: '工具调用',
  toolOutput: '工具输出',
  raw: '原始输出',
  diff: '变更',
  table: '数据表',
  stepPanel: '执行步骤',
  plan: '执行计划',
  rationale: '思路',

  /* 消息反馈（搬 legacy NeoMsgFeedback） */
  feedbackUp: '有用',
  feedbackDown: '没帮助',

  /* 状态徽标 */
  badge: {
    running: '进行中',
    ok: '完成',
    error: '失败',
  } as const,

  /* 一行副信息 */
  stepProgress: (done: number, total: number) => `${done} / ${total} 完成`,
  tableRows: (n: number) => `${n} 行`,
  diffStat: (added: number, removed: number) => `+${added} −${removed}`,
  footDone: '本轮完成',
  footRunning: '执行中',
  toolsRunning: (n: number) => `${n} 个工具运行中`,
  toolCount: (n: number) => `${n} tools`,
  tokenCount: (n: number) => `${n} tokens`,
  cost: (v: number) => `¥${v.toFixed(3)}`,
  commitFiles: (n: number) => `${n} 文件`,
  empty: '（无内容）',
  /** 后端只保留最近 500 条：更早的过程读不到了，说清楚而不是假装完整。 */
  truncated: '更早的过程已截断，只显示最近 500 条',

  /* 计划任务状态（与后端 PlanTaskRow.status 对齐） */
  planTask: {
    pending: '等待中',
    running: '执行中',
    done: '完成',
    failed: '失败',
    blocked: '阻塞',
  } as const,

  /* 系统行 */
  systemTag: '系统',
  approvalTag: '待审批',

  /* 其余整块内容 */
  image: '图片',
  artifactFallback: '产物',
  artifactKind: '文件',
  verdictPass: '通过',
  verdictFail: '未通过',
  intent: (target: string) => `意图派发 · ${target}`,
  hop: '交接',
  hopRoute: (from: string, to: string) => `${from} → ${to}`,
};

/** 群成员在 Agent 名册里已经找不到时的占位（历史群常见：成员被删但 group 还引用着）。 */
export const ROSTER_MISSING = {
  name: (tail: string) => `成员 ${tail}`,
  role: '已不在名册',
};

export const PANEL = {
  title: '执行详情',
  liveRunning: '运行中',
  liveDone: '已完成',
  liveIdle: '待命',
  close: '收起面板',
  tabsLabel: '面板分区',
  resizeLabel: '拖动调整右栏宽度',
  /**
   * 右栏 tab 的唯一真源：id 决定组件里的图标与状态，label 只是显示文案。
   *
   * 形态对齐旧前端（neo 的「编队」pane）：**编队与工作流不是两页** ——
   * 成员、工作流、策略举证是同一个编队面板里纵向排布的三节；
   * 所以这里只有三个 tab，加 tab = 这里加一项 + AgentPanel 的 TAB_ICON 加一行。
   */
  tabs: [
    { id: 'run', label: '执行' },
    { id: 'soul', label: '灵魂' },
    { id: 'team', label: '编队' },
    { id: 'artifacts', label: '产物' },
  ] as const,
  /**
   * 右栏两种主机（对齐 legacy NeoHost 的上下文规则：条件 tab 打头）：
   *   Agent 主机 —— 单聊 / 单个 Agent 视角：灵魂 / 执行 / 产物
   *   团队主机 —— 群聊 / 编队视角：编队（成员·策略·DAG）/ 执行 / 产物
   */
  hosts: [
    { id: 'agent', label: 'Agent 主机', tabs: ['soul', 'run', 'artifacts'] },
    { id: 'team', label: '团队主机', tabs: ['team', 'run', 'artifacts'] },
  ] as const,
  runKicker: 'ACTIVE RUN',
  elapsed: (v: string) => `耗时 ${v}`,
  stepsDone: (done: number, total: number) => `${done} / ${total} 步已交`,
  stepsSection: (n: number) => `步骤 · ${n}`,
  /** 这条会话还没有任何交付时，步骤区给一句话，而不是空白。 */
  emptyRun: '这条会话还没有执行记录。发一条指令，主控拆完步骤就会出现在这里。',
  viewDag: '查看编队',
  usageTitle: '用量',
  contextLabel: (pct: number) => `上下文 ${pct}%`,
  rosterSection: (n: number) => `成员 · ${n}`,
  busy: '执行中',
  standby: '待命',
  policySection: '策略举证',
  savePolicy: '保存策略',
  policySaved: '已保存',
  policyDir: '行→列',
  dagSection: '工作流',
  dagMeta: (nodes: number, edges: number) => `${nodes} 节点 · ${edges} 边`,
  artifactsSection: (n: number) => `产物 · ${n}`,
  /** 产物页按成员看：谁是成员、谁交了几件，都从会话流里数出来，不另设清单。 */
  artifactsAll: '全部',
  artifactsPickMember: '按成员看',
  /** 右栏聚焦某人时的抬头（对齐 WorkBuddy 的「X 的任务」）。 */
  artifactsOf: (name: string) => `${name} 的产物`,
  /** 从某人回到全队工作目录。 */
  artifactsBackAll: '全部产物',
  artifactsMemberDeliveries: (n: number) => `交付 · ${n}`,
  artifactsMemberFiles: (n: number) => `落在工作目录 · ${n}`,
  artifactsMemberEmpty: '这位成员还没交过东西',
  artifactsMemberNoFile: '还没有文件对上：会话里没提到具体文件名。',
  artifactsShared: '共享',
  approve: '批准',
  reject: '拒绝',
  deciding: '处理中…',
  deliverableLabel: {
    final: '终稿',
    verify: '核验',
    paper: '论文',
    bib: '文献',
    charts: '图表',
  } as const,
  /** 副标题：产物就是会话工作目录里的文件，说清出处，别让人以为是「本轮」清单。 */
  artifactsRoot: '工作目录',
  artifactsLoading: '读取目录…',
  artifactsEmpty: '这个目录还是空的',
  artifactsEmptyHint: 'agent 写的稿子、图、参考文献都会落在这里；跑完一轮再回来看。',
  artifactsNoDir: '这条会话没有工作目录',
  artifactsNoDirHint: '群记录里没带 workspace_dir，多半是历史会话：给它发一条指令就会建出来。',
  artifactsFolder: '目录',
  artifactsUp: '上一级',
  artifactsBack: '返回列表',
  artifactsTruncated: '文件较大，只显示了前 1 MB',
  artifactsReadFail: (reason: string) => `打不开：${reason}`,
  artifactsImageFail: '这张图读不出来（后端没给直链），先显示源码。',
  artifactsZoom: '点开看大图',
  stepState: { done: '已完成', running: '进行中', wait: '等待' } as const,
};

/**
 * PIPE — 右栏「管线」页（ARC run 观测）的文案。
 * 阶段名/相位名不在文案表里：它们是数据（后端 research 域返回），不是硬编码。
 */
export const PIPE = {
  kicker: 'ARC PIPELINE',
  runsSection: (n: number) => `Run · ${n}`,
  loading: '读取管线…',
  loadFail: (reason: string) => `读不到管线：${reason}`,
  refresh: '刷新',
  noRuns: '这条会话还没有 ARC run',
  noRunsHint: '给论文专家团发一条课题，23 阶段管线就会出现在这里；独立跑的 run 也会列出来。',
  progress: (done: number, total: number) => `${done} / ${total} 阶段完成`,
  topicFallback: '未记录课题',
  statusLabel: {
    running: '进行中',
    succeeded: '已完成',
    failed: '失败',
    paused: '等待审批',
    unknown: '未启动',
  } as const,
  stageStatus: {
    pending: '待启动',
    running: '进行中',
    done: '已完成',
    failed: '失败',
    paused: '等批准',
    skipped: '跳过',
  } as const,
  gateBadge: '审批门',
  gateHint: '这一阶段需要人工批准后管线才会继续',
  attemptsLabel: (n: number) => `${n} 轮`,
  durationLabel: (sec: number) => `${sec >= 60 ? `${Math.round(sec / 60)} 分` : `${Math.round(sec)} 秒`}`,
  decisionLabel: {
    proceed: '通过',
    refine: '返回精炼',
    pivot: '换方向',
  } as const,
  stageArtifacts: (n: number) => `阶段产物 · ${n}`,
  stageOpen: '打开',
  stageBack: '返回管线',
  phaseMeta: (n: number) => `${n} 个阶段`,
  deliverTitle: '终稿与交付',
  deliverEmpty: '这一 run 还没有终稿目录',
  verifyTitle: '引用核验',
  verifyMeta: (verified: number, total: number) => `${verified} / ${total} 条已核验`,
  verifyIntegrity: (pct: number) => `完整性 ${pct}%`,
  verifyEmpty: '这一 run 没有引用核验报告（stage-23）',
  verifySuspicious: (n: number) => `${n} 条存疑`,
  verifyHallucinated: (n: number) => `${n} 条疑似虚构`,
  qualityTitle: '质量门裁决',
  qualityScore: (score: number) => `${score} / 10`,
  qualityEmpty: '这一 run 没有质量门报告（stage-20）',
  strengthsTitle: '亮点',
  weaknessesTitle: '待改进',
  decisionsTitle: '决策史（refine / pivot 回环）',
  decisionsEmpty: '没有触发过回环',
  decisionRow: (decision: string, stage: number | null, attempt: number | null) =>
    `${decision}${stage ? ` → 回到阶段 ${stage}` : ''}${attempt ? ` · 第 ${attempt} 次` : ''}`,
  previewLoadFail: (reason: string) => `打不开：${reason}`,
  previewTruncated: '文件较大，只显示了开头部分',
  rawUnavailable: '演示态没有二进制直链，请在真后端环境查看',
  autoRefreshHint: '运行中每 10 秒自动刷新',
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
  gateNode: '审批门',
  lastDelivery: '最近交付',
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
  /** 演示态语音转写结果（真接口接上后由后端 ASR 返回）。 */
  transcript: '帮我把第三章的实验对比再核一遍，重点看 7B 与 13B 的口径是否一致。',
  leadReply: (text: string) => {
    const quote = text.slice(0, DEMO.quoteLimit) + (text.length > DEMO.quoteLimit ? '…' : '');
    return `收到，我按这条推进：${quote}\n\n先拆成可执行的步骤，再分给对应的角色。中途要你拍板的地方，我会单独挂出来，不打断你别的活。`;
  },
};

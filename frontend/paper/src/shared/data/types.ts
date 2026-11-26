import type { ToneName } from '@/shared/theme/tones';

/**
 * 论文平台数据模型。
 *
 * 这些只是**形状**，不含任何一份具体数据；数据从哪来由 `data/source.ts`
 * 的 WorkspaceSource 决定（演示态读 mock，上线走 /api）。
 */

export type MsgRole = 'user' | 'agent' | 'system';

export type StepStatus = 'done' | 'running' | 'wait' | 'failed';

export interface RunStep {
  n: number;
  title: string;
  agent: string;
  status: StepStatus;
  detail?: string;
  ms?: number;
}

export interface RunPayload {
  title: string;
  model: string;
  durationMs: number;
  steps: RunStep[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  status: StepStatus;
  note?: string;
}

export interface TeamPayload {
  title: string;
  members: TeamMember[];
}

export type ArtifactKind = 'paper' | 'figure' | 'bib' | 'sheet' | 'doc' | 'code';

export interface ArtifactPayload {
  name: string;
  kind: ArtifactKind;
  size: string;
  meta?: string;
}

/**
 * 会话工作目录里的一个条目 —— 右栏「产物」的真实数据单元。
 *
 * 与上面的 `ArtifactPayload`（消息里附带的一行描述）不同：这一份是磁盘上
 * 确实存在的文件/目录，带绝对路径，能点开读内容。
 */
export interface ArtifactEntry {
  name: string;
  /** 绝对路径；读内容时后端按它定位（并在 root 子树内做越权校验）。 */
  path: string;
  isDir: boolean;
  /** 字节数；目录为 0。 */
  size: number;
  /** 毫秒时间戳。 */
  mtime: number;
  /** 小写扩展名，含点（`''` = 无扩展名）。 */
  ext: string;
}

/**
 * 一次目录列举。
 * `root` 是会话工作目录（读文件时的白名单根），`dir` 是当前这一层。
 */
export interface ArtifactListing {
  root: string;
  dir: string;
  parent: string | null;
  entries: ArtifactEntry[];
}

/** 打开一件产物读到的内容（文本）。 */
export interface ArtifactContent {
  content: string;
  size: number;
  truncated: boolean;
}

export type MsgKind = 'text' | 'run' | 'team' | 'artifact';

export interface Message {
  id: string;
  role: MsgRole;
  /** 发言者显示名（role=agent 时必填）。 */
  author?: string;
  time: string;
  kind: MsgKind;
  text?: string;
  run?: RunPayload;
  team?: TeamPayload;
  artifacts?: ArtifactPayload[];
  /** 这条消息带上的附件（用户气泡里显示成小 chip）。 */
  attachments?: AttachmentRef[];
  /** 这条消息引用的知识包 id（显示成小 chip）。 */
  knowledge?: string[];
  /** 回复指向的裸 message id（后端 reply_to 原样存、按裸 id 匹配）。 */
  replyTo?: string;
}

/* ── 会话时间线（对齐后端 lib/contracts.ts 的 TimelineMessage 模型）─────────
   一条会话不是「一串气泡」，而是**一条有序、带类型的时间线**：
   用户开口 → 思考 → 工具调用 → 正文 → 收尾，每步都是独立一格。
   界面按 `kind` 分派给小组件，而不是各自维护十个状态槽去猜先后。

   字段名保持线上原样（snake_case）：这是一份 20+ 分支的判别联合，
   逐字段改名只多出一层永远会漏的翻译；映射层只做防御式收敛
   （丢残帧、保证 id/kind/ts 存在），不改名。
   ---------------------------------------------------------------------- */

/** 时间线里步骤树的一行。 */
export interface TimelineStep {
  name: string;
  status: 'done' | 'running' | 'pending';
  elapsed_ms?: number;
  substeps?: TimelineStep[];
}

/** 一行 diff。 */
export interface TimelineDiffLine {
  no: number;
  mark: '+' | '-' | ' ';
  code: string;
}

/** 计划卡里的一行任务（状态会随 run 推进被 patch 改）。 */
export interface TimelinePlanTask {
  id: string;
  title: string;
  assignee?: string;
  agent_id?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  batch?: number;
  elapsed_ms?: number;
  note?: string;
}

/** 用户消息随行的附件（后端拼好直链，前端不再自己拼）。 */
export interface TimelineAttachment {
  name: string;
  path: string;
  url: string;
  is_image: boolean;
  size?: number;
}

/**
 * 时间线上的一格。所有负载字段都是可选的 —— 后端每加一种 kind 或一个字段，
 * 界面不该因此崩；渲染器只取自己认识的那几个，缺了就少画一行。
 */
export interface TimelineMessage {
  id: string;
  /** 20+ 种之一（user_turn / thinking / tool_call / …）；未知值走兜底渲染。 */
  kind: string;
  /** 同一轮用户输入产生的消息共享它。 */
  turn_id: string;
  /** epoch ms。 */
  ts: number;

  /* 正文类 */
  text?: string;
  body?: string;
  streaming?: boolean;

  /* 过程类（thinking / status_line / msg_foot） */
  label?: string;
  preview?: string;
  tokens?: number;
  duration_ms?: number;
  status?: string;
  verb?: string;
  elapsed_s?: number;
  tools_running?: number;
  terminal?: boolean;
  elapsed_ms?: number;
  tools?: number;
  cost_cny?: number;
  /** assistant_meta：哪个模型、以什么身份、一句摘要。 */
  model_brand?: string;
  model_ver?: string;
  identity?: string;
  /** rationale：思路要点。 */
  bullets?: string[];

  /* 工具 */
  name?: string;
  args_summary?: string;
  result_summary?: string;
  link?: { label: string; href: string };

  /* 归属：群聊 fanout 下这一格是谁的 */
  agent_id?: string;
  agent_name?: string;
  sender_name?: string;

  /* 结构化块 */
  steps?: TimelineStep[];
  total_steps?: number;
  lines?: TimelineDiffLine[];
  filename?: string;
  path?: string;
  added?: number;
  removed?: number;
  tasks?: TimelinePlanTask[];
  title?: string;
  goal?: string;
  columns?: string[];
  rows?: (string | number)[][];
  caption?: string;

  /* 意图派发 / 交接 */
  intent?: string;
  target_kind?: 'team' | 'agent' | string;
  target_name?: string;
  reason?: string;
  assignments?: { agent_id: string; name: string; title: string }[];
  from_agent?: string;
  to_agent?: string;
  from_name?: string;
  to_name?: string;
  /** 交接结算时上游产出的字符数（0 = 无产出）。 */
  output_chars?: number;
  /** 终态原因：错误信息 / 被拒理由 / 中止来源。 */
  detail?: string;

  /* 提交记录 */
  repo?: string;
  sha?: string;
  short_sha?: string;
  message?: string;
  author?: string;
  files_changed?: number;
  insertions?: number;
  deletions?: number;

  /* 图 / 网页 / 产物 / 裁决 */
  src?: string;
  alt?: string;
  url?: string;
  artifact_type?: string;
  /** 产物卡上的补充说明。 */
  note?: string;
  passed?: boolean;
  score?: number;
  max_score?: number;
  summary?: string;
  metrics?: { label: string; value: string | number; detail?: string }[];
  notes?: string[];

  /* 杂项 */
  attachments?: TimelineAttachment[];
  source?: string;
  /** 该格由哪条 run 产出（run 流订阅时补上，便于按任务切片）。 */
  session_id?: string;
}

/** 一次 run 的紧凑引用（时间线回包里的 `runs[]`）。 */
export interface RunRef {
  sessionId: string;
  /** running / pending = 还在跑；其余（done / failed / canceled / idle）都是终态。 */
  status: string;
}

/**
 * 流式补丁（run 流里的 `message-patch` 帧）。
 *
 * 形状故意宽松：每个 op 只认识自己那几个字段，认不出的原样忽略 ——
 * 这样后端加一个新 op 时，老前端只是少长一块，不会整条流报错。
 */
export interface TimelinePatch {
  id: string;
  op: string;
  chunk?: unknown;
  step?: unknown;
  index?: unknown;
  patch?: unknown;
  step_index?: unknown;
  sub?: unknown;
  sub_index?: unknown;
  line?: unknown;
  task_id?: unknown;
  tokens?: unknown;
  duration_ms?: unknown;
  result_summary?: unknown;
  status?: unknown;
}

/** GET /api/groups/:id/timeline 的一次完整读取。 */
export interface TimelineSnapshot {
  messages: TimelineMessage[];
  runs: RunRef[];
  /** 超过后端上限（500 条）时为真：最早的那些已被截掉。 */
  truncated: boolean;
}

/** 订一条 run 过程流时要接的三件事（数据源实现决定走 SSE 还是别的）。 */
export interface RunStreamHandlers {
  /** 新的一格。 */
  onMessage: (msg: TimelineMessage) => void;
  /** 就地长一块（流式正文、步骤树、工具终态）。 */
  onPatch: (patch: TimelinePatch) => void;
  /** 这一轮有了结论（跑完 / 出错 / 中止）：该重读一次全量补齐收尾与终态。 */
  onSettle: () => void;
}

export interface Session {
  id: string;
  title: string;
  kind: 'dm' | 'group' | 'project';
  members: string[];
  updatedAt: string;
  unread?: number;
  status?: 'active' | 'idle' | 'done';
}

/* ── 会话列表右侧的「项目与 Agent」树 ─────────────────────────────── */

/** 项目树里的一项：项目 + 其下的会话行。 */
export interface ProjectNode {
  id: string;
  name: string;
  /** 项目绑定的工作目录（分组菜单「打开文件夹」用）。 */
  workspacePath?: string;
  sessions: Array<{ id: string; title: string; status?: string }>;
}

/* ── 右栏：策略举证 / DAG 工作流 ───────────────────────────────────── */

/** 团队成员（右栏编队、策略矩阵行列头、DAG 节点归属都读它）。 */
export interface RosterMember {
  id: string;
  name: string;
  role: string;
  /** 行头用的短名（角色缩写，2 字最佳）；缺省回落 name。 */
  short?: string;
  /** 手上在做什么。 */
  note?: string;
  state?: 'busy' | 'idle';
}

/** 策略举证三态（对齐后端 policy-gate：permit 允许 / warn 需复核 / deny 禁止）。 */
export type PolicyState = 'permit' | 'warn' | 'deny';

/** roster × roster 策略矩阵：matrix[from][to]（行发起、列接收，与运行时 gate 一致）。 */
export type PolicyMatrix = Record<string, Record<string, PolicyState>>;

/** DAG 节点状态（沿用步骤状态语义）。 */
export interface DagNodeDef {
  id: string;
  label: string;
  /**
   * 承担该节点的成员 **roster id**（不是角色名）。
   * 必须与策略矩阵的键同源，否则「矩阵 → 连线染色」永远查不到。
   */
  owner: string;
  role: string;
  status: StepStatus;
  /** 交接方式：直接 / 条件 / 审批门。 */
  mode?: 'direct' | 'conditional' | 'approve';
  /**
   * 最近一次交付摘录（会话流里该成员最后一条 agent 消息的开头）。
   * 由数据层投影填入（applyRunState）；存图本身没有，组件不自己拼。
   */
  detail?: string;
  /**
   * 画布坐标（设计像素）。布局是**数据**不是组件常量 ——
   * 加一个节点只需在数据里给坐标，DagFlow 不认识任何具体节点的 id。
   * 缺省时由 DagFlow 按顺序自动竖排。
   */
  layout?: { x: number; y: number; w: number; h: number };
}

/** DAG 画布的设计尺寸（坐标系统一按此缩放）。 */
export interface DagCanvasSize {
  w: number;
  h: number;
}

export interface DagEdgeDef {
  from: string;
  to: string;
  mode: 'direct' | 'conditional' | 'approve';
  label?: string;
}

/** 一张完整的工作流图（画布尺寸 + 节点 + 连线），右栏一次取全。 */
export interface DagDataset {
  canvas: DagCanvasSize;
  nodes: DagNodeDef[];
  edges: DagEdgeDef[];
}

export interface PanelStep {
  label: string;
  done: boolean;
  /** 执行该步的角色显示名（头像与文字都走它）。 */
  agent: string;
  /** 耗时（毫秒）；未开始就不填。 */
  ms?: number;
}

export interface PanelApproval {
  /** 审批门数量说明，如「1 道审批门」。 */
  gate: string;
  /** 门后那一句话。 */
  note: string;
  /**
   * 挂起审批门的 DAG 节点 id；有它才显示「批准 / 拒绝」动作
   * （没拿到 nodeId 时只展示提示文案，不出按钮）。
   */
  nodeId?: string;
}

export interface PanelSummary {
  /** 本轮执行的标题（右栏「执行中」那张卡）。 */
  runTitle: string;
  /** 已耗时文案，如「12m 40s」。 */
  elapsed: string;
  contextPct: number;
  tokensUsed: number;
  tokensCap: number;
  steps: PanelStep[];
  artifacts: ArtifactPayload[];
  subAgents: { name: string; state: 'ready' | 'busy' | 'off' }[];
  approval?: PanelApproval;
}

/* ── 输入框（composer）：模型 / 命令 / 知识包 / 附件 ───────────────── */

/** 一个可选模型。分组名相同者排在一起（CLI 与 API 两大类）。 */
export interface ModelRef {
  id: string;
  label: string;
  group: string;
  /** 副标题：版本、厂商、备注。 */
  note?: string;
}

/**
 * 斜杠命令。两种行为二选一：
 *   insert —— 把模板文字插进输入框（用户再补细节）
 *   action —— 直接做一件事（清空 / 打开帮助 / 跳到执行面板）
 */
export interface ComposerCommand {
  id: string;
  /** 含斜杠的命令名，如 `/clear`。 */
  name: string;
  desc: string;
  insert?: string;
  action?: 'clear' | 'help' | 'inspect';
}

/** 知识包（多模态记忆库里的一包文档），勾选后随消息检索注入。 */
export interface KnowledgePack {
  id: string;
  name: string;
  desc?: string;
  /** 包内文档数。 */
  docs: number;
}

/** 输入框所需的全部可选资源，随工作台一次取回。 */
export interface ComposerData {
  models: ModelRef[];
  commands: ComposerCommand[];
  knowledge: KnowledgePack[];
}

/** 已选附件。演示态只带名字与本地预览；接后端时换成上传后的 id。 */
export interface AttachmentRef {
  id: string;
  name: string;
  kind: 'image' | 'file';
  /** 图片的本地预览地址（object URL），非图片没有。 */
  preview?: string;
  size: string;
}

/** 一次发送携带的内容。 */
export interface Outbound {
  text: string;
  attachments?: AttachmentRef[];
  /** 本轮勾选的知识包 id。 */
  knowledge?: string[];
  model?: string;
  /** 回复指向的消息：裸 message id；空表示普通消息。 */
  replyTo?: string;
}

/** 输入框引用条：点消息「回复」后灌进 Composer 的引用目标。 */
export interface ReplyQuote {
  /** 时间线消息 id（发送层剥 chat_ 前缀后作 reply_to 落库）。 */
  messageId: string;
  author: string;
  /** 正文摘录，只用于输入框引用条展示。 */
  text: string;
}

/* ── 设置（settings sheet） ─────────────────────────────────────────
   形状对齐旧前端 SettingsPage 的有用分支：个人资料 / 外观 / 写作规范 /
   模型与密钥（BYOK）/ 本地 CLI / 连接器 / 知识与记忆 / 协作 / 通知 / 数据。
   外观里的风格与动效属于纯客户端偏好，放在 theme / ui 的 context 里，不在此。
   ------------------------------------------------------------------ */

/** 个人资料：谁在用这套工作台。 */
export interface UserProfile {
  name: string;
  email: string;
  /** 单位 / 课题组。 */
  org: string;
  timezone: string;
}

/** 写作规范：影响主控下发给各角色的系统提示，不只是界面。 */
export interface WritingRules {
  /** 引用样式 id，见 SETTINGS_COPY.writing.citation.options。 */
  citation: string;
  dateFormat: string;
  /** 参考文献语言：中英混排 / 仅英文 / 仅中文。 */
  refLang: string;
  /** 图表、章节自动编号。 */
  autoNumber: boolean;
}

/** 一个模型供应商（BYOK：自带 Key）。 */
export interface ProviderSetting {
  id: string;
  name: string;
  vendor: string;
  tone: ToneName;
  /** 打码后的 Key；未配置为空串。 */
  key: string;
  models: string[];
  defaultModel: string;
  /** 是否参与路由。 */
  on: boolean;
  state: 'ok' | 'idle' | 'error';
}

/** 本机 CLI 探测结果（本地跑 agent 的那几个）。 */
export interface CliProbe {
  id: string;
  name: string;
  bin: string;
  version: string;
  path: string;
  installed: boolean;
  /** 后端 installable：false = copy-only，只能复制命令手动执行。 */
  installable?: boolean;
  /** 后端 uninstallable：false = 需按 uninstallCmd 手动卸载。 */
  uninstallable?: boolean;
  /** 安装命令原文（后端 install_cmd）。 */
  installCmd?: string;
  /** 手动卸载引导（后端 uninstall_cmd）。 */
  uninstallCmd?: string;
  /** 官网 / 文档链接（后端 homepage）。 */
  homepage?: string;
  /** 后端 is_claw（ClawHub 门面标记）。 */
  isClaw?: boolean;
}

/** 连接器 / MCP：外部数据源。 */
export interface ConnectorSetting {
  id: string;
  name: string;
  desc: string;
  tone: ToneName;
  on: boolean;
  state: 'ok' | 'expired' | 'off';
}

/** 记忆三区（对齐后端 lessons / 画像 / River 手动）。 */
export interface MemoryZone {
  id: string;
  label: string;
  note: string;
  on: boolean;
  /** 已用条数。 */
  used: number;
  /** 容量条数。 */
  cap: number;
}

/**
 * 通用偏好项：开关（`on`）或单选（`value`）。
 * 选项的**文案**在 `content/settings.ts`：数据只存 id 与当前值，不存中文。
 */
export interface PrefItem {
  id: string;
  label: string;
  note?: string;
  on?: boolean;
  /** 单选项的当前值。 */
  value?: string;
}

/**
 * SSH 远程执行目标：论文团的实验真正跑在远端 GPU 机器上，
 * 主控把「跑实验 / 拉日志 / 取图」这类活派过去。
 */
export interface SshHost {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  /** 私钥路径（本机绝对路径）。 */
  keyPath: string;
  /** 远端工作目录，产物默认落这里。 */
  remoteDir: string;
  state: 'ok' | 'untested' | 'error';
  /** 最近一次连通耗时（毫秒）。 */
  latencyMs?: number;
  /** 远端显卡摘要。 */
  gpu?: string;
}

export interface AppSettings {
  profile: UserProfile;
  writing: WritingRules;
  providers: ProviderSetting[];
  clis: CliProbe[];
  ssh: SshHost[];
  connectors: ConnectorSetting[];
  memory: MemoryZone[];
  collab: PrefItem[];
  notify: PrefItem[];
  privacy: PrefItem[];
}

/* ── ARC 管线观测（AutoResearchClaw run 的阶段视图 / 终稿 / 核验） ──── */

/** ARC run 的整体状态。 */
export type ArcRunStatus = 'running' | 'succeeded' | 'failed' | 'paused' | 'unknown';

/** run 里的一份文件（相对 run 目录的路径，读内容/直链都用它）。 */
export interface ArcRunFile {
  name: string;
  path: string;
  kind: string;
  size: number;
}

/** 管线里的一个阶段（右栏「管线」时间线的一行 + 展开后的产物清单）。 */
export interface ArcStageView {
  index: number;
  key: string;
  label: string;
  /** 相位字母 A..H 与中文名（时间线按相位分组）。 */
  phase: string;
  phaseLabel: string;
  /** 审批门：需要人批准的阶段（虚线框 + 盾牌徽标）。 */
  isGate: boolean;
  status: 'pending' | 'running' | 'done' | 'failed' | 'paused' | 'skipped';
  /** 该阶段的尝试轮次（ITERATIVE_REFINE 多轮 = 2+）。 */
  attempts: number;
  /** decision.json 的决定（proceed / refine / pivot），链路可解释。 */
  decision: string | null;
  durationSec: number | null;
  error: string | null;
  artifacts: ArcRunFile[];
}

/** 引用核验清单的一行（verification_report.json → 界面直接渲染）。 */
export interface ArcVerifyItem {
  citeKey: string;
  title: string;
  status: string;
  method: string | null;
  confidence: number | null;
}

/** 一次 ARC run 的完整观测视图。 */
export interface ArcPipelineView {
  runId: string;
  status: ArcRunStatus;
  doneCount: number;
  total: number;
  updatedAt: string | null;
  /** 课题（stage-01/goal.md 的一级标题），可能为空。 */
  topic: string | null;
  stages: ArcStageView[];
  deliverables: ArcRunFile[];
  verification: {
    total: number;
    verified: number;
    suspicious: number;
    hallucinated: number;
    integrityScore: number | null;
    items: ArcVerifyItem[];
  } | null;
  quality: {
    score: number | null;
    verdict: string | null;
    strengths: string[];
    weaknesses: string[];
  } | null;
  decisions: Array<{
    decision: string;
    rollbackTarget: string | null;
    rollbackStage: number | null;
    attempt: number | null;
    timestamp: string | null;
  }>;
}

/** run 列表里的一张摘要卡。 */
export interface ArcRunCard {
  runId: string;
  status: ArcRunStatus;
  doneCount: number;
  total: number;
  updatedAt: string | null;
  topic: string | null;
}

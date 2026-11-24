import type { ToneName } from '../theme/tones';

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

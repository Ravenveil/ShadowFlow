/** 论文平台数据模型（前端先行；后续替换为 /api 真实数据）。 */

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

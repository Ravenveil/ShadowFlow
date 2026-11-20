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
}

export interface DagEdgeDef {
  from: string;
  to: string;
  mode: 'direct' | 'conditional' | 'approve';
  label?: string;
}

export interface PanelSummary {
  contextPct: number;
  tokensUsed: number;
  tokensCap: number;
  steps: { label: string; done: boolean }[];
  artifacts: ArtifactPayload[];
  subAgents: { name: string; state: 'ready' | 'busy' | 'off' }[];
}

/**
 * 落库编排纯函数 —— 从 RunSessionPage 的 auto-save useEffect 抽出。
 *
 * 旧代码把 putTeamWorkflow/putTeamPolicy 包在 `try{}catch(e){console.warn}` 里、
 * 失败也照样 setSaveState('ok')(假成功,= 设计文档 P0-b / §9 P1 风险 #4)。
 * 本函数把每一步的成败聚合进 PersistResult,关键步(workflow/policy)失败 →
 * fullyPersisted=false,让调用方如实报 'failed'。group 失败容忍(后端可能没接)。
 */
import type { TeamWorkflow } from '../../api/teams';

export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface PersistSteps {
  agents: StepStatus;
  team: StepStatus;
  workflow: StepStatus;
  policy: StepStatus;
  group: StepStatus;
}

export interface PersistResult {
  teamId: string | null;
  groupId: string | null;
  agentIds: string[];
  steps: PersistSteps;
  /** team/agents 这类关键前置失败 → 整个落库中止,teamId 为 null。 */
  fatalError: Error | null;
  /** 非致命步骤失败清单(team 已建但不完整)。group 不计入「完整」。 */
  failedSteps: Array<keyof PersistSteps>;
  /** 仅当 team + workflow + policy 都成功才为 true(group 失败可容忍)。 */
  fullyPersisted: boolean;
}

export type PolicyMatrix = Record<string, Record<string, string>>;

export interface AgentSpec {
  name: string;
  soul: string;
  workspace_id?: string;
  model?: string;
  tools?: string[];
  raci?: unknown;
}

export interface PersistDeps {
  quickCreateAgent: (spec: AgentSpec) => Promise<{ agent_id: string }>;
  createTeam: (req: { name: string; description: string; agent_ids: string[]; workspace_id?: string }) => Promise<{ team_id: string }>;
  putTeamWorkflow: (teamId: string, wf: TeamWorkflow) => Promise<void>;
  putTeamPolicy: (teamId: string, matrix: PolicyMatrix) => Promise<void>;
  createGroup: (req: unknown) => Promise<{ groupId?: string } | null>;
}

export interface PersistInput {
  agentSpecs: AgentSpec[];
  teamMeta: { name: string; description: string; workspaceId?: string };
  buildWorkflow: (agentIds: string[]) => TeamWorkflow;
  buildPolicyMatrix: (agentIds: string[]) => PolicyMatrix;
  buildGroup: (teamId: string, agentIds: string[], policyMatrix: PolicyMatrix) => unknown;
}

export async function persistAssembledTeam(
  input: PersistInput,
  deps: PersistDeps,
): Promise<PersistResult> {
  const steps: PersistSteps = {
    agents: 'skipped', team: 'skipped', workflow: 'skipped', policy: 'skipped', group: 'skipped',
  };
  const failedSteps: Array<keyof PersistSteps> = [];

  // 关键前置:agents + team。任一失败 → fatal,整体中止。
  let agentIds: string[];
  let teamId: string;
  try {
    const created = await Promise.all(input.agentSpecs.map((s) => deps.quickCreateAgent(s)));
    agentIds = created.map((a) => a.agent_id);
    steps.agents = 'ok';
  } catch (e) {
    steps.agents = 'failed';
    return { teamId: null, groupId: null, agentIds: [], steps, fatalError: asError(e), failedSteps: ['agents'], fullyPersisted: false };
  }
  try {
    const team = await deps.createTeam({
      name: input.teamMeta.name,
      description: input.teamMeta.description,
      agent_ids: agentIds,
      workspace_id: input.teamMeta.workspaceId,
    });
    teamId = team.team_id;
    steps.team = 'ok';
  } catch (e) {
    failedSteps.push('team');
    return { teamId: null, groupId: null, agentIds, steps, fatalError: asError(e), failedSteps, fullyPersisted: false };
  }

  // 关键持久化:workflow + policy。失败标记但不中止(team 本体已在)。
  try {
    await deps.putTeamWorkflow(teamId, input.buildWorkflow(agentIds));
    steps.workflow = 'ok';
  } catch {
    steps.workflow = 'failed';
    failedSteps.push('workflow');
  }

  const policyMatrix = input.buildPolicyMatrix(agentIds);
  if (Object.keys(policyMatrix).length > 0) {
    try {
      await deps.putTeamPolicy(teamId, policyMatrix);
      steps.policy = 'ok';
    } catch {
      steps.policy = 'failed';
      failedSteps.push('policy');
    }
  } else {
    steps.policy = 'ok'; // 没有权责矩阵可存 = 视为通过
  }

  // 非关键:group。失败容忍。
  let groupId: string | null = null;
  try {
    const grp = await deps.createGroup(input.buildGroup(teamId, agentIds, policyMatrix));
    groupId = grp?.groupId ?? null;
    steps.group = 'ok';
  } catch {
    steps.group = 'failed';
    failedSteps.push('group');
  }

  const fullyPersisted = steps.team === 'ok' && steps.workflow === 'ok' && steps.policy === 'ok';
  return { teamId, groupId, agentIds, steps, fatalError: null, failedSteps, fullyPersisted };
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

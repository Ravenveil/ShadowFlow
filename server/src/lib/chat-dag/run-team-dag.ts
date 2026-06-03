/**
 * run-team-dag.ts — chat DAG 执行器编排核心(批 2 Phase 2a)。
 *
 * 按 computeDagLayers 的层序跑:层间有序、同层并行(Promise.all)。每个下游 agent 的输入
 * = 用户原始消息(由调用方放进 callAgent 的 prompt)+ 上游 agent 产出,上游产出按 gate 过滤:
 *   deny → 不喂该上游产出,发系统注释、deniedEdges++;
 *   warn → 仍喂,发提醒注释、warnedEdges++;
 *   permit → 静默喂。
 * 每个 agent 产出经 deps.postMessage 落库(sender_kind='agent')。所有 I/O 经 deps 注入。
 *
 * 不在本阶段:节点超时/僵死/中断恢复(2b)、conditional 回归边的 rework 执行(Phase 3)。
 */
import type { TeamRunShape } from '../team-source';
import { computeDagLayers } from './dag-layers';
import { gate } from './policy-gate';

export interface UpstreamMsg { from: string; text: string }

export interface RunTeamDagDeps {
  getAgent: (agentId: string) => Promise<{ name: string; soul: string } | null>;
  callAgent: (args: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[] }) => Promise<{ text: string; error?: string }>;
  postMessage: (msg: { content: string; sender_name: string; sender_kind: 'agent' | 'system' }) => Promise<void>;
}

export type AgentOutcome = 'ok' | 'error' | 'empty';

export interface RunTeamDagResult {
  ranLayers: number;
  perAgent: Record<string, AgentOutcome>;
  deniedEdges: number;
  warnedEdges: number;
}

export async function runTeamDagFanout(
  team: TeamRunShape,
  deps: RunTeamDagDeps,
  _userPrompt: string,
): Promise<RunTeamDagResult> {
  const { layers } = computeDagLayers(team.members, team.edges);
  // 前向边的入边索引(用于给下游收集上游)。conditional 已被 computeDagLayers 排除,这里同样只看非 conditional。
  const incoming = new Map<string, string[]>();
  for (const e of team.edges) {
    if (e.kind === 'conditional') continue;
    if (!team.members.includes(e.from) || !team.members.includes(e.to)) continue;
    if (e.from === e.to) continue;
    (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e.from);
  }

  const outputs = new Map<string, string>(); // agentId → 非空产出
  const perAgent: Record<string, AgentOutcome> = {};
  let deniedEdges = 0;
  let warnedEdges = 0;

  for (const layer of layers) {
    await Promise.all(
      layer.map(async (agentId) => {
        // 收集上游产出,按 gate 过滤。
        const upstream: UpstreamMsg[] = [];
        for (const from of incoming.get(agentId) ?? []) {
          const verdict = gate(team.policy_matrix, from, agentId);
          if (verdict === 'deny') {
            deniedEdges++;
            await deps.postMessage({
              content: `[policy] ${from} → ${agentId} 被 deny 拦截,上游产出未传递。`,
              sender_name: 'system', sender_kind: 'system',
            });
            continue;
          }
          if (verdict === 'warn') {
            warnedEdges++;
            await deps.postMessage({
              content: `[policy] ${from} → ${agentId} warn 提醒(交到拍板/审核点),仍放行。`,
              sender_name: 'system', sender_kind: 'system',
            });
          }
          const text = outputs.get(from);
          if (text) upstream.push({ from, text });
        }

        const agent = await deps.getAgent(agentId);
        if (!agent) {
          perAgent[agentId] = 'error';
          await deps.postMessage({ content: `[chat] Agent '${agentId}' not found.`, sender_name: 'system', sender_kind: 'system' });
          return;
        }

        let res: { text: string; error?: string };
        try {
          res = await deps.callAgent({ agentId, name: agent.name, soul: agent.soul, upstream });
        } catch (e) {
          res = { text: '', error: e instanceof Error ? e.message : String(e) };
        }

        if (res.error) {
          perAgent[agentId] = 'error';
          await deps.postMessage({ content: `[chat] ${agent.name} 出错：${res.error}`, sender_name: 'system', sender_kind: 'system' });
          return;
        }
        const reply = res.text.trim();
        if (!reply) {
          perAgent[agentId] = 'empty';
          await deps.postMessage({ content: `[chat] ${agent.name} 返回空回复。`, sender_name: 'system', sender_kind: 'system' });
          return;
        }
        outputs.set(agentId, reply);
        perAgent[agentId] = 'ok';
        await deps.postMessage({ content: reply, sender_name: agent.name, sender_kind: 'agent' });
      }),
    );
  }

  return { ranLayers: layers.length, perAgent, deniedEdges, warnedEdges };
}

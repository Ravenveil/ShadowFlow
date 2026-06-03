/**
 * run-team-dag.ts — chat DAG 执行器编排核心(批 2 Phase 2a + 2b 加固)。
 *
 * 按 computeDagLayers 的层序跑:层间有序、同层并发(mapLimit 有界,B5)。每个下游 agent 的
 * 输入 = 用户原始消息(调用方 bake 进 callAgent)+ 上游产出,上游按 gate 过滤(deny/warn/permit)。
 * 每节点经 runNodeWithPolicy 跑:超时(B1)+ 重试(B4)+ 外部取消(B6)。signal abort → 不再起
 * 新层/新节点,剩余标 'aborted'。产出经 deps.postMessage 落库。所有 I/O 经 deps 注入。
 *
 * 不在本阶段:中断恢复/hydrate(B2)、用户插话完整续跑(B3)、conditional rework(Phase 3)。
 */
import type { TeamRunShape } from '../team-source';
import { computeDagLayers } from './dag-layers';
import { gate } from './policy-gate';
import { mapLimit } from './map-limit';
import { runNodeWithPolicy } from './node-policy';

export interface UpstreamMsg { from: string; text: string }

export interface RunTeamDagDeps {
  getAgent: (agentId: string) => Promise<{ name: string; soul: string } | null>;
  callAgent: (args: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[]; signal: AbortSignal }) => Promise<{ text: string; error?: string }>;
  postMessage: (msg: { content: string; sender_name: string; sender_kind: 'agent' | 'system' }) => Promise<void>;
}

export type AgentOutcome = 'ok' | 'error' | 'empty' | 'timeout' | 'aborted';

export interface RunTeamDagResult {
  ranLayers: number;
  perAgent: Record<string, AgentOutcome>;
  deniedEdges: number;
  warnedEdges: number;
  aborted: boolean;
}

export interface RunTeamDagOpts {
  /** 外部取消信号(B6)。abort → 停止起新节点,剩余标 'aborted'。 */
  signal?: AbortSignal;
  /** 同层最大并发(B5)。默认 5。 */
  maxConcurrency?: number;
  /** 单节点超时 ms(B1)。默认 120000。 */
  nodeTimeoutMs?: number;
  /** 入边无 max_retries 时的默认重试预算(B4)。默认 1。 */
  defaultMaxRetries?: number;
}

export async function runTeamDagFanout(
  team: TeamRunShape,
  deps: RunTeamDagDeps,
  _userPrompt: string,
  opts: RunTeamDagOpts = {},
): Promise<RunTeamDagResult> {
  const signal = opts.signal ?? new AbortController().signal;
  const maxConcurrency = opts.maxConcurrency ?? 5;
  const nodeTimeoutMs = opts.nodeTimeoutMs ?? 120_000;
  const defaultMaxRetries = opts.defaultMaxRetries ?? 1;

  const { layers } = computeDagLayers(team.members, team.edges);

  // 前向边索引:入边来源(收集上游)+ 入边 max_retries(B4 预算)。conditional/幽灵/自环排除。
  const incoming = new Map<string, string[]>();
  const retryBudget = new Map<string, number>();
  for (const e of team.edges) {
    if (e.kind === 'conditional') continue;
    if (!team.members.includes(e.from) || !team.members.includes(e.to)) continue;
    if (e.from === e.to) continue;
    let list = incoming.get(e.to);
    if (!list) { list = []; incoming.set(e.to, list); }
    list.push(e.from);
    if (typeof e.max_retries === 'number') {
      retryBudget.set(e.to, Math.max(retryBudget.get(e.to) ?? 0, e.max_retries));
    }
  }

  const outputs = new Map<string, string>();
  const perAgent: Record<string, AgentOutcome> = {};
  let deniedEdges = 0;
  let warnedEdges = 0;
  let aborted = false;

  let ranLayers = 0;
  for (const layer of layers) {
    if (signal.aborted || aborted) { aborted = true; break; } // 外部已取消或节点已 abort:不再起新层
    await mapLimit(layer, maxConcurrency, async (agentId) => {
      // 快速跳过(非唯一屏障):runNodeWithPolicy 入口会再查 signal.aborted 作硬屏障。
      if (signal.aborted || aborted) { perAgent[agentId] = 'aborted'; return; }

      // 上游产出按 gate 过滤。
      const upstream: UpstreamMsg[] = [];
      for (const from of incoming.get(agentId) ?? []) {
        const verdict = gate(team.policy_matrix, from, agentId);
        if (verdict === 'deny') {
          deniedEdges++;
          await deps.postMessage({ content: `[policy] ${from} → ${agentId} 被 deny 拦截,上游产出未传递。`, sender_name: 'system', sender_kind: 'system' });
          continue;
        }
        const text = outputs.get(from);
        if (verdict === 'warn') {
          warnedEdges++;
          await deps.postMessage({
            content: text
              ? `[policy] ${from} → ${agentId} warn 提醒(交到拍板/审核点),仍放行。`
              : `[policy] ${from} → ${agentId} warn 提醒;但上游无产出,无内容可传递。`,
            sender_name: 'system', sender_kind: 'system',
          });
        }
        if (text) upstream.push({ from, text });
      }

      const agent = await deps.getAgent(agentId);
      if (!agent) {
        perAgent[agentId] = 'error';
        await deps.postMessage({ content: `[chat] Agent '${agentId}' not found.`, sender_name: 'system', sender_kind: 'system' });
        return;
      }

      const maxRetries = retryBudget.get(agentId) ?? defaultMaxRetries;
      const res = await runNodeWithPolicy(
        (attemptSignal) => deps.callAgent({ agentId, name: agent.name, soul: agent.soul, upstream, signal: attemptSignal }),
        { timeoutMs: nodeTimeoutMs, maxRetries, signal },
      );

      if (res.reason === 'aborted') { perAgent[agentId] = 'aborted'; aborted = true; return; }
      if (res.reason === 'timeout') {
        perAgent[agentId] = 'timeout';
        await deps.postMessage({ content: `[chat] ${agent.name} 超时(${nodeTimeoutMs}ms)未响应,已放弃该节点。`, sender_name: 'system', sender_kind: 'system' });
        return;
      }
      if (res.reason === 'error') {
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
    });
    ranLayers++;
  }

  // 未被执行到的节点(abort break 跳过的层)统一标 aborted。
  if (aborted) {
    for (const id of team.members) {
      if (!(id in perAgent)) perAgent[id] = 'aborted';
    }
  }

  return { ranLayers, perAgent, deniedEdges, warnedEdges, aborted };
}

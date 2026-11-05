/**
 * run-team-dag.ts — chat DAG 执行器编排核心(批 2 Phase 2a + 2b 加固)。
 *
 * 按 computeDagLayers 的层序跑:层间有序、同层并发(mapLimit 有界,B5)。每个下游 agent 的
 * 输入 = 用户原始消息(调用方 bake 进 callAgent)+ 上游产出,上游按 gate 过滤(deny/warn/permit)。
 * 每节点经 runNodeWithPolicy 跑:超时(B1)+ 重试(B4)+ 外部取消(B6)。signal abort → 不再起
 * 新层/新节点,剩余标 'aborted'。产出经 deps.postMessage 落库。所有 I/O 经 deps 注入。
 *
 * 2026-11-05 交接记录 + 失败传播（设计移植自 CopilotKit/OpenBot 的 hop/work_items）：
 *   - deps.hops 可选注入 — 每条前向边（A→B 交接）open→settle 全生命周期落库；
 *     不注入则零开销（纯内存路径/旧测试不变）。
 *   - 上游 failed/timeout/empty/aborted 时，下游 upstream 注入一条系统失败通知
 *     （失败传播），下游知情自适应，不再带着残缺上下文瞎跑。
 *
 * 不在本阶段:中断恢复/hydrate(B2)、用户插话完整续跑(B3)、conditional rework(Phase 3)。
 */
import type { TeamRunShape } from '../team-source';
import { computeDagLayers } from './dag-layers';
import { gate } from './policy-gate';
import { mapLimit } from './map-limit';
import { runNodeWithPolicy } from './node-policy';

export interface UpstreamMsg { from: string; text: string }

/**
 * 交接记录器 — 每条 DAG 前向边（from→to 交接）一个 hop。由调用方实现（生产环境
 * 落 SQLite storage/agent-hops.ts，测试用内存 Map），执行器只按生命周期回调。
 */
export interface HopRecorder {
  /** 边开始处理时开 hop，返回 id。 */
  open: (edge: { from: string; to: string }) => string;
  /** 开 hop 后、出结果前标记 running（可选步骤）。 */
  start: (id: string) => void;
  /** 结算为终态。幂等（已结算不覆盖）。 */
  settle: (
    id: string,
    status: 'done' | 'failed' | 'timeout' | 'empty' | 'denied' | 'aborted',
    opts?: { outputChars?: number; detail?: string },
  ) => void;
}

export interface RunTeamDagDeps {
  getAgent: (agentId: string) => Promise<{ name: string; soul: string } | null>;
  callAgent: (args: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[]; signal: AbortSignal }) => Promise<{ text: string; error?: string }>;
  postMessage: (msg: { content: string; sender_name: string; sender_kind: 'agent' | 'system'; agent_id?: string }) => Promise<void>;
  /** 可选：交接记录（2026-11-05）。不注入 = 行为与旧版完全一致。 */
  hops?: HopRecorder;
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
  // 2026-11-05 — 每条前向边同步记下 from→to（给 hop 记录器用；hop 在层循环里 open）。
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

  // 上游节点终态（2026-11-05 失败传播）— 下游组 upstream 时按它决定是否注入失败通知。
  const nodeOutcome = new Map<string, AgentOutcome>();
  /** 节点 error 时的错误消息（hop detail 用，timeout/empty 有固定文案）。 */
  const errMsgOf = new Map<string, string>();

  // hop 生命周期辅助 — hops 未注入时全部空操作，主循环零分支。
  const hops = deps.hops;
  const edgeHop = new Map<string, string>(); // "${from}→${to}" → hopId
  const hopIdFor = (from: string, to: string): string | null => {
    if (!hops) return null;
    const key = `${from}→${to}`;
    let id = edgeHop.get(key);
    if (!id) {
      id = hops.open({ from, to });
      edgeHop.set(key, id);
    }
    return id;
  };

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
        const hopId = hopIdFor(from, agentId);
        if (verdict === 'deny') {
          deniedEdges++;
          if (hops && hopId) hops.settle(hopId, 'denied', { detail: 'policy deny' });
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
        if (text) {
          if (hops && hopId) hops.settle(hopId, 'done', { outputChars: text.length });
          upstream.push({ from, text });
        } else {
          // 2026-11-05 失败传播 — 上游没产出（失败/超时/空/中止）时下游必须知情。
          // 边仍记 done 之前先看上游终态：上游压根没跑成 → 该交接按上游终态结算。
          const upOutcome = nodeOutcome.get(from);
          if (upOutcome && upOutcome !== 'ok') {
            if (hops && hopId) {
              const failDetail = upOutcome === 'error'
                ? (errMsgOf.get(from) ?? 'error')
                : `上游 ${from} ${upOutcome}`;
              hops.settle(hopId, upOutcome === 'aborted' ? 'aborted' : upOutcome === 'timeout' ? 'timeout' : upOutcome === 'empty' ? 'empty' : 'failed', {
                detail: failDetail,
              });
            }
            const upstreamName = (await deps.getAgent(from))?.name ?? from;
            upstream.push({
              from,
              text: `[系统通知] 上游 ${upstreamName} 本轮${upOutcome === 'timeout' ? '超时未响应' : upOutcome === 'empty' ? '返回空回复' : upOutcome === 'aborted' ? '被中止' : '执行失败'}，其交接内容缺失。请基于可用信息继续，并在产出中说明哪些部分因上游缺失可能不完整。`,
            });
          }
        }
      }

      const agent = await deps.getAgent(agentId);
      if (!agent) {
        perAgent[agentId] = 'error';
        nodeOutcome.set(agentId, 'error');
        await deps.postMessage({ content: `[chat] Agent '${agentId}' not found.`, sender_name: 'system', sender_kind: 'system' });
        return;
      }

      const maxRetries = retryBudget.get(agentId) ?? defaultMaxRetries;
      // 该节点作为上游的各条边在此刻 open（pending→running）——层序保证下游的
      // open 一定发生在上游 settle 之后，同层并发各自 open 自己的出边互不冲突。
      if (hops) {
        for (const e of team.edges) {
          if (e.from === agentId && e.kind !== 'conditional' && team.members.includes(e.to) && e.from !== e.to) {
            const id = hopIdFor(e.from, e.to);
            if (id) hops.start(id);
          }
        }
      }
      const res = await runNodeWithPolicy(
        (attemptSignal) => deps.callAgent({ agentId, name: agent.name, soul: agent.soul, upstream, signal: attemptSignal }),
        { timeoutMs: nodeTimeoutMs, maxRetries, signal },
      );

      if (res.reason === 'aborted') { perAgent[agentId] = 'aborted'; nodeOutcome.set(agentId, 'aborted'); aborted = true; return; }
      if (res.reason === 'timeout') {
        perAgent[agentId] = 'timeout';
        nodeOutcome.set(agentId, 'timeout');
        await deps.postMessage({ content: `[chat] ${agent.name} 超时(${nodeTimeoutMs}ms)未响应,已放弃该节点。`, sender_name: 'system', sender_kind: 'system' });
        return;
      }
      if (res.reason === 'error') {
        perAgent[agentId] = 'error';
        nodeOutcome.set(agentId, 'error');
        errMsgOf.set(agentId, res.error ?? '');
        await deps.postMessage({ content: `[chat] ${agent.name} 出错：${res.error}`, sender_name: 'system', sender_kind: 'system' });
        return;
      }
      const reply = res.text.trim();
      if (!reply) {
        perAgent[agentId] = 'empty';
        nodeOutcome.set(agentId, 'empty');
        await deps.postMessage({ content: `[chat] ${agent.name} 返回空回复。`, sender_name: 'system', sender_kind: 'system' });
        return;
      }
      outputs.set(agentId, reply);
      perAgent[agentId] = 'ok';
      nodeOutcome.set(agentId, 'ok');
      // U0 绑角色 — 带上发送者 agent_id（agentId 即 map key，恒在作用域）。
      await deps.postMessage({ content: reply, sender_name: agent.name, sender_kind: 'agent', agent_id: agentId });
    });
    ranLayers++;
  }

  // 未被执行到的节点(abort break 跳过的层)统一标 aborted。
  if (aborted) {
    for (const id of team.members) {
      if (!(id in perAgent)) perAgent[id] = 'aborted';
    }
  }

  // 收尾兜底 — 计划过的每条前向边都要有终态（OpenBot「work_items 不留悬空」的
  // 审计纪律）。没被显式结算的（下游没跑成/压根没轮到，如预先 abort）在此补
  // open + 结算，保证交接记录完整可审计。
  if (hops) {
    for (const e of team.edges) {
      if (e.kind === 'conditional' || !team.members.includes(e.from) || !team.members.includes(e.to) || e.from === e.to) continue;
      const hopId = hopIdFor(e.from, e.to);
      const fromOutcome = nodeOutcome.get(e.from) ?? 'aborted';
      const toOutcome = nodeOutcome.get(e.to);
      if (toOutcome !== 'ok') {
        const failDetail = fromOutcome === 'error'
          ? (errMsgOf.get(e.from) ?? 'error')
          : `回合结束兜底：${e.from}=${fromOutcome}, ${e.to}=${toOutcome ?? 'not_reached'}`;
        hops.settle(hopId!, fromOutcome === 'ok' ? 'aborted' : fromOutcome === 'timeout' ? 'timeout' : fromOutcome === 'empty' ? 'empty' : 'failed', {
          detail: failDetail,
        });
      }
    }
  }

  return { ranLayers, perAgent, deniedEdges, warnedEdges, aborted };
}

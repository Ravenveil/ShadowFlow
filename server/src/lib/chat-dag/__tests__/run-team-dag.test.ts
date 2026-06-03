import { describe, it, expect, vi } from 'vitest';
import { runTeamDagFanout, type RunTeamDagDeps, type UpstreamMsg } from '../run-team-dag';
import type { TeamRunShape } from '../../team-source';

function mkDeps(over: Partial<RunTeamDagDeps> = {}): RunTeamDagDeps & { posted: { sender_name: string; sender_kind: string; content: string }[]; callOrder: string[] } {
  const posted: { sender_name: string; sender_kind: string; content: string }[] = [];
  const callOrder: string[] = [];
  const deps: RunTeamDagDeps & { posted: typeof posted; callOrder: string[] } = {
    getAgent: vi.fn(async (id: string) => ({ name: id.toUpperCase(), soul: `soul-${id}` })),
    callAgent: vi.fn(async ({ agentId, upstream }: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[] }) => { callOrder.push(agentId); return { text: `${agentId}:reply(up=${upstream.map((u) => u.from).join('+') || 'none'})` }; }),
    postMessage: vi.fn(async (m) => { posted.push({ sender_name: m.sender_name, sender_kind: m.sender_kind, content: m.content }); }),
    posted, callOrder,
    ...over,
  };
  return deps;
}

const linear: TeamRunShape = {
  members: ['pm', 'arch', 'dev'],
  edges: [{ from: 'pm', to: 'arch', kind: 'sequential' }, { from: 'arch', to: 'dev', kind: 'sequential' }],
  policy_matrix: {},
};

describe('runTeamDagFanout', () => {
  it('线性链按层序跑:pm→arch→dev', async () => {
    const deps = mkDeps();
    await runTeamDagFanout(linear, deps, 'user prompt');
    expect(deps.callOrder).toEqual(['pm', 'arch', 'dev']);
  });

  it('每个 agent 的回复经 postMessage 落库(sender_kind=agent)', async () => {
    const deps = mkDeps();
    await runTeamDagFanout(linear, deps, 'go');
    const agentMsgs = deps.posted.filter((p) => p.sender_kind === 'agent');
    expect(agentMsgs.map((m) => m.sender_name)).toEqual(['PM', 'ARCH', 'DEV']);
  });

  it('下游 agent 收到上游产出作为 upstream 上下文', async () => {
    const deps = mkDeps();
    await runTeamDagFanout(linear, deps, 'go');
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'arch').upstream.map((u: { from: string }) => u.from)).toEqual(['pm']);
    expect(calls.find((c) => c.agentId === 'dev').upstream.map((u: { from: string }) => u.from)).toEqual(['arch']);
  });

  it('同层并行:菱形 b,c 在同层都被调用,且都在 a 之后、d 之前', async () => {
    const diamond: TeamRunShape = {
      members: ['a', 'b', 'c', 'd'],
      edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }].map((e) => ({ ...e, kind: 'sequential' as const })),
      policy_matrix: {},
    };
    const deps = mkDeps();
    await runTeamDagFanout(diamond, deps, 'go');
    expect(deps.callOrder[0]).toBe('a');
    expect(deps.callOrder.slice(1, 3).sort()).toEqual(['b', 'c']);
    expect(deps.callOrder[3]).toBe('d');
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'd').upstream.map((u: { from: string }) => u.from).sort()).toEqual(['b', 'c']);
  });

  it('deny 边:上游产出不喂下游 + 发系统注释', async () => {
    const team: TeamRunShape = { ...linear, policy_matrix: { pm: { arch: 'deny' } } };
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'arch').upstream).toEqual([]);
    expect(r.deniedEdges).toBe(1);
    expect(deps.posted.some((p) => p.sender_kind === 'system' && /deny|拦/.test(p.content))).toBe(true);
  });

  it('warn 边:上游产出仍喂下游 + 发提醒注释', async () => {
    const team: TeamRunShape = { ...linear, policy_matrix: { pm: { arch: 'warn' } } };
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'arch').upstream.map((u: { from: string }) => u.from)).toEqual(['pm']);
    expect(r.warnedEdges).toBe(1);
    expect(deps.posted.some((p) => p.sender_kind === 'system' && /warn|提醒/.test(p.content))).toBe(true);
  });

  it('agent 报错 → 发系统错误消息、记 error、不中断后续层', async () => {
    const deps = mkDeps({ callAgent: vi.fn(async ({ agentId }) => (agentId === 'pm' ? { text: '', error: 'boom' } : { text: `${agentId}:ok` })) });
    const r = await runTeamDagFanout(linear, deps, 'go');
    expect(r.perAgent.pm).toBe('error');
    expect(r.perAgent.dev).toBe('ok');
    expect(deps.posted.some((p) => p.sender_kind === 'system' && /boom|出错/.test(p.content))).toBe(true);
  });

  it('agent 空回复 → 记 empty + 系统提示,不喂下游', async () => {
    const deps = mkDeps({ callAgent: vi.fn(async ({ agentId }) => (agentId === 'pm' ? { text: '   ' } : { text: `${agentId}:ok` })) });
    const r = await runTeamDagFanout(linear, deps, 'go');
    expect(r.perAgent.pm).toBe('empty');
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'arch').upstream).toEqual([]);
  });

  it('getAgent 返回 null → 该节点跳过、记 error,不喂下游', async () => {
    const deps = mkDeps({ getAgent: vi.fn(async (id: string) => (id === 'pm' ? null : { name: id, soul: 's' })) });
    const r = await runTeamDagFanout(linear, deps, 'go');
    expect(r.perAgent.pm).toBe('error');
  });

  it('warn 边但上游空回复 → warnedEdges 仍计数、note 说明无产出、不喂下游', async () => {
    const team: TeamRunShape = { ...linear, policy_matrix: { pm: { arch: 'warn' } } };
    const deps = mkDeps({ callAgent: vi.fn(async ({ agentId, upstream }: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[] }) => (agentId === 'pm' ? { text: '   ' } : { text: `${agentId}:up=${upstream.map((u) => u.from).join('+') || 'none'}` })) });
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.warnedEdges).toBe(1);
    const calls = (deps.callAgent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.agentId === 'arch').upstream).toEqual([]); // pm 空,不喂
    expect(deps.posted.some((p) => p.sender_kind === 'system' && /无产出/.test(p.content))).toBe(true);
  });
});

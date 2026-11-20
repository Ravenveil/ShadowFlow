/**
 * live.test.ts — 对着**真后端**跑一遍读路径（默认跳过）。
 *
 *   SF_LIVE=1 VITE_API_BASE=http://localhost:8002 npx vitest run live
 *
 * 为什么单独一个文件：它依赖本机 8002 上真有数据，进 CI 会假红；
 * 但接了真接口又必须有一种「不打开浏览器也能确认字段没串」的手段。
 * 只读，不写任何东西（PUT/POST 一律不测，避免污染本机数据）。
 */
import { describe, expect, it } from 'vitest';
import { ROUTES, mayGet, pickData, request } from './client';
import type {
  AgentDto,
  ByokDto,
  CliDetectDto,
  GroupDto,
  KnowledgePackDto,
  SshConfigEnvelopeDto,
} from './contract';
import { toComposer, toMessage, toRoster, toSession, toSettings } from './mappers';
import { COMMANDS } from '../commands';

const LIVE = process.env.SF_LIVE === '1';

interface Envelope<T> {
  data: T;
}

describe.skipIf(!LIVE)('真后端读路径', () => {
  it('会话列表能映射成会话与消息', async () => {
    const res = await request<Envelope<GroupDto[]>>(ROUTES.groups);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);

    const agents = (await request<Envelope<AgentDto[]>>(ROUTES.agents)).data;
    const nameOf = (id: string) => agents.find((a) => a.agent_id === id)?.name ?? id;

    const first = res.data[0];
    const session = toSession(first, nameOf);
    expect(session.id).toBe(first.group_id);
    expect(session.title.length).toBeGreaterThan(0);

    const roster = toRoster(agents, first);
    expect(roster.length).toBe(first.agent_ids.length);
    for (const m of roster) expect(m.name).toBeTruthy();

    for (const raw of first.messages ?? []) {
      const msg = toMessage(raw, nameOf);
      expect(msg.id).toBe(raw.message_id);
      expect(['user', 'agent', 'system']).toContain(msg.role);
    }
  });

  it('设置三件套（BYOK / CLI / SSH）都能读且形状对得上', async () => {
    const byok = await mayGet<ByokDto>(ROUTES.byok);
    const cli = await mayGet<CliDetectDto>(ROUTES.cli);
    const ssh = await mayGet<Envelope<SshConfigEnvelopeDto>>(ROUTES.sshConfig);
    const packs = await mayGet<{ data: { packs?: KnowledgePackDto[] } }>(ROUTES.packs);

    expect(byok?.providers).toBeTruthy();
    expect(Array.isArray(cli?.items)).toBe(true);

    const settings = toSettings({
      byok,
      cli,
      ssh: pickData<SshConfigEnvelopeDto>(ssh)?.config ?? null,
      packs: packs?.data?.packs ?? [],
    });

    // 每个供应商都得有展示名与完整模型表（后端给的是打码 Key，别当成可回写的值）
    for (const p of settings.providers) {
      expect(p.name).toBeTruthy();
      expect(p.key.includes('•') || p.key === '').toBe(true);
    }

    const composer = toComposer(byok, cli, packs?.data?.packs ?? [], COMMANDS);
    expect(composer.commands.length).toBe(COMMANDS.length);
    expect(composer.models.every((m) => m.id.startsWith('cli:') || m.id.startsWith('byok:'))).toBe(true);
  });

  it('团队工作流 / 策略缺失时走空兜底（群没绑团队是正常状态）', async () => {
    const groups = (await request<Envelope<GroupDto[]>>(ROUTES.groups)).data;
    const group = groups[0];
    if (!group.team_id) {
      expect(group.team_id).toBeFalsy();
      return;
    }
    const workflow = await mayGet<Envelope<unknown>>(ROUTES.teamWorkflow(group.team_id));
    const policy = await mayGet<Envelope<unknown>>(ROUTES.teamPolicy(group.team_id));
    // 有团队就该有回应；没回应（404）也必须是 null 而不是抛错
    expect(workflow !== undefined).toBe(true);
    expect(policy !== undefined).toBe(true);
  });
});

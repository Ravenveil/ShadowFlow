/**
 * mappers.test.ts — 映射层的回归网。
 *
 * 这一层是「后端字段 → 界面字段」的唯一转换点，最容易在接真接口时悄悄坏掉；
 * 而坏掉的表现往往只是「某块空白」，不会报错。所以这里逐条钉住：
 *   - 后端少字段 / 多字段 / 空数组时不炸、不产生 undefined
 *   - 会话、消息、编队、策略、DAG、设置各一段
 * 只测纯函数，不发网络请求（那是 e2e 的事）。
 */
import { describe, expect, it } from 'vitest';
import {
  clockTime,
  frameToMessage,
  relativeTime,
  shortName,
  toComposer,
  toDag,
  toMessage,
  toPolicy,
  toRoster,
  toSession,
  toSettings,
  toThread,
} from './mappers';
import type { AgentDto, ByokDto, CliDetectDto, GroupDto } from './contract';

const agents: AgentDto[] = [
  { agent_id: 'a1', name: 'Analyst · 结果分析', soul: '【团队使命】\n做统计分析', status: 'running' },
  { agent_id: 'a2', name: 'Writer', soul: '写论文', status: 'idle' },
];

const group: GroupDto = {
  group_id: 'g1',
  name: 'ARC 论文团',
  kind: 'group',
  agent_ids: ['a1', 'a2'],
  team_id: null,
  policy_matrix: { a1: { a2: 'permit', a3: 'bogus' } },
  created_at: '2026-11-19T10:00:00.000Z',
  updated_at: null,
  messages: [
    {
      message_id: 'm1',
      sender_name: 'smoke',
      sender_kind: 'user',
      content: '研究主题：LLM 协作',
      timestamp: '2026-11-19T10:17:35.511Z',
    },
    {
      message_id: 'm2',
      sender_name: 'Agent-3f',
      sender_kind: 'agent',
      agent_id: 'a1',
      content: '先说结论',
      timestamp: '2026-11-19T10:17:39.236Z',
    },
    {
      message_id: 'm3',
      sender_name: 'system',
      sender_kind: 'system',
      content: '主控出错：429',
      timestamp: '2026-11-19T10:18:00.000Z',
    },
  ],
};

const nameOf = (id: string) => agents.find((a) => a.agent_id === id)?.name ?? id;

describe('时间与短名', () => {
  it('相对时间按分钟/小时/天分档', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5_000).toISOString())).toBe('刚刚');
    expect(relativeTime(new Date(now - 12 * 60_000).toISOString())).toBe('12 分钟前');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3 小时前');
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe('2 天前');
  });

  it('坏时间戳返回空串而不是 Invalid Date', () => {
    expect(relativeTime('not-a-date')).toBe('');
    expect(relativeTime(null)).toBe('');
    expect(clockTime(undefined)).toBe('');
  });

  it('短名优先中文，其次英文缩写', () => {
    expect(shortName('结果分析')).toBe('结果');
    expect(shortName('Section Writer')).toBe('SW');
  });
});

describe('会话与消息', () => {
  it('群会话保留名字，成员换成真名', () => {
    const s = toSession(group, nameOf);
    expect(s).toMatchObject({ id: 'g1', title: 'ARC 论文团', kind: 'group' });
    expect(s.members).toEqual(['Analyst · 结果分析', 'Writer']);
  });

  it('单聊名字等于 agent id 时用真名', () => {
    const dm: GroupDto = { ...group, kind: 'dm', name: 'a2', agent_ids: ['a2'] };
    expect(toSession(dm, nameOf).title).toBe('Writer');
  });

  it('agent 消息作者按 agent_id 还原成人名，system 不带作者', () => {
    const [user, agentMsg, sys] = toThread(group, nameOf);
    expect(user.role).toBe('user');
    expect(agentMsg.author).toBe('Analyst · 结果分析');
    expect(sys.role).toBe('system');
    expect(sys.author).toBeUndefined();
  });

  it('SSE 帧：typing 不进消息流，agent.message 才进', () => {
    expect(frameToMessage('agent.typing', { content: '...' }, nameOf)).toBeNull();
    const msg = frameToMessage(
      'agent.message',
      { message_id: 'x1', content: '交稿', agent_id: 'a2', timestamp: '2026-11-19T10:00:00Z' },
      nameOf,
    );
    expect(msg?.author).toBe('Writer');
    expect(msg?.kind).toBe('text');
  });

  it('缺字段的帧直接丢弃，不抛错', () => {
    expect(frameToMessage('agent.message', { content: '没有 id' }, nameOf)).toBeNull();
    expect(frameToMessage('agent.message', null, nameOf)).toBeNull();
  });

  it('消息默认是文本气泡，不伪造附件', () => {
    const m = toMessage(group.messages![0], nameOf);
    expect(m.kind).toBe('text');
    expect(m.attachments).toBeUndefined();
  });
});

describe('编队 / 策略 / 工作流', () => {
  it('编队按群成员顺序，角色取「·」后半段', () => {
    const roster = toRoster(agents, group);
    expect(roster.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(roster[0]).toMatchObject({ role: '结果分析', state: 'busy' });
    // 名字里没有「·」时角色回落 soul 首行（Writer 的设定是「写论文」）
    expect(roster[1]).toMatchObject({ role: '写论文', state: 'idle' });
  });

  it('没有群时退回全部 agent', () => {
    expect(toRoster(agents, null)).toHaveLength(2);
  });

  it('群引用了已删除的成员时给占位名，不把 id 的十六进制当名字', () => {
    const stale: GroupDto = { ...group, agent_ids: ['a1', 'agent-3d38944fdfab'] };
    const roster = toRoster(agents, stale);
    expect(roster[1].name).toBe('成员 dfab');
    expect(roster[1].role).toBe('已不在名册');
    expect(roster[1].short).toBe('dfab');
  });

  it('策略矩阵过滤未知取值', () => {
    expect(toPolicy(group.policy_matrix)).toEqual({ a1: { a2: 'permit' } });
    expect(toPolicy(undefined)).toEqual({});
  });

  it('DAG 兼容包装形与裸形节点，缺失坐标就不给 layout', () => {
    const dag = toDag(
      {
        nodes: [
          { id: 'n1', data: { agentId: 'a1', label: '解析' }, position: { x: 10, y: 20 } },
          { id: 'n2', agentId: 'a2', label: '写作' },
          { id: 'bad' },
        ],
        edges: [
          { source: 'n1', target: 'n2', data: { mode: 'approve', label: '待批' } },
          { from: 'n2', to: 'n1' },
          { source: 'x' },
        ],
      },
      toRoster(agents, group),
    );
    expect(dag.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'bad']);
    expect(dag.nodes[0].layout).toEqual({ x: 10, y: 20, w: 140, h: 44 });
    expect(dag.nodes[1].layout).toBeUndefined();
    expect(dag.edges).toHaveLength(2);
    expect(dag.edges[0]).toMatchObject({ from: 'n1', to: 'n2', mode: 'approve', label: '待批' });
    expect(dag.edges[1].mode).toBe('direct');
    expect(dag.canvas.w).toBeGreaterThanOrEqual(308);
  });

  it('空工作流给空画布，不崩', () => {
    const dag = toDag(null, []);
    expect(dag.nodes).toEqual([]);
    expect(dag.edges).toEqual([]);
    expect(dag.canvas).toEqual({ w: 308, h: 348 });
  });
});

describe('输入框资源与设置', () => {
  const byok: ByokDto = {
    providers: {
      zhipu: {
        apiKey: '••••uyWH',
        baseUrl: '',
        models: ['glm-5', 'glm-4'],
        enabled: true,
      },
      anthropic: { apiKey: '', baseUrl: '', models: [], enabled: false },
    },
  };

  const cli: CliDetectDto = {
    scanned_at: '2026-11-20T09:00:00.000Z',
    items: [
      { id: 'claude', installed: true, path: 'C:/claude.exe', version: '2.1.195' },
      { id: 'codex', installed: false, path: null, version: null },
    ],
  };

  it('模型列表：已装 CLI + 已启用且有 Key 的供应商', () => {
    const composer = toComposer(byok, cli, [], []);
    expect(composer.models.map((m) => m.id)).toEqual(['cli:claude', 'byok:zhipu']);
    expect(composer.models[0].note).toBe('2.1.195');
    expect(composer.models[1].label).toBe('智谱 GLM');
  });

  it('没有 Key 的供应商不进选择器', () => {
    const composer = toComposer(
      { providers: { ...byok.providers, zhipu: { ...byok.providers.zhipu, apiKey: '' } } },
      null,
      [],
      [],
    );
    expect(composer.models).toEqual([]);
  });

  it('设置：后端给的分区覆盖缺省值，后端没有的沿用缺省', () => {
    const s = toSettings({ byok, cli, ssh: null, packs: [] });
    expect(s.providers[0]).toMatchObject({ id: 'zhipu', name: '智谱 GLM', key: '••••uyWH', on: true });
    expect(s.clis.map((c) => c.installed)).toEqual([true, false]);
    // 后端没有 SSH 配置 → 空列表，而不是一条空主机
    expect(s.ssh).toEqual([]);
    // 后端没有的分区（写作规范 / 协作 / 通知）保留缺省
    expect(s.writing.citation).toBe('gbt7714');
    expect(s.notify.length).toBeGreaterThan(0);
  });

  it('SSH 配置正常映射成一条主机，状态未测', () => {
    const s = toSettings({
      byok: null,
      cli: null,
      ssh: { host: '10.0.0.2', port: 22, user: 'gpu', keyPathMasked: '~/.ssh/id', remoteDir: '~/runs' },
      packs: [],
    });
    expect(s.ssh[0]).toMatchObject({ id: 'default', host: '10.0.0.2', user: 'gpu', state: 'untested' });
  });
});

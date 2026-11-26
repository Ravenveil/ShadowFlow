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
  frameToTimeline,
  PAGE_DAG,
  flowLayout,
  relativeTime,
  rosterOfIds,
  shortName,
  toArtifactListing,
  toComposer,
  toDag,
  toMessage,
  toPolicy,
  toRoster,
  toSession,
  toSettings,
  toThread,
  toTimelineSnapshot,
} from '@/shared/data/http/mappers';
import type { AgentDto, ByokDto, CliDetectDto, GroupDto } from '@/shared/data/http/contract';

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

  it('保留后端 reply_to 作为裸 replyTo，缺省不带该字段', () => {
    const replied = toMessage(
      { ...group.messages![0], reply_to: 'm-root' },
      nameOf,
    );
    expect(replied.replyTo).toBe('m-root');
    expect(toMessage(group.messages![0], nameOf).replyTo).toBeUndefined();
  });

  it('SSE 帧里的 reply_to 也保留', () => {
    const msg = frameToMessage(
      'agent.message',
      {
        message_id: 'x2',
        content: '收到',
        agent_id: 'a2',
        timestamp: '2026-11-19T10:01:00Z',
        reply_to: 'm-root',
      },
      nameOf,
    );
    expect(msg?.replyTo).toBe('m-root');
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

  it('DAG 兼容包装形与裸形节点，并把存图坐标压进 308 宽的右栏', () => {
    const dag = toDag(
      {
        nodes: [
          { id: 'n1', data: { agentId: 'a1', label: 'Researcher · 文献侦察' }, position: { x: 40, y: 30 } },
          { id: 'n2', agentId: 'a2', label: '写作', position: { x: 820, y: 30 } },
          { id: 'n3', position: { x: 40, y: 260 } },
          { id: 'bad' },
        ],
        edges: [
          { source: 'n1', target: 'n2', data: { mode: 'approve', label: '待批' } },
          { from: 'n2', to: 'n3' },
          { source: 'x' },
        ],
      },
      toRoster(agents, group),
    );

    expect(dag.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'bad']);
    // 有「·」的标题只留角色名：窄节点里才读得出来
    expect(dag.nodes[0].label).toBe('文献侦察');
    expect(dag.nodes[0].owner).toBe('a1');
    // 无坐标的节点不编坐标，交给组件竖排
    expect(dag.nodes[3].layout).toBeUndefined();

    // 两列压进 308：都在画布内，且右侧那列确实在右边
    const [b1, b2, b3] = dag.nodes.map((n) => n.layout!);
    expect(b1.x).toBeLessThan(b2.x);
    for (const b of [b1, b2, b3]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(308);
    }
    expect(dag.edges).toHaveLength(2);
    expect(dag.edges[0]).toMatchObject({ from: 'n1', to: 'n2', mode: 'approve', label: '待批' });
    expect(dag.edges[1].mode).toBe('direct');
    expect(dag.canvas.w).toBe(308);
    expect(dag.canvas.h).toBeGreaterThanOrEqual(348);
  });

  it('空工作流给空画布，不崩', () => {
    const dag = toDag(null, []);
    expect(dag.nodes).toEqual([]);
    expect(dag.edges).toEqual([]);
    expect(dag.canvas).toEqual({ w: 308, h: 348 });
  });

  it('团队页按 PAGE_DAG 压图：画布变宽，节点仍落在画布内', () => {
    const dag = toDag(
      {
        nodes: [
          { id: 'n1', data: { agentId: 'a1' }, position: { x: 40, y: 30 } },
          { id: 'n2', data: { agentId: 'a2' }, position: { x: 900, y: 30 } },
        ],
        edges: [{ source: 'n1', target: 'n2' }],
      },
      toRoster(agents, group),
      PAGE_DAG,
    );
    expect(dag.canvas.w).toBe(960);
    // 标题已经回落到角色名时，第二行不再写同一句话
    expect(dag.nodes[0].label).toBe('结果分析');
    expect(dag.nodes[0].role).toBe('');
    for (const n of dag.nodes) {
      expect(n.layout!.x + n.layout!.w).toBeLessThanOrEqual(960);
      expect(n.layout!.h).toBe(52);
    }
    // 两列宽了，间距也随之放大：第二列不会贴在右边缘
    expect(dag.nodes[1].layout!.x + dag.nodes[1].layout!.w).toBeLessThanOrEqual(960 - 19);
  });

  it('没有坐标的图（内置模板）按拓扑分层：串行成列、并行并排', () => {
    const dag = toDag(
      {
        nodes: [
          { id: 'a', data: { name: 'PI', agentId: 'PI', role: '定方向' } },
          { id: 'b', data: { name: '主笔', agentId: '主笔' } },
          { id: 'c', data: { name: '引用', agentId: '引用' } },
          { id: 'd', data: { name: '方法', agentId: '方法' } },
          { id: 'e', data: { name: '润色', agentId: '润色' } },
        ],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'b', target: 'd' },
          { source: 'c', target: 'e' },
          { source: 'd', target: 'e' },
        ],
      },
      [],
      PAGE_DAG,
    );
    // 画布上写了职责就用它当第二行
    expect(dag.nodes[0].role).toBe('定方向');
    expect(dag.nodes.every((n) => n.layout === undefined)).toBe(true);

    const flow = flowLayout(dag, PAGE_DAG);
    const y = (id: string) => flow.nodes.find((n) => n.id === id)!.layout!.y;
    const x = (id: string) => flow.nodes.find((n) => n.id === id)!.layout!.x;
    // 4 层：a / b / c+d 并行 / e
    expect([y('a'), y('b'), y('c'), y('d'), y('e')]).toEqual([20, 110, 200, 200, 290]);
    // 并行两支同排不同列，且左右对称
    expect(x('c')).toBeLessThan(x('d'));
    expect(x('c') + x('d')).toBe(flow.canvas.w - 300);
    // 单节点行居中（节点宽上限 300）
    expect(x('a')).toBe(330);
    expect(flow.canvas.h).toBe(40 + 4 * 52 + 3 * 38);
    // 已有坐标的图不再重排
    expect(flowLayout(flow, PAGE_DAG)).toBe(flow);
  });

  it('成环的图也给坐标，不丢节点、不死循环', () => {
    const dag = toDag(
      { nodes: [{ id: 'a', data: { name: 'A' } }, { id: 'b', data: { name: 'B' } }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] },
      [],
      PAGE_DAG,
    );
    const flow = flowLayout(dag, PAGE_DAG);
    expect(flow.nodes).toHaveLength(2);
    expect(flow.nodes.every((n) => !!n.layout)).toBe(true);
    expect(flow.canvas.h).toBe(PAGE_DAG.minH);
  });

  it('团队名册按团队自己的成员 id 取，缺人时回落成 id 尾号', () => {
    const roster = rosterOfIds(agents, ['a2', 'gone-1234']);
    expect(roster[0]).toMatchObject({ id: 'a2', name: 'Writer', role: '写论文' });
    expect(roster[1].name).toBe('成员 1234');
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

describe('toArtifactListing — 会话工作目录', () => {
  it('目录在前、文件在后，缺 size/mtime 时给零值', () => {
    const listing = toArtifactListing(
      {
        path: 'D:/ws',
        parent: 'D:/',
        entries: [
          { name: 'draft.md', path: 'D:/ws/draft.md', isDir: false, size: 2048, mtime: 1700000000000, ext: '.MD' },
          { name: 'figs', path: 'D:/ws/figs', isDir: true },
          { name: 'refs.bib', path: 'D:/ws/refs.bib', isDir: false },
          { name: '', path: 'D:/ws/x', isDir: false },
        ],
      },
      'D:/ws',
      'D:/ws',
    );

    expect(listing.entries.map((e) => e.name)).toEqual(['figs', 'draft.md', 'refs.bib']);
    expect(listing.entries[0]).toMatchObject({ isDir: true, size: 0, ext: '' });
    // 扩展名统一小写，组件按它挑图标
    expect(listing.entries[1].ext).toBe('.md');
    expect(listing.root).toBe('D:/ws');
    expect(listing.parent).toBe('D:/');
  });

  it('后端没给东西时给空列表，而不是 undefined', () => {
    const listing = toArtifactListing(null, 'D:/ws', 'D:/ws');
    expect(listing).toEqual({ root: 'D:/ws', dir: 'D:/ws', parent: null, entries: [] });
  });

  it('盘符哨兵 ROOT 当成「没有上一级」', () => {
    const listing = toArtifactListing(
      { path: 'D:/ws', parent: 'ROOT', entries: [] },
      'D:/ws',
      'D:/ws',
    );
    expect(listing.parent).toBeNull();
  });
});

describe('时间线回包', () => {
  it('残帧被丢掉，id / kind 缺一不可', () => {
    const snap = toTimelineSnapshot({
      messages: [
        { id: 'a', kind: 'user_turn', ts: 3 },
        { kind: 'user_turn', ts: 4 },
        { id: 'b' },
        null,
        'garbage',
      ],
    });
    expect(snap.messages.map((m) => m.id)).toEqual(['a']);
  });

  it('按 ts 升序归位；缺 ts 的落最前而不是让整列变 NaN', () => {
    const snap = toTimelineSnapshot({
      messages: [
        { id: 'late', kind: 'assistant_text', ts: 900 },
        { id: 'noTs', kind: 'raw' },
        { id: 'early', kind: 'user_turn', ts: '100' },
      ],
    });
    expect(snap.messages.map((m) => m.id)).toEqual(['noTs', 'early', 'late']);
    expect(snap.messages[0].ts).toBe(0);
    expect(snap.messages[1].ts).toBe(100);
  });

  it('turn_id 缺失时回落自身 id（分组/anchor 不会拿到 undefined）', () => {
    const snap = toTimelineSnapshot({ messages: [{ id: 'a', kind: 'user_turn' }] });
    expect(snap.messages[0].turn_id).toBe('a');
  });

  it('runs 只留带 session_id 的项，状态空串回落 idle', () => {
    const snap = toTimelineSnapshot({
      runs: [{ session_id: 's1', status: 'running' }, { session_id: 's2' }, { status: 'done' }, null],
      truncated: true,
    });
    expect(snap.runs).toEqual([
      { sessionId: 's1', status: 'running' },
      { sessionId: 's2', status: 'idle' },
    ]);
    expect(snap.truncated).toBe(true);
  });

  it('结构化负载被清洗成数组（后端给 null 时渲染器不会拿到 undefined）', () => {
    const snap = toTimelineSnapshot({
      messages: [
        {
          id: 'p',
          kind: 'step_panel',
          steps: [{ name: '第一步', status: 'done', elapsed_ms: '1200' }, null, { status: 'running' }],
        },
        { id: 'q', kind: 'table_panel', columns: ['A', 1], rows: [['x', 2], 'bad'] },
      ],
    });
    expect(snap.messages[0].steps).toEqual([
      { name: '第一步', status: 'done', elapsed_ms: 1200, substeps: [] },
    ]);
    expect(snap.messages[1].columns).toEqual(['A', '1']);
    // 表格单元格保留数字（右对齐/排序还用得上），非数组行落成空行而不是丢掉
    expect(snap.messages[1].rows).toEqual([['x', 2], []]);
  });

  it('空回包给空快照，不是 undefined', () => {
    expect(toTimelineSnapshot(null)).toEqual({ messages: [], runs: [], truncated: false });
  });
});

describe('SSE 帧 → 时间线格', () => {
  it('agent.message 的 id 与后端 chatMessagesToTimeline 同构（去重靠它）', () => {
    const tl = frameToTimeline('agent.message', {
      message_id: 'abc',
      content: '第 3 节有两处引用要改',
      sender_name: '引用审查',
      agent_id: 'cr',
      timestamp: '2026-11-25T09:00:00.000Z',
    });
    expect(tl?.id).toBe('chat_abc');
    expect(tl?.kind).toBe('assistant_text');
    expect(tl?.body).toBe('第 3 节有两处引用要改');
    expect(tl?.agent_id).toBe('cr');
  });

  it('system.notice 落成系统行（网关提示要看得见）', () => {
    const tl = frameToTimeline('system.notice', { message_id: 's1', content: '等待你审批' });
    expect(tl).toMatchObject({ id: 'chat_s1', kind: 'raw', source: 'chat-gateway' });
  });

  it('认不出的帧、没有 message_id 的帧返回 null', () => {
    expect(frameToTimeline('agent.typing', { sender_name: 'x' })).toBeNull();
    expect(frameToTimeline('agent.message', { content: '没有 id' })).toBeNull();
  });
});

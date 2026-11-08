/**
 * groups-chat-reply-fallback.test.ts — 快速收尾·回复兜底（2026-11-08）。
 *
 * 背景（用户截图反馈「只有思考没有输出」）：MiMo 任务轮把报告全文写进
 * reasoning_content（openai-compat 相位机包 <sf:thinking> 走 text 通道 /
 * 结构化 thinking-delta 通道），content 通道为空 → stripThinking(buf) 为空，
 * 聊天里只有思考卡、没有回复气泡（run 存档 d756e4c0 实证：179 片思考体、
 * 零正文消息）。
 *
 * 修复：收口 `stripThinking(buf).trim() || thinkingBody.trim()` —— 正文为空时
 * 把思考体当回复发出去（正文优先）。本文件验证：
 *   - 串行路径：text 通道纯 <sf:thinking> 段 → 回复 = 思考体；
 *   - DAG 路径（@ 命中单节点）：纯 thinking-delta 结构化思考 → 回复 = 思考体；
 *   - 混合流：正文非空时正文优先（思考体不泄漏进气泡）。
 *
 * Run:
 *   npx vitest run --config vitest.server.config.ts server/src/routes/__tests__/groups-chat-reply-fallback.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock 重依赖（模块级，import 路由前生效）— 与 groups-chat-stream-strip 同款。

const teamShape = {
  members: ['pm', 'arch', 'dev'],
  edges: [
    { from: 'pm', to: 'arch', kind: 'sequential' },
    { from: 'arch', to: 'dev', kind: 'sequential' },
  ],
  policy_matrix: {},
  name: '三件套',
};
vi.mock('../../lib/team-source', () => ({
  loadTeamForRun: vi.fn(() => ({ team: teamShape, errors: [] })),
}));

const agentRecords: Record<string, { agent_id: string; name: string; soul: string }> = {
  pm: { agent_id: 'pm', name: '策划喵', soul: 'soul-pm' },
  arch: { agent_id: 'arch', name: '架构汪', soul: 'soul-arch' },
  dev: { agent_id: 'dev', name: '码农鸡', soul: 'soul-dev' },
};

const groupRecord = {
  group_id: 'g1',
  agent_ids: ['pm'] as string[],
  messages: [] as Array<{ content: string; sender_kind: string; sender_name: string }>,
  kind: 'group',
  team_id: 't-default' as string | null,
};
const postedMessages: Array<{ content: string; sender_name: string; sender_kind: string; agent_id?: string }> = [];
vi.mock('../../storage/groups-backend', () => ({
  getGroupsBackend: () => ({
    getGroup: vi.fn(async (id: string) => ({ ...groupRecord, group_id: id })),
    appendMessage: vi.fn(async (_id: string, body: { content: string; sender_name: string; sender_kind: string; agent_id?: string }) => {
      postedMessages.push(body);
      groupRecord.messages.push(body as never);
      return { ...body, message_id: `m-${postedMessages.length}` };
    }),
  }),
}));

vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const m = /\/api\/agents\/([^/]+)$/.exec(String(url));
  if (m) {
    const a = agentRecords[decodeURIComponent(m[1])];
    if (a) {
      return new Response(JSON.stringify({ data: a }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return new Response('{}', { status: 404 });
}));
vi.mock('../../python-backend', () => ({ PYTHON_BACKEND_URL: 'http://127.0.0.1:1' }));

// dispatcher：fake callable 按 streamScript 吐片。
type StreamChunk = { type: 'text-delta' | 'thinking-delta'; value: string };
let streamScript: StreamChunk[] = [];
vi.mock('../../transport/dispatcher', () => ({
  resolveCallable: () => ({
    turn: async function* () {
      for (const c of streamScript) yield c;
    },
  }),
}));

// gateway run：内存 gw（断言用；fallback 逻辑本身不依赖 gw）。
interface RecordedPatch { id: string; op: string; chunk?: string }
interface RecordedMsg { id: string; kind: string; label?: string; status?: string }
const gwPatches: RecordedPatch[] = [];
const gwMessages: RecordedMsg[] = [];
vi.mock('../../lib/gateway-run', () => ({
  startGatewayRun: vi.fn(() => {
    let n = 0;
    return {
      turnId: 'turn-1',
      nextId: () => `gw-${++n}`,
      emitMessage: vi.fn((m: RecordedMsg) => {
        gwMessages.push(m);
      }),
      emitPatch: vi.fn((p: RecordedPatch) => {
        gwPatches.push(p);
      }),
      finish: vi.fn(),
    };
  }),
}));

// worktree：非 git 环境短路。
vi.mock('../../lib/worktree-manager', () => ({
  isGitWorkable: vi.fn(async () => false),
  prepareWorktree: vi.fn(async () => null),
  integrateAll: vi.fn(async () => []),
  commitWorktree: vi.fn(async () => null),
}));

import { runFanoutAsync } from '../groups/groups-chat';

/** 根因 A 形态：text 通道只有 <sf:thinking> 段（MiMo reasoning_content 包装），content 为空。 */
const REASONING_ONLY_TEXT: StreamChunk[] = [
  { type: 'text-delta', value: '<sf:thinking>## 一、目标用户画像\n手表调研报告正文</sf:thinking>' },
];

/** 根因 A 形态二：结构化 thinking-delta 通道全量思考，text 通道零输出。 */
const THINKING_DELTA_ONLY: StreamChunk[] = [
  { type: 'thinking-delta', value: '结构化思考：先算成本再定受众' },
  { type: 'thinking-delta', value: '，结论：学生群体优先。' },
];

/** 混合流：正文非空 → 正文优先，思考体不进气泡。 */
const MIXED_STREAM: StreamChunk[] = [
  { type: 'text-delta', value: '<sf:thinking>暗自盘算</sf:thinking>这是正文回复' },
];

function agentReply(): string {
  const m = postedMessages.find((x) => x.sender_kind === 'agent');
  expect(m).toBeTruthy();
  return m!.content;
}

beforeEach(() => {
  postedMessages.length = 0;
  groupRecord.messages = [];
  groupRecord.agent_ids = ['pm'];
  groupRecord.team_id = 't-default';
  teamShape.members = ['pm', 'arch', 'dev'];
  gwPatches.length = 0;
  gwMessages.length = 0;
  streamScript = [];
});

describe('快速收尾·回复兜底 — 串行路径', () => {
  it('text 通道纯 <sf:thinking> 段（正文空）→ 思考体兜底当回复', async () => {
    (teamShape as { members: string[] }).members = []; // team 读不到 → 串行
    streamScript = REASONING_ONLY_TEXT.map((c) => ({ ...c }));
    await runFanoutAsync('g1', 'byok:mimo', undefined, {}, '做个手表调研');
    expect(agentReply()).toBe('## 一、目标用户画像\n手表调研报告正文');
  });

  it('混合流：正文非空时正文优先，思考体不泄漏进气泡', async () => {
    (teamShape as { members: string[] }).members = [];
    streamScript = MIXED_STREAM.map((c) => ({ ...c }));
    await runFanoutAsync('g1', 'byok:mimo', undefined, {}, '做个手表调研');
    expect(agentReply()).toBe('这是正文回复');
  });
});

describe('快速收尾·回复兜底 — DAG 路径（@ 命中单节点）', () => {
  it('纯 thinking-delta 结构化思考（正文空）→ 思考体兜底当回复', async () => {
    streamScript = THINKING_DELTA_ONLY.map((c) => ({ ...c }));
    await runFanoutAsync('g1', 'byok:mimo', undefined, {}, '@策划喵 做个手表调研');
    expect(agentReply()).toBe('结构化思考：先算成本再定受众，结论：学生群体优先。');
  });

  it('text 通道纯 <sf:thinking> 段（正文空）→ 同样兜底', async () => {
    streamScript = REASONING_ONLY_TEXT.map((c) => ({ ...c }));
    await runFanoutAsync('g1', 'byok:mimo', undefined, {}, '@策划喵 做个手表调研');
    expect(agentReply()).toBe('## 一、目标用户画像\n手表调研报告正文');
  });
});

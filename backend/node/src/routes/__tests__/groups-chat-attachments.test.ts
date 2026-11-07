/**
 * groups-chat-attachments.test.ts — 群聊附件透传（2026-11-07 拖拽传图）。
 *
 * 「聊天框拖拽传图」的群聊后端链路契约：
 *   1. POST /api/groups/:id/messages 带 attachments → 201，响应体含清洗后的
 *      attachments（字段清洗/上限 9 沿用 coerceAttachments），持久化透传；
 *   2. GET /:id/timeline 刷新后 user_turn 仍带 attachments（持久化回读）；
 *   3. fan-out 的 agent goal/上下文含「[用户上传了 N 个附件」提示块（串行 +
 *      DAG 两条派发路径都注入，agent 可用工具读取绝对路径）；
 *   4. 非法输入（残缺项/非数组/超上限）按 coerceAttachments 语义清洗。
 *
 * 真实 SQLite（临时 cwd 隔离）+ 其余重依赖 mock（groups-chat-turn-thread 同款）。
 *
 * Run:
 *   npx vitest run src/routes/__tests__/groups-chat-attachments.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── mock 重依赖（模块级，import 路由前生效）────────────────────────────────

const teamShape = {
  name: '双人组',
  members: ['pm', 'arch'] as string[],
  edges: [{ from: 'pm', to: 'arch', kind: 'sequential' as const }],
  policy_matrix: {},
};
vi.mock('../../lib/team-source', () => ({
  loadTeamForRun: vi.fn(() => ({ team: teamShape, errors: [] })),
}));

const agentRecords: Record<string, { agent_id: string; name: string; soul: string }> = {
  pm: { agent_id: 'pm', name: '总经理', soul: 'soul-pm' },
  arch: { agent_id: 'arch', name: '架构汪', soul: 'soul-arch' },
};

const groupRecord = {
  group_id: 'g1',
  agent_ids: ['pm'] as string[],
  messages: [] as Array<{
    content: string;
    sender_kind: string;
    sender_name: string;
    timestamp?: string;
    message_id?: string;
    attachments?: unknown[];
  }>,
  kind: 'dm' as string,
  team_id: null as string | null,
};
const postedMessages: Array<{
  content: string;
  sender_name: string;
  sender_kind: string;
  agent_id?: string;
  attachments?: unknown[];
}> = [];
vi.mock('../../storage/groups-backend', () => ({
  getGroupsBackend: () => ({
    // 共享 messages 数组引用：appendMessage 落库即后续 reload/GET timeline 可见
    // （「刷新后 user_turn 仍带 attachments」的读路径语义前提）。
    getGroup: vi.fn(async (id: string) => ({ ...groupRecord, group_id: id })),
    appendMessage: vi.fn(
      async (
        _id: string,
        body: {
          content: string;
          sender_name: string;
          sender_kind: string;
          agent_id?: string;
          attachments?: unknown[];
        },
      ) => {
        postedMessages.push(body);
        groupRecord.messages.push({
          content: body.content,
          sender_kind: body.sender_kind,
          sender_name: body.sender_name,
          message_id: `m-${postedMessages.length}`,
          timestamp: new Date().toISOString(),
          ...(body.attachments && body.attachments.length > 0
            ? { attachments: body.attachments }
            : {}),
        });
        return { ...body, message_id: `m-${postedMessages.length}` };
      },
    ),
  }),
}));

// agent 读取走全局 fetch（pyGet 非群路径）；其余（测试自身 HTTP / fail-soft
// 调用）透传真实 fetch——测试的 POST/GET 打本地 express 不能被 stub 吞掉。
const realFetch = globalThis.fetch.bind(globalThis);
vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  const s = String(url);
  const m = /\/api\/agents\/([^/]+)$/.exec(s);
  if (m) {
    const a = agentRecords[decodeURIComponent(m[1])];
    if (a) {
      return new Response(JSON.stringify({ data: a }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  }
  return realFetch(url, init);
}));
vi.mock('../../python-backend', () => ({ PYTHON_BACKEND_URL: 'http://127.0.0.1:1' }));

// dispatcher：可观测 fake，捕获 system/prompt/history 原样。
const turnCalls: Array<{ system: string; prompt: string; history: unknown[] }> = [];
vi.mock('../../transport/dispatcher', () => ({
  resolveCallable: () => ({
    turn: async function* (args: { system: string; prompt: string; history: unknown[] }) {
      turnCalls.push({ system: args.system, prompt: args.prompt, history: args.history });
      yield { type: 'text-delta', value: '收到，我看下附件' };
    },
  }),
}));

// gateway run：内存 gw。
vi.mock('../../lib/gateway-run', () => ({
  startGatewayRun: vi.fn(() => {
    let n = 0;
    return {
      sessionId: 'gw-s1',
      conversationId: 'c1',
      turnId: 'turn-1',
      nextId: () => `gw-${++n}`,
      emitMessage: vi.fn(),
      emitPatch: vi.fn(),
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

import { groupsChatRouter, runFanoutAsync } from '../groups/groups-chat';

// ── HTTP 挂载（POST / GET timeline 走真实路由）───────────────────────────────

let server: http.Server;
let base: string;
let tmp: string;
let origCwd: string;

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-chat-att-'));
  process.chdir(tmp);
  // fan-out 的 scratch 工作目录落临时树（不碰真实 ~/.shadowflow-chat）。
  process.env.SHADOWFLOW_CHAT_DIR = tmp;
  const sqlite = await import('../../storage/sqlite');
  sqlite._resetForTests();
  sqlite.getDb();

  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupsChatRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  process.chdir(origCwd);
  delete process.env.SHADOWFLOW_CHAT_DIR;
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

beforeEach(() => {
  turnCalls.length = 0;
  postedMessages.length = 0;
  groupRecord.messages.length = 0;
  groupRecord.kind = 'dm';
  groupRecord.team_id = null;
  groupRecord.agent_ids = ['pm'];
});

/** 等 fire-and-forget fan-out 落到 mock dispatcher：恰好 n 次 turn（多余即红）。 */
async function waitForTurnCalls(n: number): Promise<void> {
  for (let i = 0; i < 150 && turnCalls.length < n; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(turnCalls.length).toBe(n);
  // 让同轮潜在多余调用先落地（不该有——单 agent 一轮一调）。
  await new Promise((r) => setTimeout(r, 60));
  expect(turnCalls.length).toBe(n);
}

const catAtt = {
  name: 'cat.png',
  path: 'C:/tmp/up/cat.png',
  url: '/projects/_uploads/a1/cat.png',
  is_image: true,
  size: 1234,
};
const noteAtt = {
  name: 'note.txt',
  path: 'C:/tmp/up/note.txt',
  url: '/projects/_uploads/a2/note.txt',
  is_image: false,
  size: 12,
};

async function postMessage(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/api/groups/g1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/groups/:id/messages — attachments 接收/透传', () => {
  it('带附件发消息 → 201，响应体含 attachments，持久化带上附件', async () => {
    const r = await postMessage({
      content: '帮我看看这两份材料',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: [catAtt, noteAtt],
    });
    expect(r.status).toBe(201);
    expect(r.body.attachments).toEqual([catAtt, noteAtt]);
    // 持久化透传（GET timeline 刷新回读的数据源）。
    expect(postedMessages[0]?.attachments).toEqual([catAtt, noteAtt]);
    // GET timeline：刷新后 user_turn 仍带 attachments。
    const tl = await fetch(`${base}/api/groups/g1/timeline`);
    expect(tl.status).toBe(200);
    const tlBody = (await tl.json()) as { messages: Array<Record<string, unknown>> };
    const userTurn = tlBody.messages.find((m) => m.kind === 'user_turn');
    expect(userTurn).toBeTruthy();
    expect(userTurn!.attachments).toEqual([catAtt, noteAtt]);
    // 收尾：等本轮 fan-out 落定（防跨用例泄漏）。
    await waitForTurnCalls(1);
  });

  it('fan-out 上下文含「[用户上传了 N 个附件」提示块（串行路径）', async () => {
    const r = await postMessage({
      content: '帮我看看这张图',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: [catAtt],
    });
    expect(r.status).toBe(201);
    await waitForTurnCalls(1);
    const prompt = turnCalls[0]!.prompt;
    expect(prompt).toContain('[用户上传了 1 个附件');
    expect(prompt).toContain('cat.png');
    expect(prompt).toContain(catAtt.path);
  });

  it('无附件 → prompt 不带引用块（回归：零行为变化）', async () => {
    await postMessage({ content: '纯文本消息', sender_kind: 'user', executor: 'cli:claude' });
    await waitForTurnCalls(1);
    expect(turnCalls[0]!.prompt).not.toContain('[用户上传了');
  });

  it('只发附件不打字（content 空）→ 201，引用块照常注入', async () => {
    const r = await postMessage({
      content: '',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: [catAtt],
    });
    expect(r.status).toBe(201);
    expect(r.body.attachments).toEqual([catAtt]);
    await waitForTurnCalls(1);
    expect(turnCalls[0]!.prompt).toContain('[用户上传了 1 个附件');
    expect(turnCalls[0]!.prompt).toContain(catAtt.path);
  });

  it('非法输入清洗：残缺项丢弃、上限 9、非数组忽略', async () => {
    // 3 项里 2 项残缺（缺 url / 非对象）→ 只留合法 1 项。
    const r1 = await postMessage({
      content: 'x',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: [catAtt, { name: 'bad', path: '/p' }, null, 'garbage'],
    });
    expect(r1.status).toBe(201);
    expect(r1.body.attachments).toEqual([catAtt]);

    // 超上限 9 → 截 9。
    const many = Array.from({ length: 11 }, (_, i) => ({ ...noteAtt, name: `f${i}.txt` }));
    const r2 = await postMessage({
      content: 'x',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: many,
    });
    expect(r2.status).toBe(201);
    expect(r2.body.attachments).toHaveLength(9);

    // 非数组 → 不带附件字段（不落库不下发）。
    const r3 = await postMessage({
      content: 'x',
      sender_kind: 'user',
      executor: 'cli:claude',
      attachments: 'not-an-array',
    });
    expect(r3.status).toBe(201);
    expect('attachments' in r3.body).toBe(false);
    // 三次 POST 各触发一轮 fan-out（单 agent 一轮一 turn）。
    await waitForTurnCalls(3);
  });
});

describe('runFanout — DAG 路径附件引用块注入', () => {
  it('team 群每个执行 agent 的 prompt 都含「[用户上传了 N 个附件」提示块', async () => {
    groupRecord.kind = 'group';
    groupRecord.team_id = 't1';
    groupRecord.agent_ids = ['pm', 'arch'];
    groupRecord.messages.push(
      { content: '@pm @arch 看下这张图', sender_kind: 'user', sender_name: 'boss' },
    );
    // @ 点名定向派活保证 DAG 双节点都派发（与 groups-chat-turn-thread 同策略）。
    await runFanoutAsync('g1', 'cli:claude', undefined, {}, '@pm @arch 看下这张图', undefined, [
      catAtt,
    ]);

    expect(turnCalls).toHaveLength(2);
    for (const call of turnCalls) {
      expect(call.prompt).toContain('[用户上传了 1 个附件');
      expect(call.prompt).toContain('cat.png (图片, 1KB)');
      expect(call.prompt).toContain(catAtt.path);
    }
  });

  it('runFanout 未传附件 → prompt 不带引用块（回归）', async () => {
    groupRecord.kind = 'dm';
    groupRecord.messages.push({ content: '你好', sender_kind: 'user', sender_name: 'boss' });
    await runFanoutAsync('g1', 'cli:claude', undefined, {}, '你好');
    expect(turnCalls).toHaveLength(1);
    expect(turnCalls[0]!.prompt).not.toContain('[用户上传了');
  });
});

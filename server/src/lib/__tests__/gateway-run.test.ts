/**
 * gateway-run.test.ts — B3 网关过程事件单测
 * (unified-conversation-core-plan-2026-06-11 §B3)。
 *
 * Run (from server/):
 *   npx vitest run src/lib/__tests__/gateway-run.test.ts
 *
 * 覆盖：
 *   1. startGatewayRun 无互链 conversation 时自动创建（default project + group_id 写入）
 *   2. 已有互链 conversation 复用（不重复建）
 *   3. goal = '[chat] <首条用户消息前40字>'（空白折叠）
 *   4. id 规范：gw_<sessionId>_<n> 单调；turn_id = gwturn_<sessionId> 全轮共享
 *   5. emit 的 message/message-patch 进 runBus 事件日志 → B2 getRunReplay 能读回，
 *      replayTimeline 折叠出最终 TimelineMessage[]（thinking 流式 append + finalize）
 *   6. finish 置 run 终态；listSessionsByConversation 能按 conversation 查到该 session
 *   7. startGatewayRun 内部抛错（sqlite 不可用）→ 返回 null，不上抛
 *
 * Isolation：importing run-sessions.ts / sqlite.ts 有 cwd 相对的模块加载副作用
 * （mkdir .shadowflow/{sessions,runs}、app.sqlite）。与
 * run-sessions-stream-disposition.test.ts 同款：先 chdir 到一次性 tmp 目录再动态
 * import，结束恢复 cwd + 清理（feedback_tests_isolate_data_dir）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let gatewayRun: typeof import('../gateway-run');
let runSessions: typeof import('../../routes/run-sessions');
let conversations: typeof import('../../storage/conversations');
let projects: typeof import('../../storage/projects');
let sqlite: typeof import('../../storage/sqlite');
let timelineReplay: typeof import('../timeline-replay');

let origCwd: string;
let tmp: string;

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-gateway-run-'));
  process.chdir(tmp);
  sqlite = await import('../../storage/sqlite');
  sqlite._resetForTests();
  projects = await import('../../storage/projects');
  conversations = await import('../../storage/conversations');
  runSessions = await import('../../routes/run-sessions');
  gatewayRun = await import('../gateway-run');
  timelineReplay = await import('../timeline-replay');
});

afterAll(async () => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  // session-store 的 set/delete 是 fire-and-forget 异步写；等一拍让在飞写盘
  // 落地，避免 rmSync 和 rename 赛跑刷出 "[session-store] write failed" 噪音。
  await new Promise((r) => setTimeout(r, 200));
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore — Windows 偶发句柄滞留，tmp 目录由 OS 回收 */
  }
});

describe('startGatewayRun — conversation 互链', () => {
  it('无互链 conversation → 在 default project 下创建并写入 group_id', () => {
    const groupId = 'g-fresh-' + Date.now();
    expect(conversations.getConversationByGroup(groupId)).toBeNull();

    const gw = gatewayRun.startGatewayRun(groupId, '帮我做个落地页');
    expect(gw).not.toBeNull();

    const conv = conversations.getConversationByGroup(groupId);
    expect(conv).not.toBeNull();
    expect(conv!.conversation_id).toBe(gw!.conversationId);
    expect(conv!.group_id).toBe(groupId);
    // default project 兜底（与 POST /api/run-sessions 的 group_id 分支同款语义）
    expect(conv!.project_id).toBe('default');
    gw!.finish();
  });

  it('已有互链 conversation → 复用，不重复建', () => {
    const groupId = 'g-linked-' + Date.now();
    const project = projects.getOrCreateProject('default', 'Default Project');
    const existing = conversations.createConversation(project.project_id, undefined, groupId);

    const gw = gatewayRun.startGatewayRun(groupId, 'hello');
    expect(gw).not.toBeNull();
    expect(gw!.conversationId).toBe(existing.conversation_id);
    gw!.finish();
  });
});

describe('startGatewayRun — session 注册 + id 规范', () => {
  it('goal = "[chat] <首条用户消息前40字>"（空白折叠截断）', () => {
    const groupId = 'g-goal-' + Date.now();
    const long = '把  这段\n非常长的话 '.repeat(20);
    const gw = gatewayRun.startGatewayRun(groupId, long);
    expect(gw).not.toBeNull();

    // GET /api/run-sessions 同源数据：经 listSessionsByConversation 找到 session。
    const ids = runSessions.listSessionsByConversation(gw!.conversationId);
    expect(ids).toContain(gw!.sessionId);
    gw!.finish();
  });

  it('nextId 单调：gw_<sessionId>_1/2/3；turn_id 全轮共享', () => {
    const groupId = 'g-ids-' + Date.now();
    const gw = gatewayRun.startGatewayRun(groupId, 'x')!;
    expect(gw.turnId).toBe(`gwturn_${gw.sessionId}`);
    expect(gw.nextId()).toBe(`gw_${gw.sessionId}_1`);
    expect(gw.nextId()).toBe(`gw_${gw.sessionId}_2`);
    expect(gw.nextId()).toBe(`gw_${gw.sessionId}_3`);
    gw.finish();
  });
});

describe('emit → runBus 事件日志 → B2 读回', () => {
  it('thinking 占位 + 流式 append + finalize + msg_foot 经 getRunReplay/replayTimeline 复原', () => {
    const groupId = 'g-replay-' + Date.now();
    const gw = gatewayRun.startGatewayRun(groupId, '写个贪吃蛇')!;

    const thinkingId = gw.nextId();
    gw.emitMessage({
      id: thinkingId,
      kind: 'thinking',
      turn_id: gw.turnId,
      ts: 1000,
      label: '小张 正在思考',
      status: 'streaming',
    });
    gw.emitPatch({ id: thinkingId, op: 'thinking_append_body', chunk: '好的，' });
    gw.emitPatch({ id: thinkingId, op: 'thinking_append_body', chunk: '我来写。' });
    gw.emitPatch({ id: thinkingId, op: 'thinking_finalize', duration_ms: 1234 });
    gw.emitMessage({
      id: gw.nextId(),
      kind: 'msg_foot',
      turn_id: gw.turnId,
      ts: 2000,
      status: 'done',
      elapsed_ms: 1234,
    });

    const replay = runSessions.getRunReplay(gw.sessionId);
    expect(replay).not.toBeNull();
    expect(replay!.status).toBe('running'); // finish 前

    const messages = timelineReplay.replayTimeline(replay!.events);
    expect(messages).toHaveLength(2);

    const thinking = messages[0];
    expect(thinking.kind).toBe('thinking');
    expect(thinking.id).toBe(thinkingId);
    expect(thinking.turn_id).toBe(gw.turnId);
    if (thinking.kind === 'thinking') {
      expect(thinking.body).toBe('好的，我来写。');
      expect(thinking.status).toBe('done');
      expect(thinking.duration_ms).toBe(1234);
    }

    const foot = messages[1];
    expect(foot.kind).toBe('msg_foot');
    if (foot.kind === 'msg_foot') {
      expect(foot.status).toBe('done');
      expect(foot.elapsed_ms).toBe(1234);
    }

    gw.finish('succeeded');
    expect(runSessions.getRunReplay(gw.sessionId)!.status).toBe('succeeded');
  });

  it("finish('failed') 置终态；finish 幂等", () => {
    const groupId = 'g-fail-' + Date.now();
    const gw = gatewayRun.startGatewayRun(groupId, 'boom')!;
    gw.emitMessage({
      id: gw.nextId(),
      kind: 'raw',
      turn_id: gw.turnId,
      ts: Date.now(),
      body: '[chat-gateway] fan-out 异常：boom',
      source: 'chat-gateway',
    });
    gw.finish('failed');
    expect(runSessions.getRunReplay(gw.sessionId)!.status).toBe('failed');
    gw.finish('succeeded'); // runBus.finish 终态守卫 → 状态不变
    expect(runSessions.getRunReplay(gw.sessionId)!.status).toBe('failed');
  });

  // 2026-11-06「消息结束了还在转圈」— 生产者漏发 finalize（崩溃/中断路径）时，
  // run 终态清扫必须把残留的 streaming 过程卡就地收口，回放不再永远转圈。
  it('finish 兜底清扫：未 finalize 的 thinking/tool_call/msg_foot 落终态', () => {
    const groupId = 'g-sweep-' + Date.now();
    const gw = gatewayRun.startGatewayRun(groupId, '中断轮')!;

    const tid = gw.nextId();
    gw.emitMessage({
      id: tid,
      kind: 'thinking',
      turn_id: gw.turnId,
      ts: Date.now() - 5_000,
      label: '小张 正在思考',
      status: 'streaming',
    });
    const toolId = gw.nextId();
    gw.emitMessage({
      id: toolId,
      kind: 'tool_call',
      turn_id: gw.turnId,
      ts: Date.now(),
      name: 'web_search',
      args_summary: 'q=测试',
      status: 'running',
    });
    const footId = gw.nextId();
    gw.emitMessage({
      id: footId,
      kind: 'msg_foot',
      turn_id: gw.turnId,
      ts: Date.now(),
      status: 'running',
    });

    // finish 前：回放仍是三张未收口卡。
    const before = timelineReplay.replayTimeline(
      runSessions.getRunReplay(gw.sessionId)!.events,
    );
    expect(before.find((m) => m.id === tid && m.kind === 'thinking'))
      .toMatchObject({ status: 'streaming' });

    gw.finish('canceled');

    const replay = runSessions.getRunReplay(gw.sessionId)!;
    expect(replay.status).toBe('canceled');
    const after = timelineReplay.replayTimeline(replay.events);
    const think = after.find((m) => m.id === tid)!;
    expect(think).toMatchObject({ kind: 'thinking', status: 'done' });
    if (think.kind === 'thinking') {
      expect(typeof think.duration_ms === 'number').toBe(true);
    }
    expect(after.find((m) => m.id === toolId)).toMatchObject({
      kind: 'tool_call',
      status: 'error',
    });
    expect(after.find((m) => m.id === footId)).toMatchObject({
      kind: 'msg_foot',
      status: 'done',
    });
  });

  it('终态清扫幂等：已 finalize 的卡不被重复改写', () => {
    const groupId = 'g-sweep-idem-' + Date.now();
    const gw = gatewayRun.startGatewayRun(groupId, '正常轮')!;
    const tid = gw.nextId();
    gw.emitMessage({
      id: tid,
      kind: 'thinking',
      turn_id: gw.turnId,
      ts: Date.now() - 1_000,
      label: '小张 正在思考',
      status: 'streaming',
    });
    gw.emitPatch({ id: tid, op: 'thinking_finalize', duration_ms: 999 });
    gw.finish('succeeded');

    const after = timelineReplay.replayTimeline(
      runSessions.getRunReplay(gw.sessionId)!.events,
    );
    const think = after.find((m) => m.id === tid);
    expect(think).toMatchObject({ kind: 'thinking', status: 'done', duration_ms: 999 });
    // 清扫没有追加任何额外 thinking_finalize（duration_ms 仍是生产者的 999）。
  });
});

describe('失败语义 — 绝不反向破坏聊天主链路', () => {
  it('sqlite 不可用时返回 null 而不上抛', () => {
    // 关闭 db 句柄并把 cwd 指到一个"必然 mkdir 失败"的位置——用文件占住
    // .shadowflow 路径，让 getDb 的 mkdirSync 抛错。
    const blocked = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-gateway-blocked-'));
    const prev = process.cwd();
    try {
      fs.writeFileSync(path.join(blocked, '.shadowflow'), 'not a dir');
      sqlite._resetForTests();
      process.chdir(blocked);
      const gw = gatewayRun.startGatewayRun('g-broken', 'x');
      expect(gw).toBeNull();
    } finally {
      process.chdir(prev);
      sqlite._resetForTests();
      try {
        fs.rmSync(blocked, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});

/**
 * groups-chat.test.ts — 单后端群聊网关集成测试（ADR-0001，2026-11-24 重写）。
 *
 * Run from backend/node/:  npx tsx src/routes/groups/groups-chat.test.ts
 *
 * 旧版（双后端时代）验证「gateway 持久化到 (mock) Python + X-SF-No-Dispatch
 * 抑制头」契约；Python 退役后该契约作废 —— 现在验证单后端语义：
 *
 *   1. user message → 201 立即返回，消息落 Node store（groups-store SQLite），
 *      且因群内 agent_ids=[] 回复 fan-out 短路（只补一条系统通告，无 agent 回复）
 *   2. agent message → 201 落库，且不触发任何 fan-out
 *   3. 群不存在 → 502 PERSIST_FAILED（与原 Python 语义一致）
 *
 * 真正的回复生成（resolveCallable → CLI/API turn()）需要真后端，浏览器手测；
 * agent 选择 / fanout 编排在 groups-chat-*.test.ts（vitest）里覆盖。
 */
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as store from '../../storage/groups-store';

let passCount = 0;
let failCount = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log('        detail:', detail);
  }
}

async function main() {
  // 建一个专用测试群（agent_ids=[] → fan-out 短路）。名字带时间戳便于辨认；
  // store 没有 deleteGroup，测试残留一条空群可接受（sqlite dev 库）。
  const g = store.createGroup({
    name: `it-chat-gateway-${Date.now()}`,
    agent_ids: [],
  });
  const groupId = g.group_id;

  const { groupsChatRouter } = await import('./groups-chat');

  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupsChatRouter);
  const nodeSrv = http.createServer(app);
  await new Promise<void>((r) => nodeSrv.listen(0, '127.0.0.1', r));
  const nodePort = (nodeSrv.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${nodePort}`;

  const post = async (body: Record<string, unknown>) =>
    fetch(`${base}/api/groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  // ── 1. user message: 201 立即返回 + 落库 ────────────────────────────────
  const r1 = await post({ content: 'hi', sender_kind: 'user', executor: 'byok:zhipu' });
  check('user POST returns 201', r1.status === 201, r1.status);
  const afterUser = store.listGroupMessages(groupId);
  check(
    'user message persisted to Node store',
    afterUser.some((m) => m.sender_kind === 'user' && m.content === 'hi'),
    afterUser.map((m) => `${m.sender_kind}:${String(m.content).slice(0, 12)}`),
  );

  // ── 2. agent message: 201 落库，且不触发 fan-out ────────────────────────
  const r2 = await post({
    content: 'agent reporting in',
    sender_kind: 'agent',
    sender_name: 'agent-a',
    agent_id: 'agent-a',
  });
  check('agent POST returns 201', r2.status === 201, r2.status);
  const afterAgent = store.listGroupMessages(groupId);
  check(
    'agent message persisted',
    afterAgent.some((m) => m.sender_kind === 'agent' && m.content === 'agent reporting in'),
    afterAgent.map((m) => `${m.sender_kind}:${String(m.content).slice(0, 12)}`),
  );

  // agent 消息不触发回复：等待可能的异步 fan-out 后消息数不增长（agent_ids=[] 本就短路）
  await new Promise((r) => setTimeout(r, 150));
  const settled = store.listGroupMessages(groupId);
  const replies = settled.filter((m) => m.sender_kind === 'agent' && m.content !== 'agent reporting in');
  check('agent send triggers no fanout', replies.length === 0, replies.map((m) => m.content));

  // ── 3. 群不存在 → 502 PERSIST_FAILED ────────────────────────────────────
  const r3 = await fetch(`${base}/api/groups/no-such-group/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x', sender_kind: 'user' }),
  });
  check('unknown group → 502 PERSIST_FAILED', r3.status === 502, r3.status);
  const body3 = (await r3.json()) as { error?: { code?: string } };
  check('502 envelope carries code', body3.error?.code === 'PERSIST_FAILED', body3);

  nodeSrv.close();
  console.log(`\ngroups-chat gateway: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

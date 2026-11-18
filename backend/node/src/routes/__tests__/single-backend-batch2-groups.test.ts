/**
 * single-backend-batch2-groups.test.ts — 第二批 backend-engineer 三组的对齐测试
 *
 * D 组 workspaces（routes/projects/workspaces.ts）：
 *   CRUD 往返、enrich 计数（agents/teams JSON + sqlite agent 补源）、
 *   404/400 非法 id、PATCH 部分更新、DELETE 204
 * E 组 templates（routes/system/templates.ts）：
 *   /api/templates 清单字段（对齐 server.py:1095）、/:id/inbox roster 直转、
 *   未知模板优雅降级空 inbox
 * F 组 inbox（routes/groups/inbox.ts）：
 *   群列表聚合（messages 尾条预览/lastActivityAt/metrics/members 快照）、
 *   agent_dms（sqlite + JSON 双源合并）、DM 改名回填
 * G 组 briefboard（groups-node.ts :id/briefboard）：
 *   群 404 裸 detail 字符串（对齐 python groups.py:454）、命中返回空 entries
 *
 * 数据隔离：process.chdir(mkdtemp)（sqlite paths() 用 cwd）+
 * SHADOWFLOW_DATA_DIR 指向同一 tmp（repoDataFile 收口 JSON 路径）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'sf-sbe-b2-groups-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;

import workspacesRouter from '../projects/workspaces';
import templatesRouter from '../system/templates';
import inboxRouter from '../groups/inbox';
import { getDb, _resetForTests } from '../../storage/sqlite';
import groupsNodeRouter from '../groups/groups-node';
import * as store from '../../storage/groups-store';
import { createGroup, appendGroupMessage } from '../../storage/groups-store';
import { createAgent } from '../../storage/agents';

afterAll(() => {
  // 顺序敏感：先切回 cwd（Windows 不能删进程当前目录）→ 关 sqlite 句柄 → 删目录
  process.chdir(origCwd);
  _resetForTests();
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SHADOWFLOW_DATA_DIR;
});

function jsonApp(): express.Express {
  const a = express();
  a.use(express.json());
  return a;
}

function wsApp() {
  return jsonApp().use('/api/workspaces', workspacesRouter);
}
function tplApp() {
  return jsonApp().use('/api', templatesRouter);
}
function inboxApp() {
  return jsonApp().use('/api', inboxRouter);
}
function groupsApp() {
  return jsonApp().use('/api/groups', groupsNodeRouter);
}

// ════════════════════════════════════════════════════════════════════════════
// D 组 workspaces
// ════════════════════════════════════════════════════════════════════════════

describe('D /api/workspaces — CRUD', () => {
  const wsDir = path.join(tmp, 'workspaces');
  const agentsDir = path.join(tmp, 'agents');
  const teamsDir = path.join(tmp, 'teams');

  beforeEach(() => {
    // 每用例全新数据目录（sqlite 已在 F 组 beforeEach 重置，此处文件域隔离）
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(teamsDir, { recursive: true, force: true });
    rmSync(agentsDir, { recursive: true, force: true });
    for (const d of [wsDir, agentsDir, teamsDir]) mkdirSync(d, { recursive: true });
  });

  /** 在真实 workspace id 下写 JSON agent/team fixture（Python 与 Node 共读同目录）。 */
  function seedJsonFixture(wsId: string): void {
    writeFileSync(
      path.join(agentsDir, 'agent-json-1.json'),
      JSON.stringify({ agent_id: 'agent-json-1', workspace_id: wsId }),
      'utf-8',
    );
    writeFileSync(
      path.join(teamsDir, 'team-1.json'),
      JSON.stringify({ team_id: 'team-1', workspace_id: wsId }),
      'utf-8',
    );
  }

  it('POST → 201 + 默认 color/owner + created:true', async () => {
    const res = await request(wsApp()).post('/api/workspaces').send({ name: '我的工作区' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: '我的工作区',
      color: '#6366f1',
      owner_id: 'local',
    });
    expect(res.body.data.workspace_id).toMatch(/^ws-[0-9a-f]{12}$/);
    expect(res.body.meta).toEqual({ created: true });
    expect(res.body.data.created_at).toBeTruthy();
  });

  it('GET 列表 → enrich agent_count（JSON+sqlite 并集）/team_count', async () => {
    const created = await request(wsApp()).post('/api/workspaces').send({ name: 'ws-x' });
    const wsId = created.body.data.workspace_id as string;
    seedJsonFixture(wsId);
    // sqlite agent 落同一 workspace（不同 id → 并集计数 2）
    createAgent('sqlite-agent', 'soul', wsId);

    const list = await request(wsApp()).get('/api/workspaces');
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({ total: 1 });
    expect(list.body.data[0]).toMatchObject({
      workspace_id: wsId,
      agent_count: 2, // 1 JSON + 1 sqlite
      team_count: 1,
    });
  });

  it('GET 单个 → 404 WORKSPACE_NOT_FOUND / 400 非法 id（穿越）', async () => {
    const miss = await request(wsApp()).get('/api/workspaces/ws-nope');
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe('WORKSPACE_NOT_FOUND');
    const evil = await request(wsApp()).get('/api/workspaces/..%2F..%2Fetc');
    expect([400, 404]).toContain(evil.status);
    expect(evil.body.error?.code || evil.body.error?.message).toBeTruthy();
  });

  it('PATCH name/color 部分更新 + updated_at 前移；DELETE → 204；再 GET 404', async () => {
    const created = await request(wsApp())
      .post('/api/workspaces')
      .send({ name: 'old', color: '#000000' });
    const id = created.body.data.workspace_id as string;
    const createdAt = created.body.data.updated_at as string;

    await new Promise((r) => setTimeout(r, 20));
    const patched = await request(wsApp())
      .patch(`/api/workspaces/${id}`)
      .send({ name: 'new-name' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('new-name');
    expect(patched.body.data.color).toBe('#000000'); // 未传不动
    expect(patched.body.data.updated_at > createdAt).toBeTruthy();

    const del = await request(wsApp()).delete(`/api/workspaces/${id}`);
    expect(del.status).toBe(204);
    const gone = await request(wsApp()).get(`/api/workspaces/${id}`);
    expect(gone.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E 组 templates
// ════════════════════════════════════════════════════════════════════════════

describe('E /api/templates — 清单 + 模板 inbox', () => {
  const tplDir = path.join(tmp, 'templates');
  const customDir = path.join(tplDir, 'custom');

  beforeAll(() => {
    mkdirSync(customDir, { recursive: true });
    writeFileSync(
      path.join(tplDir, 'newsroom.yaml'),
      [
        'template_id: newsroom',
        'name: "Newsroom"',
        'user_role: Editor-in-Chief',
        'default_ops_room_name: Editorial Room',
        'brief_board_alias: 早报会',
        'theme_color: "#EF4444"',
        'metadata:',
        '  builder_origin: ""',
        '  workflow_id: ""',
        '  kit_tags: [media]',
        'agent_roster:',
        '  - id: reporter',
        '    name: 记者',
        '    soul: 采写新闻稿件',
        '  - id: editor',
        '    name: 编辑',
        '    soul: 润色稿件',
        'group_roster:',
        '  - id: editorial-room',
        '    name: Editorial Room',
        '    agents: [reporter, editor]',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(path.join(tplDir, 'broken.yaml'), '::::not-valid-yaml:[', 'utf-8');
  });

  it('GET /api/templates → 字段对齐 server.py:1095 + 坏 yaml 跳过', async () => {
    const res = await request(tplApp()).get('/api/templates');
    expect(res.status).toBe(200);
    const item = res.body.data.find((t: { template_id: string }) => t.template_id === 'newsroom');
    expect(item).toBeDefined();
    expect(item).toMatchObject({
      name: 'Newsroom',
      user_role: 'Editor-in-Chief',
      default_ops_room_name: 'Editorial Room',
      brief_board_alias: '早报会',
      theme_color: '#EF4444',
      agent_roster_count: 2,
      group_roster_count: 1,
      source: 'seed',
      description: '',
      kit_tags: ['media'],
    });
    expect(res.body.data.find((t: { template_id: string }) => t.template_id === 'broken')).toBeUndefined();
    expect(res.body.meta.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('GET /:id/inbox → roster 直转（groups/agent_dms 全 idle）；未知模板降级空', async () => {
    const hit = await request(tplApp()).get('/api/templates/newsroom/inbox');
    expect(hit.status).toBe(200);
    expect(hit.body.data.groups).toHaveLength(1);
    expect(hit.body.data.groups[0]).toMatchObject({
      id: 'editorial-room',
      name: 'Editorial Room',
      templateId: 'newsroom',
      status: 'idle',
    });
    expect(hit.body.data.agent_dms).toHaveLength(2);
    expect(hit.body.data.agent_dms[0]).toMatchObject({
      agentId: 'reporter',
      agentName: '记者',
      kind: 'local',
      status: 'idle',
    });

    const miss = await request(tplApp()).get('/api/templates/no-such/inbox');
    expect(miss.status).toBe(200);
    expect(miss.body.data).toEqual({ groups: [], agent_dms: [] });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// F 组 inbox
// ════════════════════════════════════════════════════════════════════════════

describe('F /api/inbox — workspace 聚合', () => {
  beforeEach(() => {
    _resetForTests();
    // JSON agent 库也清掉，避免跨用例串扰
    rmSync(path.join(tmp, 'agents'), { recursive: true, force: true });
    mkdirSync(path.join(tmp, 'agents'), { recursive: true });
  });

  it('groups 聚合：尾条消息预览/lastActivityAt/metrics.members/成员快照', async () => {
    const g = createGroup({ name: '项目群', template_id: 'newsroom', workspace_id: 'ws-run' });
    const wsId = 'ws-run';
    createAgent('成员A', '我是A', wsId);
    appendGroupMessage(g.group_id, {
      sender_name: '成员A',
      sender_kind: 'agent',
      content: '最新一条进展汇报',
    });

    const res = await request(inboxApp()).get(`/api/inbox?workspace_id=${wsId}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('workspace-groups');
    const group = res.body.data.groups.find((x: { id: string }) => x.id === g.group_id);
    expect(group).toBeDefined();
    expect(group.lastMessage).toBe('最新一条进展汇报');
    // agent_dms：sqlite agent 出现，DM 聚合里带 soul 预览（agentId 是 UUID，按 name 找）
    const dm = res.body.data.agent_dms.find((x: { agentName: string }) => x.agentName === '成员A');
    expect(dm).toBeDefined();
    expect(dm.lastMessage).toBe('我是A');
  });

  it('DM 改名回填：patchGroup 改 DM 群名后 agentName 用新名', async () => {
    const a = createAgent('原名Agent', 'soul');
    const dm = createGroup({ name: '原名Agent', kind: 'dm', agent_ids: [a.agent_id] });
    store.patchGroup(dm.group_id, { name: '改后的名字' });

    const res = await request(inboxApp()).get('/api/inbox');
    const row = res.body.data.agent_dms.find((x: { agentId: string }) => x.agentId === a.agent_id);
    expect(row).toBeDefined();
    expect(row.agentName).toBe('改后的名字');
    expect(row.group_id).toBe(dm.group_id);
  });

  it('workspace 过滤：不串 workspace 的群与 agent', async () => {
    const g1 = createGroup({ name: 'ws1群', workspace_id: 'ws-1' });
    createGroup({ name: 'ws2群', workspace_id: 'ws-2' });
    createAgent('ws1agent', 's', 'ws-1');
    createAgent('ws2agent', 's', 'ws-2');

    const res = await request(inboxApp()).get('/api/inbox?workspace_id=ws-1');
    const ids = res.body.data.groups.map((x: { id: string }) => x.id);
    expect(ids).toContain(g1.group_id);
    expect(ids).toHaveLength(1); // ws2 群被过滤
    // agent_dms 的 key 是 agent_id（UUID），按 agentName 断言
    const dmNames = res.body.data.agent_dms.map((x: { agentName: string }) => x.agentName);
    expect(dmNames).toContain('ws1agent');
    expect(dmNames).not.toContain('ws2agent');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// G 组 briefboard（并入 groups-node.ts）
// ════════════════════════════════════════════════════════════════════════════

describe('G /api/groups/:id/briefboard', () => {
  it('群不存在 → 404 裸 detail 字符串（python groups.py:454 同款）', async () => {
    const res = await request(groupsApp()).get('/api/groups/g-nope/briefboard');
    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('Group not found: g-nope');
  });

  it('群存在 → {data:{date,entries:[]}}；date 参数透传', async () => {
    const g = createGroup({ name: '板群' });
    const res = await request(groupsApp()).get(`/api/groups/${g.group_id}/briefboard?date=2026-11-18`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ date: '2026-11-18', entries: [] });
    // 默认 date = 今天（UTC）
    const bare = await request(groupsApp()).get(`/api/groups/${g.group_id}/briefboard`);
    expect(bare.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

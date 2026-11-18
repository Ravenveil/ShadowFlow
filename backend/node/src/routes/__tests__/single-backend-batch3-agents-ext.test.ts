/**
 * single-backend-batch3-agents-ext.test.ts — 第三批 agents 邻接域对齐测试。
 *
 * 覆盖（对照 Python handler 逐字段）：
 *   agent registry（agents.py registry 段 + registry.py packs 段）
 *     GET  /api/agents/registry                — 空态 {data:[],meta:{total:0}}；
 *                                                ?status=/?team_id= 过滤；条目序列化
 *     GET  /api/agents/registry/:agent_id      — entry+manifest 全形状；404 AGENT_NOT_FOUND
 *     POST /api/agents/registry/refresh        — 200 offline+queued_for_rehandshake；
 *                                                422 校验；404 AGENT_NOT_FOUND
 *     GET  /api/agents/registry/packs          — 列表（?tags=/?q=/?workspace_id=）；
 *                                                400 INVALID_WORKSPACE_ID
 *     POST /api/agents/registry/packs/install  — 201 幂等回显 already_installed；
 *                                                签名通过/无签名 warning；404/422
 *     GET  /api/agents/registry/packs/installed— update_available
 *   ACP Server（acp_server.py）
 *     GET  /api/acp/status   — 裸对象四字段
 *     GET  /api/acp/sessions — {data,meta:{total}}
 *     POST /api/acp/task    — 422 detail / 404 SESSION_NOT_FOUND / 200 dispatched
 *   A2A bridge（a2a_bridge.py）
 *     GET /.well-known/agent.json — disabled 404 / enabled AgentCard
 *     POST /a2a/ — JSON-RPC 2.0：sendMessage echo 完成 / getTask / cancelTask
 *                  （working 态取消成功、terminal 取消 -32002）/ legacy 别名 /
 *                  -32601 / -32600 / -32602
 *   approvals（approvals.py + ops.py /approvals/pending）
 *     GET  /approvals/pending                    — 裸 List[PendingApproval] ops 形状
 *     GET  /api/groups/:gid/approvals/pending    — {items:[]}（svc-None 降级同形）
 *     POST /api/approvals/:id/approve|reject     — 200/404 not-found/404 already-
 *                                                  resolved/422；桥接 toolApprovals
 *     GET  /api/approvals/events                 — SSE approval.pending → resolved
 *   groups thread（groups.py:1100）
 *     GET /api/groups/:id/messages/:mid/thread   — {data:{source_message,replies},
 *                                                  meta:{count}}；404 detail.error
 *
 * 隔离惯例：process.chdir(mkdtemp) + SHADOWFLOW_DATA_DIR（模块顶层，先于动态
 * import）；afterAll 三步序（chdir 回 → sqlite._resetForTests 关句柄 → rmSync，
 * Windows EBUSY）。packs 数据源用 <tmp>/templates/agent-packs 合成 fixture
 * （packsRoot() 第二候选 = cwd/templates/agent-packs），不读写真实仓库模板；
 * 签名 fixture 用与实现相同的 canonical（js-yaml sortKeys）+ HMAC 自签自验。
 * 无裸 require；无 vi.mock（registry/session 经 lib 导出直注）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

// ── 隔离：必须在动态 import storage/routes 模块之前 chdir ────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-sbe-b3-agents-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;

// ── packs fixture：<tmp>/templates/agent-packs（packsRoot 第二候选命中） ──────
const packsDir = path.join(tmp, 'templates', 'agent-packs');
fs.mkdirSync(path.join(packsDir, 'pack-free'), { recursive: true });
fs.mkdirSync(path.join(packsDir, 'pack-signed'), { recursive: true });
fs.mkdirSync(path.join(packsDir, 'installed'), { recursive: true });

const packFreeBody = {
  id: 'pack-free',
  version: '1.0.0',
  name: 'Free Pack',
  description: 'Unsigned demo pack for tests',
  author: 'qa',
  soul: 'Do demo things',
  kind: 'cli',
  capabilities: {
    tools: ['demo.echo'],
    llm_provider: 'claude',
    streaming: false,
    approval_required: false,
    session_resume: false,
    tool_calls: false,
  },
  install_cmd: 'echo installed-free',
  signature: null,
};

const PACK_SECRET = 'test-pack-secret';
// 注意：不能从 packFreeBody 展开继承 signature: null 键——verifySignature 对
// 「剔除 signature 键后」的 body 做 canonical dump，签名字节必须同构。
const { signature: _omit, ...packFreeNoSig } = packFreeBody;
void _omit;
const packSignedBody = {
  ...packFreeNoSig,
  id: 'pack-signed',
  version: '2.1.0',
  name: 'Signed Pack',
  description: 'HMAC signed pack for tests',
  install_cmd: null,
};
const canonical = yaml.dump(packSignedBody, { sortKeys: true, lineWidth: 80, noRefs: true });
const signature = crypto.createHmac('sha256', PACK_SECRET).update(canonical, 'utf-8').digest('hex');

const dumpOpts = { sortKeys: true, lineWidth: 80, noRefs: true };

fs.writeFileSync(path.join(packsDir, 'registry-index.yaml'),
  yaml.dump({
    packs: [
      { id: 'pack-free', path: 'pack-free/agent-manifest.yaml', tags: ['demo', 'free'] },
      { id: 'pack-signed', path: 'pack-signed/agent-manifest.yaml', tags: ['demo', 'secure'] },
    ],
  }),
  'utf-8');
fs.writeFileSync(path.join(packsDir, 'pack-free', 'agent-manifest.yaml'),
  yaml.dump(packFreeBody, dumpOpts), 'utf-8');
fs.writeFileSync(path.join(packsDir, 'pack-signed', 'agent-manifest.yaml'),
  yaml.dump({ ...packSignedBody, signature: { algorithm: 'hmac-sha256', value: signature } }, dumpOpts),
  'utf-8');
// 预置旧版本安装记录（update_available 断言数据源）
fs.writeFileSync(path.join(packsDir, 'installed', 'ws-old.json'),
  JSON.stringify({
    workspace_id: 'ws-old',
    installed: [{
      pack_id: 'pack-free',
      pack_version: '0.0.9',
      agent_id: 'agent-legacy0000',
      installed_at: '2026-01-01T00:00:00.000Z',
      verified: false,
      blueprint: {},
    }],
  }, null, 2),
  'utf-8');

// ── 模块句柄（beforeAll 动态 import 赋值） ───────────────────────────────────
type RegistryMod = typeof import('../agents/registry');
type AcpMod = typeof import('../system/acp');
type ApprovalsMod = typeof import('../runs/approvals');
type GroupsNodeMod = typeof import('../groups/groups-node');
type AcpRegistryMod = typeof import('../../lib/acp-registry');
type ToolApprovalMod = typeof import('../../lib/tool-approval');
type SqliteMod = typeof import('../../storage/sqlite');
type GroupsStoreMod = typeof import('../../storage/groups-store');
type AcpSendRequest = import('../../lib/acp-registry').AcpSendRequest;

let registryMod!: RegistryMod;
let acpMod!: AcpMod;
let approvalsMod!: ApprovalsMod;
let groupsNodeMod!: GroupsNodeMod;
let acpRegistry!: AcpRegistryMod;
let toolApprovalMod!: ToolApprovalMod;
let sqlite!: SqliteMod;
let groupsStore!: GroupsStoreMod;

let agentsApp!: Express;
let acpApp!: Express;
let a2aApp!: Express;
let approvalsApp!: Express;
let groupsApp!: Express;
let approvalsServer!: http.Server;
let approvalsPort!: number;

beforeAll(async () => {
  registryMod = await import('../agents/registry');
  acpMod = await import('../system/acp');
  approvalsMod = await import('../runs/approvals');
  groupsNodeMod = await import('../groups/groups-node');
  acpRegistry = await import('../../lib/acp-registry');
  toolApprovalMod = await import('../../lib/tool-approval');
  sqlite = await import('../../storage/sqlite');
  groupsStore = await import('../../storage/groups-store');

  sqlite._resetForTests();
  sqlite.getDb(); // 在 tmp cwd boot schema

  agentsApp = express();
  agentsApp.use(express.json());
  agentsApp.use('/api/agents', registryMod.default);

  acpApp = express();
  acpApp.use(express.json());
  acpApp.use('/api/acp', acpMod.default);

  a2aApp = express();
  a2aApp.use(express.json());
  a2aApp.use(acpMod.a2aRouter);

  approvalsApp = express();
  approvalsApp.use(express.json());
  approvalsApp.use('/', approvalsMod.default);
  await new Promise<void>((resolve) => {
    approvalsServer = approvalsApp.listen(0, () => {
      approvalsPort = (approvalsServer.address() as { port: number }).port;
      resolve();
    });
  });

  groupsApp = express();
  groupsApp.use(express.json());
  groupsApp.use('/api/groups', groupsNodeMod.default);
});

afterAll(async () => {
  // ① 先切回原 cwd（Windows 不允许删除进程当前目录）+ 环境复位
  process.chdir(origCwd);
  delete process.env.SHADOWFLOW_DATA_DIR;
  delete process.env.SHADOWFLOW_PACK_SECRET;
  delete process.env.A2A_BRIDGE_ENABLED;
  delete process.env.A2A_REQUIRE_AUTH;
  delete process.env.A2A_API_KEY;
  await new Promise<void>((resolve) => approvalsServer.close(() => resolve()));
  // ② 关 sqlite 句柄（下一个 getDb 才会重开新 cwd）
  sqlite._resetForTests();
  toolApprovalMod.toolApprovals._clearForTests();
  // ③ 最后删临时目录
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ─── agent registry：runtime 段（agents.py） ──────────────────────────────────

describe('GET /api/agents/registry — runtime registry', () => {
  it('empty registry → 200 {data:[], meta:{total:0}}', async () => {
    const r = await request(agentsApp).get('/api/agents/registry');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
    expect(r.body.meta).toEqual({ total: 0 });
  });

  it('after register → serialized entry fields', async () => {
    acpRegistry.getAcpRegistry().register(
      acpRegistry.makeManifest({
        agent_id: 'agent-reg-1',
        display_name: 'Reg One',
        version: '1.2.0',
        tools: [{ name: 'fs.read', description: 'read files' }],
        max_concurrency: 2,
      }),
      { teamMemberships: ['team-red'] },
    );
    const r = await request(agentsApp).get('/api/agents/registry');
    expect(r.status).toBe(200);
    expect(r.body.meta).toEqual({ total: 1 });
    const e = r.body.data[0];
    expect(e.agent_id).toBe('agent-reg-1');
    expect(e.display_name).toBe('Reg One');
    expect(e.version).toBe('1.2.0');
    expect(e.tools).toEqual(['fs.read']);
    expect(e.max_concurrency).toBe(2);
    expect(e.status).toBe('online');
    expect(e.active_tasks).toBe(0);
    expect(e.available_slots).toBe(2);
    expect(e.team_memberships).toEqual(['team-red']);
    expect(typeof e.connected_at).toBe('string');
    expect(e.is_native).toBe(false);
  });

  it('?status=online filters in; ?status=offline excludes', async () => {
    const inR = await request(agentsApp).get('/api/agents/registry?status=online');
    expect(inR.body.meta).toEqual({ total: 1 });
    const offR = await request(agentsApp).get('/api/agents/registry?status=offline');
    expect(offR.body.data).toEqual([]);
  });

  it('?team_id= filters by membership', async () => {
    acpRegistry.getAcpRegistry().register(
      acpRegistry.makeManifest({ agent_id: 'agent-reg-2', display_name: 'Reg Two' }),
    );
    const hit = await request(agentsApp).get('/api/agents/registry?team_id=team-red');
    expect(hit.body.meta).toEqual({ total: 1 });
    expect(hit.body.data[0].agent_id).toBe('agent-reg-1');
    const miss = await request(agentsApp).get('/api/agents/registry?team_id=team-blue');
    expect(miss.body.data).toEqual([]);
  });
});

describe('GET /api/agents/registry/:agent_id — detail + manifest', () => {
  it('returns entry + full manifest shape', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/agent-reg-1');
    expect(r.status).toBe(200);
    expect(r.body.data.agent_id).toBe('agent-reg-1');
    const m = r.body.data.manifest;
    expect(m.agent_id).toBe('agent-reg-1');
    expect(m.tools).toEqual([{ name: 'fs.read', description: 'read files' }]);
    expect(m.max_concurrency).toBe(2);
    expect(m.memory).toEqual({ type: 'stateless', scope: 'request', persistence: false });
    expect(m.protocols).toEqual(['acp-v1']);
    expect(m.workspace_context).toBe(false);
  });

  it('404 AGENT_NOT_FOUND for unknown id', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/agent-missing');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('AGENT_NOT_FOUND');
    expect(r.body.error.message).toBe("Agent 'agent-missing' not found in registry");
  });
});

describe('POST /api/agents/registry/refresh', () => {
  it('200 → offline + queued_for_rehandshake; entry flips offline', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/refresh')
      .send({ agent_id: 'agent-reg-2' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      agent_id: 'agent-reg-2',
      status: 'offline',
      queued_for_rehandshake: true,
    });
    const get = await request(agentsApp).get('/api/agents/registry/agent-reg-2');
    expect(get.body.data.status).toBe('offline');
  });

  it('422 on invalid agent_id pattern', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/refresh')
      .send({ agent_id: 'bad id!' });
    expect(r.status).toBe(422);
    expect(r.body.detail[0].loc).toEqual(['body', 'agent_id']);
  });

  it('404 AGENT_NOT_FOUND for unknown', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/refresh')
      .send({ agent_id: 'agent-nowhere' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('AGENT_NOT_FOUND');
  });
});

// ─── agent packs（registry.py；fixture 数据源） ───────────────────────────────

describe('GET /api/agents/registry/packs', () => {
  it('lists fixture packs with install_status/verified', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs?workspace_id=ws-check');
    expect(r.status).toBe(200);
    expect(r.body.meta).toEqual({ total: 2 });
    const free = r.body.data.find((p: { id: string }) => p.id === 'pack-free');
    const signed = r.body.data.find((p: { id: string }) => p.id === 'pack-signed');
    expect(free.name).toBe('Free Pack');
    expect(free.tags).toEqual(['demo', 'free']);
    expect(free.install_status).toBe('not_installed');
    expect(free.verified).toBe(false); // 无签名 → 未验证
    expect(signed.verified).toBe(true); // 有签名（未安装时按签名存在性显示）
    expect(signed.capabilities_summary).toEqual(['demo.echo']);
  });

  it('?tags= filters', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs?tags=secure&workspace_id=ws-check');
    expect(r.body.meta).toEqual({ total: 1 });
    expect(r.body.data[0].id).toBe('pack-signed');
  });

  it('?q= filters by name/description', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs?q=free&workspace_id=ws-check');
    expect(r.body.meta).toEqual({ total: 1 });
    expect(r.body.data[0].id).toBe('pack-free');
  });

  it('400 INVALID_WORKSPACE_ID on bad workspace_id', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs?workspace_id=bad%21');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_WORKSPACE_ID');
  });

  it('has_update for pre-seeded older install (ws-old fixture)', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs?workspace_id=ws-old');
    const free = r.body.data.find((p: { id: string }) => p.id === 'pack-free');
    expect(free.install_status).toBe('has_update');
  });
});

describe('POST /api/agents/registry/packs/install', () => {
  it('422 on blank pack_id / bad workspace_id', async () => {
    const a = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: '', workspace_id: 'ws-x' });
    expect(a.status).toBe(422);
    expect(a.body.detail[0].loc).toEqual(['body', 'pack_id']);
    const b = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'pack-free', workspace_id: 'bad ws' });
    expect(b.status).toBe(422);
    expect(b.body.detail[0].loc).toEqual(['body', 'workspace_id']);
  });

  it('404 PACK_NOT_FOUND for unknown pack', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'no-such-pack', workspace_id: 'ws-x' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('PACK_NOT_FOUND');
    expect(r.body.error.message).toBe("Pack 'no-such-pack' not found in registry");
  });

  it('400 MANIFEST_SIGNATURE_INVALID when signed pack + no secret', async () => {
    delete process.env.SHADOWFLOW_PACK_SECRET;
    const r = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'pack-signed', workspace_id: 'ws-x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('MANIFEST_SIGNATURE_INVALID');
    expect(r.body.error.pack_id).toBe('pack-signed');
  });

  it('201 installs unsigned pack with warnings (install_cmd not executed)', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'pack-free', workspace_id: 'ws-fresh' });
    expect(r.status).toBe(201);
    expect(r.body.data.pack_id).toBe('pack-free');
    expect(r.body.data.pack_version).toBe('1.0.0');
    expect(r.body.data.verified).toBe(false);
    expect(r.body.data.already_installed).toBe(false);
    expect(r.body.data.agent_id).toMatch(/^agent-[0-9a-f]{12}$/);
    expect(r.body.data.blueprint.name).toBe('Free Pack');
    expect(r.body.data.blueprint.role_profiles[0].tools).toEqual(['demo.echo']);
    expect(r.body.meta.warnings.join(' ')).toContain('NOT executed');
    expect(r.body.meta.warnings.join(' ')).toContain('no signature');
    // installed JSON 落在 fixture（tmp 内），与 Python 同一份文件形状
    const db = JSON.parse(
      fs.readFileSync(path.join(packsDir, 'installed', 'ws-fresh.json'), 'utf-8'),
    );
    expect(db.workspace_id).toBe('ws-fresh');
    expect(db.installed[0].pack_id).toBe('pack-free');
  });

  it('201 + verified=true for signed pack with correct secret', async () => {
    process.env.SHADOWFLOW_PACK_SECRET = PACK_SECRET;
    const r = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'pack-signed', workspace_id: 'ws-sec' });
    expect(r.status).toBe(201);
    expect(r.body.data.verified).toBe(true);
    expect(r.body.data.blueprint.metadata.pack_id).toBe('pack-signed');
  });

  it('idempotent reinstall → 200 already_installed (same version)', async () => {
    const r = await request(agentsApp)
      .post('/api/agents/registry/packs/install')
      .send({ pack_id: 'pack-free', workspace_id: 'ws-fresh' });
    expect(r.status).toBe(200);
    expect(r.body.data.already_installed).toBe(true);
    expect(r.body.data.pack_id).toBe('pack-free');
    expect(r.body.data.agent_id).toMatch(/^agent-/); // 回显首装 agent_id
  });
});

describe('GET /api/agents/registry/packs/installed', () => {
  it('update_available=false for same-version install', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs/installed?workspace_id=ws-fresh');
    expect(r.status).toBe(200);
    expect(r.body.meta).toEqual({ total: 1 });
    expect(r.body.data[0].pack_id).toBe('pack-free');
    expect(r.body.data[0].name).toBe('Free Pack');
    expect(r.body.data[0].update_available).toBe(false);
    expect(r.body.data[0].verified).toBe(false);
  });

  it('update_available=true for stale ws-old fixture', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs/installed?workspace_id=ws-old');
    expect(r.body.data[0].update_available).toBe(true);
  });

  it('400 INVALID_WORKSPACE_ID on bad workspace_id', async () => {
    const r = await request(agentsApp).get('/api/agents/registry/packs/installed?workspace_id=bad%21');
    expect(r.status).toBe(400);
  });
});

// ─── ACP Server REST（acp_server.py） ─────────────────────────────────────────

describe('GET /api/acp/status + /sessions', () => {
  beforeAll(() => {
    // runtime-registry describe 注册过 agent——清空后空态断言才成立
    acpRegistry._resetForTests();
  });

  it('empty → bare status object with zero agents', async () => {
    const r = await request(acpApp).get('/api/acp/status');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      server: 'running',
      connected_agents: 0,
      online_agents: 0,
      online_agent_ids: [],
    });
    const s = await request(acpApp).get('/api/acp/sessions');
    expect(s.status).toBe(200);
    expect(s.body).toEqual({ data: [], meta: { total: 0 } });
  });

  it('registered agent + connected session → status/sessions reflect', async () => {
    acpRegistry.getAcpRegistry().register(
      acpRegistry.makeManifest({ agent_id: 'agent-acp-1', display_name: 'ACP One' }),
    );
    acpRegistry.acpSessions.connect({
      session_id: 'sess-1',
      agent_id: 'agent-acp-1',
      connected_at: new Date().toISOString(),
    });
    const r = await request(acpApp).get('/api/acp/status');
    expect(r.body.connected_agents).toBe(1);
    expect(r.body.online_agents).toBe(1);
    expect(r.body.online_agent_ids).toEqual(['agent-acp-1']);
    const s = await request(acpApp).get('/api/acp/sessions');
    expect(s.body.meta).toEqual({ total: 1 });
    expect(s.body.data[0].agent_id).toBe('agent-acp-1');
    expect(s.body.data[0].status).toBe('online');
    expect(s.body.data[0].active_tasks).toBe(0);
  });
});

describe('POST /api/acp/task', () => {
  it('422 detail when session_id/instruction missing', async () => {
    const r = await request(acpApp).post('/api/acp/task').send({});
    expect(r.status).toBe(422);
    expect(r.body.detail).toHaveLength(2);
    expect(r.body.detail[0].loc).toEqual(['body', 'session_id']);
    expect(r.body.detail[1].loc).toEqual(['body', 'instruction']);
  });

  it('404 SESSION_NOT_FOUND for session without transport', async () => {
    const r = await request(acpApp)
      .post('/api/acp/task')
      .send({ session_id: 'sess-1', instruction: 'do it' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('SESSION_NOT_FOUND');
    expect(r.body.error.message).toBe("Session 'sess-1' not active");
  });

  it('200 dispatched with task_id via transport; unknown session 404', async () => {
    const received: AcpSendRequest[] = [];
    acpRegistry.acpSessions.connect({
      session_id: 'sess-2',
      agent_id: 'agent-acp-1',
      connected_at: new Date().toISOString(),
      transport: (req: AcpSendRequest) => {
        received.push(req);
        return true;
      },
    });
    const r = await request(acpApp)
      .post('/api/acp/task')
      .send({ session_id: 'sess-2', instruction: 'hello', context: { k: 1 } });
    expect(r.status).toBe(200);
    expect(r.body.data.session_id).toBe('sess-2');
    expect(r.body.data.status).toBe('dispatched');
    expect(r.body.data.task_id).toMatch(/^task-/);
    expect(received[0].instruction).toBe('hello');
    expect(received[0].context).toEqual({ k: 1 });

    const miss = await request(acpApp)
      .post('/api/acp/task')
      .send({ session_id: 'sess-none', instruction: 'x' });
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe('SESSION_NOT_FOUND');
    acpRegistry.acpSessions.disconnect('sess-2');
  });
});

// ─── A2A bridge（a2a_bridge.py） ──────────────────────────────────────────────

describe('A2A bridge — agent.json + JSON-RPC', () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of ['A2A_BRIDGE_ENABLED', 'A2A_REQUIRE_AUTH', 'A2A_API_KEY']) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    acpMod._resetA2aTasksForTests();
  });

  it('agent.json → 404 {"error":"A2A bridge is disabled"} when flag unset', async () => {
    const r = await request(a2aApp).get('/.well-known/agent.json');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'A2A bridge is disabled' });
    const p = await request(a2aApp).post('/a2a/').send({ jsonrpc: '2.0', id: 1, method: 'a2a_sendMessage' });
    expect(p.status).toBe(404);
    expect(p.body.error).toBe('A2A bridge is disabled');
  });

  it('AgentCard when enabled (skills + provider + url)', async () => {
    process.env.A2A_BRIDGE_ENABLED = 'true';
    const r = await request(a2aApp).get('/.well-known/agent.json');
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('ShadowFlow');
    expect(r.body.protocolVersion).toBe('1.0');
    expect(r.body.url).toMatch(/\/a2a\/$/);
    expect(r.body.skills.map((s: { id: string }) => s.id)).toEqual([
      'workflow-run',
      'chat',
      'acp-relay',
    ]);
    expect(r.body.capabilities).toEqual({
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    });
  });

  it('a2a_sendMessage echo path → completed task with artifacts', async () => {
    // echo 兜底前提：无任何在线 agent（offline 全部 → forwardToAcp 走 echo）
    for (const e of acpRegistry.getAcpRegistry().listAll()) {
      acpRegistry.getAcpRegistry().markOffline(e.manifest.agent_id);
    }
    const r = await request(a2aApp)
      .post('/a2a/')
      .send({
        jsonrpc: '2.0',
        id: 'req-1',
        method: 'a2a_sendMessage',
        params: { message: { role: 'user', parts: [{ type: 'text', text: 'build thing' }] } },
      });
    expect(r.status).toBe(200);
    expect(r.body.jsonrpc).toBe('2.0');
    expect(r.body.id).toBe('req-1');
    const task = r.body.result;
    expect(task.id).toMatch(/^a2a-/);
    expect(task.status.state).toBe('completed');
    expect(task.status.message.role).toBe('agent');
    expect(task.status.message.parts[0].text).toContain('build thing');
    expect(task.artifacts).toHaveLength(1);
    expect(task.history).toHaveLength(2);
  });

  it('a2a_getTask found / -32001 unknown', async () => {
    const sent = await request(a2aApp)
      .post('/a2a/')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'a2a_sendMessage',
        params: { message: { parts: [{ type: 'text', text: 'x' }] } },
      });
    const taskId = sent.body.result.id;
    const got = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 3, method: 'a2a_getTask', params: { taskId } });
    expect(got.body.result.id).toBe(taskId);
    const miss = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 4, method: 'a2a_getTask', params: { taskId: 'nope' } });
    expect(miss.body.error.code).toBe(-32001);
    expect(miss.body.error.message).toContain('Task not found');
  });

  it('legacy tasks/send alias works', async () => {
    const r = await request(a2aApp)
      .post('/a2a/')
      .send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tasks/send',
        params: { message: { parts: [{ type: 'text', text: 'legacy' }] } },
      });
    expect(r.body.result.status.state).toBe('completed');
  });

  it('cancel working task via online agent session; terminal cancel → -32002', async () => {
    // 保证 agent-a2a 是唯一在线（echo 测试已把其余 offline），candidate 命中它
    acpRegistry.getAcpRegistry().register(
      acpRegistry.makeManifest({ agent_id: 'agent-a2a', display_name: 'A2A Agent' }),
    );
    acpRegistry.acpSessions.connect({
      session_id: 'sess-a2a',
      agent_id: 'agent-a2a',
      connected_at: new Date().toISOString(),
      transport: () => true,
    });
    const sent = await request(a2aApp)
      .post('/a2a/')
      .send({
        jsonrpc: '2.0',
        id: 6,
        method: 'a2a_sendMessage',
        params: { message: { parts: [{ type: 'text', text: 'long job' }] } },
      });
    const task = sent.body.result;
    expect(task.status.state).toBe('working'); // dispatch 成功 → 保持 working
    const cancel = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 7, method: 'a2a_cancelTask', params: { taskId: task.id } });
    expect(cancel.body.result.status.state).toBe('canceled');
    const again = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 8, method: 'a2a_cancelTask', params: { taskId: task.id } });
    expect(again.body.error.code).toBe(-32002);
    acpRegistry.acpSessions.disconnect('sess-a2a');
  });

  it('-32601 unknown method / -32600 bad jsonrpc / -32602 bad params', async () => {
    const m = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 9, method: 'a2a_nothing', params: {} });
    expect(m.status).toBe(404);
    expect(m.body.error.code).toBe(-32601);
    const v = await request(a2aApp)
      .post('/a2a/')
      .send({ id: 10, method: 'a2a_sendMessage', params: {} });
    expect(v.status).toBe(400);
    expect(v.body.error.code).toBe(-32600);
    const p = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 11, method: 'a2a_sendMessage', params: {} });
    expect(p.body.error.code).toBe(-32602);
    const bad = await request(a2aApp)
      .post('/a2a/')
      .send({ jsonrpc: '2.0', id: 12, method: 'a2a_sendMessage', params: { message: { role: 'user' } } });
    expect(bad.body.error.code).toBe(-32602);
    expect(bad.body.error.message).toContain('parts');
  });
});

// ─── approvals（approvals.py + ops.py 形状） ──────────────────────────────────

describe('GET /approvals/pending — ops shape', () => {
  it('empty → bare []', async () => {
    const r = await request(approvalsApp).get('/approvals/pending');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('pending tool approval → PendingApproval fields (bare list)', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-ops-1', { name: 'fs.write' }, 'ops test');
    const r = await request(approvalsApp).get('/approvals/pending');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toEqual({
      run_id: 'run-ops-1',
      template: '',
      sender: '',
      receiver: 'fs.write',
      policy_name: 'default',
      field: '',
      waiting_seconds: 0,
      assignee: '',
    });
    // 决议挂起的审批请求，不留悬空 promise
    for (const x of toolApprovalMod.toolApprovals.listPending()) {
      toolApprovalMod.toolApprovals.decide(x.request_id, 'deny');
    }
    await expect(p).resolves.toBe('deny');
  });
});

describe('GET /api/groups/:gid/approvals/pending', () => {
  it('always {items:[]} (svc-None degradation parity)', async () => {
    const r = await request(approvalsApp).get('/api/groups/g-1/approvals/pending');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
  });
});

describe('POST /api/approvals/:id/approve|reject', () => {
  it('404 {"detail":"Approval not found: <id>"} for unknown', async () => {
    const a = await request(approvalsApp).post('/api/approvals/zzz/approve');
    expect(a.status).toBe(404);
    expect(a.body.detail).toBe('Approval not found: zzz');
    const r = await request(approvalsApp)
      .post('/api/approvals/zzz/reject')
      .send({ reason: 'x' });
    expect(r.status).toBe(404);
    expect(r.body.detail).toBe('Approval not found: zzz');
  });

  it('404 already-resolved wording after a router decision (window parity)', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-win', { name: 'net.get' }, 'win');
    const [item] = toolApprovalMod.toolApprovals.listPending();
    const first = await request(approvalsApp).post(`/api/approvals/${item.request_id}/approve`);
    expect(first.status).toBe(200);
    await expect(p).resolves.toBe('approve');
    // 决议已记录但 SSE 未消费（resolvedDecisions 仍有条目）→ already-resolved 措辞
    const again = await request(approvalsApp).post(`/api/approvals/${item.request_id}/approve`);
    expect(again.status).toBe(404);
    expect(again.body.detail).toBe(`Approval not found or already resolved: ${item.request_id}`);
  });

  it('404 plain "not found" when resolved outside the router (no decision record)', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-out', { name: 'net.put' }, 'out');
    const [item] = toolApprovalMod.toolApprovals.listPending();
    toolApprovalMod.toolApprovals.decide(item.request_id, 'deny'); // 经 run-sessions 权限端点路径
    await expect(p).resolves.toBe('deny');
    const a = await request(approvalsApp).post(`/api/approvals/${item.request_id}/approve`);
    expect(a.status).toBe(404);
    expect(a.body.detail).toBe(`Approval not found: ${item.request_id}`);
  });

  it('approve → 200 {status, run_id, gate_id}; promise settles approve', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-ok', { name: 'fs.move' }, 'go');
    const [item] = toolApprovalMod.toolApprovals.listPending();
    const r = await request(approvalsApp).post(`/api/approvals/${item.request_id}/approve`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'approved', run_id: 'run-ok', gate_id: 'fs.move' });
    await expect(p).resolves.toBe('approve');
  });

  it('reject with reason → 200 {status:"rejected",...}; reason trimmed', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-no', { name: 'fs.rm' }, 'no');
    const [item] = toolApprovalMod.toolApprovals.listPending();
    const r = await request(approvalsApp)
      .post(`/api/approvals/${item.request_id}/reject`)
      .send({ reason: '  bad idea  ' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'rejected', run_id: 'run-no', gate_id: 'fs.rm' });
    await expect(p).resolves.toBe('deny');
    // 已决议后再 reject → already resolved
    const again = await request(approvalsApp)
      .post(`/api/approvals/${item.request_id}/reject`)
      .send({ reason: '' });
    expect(again.status).toBe(404);
    expect(again.body.detail).toContain('already resolved');
  });

  it('reject with {} body → default reason "" (RejectRequest default parity)', async () => {
    // Express body-parser 把空 body 归一为 {}，无法区分「缺 body」（FastAPI 422）
    // 与空对象（Python 走 RejectRequest 默认值）——对齐可实现的后者语义：
    // reason 缺省=''，请求落到审批查找，未知 id → 404 not found。
    const r = await request(approvalsApp).post('/api/approvals/x/reject');
    expect(r.status).toBe(404);
    expect(r.body.detail).toBe('Approval not found: x');
  });

  it('reject with non-string reason → 422 detail[].loc body.reason', async () => {
    const r = await request(approvalsApp)
      .post('/api/approvals/x/reject')
      .send({ reason: 42 });
    expect(r.status).toBe(422);
    expect(r.body.detail[0].loc).toEqual(['body', 'reason']);
  });
});

describe('GET /api/approvals/events — SSE', () => {
  it('emits approval.pending then approval.resolved (decision recorded)', async () => {
    const p = toolApprovalMod.toolApprovals.request('run-sse', { name: 'fs.write' }, 'sse');
    const [item] = toolApprovalMod.toolApprovals.listPending();

    let phase: 'pending' | 'resolved' = 'pending';
    let acc = '';
    let resolveDone!: (v: string) => void;
    const done = new Promise<string>((r) => (resolveDone = r));
    const req = http.request(
      { host: '127.0.0.1', port: approvalsPort, method: 'GET', path: '/api/approvals/events' },
      (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.setEncoding('utf-8');
        res.on('data', (c: string) => {
          acc += c;
          if (phase === 'pending' && acc.includes('approval.pending')) {
            phase = 'resolved';
            // 经本 router 决策（recordDecision 记录）→ resolved 帧带 decision
            void request(approvalsApp)
              .post(`/api/approvals/${item.request_id}/reject`)
              .send({ reason: 'sse says no' })
              .then(() => undefined);
            return;
          }
          if (phase === 'resolved' && acc.includes('approval.resolved')) {
            req.destroy();
            resolveDone(acc);
          }
        });
        res.on('end', () => resolveDone(acc));
        res.on('error', () => resolveDone(acc));
      },
    );
    req.on('error', () => resolveDone(acc)); // destroy 触发 error → 兜底 resolve
    req.end();

    const timeout = new Promise<string>((_, rej) =>
      setTimeout(() => rej(new Error(`SSE timeout, got: ${acc}`)), 12_000),
    );
    const final = await Promise.race([done, timeout]);
    expect(final).toContain('event: approval.pending');
    // JSON.stringify 无空格分隔
    expect(final).toContain(`"approval_id":"${item.request_id}"`);
    expect(final).toContain('"run_id":"run-sse"');
    expect(final).toContain('"gate_id":"fs.write"');
    expect(final).toContain('event: approval.resolved');
    expect(final).toContain('"decision":"rejected"');
    expect(final).toContain('"reason":"sse says no"');
    await expect(p).resolves.toBe('deny');
  }, 15_000);
});

// ─── groups thread（groups.py:1100） ──────────────────────────────────────────

describe('GET /api/groups/:id/messages/:mid/thread', () => {
  let groupId: string;
  let sourceId: string;
  let otherId: string;

  beforeAll(() => {
    const rec = groupsStore.createGroup({ name: 'Thread Group' });
    groupId = rec.group_id;
    const root = groupsStore.appendGroupMessage(groupId, { content: 'root msg' });
    sourceId = root.message_id;
    groupsStore.appendGroupMessage(groupId, {
      content: 'reply 1',
      sender_name: 'agent-a',
      sender_kind: 'agent',
      reply_to: sourceId,
    });
    groupsStore.appendGroupMessage(groupId, {
      content: 'reply 2',
      sender_name: 'agent-b',
      sender_kind: 'agent',
      reply_to: sourceId,
    });
    const other = groupsStore.appendGroupMessage(groupId, { content: 'unrelated' });
    otherId = other.message_id;
  });

  it('200 {data:{source_message,replies},meta:{count}} in chronological order', async () => {
    const r = await request(groupsApp).get(`/api/groups/${groupId}/messages/${sourceId}/thread`);
    expect(r.status).toBe(200);
    expect(r.body.data.source_message.message_id).toBe(sourceId);
    expect(r.body.data.source_message.content).toBe('root msg');
    expect(r.body.data.replies.map((m: { content: string }) => m.content)).toEqual([
      'reply 1',
      'reply 2',
    ]);
    expect(r.body.meta).toEqual({ count: 2 });
    // MessageItem 字段形状完整
    expect(r.body.data.replies[0]).toMatchObject({
      sender_name: 'agent-a',
      sender_kind: 'agent',
      reply_to: sourceId,
    });
  });

  it('leaf message → replies [] count 0', async () => {
    const r = await request(groupsApp).get(`/api/groups/${groupId}/messages/${otherId}/thread`);
    expect(r.status).toBe(200);
    expect(r.body.data.replies).toEqual([]);
    expect(r.body.meta).toEqual({ count: 0 });
  });

  it('404 GROUP_NOT_FOUND detail.error envelope', async () => {
    const r = await request(groupsApp).get(`/api/groups/g-missing/messages/m-1/thread`);
    expect(r.status).toBe(404);
    expect(r.body.detail.error.code).toBe('GROUP_NOT_FOUND');
    expect(r.body.detail.error.message).toBe("Group 'g-missing' not found");
  });

  it('404 MESSAGE_NOT_FOUND with "in group" wording', async () => {
    const r = await request(groupsApp).get(`/api/groups/${groupId}/messages/m-none/thread`);
    expect(r.status).toBe(404);
    expect(r.body.detail.error.code).toBe('MESSAGE_NOT_FOUND');
    expect(r.body.detail.error.message).toBe(
      `Message 'm-none' not found in group '${groupId}'`,
    );
  });
});

// ─── compareVersions（registry_service._parse_version 对齐） ──────────────────

describe('compareVersions — prerelease-aware', () => {
  const cmp = () => registryMod.compareVersions;
  it('core semver ordering', () => {
    expect(cmp()('1.2.3', '1.2.3')).toBe(0);
    expect(cmp()('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(cmp()('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(cmp()('0.9.0', '1.0.0')).toBeLessThan(0);
  });
  it('prerelease < release; prerelease lexicographic', () => {
    expect(cmp()('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(cmp()('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(cmp()('2.1.0', '2.1.0-rc.1')).toBeGreaterThan(0);
  });
  it('unparseable → 0.0.0 fallback', () => {
    expect(cmp()('garbage', '1.0.0')).toBeLessThan(0);
    expect(cmp()('garbage', 'also-bad')).toBe(0);
    expect(cmp()('v1.2.3', '1.2.3')).toBe(0); // v 前缀容忍
  });
});

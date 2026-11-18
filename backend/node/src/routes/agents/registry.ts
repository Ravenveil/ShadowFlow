/**
 * registry.ts — Agent Registry + Agent Pack Registry 路由（单后端迁移第三批）
 *
 * 移植自 Python 两个模块（响应信封/状态码/错误码逐字段对齐）：
 *   1. backend/python/shadowflow/api/agents/agents.py 的 registry 段（Story 2.10）：
 *        GET  /api/agents/registry             — 列表（?status= ?team_id= 过滤）
 *        GET  /api/agents/registry/{agent_id}  — 单个（entry + 完整 manifest）
 *        POST /api/agents/registry/refresh     — 置 offline 等 re-handshake
 *      数据源：runtime/acp/registry.py 的进程内单例 → Node lib/acp-registry.ts
 *      （与 routes/system/acp.ts 的 status/sessions/task 共享同一实例）。
 *   2. backend/python/shadowflow/api/agents/registry.py 的 packs 段（Story 12.5）：
 *        GET  /api/agents/registry/packs            — 列表（?workspace_id=&tags=&q=）
 *        POST /api/agents/registry/packs/install    — 安装 → 落 installed/{ws}.json
 *        GET  /api/agents/registry/packs/installed  — 已装列表（update_available）
 *      数据源：<repo>/templates/agent-packs/registry-index.yaml + 各 pack 的
 *      agent-manifest.yaml（Node 启动时惰性加载内存缓存）；installed JSON 与
 *      Python registry_service.py 读写同一份文件（legacy↔single 数据兼容）。
 *
 * 版本比较：Python packaging.Version 是完整 semver（含 prerelease 排序）；
 * Node 侧没有该依赖，移植为 prerelease-aware 的点分段比较（主/次/补丁数字
 * 比较，预发布 < 正式发布），覆盖仓库内 semver 数据；无法解析的版本 → 0.0.0
 * （Python _parse_version 同款兜底）。
 *
 * 签名校验（AC5）：HMAC-SHA256 over PyYAML canonical（yaml.dump(sort_keys=True)）。
 * Node 用 js-yaml dump({ sortKeys: true }) 尽量对齐 canonical 字节；签名由
 * SHADOWFLOW_PACK_SECRET 派生，跨实现字节不完全等价时按「校验失败」处理——
 * 与 Python 无 secret 时的语义一致（signed pack 校验不过 → 400）。
 *
 * 挂载：app.use('/api/agents', registryRouter)（index.ts 统一收口）。
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { Router, type Request, type Response } from 'express';
import {
  availableSlots,
  getAcpRegistry,
  type AgentRegistryEntry,
  type ToolCapability,
} from '../../lib/acp-registry';

const router = Router();

const AGENT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const WORKSPACE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({ data, meta });

// ─── registry（runtime）段的序列化（对齐 Python _entry_to_dict/_manifest_to_dict） ──

function entryToDict(entry: AgentRegistryEntry) {
  return {
    agent_id: entry.manifest.agent_id,
    display_name: entry.manifest.display_name,
    version: entry.manifest.version,
    tools: entry.manifest.tools.map((t) => t.name),
    max_concurrency: entry.manifest.max_concurrency,
    streaming: entry.manifest.streaming,
    workspace_context: entry.manifest.workspace_context,
    status: entry.status,
    active_tasks: entry.active_tasks,
    available_slots: availableSlots(entry),
    is_native: entry.is_native,
    connected_at: entry.connected_at,
    last_heartbeat: entry.last_heartbeat,
    team_memberships: entry.team_memberships,
  };
}

function manifestToDict(manifest: AgentRegistryEntry['manifest']) {
  return {
    agent_id: manifest.agent_id,
    display_name: manifest.display_name,
    version: manifest.version,
    tools: manifest.tools.map((t: ToolCapability) => ({
      name: t.name,
      description: t.description,
    })),
    max_concurrency: manifest.max_concurrency,
    streaming: manifest.streaming,
    memory: {
      type: manifest.memory.type,
      scope: manifest.memory.scope,
      persistence: manifest.memory.persistence,
    },
    protocols: manifest.protocols,
    workspace_context: manifest.workspace_context,
  };
}

// ─── GET /api/agents/registry — 列表 ─────────────────────────────────────────

router.get('/registry', (req: Request, res: Response) => {
  const registry = getAcpRegistry();
  let entries = registry.listAll();

  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status) entries = entries.filter((e) => e.status === status);
  const teamId = typeof req.query.team_id === 'string' ? req.query.team_id : '';
  if (teamId) entries = entries.filter((e) => e.team_memberships.includes(teamId));

  res.json(envelope(entries.map(entryToDict), { total: entries.length }));
});

// ═════════════════════════════════════════════════════════════════════════════
// Agent Packs（registry_service.py 的 Node 移植）
//
// ⚠ 注册序：packs 三条路由必须先于下方的 GET /registry/:agent_id（否则
// GET /registry/packs 被 :agent_id='packs' 吞掉）。对齐 Python server.py:273
// `include_router(_registry_api.router)  # before agents to avoid /{agent_id}
// catch-all` 的挂载顺序。
// ═════════════════════════════════════════════════════════════════════════════

interface PackManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  soul: string;
  kind: string;
  capabilities: {
    tools: string[];
    llm_provider: string;
    streaming: boolean;
    approval_required: boolean;
    session_resume: boolean;
    tool_calls: boolean;
  };
  install_cmd: string | null;
  signature: { algorithm: string; value: string } | null;
}

interface PackIndexEntry {
  id: string;
  path: string;
  tags: string[];
}

interface PackCache {
  index: PackIndexEntry[];
  manifests: Map<string, PackManifest>;
  loaded: boolean;
}

const packCache: PackCache = { index: [], manifests: new Map(), loaded: false };

/**
 * packs 根：<repo>/templates/agent-packs（Python parents[4]/templates/agent-packs
 * 同一层）。dev cwd = backend/node → repo 在 ../../；SHADOWFLOW_DATA_DIR 是数据
 * 目录不是仓库根，packs 模板不跟随它（Python 侧同样不跟随）。
 */
function packsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'templates', 'agent-packs'), // dev: backend/node → repo
    path.resolve(process.cwd(), 'templates', 'agent-packs'), // cwd 即仓库根
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'templates', 'agent-packs'), // src/routes/agents → repo 兜底
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

function loadPacksIfNeed(): void {
  if (packCache.loaded) return;
  packCache.loaded = true;
  const indexFile = path.join(packsRoot(), 'registry-index.yaml');
  if (!fs.existsSync(indexFile)) return;
  let raw: { packs?: Array<Record<string, unknown>> } | undefined;
  try {
    raw = yaml.load(fs.readFileSync(indexFile, 'utf-8')) as typeof raw;
  } catch {
    return;
  }
  for (const entry of raw?.packs ?? []) {
    const packId = typeof entry.id === 'string' ? entry.id : '';
    const relPath = typeof entry.path === 'string' ? entry.path : '';
    const tags = Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : [];
    if (!packId || !relPath) continue;
    const manifestFile = path.join(packsRoot(), relPath);
    if (!fs.existsSync(manifestFile)) continue;
    try {
      const manifest = yaml.load(fs.readFileSync(manifestFile, 'utf-8')) as PackManifest;
      packCache.manifests.set(packId, manifest);
      packCache.index.push({ id: packId, path: relPath, tags });
    } catch {
      // 跳过坏 manifest（Python 同语义：logger.warning + continue）
    }
  }
}

function resetPackCacheForTests(): void {
  packCache.index = [];
  packCache.manifests.clear();
  packCache.loaded = false;
}

/** installed JSON：<repo>/templates/agent-packs/installed/{workspace_id}.json。 */
function installedFile(workspaceId: string): string {
  return path.join(packsRoot(), 'installed', `${workspaceId}.json`);
}

interface InstalledRecord {
  pack_id: string;
  pack_version: string;
  agent_id: string;
  installed_at: string;
  verified: boolean;
  blueprint: Record<string, unknown>;
  [key: string]: unknown;
}

function loadInstalled(workspaceId: string): { workspace_id: string; installed: InstalledRecord[] } {
  const fallback = { workspace_id: workspaceId, installed: [] as InstalledRecord[] };
  if (!WORKSPACE_ID_RE.test(workspaceId)) return fallback;
  const file = installedFile(workspaceId);
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const db = parsed as { installed?: unknown };
    if (!Array.isArray(db.installed)) return fallback;
    return parsed as { workspace_id: string; installed: InstalledRecord[] };
  } catch {
    return fallback;
  }
}

/** 原子写 tmp + rename（对齐 Python _atomic_write_json）。 */
function saveInstalled(workspaceId: string, data: { workspace_id: string; installed: InstalledRecord[] }): void {
  fs.mkdirSync(path.dirname(installedFile(workspaceId)), { recursive: true });
  const file = installedFile(workspaceId);
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function getInstalledRecord(packId: string, workspaceId: string): InstalledRecord | null {
  return loadInstalled(workspaceId).installed.find((r) => r.pack_id === packId) ?? null;
}

function getInstalledVersion(packId: string, workspaceId: string): string | null {
  return getInstalledRecord(packId, workspaceId)?.pack_version ?? null;
}

/** prerelease-aware 点分段版本比较；解析失败 → 0.0.0（对齐 _parse_version 兜底）。 */
function parseVersionParts(v: string): { core: number[]; pre: string | null } {
  const str = String(v ?? '').trim();
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.*))?$/.exec(str);
  if (!m) return { core: [0, 0, 0], pre: null };
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i]! - pb.core[i]!;
    if (diff !== 0) return diff;
  }
  // 无 prerelease > 有 prerelease（semver 规则）；都有则字典序。
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
}

function installStatus(packId: string, workspaceId: string): string {
  const manifest = packCache.manifests.get(packId);
  if (!manifest) return 'not_installed';
  const installedVer = getInstalledVersion(packId, workspaceId);
  if (installedVer === null) return 'not_installed';
  return compareVersions(manifest.version, installedVer) > 0 ? 'has_update' : 'installed';
}

/** HMAC-SHA256 over canonical yaml（sortKeys 对齐 PyYAML sort_keys=True）。 */
function verifySignature(manifest: PackManifest): boolean {
  if (manifest.signature === null || manifest.signature === undefined) return true;
  const secret = (process.env.SHADOWFLOW_PACK_SECRET ?? '').trim();
  if (!secret) return false; // 有签名但无 secret → 视为校验失败（防绕过）
  const { signature: _ignored, ...body } = manifest;
  void _ignored;
  const canonical = yaml.dump(body, { sortKeys: true, lineWidth: 80, noRefs: true });
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf-8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(manifest.signature.value, 'utf-8'));
  } catch {
    return false;
  }
}

const invalidWorkspace = (res: Response) => {
  res.status(400).json({
    error: { code: 'INVALID_WORKSPACE_ID', message: 'workspace_id must match [a-zA-Z0-9_-]+' },
  });
};

// ─── GET /api/agents/registry/packs — 列表（含 install_status） ──────────────

router.get('/registry/packs', (req: Request, res: Response) => {
  loadPacksIfNeed();
  const workspaceId = typeof req.query.workspace_id === 'string' && req.query.workspace_id ? req.query.workspace_id : 'default';
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    invalidWorkspace(res);
    return;
  }
  const tags = typeof req.query.tags === 'string' ? req.query.tags : '';
  const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';

  let entries = [...packCache.index];
  if (tags) {
    const wanted = new Set(tags.split(',').map((t) => t.trim()).filter(Boolean));
    entries = entries.filter((e) => e.tags.some((t) => wanted.has(t)));
  }
  if (q) {
    entries = entries.filter((e) => {
      const m = packCache.manifests.get(e.id);
      if (!m) return false;
      return m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q);
    });
  }

  const result = entries.flatMap((entry) => {
    const manifest = packCache.manifests.get(entry.id);
    if (!manifest) return [];
    const rec = getInstalledRecord(entry.id, workspaceId);
    const verified = rec ? rec.verified === true : manifest.signature !== null && manifest.signature !== undefined;
    return [
      {
        id: manifest.id,
        version: manifest.version,
        name: manifest.name,
        description: manifest.description,
        author: manifest.author,
        tags: entry.tags,
        capabilities_summary: manifest.capabilities?.tools ?? [],
        install_status: installStatus(manifest.id, workspaceId),
        verified,
      },
    ];
  });
  res.json(envelope(result, { total: result.length }));
});

// ─── POST /api/agents/registry/packs/install ─────────────────────────────────
// 注意：先于 /packs/installed 注册?不冲突——install 是 POST、installed 是 GET，
// 且 /packs/:packId 未定义，无吞并风险。

router.post('/registry/packs/install', (req: Request, res: Response) => {
  loadPacksIfNeed();
  const body = (req.body ?? {}) as { pack_id?: unknown; workspace_id?: unknown };
  const packId = typeof body.pack_id === 'string' ? body.pack_id : '';
  const workspaceId = typeof body.workspace_id === 'string' && body.workspace_id ? body.workspace_id : 'default';

  // Pydantic：pack_id 1..120；workspace_id 1..80 pattern ^[a-zA-Z0-9_-]+$
  if (packId.length < 1 || packId.length > 120) {
    res.status(422).json({
      detail: [{ loc: ['body', 'pack_id'], msg: 'pack_id must be 1..120 chars', type: 'value_error' }],
    });
    return;
  }
  if (workspaceId.length < 1 || workspaceId.length > 80 || !WORKSPACE_ID_RE.test(workspaceId)) {
    res.status(422).json({
      detail: [
        { loc: ['body', 'workspace_id'], msg: 'workspace_id must match ^[a-zA-Z0-9_-]+$ (1..80 chars)', type: 'value_error' },
      ],
    });
    return;
  }

  // Step 1 — find pack
  const manifest = packCache.manifests.get(packId);
  if (!manifest) {
    res.status(404).json({
      error: { code: 'PACK_NOT_FOUND', message: `Pack '${packId}' not found in registry` },
    });
    return;
  }

  // Step 2 — verify signature (AC5)：present 且校验通过才算 verified
  let verified = false;
  if (manifest.signature !== null && manifest.signature !== undefined) {
    if (!verifySignature(manifest)) {
      res.status(400).json({
        error: {
          code: 'MANIFEST_SIGNATURE_INVALID',
          message: 'Manifest signature verification failed',
          pack_id: packId,
        },
      });
      return;
    }
    verified = true;
  }

  // Step 3 — already installed same version?（幂等回显）
  const installedVer = getInstalledVersion(packId, workspaceId);
  if (installedVer !== null && installedVer === manifest.version) {
    const rec = getInstalledRecord(packId, workspaceId);
    res.json(envelope({ ...(rec ?? {}), already_installed: true }, { warnings: [], deprecations: [] }));
    return;
  }

  // Step 4 — install_cmd：subprocess 执行有意延后（无沙箱/权限模型），surface warning
  const warnings: string[] = [];
  if (manifest.install_cmd) {
    warnings.push(
      `install_cmd '${manifest.install_cmd}' was NOT executed — automatic hook execution is not yet supported. Run it manually.`,
    );
  }

  // Step 5 — AgentBlueprint-compatible record
  const agentId = `agent-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const tools = manifest.capabilities?.tools ?? [];
  const blueprint: Record<string, unknown> = {
    name: manifest.name,
    goal: manifest.soul,
    role_profiles: [
      {
        name: manifest.name,
        description: manifest.description,
        persona: manifest.soul,
        tools,
        executor_kind: manifest.kind,
        executor_provider: manifest.capabilities?.llm_provider ?? 'claude',
      },
    ],
    tool_policies: tools.map((t) => ({ tool_id: t, default_permission: 'allow' })),
    metadata: {
      source: 'catalog',
      pack_id: manifest.id,
      pack_version: manifest.version,
      verified,
    },
  };

  // Step 6 — persist installed-packs record（与 Python 读同一份文件）
  const installRec: InstalledRecord = {
    pack_id: manifest.id,
    pack_version: manifest.version,
    agent_id: agentId,
    installed_at: now,
    verified,
    blueprint,
  };
  try {
    const db = loadInstalled(workspaceId);
    db.installed = [...db.installed.filter((r) => r.pack_id !== packId), installRec];
    saveInstalled(workspaceId, db);
  } catch (err) {
    res.status(500).json({
      error: { code: 'PERSISTENCE_FAILED', message: `Persistence failed: ${(err as Error).message}` },
    });
    return;
  }

  if (!verified) warnings.push('Pack has no signature — treat as community/unverified');
  res.status(201).json(
    envelope(
      {
        agent_id: agentId,
        pack_id: manifest.id,
        pack_version: manifest.version,
        blueprint,
        installed_at: now,
        verified,
        already_installed: false,
      },
      { warnings, deprecations: [] },
    ),
  );
});

// ─── GET /api/agents/registry/packs/installed ────────────────────────────────

router.get('/registry/packs/installed', (req: Request, res: Response) => {
  loadPacksIfNeed();
  const workspaceId = typeof req.query.workspace_id === 'string' && req.query.workspace_id ? req.query.workspace_id : 'default';
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    invalidWorkspace(res);
    return;
  }
  const items = loadInstalled(workspaceId).installed.map((rec) => {
    const packId = typeof rec.pack_id === 'string' ? rec.pack_id : '';
    const manifest = packCache.manifests.get(packId);
    const registryVersion = manifest ? manifest.version : String(rec.pack_version ?? '0.0.0');
    const installedVersion = String(rec.pack_version ?? '0.0.0');
    return {
      ...rec,
      name: manifest ? manifest.name : packId,
      update_available: compareVersions(registryVersion, installedVersion) > 0,
      verified: rec.verified === true,
    };
  });
  res.json(envelope(items, { total: items.length }));
});

// ═════════════════════════════════════════════════════════════════════════════
// Runtime registry 段（agents.py 移植）——必须在 packs 段之后注册（见上方警示）
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/agents/registry/{agent_id} — 单个（含完整 manifest） ────────────

router.get('/registry/:agent_id', (req: Request, res: Response) => {
  const agentId = req.params.agent_id;
  if (!AGENT_ID_RE.test(agentId)) {
    res.status(400).json({
      error: { code: 'INVALID_AGENT_ID', message: 'Invalid agent_id format' },
    });
    return;
  }
  const entry = getAcpRegistry().get(agentId);
  if (!entry) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `Agent '${agentId}' not found in registry`,
      },
    });
    return;
  }
  res.json(envelope({ ...entryToDict(entry), manifest: manifestToDict(entry.manifest) }));
});

// ─── POST /api/agents/registry/refresh ───────────────────────────────────────
// GET /registry/packs 与 /registry/:agent_id 不同方法不冲突；refresh 是 POST，
// 不会被上面的 GET :agent_id 吞掉。

router.post('/registry/refresh', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { agent_id?: unknown };
  const agentId = typeof body.agent_id === 'string' ? body.agent_id : '';
  // Pydantic: min_length=1 max_length=200 pattern ^[a-zA-Z0-9_-]+$
  if (
    agentId.length < 1 ||
    agentId.length > 200 ||
    !AGENT_ID_RE.test(agentId)
  ) {
    res.status(422).json({
      detail: [
        { loc: ['body', 'agent_id'], msg: 'agent_id must match ^[a-zA-Z0-9_-]+$ (1..200 chars)', type: 'value_error' },
      ],
    });
    return;
  }
  const ok = getAcpRegistry().refreshAgent(agentId);
  if (!ok) {
    res.status(404).json({
      error: { code: 'AGENT_NOT_FOUND', message: `Agent '${agentId}' not found` },
    });
    return;
  }
  res.json(envelope({ agent_id: agentId, status: 'offline', queued_for_rehandshake: true }));
});

// ─── 测试辅助 ─────────────────────────────────────────────────────────────────

export { resetPackCacheForTests, packsRoot };

export default router;

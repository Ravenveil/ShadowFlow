/**
 * catalog.ts — 单后端迁移：Catalog 索引层（移植自 python
 * backend/python/shadowflow/runtime/catalog_service.py，Story 8.7）。
 *
 * 职责与 Python 对齐：
 *   - 充当 Builder 发布产物的索引层（不是第二个真源）
 *   - 文件持久化：<repo>/.shadowflow/catalog/{app_id}.json（repoDataFile 收口，
 *     legacy↔single 共享同一份文件）
 *   - 列表/详情 API 返回脱敏 view，不外泄 system_prompt / 凭证 / BYOK 密钥
 *
 * 移植映射：
 *   CatalogAppNotFound   → CatalogAppNotFoundError        (CATALOG_APP_NOT_FOUND)
 *   CatalogSnapshotMissing → CatalogSnapshotMissingError  (CATALOG_SNAPSHOT_MISSING)
 *   CatalogBlueprintInvalid → CatalogBlueprintInvalidError(CATALOG_BLUEPRINT_INVALID)
 *   redact_blueprint_snapshot / _summary_of / list_apps / get_app / fork_app
 *   → 同名导出函数（逐行移植，字段名与 Python wire 完全一致）
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataFile } from './repo-root';

// ---------------------------------------------------------------------------
// Errors (AC7)
// ---------------------------------------------------------------------------

export class CatalogError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class CatalogAppNotFoundError extends CatalogError {
  constructor(message: string) {
    super('CATALOG_APP_NOT_FOUND', message);
  }
}

export class CatalogSnapshotMissingError extends CatalogError {
  constructor(message: string) {
    super('CATALOG_SNAPSHOT_MISSING', message);
  }
}

/** AC7：fork 时快照过不了 Builder 合同校验。 */
export class CatalogBlueprintInvalidError extends CatalogError {
  constructor(message: string) {
    super('CATALOG_BLUEPRINT_INVALID', message);
  }
}

// ---------------------------------------------------------------------------
// Sensitive-field redaction (AC3) — 逐行移植 redact_blueprint_snapshot
// ---------------------------------------------------------------------------

const SENSITIVE_TOP_LEVEL = new Set([
  'system_prompt',
  'private_key',
  'byok',
  'byok_token',
  'api_key',
  'provider_credentials',
  'credentials',
  'secret',
  'secrets',
]);

const SENSITIVE_METADATA = new Set([
  'system_prompt',
  'private_key',
  'byok',
  'byok_token',
  'api_key',
  'provider_credentials',
  'credentials',
  'secret',
  'secrets',
  '0g_private_key',
]);

type Obj = Record<string, unknown>;

function scrubMetadata(meta: unknown): Obj {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out: Obj = {};
  for (const [k, v] of Object.entries(meta as Obj)) {
    if (!SENSITIVE_METADATA.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

function redactRole(role: Obj): Obj {
  const safe: Obj = {};
  for (const [k, v] of Object.entries(role)) {
    if (!SENSITIVE_TOP_LEVEL.has(k)) safe[k] = v;
  }
  safe['metadata'] = scrubMetadata(safe['metadata']);
  const subAgents = Array.isArray(safe['sub_agents']) ? safe['sub_agents'] : [];
  safe['sub_agents'] = subAgents
    .filter((s): s is Obj => !!s && typeof s === 'object' && !Array.isArray(s))
    .map((s) => redactRole(s));
  return safe;
}

function redactToolPolicy(tp: Obj): Obj {
  const safe = { ...tp };
  if (safe['credentials_ref']) safe['credentials_ref'] = '[redacted]';
  safe['metadata'] = scrubMetadata(safe['metadata']);
  return safe;
}

/**
 * 返回快照的脱敏副本（对线安全）：在每一层（root / metadata / role /
 * role.metadata / role.sub_agents.* / tool_policies.*）剥掉 _SENSITIVE_TOP_LEVEL。
 */
export function redactBlueprintSnapshot(snapshot: unknown): Obj {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {};
  const src = snapshot as Obj;
  const safe: Obj = {};
  for (const [k, v] of Object.entries(src)) {
    if (!SENSITIVE_TOP_LEVEL.has(k)) safe[k] = v;
  }
  safe['metadata'] = scrubMetadata(safe['metadata']);

  const roles = Array.isArray(safe['role_profiles']) ? safe['role_profiles'] : [];
  safe['role_profiles'] = roles
    .filter((r): r is Obj => !!r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => redactRole(r));

  const toolPolicies = Array.isArray(safe['tool_policies']) ? safe['tool_policies'] : [];
  safe['tool_policies'] = toolPolicies
    .filter((tp): tp is Obj => !!tp && typeof tp === 'object' && !Array.isArray(tp))
    .map((tp) => redactToolPolicy(tp));

  const kbList = Array.isArray(safe['knowledge_bindings']) ? safe['knowledge_bindings'] : [];
  safe['knowledge_bindings'] = kbList
    .filter((kb): kb is Obj => !!kb && typeof kb === 'object' && !Array.isArray(kb))
    .map((kb) => {
      const cleaned: Obj = {};
      for (const [k, v] of Object.entries(kb)) {
        if (!SENSITIVE_TOP_LEVEL.has(k)) cleaned[k] = v;
      }
      cleaned['metadata'] = scrubMetadata(kb['metadata']);
      return cleaned;
    });

  return safe;
}

// ---------------------------------------------------------------------------
// 存储路径与读写
// ---------------------------------------------------------------------------

function catalogDir(): string {
  return repoDataFile('catalog');
}

function ensureDir(): void {
  fs.mkdirSync(catalogDir(), { recursive: true });
}

/** app_id 白名单字符（禁止路径穿越），对齐 Python _path_for 的拒绝集合。 */
export function isValidAppId(appId: string): boolean {
  return (
    typeof appId === 'string' &&
    appId.length > 0 &&
    !appId.includes('/') &&
    !appId.includes('\\') &&
    !appId.includes('..') &&
    !appId.includes(' ') &&
    !appId.includes('\x00')
  );
}

function pathFor(appId: string): string {
  if (!isValidAppId(appId)) {
    throw new CatalogAppNotFoundError(`Invalid app_id: ${JSON.stringify(appId)}`);
  }
  return path.join(catalogDir(), `${appId}.json`);
}

export function loadRecord(appId: string): Obj {
  const p = pathFor(appId);
  if (!fs.existsSync(p)) {
    throw new CatalogAppNotFoundError(`Catalog app not found: ${appId}`);
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('record is not an object');
    }
    return parsed as Obj;
  } catch (err) {
    // JSON 损坏 / 读文件失败 → CATALOG_SNAPSHOT_MISSING（读不到 ≠ 不存在）
    throw new CatalogSnapshotMissingError(
      `Catalog record for ${appId} is unreadable: ${(err as Error).message}`,
    );
  }
}

export function saveRecord(appId: string, record: Obj): void {
  ensureDir();
  const p = pathFor(appId);
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

function iterRecords(): Obj[] {
  const dir = catalogDir();
  if (!fs.existsSync(dir)) return [];
  const records: Obj[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push(parsed as Obj);
      }
    } catch {
      // Bad file — skip silently; do not break listing
      continue;
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// 视图构建（_summary_of / get_app 视图）
// ---------------------------------------------------------------------------

export interface CatalogSummary {
  app_id: string;
  name: string;
  goal: string;
  kit_type: string;
  author: string;
  published_at: string;
  fork_count: number;
  forked_from: string | null;
  template_id: string;
  workflow_id: string;
  blueprint_id: string;
  /** 团队模板标记：快照 mode 透传，供前端模板入口过滤 */
  mode?: string;
  /** Story 13.5：存在才写，保持 payload 干净 */
  scope_hint?: string;
  /** Story 13.6 D2-b：第一个 role 的 collaboration_contract */
  collaboration_contract?: Obj;
}

export interface CatalogDetail extends CatalogSummary {
  mode: string;
  role_names: string[];
  role_count: number;
  description: string;
  blueprint_snapshot: Obj;
}

/** summary_of(rec)（@staticmethod 同名移植）：字段名与 Python wire 完全一致。 */
export function summaryOf(rec: Obj): CatalogSummary {
  const summary: CatalogSummary = {
    app_id: String(rec['app_id'] ?? ''),
    name: String(rec['name'] ?? ''),
    goal: String(rec['goal'] ?? ''),
    kit_type: String(rec['kit_type'] ?? 'custom'),
    author: String(rec['author'] ?? 'anonymous'),
    published_at: String(rec['published_at'] ?? ''),
    fork_count: Number(rec['fork_count'] ?? 0) || 0,
    forked_from: (rec['forked_from'] ?? null) as string | null,
    template_id: String(rec['template_id'] ?? '') || '',
    workflow_id: String(rec['workflow_id'] ?? '') || '',
    blueprint_id: String(rec['blueprint_id'] ?? '') || '',
  };
  const scopeHint = rec['scope_hint'];
  if (scopeHint !== null && scopeHint !== undefined) {
    summary['scope_hint'] = scopeHint as string;
  }
  const snap = rec['blueprint_snapshot'];
  if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
    const s = snap as Obj;
    summary['mode'] = String(s['mode'] ?? 'single');
    const roles = Array.isArray(s['role_profiles']) ? s['role_profiles'] : [];
    if (roles.length > 0 && roles[0] && typeof roles[0] === 'object' && !Array.isArray(roles[0])) {
      const cc = (roles[0] as Obj)['collaboration_contract'];
      if (cc && typeof cc === 'object' && !Array.isArray(cc)) {
        summary['collaboration_contract'] = cc as Obj;
      }
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// 读 API：list_apps / get_app
// ---------------------------------------------------------------------------

export interface ListAppsResult {
  apps: CatalogSummary[];
  total: number;
  page: number;
  page_size: number;
}

export function listApps(opts: {
  kit_type?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): ListAppsResult {
  const page = Math.max(1, Math.trunc(Number(opts.page ?? 1)) || 1);
  const pageSizeRaw = Math.trunc(Number(opts.page_size ?? 20));
  const pageSize = Math.max(1, Math.min(100, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20));

  const records = iterRecords();

  const needle = String(opts.q ?? '').trim().toLowerCase();
  const kt = String(opts.kit_type ?? '').trim().toLowerCase() || 'all';

  const matches = (rec: Obj): boolean => {
    if (kt !== 'all' && String(rec['kit_type'] ?? 'custom') !== kt) return false;
    if (needle) {
      const hay = (String(rec['name'] ?? '') + ' ' + String(rec['goal'] ?? '')).toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  const filtered = records.filter(matches);
  // Sort: published_at desc, then app_id asc as tiebreaker
  filtered.sort((a, b) => {
    const pa = String(a['published_at'] ?? '');
    const pb = String(b['published_at'] ?? '');
    if (pa !== pb) return pa < pb ? 1 : -1;
    const ia = String(a['app_id'] ?? '');
    const ib = String(b['app_id'] ?? '');
    return ia < ib ? 1 : -1;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  return {
    apps: pageItems.map((r) => summaryOf(r)),
    total,
    page,
    page_size: pageSize,
  };
}

export function getApp(appId: string): CatalogDetail {
  const rec = loadRecord(appId);
  const snapshotFullRaw = rec['blueprint_snapshot'];
  const snapshotFull =
    snapshotFullRaw && typeof snapshotFullRaw === 'object' && !Array.isArray(snapshotFullRaw)
      ? (snapshotFullRaw as Obj)
      : {};
  if (Object.keys(snapshotFull).length === 0) {
    throw new CatalogSnapshotMissingError(
      `Catalog record for ${appId} has no blueprint_snapshot`,
    );
  }

  const snapshotSafe = redactBlueprintSnapshot(snapshotFull);

  const roles = Array.isArray(snapshotFull['role_profiles']) ? snapshotFull['role_profiles'] : [];
  const roleNames = roles
    .filter((r): r is Obj => !!r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => String((r as Obj)['name'] ?? ''));

  const summary = summaryOf(rec);
  // detail 的 mode 由快照显式给出，丢弃 summary 透传字符串
  const detail: CatalogDetail = {
    ...summary,
    mode: String(snapshotFull['mode'] ?? 'single'),
    role_names: roleNames,
    role_count: roleNames.length,
    description: String(snapshotFull['goal'] ?? ''),
    blueprint_snapshot: snapshotSafe,
  };
  return detail;
}

// ---------------------------------------------------------------------------
// fork 前置合同校验（对齐 Python AgentBlueprint.model_validate 的必需约束）
// ---------------------------------------------------------------------------

export interface BlueprintValidationErrors {
  /** 顶层字段错误（缺 name/goal、mode 矛盾） */
  top: string[];
  /** 每个 role 的字段错误（缺 role_id/name 等） */
  roles: string[];
}

/**
 * 对 Python AgentBlueprint 契约里"会导致 model_validate 抛 ValidationError"的
 * 硬约束做等价校验：顶层 name/goal 必填、mode='single' 至少一个 role、
 * 每个 RoleProfile 的 role_id/name 必填。其余子对象缺省全兼容。
 */
export function validateBlueprintContract(snapshot: unknown): BlueprintValidationErrors {
  const errs: BlueprintValidationErrors = { top: [], roles: [] };
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    errs.top.push('blueprint snapshot must be an object');
    return errs;
  }
  const bp = snapshot as Obj;
  if (typeof bp['name'] !== 'string' || bp['name'] === '') {
    errs.top.push("field required: 'name'");
  }
  if (typeof bp['goal'] !== 'string' || bp['goal'] === '') {
    errs.top.push("field required: 'goal'");
  }
  const mode = typeof bp['mode'] === 'string' && bp['mode'] === 'team' ? 'team' : 'single';
  const roles = Array.isArray(bp['role_profiles']) ? bp['role_profiles'] : [];
  if (mode === 'single' && roles.length < 1) {
    errs.top.push("mode='single' requires at least one role_profile");
  }
  roles.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      errs.roles.push(`role_profiles[${i}] must be an object`);
      return;
    }
    const role = r as Obj;
    if (typeof role['role_id'] !== 'string' || role['role_id'] === '') {
      errs.roles.push(`role_profiles[${i}]: field required: 'role_id'`);
    }
    if (typeof role['name'] !== 'string' || role['name'] === '') {
      errs.roles.push(`role_profiles[${i}]: field required: 'name'`);
    }
  });
  return errs;
}

// ---------------------------------------------------------------------------
// fork（AC6）—— 克隆快照为新 Blueprint
// ---------------------------------------------------------------------------

export interface ForkResult {
  blueprint_id: string;
  forked_from: string;
  blueprint: Obj;
}

export function forkRecord(appId: string): ForkResult {
  const rec = loadRecord(appId);
  const snapshotRaw = rec['blueprint_snapshot'];
  const snapshot =
    snapshotRaw && typeof snapshotRaw === 'object' && !Array.isArray(snapshotRaw)
      ? ({ ...(snapshotRaw as Obj) } as Obj)
      : {};
  if (Object.keys(snapshot).length === 0) {
    throw new CatalogSnapshotMissingError(
      `Catalog record for ${appId} has no blueprint_snapshot`,
    );
  }

  // Build a forked blueprint dict — strip blueprint_id (regen) and reset publish_profile
  delete snapshot['blueprint_id'];

  // Reset publish_profile so the user re-publishes intentionally
  const publishRaw = snapshot['publish_profile'];
  const publishProfile: Obj =
    publishRaw && typeof publishRaw === 'object' && !Array.isArray(publishRaw)
      ? { ...(publishRaw as Obj) }
      : {};
  publishProfile['target'] = 'none';
  publishProfile['visibility'] = 'private';
  publishProfile['publish_ref'] = '';
  snapshot['publish_profile'] = publishProfile;

  // Inject forked_from in metadata
  const metaRaw = snapshot['metadata'];
  let existingMeta: Obj =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw) ? (metaRaw as Obj) : {};
  existingMeta = { ...existingMeta, forked_from: appId };
  snapshot['metadata'] = existingMeta;

  // 契约校验（Python: AgentBlueprint.model_validate），失败抛 CATALOG_BLUEPRINT_INVALID
  const errs = validateBlueprintContract(snapshot);
  if (errs.top.length > 0 || errs.roles.length > 0) {
    const all = [...errs.top, ...errs.roles];
    throw new CatalogBlueprintInvalidError(
      `Stored blueprint snapshot failed validation for ${appId}: ${all.join('; ')}`,
    );
  }

  // 新 blueprint_id（f"bp-{uuid4().hex[:12]}" 同形）
  const blueprintId = `bp-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  // bump fork_count（源记录写回，best-effort 单进程原子写）
  rec['fork_count'] = (Number(rec['fork_count'] ?? 0) || 0) + 1;
  saveRecord(appId, rec);

  return { blueprint_id: blueprintId, forked_from: appId, blueprint: snapshot };
}

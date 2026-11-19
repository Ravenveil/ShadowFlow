/**
 * catalog 域 — 应用模板目录领域模型（纯规则层）
 *
 * 蓝图快照脱敏、app_id 白名单、模板契约校验、目录摘要视图，纯函数，
 * 禁止 import express/sqlite/crypto/fs。
 *
 * 关键不变量（对线安全 AC3）：
 *   - 脱敏要穿透每一层：root / metadata / role / role.metadata /
 *     role.sub_agents.* / tool_policies.* / knowledge_bindings.*
 *   - app_id 禁路径穿越（/ \ .. 空格 \x00），否则会写到目录外
 *   - 契约校验只覆盖「会让 Python model_validate 抛 ValidationError」的硬约束
 */

type Obj = Record<string, unknown>;

/** 任意层出现即剥离的敏感键（大小写按原样匹配 role/tool 层）。 */
export const SENSITIVE_TOP_LEVEL: ReadonlySet<string> = new Set([
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

/** metadata 内的敏感键（比顶层多一个 0g_private_key，比较时忽略大小写）。 */
export const SENSITIVE_METADATA: ReadonlySet<string> = new Set([
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

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** metadata 脱敏：忽略大小写剔除敏感键；非对象一律空对象。 */
export function scrubMetadata(meta: unknown): Obj {
  if (!isObj(meta)) return {};
  const out: Obj = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!SENSITIVE_METADATA.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/** role 脱敏：剥顶层敏感键 + metadata + 递归 sub_agents。 */
export function redactRole(role: Obj): Obj {
  const safe: Obj = {};
  for (const [k, v] of Object.entries(role)) {
    if (!SENSITIVE_TOP_LEVEL.has(k)) safe[k] = v;
  }
  safe['metadata'] = scrubMetadata(safe['metadata']);
  const subAgents = Array.isArray(safe['sub_agents']) ? safe['sub_agents'] : [];
  safe['sub_agents'] = subAgents.filter(isObj).map((s) => redactRole(s));
  return safe;
}

/** tool policy 脱敏：credentials_ref 一律打码。 */
export function redactToolPolicy(tp: Obj): Obj {
  const safe = { ...tp };
  if (safe['credentials_ref']) safe['credentials_ref'] = '[redacted]';
  safe['metadata'] = scrubMetadata(safe['metadata']);
  return safe;
}

/**
 * 返回快照的脱敏副本（对线安全）：在每一层剥掉敏感字段。
 * 入参不是对象 → 空对象（不猜、不原样透传）。
 */
export function redactBlueprintSnapshot(snapshot: unknown): Obj {
  if (!isObj(snapshot)) return {};
  const src = snapshot;
  const safe: Obj = {};
  for (const [k, v] of Object.entries(src)) {
    if (!SENSITIVE_TOP_LEVEL.has(k)) safe[k] = v;
  }
  safe['metadata'] = scrubMetadata(safe['metadata']);

  const roles = Array.isArray(safe['role_profiles']) ? safe['role_profiles'] : [];
  safe['role_profiles'] = roles.filter(isObj).map((r) => redactRole(r));

  const toolPolicies = Array.isArray(safe['tool_policies']) ? safe['tool_policies'] : [];
  safe['tool_policies'] = toolPolicies.filter(isObj).map((tp) => redactToolPolicy(tp));

  const kbList = Array.isArray(safe['knowledge_bindings']) ? safe['knowledge_bindings'] : [];
  safe['knowledge_bindings'] = kbList.filter(isObj).map((kb) => {
    const cleaned: Obj = {};
    for (const [k, v] of Object.entries(kb)) {
      if (!SENSITIVE_TOP_LEVEL.has(k)) cleaned[k] = v;
    }
    cleaned['metadata'] = scrubMetadata(kb['metadata']);
    return cleaned;
  });

  return safe;
}

export interface BlueprintValidationErrors {
  /** 顶层字段错误（缺 name/goal、mode 矛盾） */
  top: string[];
  /** 每个 role 的字段错误（缺 role_id/name 等） */
  roles: string[];
}

/**
 * 对 Python AgentBlueprint 契约里「会导致 model_validate 抛 ValidationError」的
 * 硬约束做等价校验：顶层 name/goal 必填、mode='single' 至少一个 role、
 * 每个 RoleProfile 的 role_id/name 必填。其余子对象缺省全兼容。
 */
export function validateBlueprintContract(snapshot: unknown): BlueprintValidationErrors {
  const errs: BlueprintValidationErrors = { top: [], roles: [] };
  if (!isObj(snapshot)) {
    errs.top.push('blueprint snapshot must be an object');
    return errs;
  }
  const bp = snapshot;
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
    if (!isObj(r)) {
      errs.roles.push(`role_profiles[${i}] must be an object`);
      return;
    }
    if (typeof r['role_id'] !== 'string' || r['role_id'] === '') {
      errs.roles.push(`role_profiles[${i}]: field required: 'role_id'`);
    }
    if (typeof r['name'] !== 'string' || r['name'] === '') {
      errs.roles.push(`role_profiles[${i}]: field required: 'name'`);
    }
  });
  return errs;
}

/** 目录摘要视图的字段形状（与 Python wire 完全一致）。 */
export interface CatalogSummaryShape {
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
  /** 存在才写，保持 payload 干净 */
  scope_hint?: string;
  /** 第一个 role 的 collaboration_contract */
  collaboration_contract?: Obj;
}

/** summary_of(rec)：字段名与 Python wire 完全一致，mode/契约只在有快照时透传。 */
export function summaryOf(rec: Obj): CatalogSummaryShape {
  const summary: CatalogSummaryShape = {
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
  if (isObj(snap)) {
    summary['mode'] = String(snap['mode'] ?? 'single');
    const roles = Array.isArray(snap['role_profiles']) ? snap['role_profiles'] : [];
    if (roles.length > 0 && isObj(roles[0])) {
      const cc = (roles[0] as Obj)['collaboration_contract'];
      if (isObj(cc)) summary['collaboration_contract'] = cc;
    }
  }
  return summary;
}

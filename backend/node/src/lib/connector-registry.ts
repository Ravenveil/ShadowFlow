/**
 * connector-registry.ts — 统一连接器注册表（2026-11-07，OpenBot 对齐批）。
 *
 * OpenBot 的核心主张是「每个动作执行前先裁定、执行后留痕」（every action
 * decided before it happens and recorded after）。裁定需要一个「对象清单」：
 * 本模块把散在各处的可连接对象（ACP/MCP agent：`.shadowflow/acp-agents.json`
 * 注册表 + PATH 扫描，见 detectors/acp-detector.ts）归一成 ConnectorInfo 列表，
 * 并为每个连接器挂一份持久策略（settings key `sf.connectorPolicy`）：
 *
 *   enabled       — 会话是否允许使用该连接器
 *   approval_mode — auto（放行）/ prompt（人审，走 tool-approval）/ block（拒绝）
 *
 * 策略是「执行前裁定」的依据；`lib/action-journal.ts` 负责「执行后留痕」。
 * 两者一起构成本轮后端升级的 OpenBot 语义闭环。
 *
 * 存储沿用 storage/settings.ts 的 KV（$CWD/.shadowflow/settings.json）；
 * 策略读写全部 fail-soft：坏 JSON / 异常形状一律回落默认策略，不阻塞探测。
 */

import {
  detectAcpAgents,
  getCachedAcpSnapshot,
  type DetectedAgent,
} from '../detectors/acp-detector';
import { getSetting, setSetting } from '../storage/settings';

export type ConnectorKind = 'acp' | 'mcp';
export type ConnectorStatus = 'connected' | 'disconnected' | 'unknown';
export type ApprovalMode = 'auto' | 'prompt' | 'block';

export interface ConnectorPolicy {
  enabled: boolean;
  approval_mode: ApprovalMode;
}

export interface ConnectorInfo {
  /** 稳定 id（与 AcpAgentSpec.id 同源，可用于 `executor: acp:<id>` / `mcp:<id>`）。 */
  id: string;
  kind: ConnectorKind;
  name: string;
  description?: string;
  binary: string;
  transport: 'stdio' | 'http' | 'unreachable';
  endpoint?: string;
  capabilities?: string[];
  installed: boolean;
  status: ConnectorStatus;
  last_checked: string;
  error?: string;
  policy: ConnectorPolicy;
}

export interface ConnectorsSnapshot {
  scanned_at: string;
  items: ConnectorInfo[];
}

const POLICY_KEY = 'sf.connectorPolicy';

export const DEFAULT_POLICY: ConnectorPolicy = {
  enabled: true,
  approval_mode: 'auto',
};

const APPROVAL_MODES = new Set<ApprovalMode>(['auto', 'prompt', 'block']);

function normalizePolicy(raw: unknown): ConnectorPolicy {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_POLICY };
  const r = raw as Record<string, unknown>;
  const enabled = typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_POLICY.enabled;
  const mode =
    typeof r.approval_mode === 'string' && APPROVAL_MODES.has(r.approval_mode as ApprovalMode)
      ? (r.approval_mode as ApprovalMode)
      : DEFAULT_POLICY.approval_mode;
  return { enabled, approval_mode: mode };
}

function loadPolicyMap(): Record<string, ConnectorPolicy> {
  let raw: unknown;
  try {
    raw = getSetting(POLICY_KEY);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ConnectorPolicy> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id === 'string' && id.length > 0) out[id] = normalizePolicy(v);
  }
  return out;
}

/** 读单个连接器策略（未登记 → 默认策略）。 */
export function getConnectorPolicy(id: string): ConnectorPolicy {
  return loadPolicyMap()[id] ?? { ...DEFAULT_POLICY };
}

/**
 * 写单个连接器策略（部分更新；只持久化显式给出的字段）。
 * 返回合并后的完整策略。写失败抛错由路由层转 500。
 */
export function setConnectorPolicy(id: string, patch: Partial<ConnectorPolicy>): ConnectorPolicy {
  const map = loadPolicyMap();
  const next = normalizePolicy({ ...map[id], ...patch });
  map[id] = next;
  setSetting(POLICY_KEY, map);
  return next;
}

function statusOf(a: DetectedAgent): ConnectorStatus {
  if (!a.installed) return 'disconnected';
  if (a.transport === 'unreachable') return 'unknown';
  return 'connected';
}

function toConnector(a: DetectedAgent, policyMap: Record<string, ConnectorPolicy>): ConnectorInfo {
  return {
    id: a.id,
    kind: a.type,
    name: a.id,
    description: a.capabilities?.length ? `capabilities: ${a.capabilities.join(', ')}` : undefined,
    binary: a.binary,
    transport: a.transport,
    endpoint: a.endpoint ?? a.http_endpoint,
    capabilities: a.capabilities,
    installed: a.installed,
    status: statusOf(a),
    last_checked: a.last_checked,
    error: a.error,
    policy: policyMap[a.id] ?? { ...DEFAULT_POLICY },
  };
}

/**
 * 列出全部连接器。默认走探测缓存（无缓存才扫一次）；`refresh` 强制重扫。
 */
export async function listConnectors(opts: { refresh?: boolean } = {}): Promise<ConnectorsSnapshot> {
  const snap = opts.refresh
    ? await detectAcpAgents(true)
    : (getCachedAcpSnapshot() ?? (await detectAcpAgents(true)));
  const policyMap = loadPolicyMap();
  return {
    scanned_at: snap.scanned_at,
    items: snap.items.map((a) => toConnector(a, policyMap)),
  };
}

/**
 * 清洗请求体里的 connector id 列表：只留非空字符串、去重、截断到 32 个。
 * 不做注册表校验（同步清洗保持在请求热路径 fail-soft；未登记 id 留给
 * action-journal 留痕后由使用侧自行忽略）。
 */
export function coerceConnectorIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || id.length > 128) continue;
    seen.add(id);
    if (seen.size >= 32) break;
  }
  return [...seen];
}

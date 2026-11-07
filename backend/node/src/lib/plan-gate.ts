/**
 * plan-gate.ts — T05① 计划确认门（2026-11-07）。
 *
 * 复盘缺口：「发消息即执行，确认仅团队真源写入粒度」——dag-draft 生成的计划
 * 没有执行侧闸门，用户还没确认，执行节点就已经开跑。
 *
 * 本模块是「团队 → 当前计划」的单槽状态机 + 持久化：
 *   registerPlan       —— 计划登记（dag-draft 生成后调用）→ 一律落 pending
 *   decidePlan         —— confirm（放行）/ reject（退回，记原因）
 *   getPlan            —— 读当前计划
 *   isPlanGateBlocking —— 有计划且未 confirmed → 拦（pending/rejected 都拦）
 *   planGateNotice     —— 拦截通知（任务/负责人/依赖/交付标准/风险 五要素）
 *
 * 语义边界：
 *   - 无计划记录 = 不拦（存量团队/未走计划流的群不受影响）；
 *   - 一挂新计划即重新武装（回 pending），确认后放行，直到下一个计划出现；
 *   - reject 不清记录：被退回的计划仍拦执行（它「未确认」），要放行得
 *     重新登记+确认——防止「随手拒绝 → 照样开跑」绕过计划纪律；
 *   - 寒暄（casual）不进执行节点，群聊侧预检不拦寒暄。
 *
 * 存储：$CWD/.shadowflow/plan-gate.json（env SF_PLAN_GATE_PATH 可覆盖，测试用），
 * 整文件 JSON（team_id → 记录）。vitest 环境默认落 tmp —— 测试不得往仓库
 * .shadowflow/ 写脏文件。读写失败静默降级（读失败按无计划、写失败丢持久化
 * 但不抛）——闸门永远不能反过来弄坏执行路径。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VALID_ID_RE } from './team-yaml';

export type PlanGateStatus = 'pending' | 'confirmed' | 'rejected';

export interface PlanGateNode {
  id: string;
  agentId?: string;
  name?: string;
  role?: string;
  /** 交付标准（验收口径，一句话）。 */
  acceptance?: string;
  /** 风险/注意点（一句话）。 */
  risk?: string;
}

export interface PlanGateEdge {
  source: string;
  target: string;
  mode: 'direct' | 'approve' | 'conditional';
}

export interface PlanGateRecord {
  plan_id: string;
  team_id: string;
  /** 触发计划的自然语言描述（dag-draft prompt 原文，截 500 字）。 */
  prompt: string;
  nodes: PlanGateNode[];
  edges: PlanGateEdge[];
  status: PlanGateStatus;
  created_at: number;
  decided_at?: number;
  /** reject 时的原因（截 200 字）。 */
  reject_reason?: string;
}

export type PlanGateResult =
  | { ok: true; plan: PlanGateRecord }
  | { ok: false; code: 'INVALID_PLAN'; errors: string[] }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'STALE' };

const PLAN_MODES = new Set(['direct', 'approve', 'conditional']);

function storePath(): string {
  if (process.env.SF_PLAN_GATE_PATH) return process.env.SF_PLAN_GATE_PATH;
  // vitest 环境默认落 tmp —— 测试不得往仓库 .shadowflow/ 写脏文件。
  if (process.env.VITEST) {
    return path.join(os.tmpdir(), `sf-plan-gate-${process.pid}.json`);
  }
  return path.join(process.cwd(), '.shadowflow', 'plan-gate.json');
}

function readStore(): Record<string, PlanGateRecord> {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, PlanGateRecord>;
    }
  } catch {
    // 缺文件/坏文件 → 按空仓处理（读失败永远不抛）。
  }
  return {};
}

function writeStore(store: Record<string, PlanGateRecord>): void {
  try {
    const fp = storePath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // 写失败静默 —— 闸门留痕不能反过来弄坏执行路径。
  }
}

function clampText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/**
 * 登记一份计划（替换该团队的旧计划），状态一律 'pending' —— 新计划必须
 * 重新确认。输入做轻校验：节点 id 非空唯一、边引用已知节点、mode 合法。
 * 校验不过返回 INVALID_PLAN（不写盘）。
 */
export function registerPlan(
  teamId: string,
  input: { prompt?: unknown; nodes: unknown; edges: unknown },
): PlanGateResult {
  const errors: string[] = [];
  if (!VALID_ID_RE.test(teamId)) {
    return { ok: false, code: 'INVALID_PLAN', errors: [`invalid team id: ${teamId}`] };
  }
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const nodes: PlanGateNode[] = [];
  const seen = new Set<string>();
  for (const n of rawNodes) {
    const obj = (n ?? {}) as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    if (!id || id.length > 64) {
      errors.push('node id must be a non-empty string (≤64 chars)');
      continue;
    }
    if (seen.has(id)) {
      errors.push(`duplicate node id: ${id}`);
      continue;
    }
    seen.add(id);
    nodes.push({
      id,
      ...(clampText(obj.agentId, 64) ? { agentId: clampText(obj.agentId, 64)! } : {}),
      ...(clampText(obj.name, 120) ? { name: clampText(obj.name, 120)! } : {}),
      ...(clampText(obj.role, 200) ? { role: clampText(obj.role, 200)! } : {}),
      ...(clampText(obj.acceptance, 200) ? { acceptance: clampText(obj.acceptance, 200)! } : {}),
      ...(clampText(obj.risk, 200) ? { risk: clampText(obj.risk, 200)! } : {}),
    });
  }
  if (nodes.length === 0) errors.push('nodes must be a non-empty array');

  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const edges: PlanGateEdge[] = [];
  for (const e of rawEdges) {
    const obj = (e ?? {}) as Record<string, unknown>;
    const source = typeof obj.source === 'string' ? obj.source.trim() : '';
    const target = typeof obj.target === 'string' ? obj.target.trim() : '';
    if (!seen.has(source) || !seen.has(target)) {
      errors.push(`edge references unknown node: ${source || '?'} → ${target || '?'}`);
      continue;
    }
    const mode = typeof obj.mode === 'string' && PLAN_MODES.has(obj.mode) ? obj.mode : 'direct';
    edges.push({ source, target, mode: mode as PlanGateEdge['mode'] });
  }
  if (errors.length > 0) return { ok: false, code: 'INVALID_PLAN', errors };

  const plan: PlanGateRecord = {
    plan_id: randomUUID(),
    team_id: teamId,
    prompt: clampText(input.prompt, 500) ?? '',
    nodes,
    edges,
    status: 'pending',
    created_at: Date.now(),
  };
  const store = readStore();
  store[teamId] = plan;
  writeStore(store);
  return { ok: true, plan };
}

/**
 * 裁定当前计划：confirm 放行 / reject 退回（记原因）。可带 plan_id 做乐观
 * 并发保护——过期（与当前计划不符）返回 STALE，防止确认到旧计划头上。
 */
export function decidePlan(
  teamId: string,
  decision: 'confirm' | 'reject',
  opts: { planId?: string; reason?: unknown } = {},
): PlanGateResult {
  const store = readStore();
  const plan = store[teamId];
  if (!plan) return { ok: false, code: 'NOT_FOUND' };
  if (opts.planId && opts.planId !== plan.plan_id) return { ok: false, code: 'STALE' };
  plan.status = decision === 'confirm' ? 'confirmed' : 'rejected';
  plan.decided_at = Date.now();
  if (decision === 'reject') {
    const reason = clampText(opts.reason, 200);
    if (reason) plan.reject_reason = reason;
    else delete plan.reject_reason;
  }
  store[teamId] = plan;
  writeStore(store);
  return { ok: true, plan };
}

export function getPlan(teamId: string): PlanGateRecord | null {
  if (!VALID_ID_RE.test(teamId)) return null;
  return readStore()[teamId] ?? null;
}

/** 有计划且未 confirmed（pending/rejected）→ 拦执行；无计划/已确认 → 放。 */
export function isPlanGateBlocking(plan: PlanGateRecord | null): plan is PlanGateRecord {
  return plan !== null && plan.status !== 'confirmed';
}

/**
 * 拦截通知：五要素齐显——任务、负责人、依赖、交付标准、风险（T05 通过标准）。
 * 字段缺失显示「待补」，不编造（内容契约同款铁律）。
 */
export function planGateNotice(plan: PlanGateRecord): string {
  const nameOf = (nodeId: string): string => {
    const n = plan.nodes.find((x) => x.id === nodeId);
    return n?.name || n?.agentId || nodeId;
  };
  const lines: string[] = [];
  lines.push(
    `[plan-gate] 团队计划${plan.status === 'rejected' ? '已被退回' : '待确认'}，本轮不启动任何执行节点。`,
  );
  if (plan.prompt) lines.push(`计划描述：${plan.prompt}`);
  lines.push('任务：');
  plan.nodes.forEach((n, i) => {
    lines.push(`  ${i + 1}. ${n.name || n.id}（负责人：${n.agentId || '待补'}${n.role ? `｜职责：${n.role}` : ''}）`);
    lines.push(`     交付标准：${n.acceptance || '待补'}`);
    lines.push(`     风险：${n.risk || '待补'}`);
  });
  lines.push('依赖：');
  if (plan.edges.length === 0) {
    lines.push('  （无）');
  } else {
    for (const e of plan.edges) {
      lines.push(`  ${nameOf(e.source)} → ${nameOf(e.target)}（${e.mode}）`);
    }
  }
  lines.push(
    `请确认计划后再发消息：POST /api/teams/${plan.team_id}/plan/confirm（退回请 .../plan/reject）。`,
  );
  return lines.join('\n');
}

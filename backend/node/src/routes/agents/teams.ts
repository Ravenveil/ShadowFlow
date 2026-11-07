/**
 * teams.ts — Team DAG router (S0.7)
 *
 * Mounts BEFORE proxyFallback in index.ts. Only handles the DAG-specific
 * paths we own (`/:id/dag`, `/:id/dag/validate`). Other /api/teams paths
 * (root list, create, etc.) fall through Express's no-match to the proxy
 * → Python sqlite backend.
 *
 * Endpoints:
 *   GET  /api/teams/:id/dag           → load yaml + return {team, agents, errors}
 *   PUT  /api/teams/:id/dag           → write dag_layout back to yaml
 *   POST /api/teams/:id/dag/validate  → re-validate without persisting
 *   GET  /api/teams/:id/plan          → 当前计划（T05① 计划确认门；无 → plan:null）
 *   POST /api/teams/:id/plan          → 登记/替换计划（一律回 pending）
 *   POST /api/teams/:id/plan/confirm  → 确认放行
 *   POST /api/teams/:id/plan/reject   → 退回（记原因，仍拦执行）
 *   POST /api/teams/dag-draft         → NL → DAG 草稿（带 teamId 时顺带挂计划）
 *
 * Yaml is source of truth (S0.5). Frontend BlueprintCanvas drags a node →
 * PUT writes the new {x,y} into dag_layout.nodes and flips dag_layout.mode
 * to 'manual'. Auto layout becomes opt-in once a manual placement exists.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Router, Request, Response } from 'express';
import {
  loadTeam,
  clearTeamCache,
  validateDag,
  type DagLayout,
} from '../../lib/team-yaml';
import { listAgents as listYamlAgents } from '../../lib/agent-yaml';
import {
  generateDagDraft,
  type DagDraftAgent,
} from '../../lib/team-dag-draft';
import {
  registerPlan,
  decidePlan,
  getPlan,
  type PlanGateRecord,
} from '../../lib/plan-gate';
import { resolveProviderKey } from '../../transport/byokKey';
import { isProviderId, PROVIDER_IDS, type ProviderId } from '../../transport/api-clients';

const router = Router();

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const PYTHON_BASE = process.env.PYTHON_BACKEND_URL ?? 'http://localhost:8000';

// Mirror of the path resolution in team-yaml.ts. Kept local because the
// writer needs the same precedence (root wins over local) when picking
// where to overwrite.
const ROOT_TEAMS_DIR = path.join(process.cwd(), '..', '..', '.shadowflow', 'teams');
const LOCAL_TEAMS_DIR = path.join(process.cwd(), '.shadowflow', 'teams');

function resolveTeamFile(teamId: string): string | null {
  if (!VALID_ID_RE.test(teamId)) return null;
  for (const dir of [ROOT_TEAMS_DIR, LOCAL_TEAMS_DIR]) {
    const fp = path.join(dir, `${teamId}.team.yaml`);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

// ─── GET /api/teams/:id/dag ──────────────────────────────────────────────────

router.get('/:id/dag', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const result = loadTeam(teamId);
  if (!result.team) {
    res.status(404).json({
      error: { code: 'TEAM_NOT_FOUND', message: 'team yaml not found', detail: result.errors },
    });
    return;
  }
  const { team, resolvedAgents, errors } = result;
  res.json({
    data: {
      team_id: team.team_id,
      name: team.name,
      mode: team.mode,
      policy: team.policy_obj,
      members: team.members_ids,
      edges: team.edges_v1,
      dag_layout: team.dag_layout ?? { mode: 'auto', nodes: [], viewport: { zoom: 1, pan_x: 0, pan_y: 0 } },
      resolved_agents: resolvedAgents.map((a) => ({
        id: a.id,
        title: a.title,
        sub: a.sub,
        avatar_char: a.avatar_char,
        type: a.type,
        model_id: a.model.id,
      })),
    },
    meta: { errors },
  });
});

// ─── PUT /api/teams/:id/dag ──────────────────────────────────────────────────
// Body: { dag_layout: DagLayout }
// Writes the dag_layout block back to the yaml file (atomic .tmp + rename).
// Other yaml fields (members, edges, policy) untouched.

router.put('/:id/dag', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const body = (req.body ?? {}) as { dag_layout?: unknown };
  const incoming = body.dag_layout;
  if (!incoming || typeof incoming !== 'object') {
    res.status(400).json({ error: { code: 'INVALID_BODY', message: 'dag_layout required' } });
    return;
  }
  // Shape-validate. Reject silently-invalid input rather than letting bad
  // yaml land in the file.
  const dl = incoming as Record<string, unknown>;
  const mode = dl.mode === 'manual' ? 'manual' : 'auto';
  const nodes = Array.isArray(dl.nodes)
    ? (dl.nodes as unknown[]).flatMap((n) => {
        if (n && typeof n === 'object') {
          const no = n as Record<string, unknown>;
          if (typeof no.id === 'string' && typeof no.x === 'number' && typeof no.y === 'number') {
            return [{ id: no.id, x: no.x, y: no.y }];
          }
        }
        return [];
      })
    : [];
  const vp = (dl.viewport ?? {}) as Record<string, unknown>;
  const newLayout: DagLayout = {
    mode,
    nodes,
    viewport: {
      zoom: typeof vp.zoom === 'number' ? vp.zoom : 1,
      pan_x: typeof vp.pan_x === 'number' ? vp.pan_x : 0,
      pan_y: typeof vp.pan_y === 'number' ? vp.pan_y : 0,
    },
  };

  const filePath = resolveTeamFile(teamId);
  if (!filePath) {
    res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'team yaml not found' } });
    return;
  }

  // D1: write-time DAG validation. The PUT only mutates dag_layout coordinates,
  // but we MUST NOT persist a layout onto a team whose members/edges are
  // inconsistent (orphan members, edges pointing at non-members, sequential
  // cycles). Reuse validateDag (the same function /dag/validate exposes) so the
  // write path enforces what the preflight only suggested. conditional edges are
  // intentionally excluded from cycle detection by validateDag — we keep that
  // semantics by not touching it here.
  const loaded = loadTeam(teamId);
  if (!loaded.team) {
    res.status(404).json({
      error: { code: 'TEAM_NOT_FOUND', message: 'team yaml not loadable', detail: loaded.errors },
    });
    return;
  }
  const dagErrors = validateDag(loaded.team, loaded.resolvedAgents);
  if (dagErrors.length > 0) {
    // errors are hard failures: validateDag returns a flat string[] with no
    // warning channel, so every entry blocks the write (422, not persisted).
    res.status(422).json({
      error: {
        code: 'DAG_INVALID',
        message: 'team DAG is invalid; refusing to save layout',
        errors: dagErrors,
      },
    });
    return;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    res.status(500).json({ error: { code: 'READ_FAILED', message: (err as Error).message } });
    return;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    res.status(500).json({ error: { code: 'PARSE_FAILED', message: (err as Error).message } });
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    res.status(500).json({ error: { code: 'BAD_YAML', message: 'not a mapping' } });
    return;
  }
  const teamObj = parsed as Record<string, unknown>;
  teamObj.dag_layout = newLayout;

  // Atomic write — same pattern as session-store.ts.
  const tmp = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tmp, yaml.dump(teamObj, { lineWidth: 100, noRefs: true }), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    res.status(500).json({ error: { code: 'WRITE_FAILED', message: (err as Error).message } });
    return;
  }

  clearTeamCache();
  res.json({ data: { team_id: teamId, dag_layout: newLayout }, meta: {} });
});

// ─── POST /api/teams/:id/dag/validate ────────────────────────────────────────
// Re-runs validateDag on the current yaml without persisting. Useful for
// the frontend "save" preflight (catch ref errors before PUT).

router.post('/:id/dag/validate', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const result = loadTeam(teamId);
  if (!result.team) {
    res.status(404).json({ error: { code: 'TEAM_NOT_FOUND', message: 'team yaml not found' } });
    return;
  }
  const validateErrors = validateDag(result.team, result.resolvedAgents);
  res.json({
    data: {
      team_id: teamId,
      ok: validateErrors.length === 0 && result.errors.length === 0,
      errors: [...result.errors, ...validateErrors],
    },
    meta: {},
  });
});

// ─── POST /api/teams/dag-draft ───────────────────────────────────────────────
// 自然语言 → DAG 草稿（不落库）。Body: { prompt: string, agentIds?: string[] }。
// 把 prompt + 可选 roster（含各自 role 摘要）喂给 BYOK LLM，要求严格 JSON
// { nodes, edges }；D1/D2 校验不合法则回喂错误让模型重试一次，仍不合法 → 422；
// LLM 自身失败 → 502。前端 TeamDagEditor「AI 生成草稿」消费。

/** 解析 roster：Python agent 库优先，yaml 模板兜底；找不到的 id 原样带出。 */
async function resolveDraftRoster(agentIds: string[]): Promise<DagDraftAgent[]> {
  const wanted = new Set(agentIds);
  const found = new Map<string, DagDraftAgent>();
  try {
    const pyRes = await fetch(`${PYTHON_BASE}/api/agents`);
    if (pyRes.ok) {
      const env = (await pyRes.json()) as {
        data?: Array<{ agent_id?: unknown; name?: unknown; soul?: unknown }>;
      };
      for (const a of env.data ?? []) {
        if (typeof a.agent_id !== 'string' || !wanted.has(a.agent_id)) continue;
        found.set(a.agent_id, {
          id: a.agent_id,
          name: typeof a.name === 'string' && a.name ? a.name : a.agent_id,
          role: typeof a.soul === 'string' ? a.soul : undefined,
        });
      }
    }
  } catch {
    /* Python 不可达 — 退到 yaml 模板 + 裸 id */
  }
  try {
    for (const a of listYamlAgents().agents) {
      if (!wanted.has(a.id) || found.has(a.id)) continue;
      found.set(a.id, {
        id: a.id,
        name: a.title || a.id,
        role: a.persona.split('\n').find((l) => l.trim().length > 0)?.trim() ?? a.sub,
      });
    }
  } catch {
    /* yaml 库不可读 — 裸 id 兜底 */
  }
  return agentIds.map((id) => found.get(id) ?? { id, name: id });
}

/** 选 provider：X-LLM-Provider 头优先，否则第一个有 key 可解析的 provider。 */
function pickDraftProvider(
  headers: Record<string, string | string[] | undefined>,
): { provider?: ProviderId; apiKey?: string; model?: string } {
  const raw = headers['x-llm-provider'];
  const headerProvider = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  const normalized = headerProvider === 'claude' ? 'anthropic' : headerProvider;
  const rawModel = headers['x-llm-model'];
  const model = (Array.isArray(rawModel) ? rawModel[0] : rawModel)?.trim() || undefined;
  if (normalized && isProviderId(normalized)) {
    const key = resolveProviderKey(normalized, headers);
    if (key) return { provider: normalized, apiKey: key, model };
  }
  for (const p of PROVIDER_IDS) {
    const key = resolveProviderKey(p, headers);
    if (key) return { provider: p, apiKey: key, model };
  }
  return { model };
}

// ─── T05① 计划确认门（2026-11-07）──────────────────────────────────────────
// 团队计划 = dag-draft 生成的 {nodes, edges} 草案（含交付标准 acceptance /
// 风险 risk）。登记后落 pending —— 未确认前执行侧不启动任何执行节点
// （plan-gate.ts 全局门：groups-chat 预检 + runTeamDagFanout 兜底）。
// 语义：新计划一律回 pending（要重新确认）；confirm 放行；reject 退回
// （记原因，仍拦——被退回的计划同样"未确认"）。

const planSummary = (plan: PlanGateRecord) => ({
  plan_id: plan.plan_id,
  status: plan.status,
  prompt: plan.prompt,
  nodes: plan.nodes,
  edges: plan.edges,
  created_at: plan.created_at,
  ...(plan.decided_at !== undefined ? { decided_at: plan.decided_at } : {}),
  ...(plan.reject_reason !== undefined ? { reject_reason: plan.reject_reason } : {}),
});

router.get('/:id/plan', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const plan = getPlan(teamId);
  res.json({ data: { plan: plan ? planSummary(plan) : null }, meta: {} });
});

router.post('/:id/plan', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const body = (req.body ?? {}) as { prompt?: unknown; nodes?: unknown; edges?: unknown };
  const r = registerPlan(teamId, { prompt: body.prompt, nodes: body.nodes, edges: body.edges });
  if (!r.ok) {
    const errors = r.code === 'INVALID_PLAN' ? r.errors : [];
    res.status(400).json({ error: { code: r.code, message: errors.join('; '), errors } });
    return;
  }
  res.status(201).json({ data: { plan: planSummary(r.plan) }, meta: {} });
});

const decideHandler = (decision: 'confirm' | 'reject') => (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!VALID_ID_RE.test(teamId)) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'invalid team id' } });
    return;
  }
  const body = (req.body ?? {}) as { plan_id?: unknown; reason?: unknown };
  const r = decidePlan(teamId, decision, {
    ...(typeof body.plan_id === 'string' ? { planId: body.plan_id } : {}),
    reason: body.reason,
  });
  if (!r.ok) {
    if (r.code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'no plan registered for this team' } });
      return;
    }
    res.status(409).json({ error: { code: 'PLAN_STALE', message: 'plan_id does not match the current plan' } });
    return;
  }
  res.json({ data: { plan: planSummary(r.plan) }, meta: {} });
};

router.post('/:id/plan/confirm', decideHandler('confirm'));
router.post('/:id/plan/reject', decideHandler('reject'));

router.post('/dag-draft', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { prompt?: unknown; agentIds?: unknown; teamId?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: { code: 'INVALID_BODY', message: 'prompt (non-empty string) required' } });
    return;
  }
  // T05① — 可选 teamId：生成成功后把草稿登记为该团队的 pending 计划（挂
  // 执行门）。先校验后调 LLM，省一次白跑。不传 = 纯生成器（旧行为不变）。
  let teamId: string | undefined;
  if (body.teamId !== undefined) {
    const raw = typeof body.teamId === 'string' ? body.teamId.trim() : '';
    if (!VALID_ID_RE.test(raw)) {
      res.status(400).json({ error: { code: 'INVALID_TEAM_ID', message: 'teamId must be a valid team id' } });
      return;
    }
    teamId = raw;
  }
  const agentIds = Array.isArray(body.agentIds)
    ? body.agentIds.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];
  const roster = agentIds.length > 0 ? await resolveDraftRoster(agentIds) : [];

  const { provider, apiKey, model } = pickDraftProvider(req.headers);
  if (!provider || !apiKey) {
    res.status(502).json({
      error: { code: 'LLM_NO_KEY', message: 'no BYOK provider key available for dag drafting' },
    });
    return;
  }

  const ac = new AbortController();
  // 监听 res 的提前 close（客户端断连）——req 的 'close' 在 JSON body 收完
  // 就会触发，会误杀正常的 LLM 调用。
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });

  const outcome = await generateDagDraft({
    userText: prompt,
    agents: roster,
    provider,
    apiKey,
    model,
    signal: ac.signal,
  });
  if (!outcome.ok) {
    if (outcome.kind === 'llm') {
      res.status(502).json({ error: { code: 'LLM_FAILED', message: outcome.message } });
      return;
    }
    res.status(422).json({
      error: {
        code: 'DAG_DRAFT_INVALID',
        message: 'generated draft failed DAG validation (after one retry)',
        errors: outcome.errors,
      },
    });
    return;
  }
  // T05① — 带 teamId 时登记 pending 计划（新计划一律回 pending，等确认）。
  // 登记失败（草稿没过计划轻校验，极小概率）不拖垮草稿本身，plan 回 null。
  let plan: ReturnType<typeof planSummary> | null = null;
  if (teamId !== undefined) {
    const r = registerPlan(teamId, { prompt, nodes: outcome.draft.nodes, edges: outcome.draft.edges });
    if (r.ok) plan = planSummary(r.plan);
  }
  res.json({ data: { draft: outcome.draft, plan }, meta: {} });
});

export default router;

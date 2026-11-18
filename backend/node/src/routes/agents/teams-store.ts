/**
 * teams-store.ts — Team CRUD / workflow / policy / chat router（单后端迁移）
 *
 * 移植自 Python backend/python/shadowflow/api/agents/teams.py（端点语义逐条
 * 对齐，响应统一 {data, meta} 信封、错误 {error:{code,message}}）：
 *
 *   POST   /api/teams                        创建（D2：agent_ids 必须可解析）
 *   GET    /api/teams?workspace_id=          列表（D3 'unassigned' 归一语义）
 *   GET    /api/teams/:id                    单个
 *   PATCH  /api/teams/:id                    改名/描述/换 workspace/加减成员
 *   DELETE /api/teams/:id                    删除 → 204
 *   GET    /api/teams/:id/workflow           无保存图 → {nodes:[],edges:[]}
 *   PUT    /api/teams/:id/workflow           D1 环检测 + D2 agent 校验 → 422；
 *                                            成功落 team.workflow 并自动记版本
 *   GET    /api/teams/:id/workflow/versions  只回元数据（不带 workflow）
 *   POST   /api/teams/:id/workflow/restore   append-only 恢复（summary 注明来源）
 *   POST   /api/teams/:id/workflow/branch    复制为分支团队（带走三块配置）
 *   GET/PUT /api/teams/:id/policy            policy_matrix（缺省 {}）
 *   GET/PUT /api/teams/:id/validation-hooks  顶层字段，整体替换（缺省 []）
 *   POST   /api/teams/:id/chat               BYOK LLM 驱动的自然语言团队编辑
 *
 * 路径分工（与同目录 teams.ts 的 DAG 路由互不重叠，挂载由 index.ts 统一安排）：
 *   teams.ts 拥有 /:id/dag、/:id/dag/validate、/:id/plan*、/dag-draft；
 *   本文件拥有上述 CRUD/workflow/policy/hooks/chat 路径。
 */

import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { callProvider, isProviderId, DEFAULT_MODELS, type ProviderId } from '../../transport/api-clients';
import { listAgents as listYamlAgents } from '../../lib/agent-yaml';
import {
  defaultWorkflow,
  deleteTeamFile,
  isValidTeamId,
  listLocalAgentIds,
  listLocalAgentSummaries,
  listTeams,
  loadTeamRecord,
  normalizeWorkspaceId,
  saveTeamRecord,
  validateWorkflowStoredShape,
  workflowStoredAgentIds,
  type TeamRecord,
  type TeamWorkflowGraph,
} from '../../storage/teams-store';
import {
  getVersion,
  latestVersion,
  listVersions,
  recordVersion,
} from '../../storage/team-workflow-versions';

const router = Router();

// ─── 通用小件 ────────────────────────────────────────────────────────────────

const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({ data, meta });

const notFound = (res: Response, teamId: string) => {
  res.status(404).json({
    error: { code: 'TEAM_NOT_FOUND', message: `Team '${teamId}' not found` },
  });
};

/** 入口守卫：非法 id → 400 INVALID_TEAM_ID；不存在 → 404（或由调用方接手）。 */
function guardTeam(res: Response, teamId: string): TeamRecord | null {
  if (!isValidTeamId(teamId)) {
    res.status(400).json({
      error: { code: 'INVALID_TEAM_ID', message: 'Invalid team_id format' },
    });
    return null;
  }
  const record = loadTeamRecord(teamId);
  if (!record) {
    notFound(res, teamId);
    return null;
  }
  return record;
}

const rejectInvalidDag = (res: Response, errors: string[]) => {
  res.status(422).json({
    error: {
      code: 'INVALID_DAG',
      message: 'Team workflow DAG is invalid: ' + errors.join('; '),
      errors,
    },
  });
};

const rejectMissingAgents = (res: Response, errors: string[]) => {
  res.status(422).json({
    error: {
      code: 'AGENT_NOT_FOUND',
      message: 'Team references agents that do not exist: ' + errors.join('; '),
      errors,
    },
  });
};

/** D2：agentId 必须能在本地 agent 库解析（跳过空白 id，先去重再校验）。 */
function missingAgentErrors(agentIds: string[]): string[] {
  const probe = [...new Set(agentIds)].filter((a) => typeof a === 'string' && a.trim());
  const known = new Set(listLocalAgentIds());
  return probe.filter((a) => !known.has(a)).map((a) => `agent "${a}" does not exist in the agent store (referenced by team but not found)`);
}

const nowIso = () => new Date().toISOString();

// ─── POST /api/teams — 创建 ──────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const description = typeof body.description === 'string' ? body.description : '';
  const rawAgentIds = body.agent_ids;
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : 'default';

  // Pydantic 边界（teams.py CreateTeamRequest）：
  //   name 1..120、description ≤500、agent_ids 非空 list[str]、workspace_id ≤80
  if (name.length < 1 || name.length > 120) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'name must be a string of 1..120 chars' },
    });
    return;
  }
  if (description.length > 500) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'description must be at most 500 chars' },
    });
    return;
  }
  if (workspaceId.length > 80) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'workspace_id must be at most 80 chars' },
    });
    return;
  }
  if (!Array.isArray(rawAgentIds) || rawAgentIds.length < 1) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'agent_ids must be a non-empty list of strings' },
    });
    return;
  }
  const agentIds = rawAgentIds.map((a) => (typeof a === 'string' ? a.trim() : ''));
  if (agentIds.some((a) => !a)) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'agent_ids entries must be non-empty strings' },
    });
    return;
  }
  // D2：创建时引用的 agent 必须存在
  const missing = missingAgentErrors(agentIds);
  if (missing.length > 0) {
    rejectMissingAgents(res, missing);
    return;
  }

  const now = nowIso();
  const record: TeamRecord = {
    team_id: `team-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name,
    description,
    workspace_id: workspaceId,
    agent_ids: [...new Set(agentIds)], // dedup，保持顺序（对齐 Python dict.fromkeys）
    created_at: now,
    updated_at: now,
  };
  saveTeamRecord(record);
  res.status(201).json(envelope(record, { created: true }));
});

// ─── GET /api/teams?workspace_id= — 列表 ─────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const raw = req.query.workspace_id;
  const workspaceId = typeof raw === 'string' && raw.length > 0 ? raw : null;
  const records = listTeams(workspaceId);
  res.json(envelope(records, { total: records.length }));
});

// ─── GET /api/teams/:id — 单个 ───────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  res.json(envelope(record));
});

// ─── PATCH /api/teams/:id — 改名/描述/换 workspace/加减成员 ──────────────────

router.patch('/:id', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!isValidTeamId(teamId)) {
    res.status(400).json({
      error: { code: 'INVALID_TEAM_ID', message: 'Invalid team_id format' },
    });
    return;
  }
  const record = loadTeamRecord(teamId);
  if (!record) {
    notFound(res, teamId);
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = body.name;
  if (name !== undefined) {
    if (typeof name !== 'string' || name.length < 1 || name.length > 120) {
      res.status(422).json({
        error: { code: 'INVALID_BODY', message: 'name must be a string of 1..120 chars' },
      });
      return;
    }
    record.name = name;
  }
  const description = body.description;
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 500) {
      res.status(422).json({
        error: { code: 'INVALID_BODY', message: 'description must be a string of at most 500 chars' },
      });
      return;
    }
    record.description = description;
  }
  const workspaceId = body.workspace_id;
  if (workspaceId !== undefined) {
    if (typeof workspaceId !== 'string' || workspaceId.length < 1 || workspaceId.length > 80) {
      res.status(422).json({
        error: { code: 'INVALID_BODY', message: 'workspace_id must be a string of 1..80 chars' },
      });
      return;
    }
    record.workspace_id = workspaceId;
  }

  const addIds = Array.isArray(body.add_agent_ids)
    ? body.add_agent_ids.filter((a): a is string => typeof a === 'string')
    : [];
  const removeIds = Array.isArray(body.remove_agent_ids)
    ? body.remove_agent_ids.filter((a): a is string => typeof a === 'string')
    : [];

  // D2：新加成员必须可解析；既有成员不重复校验（向后兼容老记录）
  if (addIds.length > 0) {
    const missing = missingAgentErrors(addIds);
    if (missing.length > 0) {
      rejectMissingAgents(res, missing);
      return;
    }
  }

  const current = Array.isArray(record.agent_ids) ? [...record.agent_ids] : [];
  for (const aid of addIds) {
    if (!current.includes(aid)) current.push(aid);
  }
  const removeSet = new Set(removeIds);
  record.agent_ids = current.filter((aid) => !removeSet.has(aid));

  record.updated_at = nowIso();
  saveTeamRecord(record);
  res.json(envelope(record));
});

// ─── DELETE /api/teams/:id ───────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const teamId = req.params.id;
  if (!isValidTeamId(teamId)) {
    res.status(400).json({
      error: { code: 'INVALID_TEAM_ID', message: 'Invalid team_id format' },
    });
    return;
  }
  if (!loadTeamRecord(teamId)) {
    notFound(res, teamId);
    return;
  }
  deleteTeamFile(teamId);
  res.status(204).send();
});

// ─── GET /api/teams/:id/workflow — 读取（无图给默认） ────────────────────────

router.get('/:id/workflow', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  const wf = record.workflow;
  const workflow =
    wf && typeof wf === 'object' && Array.isArray(wf.nodes) && Array.isArray(wf.edges)
      ? wf
      : defaultWorkflow();
  res.json(envelope(workflow));
});

// ─── PUT /api/teams/:id/workflow — D1+D2 校验后保存并自动记版本 ──────────────

router.put('/:id/workflow', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const record = guardTeam(res, teamId);
  if (!record) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawNodes = body.nodes;
  const rawEdges = body.edges;
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    res.status(422).json({
      error: {
        code: 'INVALID_DAG',
        message: 'Team workflow DAG is invalid: workflow.nodes and workflow.edges must be arrays',
        errors: ["workflow.nodes and workflow.edges must be arrays"],
      },
    });
    return;
  }
  const workflow: TeamWorkflowGraph = { nodes: rawNodes, edges: rawEdges };

  // D1：存储形 DAG 结构校验（自环/端点/顺序环），畸形输入以错误串报告
  const dagErrors = validateWorkflowStoredShape(workflow);
  if (dagErrors.length > 0) {
    rejectInvalidDag(res, dagErrors);
    return;
  }
  // D2：节点引用的 agent 必须存在（空 agentId = coordinator 占位，跳过）
  const missing = missingAgentErrors(workflowStoredAgentIds(workflow));
  if (missing.length > 0) {
    rejectMissingAgents(res, missing);
    return;
  }

  record.workflow = workflow;
  record.updated_at = nowIso();
  saveTeamRecord(record);
  // 版本仓快照：每次成功保存自动记一版（summary=null，对齐 Python）
  recordVersion(teamId, workflow as unknown as Record<string, unknown>);
  res.json(envelope(record.workflow));
});

// ─── GET /api/teams/:id/workflow/versions — 只回元数据 ───────────────────────

router.get('/:id/workflow/versions', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const record = guardTeam(res, teamId);
  if (!record) return;
  const versions = listVersions(teamId).map((v) => ({
    version: v.version,
    saved_at: v.saved_at,
    summary: v.summary ?? null,
  }));
  res.json(envelope(versions, { total: versions.length }));
});

// ─── POST /api/teams/:id/workflow/restore — append-only 恢复 ─────────────────

router.post('/:id/workflow/restore', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const record = guardTeam(res, teamId);
  if (!record) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const version = body.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'version must be an integer >= 1' },
    });
    return;
  }
  const entry = getVersion(teamId, version);
  if (!entry) {
    res.status(404).json({
      error: {
        code: 'VERSION_NOT_FOUND',
        message: `Workflow version v${version} not found for team '${teamId}'`,
      },
    });
    return;
  }
  const workflow = entry.workflow as unknown as TeamWorkflowGraph;
  // 恢复快照走与 PUT 相同的 D1/D2 写前校验（老图引用的 agent 可能已被删）
  const dagErrors = validateWorkflowStoredShape(workflow);
  if (dagErrors.length > 0) {
    rejectInvalidDag(res, dagErrors);
    return;
  }
  const missing = missingAgentErrors(workflowStoredAgentIds(workflow));
  if (missing.length > 0) {
    rejectMissingAgents(res, missing);
    return;
  }
  record.workflow = workflow;
  record.updated_at = nowIso();
  saveTeamRecord(record);
  // 再记一个新版本，历史 append-only
  recordVersion(teamId, workflow as unknown as Record<string, unknown>, `restored from v${version}`);
  res.json(envelope(record.workflow));
});

// ─── POST /api/teams/:id/workflow/branch — 复制为分支团队 ────────────────────

router.post('/:id/workflow/branch', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const record = guardTeam(res, teamId);
  if (!record) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = body.name;
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 120)) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'name must be a string of 1..120 chars' },
    });
    return;
  }
  const now = nowIso();
  const branch: TeamRecord = {
    team_id: `team-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: typeof name === 'string' && name ? name : `${String(record.name ?? teamId)} · 分支`,
    description: typeof record.description === 'string' ? record.description : '',
    workspace_id: normalizeWorkspaceId(
      typeof record.workspace_id === 'string' ? record.workspace_id : undefined,
    ),
    agent_ids: Array.isArray(record.agent_ids) ? [...record.agent_ids] : [],
    created_at: now,
    updated_at: now,
  };
  for (const key of ['workflow', 'policy_matrix', 'validation_hooks'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    (branch as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(value));
  }
  saveTeamRecord(branch);
  const wf = branch.workflow;
  if (wf && typeof wf === 'object' && Array.isArray(wf.nodes) && Array.isArray(wf.edges)) {
    const latest = latestVersion(teamId);
    const origin = latest ? `${teamId} v${latest.version}` : teamId;
    recordVersion(branch.team_id, wf as unknown as Record<string, unknown>, `branched from ${origin}`);
  }
  res.status(201).json(envelope(branch, { created: true, branched_from: teamId }));
});

// ─── GET/PUT /api/teams/:id/policy — policy_matrix ───────────────────────────

router.get('/:id/policy', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  const matrix = record.policy_matrix;
  res.json(envelope(matrix && typeof matrix === 'object' && !Array.isArray(matrix) ? matrix : {}));
});

router.put('/:id/policy', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const matrix = body.matrix;
  if (matrix === undefined || matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'matrix must be an object' },
    });
    return;
  }
  record.policy_matrix = matrix as Record<string, unknown>;
  record.updated_at = nowIso();
  saveTeamRecord(record);
  res.json(envelope(record.policy_matrix));
});

// ─── GET/PUT /api/teams/:id/validation-hooks — 顶层字段整体替换 ──────────────

router.get('/:id/validation-hooks', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  const hooks = Array.isArray(record.validation_hooks) ? record.validation_hooks : [];
  res.json(envelope({ validation_hooks: hooks }));
});

router.put('/:id/validation-hooks', (req: Request, res: Response) => {
  const record = guardTeam(res, req.params.id);
  if (!record) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const hooks = body.validation_hooks;
  if (!Array.isArray(hooks)) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: 'validation_hooks must be an array' },
    });
    return;
  }
  // 每 hook 必填校验（对齐 Python ValidationHookSpec）：
  //   id 1..128 / kind ∈ {shell,webhook,builtin} / on_fail ∈ {retry,blocker,warn}
  //   / kind=shell 须带 cmd 非空 argv / webhook 须带 url / builtin 须带 name
  const kinds = new Set(['shell', 'webhook', 'builtin']);
  const onFails = new Set(['retry', 'blocker', 'warn']);
  const errors: string[] = [];
  hooks.forEach((h, i) => {
    const label = `validation_hooks[${i}]`;
    if (!h || typeof h !== 'object' || Array.isArray(h)) {
      errors.push(`${label}: must be an object`);
      return;
    }
    const o = h as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length < 1 || o.id.length > 128) {
      errors.push(`${label}.id: must be a string of 1..128 chars`);
    }
    if (typeof o.kind !== 'string' || !kinds.has(o.kind)) {
      errors.push(`${label}.kind: must be one of shell/webhook/builtin`);
      return;
    }
    if (o.on_fail !== undefined && (typeof o.on_fail !== 'string' || !onFails.has(o.on_fail))) {
      errors.push(`${label}.on_fail: must be one of retry/blocker/warn`);
    }
    const block = o[o.kind];
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      errors.push(`${label}: kind=${o.kind} requires a ${o.kind}: config block`);
      return;
    }
    const b = block as Record<string, unknown>;
    if (o.kind === 'shell' && (!Array.isArray(b.cmd) || b.cmd.length < 1)) {
      errors.push(`${label}.shell.cmd: must be a non-empty argv list`);
    }
    if (o.kind === 'webhook' && typeof b.url !== 'string') {
      errors.push(`${label}.webhook.url: must be a string`);
    }
    if (o.kind === 'builtin' && (typeof b.name !== 'string' || b.name.length < 1)) {
      errors.push(`${label}.builtin.name: must be a non-empty string`);
    }
  });
  if (errors.length > 0) {
    res.status(422).json({
      error: { code: 'INVALID_HOOKS', message: 'validation_hooks failed validation', errors },
    });
    return;
  }
  // 剥掉显式 null 字段（对齐 Python model_dump(exclude_none=True)）
  const cleaned = hooks.map((h) => {
    const o = { ...(h as Record<string, unknown>) };
    for (const k of Object.keys(o)) {
      if (o[k] === null) delete o[k];
    }
    return o;
  });
  record.validation_hooks = cleaned;
  record.updated_at = nowIso();
  saveTeamRecord(record);
  res.json(envelope({ validation_hooks: cleaned }));
});

// ─── POST /api/teams/:id/chat — BYOK LLM 驱动的自然语言团队编辑 ──────────────

const TEAM_EDIT_SYSTEM_PROMPT = `You are a Team configuration assistant. The user will describe changes to an AI agent team's configuration in natural language. You must interpret their request and output a JSON object with the fields to update.

Current team configuration:
- Name: {name}
- Description: {description}
- Agent IDs: {agent_ids}

Respond with ONLY a JSON object (no markdown, no explanation outside JSON) with this structure:
{{
  "updates": {{
    "name": "new name or null if unchanged",
    "description": "new description or null if unchanged",
    "add_agent_ids": ["agent-id-1"] or null if not adding,
    "remove_agent_ids": ["agent-id-2"] or null if not removing
  }},
  "explanation": "Brief description of what you changed (in the user's language)"
}}

Rules:
- If the user asks to rename the team, update the "name" field
- If the user asks to change the description/purpose, update the "description" field
- If the user asks to add agents/members, put their IDs in "add_agent_ids"
- If the user asks to remove agents/members, put their IDs in "remove_agent_ids"
- Set unchanged fields to null
- Keep explanation concise (1-2 sentences)
- Match the user's language (Chinese or English)
`;

/** 用户可控字段进 prompt 前转义 { }，防 format 注入（对齐 Python _escape_fmt_str）。 */
const escapeFmtStr = (s: string) => s.replace(/\{/g, '{{').replace(/\}/g, '}}');

/** 从 stream chunks 收文本；error chunk / throw → {error}。LLM 调用统一走
 *  transport 层 callProvider（与 dag-draft 同管道），测试用 vi.mock 拦截。 */
async function collectLlmText(opts: {
  provider: string;
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
  signal?: AbortSignal;
}): Promise<{ text: string } | { error: string }> {
  let text = '';
  try {
    for await (const chunk of callProvider(opts.provider, {
      systemPrompt: opts.systemPrompt,
      userMessage: opts.userMessage,
      model: opts.model,
      max_tokens: 1500,
      temperature: 0.2,
      api_key: opts.apiKey,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) return { error: 'aborted' };
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      else if (chunk.type === 'error') return { error: chunk.message };
    }
  } catch (err) {
    return { error: (err as Error).message ?? String(err) };
  }
  return { text };
}

const runChatLlm = collectLlmText;

router.post('/:id/chat', (req: Request, res: Response) => {
  void (async () => {
    const teamId = req.params.id;
    const record = guardTeam(res, teamId);
    if (!record) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message : '';
    if (message.length < 1 || message.length > 2000) {
      res.status(422).json({
        error: { code: 'INVALID_BODY', message: 'message must be a string of 1..2000 chars' },
      });
      return;
    }

    // BYOK key：只认显式 X-LLM-Key 头（对齐 Python：缺头直接 401）
    const rawKey = req.headers['x-llm-key'];
    const apiKey = (Array.isArray(rawKey) ? rawKey[0] : rawKey)?.trim();
    if (!apiKey) {
      res.status(401).json({
        error: { code: 'NO_API_KEY', message: 'X-LLM-Key header required for chat editing' },
      });
      return;
    }

    const rawProvider = req.headers['x-llm-provider'];
    const headerProvider = (Array.isArray(rawProvider) ? rawProvider[0] : rawProvider)?.trim().toLowerCase();
    const provider = headerProvider === 'claude' ? 'anthropic' : headerProvider || 'zhipu';
    if (!isProviderId(provider)) {
      res.status(400).json({
        error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${provider}` },
      });
      return;
    }
    const rawModel = req.headers['x-llm-model'];
    const headerModel = (Array.isArray(rawModel) ? rawModel[0] : rawModel)?.trim();
    const model = headerModel || (DEFAULT_MODELS as Record<ProviderId, string>)[provider];
    if (!model) {
      res.status(400).json({
        error: { code: 'NO_MODEL', message: `X-LLM-Model header required for provider '${provider}'` },
      });
      return;
    }

    const systemPrompt = TEAM_EDIT_SYSTEM_PROMPT.split('{name}').join(escapeFmtStr(String(record.name ?? '')))
      .split('{description}').join(escapeFmtStr(String(record.description ?? '')))
      .split('{agent_ids}').join(JSON.stringify(Array.isArray(record.agent_ids) ? record.agent_ids : []))
      .split('{{').join('{')
      .split('}}').join('}');

    const ac = new AbortController();
    // 监听 res 的提前 close（客户端断连）——req 的 'close' 在 JSON body 收完
    // 就会触发，会误杀正常的 LLM 调用（同 teams.ts dag-draft 的现成手法）。
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });

    const outcome = await runChatLlm({
      provider,
      apiKey,
      model,
      systemPrompt,
      userMessage: message,
      signal: ac.signal,
    });
    if ('error' in outcome) {
      res.status(502).json({
        error: { code: 'LLM_ERROR', message: outcome.error },
      });
      return;
    }

    // 剥 ``` 围栏后解析（对齐 Python 的围栏剥离）
    let content = outcome.text.trim();
    if (content.startsWith('```')) {
      content = content
        .split('\n')
        .filter((l) => !l.trim().startsWith('```'))
        .join('\n');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(422).json({
        error: { code: 'LLM_PARSE_ERROR', message: 'LLM response was not valid JSON' },
      });
      return;
    }
    const result = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const updates =
      result.updates && typeof result.updates === 'object' && !Array.isArray(result.updates)
        ? (result.updates as Record<string, unknown>)
        : {};
    const explanation = typeof result.explanation === 'string' ? result.explanation : '';
    const appliedFields: string[] = [];

    // 类型校验后才套用——防 LLM 注入意外字段类型（对齐 Python 逐字段 isinstance）
    const newName = updates.name;
    if (typeof newName === 'string' && newName) {
      record.name = newName.slice(0, 120);
      appliedFields.push('name');
    }
    const newDesc = updates.description;
    if (typeof newDesc === 'string') {
      record.description = newDesc.slice(0, 500);
      appliedFields.push('description');
    }

    const currentIds: string[] = Array.isArray(record.agent_ids) ? [...record.agent_ids] : [];
    let addIds = updates.add_agent_ids;
    let removeIds = updates.remove_agent_ids;
    if (!(Array.isArray(addIds) && addIds.every((i) => typeof i === 'string'))) addIds = null;
    if (!(Array.isArray(removeIds) && removeIds.every((i) => typeof i === 'string'))) removeIds = null;
    if (addIds) {
      for (const aid of addIds as string[]) {
        if (!currentIds.includes(aid)) currentIds.push(aid);
      }
      appliedFields.push('add_agent_ids');
    }
    if (removeIds) {
      const removeSet = new Set(removeIds as string[]);
      record.agent_ids = currentIds.filter((aid) => !removeSet.has(aid));
      appliedFields.push('remove_agent_ids');
    } else {
      record.agent_ids = currentIds;
    }

    if (appliedFields.length > 0) {
      record.updated_at = nowIso();
      saveTeamRecord(record);
    }

    res.json(
      envelope({
        team: record,
        reply: explanation,
        applied: appliedFields.length > 0,
        applied_fields: appliedFields,
      }),
    );
  })().catch((err) => {
    if (!res.headersSent) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message ?? String(err) },
      });
    }
  });
});

// ─── dag-draft roster 本地化支撑（供 teams.ts 修改处引用） ───────────────────
// 说明：roster 解析此前打 ${PYTHON_BASE}/api/agents；single 模式没有 Python，
// 改读本地 agent 库（repoDataFile('agents')/*.json，与 Python store 同目录同
// 源）∪ yaml 模板。此处导出摘要列表函数；teams.ts 的 resolveDraftRoster 已改
// 为本地读取。

export function draftRosterCandidates(): Array<{ id: string; name: string; role?: string }> {
  const out = new Map<string, { id: string; name: string; role?: string }>();
  for (const a of listLocalAgentSummaries()) {
    out.set(a.id, a);
  }
  try {
    for (const a of listYamlAgents().agents) {
      if (out.has(a.id)) continue;
      out.set(a.id, {
        id: a.id,
        name: a.title || a.id,
        role: a.persona.split('\n').find((l) => l.trim().length > 0)?.trim() ?? a.sub,
      });
    }
  } catch {
    /* yaml 库不可读 — 本地 json 兜底 */
  }
  return [...out.values()];
}

export default router;

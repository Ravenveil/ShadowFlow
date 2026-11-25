/**
 * agents.ts — /api/agents（单后端：本地 `.shadowflow/agents/*.json` 真源 + yaml 模板）。
 *
 * 历史：双后端时代本路由把 POST/DELETE 转发 Python（split-brain 修复，见
 * git log），GET 合并 Python 列表 + yaml 模板。ADR-0001（2026-11-24）后
 * Python 删除，全部读写走本地：
 *   - 真源 = `.shadowflow/agents/<id>.json`（Catalog fork / POST / PATCH 落点，
 *     与原 Python store 同目录同格式，经 lib/agent-store 读写）
 *   - 设计模板 = `.shadowflow/agents/<语义 id>.agent.yaml`（只读展示 + overrides
 *     sidecar 承载头像 / Claw 绑定，见 lib/agent-overrides）
 *
 * 前端 client：src/api/agents.ts —— 成功响应包 { data, meta } 信封；DELETE 204 无 body。
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { listAgents as listYamlAgents, deleteAgent as deleteYamlAgent } from '../../application/agents/infra-yaml';
import {
  applyAgentOverrides,
  loadAgentOverrides,
  saveAgentOverrides,
  type AgentOverrideField,
} from '../../application/agents/infra-overrides';
import type { AgentRecord } from '../../application/agents/infra-persistence';
import {
  type LocalAgentRecord,
  listAgentFileIds,
  readAgentFile,
  writeAgentFile,
  deleteAgentFile,
  toAgentWireRecord,
} from '../../application/agents/infra-store';

const router = Router();

/** Map a yaml template to the AgentRecord shape FE expects (mirrors the
 *  yaml-template branch of the old `listAllAgents` for byte-compatibility). */
function yamlToRecord(workspaceId: string | undefined): AgentRecord[] {
  const yamlResult = listYamlAgents();
  return yamlResult.agents.map((a) => ({
    agent_id: a.id,
    name: a.title,
    soul:
      a.persona.split('\n').find((l) => l.trim().length > 0)?.trim() ??
      a.sub ??
      '',
    workspace_id: workspaceId ?? 'default',
    blueprint: {
      capabilities: { tools: a.tools.picked },
      llm_provider: 'claude',
      model: a.model.id,
      persona_ref: a.anchors.persona.ref,
      yaml_source_file: a.source_file,
    },
    status: 'idle' as const,
    source: 'yaml-template' as const,
    created_at: '1970-01-01T00:00:00.000Z',
  }));
}

/** yaml 模板 record + 运行时 overrides（Claw 绑定 / 头像）合并后的展示 record。 */
function yamlToRecordWithOverrides(workspaceId: string | undefined): AgentRecord[] {
  return yamlToRecord(workspaceId).map((r) =>
    applyAgentOverrides(r as unknown as Record<string, unknown>, loadAgentOverrides(r.agent_id)) as unknown as AgentRecord,
  );
}

/** 本地 JSON agent 库（Catalog fork / POST 产物；单后端下唯一真源）。 */
function localJsonAgents(workspaceId: string | undefined): AgentRecord[] {
  return listAgentFileIds()
    .map((id) => readAgentFile(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .filter((a) => !workspaceId || !a['workspace_id'] || a['workspace_id'] === workspaceId)
    .map((a) => toAgentWireRecord(a) as unknown as AgentRecord);
}

// ─── GET /api/agents — 本地 JSON + yaml 模板合并 ─────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const workspaceId =
    typeof req.query.workspace_id === 'string'
      ? req.query.workspace_id
      : undefined;
  // ?source=sqlite 是旧「不合并 yaml」标记 —— 现在语义为「只看真源，跳过模板」。
  const noYamlMerge = req.query.source === 'sqlite';

  const merged = localJsonAgents(workspaceId);
  if (noYamlMerge) {
    res.json({ data: merged, meta: {} });
    return;
  }

  // 合并 yaml 模板（语义 id：reader / pm / dev…；与 JSON id 不碰撞）。
  const seen = new Set(merged.map((a) => a.agent_id));
  const yamlAgents = yamlToRecordWithOverrides(workspaceId).filter(
    (a) => !seen.has(a.agent_id),
  );
  res.json({ data: [...merged, ...yamlAgents], meta: {} });
});

// ─── GET /api/agents/:id — 本地 JSON → yaml 模板 → 404 ──────────────────────
// 2026-10-31 起补单条 GET：右栏「灵魂」tab 直打 /:id；合并语义与 GET '/' 一致。
router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const workspaceId =
    typeof req.query.workspace_id === 'string' ? req.query.workspace_id : undefined;

  // registry / routing-log 是 DAG 子路径资源，不属于单个 agent。
  if (id === 'registry' || id === 'routing-log') {
    res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${id}' not found` } });
    return;
  }

  // 本地 JSON 优先（真源；DAG / 灵魂 tab 都从这里读）。
  const localRec = readAgentFile(id);
  if (localRec) {
    res.json({ data: toAgentWireRecord(localRec), meta: {} });
    return;
  }

  // yaml 模板回落（语义 id）；overrides（头像等运行时字段）一并贴回。
  const tpl = yamlToRecordWithOverrides(workspaceId).find((a) => a.agent_id === id);
  if (tpl) {
    res.json({ data: tpl, meta: {} });
    return;
  }
  res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${id}' not found` } });
});

// ─── POST /api/agents — 落本地 JSON ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: { code: 'INVALID_AGENT', message: 'name is required' } });
    return;
  }
  const agentId =
    typeof body.agent_id === 'string' && body.agent_id.trim()
      ? body.agent_id.trim()
      : `agent-${randomUUID()}`;
  const record: Record<string, unknown> = {
    ...body,
    agent_id: agentId,
    name,
    status: typeof body.status === 'string' ? body.status : 'idle',
    created_at: typeof body.created_at === 'string' ? body.created_at : new Date().toISOString(),
  };
  try {
    writeAgentFile(record);
  } catch (err) {
    res.status(400).json({
      error: {
        code: 'INVALID_AGENT',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    return;
  }
  res.status(201).json({ data: toAgentWireRecord(record as unknown as LocalAgentRecord), meta: {} });
});

// ─── DELETE /api/agents/:id — 本地 JSON → yaml 模板 → 404 ────────────────────
// 真源 agent（JSON）删文件；yaml 灵魂模板（语义 id）删 .agent.yaml 文件
// （deleteYamlAgent），人才池的删除对两种来源都生效。
router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  if (deleteAgentFile(id)) {
    res.status(204).send();
    return;
  }
  if (deleteYamlAgent(id)) {
    res.status(204).send();
    return;
  }
  res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${id}' not found` } });
});

// ─── PATCH /api/agents/:id — JSON 真源浅合并 / yaml 模板走 overrides sidecar ─
// 2026-11-04 — 补 PATCH：保存头像 / Claw 绑定（灵魂页「保存头像」钮）。
// 语义 id（pm / dev / reader…）是 yaml 模板本体：设计时字段（name/soul/skills/
// tools）只读，展示层白名单字段写 <id>.overrides.json sidecar（GET 合并贴回）。
// JSON 真源 agent：浅合并整个 body 后写回（它就是本仓自己的存储）。
interface AgentPatchBody {
  name?: unknown;
  soul?: unknown;
  skills?: unknown;
  tools?: unknown;
  claw_id?: unknown;
  avatar_color?: unknown;
  avatar_style?: unknown;
  avatar_seed?: unknown;
  avatar_image?: unknown;
}

const OVERRIDE_BODY_KEYS: AgentOverrideField[] = [
  'claw_id',
  'avatar_color',
  'avatar_style',
  'avatar_seed',
  'avatar_image',
];

router.patch('/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as AgentPatchBody;

  // JSON 真源 agent：浅合并写回。
  const rec = readAgentFile(id);
  if (rec) {
    const merged: Record<string, unknown> = {
      ...(rec as unknown as Record<string, unknown>),
      ...(body as Record<string, unknown>),
      agent_id: id,
    };
    try {
      writeAgentFile(merged);
    } catch (err) {
      res.status(400).json({
        error: { code: 'INVALID_AGENT', message: err instanceof Error ? err.message : String(err) },
      });
      return;
    }
    res.json({ data: toAgentWireRecord(merged as unknown as LocalAgentRecord), meta: {} });
    return;
  }

  // yaml 模板回落：仅白名单展示层字段可覆盖；name/soul 等设计时字段明确拒绝。
  const isYamlTemplate = listYamlAgents().agents.some((a) => a.id === id);
  if (!isYamlTemplate) {
    res.status(404).json({ error: { code: 'AGENT_NOT_FOUND', message: `Agent '${id}' not found` } });
    return;
  }
  const hasDesignTimeFields = (
    ['name', 'soul', 'skills', 'tools'] as const
  ).some((k) => body[k] !== undefined);
  if (hasDesignTimeFields) {
    res.status(422).json({
      error: {
        code: 'YAML_TEMPLATE_READONLY',
        message: `Agent '${id}' is a yaml soul-template: name/soul/skills/tools are design-time fields — edit the .agent.yaml file instead. Avatar / Claw binding fields are supported.`,
      },
    });
    return;
  }
  const patch: Partial<Record<AgentOverrideField, string | null>> = {};
  for (const key of OVERRIDE_BODY_KEYS) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== 'string' && v !== null) {
      res.status(422).json({ error: { code: 'INVALID_FIELD', message: `${key} must be a string or null` } });
      return;
    }
    patch[key as AgentOverrideField] = v as string | null;
  }
  const saved = saveAgentOverrides(id, patch);
  if (!saved) {
    res.status(500).json({ error: { code: 'OVERRIDES_WRITE_FAILED', message: `Failed to write overrides for '${id}'` } });
    return;
  }
  // 返回与 GET /:id 相同形状的合并 record（前端 patchAgent 用返回值刷新状态）
  const record = yamlToRecordWithOverrides(undefined).find((a) => a.agent_id === id);
  res.json({ data: record, meta: {} });
});

// ─── POST /api/agents/:id/pause | /resume ───────────────────────────────────
// legacy NeoAgentSoul 头部「暂停 / 恢复」调用的端点，单后端迁移时遗漏导致
// 前端 404。这里补齐：JSON 真源改 status 字段后写回；yaml 模板（语义 id）
// 的 status 属运行时，模板本体只读——返回 422 与 PATCH 设计时字段同策略。
function setAgentStatus(id: string, status: 'paused' | 'idle'): {
  code: number;
  body: unknown;
} {
  const rec = readAgentFile(id);
  if (!rec) {
    return {
      code: 404,
      body: { error: { code: 'AGENT_NOT_FOUND', message: `Agent '${id}' not found` } },
    };
  }
  const merged: Record<string, unknown> = {
    ...(rec as unknown as Record<string, unknown>),
    agent_id: id,
    status,
  };
  try {
    writeAgentFile(merged);
  } catch (err) {
    return {
      code: 400,
      body: {
        error: {
          code: 'AGENT_STATUS_WRITE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
  return { code: 200, body: { data: toAgentWireRecord(merged as unknown as LocalAgentRecord), meta: {} } };
}

for (const [action, status] of [
  ['pause', 'paused'],
  ['resume', 'idle'],
] as const) {
  router.post(`/:id/${action}`, (req: Request, res: Response) => {
    const result = setAgentStatus(req.params.id, status);
    res.status(result.code).json(result.body);
  });
}

export default router;

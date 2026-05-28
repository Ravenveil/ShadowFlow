/**
 * agents.ts — thin forwarder to Python FastAPI (port 8000) + local yaml merge.
 *
 * 2026-05-28 split-brain fix (see memory/bug_quick_hire_dangling_agent.md).
 *
 * Background: Node used to own /api/agents POST/GET/DELETE on its own sqlite
 * store (`storage/agents.ts`, randomUUID() ids). But /api/teams falls through
 * to Python (this router only owns DAG sub-paths), so every team got created
 * on Python with `agent_ids` pointing at Node-only UUIDs that Python had never
 * heard of. Result: every "帮我创建一个开发工程师" team had a dangling
 * agent_id, the chat group thought it had a member but the member did not
 * exist in the team store's universe.
 *
 * Fix: agents move to Python (single source of truth, matches the
 * CLAUDE.md dual-backend rule that Python owns teams/groups/inbox). Node's
 * /api/agents POST + DELETE now forward to Python. GET still merges Python's
 * agent list with local `.shadowflow/agents/*.agent.yaml` templates so the
 * existing "agents + design-time soul templates" UI keeps working without a
 * Python-side schema change.
 *
 * The legacy sqlite store (storage/agents.ts) is now dormant but kept in
 * place — internal callers / tests still import it, and zero rows is a safe
 * state. A follow-up sweep can remove it once nothing else reads it.
 *
 * Frontend client: src/api/agents.ts
 *   - All success responses wrap payload in { data, meta } (Envelope<T>).
 *   - DELETE returns 204 with no body.
 */

import { Router, Request, Response } from 'express';
import { listAgents as listYamlAgents } from '../lib/agent-yaml';
import type { AgentRecord } from '../storage/agents';

const router = Router();

const PYTHON_BASE =
  process.env.PYTHON_BACKEND_URL ?? 'http://localhost:8000';

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

/** Forward arbitrary body to Python, return its raw response. */
async function forwardJson(
  method: 'POST' | 'DELETE',
  pathSuffix: string,
  body: unknown,
): Promise<{ status: number; payload: unknown }> {
  const url = `${PYTHON_BASE}/api/agents${pathSuffix}`;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined && method !== 'DELETE') {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: unknown = text;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      // not JSON — bubble up raw text under a synthetic error envelope
      payload = { error: { code: 'PYTHON_NON_JSON', message: text } };
    }
  }
  return { status: res.status, payload };
}

// ─── GET /api/agents — Python agents + local yaml templates merged ──────────
router.get('/', async (req: Request, res: Response) => {
  const workspaceId =
    typeof req.query.workspace_id === 'string'
      ? req.query.workspace_id
      : undefined;
  // ?source=sqlite is the legacy "no yaml merge" flag — now means
  // "Python-only, skip yaml templates".
  const noYamlMerge = req.query.source === 'sqlite';

  // Python agents (real, persisted)
  let pythonAgents: AgentRecord[] = [];
  try {
    const qs = workspaceId
      ? `?workspace_id=${encodeURIComponent(workspaceId)}`
      : '';
    const pyRes = await fetch(`${PYTHON_BASE}/api/agents${qs}`);
    if (pyRes.ok) {
      const env = (await pyRes.json()) as { data?: AgentRecord[] };
      pythonAgents = Array.isArray(env.data) ? env.data : [];
    } else {
      // Python down or unhappy — return what we can (yaml-only) but log.
      // eslint-disable-next-line no-console
      console.warn(
        `[agents-route] Python /api/agents returned ${pyRes.status}; falling back to yaml-only`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[agents-route] Python /api/agents fetch failed; falling back to yaml-only:',
      err,
    );
  }

  if (noYamlMerge) {
    res.json({ data: pythonAgents, meta: {} });
    return;
  }

  // Merge with local yaml templates. Python wins on id collision (defensive —
  // in practice they don't collide: Python uses `agent-*`, yaml uses semantic
  // names like "reader", "pm").
  const pyIds = new Set(pythonAgents.map((a) => a.agent_id));
  const yamlAgents = yamlToRecord(workspaceId).filter(
    (a) => !pyIds.has(a.agent_id),
  );
  res.json({ data: [...pythonAgents, ...yamlAgents], meta: {} });
});

// ─── POST /api/agents — forward to Python ───────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const { status, payload } = await forwardJson('POST', '', req.body);
    res.status(status).json(payload);
  } catch (err) {
    res.status(502).json({
      error: {
        code: 'PYTHON_UNREACHABLE',
        message: `Cannot reach Python at ${PYTHON_BASE}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    });
  }
});

// ─── DELETE /api/agents/:id — forward to Python ─────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { status, payload } = await forwardJson(
      'DELETE',
      `/${encodeURIComponent(req.params.id)}`,
      undefined,
    );
    if (status === 204 || status === 200) {
      res.status(204).send();
      return;
    }
    res.status(status).json(payload);
  } catch (err) {
    res.status(502).json({
      error: {
        code: 'PYTHON_UNREACHABLE',
        message: `Cannot reach Python at ${PYTHON_BASE}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    });
  }
});

export default router;

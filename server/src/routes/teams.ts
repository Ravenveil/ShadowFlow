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
} from '../lib/team-yaml';

const router = Router();

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// Mirror of the path resolution in team-yaml.ts. Kept local because the
// writer needs the same precedence (root wins over local) when picking
// where to overwrite.
const ROOT_TEAMS_DIR = path.join(process.cwd(), '..', '.shadowflow', 'teams');
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

export default router;

/**
 * skills.ts — Skill listing router.
 *
 * GET  /api/skills          → SkillSummary[]   (Story 15.1)
 * POST /api/skills/reload   → { reloaded, errors }   (Story 15.10)
 *
 * Story 15.10: GET response now includes optional metadata fields
 * (platform / scenario / fidelity / example_prompt) sourced from
 * SKILL.md frontmatter. Hardcoded skills omit those fields, which
 * serialise as `undefined` (i.e. absent in JSON) — backward-compatible
 * for existing UI consumers.
 */

import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { SKILLS, HARDCODED_SKILLS, reloadSkills } from '../skills';
import { ingestSkill, listInstalled, parseSource } from '../skill-ingest';
import { getAgent, getAnchorBody } from '../lib/skill-yaml';
import type { SkillSlot } from '../lib/skill-types';
import previewTriageRouter from './skills-preview-triage';

const router = Router();

// Round 4 PR-E — `/:id/compile-status` lives in its own file so the compile
// cache plumbing stays out of the (already long) skills.ts. Mounted at the
// router root so the URL stays `/api/skills/:id/compile-status`.
router.use('/', previewTriageRouter);

// 2026-05-10 Story 15.28 — POST /save name validation. Same regex used by
// loaders/skill-loader.ts so any name we accept here will round-trip cleanly
// when the loader rescans the FS. Defends against path traversal (no ..),
// control chars, RTL marks, and absolute paths.
const VALID_SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

router.get('/', (_req: Request, res: Response) => {
  const list = Object.entries(SKILLS).map(([skill_id, skill]) => ({
    skill_id,
    name: skill.name,
    description: skill.description,
    mode: skill.mode,
    preview_type: skill.preview_type,
    platform: skill.platform,
    scenario: skill.scenario,
    fidelity: skill.fidelity,
    example_prompt: skill.example_prompt,
    has_team: !!skill.team,
  }));
  res.json(list);
});

// ───────────────────────────────────────────────────────────────────────────
// S6.1 — Skill team probe endpoints.
//
// Two reads only — provenance lookup for the right-pane "from <skill>.yaml#..."
// labels and the editor surface. No writes; editing is deferred.
// ───────────────────────────────────────────────────────────────────────────

const VALID_AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const VALID_SLOTS: ReadonlySet<SkillSlot> = new Set([
  'persona',
  'model',
  'tools',
  'memory',
  'io',
]);

router.get('/:skillId/team', (req: Request, res: Response) => {
  const skillId = req.params.skillId;
  if (!VALID_SKILL_ID_RE.test(skillId)) {
    res.status(400).json({ error: 'invalid skillId' });
    return;
  }
  const skill = SKILLS[skillId];
  if (!skill) {
    res.status(404).json({ error: 'skill not found' });
    return;
  }
  if (!skill.team) {
    res.status(404).json({ error: 'skill has no team.skill.yaml' });
    return;
  }
  // Strip absolute filesystem paths from the response so we don't leak
  // server-local directory layout to the browser.
  const { source_dir, ...safe } = skill.team;
  res.json(safe);
});

router.get('/:skillId/agents/:agentId/:slot', (req: Request, res: Response) => {
  const { skillId, agentId, slot } = req.params as {
    skillId: string;
    agentId: string;
    slot: string;
  };
  if (!VALID_SKILL_ID_RE.test(skillId) || !VALID_AGENT_ID_RE.test(agentId)) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  if (!VALID_SLOTS.has(slot as SkillSlot)) {
    res.status(400).json({ error: 'invalid slot' });
    return;
  }
  const skill = SKILLS[skillId];
  if (!skill || !skill.team) {
    res.status(404).json({ error: 'skill or team not found' });
    return;
  }
  const agent = getAgent(skill.team, agentId);
  if (!agent) {
    res.status(404).json({ error: 'agent not found in team' });
    return;
  }
  const anchor = agent.anchors[slot as SkillSlot];
  const body = getAnchorBody(skill.team, agentId, slot as SkillSlot);
  if (!body) {
    res.status(404).json({ error: 'anchor body unavailable' });
    return;
  }
  res.json({
    ref: anchor.ref,
    tokens: anchor.tokens,
    cached: anchor.cached,
    body: body.body,
  });
});

/**
 * POST /api/skills/reload — re-scan FS and merge without restarting server.
 *
 * Returns 200 even when individual SKILL.md files fail to parse; per-file
 * errors are surfaced in `errors[]` so callers can inspect them. (AC4)
 *
 * 2026-05-11 review P1-2: in-flight guard 防同时多次 reload 互相竞争 + DoS。
 * Express 单线程，但同步 fs.readdirSync 万级目录会阻塞 event loop；guard 让
 * 第二个并发请求拿 429 (Too Many Requests) 而不是排队等。
 */
let reloadInFlight = false;
router.post('/reload', (_req: Request, res: Response) => {
  if (reloadInFlight) {
    res.status(429).json({ error: 'reload already in flight' });
    return;
  }
  reloadInFlight = true;
  try {
    const result = reloadSkills();
    res.json(result);
  } finally {
    reloadInFlight = false;
  }
});

/**
 * POST /api/skills/save — write a SKILL.md from the editor to disk.
 *
 * Story 15.28. The Editor's "Save as Skill" button POSTs the rendered
 * workflow YAML here; we materialise it into `.shadowflow/skills/<name>/SKILL.md`
 * with a frontmatter block compatible with skill-loader (15.10) so the next
 * `/api/skills/reload` (or server restart) picks it up automatically.
 *
 * Body shape (also accepts `system_prompt` as alias for blueprint_yaml so
 * the Story 15.28 spec body and the legacy hint in the spec both work):
 *   {
 *     name: string,                  // required, kebab-case
 *     blueprint_yaml?: string,       // required (or system_prompt)
 *     system_prompt?: string,        // alias for blueprint_yaml
 *     description?: string,
 *     mode?: 'blueprint' | 'prototype' | 'report',
 *     preview_type?: 'yaml' | 'html' | 'markdown',
 *   }
 */
router.post('/save', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    name?: unknown;
    blueprint_yaml?: unknown;
    system_prompt?: unknown;
    description?: unknown;
    mode?: unknown;
    preview_type?: unknown;
  };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || !VALID_SKILL_ID_RE.test(name)) {
    res.status(400).json({
      error: { code: 'INVALID_NAME', message: 'name must match /^[a-z0-9][a-z0-9_-]{0,63}$/i (kebab-case, no path traversal)' },
    });
    return;
  }

  // 2026-05-11 review P1-1 (15.28, OpenDesign 模式): 显式拒绝与 hardcoded skill 同名，
  // 否则 reload 后会静默替换内置 skill (skills.ts:191 注释 FS overrides hardcoded)。
  // 用户体验：得到 409 + 清晰提示，而非"保存成功但行为变化"。
  if (Object.prototype.hasOwnProperty.call(HARDCODED_SKILLS, name)) {
    res.status(409).json({
      error: {
        code: 'NAME_CONFLICT',
        message: `name "${name}" conflicts with a built-in skill — choose another (e.g. "${name}-custom")`,
      },
    });
    return;
  }

  const yaml =
    typeof body.blueprint_yaml === 'string' && body.blueprint_yaml.length > 0
      ? body.blueprint_yaml
      : typeof body.system_prompt === 'string' && body.system_prompt.length > 0
      ? body.system_prompt
      : '';
  if (!yaml) {
    res.status(400).json({
      error: { code: 'INVALID_PROMPT', message: 'blueprint_yaml (or system_prompt) is required' },
    });
    return;
  }

  const description =
    typeof body.description === 'string' && body.description.length > 0
      ? body.description
      : '从 Editor 导出';

  // 2026-05-11 review P1-2 (15.28): mode/preview_type 服务端二次白名单校验。
  // 否则用户传 mode:"evil" 写盘成功 (201)，但下次 reloadSkills() loader 拒绝
  // → GET /skills 看不到该 skill — UX 不一致 + frontmatter injection 隐患。
  // OpenDesign 模式: fail-fast at write boundary。
  const VALID_MODES = ['blueprint', 'prototype', 'report'];
  const VALID_PREVIEWS = ['yaml', 'html', 'markdown'];
  const mode =
    typeof body.mode === 'string' && VALID_MODES.includes(body.mode)
      ? body.mode
      : 'blueprint';
  const previewType =
    typeof body.preview_type === 'string' && VALID_PREVIEWS.includes(body.preview_type)
      ? body.preview_type
      : 'yaml';

  // Path-traversal hardening: resolve `dir` and verify it is still under the
  // intended skills root. The regex above already prevents `..` but defense
  // in depth is cheap.
  const skillsRoot = path.resolve(process.cwd(), '.shadowflow', 'skills');
  const dir = path.resolve(skillsRoot, name);
  if (!dir.startsWith(skillsRoot + path.sep) && dir !== skillsRoot) {
    res.status(400).json({ error: { code: 'INVALID_PATH', message: 'resolved path escapes skills root' } });
    return;
  }

  try {
    fs.mkdirSync(dir, { recursive: true });

    // YAML strings are dumped literally inside frontmatter values. Escape any
    // newlines / colons by quoting the description; everything else is single-
    // line so plain `key: value` is safe.
    const safeDescription = JSON.stringify(description);
    const md = `---
skill_id: ${name}
name: ${name}
description: ${safeDescription}
mode: ${mode}
preview_type: ${previewType}
source: editor-export
created_at: ${new Date().toISOString()}
---

${yaml}
`;
    fs.writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf-8');

    // Hot-reload registry so the skill is immediately available without
    // needing a separate /reload call from the client.
    try {
      reloadSkills();
    } catch (err) {
      console.warn('[skills:save] reloadSkills() after write failed:', err);
    }

    res.status(201).json({
      data: { skill_id: name, name, mode, preview_type: previewType },
      meta: {},
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error('[skills:save] write failed:', err);
    res.status(500).json({ error: { code: 'WRITE_FAILED', message: msg } });
  }
});

/**
 * POST /api/skills/ingest — fetch + probe + register a user-supplied skill.
 *
 * Body:
 *   { source: string, forced_id?: string }
 *
 * source is a URL (github repo / raw markdown / arbitrary http link) or
 * pasted markdown text. The handler clones / downloads it into a cache
 * directory, probes the structure schema-lessly, then materializes it under
 * .shadowflow/skills/<id>/references/ so the existing side-files loader picks
 * it up on the next run-session.
 *
 * Returns 201 on first install, 200 on re-install (same source string).
 */
router.post('/ingest', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { source?: unknown; forced_id?: unknown };
  const source = typeof body.source === 'string' ? body.source.trim() : '';
  if (!source) {
    res.status(400).json({
      error: { code: 'INVALID_SOURCE', message: 'source must be a non-empty string (URL or pasted text)' },
    });
    return;
  }
  if (source.length > 200_000) {
    res.status(400).json({
      error: { code: 'SOURCE_TOO_LARGE', message: 'source string capped at 200KB' },
    });
    return;
  }
  const forcedId =
    typeof body.forced_id === 'string' && body.forced_id.trim().length > 0
      ? body.forced_id.trim()
      : undefined;
  if (forcedId && !VALID_SKILL_ID_RE.test(forcedId)) {
    res.status(400).json({
      error: { code: 'INVALID_FORCED_ID', message: 'forced_id must match /^[a-z0-9][a-z0-9_-]{0,63}$/i' },
    });
    return;
  }

  try {
    const result = await ingestSkill(source, forcedId);
    // Refresh the SKILLS registry so the new skill is usable immediately.
    try { reloadSkills(); } catch (err) {
      console.warn('[skills:ingest] reloadSkills() after register failed:', err);
    }
    res.status(result.is_new ? 201 : 200).json({
      data: {
        skill_id: result.id,
        name: result.name,
        is_new: result.is_new,
        source_label: result.source_label,
        counts: result.probe.counts,
        truncated: result.probe.truncated,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error('[skills:ingest] failed:', err);
    res.status(502).json({ error: { code: 'INGEST_FAILED', message: msg } });
  }
});

/**
 * GET /api/skills/installed — list user-ingested skills (for the @skill picker).
 *
 * Read straight from .shadowflow/skills/.installed.json. Hardcoded skills are
 * NOT included here — those come from GET /api/skills.
 */
router.get('/installed', (_req: Request, res: Response) => {
  const items = listInstalled();
  // S6 — also surface team-backed FS skills (paper-review, bmad, …) in the
  // picker so users can pick the v3 synthesizer path. Hardcoded skills and
  // FS skills without a team are intentionally excluded — they go through
  // the LLM assembler and are reachable via the templates flow.
  const teamSkills = Object.entries(SKILLS)
    .filter(([, s]) => !!s.team)
    .map(([skill_id, s]) => ({
      id: skill_id,
      name: s.name,
      source: 'builtin',
      source_hash: '',
      installed_at: '',
      counts: { agents: s.team!.agents.length, edges: s.team!.edges.length },
    }));
  // Local-installed entries win on id collision so user-edited skills keep
  // overriding the bundled demo.
  const seen = new Set(items.map((x) => x.id));
  const merged = [...items, ...teamSkills.filter((t) => !seen.has(t.id))];
  res.json({ data: merged });
});

/**
 * POST /api/skills/preview — parse a candidate source (URL or text) without
 * touching the filesystem. Used by the chat-input URL chip to ask "what does
 * this look like?" before the user clicks 装.
 */
router.post('/preview', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { source?: unknown };
  const source = typeof body.source === 'string' ? body.source.trim() : '';
  if (!source) {
    res.status(400).json({ error: { code: 'INVALID_SOURCE', message: 'source required' } });
    return;
  }
  try {
    const parsed = parseSource(source);
    res.json({
      data: {
        kind: parsed.kind,
        inferred_name: parsed.inferred_name,
        subpath: parsed.subpath,
      },
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    res.status(400).json({ error: { code: 'INVALID_SOURCE', message: msg } });
  }
});

export default router;

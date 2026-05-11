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
import { SKILLS, reloadSkills } from '../skills';

const router = Router();

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
  }));
  res.json(list);
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
  const mode = typeof body.mode === 'string' ? body.mode : 'blueprint';
  const previewType = typeof body.preview_type === 'string' ? body.preview_type : 'yaml';

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

export default router;

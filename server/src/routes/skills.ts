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

import { Router, Request, Response } from 'express';
import { SKILLS, reloadSkills } from '../skills';

const router = Router();

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

export default router;

/**
 * skill-loader.ts — FS-based Skill loader (Story 15.10)
 *
 * Scans `.shadowflow/skills/<id>/SKILL.md` files at startup or on
 * `POST /api/skills/reload`, parses their YAML frontmatter via gray-matter,
 * and produces SkillDefinition objects that merge into the in-memory
 * registry alongside the hardcoded built-ins (15.1 / 15.2).
 *
 * Behaviour contract (AC1-AC6):
 * - Returns `{ loaded, errors, overrides }`. NEVER throws fatal.
 * - Empty / missing dir → empty result, no error.
 * - Missing required frontmatter (`name` / `description`) → skip + warn.
 * - Invalid YAML / unreadable file → skip + warn, other skills unaffected.
 * - `overrides` lists ids that exist in BOTH FS and the hardcoded baseline,
 *   so the caller can log "override hardcoded skill: <id>" (AC3).
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { SkillDefinition, SkillMode, PreviewType } from '../skills';
import { loadTeam } from '../lib/skill-yaml';

const DEFAULT_SKILLS_DIR = path.join(process.cwd(), '.shadowflow', 'skills');

export interface SkillLoadResult {
  loaded: Record<string, SkillDefinition>;
  errors: Array<{ id: string; message: string }>;
  overrides: string[];
}

const REQUIRED_FIELDS = ['name', 'description'] as const;

// 2026-05-11 review P1-1 (OpenDesign 模式): 严格 ID 字符集白名单。
// 防止控制字符 / unicode RTL / `\n` 等通过目录名传到 API JSON / 日志。
// kernel 不会产生字面 `..` 名，但 symlink/手动创建可绕过。
const VALID_SKILL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// 2026-05-11 review P1-2: cap entries.length 防 fs.readdirSync 万级目录 DoS。
const MAX_ENTRIES = 200;

const VALID_MODES: ReadonlySet<SkillMode> = new Set(['blueprint', 'prototype', 'report']);
const VALID_PREVIEW_TYPES: ReadonlySet<PreviewType> = new Set(['yaml', 'html', 'markdown']);

/**
 * Scan `.shadowflow/skills/` for SKILL.md files and parse them.
 *
 * @param hardcodedIds  ids of built-in skills (used to flag overrides)
 * @param skillsDirOverride  test-only: redirect the scan target
 */
export function loadFsSkills(
  hardcodedIds: ReadonlyArray<string> = [],
  skillsDirOverride?: string,
): SkillLoadResult {
  const skillsDir = skillsDirOverride ?? DEFAULT_SKILLS_DIR;
  const loaded: Record<string, SkillDefinition> = {};
  const errors: Array<{ id: string; message: string }> = [];
  const overrides: string[] = [];

  if (!fs.existsSync(skillsDir)) {
    return { loaded, errors, overrides };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch (err) {
    const msg = `cannot read skills dir: ${(err as Error).message}`;
    errors.push({ id: '<root>', message: msg });
    console.warn(`[skill-loader] ${msg}`);
    return { loaded, errors, overrides };
  }

  // P1-2: cap iterations even if directory has 10k+ entries.
  if (entries.length > MAX_ENTRIES) {
    console.warn(
      `[skill-loader] ${entries.length} entries in ${skillsDir} — capped at ${MAX_ENTRIES}`,
    );
    entries = entries.slice(0, MAX_ENTRIES);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;

    // Skip dotted/hidden entries (e.g. .gitkeep, .DS_Store dirs)
    if (id.startsWith('.')) continue;

    // P1-1: reject any id that doesn't match the strict whitelist (OpenDesign 模式)
    if (!VALID_SKILL_ID_RE.test(id)) {
      const msg = `invalid id "${id}" (must match ${VALID_SKILL_ID_RE})`;
      errors.push({ id, message: msg });
      console.warn(`[skill-loader] skip ${id}: ${msg}`);
      continue;
    }

    const skillMdPath = path.join(skillsDir, id, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    let raw: string;
    try {
      raw = fs.readFileSync(skillMdPath, 'utf-8');
    } catch (err) {
      const msg = `read failed: ${(err as Error).message}`;
      errors.push({ id, message: msg });
      console.warn(`[skill-loader] skip ${id}: ${msg}`);
      continue;
    }

    if (!raw.trim()) {
      errors.push({ id, message: 'empty SKILL.md' });
      console.warn(`[skill-loader] skip ${id}: empty SKILL.md`);
      continue;
    }

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (err) {
      const msg = `invalid frontmatter: ${(err as Error).message}`;
      errors.push({ id, message: msg });
      console.warn(`[skill-loader] skip ${id}: ${msg}`);
      continue;
    }

    const fm = (parsed.data ?? {}) as Record<string, unknown>;

    const missing = REQUIRED_FIELDS.find(
      (f) => typeof fm[f] !== 'string' || !(fm[f] as string).trim(),
    );
    if (missing) {
      const msg = `missing required frontmatter field ${missing}`;
      errors.push({ id, message: msg });
      console.warn(`[skill-loader] skip ${id}: ${msg}`);
      continue;
    }

    // Optional skill_id self-check: if author wrote `skill_id`, it must match dir
    if (typeof fm.skill_id === 'string' && fm.skill_id.trim() && fm.skill_id !== id) {
      const msg = `skill_id "${fm.skill_id}" does not match directory name "${id}"`;
      errors.push({ id, message: msg });
      console.warn(`[skill-loader] skip ${id}: ${msg}`);
      continue;
    }

    // Validate enum-shaped optional fields, fall back to defaults if invalid
    const rawMode = typeof fm.mode === 'string' ? (fm.mode.trim() as SkillMode) : undefined;
    const mode: SkillMode = rawMode && VALID_MODES.has(rawMode) ? rawMode : 'prototype';

    const rawPreview =
      typeof fm.preview_type === 'string'
        ? (fm.preview_type.trim() as PreviewType)
        : undefined;
    const preview_type: PreviewType =
      rawPreview && VALID_PREVIEW_TYPES.has(rawPreview) ? rawPreview : 'html';

    // Story 15.19 v2 — optional `executor` selector. We accept any string and
    // let the dispatcher validate; this keeps registry growth data-driven.
    const executor =
      typeof fm.executor === 'string' && fm.executor.trim().length > 0
        ? fm.executor.trim()
        : undefined;

    const skill: SkillDefinition = {
      name: String(fm.name).trim(),
      description: String(fm.description).trim(),
      mode,
      preview_type,
      platform: typeof fm.platform === 'string' ? fm.platform : 'web',
      scenario: typeof fm.scenario === 'string' ? fm.scenario : '',
      fidelity: typeof fm.fidelity === 'string' ? fm.fidelity : 'high',
      example_prompt: typeof fm.example_prompt === 'string' ? fm.example_prompt : '',
      system_prompt: parsed.content ?? '',
      executor,
    };

    // S6.0 — opportunistically attach the structured team (if the skill ships one).
    // Per-skill load failures are non-fatal: we keep the skill itself loaded with
    // its system_prompt path intact so older flows continue to work.
    try {
      const teamResult = loadTeam(path.join(skillsDir, id));
      if (teamResult.team) {
        skill.team = teamResult.team;
      }
      for (const e of teamResult.errors) {
        errors.push({ id, message: `team.skill.yaml: ${e}` });
        console.warn(`[skill-loader] ${id} team load: ${e}`);
      }
    } catch (err) {
      // skill-yaml itself shouldn't throw, but defend anyway
      console.warn(`[skill-loader] ${id} team load threw: ${(err as Error).message}`);
    }

    if (hardcodedIds.includes(id)) {
      overrides.push(id);
    }
    loaded[id] = skill;
  }

  if (Object.keys(loaded).length > 0) {
    console.log(
      `[skill-loader] loaded ${Object.keys(loaded).length} skill(s) from ${skillsDir}`,
    );
  }
  for (const id of overrides) {
    console.log(`[skill-loader] override hardcoded skill: ${id}`);
  }

  return { loaded, errors, overrides };
}

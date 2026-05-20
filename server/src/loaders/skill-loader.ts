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
import { loadTeam as loadLegacyTeam } from '../lib/skill-yaml';
import { loadTeam as loadGlobalTeam } from '../lib/team-yaml';

const DEFAULT_SKILLS_DIR = path.join(process.cwd(), '.shadowflow', 'skills');
// S6.4 — when the Node server is launched from the `server/` subdir
// (`npm run dev:server`), `process.cwd()` resolves to that subdir, so
// `.shadowflow/skills` lands at `server/.shadowflow/skills`. The
// source-tracked demo bundles live at the project root's `.shadowflow/skills`
// instead. We scan both locations and merge — local (server-rooted) entries
// override root entries when both exist with the same id, so the existing
// runtime-state convention (editor-export-demo etc.) keeps working.
const ROOT_SKILLS_DIR = path.join(process.cwd(), '..', '.shadowflow', 'skills');

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
 * Two-dir scan strategy (S6.4): we scan the project root's
 * `.shadowflow/skills/` first (where the source-tracked demo bundles live)
 * and then the server-local `.shadowflow/skills/` (runtime user content +
 * legacy test skills), merging the results. Local entries win on id
 * collision so the long-standing `editor-export-demo` etc. keep their
 * existing behaviour.
 *
 * @param hardcodedIds  ids of built-in skills (used to flag overrides)
 * @param skillsDirOverride  test-only: redirect the scan target. When set,
 *                           only this single dir is scanned (no merging).
 */
export function loadFsSkills(
  hardcodedIds: ReadonlyArray<string> = [],
  skillsDirOverride?: string,
): SkillLoadResult {
  const loaded: Record<string, SkillDefinition> = {};
  const errors: Array<{ id: string; message: string }> = [];
  const overrides: string[] = [];

  const dirs = skillsDirOverride
    ? [skillsDirOverride]
    : [ROOT_SKILLS_DIR, DEFAULT_SKILLS_DIR].filter(fs.existsSync);

  if (dirs.length === 0) {
    return { loaded, errors, overrides };
  }
  // Inline the single-dir scan body via a labelled loop so we can re-run
  // for each candidate dir while keeping the existing per-file error /
  // override book-keeping logic untouched.
  for (const skillsDir of dirs) {
    scanOneDir(skillsDir, hardcodedIds, loaded, errors, overrides);
  }
  return { loaded, errors, overrides };
}

function scanOneDir(
  skillsDir: string,
  hardcodedIds: ReadonlyArray<string>,
  loaded: Record<string, SkillDefinition>,
  errors: Array<{ id: string; message: string }>,
  overrides: string[],
): void {
  if (!fs.existsSync(skillsDir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch (err) {
    const msg = `cannot read skills dir: ${(err as Error).message}`;
    errors.push({ id: '<root>', message: msg });
    console.warn(`[skill-loader] ${msg}`);
    return;
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

    // S6.0 + S0.5 — attach the structured team. Two paths:
    //   1. NEW (S0.5): SKILL.md frontmatter has `team_ref: <team-id>` →
    //      resolve via `.shadowflow/teams/<team-id>.team.yaml` (global lib)
    //   2. LEGACY (S6.0): skill dir has `team.skill.yaml` → resolve locally
    //
    // Path 1 wins when both are present. Per-skill load failures are non-fatal:
    // the skill itself stays loaded so older system_prompt flows still work.
    try {
      const teamRef = typeof fm.team_ref === 'string' ? fm.team_ref.trim() : '';
      if (teamRef) {
        // S0.5 path
        const result = loadGlobalTeam(teamRef);
        if (result.team) {
          // Convert TeamDefV1 → legacy TeamDef shape expected by SkillDefinition.team
          skill.team = {
            name: result.team.name,
            mode: result.team.mode,
            policy: result.team.policy,
            retry: result.team.retry,
            agents: result.resolvedAgents,
            edges: result.team.edges_v1.map(e => ({ from: e.from, to: e.to })),
            loaded_at: result.team.loaded_at,
            source_dir: result.team.source_dir,
          };
        }
        for (const e of result.errors) {
          errors.push({ id, message: `team_ref(${teamRef}): ${e}` });
          console.warn(`[skill-loader] ${id} team_ref(${teamRef}): ${e}`);
        }
      } else {
        // Legacy path
        const teamResult = loadLegacyTeam(path.join(skillsDir, id));
        if (teamResult.team) {
          skill.team = teamResult.team;
        }
        for (const e of teamResult.errors) {
          errors.push({ id, message: `team.skill.yaml: ${e}` });
          console.warn(`[skill-loader] ${id} team load: ${e}`);
        }
      }
    } catch (err) {
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
}

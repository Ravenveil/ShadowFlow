/**
 * read-skill.ts — builtin `read_skill` tool (2026-06-01).
 *
 * Lets the assembly agent fetch a target skill's *real* blueprint at runtime
 * when it wasn't already injected into the system prompt. This is the live
 * recovery path behind the `@skill:<id>` flow: if the requested skill isn't in
 * the compiled SKILLS registry, the LLM can still pull its verbatim SKILL.md +
 * team/workflow yaml + agent personas off disk (or off the web) and instantiate
 * it faithfully — instead of silently hallucinating a team.
 *
 * Why this tool is SELF-CONTAINED (not a `BuiltinToolExecutor`)
 * ────────────────────────────────────────────────────────────
 * The 9 ALS-style builtins (read_file/fetch_url/…) need a per-turn workspace
 * scope set via `runWithBuiltinContext`, which the ConversationRuntime does not
 * currently wire. `read_skill` deliberately needs NO workspace context — it
 * resolves skill refs against `.shadowflow/skills` / `.shadowflow/teams` (repo
 * root, discovered relative to `process.cwd()`), reads files directly, and
 * fetches https URLs itself. So it implements the plain `ToolExecutor`
 * (`{ execute(input, signal) }`) shape and is registered directly via
 * `registerToolExecutor('read_skill', readSkillToolExecutor)` — making it the
 * one tool in the assembly tool-loop that actually executes today.
 *
 * Resolution order for `ref`:
 *   1. `https://…` (or `http://`, upgraded-only via the https guard) → fetch.
 *   2. An existing local path → directory (bundled as a skill) or single file.
 *   3. An installed skill id → `.shadowflow/skills/<id>/` and
 *      `.shadowflow/skills/<id>/references/`, then `.shadowflow/teams/<id>.team.yaml`.
 *   4. None matched → `isError` with a clear "could not resolve" message so the
 *      LLM tells the user "skill not found" rather than inventing a blueprint.
 */

import fs from 'fs';
import path from 'path';
import type { ToolSpec } from '../../tool-spec';
import type { ToolExecutor, ToolExecResult } from '../../tool-runner';
import { readSkill } from '../../../skill-reader';

export const readSkillTool: ToolSpec = {
  name: 'read_skill',
  description:
    'Resolve and read a ShadowFlow skill blueprint by reference, returning its verbatim content ' +
    'so you can instantiate the team faithfully. `ref` may be: (1) an installed skill id ' +
    '(resolved under .shadowflow/skills/<id>/ and its references/), (2) an absolute or relative ' +
    'local path to a skill directory or a single file, or (3) a public https:// URL (e.g. a raw ' +
    'SKILL.md / team yaml). Use this whenever the target skill blueprint was NOT already present ' +
    'in your context. If it returns an error, the skill genuinely could not be found — tell the ' +
    'user it was not found instead of fabricating a team.',
  input_schema: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Skill id (e.g. "paper-review"), local path, or https:// URL.',
      },
    },
    required: ['ref'],
    additionalProperties: false,
  },
  source: 'base',
};

/** Cap bundled/fetched content so a huge skill can't blow the LLM context. */
const MAX_SKILL_BYTES = 200_000;

function cap(text: string): { content: string; truncated: boolean } {
  if (text.length <= MAX_SKILL_BYTES) return { content: text, truncated: false };
  return { content: text.slice(0, MAX_SKILL_BYTES), truncated: true };
}

/** Repo-root candidates: the Node server runs from `server/`, so `.shadowflow`
 *  lives at `../`; we also try cwd directly for flatter layouts / tests. */
function repoRoots(): string[] {
  const cwd = process.cwd();
  return [path.join(cwd, '..'), cwd];
}

/** Bundle a skill directory into one verbatim text blob (SKILL.md + yaml + agents). */
async function bundleSkillDir(dir: string, refId: string): Promise<string | null> {
  try {
    const out = await readSkill(dir, { skill_id: refId });
    const parts: string[] = [];
    if (out.raw_skill_md) parts.push(`=== SKILL.md ===\n${out.raw_skill_md}`);
    for (const w of out.workflow_files) parts.push(`=== workflow: ${w.path} ===\n${w.raw}`);
    for (const a of out.agent_files) parts.push(`=== agent: ${a.path} ===\n${a.raw}`);
    if (parts.length === 0) return null;
    return parts.join('\n\n');
  } catch {
    return null;
  }
}

// ── URL fetch (https-only, private-host blocked, size-capped) ────────────────

const PRIVATE_HOST_RE = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./,
  /^::1$/, /^fe80:/i, /^fc00:/i, /^fd00:/i,
];

function isBlockedHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  return PRIVATE_HOST_RE.some((re) => re.test(bare));
}

async function fetchSkillUrl(rawUrl: string, signal: AbortSignal): Promise<ToolExecResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { output: { error: `read_skill: invalid URL: ${rawUrl}` }, isError: true };
  }
  if (url.protocol !== 'https:') {
    return { output: { error: `read_skill: only https:// URLs are allowed (got ${url.protocol})` }, isError: true };
  }
  if (isBlockedHost(url.hostname)) {
    return { output: { error: `read_skill: host ${url.hostname} is private/loopback and blocked` }, isError: true };
  }
  const timeout = AbortSignal.timeout(30_000);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    const res = await fetch(url, { method: 'GET', signal: combined });
    const buf = Buffer.from(await res.arrayBuffer());
    const { content, truncated } = cap(buf.toString('utf8'));
    return {
      output: { ref: rawUrl, source: 'url', status: res.status, truncated, content },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: { error: `read_skill: fetch failed for ${rawUrl}: ${msg}` }, isError: true };
  }
}

export const readSkillToolExecutor: ToolExecutor = {
  async execute(input: unknown, signal: AbortSignal): Promise<ToolExecResult> {
    const ref =
      input && typeof input === 'object' && typeof (input as { ref?: unknown }).ref === 'string'
        ? (input as { ref: string }).ref.trim()
        : '';
    if (!ref) {
      return { output: { error: 'read_skill: input must be { ref: string }' }, isError: true };
    }

    // 1. URL
    if (/^https?:\/\//i.test(ref)) {
      return fetchSkillUrl(ref, signal);
    }

    // 2. Existing local path (directory → skill bundle; file → raw text).
    try {
      if (fs.existsSync(ref)) {
        const st = fs.statSync(ref);
        if (st.isDirectory()) {
          const bundled = await bundleSkillDir(ref, path.basename(ref));
          if (bundled) {
            const { content, truncated } = cap(bundled);
            return { output: { ref, source: 'path-dir', truncated, content } };
          }
        } else if (st.isFile()) {
          const { content, truncated } = cap(fs.readFileSync(ref, 'utf-8'));
          return { output: { ref, source: 'path-file', truncated, content } };
        }
      }
    } catch {
      /* fall through to id resolution */
    }

    // 3. Installed skill id → .shadowflow/skills/<id>[/references], then teams yaml.
    for (const root of repoRoots()) {
      for (const sub of [
        path.join(root, '.shadowflow', 'skills', ref),
        path.join(root, '.shadowflow', 'skills', ref, 'references'),
      ]) {
        if (fs.existsSync(sub)) {
          const bundled = await bundleSkillDir(sub, ref);
          if (bundled) {
            const { content, truncated } = cap(bundled);
            return { output: { ref, source: 'skill-id', skill_id: ref, truncated, content } };
          }
        }
      }
      const teamYaml = path.join(root, '.shadowflow', 'teams', `${ref}.team.yaml`);
      try {
        if (fs.existsSync(teamYaml)) {
          const { content, truncated } = cap(fs.readFileSync(teamYaml, 'utf-8'));
          return { output: { ref, source: 'team-yaml', truncated, content } };
        }
      } catch {
        /* keep trying other roots */
      }
    }

    return {
      output: {
        error:
          `read_skill: could not resolve '${ref}' as a skill id, local path, or https URL. ` +
          `Tried .shadowflow/skills/${ref}[/references] and .shadowflow/teams/${ref}.team.yaml. ` +
          `Tell the user the skill was not found — do not fabricate a blueprint.`,
      },
      isError: true,
    };
  },
};

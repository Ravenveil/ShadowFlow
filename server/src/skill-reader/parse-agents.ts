/**
 * skill-reader/parse-agents.ts — collect verbatim agent files from a skill dir.
 *
 * Two input shapes are supported, picked up in order:
 *
 *   1. **Standard layout**: `<skillDir>/agents/*.md|yaml|yml`. The Claude Code
 *      / paper-review-style skill convention. Each file becomes one
 *      `AgentFile` with raw bytes preserved and `.md` frontmatter parsed.
 *
 *   2. **BMAD-METHOD layout**: `<skillDir>/bmad-modules.yaml` is a registry of
 *      sub-modules (each lives in its own GitHub repo). For PR-A purposes
 *      every entry under `modules.*` is treated as an "agent-shaped" record
 *      so PR-C's compiler has something to chew on. We synthesize an
 *      `agents/<id>.synthesized.md` entry per module with the registry
 *      metadata serialized as YAML frontmatter + a short body.
 *
 *      Note: the spec text mentions `modules.*.agents[]` but the real-world
 *      `bmad-modules.yaml` is a flat module registry without a nested
 *      `agents` array — it lists 6 BMAD sub-modules. We synthesize one
 *      agent_file per module entry, which satisfies the "BMAD returns ≥1
 *      agent_file" acceptance and gives PR-C a concrete handle on the BMAD
 *      structure. (Implementer decision, noted in commit body.)
 *
 *   3. **Missing both**: returns `[]`. No throws — empty skill dirs and
 *      unusual layouts are first-class cases.
 *
 * `frontmatter` follows the convention in `types.ts`: `gray-matter` for `.md`,
 * `null` for `.yaml`/`.yml` (PR-C parses YAML directly when needed). The
 * synthesized BMAD entries are written as `.md` with frontmatter so they
 * round-trip through the same code path.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import type { AgentFile } from './types';

const AGENT_EXTS = new Set(['.md', '.yaml', '.yml']);

/** POSIX-normalize a path so the content hash is stable across Windows / Linux. */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Parse `<skillDir>/agents/*` into AgentFile entries. Files outside the
 * standard extensions are skipped. Returns `[]` when the dir is missing.
 */
function readStandardAgentsDir(skillDir: string): AgentFile[] {
  const agentsDir = path.join(skillDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: AgentFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.startsWith('.')) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!AGENT_EXTS.has(ext)) continue;

    const abs = path.join(agentsDir, e.name);
    let raw: string;
    try {
      raw = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }

    let frontmatter: Record<string, unknown> | null = null;
    if (ext === '.md') {
      try {
        const parsed = matter(raw);
        if (parsed.data && Object.keys(parsed.data).length > 0) {
          frontmatter = parsed.data as Record<string, unknown>;
        }
      } catch {
        // malformed frontmatter → keep raw, drop frontmatter
      }
    }

    out.push({
      path: toPosix(path.join('agents', e.name)),
      raw,
      frontmatter,
    });
  }

  // Sort for deterministic hash input.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/**
 * If `<skillDir>/bmad-modules.yaml` exists, synthesize one AgentFile per
 * module entry. Each synthetic file mirrors the standard `agents/*.md` shape
 * (frontmatter + body) so PR-C's compiler can treat them uniformly.
 *
 * The synthesized `raw` content is deterministic for a given module entry —
 * a regenerated readSkill on the same skillDir must produce a byte-equal
 * synthesized file so the content_hash stays stable. We rely on `js-yaml`'s
 * default block style with sortKeys=false (the spec says insertion order).
 */
function synthesizeBmadModules(skillDir: string): AgentFile[] {
  const file = path.join(skillDir, 'bmad-modules.yaml');
  if (!fs.existsSync(file)) return [];

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
  }

  let doc: unknown;
  try {
    doc = yaml.load(raw);
  } catch {
    return [];
  }

  if (!doc || typeof doc !== 'object') return [];
  const modules = (doc as { modules?: Record<string, unknown> }).modules;
  if (!modules || typeof modules !== 'object') return [];

  const out: AgentFile[] = [];
  // Sort module ids for deterministic emission — critical for hash stability.
  const moduleIds = Object.keys(modules).sort();
  for (const id of moduleIds) {
    const entry = (modules as Record<string, unknown>)[id];
    if (!entry || typeof entry !== 'object') continue;
    const meta = entry as Record<string, unknown>;

    // Frontmatter mirrors the YAML entry verbatim so PR-C sees the same data.
    const frontmatter: Record<string, unknown> = {
      id,
      derived_from: 'bmad-modules.yaml',
      ...meta,
    };

    // Body is a short prose summary the LLM can latch onto.
    const fmYaml = yaml.dump(frontmatter, { sortKeys: false, lineWidth: 1000 }).trimEnd();
    const description = typeof meta.description === 'string' ? meta.description : '';
    const name = typeof meta.name === 'string' ? meta.name : id;
    const body =
      `# ${name}\n\n` +
      `${description}\n\n` +
      `Synthesized from \`bmad-modules.yaml\` registry entry \`${id}\`. ` +
      `This module lives in a separate repository; the registry metadata is ` +
      `mirrored here so the SkillCompiler can treat each BMAD module as one ` +
      `"agent-shaped" input without resolving the upstream repo.\n`;

    const synthesizedRaw = `---\n${fmYaml}\n---\n\n${body}`;
    out.push({
      path: toPosix(`agents/${id}.synthesized.md`),
      raw: synthesizedRaw,
      frontmatter,
    });
  }

  return out;
}

/**
 * Public entry: collect all agent-shaped files from a skill directory.
 *
 * Order: standard `agents/*` first, then synthesized BMAD entries. Each
 * sub-array is internally sorted; the merged output is re-sorted at the call
 * site (`readSkill` → `computeContentHash` sorts again) so the order here is
 * informational only.
 */
export async function parseAgents(skillDir: string): Promise<AgentFile[]> {
  const standard = readStandardAgentsDir(skillDir);
  const synthesized = synthesizeBmadModules(skillDir);
  return [...standard, ...synthesized];
}

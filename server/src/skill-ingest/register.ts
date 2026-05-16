/**
 * skill-ingest/register.ts — copy a fetched + probed skill into the user's
 * project skill library at .shadowflow/skills/<id>/.
 *
 * Layout written:
 *   .shadowflow/skills/<id>/
 *     SKILL.md            ← synthetic header (frontmatter: name/source/installed_at)
 *     probe.json          ← probe result (for inspector / @skill picker)
 *     references/<...>    ← raw skill files copied verbatim, paths preserved
 *
 * `references/` matches the existing loadSkillSideFiles() layer-7 convention,
 * so once registered the skill is auto-injected by the existing prompt
 * assembly pipeline — no new layer needed.
 */

import fs from 'fs';
import path from 'path';
import type { FetchResult } from './fetch';
import type { ProbeResult } from './probe';

const SKILLS_ROOT = path.join(process.cwd(), '.shadowflow', 'skills');
const REGISTRY_FILE = path.join(SKILLS_ROOT, '.installed.json');

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface InstalledSkill {
  id: string;
  name: string;
  source: string;          // original URL / "pasted-text"
  source_hash: string;
  installed_at: string;
  counts: Record<string, number>;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'skill';
}

function resolveId(inferred: string, sourceHash: string): string {
  const base = slugify(inferred);
  const candidate = base || `skill-${sourceHash.slice(0, 6)}`;
  if (!ID_RE.test(candidate)) return `skill-${sourceHash.slice(0, 6)}`;
  return candidate;
}

function copyReferences(srcDir: string, dstDir: string, subpath?: string): void {
  const sourceRoot = subpath ? path.join(srcDir, subpath) : srcDir;
  if (!fs.existsSync(sourceRoot)) return;

  const walk = (rel: string): void => {
    const abs = path.join(sourceRoot, rel);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      const entryRel = rel ? `${rel}/${e.name}` : e.name;
      const entryAbs = path.join(abs, e.name);

      let lst: fs.Stats;
      try { lst = fs.lstatSync(entryAbs); } catch { continue; }
      if (lst.isSymbolicLink()) continue;

      if (e.isDirectory()) {
        walk(entryRel);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!['.md', '.yaml', '.yml', '.json', '.txt'].includes(ext)) continue;

      const dest = path.join(dstDir, entryRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        fs.copyFileSync(entryAbs, dest);
      } catch {
        // skip individual file failures
      }
    }
  };

  walk('');
}

export interface RegisterOptions {
  fetched: FetchResult;
  probe: ProbeResult;
  /** override the default inferred id (e.g. user-supplied name) */
  forced_id?: string;
}

export interface RegisterResult {
  id: string;
  dir: string;
  name: string;
  installed: InstalledSkill;
  /** true when this is a fresh install; false when an existing skill was overwritten */
  is_new: boolean;
}

/**
 * Write the skill into the user library. Idempotent — reinstalling the same
 * source overwrites the previous copy (re-fetching upstream changes is fine).
 */
export function registerSkill(opts: RegisterOptions): RegisterResult {
  const { fetched, probe, forced_id } = opts;
  const id = resolveId(forced_id ?? fetched.inferred_name, fetched.source_hash);
  const skillDir = path.join(SKILLS_ROOT, id);
  const refDir = path.join(skillDir, 'references');

  const is_new = !fs.existsSync(skillDir);

  fs.mkdirSync(refDir, { recursive: true });

  // Copy raw skill files into references/ so loadSkillSideFiles() picks them up.
  copyReferences(fetched.dir, refDir, fetched.subpath);

  // Synthetic SKILL.md with frontmatter — the existing skill-loader expects this.
  const installedAt = new Date().toISOString();
  const niceName = (fetched.inferred_name || id).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const descSummary = Object.entries(probe.counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ') || 'empty';
  const safeDescription = JSON.stringify(
    `Ingested from ${fetched.source_label} (${descSummary})`,
  );
  const skillMd = [
    '---',
    `name: ${JSON.stringify(niceName)}`,
    `description: ${safeDescription}`,
    `mode: blueprint`,
    `preview_type: yaml`,
    `source: ${JSON.stringify(fetched.source_label)}`,
    `source_hash: ${fetched.source_hash}`,
    `installed_at: ${installedAt}`,
    '---',
    '',
    `# ${niceName}`,
    '',
    `This skill was ingested from \`${fetched.source_label}\` on ${installedAt}.`,
    '',
    `**Contents:** ${Object.entries(probe.counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(', ') || 'empty'}`,
    '',
    'The original files have been copied into `references/` and will be auto-injected',
    'when this skill is used (see Story 15.12 side-files loader).',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

  fs.writeFileSync(path.join(skillDir, 'probe.json'), JSON.stringify(probe, null, 2), 'utf-8');

  const installed: InstalledSkill = {
    id,
    name: niceName,
    source: fetched.source_label,
    source_hash: fetched.source_hash,
    installed_at: installedAt,
    counts: probe.counts as Record<string, number>,
  };

  upsertRegistry(installed);

  return { id, dir: skillDir, name: niceName, installed, is_new };
}

function upsertRegistry(entry: InstalledSkill): void {
  let list: InstalledSkill[] = [];
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const idx = list.findIndex((x) => x.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);

  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

export function listInstalled(): InstalledSkill[] {
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getInstalled(id: string): InstalledSkill | null {
  return listInstalled().find((x) => x.id === id) ?? null;
}

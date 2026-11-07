/**
 * skillIngest.ts — client wrapper for /api/skills/{preview,ingest,installed}.
 *
 * Used by the URL-detection chip in the chat composer and the @skill picker
 * popover. All requests go through getApiBase() so dev / prod / proxy modes
 * are handled the same way as the rest of the API surface.
 */

import { getApiBase } from './_base';

export type SkillIngestKind = 'git-repo' | 'raw-file' | 'pasted-text';

export interface SkillPreview {
  kind: SkillIngestKind;
  inferred_name: string;
  subpath?: string;
}

export interface SkillIngestSummary {
  skill_id: string;
  name: string;
  is_new: boolean;
  source_label: string;
  counts: Record<string, number>;
  truncated: boolean;
}

export interface InstalledSkill {
  id: string;
  name: string;
  source: string;
  source_hash: string;
  installed_at: string;
  counts: Record<string, number>;
}

/** Match the URL patterns the backend's parseSource() handles. Loose on
 *  purpose — false positives just produce an unhelpful chip, not a crash. */
const URL_PATTERNS: RegExp[] = [
  /https?:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(\/tree\/[A-Za-z0-9._/\-]+)?/i,
  /https?:\/\/raw\.githubusercontent\.com\/[^\s]+/i,
  /https?:\/\/[^\s]+\.(md|MD|markdown)\b/,
];

/** Extract the first skill-shaped URL from a message body, or null. */
export function extractSkillUrl(text: string): string | null {
  for (const re of URL_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].replace(/[.,);]+$/, '');
  }
  return null;
}

export async function previewSkill(source: string): Promise<SkillPreview> {
  const resp = await fetch(`${getApiBase()}/api/skills/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `preview failed (${resp.status})`);
  }
  const json = (await resp.json()) as { data: SkillPreview };
  return json.data;
}

export async function ingestSkill(source: string, forced_id?: string): Promise<SkillIngestSummary> {
  const resp = await fetch(`${getApiBase()}/api/skills/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, forced_id }),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `ingest failed (${resp.status})`);
  }
  const json = (await resp.json()) as { data: SkillIngestSummary };
  return json.data;
}

export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  const resp = await fetch(`${getApiBase()}/api/skills/installed`);
  if (!resp.ok) return [];
  const json = (await resp.json().catch(() => ({ data: [] }))) as { data: InstalledSkill[] };
  return Array.isArray(json.data) ? json.data : [];
}

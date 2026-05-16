/**
 * skill-ingest/index.ts — public API.
 *
 * The whole module exists to take a user-supplied skill source (URL or
 * pasted text) at chat time and turn it into a registered skill at
 * `.shadowflow/skills/<id>/` that the rest of the run-session pipeline can
 * use unchanged.
 *
 * Pipeline:
 *   ingestSkill(source)
 *     → fetchSkill()     (clone / download / write text to cache)
 *     → probeSkill()     (walk + classify files, no schema enforced)
 *     → registerSkill()  (copy references/, write SKILL.md + probe.json)
 *     → return { id, ... }  — caller plumbs id into run-session.skill_name
 *
 * Re-runs are idempotent: same source string → same cache dir, same skill id,
 * fresh upstream content. Different sources that happen to slug to the same
 * id get disambiguated by appending the source hash.
 */

import { fetchSkill, parseSource } from './fetch';
import { probeSkill, renderProbeForPrompt } from './probe';
import { registerSkill, listInstalled, getInstalled } from './register';
import type { ProbeResult } from './probe';
import type { InstalledSkill } from './register';

export { parseSource, fetchSkill, probeSkill, renderProbeForPrompt };
export { registerSkill, listInstalled, getInstalled };
export type { ProbeResult, InstalledSkill };

export interface IngestResult {
  id: string;
  name: string;
  is_new: boolean;
  probe: ProbeResult;
  source_label: string;
  source_hash: string;
  /** ready-to-inject markdown block summarizing the skill */
  prompt_block: string;
}

/**
 * One-shot ingest: fetch → probe → register. Returns everything the chat
 * handler needs to acknowledge installation and chain into a run session.
 */
export async function ingestSkill(source: string, forced_id?: string): Promise<IngestResult> {
  const fetched = await fetchSkill(source);
  const probe = probeSkill(fetched.dir, fetched.subpath);
  const reg = registerSkill({ fetched, probe, forced_id });
  return {
    id: reg.id,
    name: reg.name,
    is_new: reg.is_new,
    probe,
    source_label: fetched.source_label,
    source_hash: fetched.source_hash,
    prompt_block: renderProbeForPrompt(probe, reg.name),
  };
}

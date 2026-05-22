/**
 * skill-ingest/canonical-id.ts — derive a stable canonical skill id from a
 * skill source URL.
 *
 * The id is ALWAYS the last path segment of the URL (the repo slug for git,
 * the file basename stem for raw files). Callers MUST NOT supply a custom id;
 * doing so allows the same GitHub repo to be installed under two different
 * ids (e.g. `bmad` vs `bmad-method`), which pollutes the skill cache and
 * breaks team-yaml `team_ref` resolution.
 *
 * Borrowed from OpenDesign's `sanitizeRepoName` in
 *   D:/VScode/open-design/apps/daemon/src/library-install.ts (line 18-26)
 *
 * Key differences from OpenDesign:
 *   - We preserve original case (do NOT lowercase). The user owns the repo
 *     name; we mirror it exactly so `team_ref: BMAD-METHOD` matches both the
 *     `.shadowflow/skills/BMAD-METHOD/` dir and the GitHub upstream slug.
 *
 * See docs/architecture/borrowed-from-opendesign.md and
 *     docs/architecture/orchestration-transport.md for the full rationale.
 */

const SAFE_NAME_RE = /^[a-zA-Z0-9_.-]+$/;

/**
 * Derive a canonical skill id from a URL (git repo, raw file, or arbitrary).
 *
 * Algorithm:
 *   1. Strip trailing `/`.
 *   2. Take the last `/`-delimited segment.
 *   3. Strip a trailing `.git`.
 *   4. If the result contains any character outside `[a-zA-Z0-9_.-]`,
 *      return `skill-<unix-millis>` as a fallback.
 *   5. Truncate to 64 characters.
 *
 * @param url Any URL-shaped string (we don't try to parse it as a URL — that
 *            would reject pasted-text labels, and the fallback handles garbage).
 * @returns A safe, length-bounded canonical id, never empty.
 */
export function canonicalIdFromUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  const raw = segments[segments.length - 1] || 'unnamed';
  const name = raw.replace(/\.git$/, '');
  if (!SAFE_NAME_RE.test(name)) {
    return 'skill-' + Date.now();
  }
  return name.slice(0, 64);
}

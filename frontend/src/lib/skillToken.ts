/**
 * skillToken.ts — DO NOT EDIT.
 *
 * Byte-equal mirror of `server/src/lib/skill-token.ts`. Lives here so
 * frontend code can `import { parseSkillToken } from '@/lib/skillToken'`
 * without reaching across the package boundary. The parity test at
 * `src/lib/__tests__/skillToken.test.ts` and its server twin run the
 * same input table against both modules; if you edit one, edit both
 * (or run the parity suite, which will yell).
 *
 * Mirror banner: edit the server file first, then copy. Round 4 PR-E.
 */

/**
 * Canonical token regex. Anchored at start-of-string OR a whitespace char
 * (NOT consumed by replacement on purpose — see `parseSkillToken` below).
 * The `(?:skill[:\s]+)?` group makes `@skill:` / `@skill ` optional so a
 * bare `@bmad` still parses. The lookahead `(?=\s|$)` keeps the regex
 * from greedily eating the next word.
 */
export const SKILL_TOKEN_RE =
  /(?:^|\s)@(?:skill[:\s]+)?([a-z0-9][a-z0-9_.-]{0,63})(?=\s|$)/i;

export interface SkillTokenParseResult {
  /** Captured id with original casing preserved, or null when no token. */
  skill_id: string | null;
  /** Goal text with the matched token removed + whitespace collapsed. */
  remaining: string;
}

/**
 * Pull the `@skill` token (if any) out of `text` and return what's left.
 *
 * Whitespace handling:
 *   - The leading boundary char (space or "") is consumed along with the
 *     token so we don't leave a stray double-space.
 *   - Internal runs of whitespace are collapsed to a single space.
 *   - The result is `trim()`med — empty string is a valid remaining value
 *     and the caller is expected to substitute a default goal in that case.
 */
export function parseSkillToken(text: string): SkillTokenParseResult {
  const m = text.match(SKILL_TOKEN_RE);
  if (!m) return { skill_id: null, remaining: text };
  const remaining = text
    .replace(SKILL_TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    skill_id: m[1], // preserve original casing — canonical-id is case-sensitive
    remaining,
  };
}

/**
 * skillToken.test.ts — frontend parity test.
 *
 * Mirrors `server/src/lib/__tests__/skill-token.test.ts` row-for-row. The
 * frontend module (`src/lib/skillToken.ts`) is a byte-equal copy of the
 * server module; if either drifts, the table here is the canary.
 *
 * Why duplicate the table inline instead of importing from the server
 * package: the frontend build doesn't cross the `server/` boundary
 * (different tsconfig, different bundler entry). Keeping the table in
 * both files makes the parity contract obvious to a reviewer reading
 * either file in isolation.
 */

import { describe, it, expect } from 'vitest';
import { parseSkillToken } from '../skillToken';

interface Row {
  desc: string;
  input: string;
  expected_skill_id: string | null;
  expected_remaining: string;
}

// Keep in sync with server/src/lib/__tests__/skill-token.test.ts (parity).
const TABLE: ReadonlyArray<Row> = [
  // ── happy paths ─────────────────────────────────────────────────────────
  { desc: 'bare @id alone',
    input: '@bmad',
    expected_skill_id: 'bmad',
    expected_remaining: '' },
  { desc: 'bare @id followed by goal',
    input: '@bmad 帮我做电商',
    expected_skill_id: 'bmad',
    expected_remaining: '帮我做电商' },
  { desc: 'preserves uppercase id (BMAD-METHOD canonical)',
    input: '@BMAD-METHOD 帮我',
    expected_skill_id: 'BMAD-METHOD',
    expected_remaining: '帮我' },
  { desc: '@skill:<id> with colon',
    input: '@skill:foo bar',
    expected_skill_id: 'foo',
    expected_remaining: 'bar' },
  { desc: '@skill <id> with space',
    input: '@skill foo bar',
    expected_skill_id: 'foo',
    expected_remaining: 'bar' },
  { desc: '@skill:<id> with uppercase id',
    input: '@skill:BMAD-METHOD 帮我做登录',
    expected_skill_id: 'BMAD-METHOD',
    expected_remaining: '帮我做登录' },
  { desc: 'after leading goal text',
    input: '请用 @bmad 帮我',
    expected_skill_id: 'bmad',
    expected_remaining: '请用 帮我' },
  { desc: 'collapses extra whitespace after stripping',
    input: '请用  @bmad  帮我',
    expected_skill_id: 'bmad',
    expected_remaining: '请用 帮我' },
  { desc: 'single char id',
    input: '@a do thing',
    expected_skill_id: 'a',
    expected_remaining: 'do thing' },
  { desc: 'id with dots underscores dashes',
    input: '@foo_bar.baz-1 hi',
    expected_skill_id: 'foo_bar.baz-1',
    expected_remaining: 'hi' },
  { desc: 'token at end of string',
    input: 'hello @bmad',
    expected_skill_id: 'bmad',
    expected_remaining: 'hello' },
  { desc: '@skill: bmad with space after colon',
    input: '@skill: bmad go',
    expected_skill_id: 'bmad',
    expected_remaining: 'go' },

  // ── email / boundary negatives ──────────────────────────────────────────
  { desc: 'email is NOT a skill token',
    input: 'user@example.com',
    expected_skill_id: null,
    expected_remaining: 'user@example.com' },
  { desc: 'email inside Chinese prose is NOT a token',
    input: '请发email到foo@bar.com',
    expected_skill_id: null,
    expected_remaining: '请发email到foo@bar.com' },
  { desc: 'email followed by goal is NOT a token',
    input: 'mailto:foo@bar.com 帮我',
    expected_skill_id: null,
    expected_remaining: 'mailto:foo@bar.com 帮我' },

  // ── id-shape negatives ──────────────────────────────────────────────────
  { desc: '@-bad — leading dash rejected',
    input: '@-bad go',
    expected_skill_id: null,
    expected_remaining: '@-bad go' },
  { desc: '@. — leading dot rejected',
    input: '@.bad go',
    expected_skill_id: null,
    expected_remaining: '@.bad go' },
  { desc: '@ alone — no id at all',
    input: '@ go',
    expected_skill_id: null,
    expected_remaining: '@ go' },

  // ── Chinese / unicode boundary cases ────────────────────────────────────
  // Chinese chars are NOT \s, so the trailing lookahead fails. Documented
  // contract: same as the legacy inline regex. Users wanting a Chinese-text
  // boundary should put a space after the token.
  { desc: 'no space between @id and following Chinese — does NOT match',
    input: '请用@bmad帮我',
    expected_skill_id: null,
    expected_remaining: '请用@bmad帮我' },

  // ── empty / trim behaviour ──────────────────────────────────────────────
  { desc: '@id only with trailing spaces',
    input: '@bmad   ',
    expected_skill_id: 'bmad',
    expected_remaining: '' },
  { desc: '@skill:id only',
    input: '@skill:bmad',
    expected_skill_id: 'bmad',
    expected_remaining: '' },
];

describe('parseSkillToken (frontend mirror) — table-driven', () => {
  for (const row of TABLE) {
    it(row.desc, () => {
      const r = parseSkillToken(row.input);
      expect(r.skill_id).toBe(row.expected_skill_id);
      expect(r.remaining).toBe(row.expected_remaining);
    });
  }
});

describe('parseSkillToken (frontend mirror) — invariants', () => {
  it('returns a result object for every input (never throws)', () => {
    for (const s of ['', ' ', '\n', '@', '@@@', '@@', '@skill', '@skill:']) {
      const r = parseSkillToken(s);
      expect(typeof r).toBe('object');
      expect(r).toHaveProperty('skill_id');
      expect(r).toHaveProperty('remaining');
    }
  });

  it('skill_id is never the empty string when non-null', () => {
    for (const row of TABLE) {
      const r = parseSkillToken(row.input);
      if (r.skill_id !== null) expect(r.skill_id.length).toBeGreaterThan(0);
    }
  });
});

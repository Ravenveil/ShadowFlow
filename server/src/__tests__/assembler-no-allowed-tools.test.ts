/**
 * assembler-no-allowed-tools.test.ts — S6-review P1 #3 smoke.
 *
 * Run with:  npx tsx src/__tests__/assembler-no-allowed-tools.test.ts
 *
 * Verifies that a team-backed skill missing `allowed-tools` frontmatter
 * fails fast with a structured `NO_ALLOWED_TOOLS` error SSE rather than
 * silently looping until max_iter (the pre-fix behavior was console.warn +
 * 50-iter permission-denial cascade).
 *
 * We monkey-register a synthetic skill into SKILLS so we don't depend on
 * the real `.shadowflow/skills/` layout, and feed runSkillAssembler a
 * minimal options bundle. The Anthropic API key is set so the early
 * NO_API_KEY branch doesn't trigger first.
 */

import { SKILLS } from '../skills';
import { runSkillAssembler } from '../assembler';
import type { TeamDef } from '../lib/skill-types';

let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown): void {
  const eq = JSON.stringify(expected) === JSON.stringify(actual);
  if (eq) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`,
    );
  }
}

function checkTruthy(label: string, actual: unknown): void {
  if (actual) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}  (expected truthy, got ${JSON.stringify(actual)})`);
  }
}

async function main(): Promise<void> {
  // Inject synthetic team-backed skill with NO allowed-tools.
  const SKILL_ID = '__test_no_allowed_tools_skill__';
  const fakeTeam: TeamDef = {
    id: SKILL_ID,
    members_ids: ['fake-agent'],
    resolvedAgents: [],
  } as unknown as TeamDef;

  SKILLS[SKILL_ID] = {
    name: 'No-Allowed-Tools Test Skill',
    description: 'Synthetic team-backed skill with empty allowed_tools (P1 #3 regression).',
    mode: 'blueprint',
    preview_type: 'yaml',
    system_prompt: 'irrelevant — error fires before LLM call',
    team: fakeTeam,
    // Note: allowed_tools intentionally OMITTED to trigger NO_ALLOWED_TOOLS.
  };

  // Ensure API key is set so the prior NO_API_KEY branch doesn't fire.
  const origKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-used';

  try {
    const events: Array<{ event: string; data: unknown }> = [];
    for await (const ev of runSkillAssembler({
      goal: 'whatever',
      skill_name: SKILL_ID,
      session_id: 'test-session-no-allowed',
    } as Parameters<typeof runSkillAssembler>[0])) {
      events.push(ev as { event: string; data: unknown });
      // Safety net — don't infinite-loop the test if the fix regresses.
      if (events.length > 5) break;
    }

    const errorEv = events.find((e) => e.event === 'error');
    checkTruthy('emits an error event', errorEv !== undefined);
    if (errorEv) {
      const d = errorEv.data as { code?: string; message?: string };
      check(
        'error code is NO_ALLOWED_TOOLS',
        'NO_ALLOWED_TOOLS',
        d.code,
      );
      checkTruthy(
        'error message mentions skill name',
        typeof d.message === 'string' && d.message.includes(SKILL_ID),
      );
      checkTruthy(
        'error message mentions allowed-tools frontmatter',
        typeof d.message === 'string' && d.message.includes('allowed-tools'),
      );
    }

    // Should NOT have hit the ConversationRuntime loop at all — events
    // should be short (error short-circuits the generator).
    checkTruthy(
      'short-circuits without entering the LLM loop (≤ 2 events)',
      events.length <= 2,
    );
  } finally {
    // Cleanup
    delete SKILLS[SKILL_ID];
    if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
    else delete process.env.ANTHROPIC_API_KEY;
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();

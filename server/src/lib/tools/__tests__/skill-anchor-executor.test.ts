/**
 * skill-anchor-executor.test.ts — S6 SkillAnchorToolExecutor smoke.
 *
 * Run with:  npx tsx src/lib/tools/__tests__/skill-anchor-executor.test.ts
 *
 * Standalone tsx pattern matching skill-anchors.test.ts conventions.
 *
 * Coverage:
 *   - toolSpecs() returns the 4 S4 anchor tools in order
 *   - toolSpecs() returns a fresh array each call (mutation safety)
 *   - execute() delegates to the right S4 executor for each known name
 *   - execute() returns isError=true with structured error for unknown tool
 *   - execute() passes input through verbatim (no transformation)
 *   - execute() surfaces sseEvents from the underlying executor
 *   - context (skill_id / sessionId) accessible via accessors
 *   - Does NOT throw on unknown tool — returns structured error instead
 */

import {
  SkillAnchorToolExecutor,
} from '../skill-anchor-executor';
import { skillAnchorTools } from '../skill-anchors';

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
  const exec = new SkillAnchorToolExecutor({
    skill_id: 'paper-review',
    sessionId: 'session-xyz',
  });

  // ── toolSpecs ─────────────────────────────────────────────────────────────
  {
    const specs = exec.toolSpecs();
    check('toolSpecs: returns 4 specs', 4, specs.length);
    check(
      'toolSpecs: names in S4 order',
      skillAnchorTools.map((t) => t.name),
      specs.map((s) => s.name),
    );

    // Mutation safety — modifying the returned array must not affect the
    // underlying registry.
    specs.pop();
    const specs2 = exec.toolSpecs();
    check('toolSpecs: returns fresh array (mutation safe)', 4, specs2.length);
  }

  // ── context accessors ─────────────────────────────────────────────────────
  {
    check('skillId accessor', 'paper-review', exec.skillId);
    check('sessionId accessor', 'session-xyz', exec.sessionId);
  }

  // ── execute: delegates to list_team_agents ────────────────────────────────
  {
    const r = await exec.execute('list_team_agents', { skill_id: 'paper-review' });
    checkTruthy(
      'execute(list_team_agents): output.agents is array',
      Array.isArray((r.output as { agents?: unknown[] }).agents),
    );
    check(
      'execute(list_team_agents): 4 paper-review members',
      4,
      (r.output as { agents: unknown[] }).agents.length,
    );
    checkTruthy('execute(list_team_agents): isError unset', r.isError === undefined);
    checkTruthy(
      'execute(list_team_agents): no sseEvents (read-only tool)',
      r.sseEvents === undefined,
    );
  }

  // ── execute: delegates to get_skill_anchor ────────────────────────────────
  {
    const r = await exec.execute('get_skill_anchor', {
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'persona',
    });
    const out = r.output as { ref: string; tokens: number; body: string };
    check('execute(get_skill_anchor): ref shape', 'reader.agent.yaml#persona', out.ref);
    checkTruthy('execute(get_skill_anchor): tokens > 0', out.tokens > 0);
    checkTruthy('execute(get_skill_anchor): body non-empty', out.body.length > 0);
  }

  // ── execute: delegates to register_agent + sseEvents pass-through ─────────
  {
    const r = await exec.execute('register_agent', {
      node_id: 'reader',
      title: 'Reader',
      type: 'agent',
      model_id: 'claude-sonnet-4',
      tools_picked: ['pdf_extract'],
      persona: 'persona body',
      persona_source: 'reader.agent.yaml#persona',
      persona_tokens: 10,
      persona_cached: true,
    });
    check('execute(register_agent): output.ok', true, (r.output as { ok: boolean }).ok);
    checkTruthy(
      'execute(register_agent): sseEvents propagated',
      Array.isArray(r.sseEvents) && r.sseEvents!.length === 1,
    );
    // S6 contract fix: event name must be 'node' not 'sf-node'.
    check(
      'execute(register_agent): sseEvent name is node (S6 fix)',
      'node',
      r.sseEvents![0].event,
    );
  }

  // ── execute: delegates to register_edge ──────────────────────────────────
  {
    const r = await exec.execute('register_edge', {
      from: 'coord',
      to: 'reader',
    });
    check('execute(register_edge): output.ok', true, (r.output as { ok: boolean }).ok);
    check(
      'execute(register_edge): sseEvent name is edge (S6 fix)',
      'edge',
      r.sseEvents![0].event,
    );
  }

  // ── execute: unknown tool → structured error (no throw) ──────────────────
  {
    let threw = false;
    let r: Awaited<ReturnType<typeof exec.execute>> | undefined;
    try {
      r = await exec.execute('not_a_real_tool', { foo: 'bar' });
    } catch {
      threw = true;
    }
    check('execute(unknown): does NOT throw', false, threw);
    check('execute(unknown): isError=true', true, r?.isError);
    checkTruthy(
      'execute(unknown): error message mentions tool name',
      typeof (r?.output as { error?: string }).error === 'string' &&
        (r!.output as { error: string }).error.includes('not_a_real_tool'),
    );
  }

  // ── execute: input pass-through (executor errors surface) ────────────────
  {
    // Pass a string instead of object — S4 list_team_agents validates this
    // and returns isError=true. Wrapper must NOT mask the error.
    const r = await exec.execute('list_team_agents', 'paper-review');
    check('execute(input pass-through): bad input → isError=true', true, r.isError);
  }

  // ── execute: another executor's input validation surfaces ────────────────
  {
    const r = await exec.execute('register_edge', { from: 'coord' }); // missing 'to'
    check('execute(register_edge missing to): isError=true', true, r.isError);
    checkTruthy(
      'execute(register_edge missing to): error mentions "to"',
      typeof (r.output as { error?: string }).error === 'string' &&
        (r.output as { error: string }).error.includes('to'),
    );
  }

  // ── execute: context does not leak into delegated execution ──────────────
  //   The S4 executors do NOT read context.skill_id — they read from input.
  //   Verify by calling with a DIFFERENT skill_id in input than constructor.
  {
    const otherExec = new SkillAnchorToolExecutor({
      skill_id: 'something-else',
      sessionId: 's',
    });
    const r = await otherExec.execute('list_team_agents', { skill_id: 'paper-review' });
    // Should succeed because input.skill_id wins (proves no context leakage).
    checkTruthy(
      'execute(context isolation): input.skill_id wins over context.skill_id',
      Array.isArray((r.output as { agents?: unknown[] }).agents),
    );
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();

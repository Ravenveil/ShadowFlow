/**
 * skill-anchors.test.ts — S4 smoke test for the 4 SkillAnchorTool executors
 * and their ToolSpec catalog.
 *
 * Run with:  npx tsx src/lib/tools/__tests__/skill-anchors.test.ts   (from server/)
 *
 * Standalone tsx pattern (no vitest in this package — mirrors
 * permission-policy.test.ts / tool-spec.test.ts convention).
 *
 * Coverage axes:
 *   - ToolSpec catalog shape (4 tools, names, source = 'base')
 *   - list_team_agents: happy / missing skill_id / unknown skill_id / wrong input type
 *   - get_skill_anchor: happy (all 5 slots) / unknown slot / unknown agent / non-member /
 *                       unknown skill / body byte-for-byte verbatim against yaml
 *   - register_agent:   happy (sf:node sseEvents) / missing required / bad type / bad tools
 *   - register_edge:    happy default kind / explicit kind / missing from / bad kind
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  skillAnchorTools,
  skillAnchorExecutors,
} from '../skill-anchors';

let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown) {
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

function checkTruthy(label: string, actual: unknown) {
  if (actual) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}  (expected truthy, got ${JSON.stringify(actual)})`);
  }
}

// Real test data lives in the repo's .shadowflow/agents and .shadowflow/teams.
// Tests run from the server/ directory; agents/teams sit one level up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const READER_YAML = path.join(REPO_ROOT, '.shadowflow', 'agents', 'reader.agent.yaml');

interface ReaderYaml {
  persona: string;
  model: unknown;
  tools: unknown;
  memory?: string;
  io?: unknown;
}

async function main(): Promise<void> {
  // ── ToolSpec catalog shape ──────────────────────────────────────────────────
  {
    check('catalog: 4 tools registered', 4, skillAnchorTools.length);
    const names = skillAnchorTools.map((t) => t.name).sort();
    check(
      'catalog: tool names',
      ['get_skill_anchor', 'list_team_agents', 'register_agent', 'register_edge'],
      names,
    );
    for (const t of skillAnchorTools) {
      check(`catalog: ${t.name} source = base`, 'base', t.source);
      checkTruthy(`catalog: ${t.name} has description`, t.description.length > 0);
      checkTruthy(
        `catalog: ${t.name} input_schema is object with type=object`,
        typeof t.input_schema === 'object' &&
          (t.input_schema as { type: string }).type === 'object',
      );
    }

    // Executors keyed by exact tool name
    for (const t of skillAnchorTools) {
      checkTruthy(
        `catalog: executor exists for ${t.name}`,
        typeof skillAnchorExecutors[t.name] === 'function',
      );
    }
  }

  // ── list_team_agents ────────────────────────────────────────────────────────
  {
    // 1. happy path
    const r = await skillAnchorExecutors.list_team_agents({ skill_id: 'paper-review' });
    const out = r.output as {
      agents: Array<{
        id: string;
        title: string;
        type: string;
        persona_tokens: number;
        model_id: string;
        picked_tool_count: number;
      }>;
    };
    checkTruthy('list_team_agents: happy returned agents array', Array.isArray(out.agents));
    check('list_team_agents: paper-review has 4 members', 4, out.agents.length);
    check(
      'list_team_agents: member ids',
      ['coord', 'critic', 'reader', 'writer'],
      out.agents.map((a) => a.id).sort(),
    );
    checkTruthy(
      'list_team_agents: reader has persona_tokens > 0',
      out.agents.find((a) => a.id === 'reader')!.persona_tokens > 0,
    );
    checkTruthy(
      'list_team_agents: reader has model_id',
      typeof out.agents.find((a) => a.id === 'reader')!.model_id === 'string',
    );
    checkTruthy(
      'list_team_agents: reader picked_tool_count > 0',
      out.agents.find((a) => a.id === 'reader')!.picked_tool_count > 0,
    );
    checkTruthy('list_team_agents: no sseEvents (read-only)', r.sseEvents === undefined);
    checkTruthy('list_team_agents: isError unset', r.isError === undefined);

    // 2. missing skill_id
    const r2 = await skillAnchorExecutors.list_team_agents({});
    check('list_team_agents: missing skill_id → isError', true, r2.isError);
    checkTruthy(
      'list_team_agents: missing skill_id error mentions skill_id',
      (r2.output as { error: string }).error.includes('skill_id'),
    );

    // 3. unknown skill_id
    const r3 = await skillAnchorExecutors.list_team_agents({ skill_id: 'no-such-team-xyz' });
    check('list_team_agents: unknown skill_id → isError', true, r3.isError);
    checkTruthy(
      'list_team_agents: unknown skill error mentions team not found',
      (r3.output as { error: string }).error.includes('not found') ||
        (r3.output as { error: string }).error.includes('team not found'),
    );

    // 4. wrong input type (string instead of object)
    const r4 = await skillAnchorExecutors.list_team_agents('paper-review');
    check('list_team_agents: non-object input → isError', true, r4.isError);
  }

  // ── get_skill_anchor ────────────────────────────────────────────────────────
  // Read yaml file directly so we can compare body byte-for-byte.
  const raw = fs.readFileSync(READER_YAML, 'utf-8');
  const parsed = yaml.load(raw) as ReaderYaml;
  {
    // 1. happy persona, body byte-for-byte vs yaml
    const r = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'persona',
    });
    const out = r.output as { ref: string; tokens: number; body: string };
    check('get_skill_anchor: persona ref shape', 'reader.agent.yaml#persona', out.ref);
    checkTruthy('get_skill_anchor: persona tokens > 0', out.tokens > 0);
    check('get_skill_anchor: persona body verbatim equals yaml file', parsed.persona, out.body);

    // 2. happy memory slot
    const r2 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'memory',
    });
    const out2 = r2.output as { ref: string; body: string };
    check('get_skill_anchor: memory ref shape', 'reader.agent.yaml#memory', out2.ref);
    check('get_skill_anchor: memory body verbatim', parsed.memory ?? '', out2.body);

    // 3. happy model slot (JSON-stringified)
    const r3 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'model',
    });
    const out3 = r3.output as { body: string };
    check(
      'get_skill_anchor: model body is JSON of yaml.model',
      JSON.stringify(parsed.model),
      out3.body,
    );

    // 4. happy tools slot
    const r4 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'tools',
    });
    const out4 = r4.output as { body: string };
    check(
      'get_skill_anchor: tools body is JSON of yaml.tools',
      JSON.stringify(parsed.tools),
      out4.body,
    );

    // 5. happy io slot
    const r5 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'io',
    });
    const out5 = r5.output as { body: string };
    check(
      'get_skill_anchor: io body is JSON of yaml.io',
      JSON.stringify(parsed.io ?? {}),
      out5.body,
    );

    // 6. unknown slot
    const r6 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'NOT_A_SLOT',
    });
    check('get_skill_anchor: invalid slot → isError', true, r6.isError);
    checkTruthy(
      'get_skill_anchor: invalid slot mentions valid slots',
      (r6.output as { error: string }).error.includes('persona'),
    );

    // 7. agent not a member of the team
    const r7 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'arch', // arch is in bmad team, NOT paper-review
      slot: 'persona',
    });
    check('get_skill_anchor: non-member → isError', true, r7.isError);
    checkTruthy(
      'get_skill_anchor: non-member error mentions not a member',
      (r7.output as { error: string }).error.includes('not a member'),
    );

    // 8. unknown agent altogether
    const r8 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'no-such-agent-zzz',
      slot: 'persona',
    });
    check('get_skill_anchor: unknown agent → isError', true, r8.isError);

    // 9. unknown skill
    const r9 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'no-such-team-zzz',
      agent_id: 'reader',
      slot: 'persona',
    });
    check('get_skill_anchor: unknown team → isError', true, r9.isError);

    // 10. missing agent_id
    const r10 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      slot: 'persona',
    });
    check('get_skill_anchor: missing agent_id → isError', true, r10.isError);

    // 11. case-sensitive slot match (no lowercase normalisation)
    const r11 = await skillAnchorExecutors.get_skill_anchor({
      skill_id: 'paper-review',
      agent_id: 'reader',
      slot: 'Persona', // capital P
    });
    check('get_skill_anchor: slot is case sensitive (Persona ≠ persona)', true, r11.isError);
  }

  // ── register_agent ──────────────────────────────────────────────────────────
  {
    const validInput = {
      node_id: 'reader',
      title: 'Reader',
      type: 'agent' as const,
      model_id: 'claude-sonnet-4',
      model_temperature: 0.2,
      tools_picked: ['pdf_extract', 'arxiv_search'],
      tools_candidate: ['google_scholar'],
      persona: '# reader.persona\n你是 ...',
      persona_source: 'reader.agent.yaml#persona',
      persona_tokens: 142,
      persona_cached: false,
      memory: 'papers.vec',
    };
    const r = await skillAnchorExecutors.register_agent(validInput);
    check('register_agent: happy returns ok', { ok: true, node_id: 'reader' }, r.output);
    checkTruthy('register_agent: happy isError unset', r.isError === undefined);
    checkTruthy(
      'register_agent: happy emits sseEvents',
      Array.isArray(r.sseEvents) && r.sseEvents!.length === 1,
    );
    check('register_agent: sseEvent event name', 'sf-node', r.sseEvents![0].event);
    const evData = r.sseEvents![0].data as {
      node_id: string;
      title: string;
      persona: { body: string; source: string };
    };
    check('register_agent: sse data node_id', 'reader', evData.node_id);
    check(
      'register_agent: sse data persona body echoed',
      '# reader.persona\n你是 ...',
      evData.persona.body,
    );
    check(
      'register_agent: sse data persona source echoed',
      'reader.agent.yaml#persona',
      evData.persona.source,
    );

    // missing required field
    const r2 = await skillAnchorExecutors.register_agent({
      ...validInput,
      node_id: undefined,
    });
    check('register_agent: missing node_id → isError', true, r2.isError);

    // bad type
    const r3 = await skillAnchorExecutors.register_agent({
      ...validInput,
      type: 'bogus',
    });
    check('register_agent: bad type → isError', true, r3.isError);

    // bad tools_picked
    const r4 = await skillAnchorExecutors.register_agent({
      ...validInput,
      tools_picked: 'not-an-array',
    });
    check('register_agent: tools_picked not array → isError', true, r4.isError);

    // non-object input
    const r5 = await skillAnchorExecutors.register_agent(null);
    check('register_agent: null input → isError', true, r5.isError);

    // persona_tokens not a number
    const r6 = await skillAnchorExecutors.register_agent({
      ...validInput,
      persona_tokens: 'lots',
    });
    check('register_agent: persona_tokens not number → isError', true, r6.isError);

    // persona_cached not boolean
    const r7 = await skillAnchorExecutors.register_agent({
      ...validInput,
      persona_cached: 1,
    });
    check('register_agent: persona_cached not boolean → isError', true, r7.isError);
  }

  // ── register_edge ───────────────────────────────────────────────────────────
  {
    // happy default kind
    const r = await skillAnchorExecutors.register_edge({ from: 'coord', to: 'reader' });
    check('register_edge: happy ok', { ok: true }, r.output);
    checkTruthy(
      'register_edge: happy sseEvents',
      Array.isArray(r.sseEvents) && r.sseEvents!.length === 1,
    );
    check('register_edge: sseEvent event name', 'sf-edge', r.sseEvents![0].event);
    const ev = r.sseEvents![0].data as { from: string; to: string; kind: string };
    check('register_edge: default kind = sequential', 'sequential', ev.kind);
    check('register_edge: from echoed', 'coord', ev.from);
    check('register_edge: to echoed', 'reader', ev.to);

    // explicit conditional with condition + max_retries
    const r2 = await skillAnchorExecutors.register_edge({
      from: 'critic',
      to: 'reader',
      kind: 'conditional',
      condition: 'retry',
      max_retries: 3,
    });
    const ev2 = r2.sseEvents![0].data as {
      kind: string;
      condition: string;
      max_retries: number;
    };
    check('register_edge: kind conditional echoed', 'conditional', ev2.kind);
    check('register_edge: condition echoed', 'retry', ev2.condition);
    check('register_edge: max_retries echoed', 3, ev2.max_retries);

    // missing from
    const r3 = await skillAnchorExecutors.register_edge({ to: 'reader' });
    check('register_edge: missing from → isError', true, r3.isError);

    // empty string to
    const r4 = await skillAnchorExecutors.register_edge({ from: 'coord', to: '' });
    check('register_edge: empty to → isError', true, r4.isError);

    // bad kind
    const r5 = await skillAnchorExecutors.register_edge({
      from: 'coord',
      to: 'reader',
      kind: 'magic',
    });
    check('register_edge: bad kind → isError', true, r5.isError);

    // bad condition type
    const r6 = await skillAnchorExecutors.register_edge({
      from: 'coord',
      to: 'reader',
      condition: 42,
    });
    check('register_edge: numeric condition → isError', true, r6.isError);

    // bad max_retries type
    const r7 = await skillAnchorExecutors.register_edge({
      from: 'coord',
      to: 'reader',
      max_retries: 'lots',
    });
    check('register_edge: string max_retries → isError', true, r7.isError);

    // non-object input
    const r8 = await skillAnchorExecutors.register_edge(['coord', 'reader']);
    check('register_edge: array input → isError', true, r8.isError);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();

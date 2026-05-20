/**
 * skill-anchors.ts — S4 (skill-team-conversion-design-v1.md §5).
 *
 * Four internal tools the LLM uses inside ConversationRuntime (S5) to drive
 * the skill → team assembly multi-turn loop. They are the *only* channel for
 * pulling persona / model / tools / memory / io text out of the agent yaml
 * library — when LLM calls `get_skill_anchor` it gets back the body **byte-
 * for-byte from the file**, which it then echoes into `<sf:agent-persona>`.
 * That removes the entire "LLM paraphrased the skill" drift class (design
 * §4.3 "引用 vs 创造" discipline).
 *
 * Tool list
 * ─────────
 *   1. list_team_agents(skill_id)        → summary of all member agents
 *   2. get_skill_anchor(skill_id, agent_id, slot)
 *                                        → { ref, tokens, body } verbatim
 *   3. register_agent(node spec)         → ack + sf:node sse-equivalent event
 *   4. register_edge(from, to, ...)      → ack + sf:edge sse-equivalent event
 *
 * Side-effects discipline
 * ────────────────────────
 * `register_agent` / `register_edge` do NOT emit SSE themselves. They return
 * `sseEvents[]` in their ToolExecutionResult and the ConversationRuntime is
 * the only thing that actually writes to the wire. This is plan-eng-review
 * decision D4 ("B = wrap as normal return + side-channel"). It keeps every
 * tool executor a pure function and makes them trivial to unit-test.
 *
 * Validation
 * ──────────
 * Each executor narrows its `input: unknown` parameter with a tiny hand-
 * written guard (we have no ajv). Failure → `{ output: { error }, isError:
 * true }` so the LLM gets a structured error back and can retry. We never
 * `as`-cast — that's how silent corrupt data would slip through to the file
 * layer.
 *
 * Case sensitivity
 * ────────────────
 * All ids and slot names are matched exactly. No lower-casing, no trimming.
 * SKILL.md frontmatter / agent yaml `id` is the source of truth (see
 * PermissionPolicy.fromAllowedTools JSDoc for the matching principle).
 */

import type { ToolSpec } from '../tool-spec';
import { loadAgent } from '../agent-yaml';
import { loadTeam } from '../team-yaml';
import type { SkillSlot } from '../skill-types';

/**
 * What a tool returns to the runtime. `output` is fed straight back to the
 * LLM as the `tool_result.output` JSON-encoded blob. `sseEvents` is the side
 * channel for register_agent / register_edge — the runtime yields each entry
 * downstream verbatim. `isError` flips the `is_error` flag on the
 * `tool_result` ContentBlock.
 */
export interface ToolExecutionResult {
  output: unknown;
  sseEvents?: Array<{ event: string; data: unknown }>;
  isError?: boolean;
}

export type ToolExecutor = (input: unknown) => Promise<ToolExecutionResult>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Cheap structural typecheck — narrow an unknown to a plain object record.
 * We do this instead of pulling ajv because:
 *   - the input shapes are 3-6 fields each (low cost to hand-roll)
 *   - this keeps the dependency surface tiny (S2/S3 also avoid runtime deps)
 *   - executors are the only path that ever sees unsafe `input`, so the
 *     guard logic stays colocated and grep-able.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function errResult(reason: string): ToolExecutionResult {
  return { output: { error: reason }, isError: true };
}

const VALID_SLOTS: readonly SkillSlot[] = ['persona', 'model', 'tools', 'memory', 'io'];
function isSkillSlot(v: unknown): v is SkillSlot {
  return typeof v === 'string' && (VALID_SLOTS as readonly string[]).includes(v);
}

const VALID_EDGE_KINDS = ['sequential', 'parallel', 'conditional'] as const;
type EdgeKindIn = (typeof VALID_EDGE_KINDS)[number];
function isEdgeKind(v: unknown): v is EdgeKindIn {
  return typeof v === 'string' && (VALID_EDGE_KINDS as readonly string[]).includes(v);
}

// ─── ToolSpec catalog ───────────────────────────────────────────────────────
//
// All four specs are `source: 'base'`. They go into the LLM's tool list every
// turn of the skill-assembler conversation. The runtime (S5) will register
// them on the ToolRegistry at boot.

export const skillAnchorTools: ToolSpec[] = [
  {
    name: 'list_team_agents',
    description:
      'List candidate agents declared by a team (resolved from .shadowflow/teams/<skill_id>.team.yaml). ' +
      'Returns a short summary per agent — title, type, persona token count, model id, picked-tool count. ' +
      'Use this at the very start of phase 2 to enumerate who you can hire.',
    input_schema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Team / skill identifier (filename stem).' },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    source: 'base',
  },
  {
    name: 'get_skill_anchor',
    description:
      'Fetch one slot (persona | model | tools | memory | io) of one agent verbatim from its agent yaml. ' +
      'Returns { ref, tokens, body }. The body is byte-identical to the file — do NOT paraphrase or trim it; ' +
      'echo it directly into <sf:agent-persona> / <sf:agent-model> / etc.',
    input_schema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Team / skill identifier.' },
        agent_id: { type: 'string', description: 'Agent id (must be a team member).' },
        slot: {
          type: 'string',
          enum: ['persona', 'model', 'tools', 'memory', 'io'],
          description: 'Which provenance slot to fetch.',
        },
      },
      required: ['skill_id', 'agent_id', 'slot'],
      additionalProperties: false,
    },
    source: 'base',
  },
  {
    name: 'register_agent',
    description:
      'Register one assembled agent into the team blueprint. The runtime turns this into a <sf:node>-equivalent ' +
      'SSE frame downstream. Pass persona / model / tools you previously fetched via get_skill_anchor.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string', enum: ['agent', 'coordinator'] },
        model_id: { type: 'string' },
        model_temperature: { type: 'number' },
        model_max_tokens: { type: 'number' },
        model_context_window: { type: 'number' },
        tools_picked: { type: 'array', items: { type: 'string' } },
        tools_candidate: { type: 'array', items: { type: 'string' } },
        persona: { type: 'string' },
        persona_source: { type: 'string', description: 'e.g. "reader.agent.yaml#persona"' },
        persona_tokens: { type: 'number' },
        persona_cached: { type: 'boolean' },
        memory: { type: 'string' },
        io_input: {},
        io_output: {},
      },
      required: [
        'node_id',
        'title',
        'type',
        'model_id',
        'tools_picked',
        'persona',
        'persona_source',
        'persona_tokens',
        'persona_cached',
      ],
      additionalProperties: false,
    },
    source: 'base',
  },
  {
    name: 'register_edge',
    description:
      'Register one edge in the team DAG. The runtime turns this into a <sf:edge>-equivalent SSE frame.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        kind: { type: 'string', enum: ['sequential', 'parallel', 'conditional'] },
        condition: { type: 'string' },
        max_retries: { type: 'number' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    source: 'base',
  },
];

// ─── Executors ─────────────────────────────────────────────────────────────

async function execListTeamAgents(input: unknown): Promise<ToolExecutionResult> {
  if (!isRecord(input)) return errResult('list_team_agents: input must be an object');
  const { skill_id } = input;
  if (typeof skill_id !== 'string' || skill_id.length === 0) {
    return errResult('list_team_agents: skill_id is required and must be a non-empty string');
  }
  const { team, resolvedAgents, errors } = loadTeam(skill_id);
  if (!team) {
    return errResult(
      `list_team_agents: team not found: ${skill_id}${
        errors.length ? ` (${errors.join('; ')})` : ''
      }`,
    );
  }
  const agents = resolvedAgents.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type ?? 'agent',
    sub: a.sub,
    persona_tokens: a.anchors.persona.tokens,
    model_id: a.model.id,
    picked_tool_count: a.tools.picked.length,
  }));
  return { output: { agents } };
}

async function execGetSkillAnchor(input: unknown): Promise<ToolExecutionResult> {
  if (!isRecord(input)) return errResult('get_skill_anchor: input must be an object');
  const { skill_id, agent_id, slot } = input;
  if (typeof skill_id !== 'string' || skill_id.length === 0) {
    return errResult('get_skill_anchor: skill_id is required and must be a non-empty string');
  }
  if (typeof agent_id !== 'string' || agent_id.length === 0) {
    return errResult('get_skill_anchor: agent_id is required and must be a non-empty string');
  }
  if (!isSkillSlot(slot)) {
    return errResult(
      `get_skill_anchor: slot must be one of ${VALID_SLOTS.join('|')} (got ${JSON.stringify(slot)})`,
    );
  }

  // Verify agent is a member of the named team (drift guard).
  const teamResult = loadTeam(skill_id);
  if (!teamResult.team) {
    return errResult(`get_skill_anchor: team not found: ${skill_id}`);
  }
  if (!teamResult.team.members_ids.includes(agent_id)) {
    return errResult(
      `get_skill_anchor: agent "${agent_id}" is not a member of team "${skill_id}"`,
    );
  }

  const agent = loadAgent(agent_id);
  if ('error' in agent) {
    return errResult(`get_skill_anchor: ${agent.error}`);
  }
  const anchor = agent.anchors[slot];
  const body = slotBodyVerbatim(slot, agent);
  return {
    output: {
      ref: anchor.ref,
      tokens: anchor.tokens,
      body,
    },
  };
}

/**
 * Return the slot body in the exact form the agent yaml stores it. For
 * persona / memory that's the raw string verbatim. For model / tools / io we
 * JSON-stringify the structured value so the LLM can echo a deterministic
 * block back into <sf:agent-model> etc. The token counts in agent.anchors
 * were computed against this same representation in agent-yaml.ts, so the
 * `tokens` field stays consistent with `body.length / 4`.
 */
function slotBodyVerbatim(slot: SkillSlot, agent: ReturnType<typeof loadAgent>): string {
  if ('error' in agent) return '';
  switch (slot) {
    case 'persona':
      return agent.persona;
    case 'memory':
      return agent.memory ?? '';
    case 'model':
      return JSON.stringify(agent.model);
    case 'tools':
      return JSON.stringify(agent.tools);
    case 'io':
      return JSON.stringify(agent.io ?? {});
  }
}

async function execRegisterAgent(input: unknown): Promise<ToolExecutionResult> {
  if (!isRecord(input)) return errResult('register_agent: input must be an object');

  const required: Array<keyof typeof input> = [
    'node_id',
    'title',
    'type',
    'model_id',
    'tools_picked',
    'persona',
    'persona_source',
    'persona_tokens',
    'persona_cached',
  ];
  for (const k of required) {
    if (input[k as string] === undefined) {
      return errResult(`register_agent: missing required field "${String(k)}"`);
    }
  }

  if (typeof input.node_id !== 'string' || input.node_id.length === 0) {
    return errResult('register_agent: node_id must be a non-empty string');
  }
  if (typeof input.title !== 'string') {
    return errResult('register_agent: title must be a string');
  }
  if (input.type !== 'agent' && input.type !== 'coordinator') {
    return errResult('register_agent: type must be "agent" or "coordinator"');
  }
  if (typeof input.model_id !== 'string') {
    return errResult('register_agent: model_id must be a string');
  }
  if (!Array.isArray(input.tools_picked) || !input.tools_picked.every((t) => typeof t === 'string')) {
    return errResult('register_agent: tools_picked must be string[]');
  }
  if (
    input.tools_candidate !== undefined &&
    (!Array.isArray(input.tools_candidate) ||
      !input.tools_candidate.every((t) => typeof t === 'string'))
  ) {
    return errResult('register_agent: tools_candidate must be string[] when provided');
  }
  if (typeof input.persona !== 'string') {
    return errResult('register_agent: persona must be a string');
  }
  if (typeof input.persona_source !== 'string') {
    return errResult('register_agent: persona_source must be a string');
  }
  if (typeof input.persona_tokens !== 'number') {
    return errResult('register_agent: persona_tokens must be a number');
  }
  if (typeof input.persona_cached !== 'boolean') {
    return errResult('register_agent: persona_cached must be a boolean');
  }

  // sf:node-equivalent payload — runtime emits this downstream as the
  // structured side-effect. Shape matches the existing `<sf:node>` schema in
  // parser.ts so S5 can wrap it 1:1.
  const nodeData = {
    node_id: input.node_id,
    title: input.title,
    type: input.type,
    model: {
      id: input.model_id,
      temperature: typeof input.model_temperature === 'number' ? input.model_temperature : undefined,
      max_tokens: typeof input.model_max_tokens === 'number' ? input.model_max_tokens : undefined,
      context_window:
        typeof input.model_context_window === 'number' ? input.model_context_window : undefined,
    },
    tools: {
      picked: input.tools_picked,
      candidate: Array.isArray(input.tools_candidate) ? input.tools_candidate : [],
    },
    persona: {
      body: input.persona,
      source: input.persona_source,
      tokens: input.persona_tokens,
      cached: input.persona_cached,
    },
    memory: typeof input.memory === 'string' ? input.memory : undefined,
    io: {
      input: input.io_input,
      output: input.io_output,
    },
  };

  return {
    output: { ok: true, node_id: input.node_id },
    sseEvents: [{ event: 'sf-node', data: nodeData }],
  };
}

async function execRegisterEdge(input: unknown): Promise<ToolExecutionResult> {
  if (!isRecord(input)) return errResult('register_edge: input must be an object');
  if (typeof input.from !== 'string' || input.from.length === 0) {
    return errResult('register_edge: from must be a non-empty string');
  }
  if (typeof input.to !== 'string' || input.to.length === 0) {
    return errResult('register_edge: to must be a non-empty string');
  }
  if (input.kind !== undefined && !isEdgeKind(input.kind)) {
    return errResult(
      `register_edge: kind must be one of ${VALID_EDGE_KINDS.join('|')} (got ${JSON.stringify(input.kind)})`,
    );
  }
  if (input.condition !== undefined && typeof input.condition !== 'string') {
    return errResult('register_edge: condition must be a string when provided');
  }
  if (input.max_retries !== undefined && typeof input.max_retries !== 'number') {
    return errResult('register_edge: max_retries must be a number when provided');
  }

  const edgeData = {
    from: input.from,
    to: input.to,
    kind: (input.kind as EdgeKindIn | undefined) ?? 'sequential',
    condition: typeof input.condition === 'string' ? input.condition : undefined,
    max_retries: typeof input.max_retries === 'number' ? input.max_retries : undefined,
  };

  return {
    output: { ok: true },
    sseEvents: [{ event: 'sf-edge', data: edgeData }],
  };
}

/**
 * Name → executor. ConversationRuntime (S5) wires this into its dispatch
 * table. Keep keys byte-identical to ToolSpec.name above — the runtime looks
 * up by exact match.
 */
export const skillAnchorExecutors: Record<string, ToolExecutor> = {
  list_team_agents: execListTeamAgents,
  get_skill_anchor: execGetSkillAnchor,
  register_agent: execRegisterAgent,
  register_edge: execRegisterEdge,
};

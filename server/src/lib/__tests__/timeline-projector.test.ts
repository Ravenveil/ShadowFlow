/**
 * timeline-projector.test.ts — projector unit tests (no framework).
 *
 * Run with:
 *   cd server
 *   npx tsx src/lib/__tests__/timeline-projector.test.ts
 *
 * Mirrors the intent-router.test.ts / classify-error.test.ts no-framework
 * pattern (the server package doesn't ship vitest). Coverage:
 *
 *   1. user_turn opens a turn (turn_id changes, prior msg_foot finalized)
 *   2. classify → assistant_meta (first only), msg_foot created
 *   3. step_panel — append_step on running, update_step on done
 *   4. step_panel id is STABLE across multiple steps (same turn)
 *   5. step_panel id RESETS on new turn
 *   6. agent-substep — append_substep / update_substep ordering
 *   7. thinking — open, chunks → append_body patches, blueprint closes it
 *   8. diff_panel — message first then patches for each yaml-line
 *   9. msg_foot patches accumulate as steps complete
 *  10. End-to-end: synthesizeTeamRun-style sequence produces consistent IDs
 *  11. onComplete finalizes thinking + msg_foot
 */

import { createTimelineProjector } from '../timeline-projector';
import type { MessagePatch, TimelineMessage } from '../contracts';

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

function assert(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

// ── Test 1: user_turn opens a turn ───────────────────────────────────────────
console.log('\n[1] user_turn opens turn');
{
  const p = createTimelineProjector();
  const r1 = p.onUserMessage('帮我搭一个 BMAD team');
  check('emit 1 message', 1, r1.messages.length);
  check('first kind=user_turn', 'user_turn', r1.messages[0].kind);
  const ut = r1.messages[0] as Extract<TimelineMessage, { kind: 'user_turn' }>;
  check('user_turn text preserved', '帮我搭一个 BMAD team', ut.text);
  assert('turn_id present', typeof r1.messages[0].turn_id === 'string' && r1.messages[0].turn_id.length > 0);
}

// ── Test 2: classify → assistant_meta + msg_foot ─────────────────────────────
console.log('\n[2] classify → assistant_meta + msg_foot');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  const r = p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.98, complexity: 4, source: 'ts' });
  check('emits 2 messages (assistant_meta + msg_foot)', 2, r.messages.length);
  check('first is assistant_meta', 'assistant_meta', r.messages[0].kind);
  check('second is msg_foot', 'msg_foot', r.messages[1].kind);
  const meta = r.messages[0] as Extract<TimelineMessage, { kind: 'assistant_meta' }>;
  assert('summary contains confidence', meta.summary.includes('0.98'));

  // Second classify is ignored (front-end keeps legacy event)
  const r2 = p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, source: 'llm' });
  check('second classify emits 0 messages', 0, r2.messages.length);
  check('second classify emits 0 patches', 0, r2.patches.length);
}

// ── Test 3: step_panel append_step on running, update_step on done ──────────
console.log('\n[3] step_panel patch lifecycle');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  const r1 = p.onAssembleStart(0, '分析目标需求');
  // Expect: step_panel message (first time) + append_step patch
  check('first assemble emits step_panel message', 'step_panel', r1.messages[0]?.kind);
  const panelId = r1.messages[0]!.id;
  const appendPatch = r1.patches.find((x) => x.op === 'append_step') as Extract<MessagePatch, { op: 'append_step' }>;
  assert('append_step patch present', !!appendPatch);
  check('append_step targets the panel', panelId, appendPatch.id);
  check('append_step name', '分析目标需求', appendPatch.step.name);
  check('append_step status running', 'running', appendPatch.step.status);

  const r2 = p.onAssembleDone(0, 200);
  const updatePatch = r2.patches.find((x) => x.op === 'update_step') as Extract<MessagePatch, { op: 'update_step' }>;
  assert('update_step patch present', !!updatePatch);
  check('update_step targets same panel id (stable!)', panelId, updatePatch.id);
  check('update_step status done', 'done', updatePatch.patch.status);
  check('update_step elapsed', 200, updatePatch.patch.elapsed_ms);
}

// ── Test 4: step_panel id stable across multiple steps ──────────────────────
console.log('\n[4] step_panel id stable across steps');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  const r1 = p.onAssembleStart(0, 'step A');
  const panelId = r1.messages[0]!.id;
  p.onAssembleDone(0, 100);
  const r2 = p.onAssembleStart(1, 'step B');
  // Second start should NOT emit a new step_panel message
  check('second step start emits 0 new messages', 0, r2.messages.length);
  const append2 = r2.patches.find((x) => x.op === 'append_step') as Extract<MessagePatch, { op: 'append_step' }>;
  check('append_step still targets original panel id', panelId, append2.id);
}

// ── Test 5: step_panel id resets on new turn ────────────────────────────────
console.log('\n[5] step_panel resets on new turn');
{
  const p = createTimelineProjector();
  p.onUserMessage('first');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  const r1 = p.onAssembleStart(0, 'A');
  const panel1 = r1.messages[0]!.id;
  const turn1 = r1.messages[0]!.turn_id;
  p.onAssembleDone(0, 100);

  p.onUserMessage('second');
  const r2 = p.onAssembleStart(0, 'A');
  const panel2 = r2.messages[0]!.id;
  const turn2 = r2.messages[0]!.turn_id;
  assert('new turn has different panel id', panel1 !== panel2);
  assert('new turn has different turn_id', turn1 !== turn2);
}

// ── Test 6: agent-substep append/update ─────────────────────────────────────
console.log('\n[6] agent-substep lifecycle');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  p.onAssembleStart(2, '配置 Agent 角色');
  const r1 = p.onAgentSubstepStart('agent-pm', 'identity');
  const appendSub = r1.patches.find((x) => x.op === 'append_substep') as Extract<MessagePatch, { op: 'append_substep' }>;
  assert('append_substep patch emitted', !!appendSub);
  check('substep status running', 'running', appendSub.sub.status);
  check('substep name composed', 'agent-pm · identity', appendSub.sub.name);

  const r2 = p.onAgentSubstepDone('agent-pm', 'identity', 80);
  const updateSub = r2.patches.find((x) => x.op === 'update_substep') as Extract<MessagePatch, { op: 'update_substep' }>;
  assert('update_substep patch emitted', !!updateSub);
  check('update_substep status done', 'done', updateSub.patch.status);
  check('update_substep elapsed', 80, updateSub.patch.elapsed_ms);

  // Duplicate start is idempotent (no double append)
  const r3 = p.onAgentSubstepStart('agent-pm', 'identity');
  check('duplicate substep start emits 0 patches', 0, r3.patches.length);
}

// ── Test 7: thinking lifecycle ──────────────────────────────────────────────
console.log('\n[7] thinking lifecycle');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  const r1 = p.onThinkingChunk('Hmm, ');
  check('thinking opens a message', 1, r1.messages.length);
  check('thinking message kind', 'thinking', r1.messages[0].kind);
  const tid = r1.messages[0]!.id;
  const tMsg = r1.messages[0] as Extract<TimelineMessage, { kind: 'thinking' }>;
  check('thinking status streaming', 'streaming', tMsg.status);
  const appendBody = r1.patches.find((x) => x.op === 'thinking_append_body') as Extract<MessagePatch, { op: 'thinking_append_body' }>;
  assert('append_body patch present', !!appendBody);
  check('chunk preserved', 'Hmm, ', appendBody.chunk);

  const r2 = p.onThinkingChunk('let me think');
  check('second chunk: no new message', 0, r2.messages.length);
  const appendBody2 = r2.patches.find((x) => x.op === 'thinking_append_body') as Extract<MessagePatch, { op: 'thinking_append_body' }>;
  check('second append_body targets same id', tid, appendBody2.id);

  // Blueprint closes thinking
  const r3 = p.onBlueprint({ filename: 'team.yml', yaml: 'name: x' });
  const finalize = r3.patches.find((x) => x.op === 'thinking_finalize') as Extract<MessagePatch, { op: 'thinking_finalize' }>;
  assert('thinking finalized on blueprint', !!finalize);
  check('finalize targets the open thinking id', tid, finalize.id);
}

// ── Test 8: diff_panel + yaml-line ──────────────────────────────────────────
console.log('\n[8] diff_panel + yaml-line stream');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  const rb = p.onBlueprint({ filename: 'bmad-team.yml', yaml: '' });
  const diffMsg = rb.messages.find((x) => x.kind === 'diff_panel') as Extract<TimelineMessage, { kind: 'diff_panel' }>;
  assert('diff_panel message emitted', !!diffMsg);
  check('diff_panel filename', 'bmad-team.yml', diffMsg.filename);
  check('diff_panel lines empty initially', 0, diffMsg.lines.length);
  const diffId = diffMsg.id;

  const r1 = p.onYamlLine('name: bmad-team');
  const appendLine = r1.patches.find((x) => x.op === 'diff_append_line') as Extract<MessagePatch, { op: 'diff_append_line' }>;
  assert('first yaml line emits diff_append_line', !!appendLine);
  check('line targets diff_panel id', diffId, appendLine.id);
  check('line mark', '+', appendLine.line.mark);
  check('line no=1', 1, appendLine.line.no);
  check('line code', 'name: bmad-team', appendLine.line.code);

  const r2 = p.onYamlLine('mode: serial');
  const appendLine2 = r2.patches[0] as Extract<MessagePatch, { op: 'diff_append_line' }>;
  check('second line no=2', 2, appendLine2.line.no);
}

// ── Test 9: msg_foot patches accumulate ─────────────────────────────────────
console.log('\n[9] msg_foot tools count accumulates');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  const rc = p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  const footMsg = rc.messages.find((x) => x.kind === 'msg_foot') as Extract<TimelineMessage, { kind: 'msg_foot' }>;
  const footId = footMsg.id;

  const rb = p.onBlueprint({ filename: 'team.yml' });
  const footPatch = rb.patches.find((x) => x.op === 'msg_foot_update') as Extract<MessagePatch, { op: 'msg_foot_update' }>;
  assert('blueprint patches msg_foot', !!footPatch);
  check('footPatch targets msg_foot id', footId, footPatch.id);
  check('tools=1 after first blueprint', 1, footPatch.patch.tools);
}

// ── Test 10: end-to-end synthesizeTeamRun-style sequence ───────────────────
console.log('\n[10] end-to-end sequence (simulates synthesizeTeamRun)');
{
  const p = createTimelineProjector();
  const allMessages: TimelineMessage[] = [];
  const allPatches: MessagePatch[] = [];
  const drain = (r: { messages: TimelineMessage[]; patches: MessagePatch[] }) => {
    allMessages.push(...r.messages);
    allPatches.push(...r.patches);
  };

  drain(p.onUserMessage('搭一个 BMAD team'));
  drain(p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.98, complexity: 4, source: 'ts' }));
  drain(p.onAssembleStart(0, '分析目标需求'));
  drain(p.onThinkingChunk('命中 skill team — 跳过 LLM'));
  drain(p.onAssembleDone(0, 200));
  drain(p.onAssembleStart(1, '挑选 Team 蓝图'));
  drain(p.onAssembleDone(1, 200));
  drain(p.onAssembleStart(2, '配置 Agent 角色'));
  for (const node of ['pm', 'arch', 'dev', 'qa']) {
    for (const sub of ['identity', 'persona', 'model', 'tools', 'memory']) {
      drain(p.onAgentSubstepStart(node, sub));
      drain(p.onAgentSubstepDone(node, sub, 80));
    }
  }
  drain(p.onAssembleDone(2, 1600));
  drain(p.onAssembleStart(3, '设置工具集'));
  drain(p.onBlueprint({ filename: 'bmad-team.yml', yaml: 'name: t' }));
  drain(p.onYamlLine('name: bmad-team'));
  drain(p.onYamlLine('mode: serial'));
  drain(p.onAssembleDone(3, 300));
  drain(p.onAssembleStart(4, 'Policy 协作规则'));
  drain(p.onAssembleDone(4, 200));
  drain(p.onComplete());

  // Invariants:
  const stepPanels = allMessages.filter((m) => m.kind === 'step_panel');
  check('exactly 1 step_panel message in the turn', 1, stepPanels.length);
  const diffPanels = allMessages.filter((m) => m.kind === 'diff_panel');
  check('exactly 1 diff_panel message', 1, diffPanels.length);
  const userTurns = allMessages.filter((m) => m.kind === 'user_turn');
  check('1 user_turn', 1, userTurns.length);
  const footMessages = allMessages.filter((m) => m.kind === 'msg_foot');
  check('1 msg_foot', 1, footMessages.length);

  // All messages share the same turn_id
  const turnIds = new Set(allMessages.map((m) => m.turn_id));
  check('all messages share one turn_id', 1, turnIds.size);

  // Substep patches all target the single step_panel id
  const subPatches = allPatches.filter((x) => x.op === 'append_substep' || x.op === 'update_substep');
  const panelId = stepPanels[0]!.id;
  const allTargetPanel = subPatches.every((x) => x.id === panelId);
  assert('all substep patches target the step_panel id', allTargetPanel);
  check('exactly 4 agents × 5 substeps = 20 append_substep', 20, allPatches.filter((x) => x.op === 'append_substep').length);
  check('exactly 20 update_substep patches', 20, allPatches.filter((x) => x.op === 'update_substep').length);

  // msg_foot status should end as done
  const finalFootPatches = allPatches.filter((x) => x.op === 'msg_foot_update') as Array<Extract<MessagePatch, { op: 'msg_foot_update' }>>;
  const lastFoot = finalFootPatches[finalFootPatches.length - 1];
  check('last msg_foot status=done', 'done', lastFoot.patch.status);

  // id uniqueness
  const ids = allMessages.map((m) => m.id);
  check('all message ids unique', ids.length, new Set(ids).size);
}

// ── Test 11: onComplete finalizes thinking + msg_foot ───────────────────────
console.log('\n[11] onComplete cleanup');
{
  const p = createTimelineProjector();
  p.onUserMessage('q');
  p.onClassify({ output_type: 'workflow', mode: 'team', confidence: 0.9, complexity: 3, source: 'ts' });
  p.onThinkingChunk('analyzing');
  const r = p.onComplete();
  const finalize = r.patches.find((x) => x.op === 'thinking_finalize') as Extract<MessagePatch, { op: 'thinking_finalize' }>;
  assert('thinking finalized on complete', !!finalize);
  const footUpd = r.patches.find((x) => x.op === 'msg_foot_update') as Extract<MessagePatch, { op: 'msg_foot_update' }>;
  assert('msg_foot updated to done', footUpd?.patch.status === 'done');
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

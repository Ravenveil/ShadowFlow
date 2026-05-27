/**
 * run-event-bus.test.ts — T3-1 RunBus unit smoke (standalone tsx).
 *
 * Run with:  npx tsx src/lib/__tests__/run-event-bus.test.ts
 *
 * Covers the contract the route layer relies on:
 *   - monotonic event ids + ring-buffer cap
 *   - attach replays from a cursor (?after) — the resume mechanism
 *   - attach after terminal ends immediately (no live wait)
 *   - live fan-out to attached sinks
 *   - claimStart returns true exactly once (single-start guard kills re-run)
 *   - finish ends clients; cancel aborts the signal
 *   - detach stops live delivery
 */

import { createRunBus, type RunEventRecord, type RunEventSink } from '../run-event-bus';

let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown): void {
  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} (expected truthy)`); }
}

/** Collecting sink: records events + whether end() fired. */
function makeSink(): RunEventSink & { got: RunEventRecord[]; ended: boolean } {
  const got: RunEventRecord[] = [];
  const s = {
    got,
    ended: false,
    send(rec: RunEventRecord) { got.push(rec); },
    end() { (s as { ended: boolean }).ended = true; },
  };
  return s;
}

// ── 1: monotonic ids + buffering ────────────────────────────────────────────
{
  console.log('\n[1] emit assigns monotonic ids + buffers');
  const bus = createRunBus();
  bus.ensure('r1');
  const a = bus.emit('r1', 'text', { t: 'a' });
  const b = bus.emit('r1', 'text', { t: 'b' });
  check('first id = 1', 1, a?.id);
  check('second id = 2', 2, b?.id);
  check('event/data preserved', { event: 'text', data: { t: 'b' } }, { event: b?.event, data: b?.data });
}

// ── 2: attach replays all from cursor 0 ──────────────────────────────────────
{
  console.log('\n[2] attach(after=0) replays all buffered');
  const bus = createRunBus();
  bus.ensure('r2');
  bus.emit('r2', 'classify', { x: 1 });
  bus.emit('r2', 'text', { x: 2 });
  const sink = makeSink();
  bus.attach('r2', 0, sink);
  check('replayed 2 events', 2, sink.got.length);
  check('replay ids in order', [1, 2], sink.got.map((e) => e.id));
  ok('not ended (still running)', !sink.ended);
}

// ── 3: attach with ?after replays only missed (RESUME) ───────────────────────
{
  console.log('\n[3] attach(after=N) resumes — only id>N replayed');
  const bus = createRunBus();
  bus.ensure('r3');
  bus.emit('r3', 'a', {});
  bus.emit('r3', 'b', {});
  bus.emit('r3', 'c', {});
  const sink = makeSink();
  bus.attach('r3', 2, sink); // client already saw 1 and 2
  check('only event 3 replayed', [3], sink.got.map((e) => e.id));
}

// ── 4: attach after terminal ends immediately ────────────────────────────────
{
  console.log('\n[4] attach after terminal → end(), no live registration');
  const bus = createRunBus();
  bus.ensure('r4');
  bus.emit('r4', 'a', {});
  bus.finish('r4', 'succeeded');
  const sink = makeSink();
  bus.attach('r4', 0, sink);
  check('replayed the 1 buffered event', 1, sink.got.length);
  ok('ended immediately', sink.ended);
  // A late emit must NOT reach this sink (run is terminal, client not registered).
  bus.emit('r4', 'b', {});
  check('no live event after terminal', 1, sink.got.length);
}

// ── 5: live fan-out ──────────────────────────────────────────────────────────
{
  console.log('\n[5] live events fan out to attached sinks');
  const bus = createRunBus();
  bus.ensure('r5');
  const s1 = makeSink();
  const s2 = makeSink();
  bus.attach('r5', 0, s1);
  bus.attach('r5', 0, s2);
  bus.emit('r5', 'text', { t: 'live' });
  check('s1 got live', 1, s1.got.length);
  check('s2 got live (shared run)', 1, s2.got.length);
}

// ── 6: claimStart returns true exactly once (single-start guard) ─────────────
{
  console.log('\n[6] claimStart true once — kills re-run on reconnect');
  const bus = createRunBus();
  const first = bus.claimStart('r6');
  const second = bus.claimStart('r6'); // simulated reconnect
  const third = bus.claimStart('r6');
  ok('first claim wins', first);
  ok('reconnect does NOT re-claim (#2)', !second);
  ok('reconnect does NOT re-claim (#3)', !third);
}

// ── 7: ring-buffer cap drops oldest ──────────────────────────────────────────
{
  console.log('\n[7] ring buffer cap drops oldest');
  const bus = createRunBus({ maxEvents: 3 });
  bus.ensure('r7');
  for (let i = 0; i < 5; i++) bus.emit('r7', 'x', { i });
  const sink = makeSink();
  bus.attach('r7', 0, sink);
  check('only last 3 retained', 3, sink.got.length);
  check('oldest dropped — ids 3,4,5', [3, 4, 5], sink.got.map((e) => e.id));
}

// ── 8: finish ends clients ───────────────────────────────────────────────────
{
  console.log('\n[8] finish ends attached clients');
  const bus = createRunBus();
  bus.ensure('r8');
  const sink = makeSink();
  bus.attach('r8', 0, sink);
  bus.finish('r8', 'succeeded');
  ok('client ended on finish', sink.ended);
  check('run status terminal', true, bus.isTerminal(bus.get('r8')!.status));
}

// ── 9: cancel aborts signal + terminal ───────────────────────────────────────
{
  console.log('\n[9] cancel aborts execution signal');
  const bus = createRunBus();
  const run = bus.ensure('r9');
  let aborted = false;
  run.abort.signal.addEventListener('abort', () => { aborted = true; });
  bus.cancel('r9');
  ok('abort signal fired', aborted);
  check('status canceled', 'canceled', bus.get('r9')!.status);
}

// ── 10: detach stops live delivery ───────────────────────────────────────────
{
  console.log('\n[10] detach stops live delivery');
  const bus = createRunBus();
  bus.ensure('r10');
  const sink = makeSink();
  const detach = bus.attach('r10', 0, sink);
  bus.emit('r10', 'a', {});
  detach();
  bus.emit('r10', 'b', {});
  check('only pre-detach event delivered', 1, sink.got.length);
}

// ── 11: cleanup after ttl (injected scheduler) ───────────────────────────────
{
  console.log('\n[11] terminal run cleaned up after ttl');
  const tasks: Array<() => void> = [];
  const bus = createRunBus({ ttlMs: 1000, schedule: (fn) => { tasks.push(fn); } });
  bus.ensure('r11');
  bus.finish('r11', 'succeeded');
  ok('run still queryable before cleanup', !!bus.get('r11'));
  tasks.forEach((fn) => fn()); // fire scheduled cleanup
  ok('run gone after cleanup', !bus.get('r11'));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

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
 *   - wait() resolves on terminal (finish/cancel/reset); immediate when already terminal
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

// ── 12: reset drops the run so claimStart re-runs (retry/resume) ─────────────
{
  console.log('\n[12] reset → next claimStart re-runs (full_rerun)');
  const bus = createRunBus();
  bus.claimStart('r12');
  bus.emit('r12', 'a', {});
  const sink = makeSink();
  bus.attach('r12', 0, sink);
  bus.reset('r12');
  ok('attached view ended on reset', sink.ended);
  ok('run removed', !bus.get('r12'));
  ok('claimStart true again after reset (re-run allowed)', bus.claimStart('r12'));
  // Fresh run: event ids restart at 1.
  const rec = bus.emit('r12', 'b', {});
  check('fresh run id restarts at 1', 1, rec?.id);
}

// ── 13: setExit writes exitCode/signal readable via get() (A10) ──────────────
{
  console.log('\n[13] setExit records exitCode/signal');
  const bus = createRunBus();
  bus.ensure('r13');
  // defaults are null before any exit is recorded
  check('exitCode defaults null', null, bus.get('r13')!.exitCode);
  check('signal defaults null', null, bus.get('r13')!.signal);
  bus.setExit('r13', 0, null);
  check('clean exit code persisted', 0, bus.get('r13')!.exitCode);
  bus.setExit('r13', null, 'SIGKILL');
  check('signal persisted', 'SIGKILL', bus.get('r13')!.signal);
  check('exitCode cleared with signal', null, bus.get('r13')!.exitCode);
  // unknown run is a no-op (must not throw)
  bus.setExit('does-not-exist', 1, null);
  ok('setExit on unknown run is a no-op', !bus.get('does-not-exist'));
}

// Async blocks (shutdownActive returns a Promise). Wrapped in an async IIFE
// because tsx compiles this file to CJS where top-level await is unsupported.
async function asyncTests(): Promise<void> {
  // ── 14: shutdownActive cancels all non-terminal runs + fires aborts (A8) ────
  {
    console.log('\n[14] shutdownActive cancels every active run');
    const bus = createRunBus();
    const ids = ['s1', 's2', 's3'];
    const aborts: Record<string, boolean> = {};
    for (const id of ids) {
      const run = bus.ensure(id);
      aborts[id] = false;
      run.abort.signal.addEventListener('abort', () => { aborts[id] = true; });
    }
    // graceMs:0 skips the wait so the test stays synchronous-ish.
    await bus.shutdownActive({ graceMs: 0 });
    for (const id of ids) {
      check(`${id} canceled`, 'canceled', bus.get(id)!.status);
      ok(`${id} abort fired`, aborts[id]);
    }
  }

  // ── 15: shutdownActive skips already-terminal runs (no double-process) ──────
  {
    console.log('\n[15] shutdownActive does not reprocess terminal runs');
    const bus = createRunBus();
    // A run that already succeeded must keep its status, not flip to canceled.
    bus.ensure('done');
    bus.finish('done', 'succeeded');
    // And an already-canceled run whose abort already fired stays put.
    const canceledRun = bus.ensure('cx');
    let cxAbortCount = 0;
    canceledRun.abort.signal.addEventListener('abort', () => { cxAbortCount++; });
    bus.cancel('cx');
    // One still-running run that SHOULD be canceled.
    bus.ensure('live');
    await bus.shutdownActive({ graceMs: 0 });
    check('terminal succeeded run untouched', 'succeeded', bus.get('done')!.status);
    check('already-canceled run untouched', 'canceled', bus.get('cx')!.status);
    check('cx abort fired exactly once (not re-aborted)', 1, cxAbortCount);
    check('the live run got canceled', 'canceled', bus.get('live')!.status);
  }

  // ── 16: shutdownActive resolves with no active runs ────────────────────────
  {
    console.log('\n[16] shutdownActive is a clean no-op when nothing is active');
    const bus = createRunBus();
    await bus.shutdownActive({ graceMs: 0 });
    ok('resolved with empty bus', true);
  }

  // ── 17: wait() resolves on finish with the terminal status ─────────────────
  {
    console.log('\n[17] wait() resolves when run finishes');
    const bus = createRunBus();
    bus.ensure('w1');
    const p = bus.wait('w1');
    let settled = false;
    void p.then(() => { settled = true; });
    // Not yet — run still running.
    await Promise.resolve();
    ok('wait pending while running', !settled);
    bus.finish('w1', 'succeeded');
    check('wait resolves with finish status', 'succeeded', await p);
  }

  // ── 18: wait() resolves on cancel as canceled ──────────────────────────────
  {
    console.log('\n[18] wait() resolves canceled when run is canceled');
    const bus = createRunBus();
    bus.ensure('w2');
    const p = bus.wait('w2');
    bus.cancel('w2');
    check('wait resolves canceled', 'canceled', await p);
  }

  // ── 19: wait() on an already-terminal run resolves immediately ─────────────
  {
    console.log('\n[19] wait() on already-terminal run resolves immediately');
    const bus = createRunBus();
    bus.ensure('w3');
    bus.finish('w3', 'failed');
    check('immediate terminal status', 'failed', await bus.wait('w3'));
    // Absent run: safe immediate 'canceled', never hangs.
    check('wait on unknown run resolves canceled', 'canceled', await bus.wait('nope'));
  }

  // ── 20: multiple waiters all resolve on the same terminal transition ───────
  {
    console.log('\n[20] every waiter resolves on a single finish');
    const bus = createRunBus();
    bus.ensure('w4');
    const ps = [bus.wait('w4'), bus.wait('w4'), bus.wait('w4')];
    bus.finish('w4', 'succeeded');
    const results = await Promise.all(ps);
    check('all three waiters resolved succeeded', ['succeeded', 'succeeded', 'succeeded'], results);
  }

  // ── 21: reset() resolves pending waiters (no permanent hang) ───────────────
  {
    console.log('\n[21] reset() resolves pending waiters instead of hanging');
    const bus = createRunBus();
    bus.claimStart('w5');
    const p = bus.wait('w5');
    bus.reset('w5');
    check('non-terminal reset resolves canceled', 'canceled', await p);
    ok('run removed after reset', !bus.get('w5'));
  }
}

void asyncTests().then(() => {
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
});

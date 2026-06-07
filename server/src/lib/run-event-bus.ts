/**
 * run-event-bus.ts — T3-1 (docs/architecture/opendesign-streaming-architecture-study.md §5).
 *
 * The "missing backend" piece modelled on OpenDesign's `apps/daemon/src/runs.ts`:
 * a run is a PERSISTENT entity with a monotonically-numbered, buffered event log
 * and a set of attached SSE views. The agent/pipeline runs ONCE and `emit()`s
 * into the log; SSE connections are detachable/re-attachable VIEWS that resume
 * from a cursor (`?after` / Last-Event-ID).
 *
 * This decouples *execution* from the *SSE connection* and fixes the two
 * architectural symptoms the previous design had (audit 2026-05-27):
 *   - P3 (user message shown twice): reconnect used to re-run the whole pipeline
 *     through a fresh projector with new random ids. With a single run + stable
 *     monotonic event ids, a reconnect replays the SAME buffered events — no
 *     duplication, no re-run.
 *   - Wasted tokens / inconsistent output: N reconnects = N LLM executions
 *     previously. Now N views share ONE execution.
 *
 * Express-agnostic by design: `attach()` takes a plain `RunEventSink` so this
 * module stays unit-testable without HTTP. The route layer owns res/heartbeat/
 * req-close and adapts them to a sink.
 */

/** One buffered event. `id` is monotonic within a run (1-based). */
export interface RunEventRecord {
  id: number;
  event: string;
  data: unknown;
  ts: number;
}

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'canceled';

/**
 * O2 / T3-5 — the serializable subset of a Run, written to disk by an injected
 * RunPersistence so the timeline survives a Node restart. Excludes the live-only
 * fields (clients, abort, waiters) which are reconstructed empty on hydrate.
 */
export interface RunSnapshot {
  id: string;
  status: RunStatus;
  events: RunEventRecord[];
  nextEventId: number;
  exitCode: number | null;
  signal: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Injected disk-persistence adapter (impl: run-event-store.ts). Kept as an
 * interface so run-event-bus stays Express/fs-agnostic and unit-testable with a
 * fake. All methods are best-effort: the bus never awaits or depends on them
 * for correctness — disk is a recovery log, memory is the runtime truth.
 */
export interface RunPersistence {
  /** Persist (typically debounced) a run snapshot. */
  save(snap: RunSnapshot): void;
  /** Remove a run's persisted snapshot. */
  remove(id: string): void;
  /** Synchronously load all persisted snapshots (called once at construction). */
  loadAllSync(): RunSnapshot[];
  /**
   * O4 — synchronously load a SINGLE persisted snapshot by id, or undefined if
   * absent. Optional for back-compat with existing fakes; when omitted, the
   * bus's lazy `hydrateOne()` can only serve runs already loaded at startup.
   * Used to recover a run whose snapshot is on disk but was never hydrated
   * (e.g. created after startup, then the in-memory run was GC'd by TTL while
   * its disk snapshot lingered — a narrow window, but it lets /stream replay
   * read-only instead of hard-404ing).
   */
  loadOneSync?(id: string): RunSnapshot | undefined;
}

const TERMINAL: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'succeeded',
  'failed',
  'canceled',
]);

/** A connected SSE view. The route layer implements these against `res`. */
export interface RunEventSink {
  /** Write one event frame. Called for replayed AND live events. */
  send(rec: RunEventRecord): void;
  /** Stream finished (run reached terminal). Close the HTTP response. */
  end(): void;
}

export interface Run {
  id: string;
  status: RunStatus;
  events: RunEventRecord[];
  nextEventId: number;
  clients: Set<RunEventSink>;
  /** Aborts the underlying execution (LLM stream / child process). */
  abort: AbortController;
  /** True once a pipeline has been claimed to start (single-start guard). */
  started: boolean;
  /**
   * Pending `wait()` resolvers. Each is called with the run's terminal status
   * exactly once when the run reaches a terminal state (finish / cancel /
   * shutdownActive) or is dropped (reset), then the set is cleared so no
   * waiter ever hangs forever. Mirrors OpenDesign `runs.ts` `run.waiters`.
   */
  waiters: Set<(status: RunStatus) => void>;
  /**
   * Exit code of the underlying CLI child process, once known (A10). `null`
   * means "not exited via code" (still running, killed by signal, or never
   * spawned a child). Lets callers distinguish a crash (non-zero) from a clean
   * exit (0) after the run reaches a terminal status.
   */
  exitCode: number | null;
  /**
   * Terminating signal of the underlying CLI child process, once known (A10).
   * e.g. `'SIGTERM'` / `'SIGKILL'`. `null` when the child exited via a code or
   * never spawned.
   */
  signal: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RunBusOptions {
  /** Ring-buffer cap per run (drop oldest beyond this). */
  maxEvents?: number;
  /** How long after terminal a run stays queryable, ms. */
  ttlMs?: number;
  /** Injectable clock + cleanup scheduler (tests). */
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => void;
  /**
   * O2 / T3-5 — optional disk persistence. When provided, runs are hydrated
   * from it at construction and snapshots are saved on emit/finish/setExit and
   * removed on reset/cleanup. Omit (the default) for pure in-memory behavior —
   * existing callers and the 28 unit tests are unaffected.
   */
  persist?: RunPersistence;
}

export interface RunBus {
  /** Get an existing run, or create one in `running` state. */
  ensure(id: string): Run;
  get(id: string): Run | undefined;
  /**
   * O4 — lazily recover a single run from disk if it isn't in memory. Returns
   * the run if it's already in memory OR was successfully loaded from the
   * injected persistence's `loadOneSync`; undefined if there's nothing to
   * recover (no persistence, no `loadOneSync`, or no snapshot on disk). A
   * recovered run is hydrated with the SAME semantics as startup hydration:
   * non-terminal (crash-interrupted) snapshots get a synthetic terminal error
   * frame + `canceled` status and `started:true` so it is served READ-ONLY
   * (never re-run). Idempotent — a no-op for an already-present run.
   */
  hydrateOne(id: string): Run | undefined;
  /**
   * Claim the right to start this run's pipeline. Returns true exactly once per
   * run (the FIRST caller); subsequent callers (reconnects) get false and must
   * NOT re-run — they only attach. Creates the run if absent.
   */
  claimStart(id: string): boolean;
  /** Append an event: assign monotonic id, buffer (capped), fan out to clients. */
  emit(id: string, event: string, data: unknown): RunEventRecord | undefined;
  /**
   * Attach an SSE view. Replays buffered events with `id > after`, then (unless
   * already terminal) registers the sink for live events. Returns a detach fn.
   * If terminal after replay, calls `sink.end()` and returns a no-op detach.
   */
  attach(id: string, after: number, sink: RunEventSink): () => void;
  /** Mark terminal, flush `end` to clients, schedule cleanup. Idempotent. */
  finish(id: string, status: Exclude<RunStatus, 'running'>): void;
  /**
   * Resolve when the run reaches a terminal status (OpenDesign `runs.ts:198`).
   * If the run is absent (never created / already cleaned up) or already
   * terminal, resolves immediately with the current/terminal status; otherwise
   * registers a waiter that fires on the next finish/cancel/reset transition.
   * Never rejects, never hangs past a terminal/reset transition.
   */
  wait(id: string): Promise<RunStatus>;
  /** Request cancellation: abort execution; finish as `canceled`. */
  cancel(id: string): void;
  /**
   * Record the underlying CLI child process's exit outcome (A10). `code` is the
   * numeric exit code (or null if killed by signal); `signal` is the killing
   * signal (or null if exited via code). No-op for unknown runs. Does NOT change
   * status — finish/cancel own that; this is pure metadata for crash diagnosis.
   */
  setExit(id: string, code: number | null, signal: string | null): void;
  /**
   * Graceful shutdown (A8): cancel every non-terminal run — abort its execution
   * signal (the cli spawner listens and SIGTERM→SIGKILLs its child) and finish
   * it as `canceled`. Optionally waits up to `graceMs` (default 3000) for those
   * downstream child kills to settle before resolving, so the process can exit
   * cleanly. The wait timer is unref'd so it never keeps the process alive.
   */
  shutdownActive(opts?: { graceMs?: number }): Promise<void>;
  /**
   * Drop a run entirely so the next `claimStart` re-runs from scratch. Used by
   * retry/resume ("full_rerun"): aborts any in-flight execution, ends attached
   * views, and removes the run + its buffered log. The next GET /stream then
   * `ensure`s a fresh run and `claimStart` returns true again.
   */
  reset(id: string): void;
  isTerminal(status: RunStatus): boolean;
  /** Test/introspection. */
  size(): number;
}

export function createRunBus(opts: RunBusOptions = {}): RunBus {
  const maxEvents = opts.maxEvents ?? 2000;
  const ttlMs = opts.ttlMs ?? 30 * 60 * 1000;
  const now = opts.now ?? Date.now;
  const schedule =
    opts.schedule ??
    ((fn, ms) => {
      const t = setTimeout(fn, ms);
      // Don't keep the process alive just for cleanup.
      (t as { unref?: () => void }).unref?.();
    });

  const persist = opts.persist;
  const runs = new Map<string, Run>();

  /** Serializable view of a run for disk persistence (O2). */
  const snapshot = (run: Run): RunSnapshot => ({
    id: run.id,
    status: run.status,
    events: run.events,
    nextEventId: run.nextEventId,
    exitCode: run.exitCode,
    signal: run.signal,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  });

  /** Best-effort persist; never throws into the hot path. */
  const save = (run: Run): void => {
    if (!persist) return;
    try {
      persist.save(snapshot(run));
    } catch {
      /* disk is a recovery log, not a correctness dependency */
    }
  };

  const create = (id: string): Run => {
    const ts = now();
    const run: Run = {
      id,
      status: 'running',
      events: [],
      nextEventId: 1,
      clients: new Set(),
      abort: new AbortController(),
      started: false,
      waiters: new Set(),
      exitCode: null,
      signal: null,
      createdAt: ts,
      updatedAt: ts,
    };
    runs.set(id, run);
    return run;
  };

  /**
   * Reconstruct a Run from a persisted snapshot, applying the crash-recovery
   * correction: a snapshot that was still `running` when the process died has no
   * live producer, so we append a synthetic run-level `error` terminal frame (so
   * a reconnecting view replays the full as-of-crash timeline then STOPS cleanly
   * instead of hanging / reconnect-looping) and mark it `canceled`.
   * `started: true` ensures claimStart() never re-runs it. Returns the run plus
   * whether it was interrupted. Shared by startup hydration AND lazy hydrateOne.
   */
  const reconstructFromSnapshot = (snap: RunSnapshot): { run: Run; interrupted: boolean } => {
    const run: Run = {
      id: snap.id,
      status: snap.status,
      events: Array.isArray(snap.events) ? snap.events.slice() : [],
      nextEventId: typeof snap.nextEventId === 'number' ? snap.nextEventId : (snap.events?.length ?? 0) + 1,
      clients: new Set(),
      abort: new AbortController(),
      started: true,
      waiters: new Set(),
      exitCode: snap.exitCode ?? null,
      signal: snap.signal ?? null,
      createdAt: snap.createdAt ?? now(),
      updatedAt: snap.updatedAt ?? now(),
    };
    let interrupted = false;
    if (!TERMINAL.has(run.status)) {
      run.events.push({
        id: run.nextEventId++,
        event: 'error',
        data: {
          session_id: run.id,
          code: 'server',
          message: '会话进程已重启，本次运行已中断（历史已保留）',
          interrupted_by_restart: true,
        },
        ts: now(),
      });
      run.status = 'canceled';
      interrupted = true;
    }
    return { run, interrupted };
  };

  // O2 hydration — restore all persisted runs at startup.
  if (persist) {
    let hydrated = 0;
    let interrupted = 0;
    for (const snap of persist.loadAllSync()) {
      if (!snap || typeof snap.id !== 'string' || runs.has(snap.id)) continue;
      const { run, interrupted: wasInterrupted } = reconstructFromSnapshot(snap);
      if (wasInterrupted) interrupted += 1;
      runs.set(run.id, run);
      save(run); // re-persist the corrected (terminal) snapshot
      hydrated += 1;
    }
    if (hydrated > 0) {
      // eslint-disable-next-line no-console
      console.log(`[run-event-bus] hydrated ${hydrated} run(s) from disk (${interrupted} interrupted → canceled)`);
    }
  }

  // O4 — lazy single-run recovery from disk. Used by /stream when a session is
  // gone and the run isn't in memory: pull its snapshot back so we can replay
  // the timeline read-only instead of hard-404ing.
  const hydrateOne = (id: string): Run | undefined => {
    const existing = runs.get(id);
    if (existing) return existing;
    if (!persist || typeof persist.loadOneSync !== 'function') return undefined;
    let snap: RunSnapshot | undefined;
    try {
      snap = persist.loadOneSync(id);
    } catch {
      return undefined; // disk is best-effort; treat a read failure as "absent"
    }
    if (!snap || typeof snap.id !== 'string' || snap.id !== id) return undefined;
    const { run } = reconstructFromSnapshot(snap);
    runs.set(run.id, run);
    save(run); // persist the corrected (terminal) snapshot, matching startup
    return run;
  };

  const ensure = (id: string): Run => runs.get(id) ?? create(id);
  const get = (id: string): Run | undefined => runs.get(id);

  const claimStart = (id: string): boolean => {
    const run = ensure(id);
    if (run.started) return false;
    run.started = true;
    return true;
  };

  const emit = (
    id: string,
    event: string,
    data: unknown,
  ): RunEventRecord | undefined => {
    const run = runs.get(id);
    if (!run) return undefined;
    const rec: RunEventRecord = { id: run.nextEventId++, event, data, ts: now() };
    run.events.push(rec);
    if (run.events.length > maxEvents) {
      run.events.splice(0, run.events.length - maxEvents);
    }
    run.updatedAt = rec.ts;
    for (const sink of run.clients) {
      try {
        sink.send(rec);
      } catch {
        // A dead sink shouldn't poison the fan-out; the route's req-close
        // handler will detach it shortly.
      }
    }
    save(run); // O2 — debounced disk snapshot so the timeline survives restart
    return rec;
  };

  const attach = (id: string, after: number, sink: RunEventSink): (() => void) => {
    const run = ensure(id);
    const cursor = Number.isFinite(after) ? after : 0;
    // Replay everything the client hasn't seen yet.
    for (const rec of run.events) {
      if (rec.id > cursor) {
        try {
          sink.send(rec);
        } catch {
          /* sink died mid-replay — give up on it */
          return () => {};
        }
      }
    }
    // Already finished: nothing live to wait for.
    if (TERMINAL.has(run.status)) {
      try {
        sink.end();
      } catch {
        /* ignore */
      }
      return () => {};
    }
    run.clients.add(sink);
    return () => {
      run.clients.delete(sink);
    };
  };

  const scheduleCleanup = (run: Run): void => {
    schedule(() => {
      const cur = runs.get(run.id);
      if (cur && TERMINAL.has(cur.status)) {
        runs.delete(run.id);
        persist?.remove(run.id);
      }
    }, ttlMs);
  };

  const finish = (id: string, status: Exclude<RunStatus, 'running'>): void => {
    const run = runs.get(id);
    if (!run || TERMINAL.has(run.status)) return;
    run.status = status;
    run.updatedAt = now();
    for (const sink of run.clients) {
      try {
        sink.end();
      } catch {
        /* ignore */
      }
    }
    run.clients.clear();
    // Resolve everyone awaiting this run's terminal status (single fire each).
    for (const waiter of run.waiters) waiter(status);
    run.waiters.clear();
    save(run); // O2 — persist the terminal snapshot so a restart serves it read-only
    scheduleCleanup(run);
  };

  const cancel = (id: string): void => {
    const run = runs.get(id);
    if (!run || TERMINAL.has(run.status)) return;
    if (!run.abort.signal.aborted) run.abort.abort();
    finish(id, 'canceled');
  };

  const setExit = (
    id: string,
    code: number | null,
    signal: string | null,
  ): void => {
    const run = runs.get(id);
    if (!run) return;
    run.exitCode = code;
    run.signal = signal;
    run.updatedAt = now();
    save(run);
  };

  const shutdownActive = async (
    opts: { graceMs?: number } = {},
  ): Promise<void> => {
    const graceMs = opts.graceMs ?? 3000;
    const active = Array.from(runs.values()).filter(
      (run) => !TERMINAL.has(run.status),
    );
    for (const run of active) {
      // Reuse cancel(): aborts the signal (cli spawner does SIGTERM→SIGKILL)
      // and finishes as 'canceled' via the existing logic. No duplication.
      cancel(run.id);
    }
    if (active.length === 0 || graceMs <= 0) return;
    // Give downstream child kills a moment to settle before the process exits.
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, graceMs);
      (t as { unref?: () => void }).unref?.();
    });
  };

  const wait = (id: string): Promise<RunStatus> => {
    const run = runs.get(id);
    // Absent (never created / already cleaned up): nothing to await. 'canceled'
    // is the safe terminal answer for "no such live run".
    if (!run) return Promise.resolve('canceled');
    if (TERMINAL.has(run.status)) return Promise.resolve(run.status);
    return new Promise<RunStatus>((resolve) => {
      run.waiters.add(resolve);
    });
  };

  const reset = (id: string): void => {
    const run = runs.get(id);
    if (!run) return;
    if (!run.abort.signal.aborted) run.abort.abort();
    for (const sink of run.clients) {
      try {
        sink.end();
      } catch {
        /* ignore */
      }
    }
    run.clients.clear();
    // Don't strand wait() callers when the run is dropped mid-flight. If it was
    // already terminal, resolve with that status; otherwise treat the drop as a
    // cancellation so awaiters unblock instead of hanging forever.
    const resolvedStatus: RunStatus = TERMINAL.has(run.status)
      ? run.status
      : 'canceled';
    for (const waiter of run.waiters) waiter(resolvedStatus);
    run.waiters.clear();
    runs.delete(id);
    persist?.remove(id); // O2 — drop the snapshot so the next claimStart re-runs clean
  };

  return {
    ensure,
    get,
    hydrateOne,
    claimStart,
    emit,
    attach,
    finish,
    wait,
    cancel,
    setExit,
    shutdownActive,
    reset,
    isTerminal: (status) => TERMINAL.has(status),
    size: () => runs.size,
  };
}

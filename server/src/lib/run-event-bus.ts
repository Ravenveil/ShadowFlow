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
}

export interface RunBus {
  /** Get an existing run, or create one in `running` state. */
  ensure(id: string): Run;
  get(id: string): Run | undefined;
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
  /** Request cancellation: abort execution; finish as `canceled`. */
  cancel(id: string): void;
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

  const runs = new Map<string, Run>();

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
      createdAt: ts,
      updatedAt: ts,
    };
    runs.set(id, run);
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
      if (cur && TERMINAL.has(cur.status)) runs.delete(run.id);
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
    scheduleCleanup(run);
  };

  const cancel = (id: string): void => {
    const run = runs.get(id);
    if (!run || TERMINAL.has(run.status)) return;
    if (!run.abort.signal.aborted) run.abort.abort();
    finish(id, 'canceled');
  };

  return {
    ensure,
    get,
    claimStart,
    emit,
    attach,
    finish,
    cancel,
    isTerminal: (status) => TERMINAL.has(status),
    size: () => runs.size,
  };
}

/**
 * Lightweight SSE client wrapper — used by hooks that just need a one-shot
 * EventSource against an absolute URL (e.g. /workflow/runs/{id}/events,
 * /api/approvals/events).
 *
 * For the heavier reconnect-with-backoff client used by the run dashboard,
 * see `src/adapter/sseClient.ts` (`SseClient` class). The two coexist because
 * this one is a smaller surface for chat / approvals streams that simply
 * need event dispatch + cleanup.
 *
 * EventSource auto-reconnects on transient drops via the browser. For an
 * explicit reconnect with a `Last-Event-ID`, callers should `close()` and
 * call `startSseClient` again with `lastEventId` — the helper appends it as
 * a `last_event_id` query param, mirroring the convention used by both the
 * workflow and approvals SSE endpoints in `shadowflow/server.py`.
 */

import { getApiBase } from './_base';

export interface SseClientOptions {
  /** Either a fully-qualified URL or a path like `/workflow/runs/abc/events`.
   *  Path-only inputs are resolved against `getApiBase()`. */
  url: string;
  /** Receives every event the server emits — both anonymous `message` events
   *  and named ones (e.g. `agent.message`, `approval.requested`). */
  onEvent: (eventType: string, data: unknown) => void;
  /** Fires when the underlying EventSource hits an error. */
  onError?: (err: Event) => void;
  /** Used for EventSource reconnection — appended as `last_event_id` query
   *  param so the server-side resume logic in `stream_run_events` /
   *  `approvals_events_stream` can pick up where we left off. */
  lastEventId?: string;
}

export interface SseClientHandle {
  /** Permanently close the EventSource — no reconnects after this. */
  close: () => void;
}

/** Default set of named events we eagerly subscribe to. The server may emit
 *  others; those still arrive via the generic `message` listener. */
const DEFAULT_NAMED_EVENTS: ReadonlyArray<string> = [
  'agent.message',
  'agent.tool_call',
  'agent.complete',
  'agent.typing',
  'agent.gap_detected',
  'system.notice',
  'approval.requested',
  'approval.resolved',
  'run.started',
  'run.completed',
  'node.started',
  'node.succeeded',
  'node.failed',
];

/**
 * Open an SSE connection. Returns a handle whose `close()` permanently stops
 * the stream. Safe to call from inside a React effect — pair with a cleanup
 * that invokes `handle.close()`.
 */
export function startSseClient(options: SseClientOptions): SseClientHandle {
  const base = getApiBase();
  const isAbsolute = /^https?:\/\//i.test(options.url);
  const resolved = isAbsolute
    ? options.url
    : `${base}${options.url.startsWith('/') ? '' : '/'}${options.url}`;

  let urlObj: URL;
  try {
    urlObj = new URL(resolved);
  } catch {
    // Fallback for relative paths in test/jsdom environments where window.location is set
    urlObj = new URL(resolved, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  }

  if (options.lastEventId) {
    urlObj.searchParams.set('last_event_id', options.lastEventId);
  }

  const es = new EventSource(urlObj.toString(), { withCredentials: false });

  const dispatch = (eventType: string, raw: string) => {
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    try {
      options.onEvent(eventType, data);
    } catch (err) {
      // Never let a handler exception kill the stream
      // eslint-disable-next-line no-console
      console.warn('[sseClient] handler threw for', eventType, err);
    }
  };

  // Generic / unnamed events
  es.addEventListener('message', (ev) => {
    dispatch('message', (ev as MessageEvent).data);
  });

  // Eagerly subscribe to the common named server events. Anything outside
  // this list still surfaces via the generic `message` listener above.
  for (const t of DEFAULT_NAMED_EVENTS) {
    es.addEventListener(t, (ev) => {
      dispatch(t, (ev as MessageEvent).data);
    });
  }

  if (options.onError) {
    es.addEventListener('error', options.onError);
  }

  return {
    close: () => {
      es.close();
    },
  };
}

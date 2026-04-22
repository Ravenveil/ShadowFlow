/**
 * SSE client for ShadowFlow run event streams (Story 4.1 AC2).
 *
 * Features:
 * - Automatic Last-Event-ID reconnection to resume missed events
 * - Exponential back-off: 1s → 2s → 4s → 8s → 16s (cap)
 * - Per-type event dispatch via callback map
 */

export type SseEventHandler = (payload: unknown) => void;

export interface SseClientOptions {
  /** Base URL of the ShadowFlow API, e.g. "http://localhost:8000" */
  baseUrl?: string;
  /** Called when the connection opens or reconnects. */
  onOpen?: () => void;
  /** Called when an error occurs that cannot be retried. */
  onError?: (err: Event) => void;
  /** Maximum reconnect delay in milliseconds (default 16 000). */
  maxRetryMs?: number;
}

const DEFAULT_BASE = "";
const RETRY_SEQUENCE_MS = [1000, 2000, 4000, 8000, 16000];

export class SseClient {
  private readonly baseUrl: string;
  private readonly options: SseClientOptions;
  private readonly handlers: Map<string, SseEventHandler[]> = new Map();

  private es: EventSource | null = null;
  private runId: string | null = null;
  private lastEventId: string | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: SseClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.options = options;
  }

  /** Subscribe to events for *runId*. Safe to call multiple times — reconnects cleanly. */
  connect(runId: string): void {
    this.closed = false;
    if (this.runId !== runId) {
      this.lastEventId = null;
      this.retryCount = 0;
    }
    this.runId = runId;
    this._openConnection();
  }

  /** Register a handler for a specific SSE event *type*. Returns `this` for chaining. */
  on(type: string, handler: SseEventHandler): this {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return this;
  }

  /** Remove all handlers for *type*, or all handlers if omitted. */
  off(type?: string): this {
    if (type === undefined) {
      this.handlers.clear();
    } else {
      this.handlers.delete(type);
    }
    return this;
  }

  /** Permanently close the connection — no further reconnect attempts. */
  disconnect(): void {
    this.closed = true;
    this._clearRetry();
    this._closeEs();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _openConnection(): void {
    this._closeEs();
    if (!this.runId || this.closed) return;

    const url = new URL(
      `${this.baseUrl}/workflow/runs/${encodeURIComponent(this.runId)}/events`,
      window.location.href
    );

    // Append Last-Event-ID as query param for environments that don't support
    // setting custom headers on EventSource (browsers don't allow that natively).
    // The server reads the header; the query param is a fallback for proxies.
    if (this.lastEventId !== null) {
      url.searchParams.set("last_event_id", this.lastEventId);
    }

    this.es = new EventSource(url.toString());

    this.es.onopen = () => {
      this.retryCount = 0;
      this.options.onOpen?.();
    };

    this.es.onerror = (evt) => {
      this._closeEs();
      if (this.closed) return;
      this._scheduleReconnect(evt);
    };

    // Generic message handler — dispatches to registered handlers by event type.
    // EventSource fires named events directly; we also handle the fallback "message" type.
    this.es.onmessage = (evt: MessageEvent) => {
      this._dispatch("message", evt);
    };

    // Register named event listeners for all currently registered handler types.
    for (const type of this.handlers.keys()) {
      if (type !== "message") {
        this.es.addEventListener(type, (evt) => this._dispatch(type, evt as MessageEvent));
      }
    }
  }

  private _dispatch(type: string, evt: MessageEvent): void {
    if (evt.lastEventId) {
      this.lastEventId = evt.lastEventId;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(evt.data);
    } catch {
      payload = evt.data;
    }
    const list = this.handlers.get(type);
    if (list) {
      for (const h of list) h(payload);
    }
    // Also fire "*" catch-all handlers
    const catchAll = this.handlers.get("*");
    if (catchAll) {
      for (const h of catchAll) h({ type, payload });
    }
  }

  private _scheduleReconnect(evt: Event): void {
    const delayMs =
      RETRY_SEQUENCE_MS[Math.min(this.retryCount, RETRY_SEQUENCE_MS.length - 1)];
    this.retryCount += 1;
    this.retryTimer = setTimeout(() => {
      if (!this.closed) this._openConnection();
    }, delayMs);
    // Report persistent errors only after all retries exhausted
    if (this.retryCount > RETRY_SEQUENCE_MS.length) {
      this.options.onError?.(evt);
    }
  }

  private _clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private _closeEs(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }
}

/** Convenience factory — creates, connects, and returns a client in one call. */
export function createSseClient(
  runId: string,
  handlers: Record<string, SseEventHandler>,
  options: SseClientOptions = {}
): SseClient {
  const client = new SseClient(options);
  for (const [type, handler] of Object.entries(handlers)) {
    client.on(type, handler);
  }
  client.connect(runId);
  return client;
}

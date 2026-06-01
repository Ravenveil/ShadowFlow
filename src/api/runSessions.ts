import {
  getApiBase,
  authHeaders,
  getGenerationSettings,
  getDefaultProvider,
  type ProviderId,
} from './_base';

export type OutputType = 'answer' | 'report' | 'review' | 'workflow';
export type SessionMode = 'single' | 'team';
export type StepStatus = 'pending' | 'running' | 'done';
export type NodeStatus = 'building' | 'ready' | 'pending';
export type EdgeStatus = 'active' | 'pending';

export interface RunSessionCreateRequest {
  goal: string;
  output_hint?: OutputType;
  workspace_id?: string;
  mode?: SessionMode;  // 'single' | 'team' — explicit user selection from StartPage
  /**
   * Story 15.4: explicit skill chosen by the user via SkillPicker. When
   * omitted the backend defaults to `agent-team-blueprint`.
   */
  skill_name?: string;
  /**
   * Story 15.5: Design System id chosen by the user (e.g. 'tailwind' /
   * 'material' / 'shadcn' / 'none'). When omitted or unrecognized the backend
   * treats it as 'none' (no DS injection). The server layer splices the
   * matching `injection_prompt` onto skill.system_prompt at run-time.
   */
  design_system_id?: string;
  /**
   * Story 15.9 — generation overrides forwarded to runSkillAssembler. Each is
   * optional; when undefined the server falls back to env / hard-coded
   * defaults. Front-end populates these from localStorage via
   * getGenerationSettings() at request time so SettingsPage edits take effect
   * without a page reload.
   */
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /**
   * Story 15.18 — selected LLM provider (anthropic / openai / deepseek / zhipu).
   * When omitted, `createRunSession` reads `sf_default_provider` from
   * localStorage. Server validates the id; unknown values return HTTP 400
   * INVALID_PROVIDER.
   */
  provider?: ProviderId;
  /**
   * Story 15.19 v2 / 15.23 — explicit executor override. Values:
   *   - 'anthropic-direct' (default; Anthropic SDK via provider dispatch)
   *   - 'cli:auto' / 'cli:<id>' (spawn local CLI binary; 15.19 v2)
   *   - 'acp:<id>' / 'mcp:<server>/<tool>' (remote agent; 15.23)
   * createRunSession reads `sf.defaultExecutor` from localStorage at request
   * time so the Settings panel choice takes effect without page reload.
   */
  executor?: string;
  /**
   * 2026-05-30 — CLI 工作目录(绝对路径)。仅 cli:/acp:/mcp: 有意义,API 忽略。
   * 空 → 后端回退到 .shadowflow/projects/<session_id>。
   */
  cwd?: string;
  /**
   * Story 15.14 follow-up — UI toggle (GenerationSettings). `false` skips
   * the server-side critique pass; `undefined` defers to settings.json.
   */
  auto_critique?: boolean;
  /**
   * Story 15.29 — link this run to a Conversation. When omitted, the server
   * auto-creates an anonymous conversation under the 'default' project and
   * returns its id on the response so the client can persist + auto-select it
   * on the next visit.
   */
  conversation_id?: string;
}

export interface RunSessionCreateResponse {
  session_id: string;
  stream_url: string;
  /** Story 15.29 — always populated by the server (auto-created when omitted). */
  conversation_id?: string;
}

export interface ClassifyEvent {
  output_type: OutputType;
  mode: SessionMode;
  confidence: number;
  complexity: number;
}

export interface AssembleEvent {
  step: string;
  status: StepStatus;
  elapsed_ms?: number;
  /**
   * Phase 2 A4 — parser.ts attaches the current DAG node id when the
   * orchestrator schedules a multi-agent workflow, so parallel-DAG steps
   * can be routed per-node in the front-end. Omitted on legacy callers.
   */
  node_id?: string;
}

export interface NodeEvent {
  node_id: string;
  type: 'coordinator' | 'agent';
  title: string;
  sub: string;
  chips: string[];
  status: NodeStatus;
  avatar_char?: string;
  // 2026-05-18 agent-B extension — fields for AgentPanel 5-slot rendering.
  // All optional; legacy events / minimal skills omit them and the panel
  // falls back to chips-derived values.
  model?: string;
  memory?: string;
  tools_picked?: string[];
  tools_candidate?: string[];
  /** Short single-line persona. Multi-line personas arrive via AgentPersonaEvent. */
  persona?: string;
}

/**
 * 2026-05-18 — emitted when the assembler streams a multi-line system prompt
 * for an agent. The front-end merges `persona` onto the node matching
 * `node_id`. Order is not guaranteed (persona may arrive before or after
 * its node event); the panel must reconcile by id.
 */
export interface AgentPersonaEvent {
  node_id: string;
  persona: string;
}

export interface EdgeEvent {
  from: string;
  to: string;
  status: EdgeStatus;
}

export interface BlueprintEvent {
  yaml: string;
  filename: string;
  // Story 15.3: backend (15.2) emits these so the front-end can switch the
  // right panel into ArtifactPreview after blueprint generation completes.
  artifact_url?: string;
  artifact_type?: 'yaml' | 'html' | 'markdown';
}

export interface CompleteEvent {
  session_id: string;
  run_id?: string;
  redirect?: string;
}

export interface RationaleEvent {
  title: string;
  body: string;
  duration_ms?: number;
}

export interface YamlLineEvent {
  line: string;
  total_lines: number;
}

export interface SubstepEvent {
  parent_step: string;
  name: string;
  elapsed_ms?: number;
}

/**
 * 2026-05-11 Layer 1 — Claude Code-style conversation mode.
 * When the LLM decides the user's goal is trivial (e.g. "hi") and replies
 * in plain natural language, server-side parser emits incremental `text`
 * events. Front-end accumulates these into a chat bubble instead of
 * rendering the canvas / step list.
 *
 * Phase 2 (A4/CL8) — server-side parser (parser.ts) now attaches an optional
 * `node_id` field when the orchestration layer (DAG scheduler) is executing
 * a specific workflow node. Front-end uses it to route chunks to the matching
 * AgentDetail panel. Absent on legacy single-agent runs — falls back to the
 * global chat stream so all pre-existing skills keep working unchanged.
 */
export interface TextEvent {
  text: string;
  /** Phase 2 A4 — present iff the chunk came from a DAG-scheduled node. */
  node_id?: string;
}

// ── Story 15.14 — Critique events ─────────────────────────────────────────────

export type CritiqueDimensionKey =
  | 'goal_achievement'
  | 'skill_completeness'
  | 'structural_integrity'
  | 'reference_grounding'
  | 'anti_pattern_free'
  | 'policy_compliance';

export interface CritiqueDimensionScore {
  score: number;
  rationale: string;
  improvement?: string;
}

export type CritiqueScores = Partial<Record<CritiqueDimensionKey, CritiqueDimensionScore | null>>;

export interface CritiqueResultEvent {
  session_id: string;
  artifact: string;
  scores: CritiqueScores | null;
  overall_summary: string;
  lint_summary: { errors: number; warnings: number; infos: number };
  duration_ms: number;
  error_code?: string | null;
  error_message?: string | null;
}

export interface CritiqueProgressEvent {
  stage: 'lint' | 'prompting' | 'streaming' | 'parsing' | 'done';
  message?: string;
}

// ── Step artifact (S0/S2/S4 — intent-workflow design v1) ──────────────────────
// Each pipeline step can persist its tangible output as a "StepArtifact". The
// drawer (StepArtifactDrawer) renders the payload differently per `output_kind`
// so users can drill into intermediate state without leaving the run view.
// SSE event `step-artifact` arrives once the backend finishes writing the
// payload to disk; REST endpoints GET /steps/:n + POST /steps/:n/retry round
// out the contract. The backend may not have these landed yet; the front-end
// degrades gracefully on 404 (drawer shows "尚未落盘").

export type OutputKind = 'nodes' | 'edges' | 'yaml' | 'classify' | 'none';

export interface StepArtifact {
  session_id: string;
  step_index: number;
  step_name: string;
  output_kind: OutputKind;
  payload: unknown;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'done' | 'failed';
  error?: string;
}

/** SSE `step-artifact` event payload — partial fields, merged into client state. */
export interface StepArtifactEvent {
  step_index: number;
  output_kind: OutputKind;
  payload: unknown;
  /** Optional metadata server may include (status / name) — merged opportunistically. */
  step_name?: string;
  status?: 'running' | 'done' | 'failed';
}

export async function createRunSession(
  req: RunSessionCreateRequest,
): Promise<RunSessionCreateResponse> {
  // Story 15.9 — read generation settings from localStorage at request time so
  // every UI change (max_tokens / temperature slider) is picked up without
  // requiring a page reload. Caller-supplied fields on `req` win over the
  // localStorage defaults.
  const generation = getGenerationSettings();
  // Story 15.18 — pull default provider from localStorage; caller may override.
  const defaultProvider = getDefaultProvider();
  const merged: RunSessionCreateRequest = {
    provider: defaultProvider,
    ...generation,
    ...req,
  };
  const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
    method: 'POST',
    // Story 15.7: authHeaders() injects `X-Anthropic-Key` from localStorage when present.
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    // JSON.stringify drops `undefined` values automatically.
    body: JSON.stringify(merged),
  });
  if (!resp.ok) throw new Error(`createRunSession failed: ${resp.status}`);
  return resp.json();
}

/**
 * 2026-05-16 — Tell the daemon to abort an in-flight run session. Best-effort:
 * a 404 (session already torn down) or network failure is non-fatal — the
 * front-end has already closed its EventSource locally. Returns true when the
 * server confirmed the abort, false otherwise.
 */
/**
 * GET /api/run-sessions/:id/steps/:n
 * Returns the persisted artifact for a single step. Throws on non-2xx so the
 * caller (StepArtifactDrawer) can differentiate 404 ("尚未落盘") from real
 * network errors. The thrown Error carries `(err as any).status` so the
 * drawer can branch without parsing the message.
 */
export async function fetchStepArtifact(
  sessionId: string,
  stepIndex: number,
): Promise<StepArtifact> {
  const resp = await fetch(
    `${getApiBase()}/api/run-sessions/${sessionId}/steps/${stepIndex}`,
    { headers: { ...authHeaders() } },
  );
  if (!resp.ok) {
    const err = new Error(`fetchStepArtifact failed: ${resp.status}`) as Error & { status: number };
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

/**
 * POST /api/run-sessions/:id/steps/:n/retry
 * Asks the backend to re-execute a single step. Returns true when the request
 * was accepted; false (and no throw) when the endpoint is missing (404 / 405)
 * so the retry button can degrade to a "未实现" toast rather than a crash.
 */
export async function retryStep(
  sessionId: string,
  stepIndex: number,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${getApiBase()}/api/run-sessions/${sessionId}/steps/${stepIndex}/retry`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      },
    );
    if (resp.status === 404 || resp.status === 405) return false;
    return resp.ok;
  } catch {
    return false;
  }
}

export async function abortRunSession(sessionId: string): Promise<boolean> {
  try {
    const resp = await fetch(`${getApiBase()}/api/run-sessions/${sessionId}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function subscribeRunSession(
  sessionId: string,
  handlers: {
    onClassify?: (data: ClassifyEvent) => void;
    onAssemble?: (data: AssembleEvent) => void;
    onNode?: (data: NodeEvent) => void;
    onEdge?: (data: EdgeEvent) => void;
    onBlueprint?: (data: BlueprintEvent) => void;
    onComplete?: (data: CompleteEvent) => void;
    onRationale?: (data: RationaleEvent) => void;
    onYamlLine?: (data: YamlLineEvent) => void;
    onSubstep?: (data: SubstepEvent) => void;
    onCritiqueProgress?: (data: CritiqueProgressEvent) => void;
    onCritiqueResult?: (data: CritiqueResultEvent) => void;
    onText?: (data: TextEvent) => void;
    /** 2026-05-18 agent-B extension — multi-line persona for an agent node. */
    onAgentPersona?: (data: AgentPersonaEvent) => void;
    /**
     * 2026-05-19 — real LLM reasoning chunk inside `<sf:thinking>` block.
     * Phase 2 A4 — carries optional `node_id` when emitted from a
     * DAG-scheduled node so the front-end can route to the matching
     * AgentDetail panel.
     */
    onThinkingChunk?: (data: { step: string | null; text: string; node_id?: string }) => void;
    /** Stream B / S2.4 — step artifact persisted by the backend after a step finishes. */
    onStepArtifact?: (data: StepArtifactEvent) => void;
    /** S6.5 — v3 stacked: granular per-agent substep progress (identity/persona/model/tools/memory). */
    onAgentSubstep?: (data: {
      node_id: string;
      substep: string;
      status: 'running' | 'done' | 'failed';
      elapsed_ms: number | null;
      source?: string;
      tokens?: number;
      cached?: boolean;
    }) => void;
    /**
     * S12 — `<sf:question-form>` interactive form. body is parsed JSON.
     * Phase 2 A4 — carries optional `node_id` when a DAG node raises a
     * clarification, so the form can be attributed to that agent panel.
     */
    onQuestionForm?: (data: { id: string; title: string; body: unknown; node_id?: string }) => void;
    /**
     * S6.10-B — new typed TimelineMessage arrived. Front-end appends to
     * `messages` state. Payload shape is defined in the front-end mirror
     * `src/components/run-session/timeline/types.ts` (synced from server
     * `lib/contracts.ts`).
     */
    onMessage?: (data: import('../components/run-session/timeline/types').TimelineMessage) => void;
    /**
     * S6.10-B — patch mutates an existing TimelineMessage by id (step_panel
     * grows, thinking body streams, diff lines append, msg_foot timer ticks).
     */
    onMessagePatch?: (data: import('../components/run-session/timeline/types').MessagePatch) => void;
    /**
     * Post-assembly UX hint. Emitted by the assembler when the matched recipe
     * carries `askWorkspaceOnCreate` (single-agent). Front-end uses it to
     * offer a "move team to a new workspace" affordance after auto-save.
     * Non-structural — clients that ignore it lose nothing.
     */
    onAssemblyMeta?: (data: { ask_workspace?: boolean; recipe?: string }) => void;
    onRetrying?: (attempt: number, delayMs: number) => void;
    onError?: (err: Event) => void;
    onServerError?: (message: string, code?: string) => void;
  },
  options?: { maxRetries?: number; baseDelay?: number },
): () => void {
  let es: EventSource | null = null;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  // 2026-05-11 fix: 区分 server-side fatal error（命名 SSE error 事件，如 NO_API_KEY）
  // vs 网络层 onerror（连接断开 / readyState=CLOSED）。server fatal 之后 server
  // 主动 res.end() 会让 EventSource 同时触发原生 onerror — 不应再 retry，否则
  // 5 次都同样失败，UX 显示"已达最大重试次数"误导用户。OpenDesign `terminated`
  // 标志位同模式。
  let serverTerminated = false;
  // 'complete' 事件也算 terminal — 服务端正常收尾后 EventSource 也会触发 onerror。
  const maxRetries = options?.maxRetries ?? 5;
  const baseDelay = options?.baseDelay ?? 1000;
  // 2026-05-27 — 增量续传 cursor。后端每个 SSE 帧带 `id:`（单调编号），且
  // `GET /stream?after=N` / `Last-Event-ID` 会重放 id>N 的事件。我们手动重连
  // 时新建的 EventSource 不会自动携带上一个连接的 Last-Event-ID（原生 EventSource
  // 只在内部自动重连时才带），所以这里手动追踪已见的最大 cursor，并在 connect()
  // 拼到 `?after=`，对照 OpenDesign daemon.ts 的增量续传策略。首连为空 → 全量。
  let lastEventId = '';

  const parse = (e: MessageEvent) => {
    // 每个命名事件回调都先走这里 → 统一捕获 lastEventId（非空才更新）。
    if (e.lastEventId) lastEventId = e.lastEventId;
    try { return JSON.parse(e.data); } catch { return null; }
  };

  function connect() {
    if (cancelled) return;
    // S6.10-C test aid — forward `fallback=synthetic` to the SSE stream so
    // the deterministic synthesizeTeamRun path can drive the new Timeline
    // without requiring an LLM key. Enable via either:
    //   • URL query:    /run-session/<id>?fallback=synthetic
    //   • localStorage: sf.syntheticFallback=1
    let streamUrl = `${getApiBase()}/api/run-sessions/${sessionId}/stream`;
    const qs = new URLSearchParams();
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('fallback');
      const fromLs = localStorage.getItem('sf.syntheticFallback');
      if (fromUrl === 'synthetic' || fromLs === '1') {
        qs.set('fallback', 'synthetic');
      }
    } catch { /* ssr / sandbox — ignore */ }
    // 2026-05-27 — 增量续传：重连时带上已见的最大 cursor，后端只重放 id>after。
    // 首连 lastEventId 为空 → 不带 after（全量）。与 fallback=synthetic 经
    // URLSearchParams 自然共存（? / & 由 toString() 处理）。
    if (lastEventId) qs.set('after', lastEventId);
    const query = qs.toString();
    if (query) streamUrl += `?${query}`;
    es = new EventSource(streamUrl);

    es.addEventListener('classify',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onClassify?.(d); });
    es.addEventListener('assemble',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAssemble?.(d); });
    es.addEventListener('node',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onNode?.(d); });
    es.addEventListener('edge',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onEdge?.(d); });
    es.addEventListener('blueprint', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onBlueprint?.(d); });
    es.addEventListener('complete',  (e) => {
      // 2026-05-11 fix: complete 是 terminal — 之后 server.end() 会让 onerror 触发，
      // 不应再 retry。
      serverTerminated = true;
      const d = parse(e as MessageEvent);
      if (d) handlers.onComplete?.(d);
    });
    es.addEventListener('rationale', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onRationale?.(d); });
    es.addEventListener('yaml-line', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onYamlLine?.(d); });
    es.addEventListener('substep',   (e) => { const d = parse(e as MessageEvent); if (d) handlers.onSubstep?.(d); });
    // Story 15.14 — critique events
    es.addEventListener('critique-progress', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onCritiqueProgress?.(d); });
    es.addEventListener('critique-result',   (e) => { const d = parse(e as MessageEvent); if (d) handlers.onCritiqueResult?.(d); });
    // 2026-05-11 Layer 1 — Claude Code-style chat fallback
    es.addEventListener('text',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onText?.(d); });
    // 2026-05-18 agent-B — multi-line persona block paired with a node.
    es.addEventListener('agent-persona', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAgentPersona?.(d); });
    // 2026-05-19 — <sf:thinking> chain-of-thought chunk.
    es.addEventListener('thinking-chunk', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onThinkingChunk?.(d); });
    // Stream B / S2.4 — per-step artifact persisted to disk by the backend.
    // Frontend mirrors into useRunSession.stepArtifacts for instant render
    // when the user opens the drawer. Safe to fire before the REST endpoint
    // exists: the listener simply never triggers.
    es.addEventListener('step-artifact', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onStepArtifact?.(d); });
    // S6.5 — v3 stacked: per-agent substep (identity / persona / model / tools / memory).
    // Drives both the left-pane substep tree under "配置 Agent 角色" and the
    // right-pane anchor-scroll to the matching SkillSection.
    es.addEventListener('agent-substep', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAgentSubstep?.(d); });
    // S12 — `<sf:question-form>` interactive clarify modal.
    es.addEventListener('question-form', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onQuestionForm?.(d); });
    // S6.10-B — TimelineMessage stream (new). Parallel to all legacy events
    // above; back-end emits both during the transition.
    es.addEventListener('message',       (e) => { const d = parse(e as MessageEvent); if (d) handlers.onMessage?.(d); });
    es.addEventListener('message-patch', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onMessagePatch?.(d); });
    // Post-assembly UX hint — single-agent recipe asks whether to move the
    // auto-saved team to a new workspace.
    es.addEventListener('assembly-meta', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAssemblyMeta?.(d); });
    es.addEventListener('error',     (e) => {
      const d = parse(e as MessageEvent);
      if (d?.message) {
        // 2026-05-11 fix: server-side fatal error — 标记 terminated 防 onerror 误判网络错重试。
        serverTerminated = true;
        es?.close();
        handlers.onServerError?.(d.message as string, d.code as string | undefined);
      }
    });

    es.onerror = (err) => {
      es?.close();
      // 2026-05-11 fix: 如果 server 已经主动结束（complete 或命名 error），onerror
      // 是预期的副作用而非真网络错——直接退出，不要 retry，不要 onError。
      if (serverTerminated || cancelled || retryCount >= maxRetries) {
        if (!serverTerminated && !cancelled) handlers.onError?.(err);
        return;
      }
      // session 不存在 → /stream 返回 404 JSON `{"error":"Session X not found"}`，
      // 不是 SSE。EventSource 拿到非 200 直接关闭 + onerror，没有 `error` SSE 帧，
      // 所以 serverTerminated 不会被标。我们靠 fetch GET probe 探 status：404 / 410
      // 立刻终止 + 通知用户 session 已过期，不浪费 5 次指数退避在永久不存在的资源上。
      // 2026-06-01: 会话已落盘(session-store)抗重启，404 主因是「闲置超 TTL 被回收」，
      // 不再是「重启丢内存」——文案随之更正。
      fetch(`${getApiBase()}/api/run-sessions/${sessionId}/stream`, {
        method: 'GET',
        headers: { Accept: 'text/event-stream', ...authHeaders() },
      })
        .then((resp) => {
          if ((resp.status === 404 || resp.status === 410) && !cancelled) {
            serverTerminated = true;
            handlers.onServerError?.(
              `会话已过期或不存在（${resp.status}）。长时间未访问的会话会被自动回收，请回起点重新发起。`,
              'SESSION_NOT_FOUND',
            );
            return;
          }
          // 非 4xx terminal — 走正常退避重试。
          if (!cancelled) {
            const delay = baseDelay * Math.pow(2, retryCount);
            retryCount++;
            handlers.onRetrying?.(retryCount, delay);
            retryTimer = setTimeout(connect, delay);
          }
        })
        .catch(() => {
          // probe 本身失败（真网络问题），按原计划退避重试。
          if (cancelled) return;
          const delay = baseDelay * Math.pow(2, retryCount);
          retryCount++;
          handlers.onRetrying?.(retryCount, delay);
          retryTimer = setTimeout(connect, delay);
        });
    };
  }

  connect();

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}

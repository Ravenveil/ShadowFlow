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
}

export interface RunSessionCreateResponse {
  session_id: string;
  stream_url: string;
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
}

export interface NodeEvent {
  node_id: string;
  type: 'coordinator' | 'agent';
  title: string;
  sub: string;
  chips: string[];
  status: NodeStatus;
  avatar_char?: string;
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
  const maxRetries = options?.maxRetries ?? 5;
  const baseDelay = options?.baseDelay ?? 1000;

  const parse = (e: MessageEvent) => {
    try { return JSON.parse(e.data); } catch { return null; }
  };

  function connect() {
    if (cancelled) return;
    es = new EventSource(`${getApiBase()}/api/run-sessions/${sessionId}/stream`);

    es.addEventListener('classify',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onClassify?.(d); });
    es.addEventListener('assemble',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAssemble?.(d); });
    es.addEventListener('node',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onNode?.(d); });
    es.addEventListener('edge',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onEdge?.(d); });
    es.addEventListener('blueprint', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onBlueprint?.(d); });
    es.addEventListener('complete',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onComplete?.(d); });
    es.addEventListener('rationale', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onRationale?.(d); });
    es.addEventListener('yaml-line', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onYamlLine?.(d); });
    es.addEventListener('substep',   (e) => { const d = parse(e as MessageEvent); if (d) handlers.onSubstep?.(d); });
    // Story 15.14 — critique events
    es.addEventListener('critique-progress', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onCritiqueProgress?.(d); });
    es.addEventListener('critique-result',   (e) => { const d = parse(e as MessageEvent); if (d) handlers.onCritiqueResult?.(d); });
    es.addEventListener('error',     (e) => {
      const d = parse(e as MessageEvent);
      if (d?.message) { es?.close(); handlers.onServerError?.(d.message as string, d.code as string | undefined); }
    });

    es.onerror = (err) => {
      es?.close();
      if (cancelled || retryCount >= maxRetries) {
        handlers.onError?.(err);
        return;
      }
      const delay = baseDelay * Math.pow(2, retryCount);
      retryCount++;
      handlers.onRetrying?.(retryCount, delay);
      retryTimer = setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}

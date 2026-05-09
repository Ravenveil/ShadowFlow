import { getApiBase } from './_base';

export type OutputType = 'answer' | 'report' | 'review' | 'workflow';
export type SessionMode = 'single' | 'team';
export type StepStatus = 'pending' | 'running' | 'done';
export type NodeStatus = 'building' | 'ready' | 'pending';
export type EdgeStatus = 'active' | 'pending';

export interface RunSessionCreateRequest {
  goal: string;
  output_hint?: OutputType;
  workspace_id?: string;
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
}

export interface CompleteEvent {
  session_id: string;
  run_id?: string;
  redirect?: string;
}

export async function createRunSession(
  req: RunSessionCreateRequest,
): Promise<RunSessionCreateResponse> {
  const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
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
    onError?: (err: Event) => void;
  },
): () => void {
  const es = new EventSource(`${getApiBase()}/api/run-sessions/${sessionId}/stream`);

  const parse = (e: MessageEvent) => {
    try { return JSON.parse(e.data); } catch { return null; }
  };

  es.addEventListener('classify',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onClassify?.(d); });
  es.addEventListener('assemble',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onAssemble?.(d); });
  es.addEventListener('node',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onNode?.(d); });
  es.addEventListener('edge',      (e) => { const d = parse(e as MessageEvent); if (d) handlers.onEdge?.(d); });
  es.addEventListener('blueprint', (e) => { const d = parse(e as MessageEvent); if (d) handlers.onBlueprint?.(d); });
  es.addEventListener('complete',  (e) => { const d = parse(e as MessageEvent); if (d) handlers.onComplete?.(d); });
  if (handlers.onError) es.onerror = handlers.onError;

  return () => es.close();
}

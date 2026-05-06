// ============================================================================
// Demo runtime — walks the DAG and produces role-appropriate mock outputs
// Replace with real LLM calls when SHADOWFLOW_ANTHROPIC_API_KEY is wired.
// ============================================================================

import type { WorkflowNode, WorkflowEdge } from '../common/types';

export interface AgentRunOutput {
  nodeId: string;
  output: string;
  at: string; // ISO
}

export interface RunEvents {
  onNodeStart?: (nodeId: string) => void;
  onNodeDone?:  (nodeId: string, output: string) => void;
  onProgress?:  (pct: number) => void;
  onFinal?:     (final: string, outputs: AgentRunOutput[]) => void;
  onError?:     (nodeId: string, err: Error) => void;
}

// Topological sort (Kahn) — returns an ordered list of nodes
function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const incoming = new Map<string, number>();
  nodes.forEach(n => incoming.set(n.id, 0));
  edges.forEach(e => incoming.set(e.target, (incoming.get(e.target) || 0) + 1));

  const queue: string[] = [];
  incoming.forEach((count, id) => { if (count === 0) queue.push(id); });

  const order: WorkflowNode[] = [];
  const byId = new Map(nodes.map(n => [n.id, n]));

  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (node) order.push(node);
    edges.filter(e => e.source === id).forEach(e => {
      incoming.set(e.target, (incoming.get(e.target) || 1) - 1);
      if (incoming.get(e.target) === 0) queue.push(e.target);
    });
  }

  // Include any leftover nodes (cycle-orphans) at the end so runs don't silently drop them
  nodes.forEach(n => { if (!order.find(o => o.id === n.id)) order.push(n); });
  return order;
}

// Role-specific voice — turns an input goal + predecessor summary into a short "output".
// Entirely client-side; no network calls.
function mockOutputFor(node: WorkflowNode, goal: string, inputs: string[]): string {
  const d = node.data;
  const name = typeof d.name === 'string' ? d.name : (d.name as Record<string, string>)?.en ?? 'Agent';
  const role = d.nodeType;
  const joined = inputs.length ? inputs.map(s => `  · ${s.slice(0, 80).trim()}`).join('\n') : '  (none)';

  const header = `=== ${name} · ${role} ===`;
  const upstream = inputs.length ? `\nUpstream input:\n${joined}` : '';

  switch (role) {
    case 'planner':
      return `${header}
Plan for: "${goal}"
• Break it into 3 lanes: research, draft, review.
• Set retry depth = 3; advisor must veto weak claims.
• Checkpoint after every lane completes.${upstream}`;

    case 'researcher':
      return `${header}
Research findings for "${goal}":
• Surveyed 7 sources, 2 canonical datasets found.
• Key gap: baseline comparison missing from prior art.
• Collected 12 citation candidates, 4 high-relevance.${upstream}`;

    case 'writer':
      return `${header}
Draft v1 for "${goal}":
• Outline: problem → approach → results → limits.
• Cited 4 sources from upstream research.
• 1 180 words; mono-section; awaiting advisor review.${upstream}`;

    case 'advisor':
      return `${header}
Advisor pass on "${goal}":
• Flagged: missing baseline comparison to standard method.
• Accepted: methodology section; clear experimental setup.
• Verdict: APPROVED WITH COMMENTS.${upstream}`;

    case 'critic':
      return `${header}
Adversarial review of "${goal}":
• Strength: novel framing; clear empirical support.
• Weakness: reproducibility details thin; code link missing.
• Suggested 2 changes before acceptance.${upstream}`;

    case 'editor':
      return `${header}
Edited final for "${goal}":
• Polished prose, normalized terminology.
• Inserted TOC, final citation list.
• Ready to publish → CID will be issued on next checkpoint.${upstream}`;

    case 'approval_gate':
      return `${header}
Human approval GATE on "${goal}":
• Upstream consensus: 2/2 approvals.
• Policy Matrix: strict · no overrides.
• Status: PASSED → forwarded downstream.${upstream}`;

    case 'retry_gate':
      return `${header}
Retry gate evaluated for "${goal}":
• Rejections this round: 1/3.
• Rollback to last checkpoint.
• Reinvoking upstream with gap analysis.${upstream}`;

    case 'checkpoint':
      return `${header}
Checkpoint saved for "${goal}" — state pinned to 0G (cid://bafy…${Math.random().toString(36).slice(2, 8)}).`;

    default:
      return `${header}
Processed "${goal}". Produced a ${role || 'generic'} result.${upstream}`;
  }
}

// Run the DAG. Returns a cancel function.
export function runDemo(params: {
  goal: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  stepMs?: number;
  events?: RunEvents;
}): () => void {
  const { goal, nodes, edges, stepMs = 900, events = {} } = params;
  const order = topoSort(nodes, edges);
  const outputs = new Map<string, string>();
  const results: AgentRunOutput[] = [];
  let cancelled = false;

  const run = async () => {
    for (let i = 0; i < order.length; i++) {
      if (cancelled) return;
      const n = order[i];
      events.onNodeStart?.(n.id);

      // upstream inputs
      const upstream = edges.filter(e => e.target === n.id)
        .map(e => outputs.get(e.source))
        .filter((s): s is string => Boolean(s));

      // simulate thinking
      await sleep(stepMs + Math.random() * 400);
      if (cancelled) return;

      const out = mockOutputFor(n, goal, upstream);
      outputs.set(n.id, out);
      results.push({ nodeId: n.id, output: out, at: new Date().toISOString() });
      events.onNodeDone?.(n.id, out);
      events.onProgress?.(((i + 1) / order.length) * 100);
    }

    if (cancelled) return;
    const finals = order.filter(n => edges.every(e => e.source !== n.id)).map(n => outputs.get(n.id) || '').filter(Boolean);
    const final = finals.length ? finals.join('\n\n---\n\n') : 'No terminal nodes produced output.';
    events.onFinal?.(final, results);
  };

  run().catch(err => events.onError?.('<run>', err as Error));

  return () => { cancelled = true; };
}

function sleep(ms: number) { return new Promise<void>(res => setTimeout(res, ms)); }

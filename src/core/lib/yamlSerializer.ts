/**
 * yamlSerializer.ts — bidirectional YAML ↔ WorkflowStore serialization (Story 3.2).
 *
 * YAML schema:
 *   id:     string (optional)
 *   nodes:
 *     - id:     string
 *       role:   string     ← display label in canvas
 *       type:   string     ← nodeType / category
 *       x:      number
 *       y:      number
 *       config: Record<string, unknown>  (optional)
 *   edges:
 *     - source: string
 *       target: string
 *       label:  string  (optional)
 *   policy:              (optional)
 *     rules:
 *       - sender:   string
 *         receiver: string
 *         action:   approve | reject | retry
 */

import { parse, stringify } from 'yaml';
import type { WorkflowNode, WorkflowEdge } from '../types';

/** P2-1: Gate-type node IDs — nodes whose YAML `type` matches these get category='gate'. */
const GATE_TYPES = new Set([
  'retry_gate', 'approval_gate', 'parallel', 'barrier', 'merge', 'checkpoint', 'decision', 'gate',
]);

export interface YamlWorkflow {
  id?: string;
  name?: string;
  nodes: Array<{
    id: string;
    role: string;
    type: string;
    x: number;
    y: number;
    config?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    label?: string;
  }>;
  policy?: {
    rules: Array<{ sender: string; receiver: string; action: string }>;
  };
}

export interface ParseResult {
  ok: true;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  policyRules?: YamlWorkflow['policy'];
}
export interface ParseError {
  ok: false;
  error: string;
}

export function parseWorkflowYaml(text: string): ParseResult | ParseError {
  if (!text.trim()) {
    return { ok: true, nodes: [], edges: [], policyRules: undefined };
  }
  let raw: unknown;
  try {
    raw = parse(text, { strict: true });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'YAML 根节点必须是 mapping 对象' };
  }
  const doc = raw as Record<string, unknown>;
  const rawNodes = (doc.nodes as unknown[]) ?? [];
  const rawEdges = (doc.edges as unknown[]) ?? [];

  const nodes: WorkflowNode[] = rawNodes.map((n: unknown, i) => {
    const node = n as Record<string, unknown>;
    return {
      id: String(node.id ?? `node_${i}`),
      type: 'custom',
      position: { x: Number(node.x ?? 0), y: Number(node.y ?? 0) },
      data: {
        nodeId: String(node.id ?? `node_${i}`),
        nodeType: String(node.type ?? 'default'),
        // P2-1 fix: derive category from nodeType instead of hardcoding 'agent'
        category: GATE_TYPES.has(String(node.type ?? '')) ? 'gate' : 'agent',
        label: String(node.role ?? node.id ?? ''),
        name: { en: String(node.role ?? ''), zh: String(node.role ?? '') },
        description: { en: '', zh: '' },
        icon: '',
        color: '#6b7280',
        inputs: [],
        outputs: [],
        config: (node.config as Record<string, unknown>) ?? {},
        status: 'idle' as const,
      },
    };
  });

  const edges: WorkflowEdge[] = rawEdges.flatMap((e: unknown, i) => {
    const edge = e as Record<string, unknown>;
    const srcId = String(edge.source ?? '');
    const tgtId = String(edge.target ?? '');
    // P2-7 fix: skip edges with missing source or target instead of creating dangling edges
    if (!srcId || !tgtId) return [];
    return [{
      id: `edge_${srcId}_${tgtId}_${i}`,
      source: srcId,
      target: tgtId,
      type: 'default',
      animated: false,
      data: { label: String(edge.label ?? '') },
      style: { stroke: '#52525B', strokeWidth: 2 },
    }];
  });

  return {
    ok: true,
    nodes,
    edges,
    policyRules: doc.policy as YamlWorkflow['policy'],
  };
}

export function serializeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
  const doc: YamlWorkflow = {
    nodes: nodes.map((n) => ({
      id: n.id,
      role: typeof n.data.label === 'object'
        ? (n.data.label as { en?: string }).en ?? n.id
        : String(n.data.label ?? n.id),
      type: n.data.nodeType ?? 'default',
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      ...(Object.keys(n.data.config ?? {}).length ? { config: n.data.config } : {}),
    })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      ...(e.data?.label ? { label: String(e.data.label) } : {}),
    })),
  };
  return stringify(doc, { indent: 2 });
}

import { describe, it, expect } from 'vitest';
import { parseWorkflowYaml, serializeWorkflow } from '../../core/lib/yamlSerializer';
import type { WorkflowNode, WorkflowEdge } from '../../core/types';

const SAMPLE_YAML = `
nodes:
  - id: n1
    role: Planner
    type: planner
    x: 100
    y: 200
  - id: n2
    role: Writer
    type: writer
    x: 300
    y: 200
edges:
  - source: n1
    target: n2
    label: handoff
`.trim();

describe('parseWorkflowYaml', () => {
  it('returns ok:true for valid YAML', () => {
    const result = parseWorkflowYaml(SAMPLE_YAML);
    expect(result.ok).toBe(true);
  });

  it('maps YAML nodes to WorkflowNode[]', () => {
    const result = parseWorkflowYaml(SAMPLE_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe('n1');
    expect(result.nodes[0].data.label).toBe('Planner');
    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it('maps YAML edges to WorkflowEdge[]', () => {
    const result = parseWorkflowYaml(SAMPLE_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('n1');
    expect(result.edges[0].target).toBe('n2');
    expect(result.edges[0].data?.label).toBe('handoff');
  });

  it('returns ok:false for invalid YAML', () => {
    const result = parseWorkflowYaml(': broken: - yaml [[[');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('returns ok:true with empty nodes/edges for empty string', () => {
    const result = parseWorkflowYaml('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('returns ok:false for non-mapping root', () => {
    const result = parseWorkflowYaml('- just an array');
    expect(result.ok).toBe(false);
  });

  it('parses optional policy rules', () => {
    const yaml = `
nodes: []
edges: []
policy:
  rules:
    - sender: Planner
      receiver: Writer
      action: approve
`.trim();
    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policyRules?.rules[0].action).toBe('approve');
  });
});

describe('serializeWorkflow', () => {
  const makeNode = (id: string, label: string, x: number, y: number): WorkflowNode => ({
    id,
    type: 'custom',
    position: { x, y },
    data: {
      nodeId: id,
      nodeType: 'agent',
      category: 'agent',
      label,
      name: { en: label, zh: label },
      description: { en: '', zh: '' },
      icon: '',
      color: '#6b7280',
      inputs: [],
      outputs: [],
      config: {},
      status: 'idle',
    },
  });

  const makeEdge = (id: string, source: string, target: string): WorkflowEdge => ({
    id,
    source,
    target,
    type: 'default',
    animated: false,
    data: { label: '' },
    style: { stroke: '#52525B', strokeWidth: 2 },
  });

  it('produces parseable YAML', () => {
    const nodes = [makeNode('n1', 'Planner', 50, 100)];
    const edges: WorkflowEdge[] = [];
    const yaml = serializeWorkflow(nodes, edges);
    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
  });

  it('round-trips nodes through serialize/parse', () => {
    const nodes = [makeNode('n1', 'Planner', 50, 100), makeNode('n2', 'Writer', 250, 100)];
    const edges = [makeEdge('e1', 'n1', 'n2')];
    const yaml = serializeWorkflow(nodes, edges);
    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].data.label).toBe('Planner');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('n1');
  });

  it('handles bilingual label object', () => {
    const n = makeNode('n1', 'Planner', 0, 0);
    (n.data as unknown as { label: { en: string; zh: string } }).label = { en: 'Planner', zh: '策划' };
    const yaml = serializeWorkflow([n], []);
    expect(yaml).toContain('Planner');
  });

  it('serializes idempotently (parse→serialize→parse gives same node count)', () => {
    const result1 = parseWorkflowYaml(SAMPLE_YAML);
    if (!result1.ok) throw new Error('initial parse failed');
    const yaml2 = serializeWorkflow(result1.nodes, result1.edges);
    const result2 = parseWorkflowYaml(yaml2);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.nodes).toHaveLength(result1.nodes.length);
    expect(result2.edges).toHaveLength(result1.edges.length);
  });
});

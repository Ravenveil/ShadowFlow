/**
 * arc.test.ts — ARC 产物识别与 DAG 运行态投影的回归网。
 *
 * 这两块都是纯函数：链路可解释全靠投影不出错（节点亮错人、终稿沉底
 * 都会直接变成「看不懂现场」），所以逐条钉住。
 */
import { describe, expect, it } from 'vitest';
import { deliverableTag, pinDeliverables } from '@/shared/data/arc';
import { applyRunState } from '@/shared/data/http/mappers';
import type { DagDataset, Message, RosterMember } from '@/shared/data/types';

describe('deliverableTag', () => {
  it('recognizes ARC deliverables convention', () => {
    expect(deliverableTag('deliverables', true)).toBe('final');
    expect(deliverableTag('charts', true)).toBe('charts');
    expect(deliverableTag('verification_report.json', false)).toBe('verify');
    expect(deliverableTag('paper.tex', false)).toBe('paper');
    expect(deliverableTag('paper_draft.md', false)).toBe('paper');
    expect(deliverableTag('references.bib', false)).toBe('bib');
  });

  it('leaves ordinary files untagged (case-insensitive)', () => {
    expect(deliverableTag('loop_engine.py', false)).toBeNull();
    expect(deliverableTag('Paper.TEX', false)).toBe('paper');
    expect(deliverableTag('experiments', true)).toBeNull();
  });
});

describe('pinDeliverables', () => {
  it('floats tagged entries ahead, keeps the rest in order', () => {
    const out = pinDeliverables([
      { name: 'deliverables', isDir: true },
      { name: 'logs', isDir: true },
      { name: 'verification_report.json', isDir: false },
      { name: 'loop_engine.py', isDir: false },
    ]);
    expect(out.map((e) => e.name)).toEqual([
      'deliverables',
      'verification_report.json',
      'logs',
      'loop_engine.py',
    ]);
    expect(out[0].tag).toBe('final');
    expect(out[2].tag).toBeNull();
  });

  it('returns everything untagged unchanged when nothing matches', () => {
    const out = pinDeliverables([
      { name: 'a', isDir: true },
      { name: 'b', isDir: false },
    ]);
    expect(out.map((e) => e.name)).toEqual(['a', 'b']);
    expect(out.every((e) => e.tag === null)).toBe(true);
  });
});

describe('applyRunState', () => {
  const roster: RosterMember[] = [
    { id: 'a1', name: '文献侦察', role: 'Researcher', state: 'idle' },
    { id: 'a2', name: '实验官', role: 'Runner', state: 'busy' },
  ];

  const dag: DagDataset = {
    canvas: { w: 308, h: 200 },
    nodes: [
      { id: 'n1', label: '文献', owner: 'a1', role: 'Researcher', status: 'wait' },
      { id: 'n2', label: '实验', owner: 'a2', role: 'Runner', status: 'wait' },
      { id: 'n3', label: '评审', owner: 'ghost', role: 'Reviewer', status: 'wait' },
    ],
    edges: [],
  };

  const thread: Message[] = [
    { id: 'm1', role: 'agent', author: '文献侦察', time: '', kind: 'text', text: '收集了 24 篇候选文献，筛掉 6 篇低相关' },
    { id: 'm2', role: 'user', time: '', kind: 'text', text: '继续' },
  ];

  it('marks nodes with a delivered message as done and carries the excerpt', () => {
    const out = applyRunState(dag, roster, thread);
    expect(out.nodes[0].status).toBe('done');
    expect(out.nodes[0].detail).toContain('24 篇');
  });

  it('marks busy owners as running and the rest as wait', () => {
    const out = applyRunState(dag, roster, thread);
    expect(out.nodes[1].status).toBe('running');
    expect(out.nodes[2].status).toBe('wait');
    expect(out.nodes[2].detail).toBeUndefined();
  });

  it('keeps topology and canvas untouched', () => {
    const out = applyRunState(dag, roster, thread);
    expect(out.edges).toBe(dag.edges);
    expect(out.canvas).toBe(dag.canvas);
    expect(out.nodes).toHaveLength(dag.nodes.length);
  });
});

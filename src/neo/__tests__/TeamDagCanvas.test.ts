/**
 * TeamDagCanvas — TeamWorkflow → reactflow 投影纯函数测试（2026-08-23）。
 *
 * 画布本体在 jsdom 里由 src/test/setup.ts 全局 mock 掉 reactflow（面板级
 * 行为见 GroupMembersPanel.test.tsx），这里直测不依赖 reactflow 的部分：
 * 最长路径分层（computeTeamDagColumns）与 nodes/edges 投影
 * （teamWorkflowToFlowNodes / teamWorkflowToFlowEdges，含 mode 视觉）。
 */
import { describe, expect, it } from 'vitest';
import type { TeamWorkflow } from '../../api/teams';
import {
  computeTeamDagColumns,
  teamWorkflowToFlowEdges,
  teamWorkflowToFlowNodes,
} from '../projections/TeamDagCanvas';

const chain: TeamWorkflow = {
  nodes: [
    { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: '读读', soul: '' } },
    { id: 'n2', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a2', name: '写写', soul: '' } },
    { id: 'n3', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a3', name: '批批', soul: '' } },
    { id: 'n4', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a4', name: '', soul: '' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', data: { mode: 'direct' } },
    { id: 'e2', source: 'n1', target: 'n3', data: { mode: 'approve' } },
    { id: 'e3', source: 'n2', target: 'n3', data: { mode: 'conditional' } },
    { id: 'e4', source: 'n3', target: 'n4' },
  ],
};

describe('computeTeamDagColumns — 最长路径分层', () => {
  it('菱形 DAG：源点列 0，汇合点取最长路径列', () => {
    const cols = computeTeamDagColumns(chain);
    expect(cols.get('n1')).toBe(0);
    expect(cols.get('n2')).toBe(1);
    // n3 有两条入边（1→3 长 1，1→2→3 长 2），取最长 → 列 2
    expect(cols.get('n3')).toBe(2);
    expect(cols.get('n4')).toBe(3);
  });

  it('环安全：成环/无入边节点兜底列 0，不挂死', () => {
    const cyclic: TeamWorkflow = {
      nodes: [
        { id: 'x', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'x', name: 'x', soul: '' } },
        { id: 'y', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'y', name: 'y', soul: '' } },
      ],
      edges: [
        { id: 'e1', source: 'x', target: 'y' },
        { id: 'e2', source: 'y', target: 'x' },
      ],
    };
    const cols = computeTeamDagColumns(cyclic);
    expect(cols.get('x')).toBe(0);
    expect(cols.get('y')).toBe(0);
  });
});

describe('teamWorkflowToFlowNodes — 节点投影', () => {
  it('label 取 data.name，name 缺失回退 agentId；同列内按行序排开', () => {
    const nodes = teamWorkflowToFlowNodes(chain);
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(nodes[0].data.label).toBe('读读');
    // name 空串 → 回退 agentId
    expect(nodes[3].data.label).toBe('a4');
    // 列布局：n1 列 0，n3 列 2
    expect(nodes[0].position.x).toBe(0);
    expect(nodes[2].position.x).toBe(2 * 140);
    // 同列多节点时 y 按行序递增（另造同列场景）
    const twoRoots: TeamWorkflow = {
      nodes: chain.nodes.slice(0, 2),
      edges: [],
    };
    const laid = teamWorkflowToFlowNodes(twoRoots);
    expect(laid[0].position).toEqual({ x: 0, y: 0 });
    expect(laid[1].position).toEqual({ x: 0, y: 52 });
  });
});

describe('teamWorkflowToFlowEdges — 边投影 + mode 视觉', () => {
  it('label=mode 原文；approve 警示虚线 / conditional 强调虚线 / direct 实线', () => {
    const edges = teamWorkflowToFlowEdges(chain);
    expect(edges.map((e) => [e.id, e.label])).toEqual([
      ['e1', 'direct'],
      ['e2', 'approve'],
      ['e3', 'conditional'],
      ['e4', 'direct'],
    ]);
    expect(edges[1].className).toBe('neo-gm-dag-edge--approve');
    expect(edges[1].style?.stroke).toContain('--t-warn');
    expect(edges[2].className).toBe('neo-gm-dag-edge--conditional');
    expect(edges[2].style?.stroke).toContain('--t-accent');
    // direct / mode 缺失：不加 className/style（SfReactFlowBase 默认描边）
    expect(edges[0].className).toBeUndefined();
    expect(edges[3].className).toBeUndefined();
    // source/target 原样透传
    expect(edges[1].source).toBe('n1');
    expect(edges[1].target).toBe('n3');
  });
});

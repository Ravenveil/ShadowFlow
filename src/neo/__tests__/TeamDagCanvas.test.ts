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
import { buildPairPolicyColor } from '../projections/teamPolicyVisual';
import {
  computeTeamDagColumns,
  computeTeamDagSeedLayout,
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

  it('「驳回回炉」回边（conditional 且 target 是顺序上游）不抬列（2026-11-07）', () => {
    // 用户真实数据形状：strategist→reviewer 送审 + reviewer→strategist 驳回回炉。
    // 修复前回边会把 strategist 顶到列 2（与 verifier 挤同列、列 1 后留空隙），
    // 画布上就是截图里「Matcher/Reviewer 之间一大段空隙」+ 边穿节点。
    const rework: TeamWorkflow = {
      nodes: [
        { id: 'strategist', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 's', name: '策略', soul: '' } },
        { id: 'reviewer', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'r', name: '审核', soul: '' } },
        { id: 'verifier', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'v', name: '验证', soul: '' } },
      ],
      edges: [
        { id: 'e1', source: 'strategist', target: 'reviewer', data: { mode: 'direct' } },
        { id: 'e2', source: 'reviewer', target: 'verifier', data: { mode: 'approve' } },
        { id: 'e3', source: 'reviewer', target: 'strategist', data: { mode: 'conditional' } },
      ],
    };
    const cols = computeTeamDagColumns(rework);
    expect(cols.get('strategist')).toBe(0);
    expect(cols.get('reviewer')).toBe(1);
    expect(cols.get('verifier')).toBe(2);
  });
});

describe('computeTeamDagSeedLayout — 种子布局决策（2026-11-07「DAG 太乱」修复）', () => {
  it('退化竖列（全 x 同窄带且有边）→ 分层展开成左→右流水线', () => {
    // chain 的 4 个节点全在 (0,0)（老数据竖列的极端形态），必须展开
    const pos = computeTeamDagSeedLayout(chain);
    expect(pos.get('n1')).toEqual({ x: 0, y: 0 });
    expect(pos.get('n2')).toEqual({ x: 180, y: 0 });
    expect(pos.get('n3')).toEqual({ x: 360, y: 0 });
    expect(pos.get('n4')).toEqual({ x: 540, y: 0 });
  });

  it('缺坐标的老数据 → 同样分层展开（不再 x=0 竖列种子）', () => {
    const noPos: TeamWorkflow = {
      nodes: chain.nodes.map((n) => ({ ...n, position: undefined })),
      edges: chain.edges,
    };
    const pos = computeTeamDagSeedLayout(noPos);
    expect(pos.get('n2')).toEqual({ x: 180, y: 0 });
    expect(pos.get('n4')).toEqual({ x: 540, y: 0 });
  });

  it('真实横向布局 → 原样保留（只做坐标取整）', () => {
    const laid: TeamWorkflow = {
      nodes: chain.nodes.map((n, i) => ({ ...n, position: { x: i * 200 + 5.4, y: i * 50 + 0.6 } })),
      edges: chain.edges,
    };
    const pos = computeTeamDagSeedLayout(laid);
    expect(pos.get('n1')).toEqual({ x: 5, y: 1 });
    expect(pos.get('n2')).toEqual({ x: 205, y: 51 });
    expect(pos.get('n4')).toEqual({ x: 605, y: 151 });
  });

  it('同列孤立点（无边）→ 保留存量坐标（没有边可绕圈，不动用户摆位）', () => {
    const column: TeamWorkflow = {
      nodes: chain.nodes.slice(0, 2).map((n, i) => ({ ...n, position: { x: 0, y: i * 106 } })),
      edges: [],
    };
    const pos = computeTeamDagSeedLayout(column);
    expect(pos.get('n1')).toEqual({ x: 0, y: 0 });
    expect(pos.get('n2')).toEqual({ x: 0, y: 106 });
  });
});

describe('computeTeamDagSeedLayout — 种子布局决策（2026-11-07「DAG 太乱」修复）', () => {
  it('退化竖列（全 x 同窄带且有边）→ 分层展开成左→右流水线', () => {
    // chain 的 4 个节点全在 (0,0)（老数据竖列的极端形态），必须展开
    const pos = computeTeamDagSeedLayout(chain);
    expect(pos.get('n1')).toEqual({ x: 0, y: 0 });
    expect(pos.get('n2')).toEqual({ x: 180, y: 0 });
    expect(pos.get('n3')).toEqual({ x: 360, y: 0 });
    expect(pos.get('n4')).toEqual({ x: 540, y: 0 });
  });

  it('缺坐标的老数据 → 同样分层展开（不再 x=0 竖列种子）', () => {
    const noPos: TeamWorkflow = {
      nodes: chain.nodes.map((n) => ({ ...n, position: undefined })),
      edges: chain.edges,
    };
    const pos = computeTeamDagSeedLayout(noPos);
    expect(pos.get('n2')).toEqual({ x: 180, y: 0 });
    expect(pos.get('n4')).toEqual({ x: 540, y: 0 });
  });

  it('真实横向布局 → 原样保留（只做坐标取整）', () => {
    const laid: TeamWorkflow = {
      nodes: chain.nodes.map((n, i) => ({ ...n, position: { x: i * 200 + 5.4, y: i * 50 + 0.6 } })),
      edges: chain.edges,
    };
    const pos = computeTeamDagSeedLayout(laid);
    expect(pos.get('n1')).toEqual({ x: 5, y: 1 });
    expect(pos.get('n2')).toEqual({ x: 205, y: 51 });
    expect(pos.get('n4')).toEqual({ x: 605, y: 151 });
  });

  it('同列孤立点（无边）→ 保留存量坐标（没有边可绕圈，不动用户摆位）', () => {
    const column: TeamWorkflow = {
      nodes: chain.nodes.slice(0, 2).map((n, i) => ({ ...n, position: { x: 0, y: i * 106 } })),
      edges: [],
    };
    const pos = computeTeamDagSeedLayout(column);
    expect(pos.get('n1')).toEqual({ x: 0, y: 0 });
    expect(pos.get('n2')).toEqual({ x: 0, y: 106 });
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
    // 2026-11-04：节点改为「头像在上 + 名字在下」竖排卡片，行距 52 → 78
    // 避免同列节点上下压叠（见 TeamDagCanvas.ROW_GAP）。
    expect(laid[1].position).toEqual({ x: 0, y: 78 });
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

  it('2026-11-06 策略联动：成员对命中时边线随策略染色（nodeId 经节点表解析 agentId）', () => {
    // n1=a1, n2=a2, n3=a3, n4=a4；e1(n1→n2)=a1→a2 对命中 deny
    const pairPolicy = buildPairPolicyColor({ a1: { a2: 'deny' }, a3: { a4: 'warn' } });
    const edges = teamWorkflowToFlowEdges(chain, pairPolicy);
    // e1：deny → 红色加粗，无虚线 className（direct 边不加 mode 类）
    expect(edges[0].style?.stroke).toContain('--t-err');
    expect(edges[0].style?.strokeWidth).toBe(2.4);
    expect(edges[0].className).toBeUndefined();
    // e2（n1→n3 = a1→a3）：无配置 → 沿用 approve mode 视觉（警示虚线）
    expect(edges[1].style?.stroke).toContain('--t-warn');
    expect(edges[1].className).toBe('neo-gm-dag-edge--approve');
    // e4（n3→n4 = a3→a4）：warn → 琥珀
    expect(edges[3].style?.stroke).toContain('--t-warn');
    expect(edges[3].style?.strokeWidth).toBe(1.8);
    // 反向矩阵也命中（无向对取严）：a2→a1 配 deny 时 e1 同样染色
    const reversed = buildPairPolicyColor({ a2: { a1: 'deny' } });
    expect(teamWorkflowToFlowEdges(chain, reversed)[0].style?.stroke).toContain('--t-err');
    // pairPolicy 不传 → 行为与旧版一致
    const plain = teamWorkflowToFlowEdges(chain);
    expect(plain[0].style).toBeUndefined();
  });
});

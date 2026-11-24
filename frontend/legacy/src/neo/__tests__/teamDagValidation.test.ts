/**
 * teamDagValidation 纯函数测试 — Team DAG 编辑器保存前 preflight（GAP B28）。
 * 语义对齐后端 shadowflow/api/team_validation.py:validate_workflow：
 * 自环 / 悬空端点 / 顺序边成环（direct/approve 按 sequential 参与环检测，
 * conditional/parallel 豁免 —— 「驳回回炉」互逆边对合法）。
 */
import { describe, expect, it } from 'vitest';
import {
  validateTeamWorkflowGraph,
  normalizeEdgeMode,
  isSequentialEdgeMode,
  applyEdgeMode,
} from '../projections/teamDagValidation';
import type { TeamWorkflow } from '../../api/teams';

function wf(
  nodeIds: string[],
  edges: Array<{ id: string; source: string; target: string; mode?: 'direct' | 'approve' | 'conditional' | 'parallel' }>,
): TeamWorkflow {
  return {
    nodes: nodeIds.map((id) => ({
      id,
      type: 'agentTask',
      position: { x: 0, y: 0 },
      data: { agentId: id, name: id, soul: '' },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: { mode: e.mode ?? 'direct' },
    })),
  };
}

describe('validateTeamWorkflowGraph', () => {
  it('空图 / 单节点 / 合法链式图 → 无错误', () => {
    expect(validateTeamWorkflowGraph({ nodes: [], edges: [] })).toEqual([]);
    expect(validateTeamWorkflowGraph(wf(['a'], []))).toEqual([]);
    expect(
      validateTeamWorkflowGraph(
        wf(['a', 'b', 'c'], [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ]),
      ),
    ).toEqual([]);
  });

  it('自环边被拒', () => {
    const errs = validateTeamWorkflowGraph(wf(['a'], [{ id: 'e1', source: 'a', target: 'a' }]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('自环');
  });

  it('边端点指向不存在的节点 → 逐端点报错', () => {
    const errs = validateTeamWorkflowGraph(wf(['a'], [{ id: 'e1', source: 'a', target: 'ghost' }]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('ghost');
  });

  it('direct 边成环被拒（两节点互指）', () => {
    const errs = validateTeamWorkflowGraph(
      wf(['a', 'b'], [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ]),
    );
    expect(errs.some((e) => e.includes('环路'))).toBe(true);
  });

  it('approve 边同样按 sequential 参与环检测（对齐后端 _map_mode）', () => {
    const errs = validateTeamWorkflowGraph(
      wf(['a', 'b'], [
        { id: 'e1', source: 'a', target: 'b', mode: 'approve' },
        { id: 'e2', source: 'b', target: 'a', mode: 'approve' },
      ]),
    );
    expect(errs.some((e) => e.includes('环路'))).toBe(true);
  });

  it('菱形分叉汇合（无环）合法', () => {
    const errs = validateTeamWorkflowGraph(
      wf(['a', 'b', 'c', 'd'], [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
        { id: 'e3', source: 'b', target: 'd' },
        { id: 'e4', source: 'c', target: 'd' },
      ]),
    );
    expect(errs).toEqual([]);
  });

  it('approve 边不产生额外结构错误（对齐后端：approve 无 D1 专属约束）', () => {
    const errs = validateTeamWorkflowGraph(
      wf(['a', 'b'], [{ id: 'e1', source: 'a', target: 'b', mode: 'approve' }]),
    );
    expect(errs).toEqual([]);
  });
});

describe('normalizeEdgeMode', () => {
  it('后端认识的显式模式（approve/conditional/parallel）原样保留，未知值归一为 direct', () => {
    expect(normalizeEdgeMode('approve')).toBe('approve');
    expect(normalizeEdgeMode('conditional')).toBe('conditional');
    expect(normalizeEdgeMode('parallel')).toBe('parallel');
    expect(normalizeEdgeMode('direct')).toBe('direct');
    expect(normalizeEdgeMode(undefined)).toBe('direct');
    // 2026-11-07 修复：conditional 是「驳回回炉」合法回边，round-trip 不得
    // 压成 direct（压扁后互逆边对会被环检拒掉，图根本存不下去）
    expect(normalizeEdgeMode(42)).toBe('direct');
    expect(normalizeEdgeMode('weird')).toBe('direct');
  });
});

describe('isSequentialEdgeMode — 环检测/分层口径', () => {
  it('direct/approve 是 sequential；conditional/parallel 豁免', () => {
    expect(isSequentialEdgeMode('direct')).toBe(true);
    expect(isSequentialEdgeMode('approve')).toBe(true);
    expect(isSequentialEdgeMode(undefined)).toBe(true);
    expect(isSequentialEdgeMode('conditional')).toBe(false);
    expect(isSequentialEdgeMode('parallel')).toBe(false);
  });
});

describe('conditional 回边豁免环检测（2026-11-07 用户数据复盘）', () => {
  it('送审 direct + 驳回回炉 conditional 互逆边对 → 合法（此前被误判环路）', () => {
    // 真实工作流形状：strategist→reviewer 送审、reviewer→strategist 驳回回炉
    const errs = validateTeamWorkflowGraph(
      wf(['strategist', 'reviewer'], [
        { id: 'e-review', source: 'strategist', target: 'reviewer', mode: 'direct' },
        { id: 'e-rework', source: 'reviewer', target: 'strategist', mode: 'conditional', },
      ]),
    );
    expect(errs).toEqual([]);
  });

  it('parallel 边同样豁免；纯 sequential 互逆对仍被拒', () => {
    expect(
      validateTeamWorkflowGraph(
        wf(['a', 'b'], [
          { id: 'e1', source: 'a', target: 'b', mode: 'direct' },
          { id: 'e2', source: 'b', target: 'a', mode: 'parallel' },
        ]),
      ),
    ).toEqual([]);
    const errs = validateTeamWorkflowGraph(
      wf(['a', 'b'], [
        { id: 'e1', source: 'a', target: 'b', mode: 'direct' },
        { id: 'e2', source: 'b', target: 'a', mode: 'approve' },
      ]),
    );
    expect(errs.some((e) => e.includes('环路'))).toBe(true);
  });

  it('conditional 边上的悬空端点/自环仍照常报错（豁免只针对环检测）', () => {
    const errs = validateTeamWorkflowGraph(
      wf(['a'], [{ id: 'e1', source: 'a', target: 'ghost', mode: 'conditional' }]),
    );
    expect(errs.some((e) => e.includes('ghost'))).toBe(true);
  });
});

describe('applyEdgeMode — 边 mode 切换（TeamDagEditor 属性面板）', () => {
  const edges = [
    { id: 'e1', source: 'a', target: 'b', data: { mode: 'direct' } },
    { id: 'e2', source: 'b', target: 'c', data: { mode: 'direct' } },
  ];

  it('按 id 切换目标边为 approve，其他边原样保留（对象引用不变）', () => {
    const next = applyEdgeMode(edges, 'e1', 'approve');
    expect(next[0].data).toEqual({ mode: 'approve' });
    expect(next[1]).toBe(edges[1]);
    // 不改传入数组
    expect(edges[0].data).toEqual({ mode: 'direct' });
  });

  it('approve → direct 可切回', () => {
    const approved = applyEdgeMode(edges, 'e2', 'approve');
    const back = applyEdgeMode(approved, 'e2', 'direct');
    expect(back[1].data).toEqual({ mode: 'direct' });
  });

  it('切换时保留 data 上的其他字段；无 data 的边补上 data', () => {
    const withLabel = [{ id: 'e1', data: { mode: 'direct', note: 'x' } }];
    expect(applyEdgeMode(withLabel, 'e1', 'approve')[0].data).toEqual({ mode: 'approve', note: 'x' });
    const bare: Array<{ id: string; data?: unknown }> = [{ id: 'e9' }];
    expect(applyEdgeMode(bare, 'e9', 'approve')[0].data).toEqual({ mode: 'approve' });
  });

  it('不存在的 edge id → 数组内容不变', () => {
    const next = applyEdgeMode(edges, 'ghost', 'approve');
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(edges[0]);
    expect(next[1]).toBe(edges[1]);
  });
});

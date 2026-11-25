/**
 * http/arc 映射层测试 — fixture 用真实 ARC 产物经后端 research 域返回的形状。
 * 映射只做信封拆包与宽容兜底，这里钉住行为。
 */
import { describe, expect, it } from 'vitest';

import { toArcPipelineView, toArcRunCards } from '@/shared/data/http/arc';

describe('toArcRunCards', () => {
  it('真实 run 摘要 → 视图卡', () => {
    const cards = toArcRunCards([
      {
        runId: 'rc-20261118-071512-3a2302',
        dir: 'C:/x/artifacts/rc-20261118-071512-3a2302',
        status: 'succeeded',
        doneCount: 23,
        total: 23,
        updatedAt: '2026-11-23T13:16:53+00:00',
        topic: '物理世界生成模型综述',
      },
    ]);
    expect(cards[0]).toEqual({
      runId: 'rc-20261118-071512-3a2302',
      status: 'succeeded',
      doneCount: 23,
      total: 23,
      updatedAt: '2026-11-23T13:16:53+00:00',
      topic: '物理世界生成模型综述',
    });
  });

  it('未知状态回落 unknown；缺字段不炸', () => {
    const cards = toArcRunCards([{ runId: 'rc-x', status: 'whatever' }, { runId: '' }, null as never]);
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('unknown');
    expect(cards[0].doneCount).toBe(0);
    expect(toArcRunCards(null)).toEqual([]);
  });
});

describe('toArcPipelineView', () => {
  const detail = {
    runId: 'rc-20261118-071512-3a2302',
    status: 'succeeded',
    doneCount: 23,
    total: 23,
    updatedAt: '2026-11-23T13:16:53+00:00',
    topic: '物理世界生成模型综述',
    stages: [
      {
        index: 9,
        key: 'EXPERIMENT_DESIGN',
        label: '实验设计',
        phase: 'D',
        phaseLabel: '实验设计',
        isGate: true,
        status: 'done',
        attempts: 1,
        decision: 'proceed',
        durationSec: 88.7,
        error: null,
        artifacts: [{ name: 'exp_plan.yaml', path: 'stage-09/exp_plan.yaml', kind: 'yaml', size: 100 }],
      },
      { index: 'junk' as never },
    ],
    deliverables: [
      { name: 'paper_final.md', path: 'deliverables/paper_final.md', kind: 'markdown', size: 45324 },
    ],
    verification: {
      total: 13,
      verified: 13,
      suspicious: 0,
      hallucinated: 0,
      integrityScore: 1.0,
      items: [{ citeKey: 'zhang2024physdreamer', title: 'PhysDreamer', status: 'verified', method: 'doi', confidence: 1.0 }],
    },
    quality: { score: 6, verdict: 'Accept with minor revisions', strengths: ['a'], weaknesses: ['b'] },
    decisions: [{ decision: 'refine', rollbackTarget: 'ITERATIVE_REFINE', rollbackStage: 13, attempt: 1, timestamp: '2026-11-18T12:47:55+00:00' }],
    contentMetrics: { total_citations: 13 },
  };

  it('完整详情 → 视图（含门徽标、核验、质量门、决策史）', () => {
    const view = toArcPipelineView(detail);
    expect(view?.runId).toBe('rc-20261118-071512-3a2302');
    expect(view?.stages).toHaveLength(1);
    expect(view?.stages[0].isGate).toBe(true);
    expect(view?.stages[0].artifacts[0].path).toBe('stage-09/exp_plan.yaml');
    expect(view?.verification?.integrityScore).toBe(1.0);
    expect(view?.quality?.score).toBe(6);
    expect(view?.decisions[0].rollbackStage).toBe(13);
  });

  it('缺 verification / quality / decisions 时是 null / 空数组', () => {
    const view = toArcPipelineView({ runId: 'rc-x', stages: [], deliverables: undefined, verification: null, quality: undefined });
    expect(view?.verification).toBeNull();
    expect(view?.quality).toBeNull();
    expect(view?.decisions).toEqual([]);
    expect(view?.deliverables).toEqual([]);
  });

  it('没有 runId 返回 null', () => {
    expect(toArcPipelineView(null)).toBeNull();
    expect(toArcPipelineView({} as never)).toBeNull();
  });
});

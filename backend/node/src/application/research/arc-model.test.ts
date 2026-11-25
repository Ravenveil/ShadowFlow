/**
 * arc-model 测试 — 状态推断与宽容解析，fixture 取自真实 ARC 产物
 * （artifacts/rc-20261118-071512-3a2302 的实际文件形状）。
 */
import { describe, expect, it } from 'vitest';

import {
  ARC_PIPELINE,
  ARC_TOTAL_STAGES,
  classifyArtifactKind,
  inferRunStatus,
  inferStages,
  isSafeRelPath,
  isValidRunId,
  normalizeCheckpoint,
  normalizeDecisions,
  normalizeHeartbeat,
  normalizePipelineSummary,
  normalizeQuality,
  normalizeStageDecision,
  normalizeStageHealth,
  normalizeVerification,
  parseStageDirName,
  toStageStatus,
  topicFromGoal,
  type ArcInferenceInput,
  type ArcStageDirScan,
} from './arc-model';

function emptyInput(overrides: Partial<ArcInferenceInput> = {}): ArcInferenceInput {
  return {
    dirs: [],
    checkpoint: null,
    heartbeat: null,
    summary: null,
    decisions: new Map(),
    healths: new Map(),
    goalText: null,
    ...overrides,
  };
}

function dir(name: string, files: string[] = ['decision.json']): ArcStageDirScan {
  return { dir: name, index: parseStageDirName(name)?.index ?? 0, attempt: parseStageDirName(name)?.attempt ?? 0, entries: files.map((f) => ({ name: f, isDir: false, size: 100 })) };
}

describe('ARC_PIPELINE 目录', () => {
  it('23 阶段 / 8 相位，编号连续', () => {
    expect(ARC_PIPELINE).toHaveLength(23);
    expect(ARC_TOTAL_STAGES).toBe(23);
    expect(ARC_PIPELINE.map((s) => s.index)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(new Set(ARC_PIPELINE.map((s) => s.phase))).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
  });

  it('审批门在 5 / 9 / 20', () => {
    expect(ARC_PIPELINE.filter((s) => s.isGate).map((s) => s.index)).toEqual([5, 9, 20]);
    expect(ARC_PIPELINE[4].key).toBe('LITERATURE_SCREEN');
    expect(ARC_PIPELINE[19].key).toBe('QUALITY_GATE');
  });
});

describe('parseStageDirName', () => {
  it('解析主目录与重试目录', () => {
    expect(parseStageDirName('stage-01')).toEqual({ index: 1, attempt: 0 });
    expect(parseStageDirName('stage-13_v2')).toEqual({ index: 13, attempt: 2 });
    expect(parseStageDirName('stage-99')).toBeNull();
    expect(parseStageDirName('deliverables')).toBeNull();
    expect(parseStageDirName('../../etc')).toBeNull();
  });
});

describe('classifyArtifactKind', () => {
  it('按扩展名归类 ARC 常见产物', () => {
    expect(classifyArtifactKind('paper_final.md')).toBe('markdown');
    expect(classifyArtifactKind('paper.tex')).toBe('tex');
    expect(classifyArtifactKind('references.bib')).toBe('bib');
    expect(classifyArtifactKind('quality_report.json')).toBe('json');
    expect(classifyArtifactKind('exp_plan.yaml')).toBe('yaml');
    expect(classifyArtifactKind('experiment_final.py')).toBe('code');
    expect(classifyArtifactKind('metric_heatmap.png')).toBe('image');
    expect(classifyArtifactKind('paper.pdf')).toBe('pdf');
    expect(classifyArtifactKind('cli_resume.log')).toBe('log');
    expect(classifyArtifactKind('Makefile')).toBe('other');
  });
});

describe('状态文件宽容解析（真实形状）', () => {
  it('checkpoint.json', () => {
    const checkpoint = normalizeCheckpoint({
      last_completed_stage: 23,
      last_completed_name: 'CITATION_VERIFY',
      run_id: 'rc-20261123-130026-3a2302',
      timestamp: '2026-11-23T13:16:53+00:00',
    });
    expect(checkpoint?.lastCompletedStage).toBe(23);
    expect(checkpoint?.lastCompletedName).toBe('CITATION_VERIFY');
    expect(normalizeCheckpoint(null)).toBeNull();
    expect(normalizeCheckpoint({ run_id: 'rc-x' })?.lastCompletedStage).toBe(0);
  });

  it('heartbeat.json', () => {
    const heartbeat = normalizeHeartbeat({ pid: 66252, last_stage: 23, last_stage_name: 'CITATION_VERIFY', run_id: 'rc-x', timestamp: '2026-11-23T13:16:53+00:00' });
    expect(heartbeat?.lastStage).toBe(23);
    expect(normalizeHeartbeat('junk')).toBeNull();
  });

  it('pipeline_summary.json', () => {
    const summary = normalizePipelineSummary({
      run_id: 'rc-x',
      stages_executed: 9,
      stages_done: 9,
      stages_paused: 0,
      stages_blocked: 0,
      stages_failed: 0,
      degraded: false,
      from_stage: 15,
      final_stage: 23,
      final_status: 'done',
      generated: '2026-11-23T13:16:53+00:00',
      content_metrics: { template_ratio: 0.0, citation_verify_score: 1.0, total_citations: 13, verified_citations: 13, degraded_sources: [] },
    });
    expect(summary?.finalStatus).toBe('done');
    expect(summary?.contentMetrics?.total_citations).toBe(13);
    expect(normalizePipelineSummary(undefined)).toBeNull();
  });

  it('decision_history.json（refine 回环）', () => {
    const decisions = normalizeDecisions([
      { decision: 'refine', rollback_target: 'ITERATIVE_REFINE', rollback_stage_num: 13, attempt: 1, timestamp: '2026-11-18T12:47:55+00:00' },
    ]);
    expect(decisions[0].rollbackStage).toBe(13);
    expect(decisions[0].rollbackTarget).toBe('ITERATIVE_REFINE');
    expect(normalizeDecisions('junk')).toEqual([]);
  });

  it('verification_report.json（引用核验）', () => {
    const verification = normalizeVerification({
      summary: { total: 13, verified: 13, suspicious: 0, hallucinated: 0, skipped: 0, integrity_score: 1.0 },
      results: [
        {
          cite_key: 'zhang2024physdreamer',
          title: 'PhysDreamer',
          status: 'verified',
          confidence: 1.0,
          method: 'doi',
          details: 'Confirmed via CrossRef',
          relevance_score: 0.8,
        },
        { cite_key: 'bad2020x', title: 'Broken', status: 'hallucinated', confidence: 0.0, method: null, details: '', relevance_score: null },
      ],
    });
    expect(verification?.total).toBe(13);
    expect(verification?.integrityScore).toBe(1.0);
    expect(verification?.items[0].citeKey).toBe('zhang2024physdreamer');
    expect(verification?.items[1].status).toBe('hallucinated');
    expect(normalizeVerification({})).toBeNull();
  });

  it('quality_report.json（质量门裁决）', () => {
    const quality = normalizeQuality({
      score_1_to_10: 6,
      verdict: 'Accept with minor revisions',
      strengths: ['numbers match'],
      weaknesses: ['formatting flaws'],
    });
    expect(quality?.score).toBe(6);
    expect(quality?.strengths).toEqual(['numbers match']);
    expect(quality?.weaknesses).toEqual(['formatting flaws']);
    expect(normalizeQuality({})).toBeNull();
  });

  it('decision.json / stage_health.json 的状态映射', () => {
    expect(normalizeStageDecision({ status: 'done', decision: 'proceed', error: null, ts: '2026-11-18T07:16:12+00:00' })).toEqual({
      status: 'done',
      decision: 'proceed',
      error: null,
      timestamp: '2026-11-18T07:16:12+00:00',
    });
    expect(toStageStatus('AWAITING_APPROVAL')).toBe('paused');
    expect(toStageStatus('in_progress')).toBe('running');
    expect(normalizeStageHealth({ duration_sec: 60.18, status: 'done', error: null })?.durationSec).toBeCloseTo(60.18);
  });
});

describe('topicFromGoal', () => {
  it('取一级标题并截断', () => {
    expect(topicFromGoal('# 物理世界模型\n\n正文')).toBe('物理世界模型');
    expect(topicFromGoal('无标题首行\r\n第二行')).toBe('无标题首行');
    expect(topicFromGoal('#'.repeat(100) + ' ' + 'x'.repeat(120))).toHaveLength(80);
    expect(topicFromGoal('   \n  ')).toBeNull();
  });

  it('开头是引用块 note 时跳过它取标题（真实 goal.md 形状）', () => {
    const goal = '> **Note (Stage 01 — unverified draft):** claims are estimates.\n\n# SMART Research Goal: Physics-Grounded Video Generation\n\n## **Topic**\n正文';
    expect(topicFromGoal(goal)).toBe('SMART Research Goal: Physics-Grounded Video Generation');
  });
});

describe('inferStages / inferRunStatus', () => {
  it('全跑完：checkpoint 23 + summary done → 23 done、run succeeded', () => {
    const dirs = Array.from({ length: 23 }, (_, i) => dir(`stage-${String(i + 1).padStart(2, '0')}`));
    const input = emptyInput({
      dirs,
      checkpoint: normalizeCheckpoint({ last_completed_stage: 23 }),
      summary: normalizePipelineSummary({ final_status: 'done' }),
    });
    const stages = inferStages(input);
    expect(stages.filter((s) => s.status === 'done')).toHaveLength(23);
    expect(inferRunStatus(stages, input)).toBe('succeeded');
  });

  it('进行中：checkpoint 5 + heartbeat 5 → 阶段 6 running，其后 pending；run running', () => {
    const dirs = Array.from({ length: 5 }, (_, i) => dir(`stage-${String(i + 1).padStart(2, '0')}`));
    const input = emptyInput({
      dirs,
      checkpoint: normalizeCheckpoint({ last_completed_stage: 5 }),
      heartbeat: normalizeHeartbeat({ pid: 1, last_stage: 5 }),
    });
    const stages = inferStages(input);
    expect(stages[4].status).toBe('done'); // 断点说阶段 5 已完成
    expect(stages[5].status).toBe('running'); // 断点后的第一阶段
    expect(stages[10].status).toBe('pending');
    expect(stages[8].isGate).toBe(true); // 阶段 9 EXPERIMENT_DESIGN 是审批门
    expect(inferRunStatus(stages, input)).toBe('running');
  });

  it('decision.json 决定阶段状态：failed 传染 run，paused 表示审批门等待', () => {
    const dirs = [dir('stage-01'), dir('stage-02')];
    const decisions = new Map([
      [1, normalizeStageDecision({ status: 'done', decision: 'proceed' })!],
      [2, normalizeStageDecision({ status: 'failed', decision: null, error: 'LLM timeout' })!],
    ]);
    const input = emptyInput({ dirs, decisions });
    const stages = inferStages(input);
    expect(stages[0].status).toBe('done');
    expect(stages[1].status).toBe('failed');
    expect(stages[1].error).toBe('LLM timeout');
    expect(inferRunStatus(stages, input)).toBe('failed');

    const paused = emptyInput({
      dirs: [dir('stage-05', ['shortlist.jsonl'])],
      decisions: new Map([[5, normalizeStageDecision({ status: 'paused', decision: null })!]]),
    });
    expect(inferRunStatus(inferStages(paused), paused)).toBe('paused');
    expect(inferStages(paused)[4].isGate).toBe(true);
  });

  it('重试目录计数进 attempts，主目录产物进视图', () => {
    const input = emptyInput({
      dirs: [
        { dir: 'stage-13_v1', index: 13, attempt: 1, entries: [{ name: 'experiment_v1.py', isDir: false, size: 1 }] },
        { dir: 'stage-13_v2', index: 13, attempt: 2, entries: [{ name: 'experiment_final.py', isDir: false, size: 2 }] },
      ],
    });
    const stages = inferStages(input);
    expect(stages[12].attempts).toBe(2);
    expect(stages[12].artifacts.map((a) => a.name)).toEqual(['experiment_final.py']);
    expect(stages[12].artifacts[0].path).toBe('stage-13_v2/experiment_final.py');
  });

  it('多轮 decision 冲突时以最高轮次为准（真实形状：原始轮 retry，重试轮 done）', () => {
    // 真实数据：stage-13（原始轮）failed/retry，stage-13_v2（重试轮）done
    const input = emptyInput({
      dirs: [
        { dir: 'stage-13', index: 13, attempt: 0, entries: [{ name: 'decision.json', isDir: false, size: 1 }] },
        { dir: 'stage-13_v1', index: 13, attempt: 1, entries: [{ name: 'decision.json', isDir: false, size: 1 }] },
        { dir: 'stage-13_v2', index: 13, attempt: 2, entries: [{ name: 'decision.json', isDir: false, size: 1 }] },
      ],
      decisions: new Map([
        [13, normalizeStageDecision({ status: 'done', decision: 'proceed' })!],
      ]),
    });
    const stages = inferStages(input);
    expect(stages[12].status).toBe('done');
    expect(stages[12].attempts).toBe(3);
  });

  it('没跑过的阶段也出现（pending），空 run 状态 unknown', () => {
    const stages = inferStages(emptyInput());
    expect(stages).toHaveLength(23);
    expect(stages.every((s) => s.status === 'pending')).toBe(true);
    expect(inferRunStatus(stages, emptyInput())).toBe('unknown');
  });

  it('summary done 收口优先于 running 阶段推断', () => {
    const input = emptyInput({
      checkpoint: normalizeCheckpoint({ last_completed_stage: 23 }),
      summary: normalizePipelineSummary({ final_status: 'done' }),
    });
    const stages = inferStages(input);
    expect(inferRunStatus(stages, input)).toBe('succeeded');
  });
});

describe('isValidRunId（防目录穿越）', () => {
  it('只收 rc- 前缀安全字符', () => {
    expect(isValidRunId('rc-20261118-071512-3a2302')).toBe(true);
    expect(isValidRunId('../secret')).toBe(false);
    expect(isValidRunId('stage-01')).toBe(false);
    expect(isValidRunId('rc-')).toBe(false);
    expect(isValidRunId('rc-x/y')).toBe(false);
  });

  it('run 内相对路径拒绝绝对路径与 .. 段', () => {
    expect(isSafeRelPath('stage-09/exp_plan.yaml')).toBe(true);
    expect(isSafeRelPath('deliverables/charts/a.png')).toBe(true);
    expect(isSafeRelPath('../../etc/passwd')).toBe(false);
    expect(isSafeRelPath('a\\..\\b')).toBe(false);
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('C:/win')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
  });
});

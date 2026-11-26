/**
 * arc-runs 用例测试 — 注入内存 fake reader，零 IO。
 * 形状对齐真实 ARC 产物（checkpoint / decision / verification / deliverables）。
 */
import { describe, expect, it } from 'vitest';

import type { ArcDirEntry, ArcRunReader, ArcRunStateFiles } from '../repository';
import type { ArcStageDirScan } from '../arc-model';
import { getRunDetail, listRuns, rawArtifact, readArtifact, type ArcDeps } from './arc-runs';

/** 内存 run：目录树 + 文本文件 + JSON 文件（run id 从路径推导，可放多条）。 */
interface FakeFile {
  kind: 'json' | 'text';
  body: unknown;
  size?: number;
}

function attemptOf(dir: string): number {
  return dir.includes('_v') ? Number(dir.split('_v')[1]) : 0;
}

function fakeRun(files: Record<string, FakeFile>): { runId: string; reader: ArcRunReader } {
  const runId = 'rc-20261118-071512-3a2302';
  const paths = Object.keys(files);
  const runIds = [...new Set(paths.map((p) => p.split('/')[0]).filter((id) => /^rc-/.test(id)))];

  const reader: ArcRunReader = {
    async listRunIds() {
      return runIds;
    },
    async runDir(id) {
      return runIds.includes(id) ? `/fake/${id}` : null;
    },
    async readStateFiles(id): Promise<ArcRunStateFiles> {
      return {
        checkpoint: files[`${id}/checkpoint.json`]?.body ?? null,
        heartbeat: files[`${id}/heartbeat.json`]?.body ?? null,
        summary: files[`${id}/pipeline_summary.json`]?.body ?? null,
        decisions: files[`${id}/decision_history.json`]?.body ?? null,
        goalText: (files[`${id}/stage-01/goal.md`]?.body as string) ?? null,
      };
    },
    async listStageDirs(id): Promise<ArcStageDirScan[]> {
      const scans = new Map<string, ArcStageDirScan>();
      for (const p of paths) {
        const m = new RegExp(`^${id}/(stage-\\d{2}(?:_v\\d+)?)(?:/(.+))?$`).exec(p);
        if (!m) continue;
        const scan = scans.get(m[1]) ?? {
          dir: m[1],
          index: Number(m[1].slice(6, 8)),
          attempt: attemptOf(m[1]),
          entries: [],
        };
        if (m[2]) {
          const [head, ...deep] = m[2].split('/');
          if (deep.length) {
            // 与真实 reader 一致：阶段目录扫描只看顶层，子目录以 isDir 项出现（内容由 listDir 给）
            if (!scan.entries.some((e) => e.name === head && e.isDir)) {
              scan.entries.push({ name: head, isDir: true, size: 0 });
            }
          } else {
            const file = files[p];
            scan.entries.push({ name: head, isDir: false, size: (file?.size as number) ?? 10 });
          }
        }
        scans.set(m[1], scan);
      }
      return [...scans.values()];
    },
    async listDir(id, relPath) {
      const prefix = `${id}/${relPath.replace(/\/$/, '')}/`;
      const seen = new Map<string, ArcDirEntry>();
      for (const p of paths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const [head, ...deep] = rest.split('/');
        if (!head) continue;
        const isDir = deep.length > 0;
        if (isDir) {
          seen.set(`dir:${head}`, { name: head, isDir: true, size: 0, mtimeMs: 0 });
        } else {
          const file = files[p];
          seen.set(head, { name: head, isDir: false, size: (file?.size as number) ?? 10, mtimeMs: 0 });
        }
      }
      return seen.size ? [...seen.values()] : null;
    },
    async readJson(id, relPath) {
      const file = files[`${id}/${relPath}`];
      return file?.kind === 'json' ? file.body : null;
    },
    async readText(id, relPath, maxBytes) {
      const file = files[`${id}/${relPath}`];
      if (!file || file.kind !== 'text') return null;
      const content = file.body as string;
      return { content: content.slice(0, maxBytes), truncated: content.length > maxBytes, size: content.length };
    },
    async resolvePath(id, relPath) {
      const file = files[`${id}/${relPath}`];
      return file ? `/fake/${id}/${relPath}` : null;
    },
  };

  return { runId, reader };
}

function depsOf(reader: ArcRunReader): ArcDeps {
  return { reader };
}

describe('listRuns', () => {
  it('只收 rc- 命名的 run，摘要带进度与课题', async () => {
    const { runId, reader } = fakeRun({
      'rc-20261118-071512-3a2302/checkpoint.json': { kind: 'json', body: { last_completed_stage: 5, run_id: 'rc-x', timestamp: '2026-11-18T07:16:12+00:00' } },
      'rc-20261118-071512-3a2302/stage-01/goal.md': { kind: 'text', body: '# 物理世界生成模型综述\n\n目标：…' },
      'rc-20261118-071512-3a2302/stage-01/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed', error: null, ts: '2026-11-18T07:16:12+00:00' } },
    });
    const runs = await listRuns(depsOf(reader));
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe(runId);
    expect(runs[0].doneCount).toBe(5);
    expect(runs[0].total).toBe(23);
    expect(runs[0].status).toBe('running');
    expect(runs[0].topic).toBe('物理世界生成模型综述');
    expect(runs[0].updatedAt).toBe('2026-11-18T07:16:12+00:00');
  });

  it('无状态文件的空 run 也能列出（unknown）', async () => {
    const reader = fakeRun({ 'rc-empty/notes.txt': { kind: 'text', body: 'x' } }).reader;
    const runs = await listRuns(depsOf(reader));
    expect(runs.map((r) => r.runId)).toEqual(['rc-empty']);
    expect(runs[0].status).toBe('unknown');
  });
});

describe('getRunDetail', () => {
  const full = fakeRun({
    'rc-20261118-071512-3a2302/checkpoint.json': { kind: 'json', body: { last_completed_stage: 23, last_completed_name: 'CITATION_VERIFY', timestamp: '2026-11-23T13:16:53+00:00' } },
    'rc-20261118-071512-3a2302/pipeline_summary.json': {
      kind: 'json',
      body: { final_status: 'done', degraded: false, from_stage: 15, final_stage: 23, generated: '2026-11-23T13:16:53+00:00', content_metrics: { total_citations: 13, verified_citations: 13, citation_verify_score: 1.0 } },
    },
    'rc-20261118-071512-3a2302/decision_history.json': {
      kind: 'json',
      body: [{ decision: 'refine', rollback_target: 'ITERATIVE_REFINE', rollback_stage_num: 13, attempt: 1, timestamp: '2026-11-18T12:47:55+00:00' }],
    },
    'rc-20261118-071512-3a2302/stage-01/goal.md': { kind: 'text', body: '# 物理世界生成模型综述' },
    'rc-20261118-071512-3a2302/stage-09/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed', ts: '2026-11-18T08:00:00+00:00' } },
    'rc-20261118-071512-3a2302/stage-09/exp_plan.yaml': { kind: 'text', body: 'plan: …' },
    'rc-20261118-071512-3a2302/stage-20/quality_report.json': { kind: 'json', body: { score_1_to_10: 6, verdict: 'Accept with minor revisions', strengths: ['a'], weaknesses: ['b'] } },
    'rc-20261118-071512-3a2302/stage-23/verification_report.json': {
      kind: 'json',
      body: {
        summary: { total: 13, verified: 13, suspicious: 0, hallucinated: 0, skipped: 0, integrity_score: 1.0 },
        results: [{ cite_key: 'zhang2024physdreamer', title: 'PhysDreamer', status: 'verified', confidence: 1.0, method: 'doi', details: 'ok', relevance_score: 0.8 }],
      },
    },
    'rc-20261118-071512-3a2302/deliverables/paper_final.md': { kind: 'text', body: '# Paper', size: 45324 },
    'rc-20261118-071512-3a2302/deliverables/references.bib': { kind: 'text', body: '@inproceedings{...}', size: 5675 },
    'rc-20261118-071512-3a2302/deliverables/charts': { kind: 'text', body: '', size: 0 },
  });

  it('23 阶段全量视图 + 终稿排序 + 核验 + 质量门 + 决策史', async () => {
    const result = await getRunDetail(depsOf(full.reader), full.runId);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const detail = result.value;

    expect(detail.stages).toHaveLength(23);
    expect(detail.status).toBe('succeeded');
    expect(detail.doneCount).toBe(23);
    expect(detail.topic).toBe('物理世界生成模型综述');

    const design = detail.stages[8]; // stage 9 EXPERIMENT_DESIGN（审批门）
    expect(design.key).toBe('EXPERIMENT_DESIGN');
    expect(design.isGate).toBe(true);
    expect(design.status).toBe('done');
    expect(design.decision).toBe('proceed');
    expect(design.artifacts.map((a) => a.name)).toContain('exp_plan.yaml');

    // 终稿置顶：paper_final.md 在 charts/ 目录之前
    expect(detail.deliverables[0].name).toBe('paper_final.md');
    expect(detail.deliverables.map((d) => d.name)).toContain('references.bib');

    expect(detail.verification?.verified).toBe(13);
    expect(detail.verification?.integrityScore).toBe(1.0);
    expect(detail.quality?.score).toBe(6);
    expect(detail.decisions[0].rollbackTarget).toBe('ITERATIVE_REFINE');
    expect(detail.contentMetrics?.total_citations).toBe(13);
  });

  it('未知 run → not_found；非法 id → invalid', async () => {
    expect((await getRunDetail(depsOf(full.reader), 'rc-missing')).kind).toBe('not_found');
    expect((await getRunDetail(depsOf(full.reader), '../escape')).kind).toBe('invalid');
  });

  it('多轮 decision 冲突以最高轮次为准（真实形状：原始轮 retry/failed，重试轮 done）', async () => {
    const fixture = fakeRun({
      'rc-20261118-071512-3a2302/checkpoint.json': { kind: 'json', body: { last_completed_stage: 13, timestamp: '2026-11-18T13:02:16+00:00' } },
      // 目录按乱序给出也没关系：写入按 (index, attempt) 排序
      'rc-20261118-071512-3a2302/stage-13_v2/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed' } },
      'rc-20261118-071512-3a2302/stage-13/decision.json': { kind: 'json', body: { status: 'failed', decision: 'retry' } },
      'rc-20261118-071512-3a2302/stage-13_v1/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed' } },
    });
    const result = await getRunDetail(depsOf(fixture.reader), fixture.runId);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const stage13 = result.value.stages.find((s) => s.index === 13);
    expect(stage13?.status).toBe('done');
    expect(stage13?.attempts).toBe(3);
    expect(result.value.doneCount).toBeGreaterThanOrEqual(13);
  });

  it('多轮阶段以最高轮次的 health 为准：原始轮的 429 报错不挂在已完成阶段上（真实形状 stage-13）', async () => {
    const fixture = fakeRun({
      'rc-20261118-071512-3a2302/checkpoint.json': { kind: 'json', body: { last_completed_stage: 14 } },
      'rc-20261118-071512-3a2302/stage-13/decision.json': { kind: 'json', body: { status: 'failed', decision: 'retry', error: 'All models failed. HTTP 429' } },
      'rc-20261118-071512-3a2302/stage-13/stage_health.json': { kind: 'json', body: { duration_sec: 12.5, status: 'failed', error: 'All models failed. HTTP 429' } },
      'rc-20261118-071512-3a2302/stage-13_v2/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed' } },
      'rc-20261118-071512-3a2302/stage-13_v2/stage_health.json': { kind: 'json', body: { duration_sec: 15.78, status: 'done', error: null } },
    });
    const result = await getRunDetail(depsOf(fixture.reader), fixture.runId);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const stage13 = result.value.stages.find((s) => s.index === 13);
    expect(stage13?.status).toBe('done');
    expect(stage13?.error).toBeNull();
    expect(stage13?.durationSec).toBeCloseTo(15.78);
  });

  it('阶段目录里的子目录展开成文件项：代码生成阶段的 experiment/*.py 可见、可读（真实形状 stage-10）', async () => {
    const fixture = fakeRun({
      'rc-20261118-071512-3a2302/checkpoint.json': { kind: 'json', body: { last_completed_stage: 10 } },
      'rc-20261118-071512-3a2302/stage-10/decision.json': { kind: 'json', body: { status: 'done', decision: 'proceed' } },
      'rc-20261118-071512-3a2302/stage-10/experiment_spec.md': { kind: 'text', body: 'spec' },
      'rc-20261118-071512-3a2302/stage-10/experiment/heuristic_system.py': { kind: 'text', body: 'print(1)', size: 7 },
      'rc-20261118-071512-3a2302/stage-10/experiment/run_all.py': { kind: 'text', body: 'print(2)', size: 7 },
      'rc-20261118-071512-3a2302/stage-10/experiment/__pycache__/x.cpython-314.pyc': { kind: 'text', body: '' },
    });
    const result = await getRunDetail(depsOf(fixture.reader), fixture.runId);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const artifacts = result.value.stages[9].artifacts;
    const names = artifacts.map((a) => a.name);
    expect(names).toContain('experiment_spec.md');
    expect(names).toContain('experiment/heuristic_system.py');
    expect(names).toContain('experiment/run_all.py');
    expect(names.some((n) => n.includes('__pycache__'))).toBe(false);
    expect(artifacts.find((a) => a.name === 'experiment/run_all.py')?.path).toBe('stage-10/experiment/run_all.py');
    expect((await readArtifact(depsOf(fixture.reader), fixture.runId, 'stage-10/experiment/run_all.py')).kind).toBe('ok');
  });

  it('交付目录里的子目录展开成文件：charts/*.png 可直接点开，目录本身不再出现', async () => {
    const fixture = fakeRun({
      'rc-20261118-071512-3a2302/deliverables/paper_final.md': { kind: 'text', body: '# Paper', size: 45324 },
      'rc-20261118-071512-3a2302/deliverables/charts/fig_main_comparison.png': { kind: 'text', body: 'png', size: 81234 },
      'rc-20261118-071512-3a2302/deliverables/charts/fig_ablation_summary.png': { kind: 'text', body: 'png', size: 2345 },
      'rc-20261118-071512-3a2302/deliverables/viz_steps/step01/frame.png': { kind: 'text', body: 'png', size: 10 },
    });
    const result = await getRunDetail(depsOf(fixture.reader), fixture.runId);
    if (result.kind !== 'ok') throw new Error('expected ok');
    const names = result.value.deliverables.map((d) => d.name);
    expect(names[0]).toBe('paper_final.md'); // 终稿仍置顶
    expect(names).toContain('charts/fig_main_comparison.png');
    expect(names).toContain('viz_steps/step01/frame.png');
    expect(names.some((n) => n === 'charts' || n === 'viz_steps')).toBe(false);
    const fig = result.value.deliverables.find((d) => d.name === 'charts/fig_main_comparison.png');
    expect(fig?.path).toBe('deliverables/charts/fig_main_comparison.png');
    expect(fig?.kind).toBe('image');
  });
});

describe('readArtifact / rawArtifact', () => {
  const single = fakeRun({
    'rc-20261118-071512-3a2302/stage-17/paper_draft.md': { kind: 'text', body: 'x'.repeat(40), size: 40 },
    'rc-20261118-071512-3a2302/deliverables/paper.pdf': { kind: 'text', body: '%PDF', size: 3 },
  });

  it('读文本产物（截头语义）', async () => {
    const ok = await readArtifact(depsOf(single.reader), single.runId, 'stage-17/paper_draft.md');
    expect(ok).toEqual({ kind: 'ok', value: { content: 'x'.repeat(40), truncated: false, size: 40 } });
    expect((await readArtifact(depsOf(single.reader), single.runId, 'nope.md')).kind).toBe('not_found');
  });

  it('raw 只解析 run 内存在的文件，越界请求被拒绝', async () => {
    const ok = await rawArtifact(depsOf(single.reader), single.runId, 'deliverables/paper.pdf');
    expect(ok).toEqual({ kind: 'ok', value: `/fake/${single.runId}/deliverables/paper.pdf` });
    expect((await rawArtifact(depsOf(single.reader), single.runId, '../../etc/passwd')).kind).toBe('invalid');
  });
});

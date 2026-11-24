/**
 * research 域 — ARC run 观测用例（内部，动词命名）
 *
 * listRuns      扫全部根 → run 摘要卡（含进度），给「管线列表」
 * getRunDetail  一次 run 的完整观测视图：23 阶段状态 + 产物 + 终稿 +
 *               引用核验 + 质量门裁决 + refine/pivot 决策史
 * readArtifact  读 run 内文本产物（截头）
 * rawArtifact   run 内二进制产物（pdf/图）的绝对路径，HTTP 层拿去发流
 *
 * 只认 ArcRunReader 接口；IO 在 infra，状态推断在 model。
 */

import type { ArcRunReader } from '../repository';
import {
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
  topicFromGoal,
  type ArcArtifactRef,
  type ArcRunDetail,
  type ArcRunStatus,
  type ArcRunSummary,
  type ArcStageDecision,
  type ArcStageHealth,
  type ArcInferenceInput,
} from '../arc-model';

export type Result<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid'; code: string };

export interface ArcDeps {
  reader: ArcRunReader;
}

const TEXT_HEAD_BYTES = 256 * 1024;

/** 一次 run 的状态文件 + 目录扫描 → 推断输入（listRuns / getRunDetail 共用）。 */
async function buildInferenceInput(
  deps: ArcDeps,
  runId: string,
): Promise<{ input: ArcInferenceInput; goalText: string | null } | null> {
  const [state, dirs] = await Promise.all([deps.reader.readStateFiles(runId), deps.reader.listStageDirs(runId)]);

  // 多轮 attempt（stage-NN 与 stage-NN_vK）的 decision 可能互相矛盾（原始轮
  // failed → 重试轮 done），以**最高轮次**为准。并发读但按轮次序写 map，
  // 保证「最后写入者」确定，不吃 I/O 完成顺序的竞态。
  const ordered = [...dirs].sort((a, b) => a.index - b.index || a.attempt - b.attempt);
  const decisionRows = await Promise.all(
    ordered.map(async (scan) => {
      if (!scan.entries.some((entry) => entry.name === 'decision.json')) return null;
      return { index: scan.index, decision: normalizeStageDecision(await deps.reader.readJson(runId, `${scan.dir}/decision.json`)) };
    }),
  );
  const decisions = new Map<number, ArcStageDecision>();
  for (const row of decisionRows) {
    if (row?.decision) decisions.set(row.index, row.decision);
  }

  const healths = new Map<number, ArcStageHealth>();
  for (const scan of ordered) {
    if (healths.has(scan.index)) continue;
    if (!scan.entries.some((entry) => entry.name === 'stage_health.json')) continue;
    const health = normalizeStageHealth(await deps.reader.readJson(runId, `${scan.dir}/stage_health.json`));
    if (health) healths.set(scan.index, health);
  }

  const input: ArcInferenceInput = {
    dirs,
    checkpoint: normalizeCheckpoint(state.checkpoint),
    heartbeat: normalizeHeartbeat(state.heartbeat),
    summary: normalizePipelineSummary(state.summary),
    decisions,
    healths,
    goalText: state.goalText,
  };
  return { input, goalText: state.goalText };
}

function toSummary(runId: string, dir: string, status: ArcRunStatus, doneCount: number, updatedAt: string | null, topic: string | null): ArcRunSummary {
  return { runId, dir, status, doneCount, total: 23, updatedAt, topic };
}

/** 最新动静时间：checkpoint / heartbeat / summary 里挑能解析的最近值。 */
function latestStamp(input: ArcInferenceInput): string | null {
  const stamps = [input.checkpoint?.timestamp, input.heartbeat?.timestamp, input.summary?.generated].filter(
    (value): value is string => !!value,
  );
  stamps.sort();
  return stamps[stamps.length - 1] ?? null;
}

export async function listRuns(deps: ArcDeps): Promise<ArcRunSummary[]> {
  const runIds = await deps.reader.listRunIds();
  const summaries = await Promise.all(
    runIds.map(async (runId) => {
      const [dir, built] = await Promise.all([deps.reader.runDir(runId), buildInferenceInput(deps, runId)]);
      const input = built?.input ?? {
        dirs: [],
        checkpoint: null,
        heartbeat: null,
        summary: null,
        decisions: new Map(),
        healths: new Map(),
        goalText: null,
      };
      const stages = inferStages(input);
      const status = inferRunStatus(stages, input);
      const doneCount = stages.filter((stage) => stage.status === 'done').length;
      return toSummary(
        runId,
        dir ?? runId,
        status,
        doneCount,
        latestStamp(input),
        built?.goalText ? topicFromGoal(built.goalText) : null,
      );
    }),
  );
  // 最近有动静的排前面（rc- 名里就有时间戳，字典序即是时间序的兜底）
  return summaries.sort((a, b) => (b.updatedAt ?? b.runId).localeCompare(a.updatedAt ?? a.runId));
}

export async function getRunDetail(deps: ArcDeps, runId: string): Promise<Result<ArcRunDetail>> {
  if (!isValidRunId(runId)) return { kind: 'invalid', code: 'BAD_RUN_ID' };
  const dir = await deps.reader.runDir(runId);
  if (!dir) return { kind: 'not_found' };

  const built = await buildInferenceInput(deps, runId);
  if (!built) return { kind: 'not_found' };
  const { input, goalText } = built;
  const stages = inferStages(input);

  const [deliverableRows, verificationRaw, qualityRaw, decisionsRaw] = await Promise.all([
    deps.reader.listDir(runId, 'deliverables'),
    deps.reader.readJson(runId, 'stage-23/verification_report.json'),
    deps.reader.readJson(runId, 'stage-20/quality_report.json'),
    deps.reader.readJson(runId, 'decision_history.json'),
  ]);
  const decisions = normalizeDecisions(decisionsRaw);

  const deliverables: ArcArtifactRef[] = (deliverableRows ?? [])
    .map((entry) => ({
      name: entry.name,
      path: `deliverables/${entry.name}`,
      kind: entry.isDir ? ('other' as const) : classifyArtifactKind(entry.name),
      size: entry.size,
    }))
    .sort((a, b) => deliverableOrder(a.name, b.name));

  const verification = normalizeVerification(verificationRaw);
  const quality = normalizeQuality(qualityRaw);

  return {
    kind: 'ok',
    value: {
      runId,
      dir,
      status: inferRunStatus(stages, input),
      doneCount: stages.filter((stage) => stage.status === 'done').length,
      total: stages.length,
      updatedAt: latestStamp(input),
      topic: goalText ? topicFromGoal(goalText) : null,
      stages,
      deliverables,
      verification,
      quality,
      decisions,
      contentMetrics: input.summary?.contentMetrics ?? null,
    },
  };
}

/** 读 run 内文本产物的截头内容（md / json / yaml / log / tex…）。 */
export async function readArtifact(
  deps: ArcDeps,
  runId: string,
  relPath: string,
): Promise<Result<{ content: string; truncated: boolean; size: number }>> {
  if (!isValidRunId(runId) || !isSafeRelPath(relPath)) return { kind: 'invalid', code: 'BAD_PATH' };
  const hit = await deps.reader.readText(runId, relPath, TEXT_HEAD_BYTES);
  if (!hit) return { kind: 'not_found' };
  return { kind: 'ok', value: hit };
}

/** 二进制产物（pdf / 图）的绝对路径；HTTP 层负责发流与 Content-Type。 */
export async function rawArtifact(deps: ArcDeps, runId: string, relPath: string): Promise<Result<string>> {
  if (!isValidRunId(runId) || !isSafeRelPath(relPath)) return { kind: 'invalid', code: 'BAD_PATH' };
  const file = await deps.reader.resolvePath(runId, relPath);
  if (!file) return { kind: 'not_found' };
  return { kind: 'ok', value: file };
}

/* ── 私有：deliverables 排序与产物归类 ─────────────────────────────── */

const DELIVERABLE_ORDER = [
  'paper_final.md',
  'paper.pdf',
  'paper_zh.pdf',
  'paper.tex',
  'references.bib',
  'verification_report.json',
  'manifest.json',
];

function deliverableOrder(a: string, b: string): number {
  const ia = DELIVERABLE_ORDER.indexOf(a);
  const ib = DELIVERABLE_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

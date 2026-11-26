/**
 * research 域 — ARC（AutoResearchClaw）管线模型（内部，纯领域）
 *
 * ARC 每次运行把过程与成果落在文件系统：
 *   artifacts/rc-<时间戳>-<哈希>/
 *     ├── stage-01..stage-23/     每阶段一个目录（decision.json + stage_health.json + 产物）
 *     ├── stage-NN_vK/            重试/精炼轮次（ITERATIVE_REFINE 等阶段的第 K 次尝试）
 *     ├── checkpoint.json         断点（last_completed_stage，原子写）
 *     ├── heartbeat.json          心跳（pid + 当前阶段）
 *     ├── pipeline_summary.json   终局汇总（final_status + content_metrics）
 *     ├── decision_history.json   RESEARCH_DECISION 的 refine/pivot 历史
 *     └── deliverables/           终稿打包（paper.tex / references.bib / verification_report.json / charts）
 *
 * 本文件把这些**目录约定**变成结构化数据模型：23 阶段目录（相位/审批门）、
 * 各状态文件的宽容解析、由目录扫描 + 状态文件推断每阶段状态。
 * 全部纯函数，禁止 import express / fs / sqlite —— 文件 IO 在 infra/。
 */

/* ── 管线目录（ARC 固定的 23 阶段 / 8 相位） ────────────────────────── */

export interface ArcStageMeta {
  /** 1..23 */
  index: number;
  /** ARC 阶段键名（如 TOPIC_INIT）。 */
  key: string;
  /** 中文阶段名（界面直接显示）。 */
  label: string;
  /** 相位字母 A..H。 */
  phase: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  phaseLabel: string;
  /** 审批门：暂停等人批准（LITERATURE_SCREEN / EXPERIMENT_DESIGN / QUALITY_GATE）。 */
  isGate: boolean;
}

const PHASES: Record<ArcStageMeta['phase'], string> = {
  A: '研究界定',
  B: '文献发现',
  C: '知识综合',
  D: '实验设计',
  E: '实验执行',
  F: '分析决策',
  G: '论文写作',
  H: '最终化',
};

/** (index, key, label, phase, gate) 五元组表 —— 与 ARC 的 Stage 枚举一一对应。 */
const STAGE_ROWS: ReadonlyArray<[number, string, string, ArcStageMeta['phase'], boolean]> = [
  [1, 'TOPIC_INIT', '课题初始化', 'A', false],
  [2, 'PROBLEM_DECOMPOSE', '问题分解', 'A', false],
  [3, 'SEARCH_STRATEGY', '检索策略', 'B', false],
  [4, 'LITERATURE_COLLECT', '文献收集', 'B', false],
  [5, 'LITERATURE_SCREEN', '文献筛选', 'B', true],
  [6, 'KNOWLEDGE_EXTRACT', '知识抽取', 'B', false],
  [7, 'SYNTHESIS', '知识综合', 'C', false],
  [8, 'HYPOTHESIS_GEN', '假设生成', 'C', false],
  [9, 'EXPERIMENT_DESIGN', '实验设计', 'D', true],
  [10, 'CODE_GENERATION', '代码生成', 'D', false],
  [11, 'RESOURCE_PLANNING', '资源规划', 'D', false],
  [12, 'EXPERIMENT_RUN', '实验执行', 'E', false],
  [13, 'ITERATIVE_REFINE', '迭代精炼', 'E', false],
  [14, 'RESULT_ANALYSIS', '结果分析', 'F', false],
  [15, 'RESEARCH_DECISION', '研究决策', 'F', false],
  [16, 'PAPER_OUTLINE', '论文提纲', 'G', false],
  [17, 'PAPER_DRAFT', '论文初稿', 'G', false],
  [18, 'PEER_REVIEW', '同行评审', 'G', false],
  [19, 'PAPER_REVISION', '论文修订', 'G', false],
  [20, 'QUALITY_GATE', '质量门', 'H', true],
  [21, 'KNOWLEDGE_ARCHIVE', '知识归档', 'H', false],
  [22, 'EXPORT_PUBLISH', '导出发布', 'H', false],
  [23, 'CITATION_VERIFY', '引用核验', 'H', false],
];

export const ARC_PIPELINE: ReadonlyArray<ArcStageMeta> = STAGE_ROWS.map(
  ([index, key, label, phase, isGate]) => ({ index, key, label, phase, phaseLabel: PHASES[phase], isGate }),
);

export const ARC_TOTAL_STAGES = ARC_PIPELINE.length;

/* ── 实体 ──────────────────────────────────────────────────────────── */

export type ArcStageStatus = 'pending' | 'running' | 'done' | 'failed' | 'paused' | 'skipped';

export type ArcArtifactKind =
  | 'markdown' | 'tex' | 'bib' | 'json' | 'yaml' | 'code' | 'image' | 'pdf' | 'log' | 'other';

/** 一份阶段产物（相对 run 目录的路径）。 */
export interface ArcArtifactRef {
  name: string;
  /** 相对 run 目录的 posix 风格路径（如 `stage-09/exp_plan.yaml`）。 */
  path: string;
  kind: ArcArtifactKind;
  size: number;
}

/** 一个阶段的观测视图：状态 + 尝试轮次 + 产物清单。 */
export interface ArcStageView {
  index: number;
  key: string;
  label: string;
  phase: ArcStageMeta['phase'];
  phaseLabel: string;
  isGate: boolean;
  status: ArcStageStatus;
  /** 该阶段出现过的目录数（ITERATIVE_REFINE 多轮 = v1..vN）。 */
  attempts: number;
  /** decision.json 的决定（proceed / refine / pivot），可解释链路用。 */
  decision: string | null;
  durationSec: number | null;
  error: string | null;
  artifacts: ArcArtifactRef[];
}

export type ArcRunStatus = 'running' | 'succeeded' | 'failed' | 'paused' | 'unknown';

export interface ArcRunSummary {
  runId: string;
  /** run 目录绝对路径（前端不拿它拼 URL，只用于会话工作目录关联）。 */
  dir: string;
  status: ArcRunStatus;
  doneCount: number;
  total: number;
  /** 最近一次动静（checkpoint / heartbeat / 目录 mtime 的最大值）。 */
  updatedAt: string | null;
  /** 课题（stage-01/goal.md 的一级标题），可能为空。 */
  topic: string | null;
}

export interface ArcVerificationItem {
  citeKey: string;
  title: string;
  status: string;
  method: string | null;
  confidence: number | null;
  relevance: number | null;
  details: string | null;
}

export interface ArcVerification {
  total: number;
  verified: number;
  suspicious: number;
  hallucinated: number;
  integrityScore: number | null;
  items: ArcVerificationItem[];
}

export interface ArcQuality {
  score: number | null;
  verdict: string | null;
  strengths: string[];
  weaknesses: string[];
}

export interface ArcDecisionRecord {
  decision: string;
  rollbackTarget: string | null;
  rollbackStage: number | null;
  attempt: number | null;
  timestamp: string | null;
}

export interface ArcRunDetail extends ArcRunSummary {
  stages: ArcStageView[];
  deliverables: ArcArtifactRef[];
  verification: ArcVerification | null;
  quality: ArcQuality | null;
  decisions: ArcDecisionRecord[];
  contentMetrics: Record<string, unknown> | null;
}

/* ── 目录名与产物归类 ──────────────────────────────────────────────── */

/** `stage-09` / `stage-13_v2` → { index: 9, attempt: 2 }；不合法返回 null。 */
export function parseStageDirName(name: string): { index: number; attempt: number } | null {
  const m = /^stage-(\d{1,2})(?:_v(\d+))?$/.exec(name);
  if (!m) return null;
  const index = Number(m[1]);
  if (index < 1 || index > ARC_TOTAL_STAGES) return null;
  return { index, attempt: m[2] ? Number(m[2]) : 0 };
}

const KIND_BY_EXT: ReadonlyArray<[RegExp, ArcArtifactKind]> = [
  [/^\.(md|markdown|mdx)$/, 'markdown'],
  [/^\.tex$/, 'tex'],
  [/^\.bib$/, 'bib'],
  [/^\.json$/, 'json'],
  [/^\.(ya?ml)$/, 'yaml'],
  [/^\.(py|sh|js|ts|r|ipynb)$/, 'code'],
  [/^\.(png|jpe?g|gif|webp|bmp|svg|avif)$/, 'image'],
  [/^\.pdf$/, 'pdf'],
  [/^\.(log|txt|out|err)$/, 'log'],
];

export function classifyArtifactKind(name: string): ArcArtifactKind {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'other';
  const ext = name.slice(dot).toLowerCase();
  for (const [re, kind] of KIND_BY_EXT) if (re.test(ext)) return kind;
  return 'other';
}

/* ── 状态文件的宽容解析（ARC 版本演进时缺字段不炸） ─────────────────── */

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface ArcCheckpoint {
  lastCompletedStage: number;
  lastCompletedName: string | null;
  runId: string | null;
  timestamp: string | null;
}

export function normalizeCheckpoint(raw: unknown): ArcCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const last = num(o.last_completed_stage);
  if (last === null && !str(o.run_id)) return null;
  return {
    lastCompletedStage: last ?? 0,
    lastCompletedName: str(o.last_completed_name),
    runId: str(o.run_id),
    timestamp: str(o.timestamp),
  };
}

export interface ArcHeartbeat {
  pid: number | null;
  lastStage: number | null;
  lastStageName: string | null;
  timestamp: string | null;
}

export function normalizeHeartbeat(raw: unknown): ArcHeartbeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const last = num(o.last_stage);
  if (last === null && num(o.pid) === null) return null;
  return { pid: num(o.pid), lastStage: last, lastStageName: str(o.last_stage_name), timestamp: str(o.timestamp) };
}

export interface ArcPipelineSummary {
  finalStatus: string | null;
  degraded: boolean;
  stagesDone: number;
  stagesFailed: number;
  stagesPaused: number;
  fromStage: number | null;
  finalStage: number | null;
  generated: string | null;
  contentMetrics: Record<string, unknown> | null;
}

export function normalizePipelineSummary(raw: unknown): ArcPipelineSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const metrics = o.content_metrics;
  return {
    finalStatus: str(o.final_status),
    degraded: o.degraded === true,
    stagesDone: num(o.stages_done) ?? 0,
    stagesFailed: num(o.stages_failed) ?? 0,
    stagesPaused: num(o.stages_paused) ?? 0,
    fromStage: num(o.from_stage),
    finalStage: num(o.final_stage),
    generated: str(o.generated),
    contentMetrics: metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>) : null,
  };
}

export function normalizeDecisions(raw: unknown): ArcDecisionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      decision: str(row.decision) ?? 'unknown',
      rollbackTarget: str(row.rollback_target),
      rollbackStage: num(row.rollback_stage_num),
      attempt: num(row.attempt),
      timestamp: str(row.timestamp),
    }));
}

/** stage-XX/decision.json：单阶段的决定与状态。 */
export interface ArcStageDecision {
  status: ArcStageStatus;
  decision: string | null;
  error: string | null;
  timestamp: string | null;
}

const STATUS_BY_RAW: Record<string, ArcStageStatus> = {
  done: 'done',
  ok: 'done',
  success: 'done',
  succeeded: 'done',
  failed: 'failed',
  error: 'failed',
  paused: 'paused',
  waiting: 'paused',
  awaiting_approval: 'paused',
  gate: 'paused',
  skipped: 'skipped',
  running: 'running',
  in_progress: 'running',
  pending: 'pending',
};

export function toStageStatus(raw: unknown): ArcStageStatus {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return STATUS_BY_RAW[key] ?? 'done';
}

export function normalizeStageDecision(raw: unknown): ArcStageDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    status: toStageStatus(o.status),
    decision: str(o.decision),
    error: str(o.error),
    timestamp: str(o.ts) ?? str(o.timestamp),
  };
}

/** stage-XX/stage_health.json：耗时与错误。 */
export interface ArcStageHealth {
  durationSec: number | null;
  status: ArcStageStatus | null;
  error: string | null;
}

export function normalizeStageHealth(raw: unknown): ArcStageHealth | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const status = o.status === undefined || o.status === null ? null : toStageStatus(o.status);
  return { durationSec: num(o.duration_sec), status, error: str(o.error) };
}

export function normalizeVerification(raw: unknown): ArcVerification | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const summary = o.summary && typeof o.summary === 'object' ? (o.summary as Record<string, unknown>) : {};
  const rows = Array.isArray(o.results) ? o.results : [];
  const items: ArcVerificationItem[] = rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      citeKey: str(row.cite_key) ?? '',
      title: str(row.title) ?? '',
      status: str(row.status) ?? 'unknown',
      method: str(row.method),
      confidence: num(row.confidence),
      relevance: num(row.relevance_score),
      details: str(row.details),
    }))
    .filter((item) => item.citeKey || item.title);
  if (!items.length && num(summary.total) === null) return null;
  return {
    total: num(summary.total) ?? items.length,
    verified: num(summary.verified) ?? items.filter((i) => i.status === 'verified').length,
    suspicious: num(summary.suspicious) ?? items.filter((i) => i.status === 'suspicious').length,
    hallucinated: num(summary.hallucinated) ?? items.filter((i) => i.status === 'hallucinated').length,
    integrityScore: num(summary.integrity_score),
    items,
  };
}

export function normalizeQuality(raw: unknown): ArcQuality | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const score = num(o.score_1_to_10);
  const verdict = str(o.verdict);
  if (score === null && !verdict) return null;
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()) : [];
  return {
    score,
    verdict,
    strengths: list(o.strengths),
    weaknesses: list(o.weaknesses ?? o.issues ?? o.weak_points),
  };
}

/**
 * 课题 = stage-01/goal.md 里最像标题的一行：优先 `#` 一级标题；
 * 没有标题就取第一条不是引用块（ARC 会在开头加 unverified note）的散文行。
 * 截 80 字。
 */
export function topicFromGoal(content: string): string | null {
  let prose: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading?.[1]?.trim()) return heading[1].trim().slice(0, 80);
    if (!prose && line.trim() && !line.trimStart().startsWith('>')) prose = line.trim();
  }
  return prose ? prose.slice(0, 80) : null;
}

/* ── 状态推断（目录扫描 + 状态文件 → 每阶段视图） ───────────────────── */

/** infra 扫出来的一段目录内容（纯数据，模型不做 IO）。 */
export interface ArcStageDirScan {
  dir: string;
  index: number;
  attempt: number;
  entries: Array<{ name: string; isDir: boolean; size: number }>;
}

/** 推断期的全部输入：一次 run 的目录扫描 + 已解析的状态文件。 */
export interface ArcInferenceInput {
  dirs: ArcStageDirScan[];
  checkpoint: ArcCheckpoint | null;
  heartbeat: ArcHeartbeat | null;
  summary: ArcPipelineSummary | null;
  /** stage index → 该阶段的 decision.json / stage_health.json 解析结果。 */
  decisions: Map<number, ArcStageDecision>;
  healths: Map<number, ArcStageHealth>;
  /** 最新尝试目录里的文件清单（index → 主目录 entries）。 */
  goalText: string | null;
}

/** pipeline_summary.json 里表示「仍在推进」的 final_status；其余（done / failed / paused / blocked…）都是终局。 */
const LIVE_SUMMARY_STATUS = new Set(['running', 'in_progress', 'active']);

/**
 * 汇总是否代表一次还在跑的运行。它是终局才写的，所以只要有 final_status 管线
 * 就停了；唯一的例外是失败后续跑 —— 旧汇总还留在盘上，但心跳已经比它新。
 */
function summaryIsLive(summary: ArcPipelineSummary | null, heartbeat: ArcHeartbeat | null): boolean {
  if (!summary?.finalStatus) return true;
  if (heartbeat?.timestamp && summary.generated && heartbeat.timestamp > summary.generated) return true;
  return LIVE_SUMMARY_STATUS.has(summary.finalStatus.toLowerCase());
}

/**
 * `halted` = 前面已有阶段以失败/暂停收尾。此时管线不会自己往下走，后面没有
 * 自己证据（decision.json / 目录）的阶段一律待启动。
 */
function statusForStage(index: number, input: ArcInferenceInput, halted: boolean): ArcStageStatus {
  const decision = input.decisions.get(index);
  if (decision) return decision.status;

  const hasDir = input.dirs.some((d) => d.index === index);
  const completed = input.checkpoint?.lastCompletedStage ?? 0;
  const summaryDone = input.summary?.finalStatus === 'done';

  // 断点说这一阶段已完成（decision.json 可能是旧版本 ARC 没写的）
  if (completed >= index || (summaryDone && (input.summary?.finalStage ?? 0) >= index)) {
    return 'done';
  }
  if (hasDir) {
    // 目录已建但 decision.json 还没落：阶段已开跑未收尾
    return 'running';
  }

  // 断点之后的第一个阶段 = 正在跑的那一个；更靠后的都是待办。
  // 汇总已是终局时 final_stage 只说明「停在哪儿」，不能拿来把下一阶段推成进行中。
  const live = summaryIsLive(input.summary, input.heartbeat);
  const frontier = Math.max(completed, input.heartbeat?.lastStage ?? 0, live ? input.summary?.finalStage ?? 0 : 0);
  if (!halted && live && index === frontier + 1 && !summaryDone && (input.checkpoint || input.heartbeat)) return 'running';
  return 'pending';
}

/** 23 个阶段的全量视图（没跑到的阶段也要出现，界面才是一条完整管线）。 */
export function inferStages(input: ArcInferenceInput): ArcStageView[] {
  const stages: ArcStageView[] = [];
  let halted = false;
  for (const meta of ARC_PIPELINE) {
    const attempts = input.dirs
      .filter((d) => d.index === meta.index)
      .sort((a, b) => a.attempt - b.attempt);
    const primary = attempts[attempts.length - 1] ?? null;
    const decision = input.decisions.get(meta.index) ?? null;
    const health = input.healths.get(meta.index) ?? null;
    const artifacts: ArcArtifactRef[] = primary
      ? primary.entries
          .filter((e) => !e.isDir)
          .map((e) => ({
            name: e.name,
            path: `${primary.dir}/${e.name}`,
            kind: classifyArtifactKind(e.name),
            size: e.size,
          }))
      : [];
    const status = statusForStage(meta.index, input, halted);
    if (status === 'failed' || status === 'paused') halted = true;
    stages.push({
      index: meta.index,
      key: meta.key,
      label: meta.label,
      phase: meta.phase,
      phaseLabel: meta.phaseLabel,
      isGate: meta.isGate,
      status,
      attempts: attempts.length,
      decision: decision?.decision ?? null,
      durationSec: health?.durationSec ?? null,
      error: decision?.error ?? health?.error ?? null,
      artifacts,
    });
  }
  return stages;
}

/** run 整体状态：终局汇总优先，其次失败/暂停阶段，再有动静就是进行中。 */
export function inferRunStatus(stages: ArcStageView[], input: ArcInferenceInput): ArcRunStatus {
  const finalStatus = input.summary?.finalStatus;
  if (finalStatus === 'done' || finalStatus === 'success' || finalStatus === 'succeeded') return 'succeeded';
  if (finalStatus === 'failed' || finalStatus === 'error') return 'failed';
  if (stages.some((s) => s.status === 'failed')) return 'failed';
  if (stages.some((s) => s.status === 'paused')) return 'paused';
  if (stages.some((s) => s.status === 'running')) return 'running';
  if (input.checkpoint || input.heartbeat) return 'succeeded';
  return 'unknown';
}

/** run 是否合法 id（防目录穿越：只收 rc- 前缀的安全字符）。 */
export function isValidRunId(runId: string): boolean {
  return /^rc-[A-Za-z0-9._-]+$/.test(runId);
}

/** run 内相对路径的形状检查：绝对路径 / '..' 段一律拒绝（纵深防御，外层还有 fs 收口）。 */
export function isSafeRelPath(relPath: string): boolean {
  if (!relPath || relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath)) return false;
  return !relPath.split(/[\\/]+/).some((segment) => segment === '..');
}

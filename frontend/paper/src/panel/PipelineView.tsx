/**
 * PipelineView — 右栏「管线」页：ARC run 的阶段观测视图。
 *
 * 23 个阶段按 8 个相位分组竖排；每行 = 阶段状态 + 审批门徽标 + 决定 +
 * 轮次 + 耗时；点开一行看该阶段产物，产物可预览（文本 / 图 / 终稿 PDF）。
 * 页尾三节给「检查成果」：引用核验清单、质量门裁决、终稿与交付。
 *
 * 纯展示：数据与动作全从 props 进（AgentPanel 负责加载与轮询），
 * 文案在 `content/app.ts` 的 PIPE，颜色只用 data-tone。
 */
import { useState } from 'react';
import { PIPE } from '../content/app';
import type { ArcPipelineView, ArcRunCard, ArcRunFile, ArcStageView, ArtifactContent } from '../data/types';
import { toneAttr, type ToneName } from '../theme/tones';
import {
  IconAlert,
  IconCheckCircle,
  IconChevron,
  IconCircleDashed,
  IconFile,
  IconLoader,
  IconRefresh,
  IconShield,
} from '../shell/icons';
import { sizeLabel } from '../ui/format';

/** 状态 → 语义色调（色值在 tokens.css 的 --tone-*，组件只出标签）。 */
const RUN_TONE: Record<string, ToneName> = {
  running: 'blue',
  succeeded: 'green',
  failed: 'red',
  paused: 'amber',
  unknown: 'slate',
};

const STAGE_TONE: Record<ArcStageView['status'], ToneName> = {
  done: 'green',
  running: 'blue',
  failed: 'red',
  paused: 'amber',
  pending: 'slate',
  skipped: 'slate',
};

const STATUS_ICON: Record<ArcStageView['status'], (p: { size?: number }) => JSX.Element> = {
  done: IconCheckCircle,
  running: IconLoader,
  failed: IconAlert,
  paused: IconShield,
  pending: IconCircleDashed,
  skipped: IconCircleDashed,
};

type ArcPreview =
  | { kind: 'image'; name: string; url: string }
  | { kind: 'pdf'; name: string; url: string }
  | { kind: 'text'; name: string; content: string; truncated: boolean };

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

/** decision 字段的展示文案（proceed / refine / pivot；未知原样）。 */
function decisionText(decision: string | null): string | null {
  if (!decision) return null;
  const key = decision.toLowerCase() as keyof typeof PIPE.decisionLabel;
  return PIPE.decisionLabel[key] ?? decision;
}

export function PipelineView({
  runs,
  view,
  activeRunId,
  loading,
  error,
  onPickRun,
  onRefresh,
  readArtifact,
  artifactRawUrl,
}: {
  runs: ArcRunCard[];
  view: ArcPipelineView | null;
  activeRunId: string | null;
  loading: boolean;
  error: string | null;
  onPickRun: (runId: string) => void;
  onRefresh: () => void;
  readArtifact?: (runId: string, relPath: string) => Promise<ArtifactContent>;
  artifactRawUrl?: (runId: string, relPath: string) => string;
}) {
  const [openStage, setOpenStage] = useState<number | null>(null);
  const [preview, setPreview] = useState<ArcPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const openFile = async (runId: string, file: ArcRunFile) => {
    setPreviewError(null);
    const isBitmap = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);
    const url = (isBitmap || isPdf && !!artifactRawUrl) ? artifactRawUrl?.(runId, file.path) ?? '' : '';
    if (isPdf && url) {
      setPreview({ kind: 'pdf', name: file.name, url });
      return;
    }
    if (isBitmap && url) {
      setPreview({ kind: 'image', name: file.name, url });
      return;
    }
    if (!readArtifact) {
      setPreviewError(PIPE.rawUnavailable);
      return;
    }
    setPreviewBusy(true);
    try {
      const got = await readArtifact(runId, file.path);
      setPreview({
        kind: 'text',
        name: file.name,
        content: file.kind === 'json' ? prettyJson(got.content) : got.content,
        truncated: got.truncated,
      });
    } catch (err) {
      setPreviewError(PIPE.previewLoadFail(err instanceof Error ? err.message : String(err)));
    } finally {
      setPreviewBusy(false);
    }
  };

  /* ── 产物预览（覆盖列表视图） ─────────────────────────────────── */
  if (preview) {
    return (
      <div className="pipe">
        <div className="pipe-prev-bar">
          <button
            type="button"
            className="pipe-back"
            onClick={() => {
              setPreview(null);
              setPreviewError(null);
            }}
          >
            <IconChevron size={12} />
            {PIPE.stageBack}
          </button>
          <span className="pipe-prev-name" title={preview.name}>{preview.name}</span>
        </div>
        {preview.kind === 'image' ? (
          <img className="pipe-prev-img" src={preview.url} alt={preview.name} />
        ) : preview.kind === 'pdf' ? (
          <iframe className="pipe-prev-frame" src={preview.url} title={preview.name} />
        ) : (
          <pre className="pipe-prev-code">{preview.content}</pre>
        )}
        {preview.kind === 'text' && preview.truncated ? (
          <p className="pipe-note">{PIPE.previewTruncated}</p>
        ) : null}
        {previewError ? <p className="pipe-err">{previewError}</p> : null}
      </div>
    );
  }

  /* ── 空态 ────────────────────────────────────────────────────── */
  if (!view) {
    return (
      <div className="pipe">
        {loading ? (
          <p className="pipe-note">{PIPE.loading}</p>
        ) : error ? (
          <p className="pipe-err">{error}</p>
        ) : (
          <div className="pipe-empty">
            <b>{PIPE.noRuns}</b>
            <p>{PIPE.noRunsHint}</p>
          </div>
        )}
      </div>
    );
  }

  const phases = view.stages.reduce<Array<{ phase: string; phaseLabel: string; stages: ArcStageView[] }>>(
    (acc, stage) => {
      const last = acc[acc.length - 1];
      if (last && last.phase === stage.phase) last.stages.push(stage);
      else acc.push({ phase: stage.phase, phaseLabel: stage.phaseLabel, stages: [stage] });
      return acc;
    },
    [],
  );
  const pct = view.total ? Math.round((view.doneCount / view.total) * 100) : 0;
  const verification = view.verification;

  return (
    <div className="pipe">
      {/* run 摘要头 */}
      <div className="pipe-head">
        <div className="panel-run-top">
          <span className="panel-run-kicker">{PIPE.kicker}</span>
          <span className="pipe-chip" {...toneAttr(RUN_TONE[view.status])}>{PIPE.statusLabel[view.status]}</span>
          <button
            type="button"
            className="pipe-refresh"
            onClick={onRefresh}
            title={PIPE.refresh}
            aria-label={PIPE.refresh}
          >
            <IconRefresh size={12} />
          </button>
        </div>
        <div className="pipe-topic" title={view.topic ?? undefined}>{view.topic ?? PIPE.topicFallback}</div>
        <div className="pipe-progress">
          <span>{PIPE.progress(view.doneCount, view.total)}</span>
          {view.status === 'running' ? <em>{PIPE.autoRefreshHint}</em> : null}
        </div>
        <div className="panel-run-bar"><i style={{ width: `${pct}%` }} /></div>
      </div>

      {error ? <p className="pipe-err">{error}</p> : null}

      {/* 多 run 时给切换条 */}
      {runs.length > 1 ? (
        <div className="pipe-runs">
          {runs.map((run) => (
            <button
              key={run.runId}
              type="button"
              className="pipe-run-tab"
              data-active={run.runId === activeRunId ? 'true' : undefined}
              onClick={() => onPickRun(run.runId)}
              title={run.runId}
            >
              <span className="pipe-run-dot" {...toneAttr(RUN_TONE[run.status])} aria-hidden />
              {run.runId.slice(3, 15)}
            </button>
          ))}
        </div>
      ) : null}

      {/* 23 阶段时间线，按相位分组 */}
      {phases.map((group) => (
        <div className="pipe-phase" key={group.phase}>
          <div className="pipe-phase-head">
            <span className="pipe-phase-letter" {...toneAttr('accent')}>{group.phase}</span>
            <span className="pipe-phase-name">{group.phaseLabel}</span>
            <span className="pipe-phase-meta">{PIPE.phaseMeta(group.stages.length)}</span>
          </div>
          {group.stages.map((stage) => {
            const Icon = STATUS_ICON[stage.status];
            const open = openStage === stage.index;
            const decision = decisionText(stage.decision);
            return (
              <div key={stage.index} className={`pipe-stage${stage.isGate ? ' is-gate' : ''}${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="pipe-stage-row"
                  data-open={open ? 'true' : undefined}
                  onClick={() => setOpenStage(open ? null : stage.index)}
                >
                  <span className="pipe-stage-ico" {...toneAttr(STAGE_TONE[stage.status])}>
                    <Icon size={13} />
                  </span>
                  <span className="pipe-stage-body">
                    <span className="pipe-stage-title">
                      <i className="pipe-stage-n">{stage.index}</i>
                      {stage.label}
                      {stage.isGate ? (
                        <em className="pipe-gate" title={PIPE.gateHint}>{PIPE.gateBadge}</em>
                      ) : null}
                      {stage.attempts > 1 ? (
                        <em className="pipe-tries">{PIPE.attemptsLabel(stage.attempts)}</em>
                      ) : null}
                    </span>
                    <span className="pipe-stage-meta">
                      {PIPE.stageStatus[stage.status]}
                      {decision ? ` · ${decision}` : ''}
                      {stage.durationSec != null ? ` · ${PIPE.durationLabel(stage.durationSec)}` : ''}
                    </span>
                    {stage.error ? (
                      <span className="pipe-stage-err" title={stage.error}>{stage.error}</span>
                    ) : null}
                  </span>
                  <span className="pipe-stage-go"><IconChevron size={11} /></span>
                </button>
                {open && stage.artifacts.length ? (
                  <ul className="pipe-files">
                    {stage.artifacts.map((file) => (
                      <li key={file.path} onClick={() => void openFile(view.runId, file)}>
                        <span className="pipe-file-ico"><IconFile size={12} /></span>
                        <span className="pipe-file-name" title={file.path}>{file.name}</span>
                        <span className="pipe-file-size">{sizeLabel(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {/* 引用核验清单 */}
      <div className="pipe-sec">
        <div className="pipe-sec-head">
          <span className="pipe-sec-title">{PIPE.verifyTitle}</span>
          {verification ? (
            <span className="pipe-sec-meta">
              {PIPE.verifyMeta(verification.verified, verification.total)}
              {verification.integrityScore != null ? ` · ${PIPE.verifyIntegrity(Math.round(verification.integrityScore * 100))}` : ''}
            </span>
          ) : null}
        </div>
        {verification ? (
          <>
            {verification.hallucinated > 0 ? (
              <p className="pipe-warn">{PIPE.verifyHallucinated(verification.hallucinated)}</p>
            ) : null}
            {verification.suspicious > 0 ? (
              <p className="pipe-warn">{PIPE.verifySuspicious(verification.suspicious)}</p>
            ) : null}
            <ul className="pipe-cites">
              {verification.items.map((item) => (
                <li key={item.citeKey || item.title}>
                  <span className="pipe-cite-dot" {...toneAttr(item.status === 'verified' ? 'green' : 'red')} aria-hidden />
                  <span className="pipe-cite-body">
                    <span className="pipe-cite-key" title={item.citeKey}>{item.citeKey}</span>
                    <span className="pipe-cite-title" title={item.title}>{item.title}</span>
                  </span>
                  <span className="pipe-cite-method">{item.method ?? ''}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="pipe-note">{PIPE.verifyEmpty}</p>
        )}
      </div>

      {/* 质量门裁决 */}
      <div className="pipe-sec">
        <div className="pipe-sec-head">
          <span className="pipe-sec-title">{PIPE.qualityTitle}</span>
          {view.quality?.score != null ? (
            <span className="pipe-sec-meta">{PIPE.qualityScore(view.quality.score)}</span>
          ) : null}
        </div>
        {view.quality ? (
          <>
            {view.quality.verdict ? <p className="pipe-verdict">{view.quality.verdict}</p> : null}
            {view.quality.strengths.length ? (
              <div className="pipe-list">
                <b>{PIPE.strengthsTitle}</b>
                <ul>{view.quality.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            ) : null}
            {view.quality.weaknesses.length ? (
              <div className="pipe-list">
                <b>{PIPE.weaknessesTitle}</b>
                <ul>{view.quality.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="pipe-note">{PIPE.qualityEmpty}</p>
        )}
      </div>

      {/* 决策史（refine / pivot 回环） */}
      <div className="pipe-sec">
        <div className="pipe-sec-head">
          <span className="pipe-sec-title">{PIPE.decisionsTitle}</span>
        </div>
        {view.decisions.length ? (
          <ol className="pipe-decisions">
            {view.decisions.map((row, i) => (
              <li key={`${row.timestamp}-${i}`}>
                {PIPE.decisionRow(row.decision, row.rollbackStage, row.attempt)}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pipe-note">{PIPE.decisionsEmpty}</p>
        )}
      </div>

      {/* 终稿与交付 */}
      <div className="pipe-sec">
        <div className="pipe-sec-head">
          <span className="pipe-sec-title">{PIPE.deliverTitle}</span>
          <span className="pipe-sec-meta">{view.deliverables.length}</span>
        </div>
        {view.deliverables.length ? (
          <ul className="pipe-files pipe-files--pad">
            {view.deliverables.map((file) => (
              <li key={file.path} onClick={() => void openFile(view.runId, file)}>
                <span className="pipe-file-ico"><IconFile size={13} /></span>
                <span className="pipe-file-name" title={file.path}>{file.name}</span>
                <span className="pipe-file-size">{sizeLabel(file.size)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pipe-note">{PIPE.deliverEmpty}</p>
        )}
      </div>

      {previewBusy ? <p className="pipe-note">{PIPE.loading}</p> : null}
    </div>
  );
}

export default PipelineView;

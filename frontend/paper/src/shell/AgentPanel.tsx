/**
 * AgentPanel — 第四栏「执行详情」：顶部 tab 条 + 下方 pane。
 *
 * tab 顺序按「看现场 → 认人 → 定边界 → 看图 → 取件」排：
 *   执行   ACTIVE RUN 进度 + 步骤 + 用量
 *   编队   成员（头像 / 角色 / 手上在做什么）
 *   策略举证 roster × roster 三态矩阵（旧版「协作策略」的论文语境改名）
 *   工作流 DAG（竖排，中段并行复核 + 末段审批门，连线随策略染色）
 *   产物   本轮交付文件
 *
 * 组件不认识任何具体数据：步骤的执行者、耗时、审批门说明都从 panel 读，
 * 文案从 `content/app.ts` 的 PANEL 读。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import { PANEL as PANEL_COPY } from '../content/app';
import type {
  ArcPipelineView,
  ArcRunCard,
  ArtifactContent,
  ArtifactEntry,
  ArtifactListing,
  DagDataset,
  PanelSummary,
  PolicyMatrix as Matrix,
  RosterMember,
} from '../data/types';
import { pinDeliverables } from '../data/arc';
import { PolicyMatrix } from '../panel/PolicyMatrix';
import { DagFlow } from '../panel/DagFlow';
import { RosterGrid } from '../panel/RosterGrid';
import { PipelineView } from '../panel/PipelineView';
import { sizeLabel, stampLabel } from '../ui/format';
import {
  IconArrowUp,
  IconBranch,
  IconCheck,
  IconChevron,
  IconCode,
  IconFile,
  IconFolder,
  IconImage,
  IconLayers,
  IconShield,
  IconSparkle,
  IconUsers,
} from './icons';

/** tab id 由 content 决定，组件不再重复声明一份枚举。 */
type TabId = (typeof PANEL_COPY.tabs)[number]['id'];

/** 产物预览的三种形态：位图给地址，文本给内容，PDF 给直链交给浏览器渲染。 */
type ArtifactPreview =
  | { kind: 'image'; name: string; url: string }
  | { kind: 'text'; name: string; content: string; truncated: boolean }
  | { kind: 'pdf'; name: string; url: string };

/** JSON 产物（如 ARC 的 verification_report.json） pretty 一下再展示；解析失败原样。 */
function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

/** 按扩展名挑图标：代码 / 图片 / 其余都当文档。 */
function fileIcon(ext: string): (p: { size?: number }) => JSX.Element {
  if (/^\.(ts|tsx|js|jsx|py|json|ya?ml|sh|css|html?|svg)$/.test(ext)) return IconCode;
  if (/^\.(png|jpe?g|gif|webp|bmp|avif)$/.test(ext)) return IconImage;
  return IconFile;
}

/** tab 的图标注册表；标签文案在 content 里，靠 id 对上。 */
const TAB_ICON: Record<TabId, (p: { size?: number }) => JSX.Element> = {
  run: IconSparkle,
  pipeline: IconLayers,
  team: IconUsers,
  artifacts: IconFile,
};

export function AgentPanel({
  panel,
  roster,
  policy: policySeed,
  dag,
  sessionId,
  onSavePolicy,
  onResolveApproval,
  listArtifacts,
  readArtifact,
  artifactRawUrl,
  loadArcRuns,
  loadArcPipeline,
  readArcRunArtifact,
  arcRunRawUrl,
}: {
  panel: PanelSummary;
  roster: RosterMember[];
  /** 已落库的策略矩阵；点格子只改本地草稿，保存后才回流到这里。 */
  policy: Matrix;
  dag: DagDataset;
  /** 产物页按它读会话工作目录；没有就不显示产物列表。 */
  sessionId?: string;
  onSavePolicy?: (next: Matrix) => void;
  /** 审批门决定（批准 / 拒绝）；没传（演示态）就不出按钮。 */
  onResolveApproval?: (decision: 'approve' | 'reject') => void;
  /** 产物三件套由 Shell 从数据源透传，组件不认 mock/http。 */
  listArtifacts?: (sessionId: string, dir?: string) => Promise<ArtifactListing>;
  readArtifact?: (sessionId: string, filePath: string) => Promise<ArtifactContent>;
  artifactRawUrl?: (sessionId: string, filePath: string) => string;
  /** ARC 管线四件套（同 seam 透传）：run 列表 / 详情 / 文本产物 / 二进制直链。 */
  loadArcRuns?: (sessionId: string) => Promise<ArcRunCard[]>;
  loadArcPipeline?: (runId: string) => Promise<ArcPipelineView>;
  readArcRunArtifact?: (runId: string, relPath: string) => Promise<ArtifactContent>;
  arcRunRawUrl?: (runId: string, relPath: string) => string;
}) {
  const [tab, setTab] = useState<TabId>('run');
  /** 产物页：当前这一层目录、拉到的东西、以及点开的预览。 */
  const [listing, setListing] = useState<ArtifactListing | null>(null);
  const [artBusy, setArtBusy] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtifactPreview | null>(null);
  /** 图片点开全屏看（300px 的栏里缩略图看不清字）。 */
  const [zoom, setZoom] = useState(false);
  /** 审批门决定请求在途（按钮禁用，防双击双发）。 */
  const [deciding, setDeciding] = useState(false);
  /** 连点两个目录时只认最后一次请求的结果。 */
  const artSeq = useRef(0);
  /** 管线页：run 列表 + 当前 run 的观测视图。 */
  const [arcRuns, setArcRuns] = useState<ArcRunCard[]>([]);
  const [arcRunId, setArcRunId] = useState<string | null>(null);
  const [arcView, setArcView] = useState<ArcPipelineView | null>(null);
  const [arcLoading, setArcLoading] = useState(false);
  const [arcError, setArcError] = useState<string | null>(null);

  const loadDir = useCallback(
    async (dir?: string) => {
      if (!sessionId || !listArtifacts) return;
      const seq = ++artSeq.current;
      setArtBusy(true);
      setArtError(null);
      try {
        const next = await listArtifacts(sessionId, dir);
        if (seq !== artSeq.current) return;
        setListing(next);
      } catch (err) {
        if (seq !== artSeq.current) return;
        setArtError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === artSeq.current) setArtBusy(false);
      }
    },
    [sessionId, listArtifacts],
  );

  // 只在真正打开产物页时拉目录；切会话从头看（不把上一条会话的文件留在屏上）
  useEffect(() => {
    if (tab !== 'artifacts') return;
    setPreview(null);
    setZoom(false);
    setListing(null);
    void loadDir();
  }, [tab, sessionId, loadDir]);

  /* ── 管线页（ARC run 观测）：进 tab 才拉；运行中 10s 轮询 ─────────── */

  const refreshArcView = useCallback(
    async (runId: string) => {
      if (!loadArcPipeline) return;
      try {
        const view = await loadArcPipeline(runId);
        setArcView(view);
        setArcError(null);
      } catch (err) {
        setArcError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadArcPipeline],
  );

  useEffect(() => {
    if (tab !== 'pipeline') return;
    let alive = true;
    setArcLoading(true);
    setArcError(null);
    setArcRuns([]);
    setArcView(null);
    void (async () => {
      try {
        if (!loadArcRuns || !sessionId) return;
        const runs = await loadArcRuns(sessionId);
        if (!alive) return;
        setArcRuns(runs);
        const target = runs[0]?.runId ?? null;
        setArcRunId(target);
        if (!target || !loadArcPipeline) return;
        const view = await loadArcPipeline(target);
        if (!alive) return;
        setArcView(view);
      } catch (err) {
        if (alive) setArcError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setArcLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab, sessionId, loadArcRuns, loadArcPipeline]);

  useEffect(() => {
    if (tab !== 'pipeline' || arcView?.status !== 'running' || !arcRunId) return;
    const timer = window.setInterval(() => void refreshArcView(arcRunId), 10_000);
    return () => window.clearInterval(timer);
  }, [tab, arcView?.status, arcRunId, refreshArcView]);

  const pickArcRun = useCallback(
    (runId: string) => {
      setArcRunId(runId);
      setArcView(null);
      void refreshArcView(runId);
    },
    [refreshArcView],
  );

  const openEntry = useCallback(
    async (entry: ArtifactEntry) => {
      if (!sessionId) return;
      if (entry.isDir) {
        void loadDir(entry.path);
        return;
      }

      // 位图走直链（后端 /api/fs/raw 带了 mime）；svg 当文本看源码，避免内联脚本
      const isBitmap = /^\.(png|jpe?g|gif|webp|bmp|avif)$/.test(entry.ext);
      // PDF 也走直链：浏览器原生渲染（零依赖，不引 pdf.js 的 3MB 也够用）
      const isPdf = entry.ext === '.pdf';
      const url = isBitmap || isPdf ? artifactRawUrl?.(sessionId, entry.path) ?? '' : '';
      if (isPdf && url) {
        setZoom(false);
        setPreview({ kind: 'pdf', name: entry.name, url });
        return;
      }
      if (url) {
        setZoom(false);
        setPreview({ kind: 'image', name: entry.name, url });
        return;
      }

      if (!readArtifact) return;
      setArtBusy(true);
      setArtError(null);
      try {
        const got = await readArtifact(sessionId, entry.path);
        setPreview({
          kind: 'text',
          name: entry.name,
          content: entry.ext === '.json' ? prettyJson(got.content) : got.content,
          truncated: got.truncated,
        });
      } catch (err) {
        setArtError(err instanceof Error ? err.message : String(err));
      } finally {
        setArtBusy(false);
      }
    },
    [artifactRawUrl, loadDir, readArtifact, sessionId],
  );
  const [policy, setPolicy] = useState<Matrix>(policySeed);
  const [saved, setSaved] = useState<Matrix>(policySeed);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const dirty = useMemo(() => JSON.stringify(policy) !== JSON.stringify(saved), [policy, saved]);

  // 外部换了另一份矩阵（重新加载 / 保存回流）就重置草稿，避免拿着旧数据继续改
  useEffect(() => {
    setPolicy(policySeed);
    setSaved(policySeed);
  }, [policySeed]);

  const save = () => {
    setSaved(policy);
    void onSavePolicy?.(policy);
    setFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 1800);
  };

  const doneSteps = panel.steps.filter((s) => s.done).length;
  // 0 步时别算出 NaN%（真后端新会话就是这种情况）
  const pct = panel.steps.length ? Math.round((doneSteps / panel.steps.length) * 100) : 0;

  /** 当前目录相对工作目录的路径（面包屑用；根目录时为空串）。 */
  const relDir =
    listing && listing.root && listing.dir.startsWith(listing.root)
      ? listing.dir.slice(listing.root.length).replace(/^[\\/]+/, '')
      : '';
  const crumbs = relDir ? relDir.split(/[\\/]+/).filter(Boolean) : [];

  return (
    <>
    <aside className="panel">
      <nav className="panel-tabbar" aria-label={PANEL_COPY.tabsLabel}>
        {PANEL_COPY.tabs.map(({ id, label }) => {
          const Icon = TAB_ICON[id];
          return (
            <button
              key={id}
              type="button"
              className="panel-tab"
              data-active={tab === id ? 'true' : undefined}
              onClick={() => setTab(id)}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="panel-scroll">
        {tab === 'run' ? (
          <>
            <div className="panel-run">
              <div className="panel-run-top">
                <span className="panel-run-bolt">
                  <IconSparkle size={11} />
                </span>
                <span className="panel-run-kicker">{PANEL_COPY.runKicker}</span>
                <span className="panel-run-pct">{pct}%</span>
              </div>
              <div className="panel-run-title">{panel.runTitle}</div>
              <div className="panel-run-meta">
                <span>{PANEL_COPY.elapsed(panel.elapsed)}</span>
                <span>{PANEL_COPY.stepsDone(doneSteps, panel.steps.length)}</span>
              </div>
              <div className="panel-run-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="panel-sec-head">
              <span>{PANEL_COPY.stepsSection(panel.steps.length)}</span>
              <button className="panel-sec-link" onClick={() => setTab('team')}>
                {PANEL_COPY.viewDag}
              </button>
            </div>
            {panel.steps.length ? (
            <ol className="panel-steps">
              {panel.steps.map((s, i) => (
                <li key={s.label} data-done={s.done ? 'true' : undefined}>
                  <span className="panel-step-n">{s.done ? '✓' : i + 1}</span>
                  <span className="panel-step-body">
                    <span className="panel-step-title">{s.label}</span>
                    <span className="panel-step-meta">
                      <AgentAvatar label={s.agent} size={AVATAR_SIZE.xs} status={false} />
                      {s.agent}
                    </span>
                  </span>
                  <span className="panel-step-state">
                    {s.done
                      ? PANEL_COPY.stepState.done
                      : i === doneSteps
                        ? PANEL_COPY.stepState.running
                        : PANEL_COPY.stepState.wait}
                  </span>
                </li>
              ))}
            </ol>
            ) : (
              <div className="panel-empty">
                <p>{PANEL_COPY.emptyRun}</p>
              </div>
            )}

            <div className="panel-sec">
              <div className="panel-sec-head">
                <span>{PANEL_COPY.usageTitle}</span>
                <span className="panel-sec-meta">{PANEL_COPY.usageMeta}</span>
              </div>
              <div className="panel-usage-k">{PANEL_COPY.contextLabel(panel.contextPct)}</div>
              <div className="panel-usage-v">
                {(panel.tokensUsed / 1000).toFixed(0)}k
                <span> / {(panel.tokensCap / 1000).toFixed(0)}k tokens</span>
              </div>
              <div className="panel-usage-bar">
                <i style={{ width: `${panel.contextPct}%` }} />
              </div>
            </div>
          </>
        ) : null}

        {/* 管线：ARC run 的 23 阶段观测 —— 阶段状态 / 审批门 / 引用核验 / 质量门 / 终稿 */}
        {tab === 'pipeline' ? (
          <PipelineView
            runs={arcRuns}
            view={arcView}
            activeRunId={arcRunId}
            loading={arcLoading}
            error={arcError}
            onPickRun={pickArcRun}
            onRefresh={() => arcRunId && void refreshArcView(arcRunId)}
            readArtifact={readArcRunArtifact}
            artifactRawUrl={arcRunRawUrl}
          />
        ) : null}

        {/* 编队：成员 / 工作流 / 策略举证，三节竖排同一个滚动面板 ——
            对齐旧前端 TeamPanel 的形态：工作流不是独立一页，它就是编队的一部分。 */}
        {tab === 'team' ? (
          <>
            <div className="panel-sec panel-sec--flush">
              <div className="panel-sec-head">
                <span className="panel-sec-title">
                  <IconUsers size={12} />
                  {PANEL_COPY.rosterSection(roster.length)}
                </span>
                <span className="panel-sec-meta">{PANEL_COPY.rosterMeta}</span>
              </div>
              <RosterGrid members={roster} />
            </div>

            <div className="panel-sec panel-sec--flush">
              <div className="panel-sec-head">
                <span className="panel-sec-title">
                  <IconBranch size={12} />
                  {PANEL_COPY.dagSection}
                </span>
                <span className="panel-sec-meta">
                  {PANEL_COPY.dagMeta(dag.nodes.length, dag.edges.length)}
                </span>
              </div>
              <DagFlow
                nodes={dag.nodes}
                edges={dag.edges}
                canvas={dag.canvas}
                policy={policy}
                roster={roster}
              />
              {panel.approval ? (
                <div className="panel-approve">
                  <span className="panel-approve-ico">
                    <IconCheck size={13} />
                  </span>
                  <span className="panel-approve-body">
                    <b>{panel.approval.gate}</b>
                    <span>{panel.approval.note}</span>
                  </span>
                  {panel.approval.nodeId && onResolveApproval ? (
                    <span className="panel-approve-actions">
                      <button
                        type="button"
                        className="panel-sec-btn is-ok"
                        disabled={deciding}
                        onClick={() => {
                          setDeciding(true);
                          onResolveApproval('approve');
                        }}
                      >
                        {deciding ? PANEL_COPY.deciding : PANEL_COPY.approve}
                      </button>
                      <button
                        type="button"
                        className="panel-sec-btn is-deny"
                        disabled={deciding}
                        onClick={() => {
                          setDeciding(true);
                          onResolveApproval('reject');
                        }}
                      >
                        {PANEL_COPY.reject}
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="panel-sec panel-sec--flush">
              <div className="panel-sec-head">
                <span className="panel-sec-title">
                  <IconShield size={12} />
                  {PANEL_COPY.policySection}
                </span>
                {dirty ? (
                  <button className="panel-sec-btn" onClick={save}>
                    {PANEL_COPY.savePolicy}
                  </button>
                ) : flash ? (
                  <span className="panel-pill-ok">{PANEL_COPY.policySaved}</span>
                ) : (
                  <span className="panel-sec-meta">{PANEL_COPY.policyDir}</span>
                )}
              </div>
              <PolicyMatrix roster={roster} value={policy} onChange={setPolicy} />
            </div>
          </>
        ) : null}

        {tab === 'artifacts' ? (
          preview ? (
            <div className="panel-prev">
              <div className="panel-prev-bar">
                <button
                  type="button"
                  className="panel-prev-back"
                  onClick={() => {
                    setZoom(false);
                    setPreview(null);
                  }}
                >
                  <IconChevron size={12} />
                  {PANEL_COPY.artifactsBack}
                </button>
                <span className="panel-prev-name" title={preview.name}>
                  {preview.name}
                </span>
              </div>
              {preview.kind === 'image' ? (
                <img
                  className="panel-prev-img"
                  src={preview.url}
                  alt={preview.name}
                  title={PANEL_COPY.artifactsZoom}
                  onClick={() => setZoom(true)}
                />
              ) : preview.kind === 'pdf' ? (
                <iframe className="panel-prev-pdf" src={preview.url} title={preview.name} />
              ) : (
                <>
                  <pre className="panel-prev-code">{preview.content}</pre>
                  {preview.truncated ? (
                    <p className="panel-prev-note">{PANEL_COPY.artifactsTruncated}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="panel-sec-head">
                <span>{PANEL_COPY.artifactsSection(listing?.entries.length ?? 0)}</span>
                <span className="panel-sec-meta">{PANEL_COPY.artifactsMeta}</span>
              </div>

              {listing?.root ? (
                <div className="panel-dir">
                  <button
                    type="button"
                    className="panel-dir-up"
                    onClick={() => {
                      if (listing.parent) void loadDir(listing.parent);
                    }}
                    disabled={!listing.parent || listing.dir === listing.root}
                    title={PANEL_COPY.artifactsUp}
                    aria-label={PANEL_COPY.artifactsUp}
                  >
                    <IconArrowUp size={12} />
                  </button>
                  <span className="panel-dir-path" title={listing.dir}>
                    {[PANEL_COPY.artifactsRoot, ...crumbs].join(' / ')}
                  </span>
                </div>
              ) : null}

              {artError ? <p className="panel-art-err">{PANEL_COPY.artifactsReadFail(artError)}</p> : null}

              {!listing && artBusy ? (
                <p className="panel-art-note">{PANEL_COPY.artifactsLoading}</p>
              ) : listing && !listing.root ? (
                <div className="panel-empty">
                  <b>{PANEL_COPY.artifactsNoDir}</b>
                  <p>{PANEL_COPY.artifactsNoDirHint}</p>
                </div>
              ) : listing && listing.entries.length === 0 ? (
                <div className="panel-empty">
                  <b>{PANEL_COPY.artifactsEmpty}</b>
                  <p>{PANEL_COPY.artifactsEmptyHint}</p>
                </div>
              ) : (
                <ul className="panel-files panel-files--pad">
                  {pinDeliverables(listing?.entries ?? []).map((entry) => {
                    const Glyph = entry.isDir ? IconFolder : fileIcon(entry.ext);
                    return (
                      <li key={entry.path} onClick={() => void openEntry(entry)}>
                        <span className="panel-file-icon">
                          <Glyph size={14} />
                        </span>
                        <span className="panel-file-body">
                          <span className="panel-file-name" title={entry.name}>
                            {entry.name}
                            {entry.tag ? (
                              <em className="panel-file-tag">{PANEL_COPY.deliverableLabel[entry.tag]}</em>
                            ) : null}
                          </span>
                          <span className="panel-file-meta">
                            {entry.isDir
                              ? PANEL_COPY.artifactsFolder
                              : `${sizeLabel(entry.size)} · ${stampLabel(entry.mtime)}`}
                          </span>
                        </span>
                        <span className="panel-file-go">
                          <IconChevron size={12} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )
        ) : null}
      </div>
    </aside>

    {zoom && preview?.kind === 'image' ? (
      <div className="panel-zoom" role="presentation" onClick={() => setZoom(false)}>
        <img src={preview.url} alt={preview.name} />
      </div>
    ) : null}
    </>
  );
}

export default AgentPanel;

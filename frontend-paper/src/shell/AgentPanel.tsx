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
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import { PANEL as PANEL_COPY } from '../content/app';
import type {
  DagDataset,
  PanelSummary,
  PolicyMatrix as Matrix,
  RosterMember,
} from '../data/types';
import { PolicyMatrix } from '../panel/PolicyMatrix';
import { DagFlow } from '../panel/DagFlow';
import { RosterGrid } from '../panel/RosterGrid';
import {
  IconBranch,
  IconCheck,
  IconChevron,
  IconFile,
  IconShield,
  IconSparkle,
  IconUsers,
} from './icons';

/** tab id 由 content 决定，组件不再重复声明一份枚举。 */
type TabId = (typeof PANEL_COPY.tabs)[number]['id'];

/** tab 的图标注册表；标签文案在 content 里，靠 id 对上。 */
const TAB_ICON: Record<TabId, (p: { size?: number }) => JSX.Element> = {
  run: IconSparkle,
  team: IconUsers,
  artifacts: IconFile,
};

export function AgentPanel({
  panel,
  roster,
  policy: policySeed,
  dag,
  onSavePolicy,
  onClose,
}: {
  panel: PanelSummary;
  roster: RosterMember[];
  /** 已落库的策略矩阵；点格子只改本地草稿，保存后才回流到这里。 */
  policy: Matrix;
  dag: DagDataset;
  onSavePolicy?: (next: Matrix) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<TabId>('run');
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
  const running = panel.steps.some((s) => !s.done);

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="panel-head-title">{PANEL_COPY.title}</span>
        <span className="panel-head-live">
          <i aria-hidden />
          {!panel.steps.length ? PANEL_COPY.liveIdle : running ? PANEL_COPY.liveRunning : PANEL_COPY.liveDone}
        </span>
        {onClose ? (
          <button className="sf-icon-btn" onClick={onClose} title={PANEL_COPY.close} aria-label={PANEL_COPY.close}>
            ✕
          </button>
        ) : null}
      </div>

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
          <>
            <div className="panel-sec-head">
              <span>{PANEL_COPY.artifactsSection(panel.artifacts.length)}</span>
              <span className="panel-sec-meta">{PANEL_COPY.artifactsMeta}</span>
            </div>
            <ul className="panel-files panel-files--pad">
              {panel.artifacts.map((a) => (
                <li key={a.name}>
                  <span className="panel-file-icon">
                    <IconFile size={14} />
                  </span>
                  <span className="panel-file-body">
                    <span className="panel-file-name">{a.name}</span>
                    <span className="panel-file-meta">{a.size}</span>
                  </span>
                  <span className="panel-file-go">
                    <IconChevron size={12} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </aside>
  );
}

export default AgentPanel;

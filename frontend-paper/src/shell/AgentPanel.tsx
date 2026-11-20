/**
 * AgentPanel — 第四栏「执行详情」，形态对齐旧 neo 右栏（0W9k3xh 抓拍）：
 * 顶部 tab 条 + 下方 pane，而不是一列从头滚到尾。
 *
 * tab 顺序按「看现场 → 认人 → 定边界 → 看图 → 取件」排：
 *   执行   ACTIVE RUN 进度 + 步骤 + 用量
 *   编队   成员（头像 / 角色 / 手上在做什么）
 *   策略举证 roster × roster 三态矩阵（旧版「协作策略」的论文语境改名）
 *   工作流 DAG（竖排，中段并行复核 + 末段审批门，连线随策略染色）
 *   产物   本轮交付文件
 *
 * 策略改的是本地草稿，有 diff 才出现「保存策略」；工作流连线读同一份草稿，
 * 所以改格子能立刻看到连线变色 —— 与旧版矩阵↔画布联动一致。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar } from '../avatar';
import type { PanelSummary, PolicyMatrix as Matrix } from '../data/types';
import { DAG_EDGES, DAG_NODES, PANEL, POLICY_SEED, ROSTER } from '../data/mock';
import { PolicyMatrix } from '../panel/PolicyMatrix';
import { DagFlow } from '../panel/DagFlow';
import {
  IconBranch,
  IconCheck,
  IconChevron,
  IconFile,
  IconShield,
  IconSparkle,
  IconUsers,
} from './icons';

type TabId = 'run' | 'team' | 'policy' | 'dag' | 'artifacts';

const TABS: { id: TabId; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'run', label: '执行', icon: IconSparkle },
  { id: 'team', label: '编队', icon: IconUsers },
  { id: 'policy', label: '策略举证', icon: IconShield },
  { id: 'dag', label: '工作流', icon: IconBranch },
  { id: 'artifacts', label: '产物', icon: IconFile },
];

const STEP_MS = ['32s', '18s', '1m36s', '41s', '—', '—'];

export function AgentPanel({
  panel = PANEL,
  onClose,
}: {
  panel?: PanelSummary;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<TabId>('run');
  const [policy, setPolicy] = useState<Matrix>(() => POLICY_SEED);
  const [saved, setSaved] = useState<Matrix>(() => POLICY_SEED);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const dirty = useMemo(
    () => JSON.stringify(policy) !== JSON.stringify(saved),
    [policy, saved],
  );

  const save = () => {
    setSaved(policy);
    setFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 1800);
  };

  const doneSteps = panel.steps.filter((s) => s.done).length;
  const pct = Math.round((doneSteps / panel.steps.length) * 100);
  const running = panel.steps.find((s) => !s.done);

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="panel-head-title">执行详情</span>
        <span className="panel-head-live">
          <i aria-hidden />
          {running ? '运行中' : '已完成'}
        </span>
        {onClose ? (
          <button className="sf-icon-btn" onClick={onClose} title="收起面板" aria-label="收起面板">
            ✕
          </button>
        ) : null}
      </div>

      <nav className="panel-tabbar" aria-label="面板分区">
        {TABS.map(({ id, label, icon: Icon }) => (
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
        ))}
      </nav>

      <div className="panel-scroll">
        {tab === 'run' ? (
          <>
            <div className="panel-run">
              <div className="panel-run-top">
                <span className="panel-run-bolt">
                  <IconSparkle size={11} />
                </span>
                <span className="panel-run-kicker">ACTIVE RUN</span>
                <span className="panel-run-pct">{pct}%</span>
              </div>
              <div className="panel-run-title">LLM Agent 角色分工综述</div>
              <div className="panel-run-meta">
                <span>耗时 12m 40s</span>
                <span>
                  {doneSteps} / {panel.steps.length} 步已交
                </span>
              </div>
              <div className="panel-run-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="panel-sec-head">
              <span>步骤 · {panel.steps.length}</span>
              <button className="panel-sec-link" onClick={() => setTab('dag')}>
                查看 DAG
              </button>
            </div>
            <ol className="panel-steps">
              {panel.steps.map((s, i) => (
                <li key={s.label} data-done={s.done ? 'true' : undefined}>
                  <span className="panel-step-n">{s.done ? '✓' : i + 1}</span>
                  <span className="panel-step-body">
                    <span className="panel-step-title">{s.label}</span>
                    <span className="panel-step-meta">
                      <AgentAvatar label={i % 2 ? '章节主笔' : 'PI'} size={13} status={false} />
                      {i % 2 ? '章节主笔' : 'PI'} · {STEP_MS[i] ?? '—'}
                    </span>
                  </span>
                  <span className="panel-step-state">{s.done ? '已完成' : i === doneSteps ? '进行中' : '等待'}</span>
                </li>
              ))}
            </ol>

            <div className="panel-sec">
              <div className="panel-sec-head">
                <span>用量</span>
                <span className="panel-sec-meta">本会话</span>
              </div>
              <div className="panel-usage-k">上下文 {panel.contextPct}%</div>
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

        {tab === 'team' ? (
          <>
            <div className="panel-sec-head">
              <span>成员 · {ROSTER.length}</span>
              <span className="panel-sec-meta">群会话派发范围</span>
            </div>
            <ul className="panel-roster">
              {ROSTER.map((m) => {
                const busy = m.id === 'cr';
                return (
                  <li key={m.id}>
                    <AgentAvatar label={m.role} size={30} status={false} />
                    <span className="panel-roster-body">
                      <span className="panel-roster-name">
                        {m.name}
                        {m.name !== m.role ? <i className="panel-roster-role">{m.role}</i> : null}
                      </span>
                      <span className="panel-roster-note">{m.note}</span>
                    </span>
                    <span className="panel-roster-state" data-busy={busy ? 'true' : undefined}>
                      {busy ? '执行中' : '待命'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {tab === 'policy' ? (
          <>
            <div className="panel-sec-head">
              <span>策略举证</span>
              {dirty ? (
                <button className="panel-sec-btn" onClick={save}>
                  保存策略
                </button>
              ) : flash ? (
                <span className="panel-pill-ok">已保存</span>
              ) : (
                <span className="panel-sec-meta">行→列</span>
              )}
            </div>
            <PolicyMatrix roster={ROSTER} value={policy} onChange={setPolicy} />
          </>
        ) : null}

        {tab === 'dag' ? (
          <>
            <div className="panel-sec-head">
              <span>工作流</span>
              <span className="panel-sec-meta">
                {DAG_NODES.length} 节点 · {DAG_EDGES.length} 边
              </span>
            </div>
            <DagFlow nodes={DAG_NODES} edges={DAG_EDGES} policy={policy} roster={ROSTER} />
            <div className="panel-approve">
              <span className="panel-approve-ico">
                <IconCheck size={13} />
              </span>
              <span className="panel-approve-body">
                <b>1 道审批门</b>
                <span>「合并成稿」前需要你确认，其余节点主控自闭环。</span>
              </span>
            </div>
          </>
        ) : null}

        {tab === 'artifacts' ? (
          <>
            <div className="panel-sec-head">
              <span>产物 · {panel.artifacts.length}</span>
              <span className="panel-sec-meta">本轮</span>
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

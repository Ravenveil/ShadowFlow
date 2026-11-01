/**
 * TeamPanel — NeoHost「编队」tab（agent 编队面板，阶段 2.4 切面）。
 *
 * 触发：NeoRail 团队态选中 team（target.kind === 'team'）时由 NeoHost 挂载。
 *
 * 数据源（全部真实端点，不 mock；缺失即空态）：
 *   - GET /api/teams/{id}          → TeamRecord（roster = agent_ids）
 *   - GET /api/teams/{id}/workflow → TeamWorkflow（DAG 摘要：节点 chips + 边列表）
 *   - GET /api/teams/{id}/policy   → TeamPolicyMatrix（permit/warn/deny 要点）
 *   - GET /api/agents              → 成员名/状态解析（roster 行）
 *   - useRunSession.perNodeChunks  → run 进行中的 per-node 输出归属
 *     （键 = SSE DAG 事件携带的 node_id；经 workflow 节点 data.name 解析显示名）
 *
 * per-node 输出只在 SSE 事件带 node_id（DAG 调度多 Agent run）时才有内容；
 * 单 Agent run 走全局流，此处显示干净空态说明，不伪造归属。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch,
  History,
  MessageSquareText,
  PenLine,
  Pencil,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react';
import {
  deleteTeam,
  getTeam,
  getTeamPolicy,
  getTeamWorkflow,
  patchTeam,
  type TeamPolicyMatrix,
  type TeamRecord,
  type TeamWorkflow,
} from '../../api/teams';
import { listAgents, type AgentRecord } from '../../api/agents';
import { listGroups, resolveTeamGroup } from '../../api/groupApi';
import { listRunSessions, type RunSessionSummary } from '../../api/runSessions';
import { getRunGraph, type RunGraph } from '../../api/runs';
import type { NodeChunkBuffer } from '../../core/hooks/useRunSession';
import { useI18n } from '../../common/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { TeamDagEditor } from './TeamDagEditor';
import { TeamDagCanvas } from './TeamDagCanvas';
import { ProcessDagCanvas } from './ProcessDagCanvas';

export interface TeamPanelProps {
  teamId: string;
  teamName: string;
  /** useRunSession 的 per-node chunk buffer（NeoHost 持有的 SSE 视图）。 */
  perNodeChunks: Record<string, NodeChunkBuffer>;
  /** SSE 仍在流。 */
  streaming: boolean;
}

const POLICY_CLASS: Record<string, string> = {
  permit: 'neo-host-pill--ok',
  warn: 'neo-host-pill--oscillating',
  deny: 'neo-host-pill--err',
};

const AGENT_STATUS_CLASS: Record<string, string> = {
  idle: 'neo-host-pill--muted',
  running: 'neo-host-pill--running',
  paused: 'neo-host-pill--oscillating',
  error: 'neo-host-pill--err',
};

// run-sessions 状态 → pill 配色（runBus 内存态全集 + 未知回落 muted）。
const RUN_STATUS_CLASS: Record<string, string> = {
  running: 'neo-host-pill--running',
  succeeded: 'neo-host-pill--ok',
  completed: 'neo-host-pill--ok',
  failed: 'neo-host-pill--err',
  canceled: 'neo-host-pill--oscillating',
  cancelled: 'neo-host-pill--oscillating',
  idle: 'neo-host-pill--muted',
};

export function TeamPanel({ teamId, teamName, perNodeChunks, streaming }: TeamPanelProps) {
  const { t } = useI18n();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [workflow, setWorkflow] = useState<TeamWorkflow | null>(null);
  const [policy, setPolicy] = useState<TeamPolicyMatrix | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 「编辑 DAG」开关：true 时整面板切到 TeamDagEditor（GAP B28）。
  const [editingDag, setEditingDag] = useState(false);
  // GAP D（2026-08-22）「发起群聊」CTA：find-or-create 绑 team_id 的群后跳
  // 群聊现场页（/group/:gid，NeoGroupChat 路由页），失败给明确提示不静默。
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  // 管理面闭环（2026-08-23）：头部团队重命名/删除。删除走 window.confirm 二次
  // 确认；失败进 manageError 红条（不吞错）；删除成功 → 回 Neo home 安全页。
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // ── 最近运行（2026-10-31）───────────────────────────────────────────────
  // team → group 换算（只读 find-only，走 listGroups 过滤 team_id；复用
  // resolveTeamGroup 会触发建群副作用，只读列出场景不合适）→
  // listRunSessions(gid) 取该团队干活现场的 run 列表 → 选中一条就地渲染
  // ProcessDagCanvas 执行态画布（节点染色 + 迭代环徽标）。
  const [recentRuns, setRecentRuns] = useState<RunSessionSummary[]>([]);
  const [runsState, setRunsState] = useState<'loading' | 'ready' | 'empty' | 'failed'>('loading');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runGraph, setRunGraph] = useState<RunGraph | null>(null);
  const [runGraphFailed, setRunGraphFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecentRuns([]);
    setRunsState('loading');
    setSelectedRunId(null);
    setRunGraph(null);
    setRunGraphFailed(false);
    (async () => {
      try {
        // find-only：已有群直接用；没有 → 该团队从没开过群，自然也没有 run。
        const groups = await listGroups(workspaceId ?? null, 'group');
        if (cancelled) return;
        const gid = groups.find((g) => g.team_id === teamId)?.group_id ?? null;
        if (!gid) {
          setRunsState('empty');
          return;
        }
        const sessions = await listRunSessions(gid, 'group');
        if (cancelled) return;
        setRecentRuns(sessions);
        setRunsState(sessions.length > 0 ? 'ready' : 'empty');
      } catch {
        if (!cancelled) setRunsState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceId]);

  // 选中某次运行 → 拉执行图（daemon run 本地折叠 / Python run 走 proxy）。
  const handleSelectRun = async (runId: string) => {
    if (runId === selectedRunId) return;
    setSelectedRunId(runId);
    setRunGraph(null);
    setRunGraphFailed(false);
    try {
      const graph = await getRunGraph(runId);
      setRunGraph(graph);
    } catch {
      setRunGraphFailed(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFailed(false);
    setEditingDag(false);
    // 四个数据源独立结算：任何一个失败不拖垮其余 section。
    Promise.all([
      getTeam(teamId).then(
        (r) => ({ r }),
        () => ({ r: null }),
      ),
      getTeamWorkflow(teamId).then(
        (w) => ({ w }),
        () => ({ w: null }),
      ),
      getTeamPolicy(teamId).then(
        (p) => ({ p }),
        () => ({ p: null }),
      ),
      listAgents().then(
        (a) => ({ a }),
        () => ({ a: [] as AgentRecord[] }),
      ),
    ]).then(([teamR, wf, pol, ag]) => {
      if (cancelled) return;
      setTeam(teamR.r);
      setWorkflow(wf.w);
      setPolicy(pol.p);
      setAgents(ag.a);
      setFailed(teamR.r === null && wf.w === null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [teamId]);

  const agentById = new Map(agents.map((a) => [a.agent_id, a]));
  const wfNodeNameById = new Map(
    (workflow?.nodes ?? []).map((n) => [n.id, n.data?.name || n.data?.agentId || n.id]),
  );

  // policy 要点：只列非 permit 单元 + 三态计数（矩阵为空 = 未配置）。
  const policyCells: Array<{ from: string; to: string; state: string }> = [];
  const policyCount: Record<string, number> = { permit: 0, warn: 0, deny: 0 };
  if (policy) {
    for (const [from, row] of Object.entries(policy)) {
      for (const [to, state] of Object.entries(row ?? {})) {
        policyCount[state] = (policyCount[state] ?? 0) + 1;
        if (state !== 'permit') policyCells.push({ from, to, state });
      }
    }
  }
  const policyTotal = policyCount.permit + policyCount.warn + policyCount.deny;

  // per-node 输出：只看有实际内容的 buffer。
  const nodeOutputs = Object.entries(perNodeChunks).filter(
    ([, buf]) => buf.text.trim() || buf.thinking.length > 0 || buf.steps.length > 0,
  );

  // 发起群聊：已有群直接跳，没有则以该 team（绑 team_id + roster）建群再跳；
  // 建群失败 / 后端不可用（resolveTeamGroup 回 null）→ 面板内错误行提示。
  const handleLaunchChat = async () => {
    if (launchBusy) return;
    setLaunchBusy(true);
    setLaunchError(null);
    const gid = await resolveTeamGroup(
      { team_id: teamId, name: teamName, agent_ids: team?.agent_ids ?? [] },
      workspaceId ?? undefined,
    );
    if (gid) {
      // 刷新 inbox，左栏「群聊现场」列表即时出新群（Python 未起时静默）
      void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
      navigate(`/group/${encodeURIComponent(gid)}`);
    } else {
      setLaunchError(
        t('neo.host.teamChatError', { defaultValue: '建群失败：后端不可用或群创建被拒绝' }),
      );
      setLaunchBusy(false);
    }
  };

  // 团队重命名：prompt 输入新名 → patchTeam 真实更新；成功同步本地 team record
  // （roster 头部显示名即时反映，不依赖外层 reload）。
  const handleRenameTeam = async () => {
    if (manageBusy) return;
    const current = team?.name ?? teamName;
    const name = window
      .prompt(t('neo.host.teamRenamePrompt', { defaultValue: '团队新名称' }), current)
      ?.trim();
    if (!name || name === current) return;
    setManageBusy(true);
    setManageError(null);
    try {
      const updated = await patchTeam(teamId, { name });
      setTeam(updated);
    } catch {
      setManageError(t('neo.host.teamManageError', { defaultValue: '操作失败，请重试' }));
    } finally {
      setManageBusy(false);
    }
  };

  // 团队删除：二次确认 → deleteTeam；成功回 Neo home，失败红条并恢复可操作。
  const handleDeleteTeam = async () => {
    if (manageBusy) return;
    if (
      !window.confirm(
        t('neo.host.teamDeleteConfirm', {
          defaultValue: `确定删除团队「${team?.name ?? teamName}」？此操作不可撤销`,
        }),
      )
    )
      return;
    setManageBusy(true);
    setManageError(null);
    try {
      await deleteTeam(teamId);
      navigate('/');
    } catch {
      setManageError(t('neo.host.teamManageError', { defaultValue: '操作失败，请重试' }));
      setManageBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-empty neo-host-empty--fill neo-host-empty--err">
          {t('neo.host.teamError', { defaultValue: '编队数据加载失败' })}
        </div>
      </div>
    );
  }

  const roster = team?.agent_ids ?? [];
  const wfNodes = workflow?.nodes ?? [];
  const wfEdges = workflow?.edges ?? [];

  // 编辑态：整面板换成 DAG 编辑器（只读摘要/策略/输出保存后回来）。
  if (editingDag) {
    const rosterAgents = roster
      .map((id) => agentById.get(id))
      .filter((a): a is AgentRecord => Boolean(a));
    return (
      <div className="neo-host-list neo-host-list--editing">
        <TeamDagEditor
          teamId={teamId}
          workflow={workflow ?? { nodes: [], edges: [] }}
          agents={rosterAgents}
          onSaved={(wf) => {
            setWorkflow(wf);
            setEditingDag(false);
          }}
          onCancel={() => setEditingDag(false)}
        />
      </div>
    );
  }

  return (
    <div className="neo-host-list">
      {/* 成员 roster（头部带「发起群聊」CTA — GAP D，与「编辑 DAG」并存；
          2026-08-23 管理面闭环：头部追加团队重命名/删除钮） */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <UsersRound size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.host.teamRoster', { defaultValue: '成员' })}
          </span>
          <span className="neo-host-sec-meta">{team?.name ?? teamName}</span>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => void handleRenameTeam()}
            disabled={manageBusy}
            title={t('neo.manage.rename', { defaultValue: '重命名' })}
            data-testid="team-rename-btn"
          >
            <Pencil size={11} strokeWidth={1.8} />
            {t('neo.manage.rename', { defaultValue: '重命名' })}
          </button>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => void handleDeleteTeam()}
            disabled={manageBusy}
            title={t('common.delete', { defaultValue: '删除' })}
            data-testid="team-delete-btn"
          >
            <Trash2 size={11} strokeWidth={1.8} />
            {t('common.delete', { defaultValue: '删除' })}
          </button>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => void handleLaunchChat()}
            disabled={launchBusy}
            data-testid="team-chat-launch"
          >
            <MessageSquareText size={11} strokeWidth={1.8} />
            {launchBusy
              ? t('neo.host.teamChatLaunching', { defaultValue: '建群中…' })
              : t('neo.host.teamChatLaunch', { defaultValue: '发起群聊' })}
          </button>
        </div>
        {manageError && (
          <div
            className="neo-host-tree-note neo-host-tree-note--pad neo-host-empty--err"
            role="alert"
            data-testid="team-manage-error"
          >
            {manageError}
          </div>
        )}
        {launchError && (
          <div className="neo-host-tree-note neo-host-tree-note--pad neo-host-empty--err" role="alert">
            {launchError}
          </div>
        )}
        {roster.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamRosterEmpty', { defaultValue: '该团队暂无成员' })}
          </div>
        ) : (
          roster.map((id) => {
            const agent = agentById.get(id);
            return (
              <div key={id} className="neo-host-roster-row">
                <span className="neo-host-roster-name">{agent?.name ?? id}</span>
                {agent && (
                  <span className={`neo-host-pill ${AGENT_STATUS_CLASS[agent.status] ?? 'neo-host-pill--muted'}`}>
                    {agent.status}
                  </span>
                )}
                <span className="neo-host-roster-id" title={id}>
                  {id}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* workflow DAG 摘要 — 2026-10-31 起 chips → 图形画布（TeamDagCanvas），
          编辑入口不变（TeamDagEditor），编队 tab 内即可看图 + 编辑 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <GitBranch size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.host.teamWorkflow', { defaultValue: '工作流' })}
          </span>
          <span className="neo-host-sec-meta">
            {t('neo.host.procGraphMeta', {
              defaultValue: '{{nodes}} 节点 · {{edges}} 边',
              nodes: wfNodes.length,
              edges: wfEdges.length,
            })}
          </span>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => setEditingDag(true)}
            data-testid="team-dag-edit-entry"
          >
            <PenLine size={11} strokeWidth={1.8} />
            {t('neo.host.teamDagEdit', { defaultValue: '编辑 DAG' })}
          </button>
        </div>
        {wfNodes.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamWorkflowEmpty', { defaultValue: '该团队尚未编排工作流' })}
          </div>
        ) : (
          <TeamDagCanvas workflow={workflow as TeamWorkflow} />
        )}
      </div>

      {/* 最近运行 — 该团队干活现场（绑 team 的群）关联 run 列表；选中就地渲染
          执行态 DAG（ProcessDagCanvas：节点状态染色 + 迭代环徽标）。历史 run
          走 REST 快照（不订阅 SSE）；当前 run 实时输出仍看「分节点输出」。 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <History size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.host.teamRecentRuns', { defaultValue: '最近运行' })}
          </span>
          {runsState === 'ready' && (
            <span className="neo-host-sec-meta">
              {t('neo.host.teamRecentRunsMeta', {
                defaultValue: '{{count}} 次',
                count: recentRuns.length,
              })}
            </span>
          )}
        </div>
        {runsState === 'loading' ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.loading', { defaultValue: '读取中…' })}
          </div>
        ) : runsState === 'empty' ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamRecentRunsEmpty', {
              defaultValue: '暂无运行记录（发起群聊并派发任务后出现）',
            })}
          </div>
        ) : runsState === 'failed' ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamRecentRunsFailed', { defaultValue: '运行记录加载失败' })}
          </div>
        ) : (
          <>
            <div className="neo-host-run-list">
              {recentRuns.slice(0, 8).map((run) => (
                <button
                  key={run.session_id}
                  type="button"
                  className={`neo-host-run-row${run.session_id === selectedRunId ? ' neo-host-run-row--sel' : ''}`}
                  onClick={() => void handleSelectRun(run.session_id)}
                  data-testid={`team-run-row-${run.session_id}`}
                >
                  <span className="neo-host-run-goal" title={run.goal}>
                    {run.goal || run.session_id}
                  </span>
                  <span className={`neo-host-pill ${RUN_STATUS_CLASS[run.status] ?? 'neo-host-pill--muted'}`}>
                    {run.status}
                  </span>
                </button>
              ))}
            </div>
            {selectedRunId && (
              <div className="neo-host-pdag-wrap neo-host-team-runcanvas" data-testid="team-run-canvas">
                {runGraphFailed ? (
                  <div className="neo-host-tree-note neo-host-tree-note--pad">
                    {t('neo.host.teamRunGraphFailed', { defaultValue: '执行图加载失败（该运行可能无图数据）' })}
                  </div>
                ) : runGraph ? (
                  <ProcessDagCanvas graph={runGraph} streaming={false} />
                ) : (
                  <div className="neo-host-tree-note neo-host-tree-note--pad">
                    {t('neo.host.teamRunGraphLoading', { defaultValue: '执行图读取中…' })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* policy 要点 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <ShieldCheck size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.host.teamPolicy', { defaultValue: '协作策略' })}
          </span>
          {policyTotal > 0 && (
            <span className="neo-host-sec-meta">
              {t('neo.host.teamPolicyMeta', {
                defaultValue: '允许 {{permit}} · 警告 {{warn}} · 拒绝 {{deny}}',
                permit: policyCount.permit,
                warn: policyCount.warn,
                deny: policyCount.deny,
              })}
            </span>
          )}
        </div>
        {policyTotal === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamPolicyEmpty', { defaultValue: '未配置策略（默认全允许）' })}
          </div>
        ) : policyCells.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamPolicyAllPermit', { defaultValue: '全部允许，无限制项' })}
          </div>
        ) : (
          policyCells.map((c) => (
            <div key={`${c.from}->${c.to}`} className="neo-host-policy-row">
              <span className="neo-host-policy-pair">
                {agentById.get(c.from)?.name ?? c.from}
                <span className="neo-host-edge-arrow">→</span>
                {agentById.get(c.to)?.name ?? c.to}
              </span>
              <span className={`neo-host-pill ${POLICY_CLASS[c.state] ?? 'neo-host-pill--muted'}`}>
                {c.state}
              </span>
            </div>
          ))
        )}
      </div>

      {/* run 进行中：per-node 输出归属 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <UsersRound size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.host.teamNodeOutput', { defaultValue: '分节点输出' })}
          </span>
          {streaming && (
            <span className="neo-host-pill neo-host-pill--running">live</span>
          )}
        </div>
        {nodeOutputs.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.teamNodeOutputEmpty', {
              defaultValue: '暂无分节点输出（仅 DAG 多 Agent 运行按节点归属；单 Agent 走全局流）',
            })}
          </div>
        ) : (
          nodeOutputs.map(([nodeId, buf]) => (
            <div key={nodeId} className="neo-host-nodeout">
              <div className="neo-host-nodeout-head">
                <span className="neo-host-roster-name">
                  {wfNodeNameById.get(nodeId) ?? nodeId}
                </span>
                <span className="neo-host-roster-id" title={nodeId}>
                  {nodeId}
                </span>
              </div>
              {buf.text.trim() && (
                <div className="neo-host-nodeout-text">
                  {buf.text.length > 400 ? `…${buf.text.slice(-400)}` : buf.text}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TeamPanel;

/**
 * GroupMembersPanel — NeoHost「成员」tab（W2 钉钉式融合，2026-08-22；
 * 2026-08-23 改版：成员区改钉钉式横向头像网格，工作流区换只读 DAG 画布）。
 *
 * 触发：NeoApp 中栏开着非 DM 的会话（团队群）时由 NeoHost 挂载，
 * 标题同步变「团队的主机」。DM 单聊不挂本面板（灵魂 tab 承担员工信息）。
 *
 * 数据源（全部真实端点，不 mock；缺失即干净空态，与 TeamPanel 同源）：
 *   - GET /api/groups/{id}          → GroupRecord（agent_ids / team_id）
 *   - GET /api/agents               → 成员名/头像色/状态点/角色（并入 title）解析
 *   - GET /api/teams/{tid}/workflow → TeamWorkflow（TeamDagCanvas 只读画布 +
 *     画布下方 <details> 折叠边明细）
 * 审批门（L6，2026-08-23 升级为真实审批队列）：
 *   - GET  /api/groups/{id}/approvals/pending → pending 列表（发起人/摘要/等待时长）
 *   - POST /api/approvals/{aid}/approve|reject → 批准/驳回（驳回行内填可选 reason），
 *     操作后刷新；resolved 带 reason 的驳回项在队列下方留痕展示
 *   - GET  /api/approvals/events（SSE approval.pending/resolved，resolved 带 decision/reason）
 *     实时刷新；无 EventSource 环境回落 5s 轮询。无 pending → 空态，不伪造数据。
 * 简报折叠区：GET /api/groups/{id}/briefboard（按天聚合 agent 产出），无数据空态。
 *
 * 样式：neo-host.css 的 .neo-gm-* 区块（--t-* token，day/night 安全）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, GitBranch, Newspaper, ShieldCheck, UsersRound, X } from 'lucide-react';
import { fetchBriefBoard, getGroup, type BriefBoardData } from '../../api/groupApi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { getTeamWorkflow, type TeamWorkflow } from '../../api/teams';
import {
  approveApproval,
  listPendingApprovals,
  rejectApproval,
  subscribeApprovalEvents,
  type PendingApprovalItem,
} from '../../api/approvals';
import { useI18n } from '../../common/i18n';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import TeamDagCanvas from './TeamDagCanvas';

/* 头像：与 NeoRail neoAvatarColor / NeoGroupChat gcAvatarColor 同算法同色环 */
const GM_AVATAR_COLORS = ['#F59E0B', '#A855F7', '#EF4444', '#0891B2', '#22D3EE', '#10B981', '#71717A'];

function gmAvatarColor(seed: string): string {
  let h = 0;
  const key = seed || '?';
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return GM_AVATAR_COLORS[Math.abs(h) % GM_AVATAR_COLORS.length];
}

function gmAvatarInitial(name: string): string {
  const first = Array.from((name ?? '').trim())[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

export interface GroupMembersPanelProps {
  groupId: string;
  /**
   * 2026-11-04：隐藏内嵌审批门。NeoHost 编队 pane 已把审批提升为一级
   * 「封驳矩阵」section（ApprovalMatrix），这里再渲染一份会重复且造成两条
   * SSE 订阅。缺省 false —— 独立挂载 / 既有测试仍走原来的完整形态。
   */
  hideApprovals?: boolean;
}

/** 等待时长紧凑格式（审批队列行 meta 用）。 */
function gmWaitingText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}

export function GroupMembersPanel({ groupId, hideApprovals = false }: GroupMembersPanelProps) {
  const { t } = useI18n();
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [workflow, setWorkflow] = useState<TeamWorkflow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingApprovalItem[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalFailed, setApprovalFailed] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejected, setRejected] = useState<
    Array<{ approval_id: string; label: string; reason: string }>
  >([]);
  const [brief, setBrief] = useState<BriefBoardData | null>(null);

  // 群记录 + agents 独立结算：任一失败不拖垮其余 section。
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setWorkflow(null);
    setTeamId(null);
    Promise.all([
      getGroup(groupId).then(
        (g) => ({ g }),
        () => ({ g: null }),
      ),
      listAgents().then(
        (a) => ({ a }),
        () => ({ a: [] as AgentRecord[] }),
      ),
    ]).then(([gr, ag]) => {
      if (!alive) return;
      setAgentIds(gr.g?.agent_ids ?? []);
      setTeamId(gr.g?.team_id ?? null);
      setAgents(ag.a);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [groupId]);

  // 团队 DAG 摘要（群绑 team 时拉取；只读）
  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    getTeamWorkflow(teamId)
      .then((wf) => {
        if (alive) setWorkflow(wf);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [teamId]);

  // L6 审批队列：拉 pending 列表（失败吞掉 → 空态，不伪造数据）
  const refreshApprovals = useCallback(() => {
    listPendingApprovals(groupId)
      .then((items) => setPending(items))
      .catch(() => {});
  }, [groupId]);

  // 已驳回留痕：SSE resolved 或本地驳回成功时记录；按 approval_id 去重，最多留 5 条
  const noteRejected = useCallback(
    (entry: { approval_id: string; label: string; reason: string }) => {
      setRejected((prev) =>
        [entry, ...prev.filter((x) => x.approval_id !== entry.approval_id)].slice(0, 5),
      );
    },
    [],
  );

  // 首拉 + SSE 实时刷新；无 EventSource 环境（jsdom 等）回落 5s 轮询
  useEffect(() => {
    // 编队 pane 已挂独立封驳矩阵：这里不拉队列、不订阅 SSE（避免双订阅）
    if (hideApprovals) return;
    setPending([]);
    setRejected([]);
    setApprovalFailed(false);
    setRejectingId(null);
    setRejectReason('');
    refreshApprovals();
    const hasSse = typeof EventSource !== 'undefined';
    const unsubscribe = subscribeApprovalEvents((evt) => {
      // pending/resolved 都重拉；group_id 缺失时保守刷新
      if (!evt.group_id || evt.group_id === groupId) refreshApprovals();
      // resolved 带 decision/reason → 已驳回项留痕展示（无 reason 不记）
      if (
        evt.type === 'approval.resolved' &&
        evt.decision === 'reject' &&
        evt.approval_id &&
        evt.reason
      ) {
        noteRejected({
          approval_id: evt.approval_id,
          label: evt.gate_id ?? '',
          reason: evt.reason,
        });
      }
    });
    const timer = hasSse ? null : window.setInterval(refreshApprovals, 5000);
    return () => {
      unsubscribe();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [groupId, hideApprovals, refreshApprovals, noteRejected]);

  // 批准 / 驳回：真实调端点（驳回带可选 reason），结束后刷新队列；失败给行内提示
  const decideApproval = useCallback(
    async (item: PendingApprovalItem, decision: 'approve' | 'reject', reason = '') => {
      setApprovalBusy(item.approval_id);
      setApprovalFailed(false);
      try {
        if (decision === 'approve') await approveApproval(item.approval_id);
        else await rejectApproval(item.approval_id, reason);
        // 轮询回落环境收不到 SSE resolved，本地驳回成功也留痕一条
        if (decision === 'reject' && reason) {
          noteRejected({
            approval_id: item.approval_id,
            label: item.submitter_name || item.gate_id,
            reason,
          });
        }
      } catch {
        setApprovalFailed(true);
      } finally {
        setApprovalBusy(null);
        setRejectingId(null);
        setRejectReason('');
        refreshApprovals();
      }
    },
    [noteRejected, refreshApprovals],
  );

  // 群简报（按天聚合 agent 产出；空 → 空态）
  useEffect(() => {
    let alive = true;
    setBrief(null);
    const today = new Date().toISOString().slice(0, 10);
    fetchBriefBoard(groupId, today)
      .then((b) => {
        if (alive) setBrief(b);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.agent_id, a])), [agents]);
  const wfNodes = workflow?.nodes ?? [];
  const wfEdges = workflow?.edges ?? [];
  const wfNodeNameById = useMemo(
    () => new Map(wfNodes.map((n) => [n.id, n.data?.name || n.data?.agentId || n.id])),
    [wfNodes],
  );
  const briefEntries = brief?.entries ?? [];

  if (!loaded) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      </div>
    );
  }

  return (
    <div className="neo-host-list">
      {/* 成员：钉钉式横向头像网格（头像+状态点+下方小字名；角色并入 title） */}
      <div className="neo-host-sec" data-testid="neo-gm-members">
        <div className="neo-host-sec-head">
          <UsersRound size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.group.sideMembers', { defaultValue: '成员' })}
          </span>
          {agentIds.length > 0 && <span className="neo-host-sec-meta">{agentIds.length}</span>}
        </div>
        {agentIds.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.group.sideMembersEmpty', { defaultValue: '暂无成员信息' })}
          </div>
        ) : (
          <div className="neo-gm-grid">
            {agentIds.map((id) => {
              const a = agentById.get(id);
              const role = typeof a?.blueprint?.role === 'string' ? a.blueprint.role.trim() : '';
              const name = a?.name ?? id;
              return (
                <div
                  key={id}
                  className="neo-gm-cell"
                  title={role ? `${name} · ${role}` : name}
                >
                  {/* 头像统一（2026-11-04 用户反馈）：与侧栏/对话气泡同源
                      AgentAvatar（DiceBear / avatar_image）；查不到记录的 id
                      保留字符色块兜底。状态点绝对定位挂在头像右下。 */}
                  {a ? (
                    <span className="neo-gm-avatar neo-gm-avatar--img">
                      <AgentAvatar
                        name={a.name}
                        style={a.avatar_style}
                        seed={a.avatar_seed ?? a.name}
                        image={a.avatar_image ?? null}
                        size={34}
                      />
                      <i className={`neo-gm-dot neo-gm-dot--${a.status}`} aria-hidden />
                    </span>
                  ) : (
                    <span
                      className="neo-gm-avatar"
                      style={{ background: gmAvatarColor(id) }}
                      aria-hidden
                    >
                      {gmAvatarInitial(name)}
                    </span>
                  )}
                  <span className="neo-gm-cell-name">{name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 团队 DAG（群绑 team 时；未绑定/未编排 → 空态）：只读画布 + 折叠边明细 */}
      <div className="neo-host-sec" data-testid="neo-gm-dag">
        <div className="neo-host-sec-head">
          <GitBranch size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.group.sideWorkflow', { defaultValue: '工作流' })}
          </span>
          {wfNodes.length > 0 && (
            <span className="neo-host-sec-meta">
              {t('neo.host.procGraphMeta', {
                defaultValue: '{{nodes}} 节点 · {{edges}} 边',
                nodes: wfNodes.length,
                edges: wfEdges.length,
              })}
            </span>
          )}
        </div>
        {wfNodes.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.group.sideWorkflowEmpty', { defaultValue: '该群未绑定团队工作流' })}
          </div>
        ) : (
          <>
            <TeamDagCanvas workflow={workflow as TeamWorkflow} />
            {wfEdges.length > 0 && (
              <details className="neo-gm-dag-details">
                <summary className="neo-gm-dag-details-head">
                  {t('neo.group.workflowEdgeDetails', { defaultValue: '边明细' })}
                </summary>
                <div className="neo-gm-edges">
                  {wfEdges.map((e) => (
                    <span key={e.id} className="neo-gm-edge">
                      {wfNodeNameById.get(e.source) ?? e.source}
                      <span className="neo-gm-edge-arrow">→</span>
                      {wfNodeNameById.get(e.target) ?? e.target}
                      {e.data?.mode && <span className="neo-gm-edge-mode">{e.data.mode}</span>}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* 审批队列（L6）：真实 pending 列表 + 批准/驳回；无 → 空态（不 mock）。
          2026-11-04：编队 pane 已挂独立封驳矩阵，hideApprovals 时整节不渲染
          （独立挂载 / 既有测试仍传 false，保留原完整形态）。 */}
      {!hideApprovals && (
      <div className="neo-host-sec" data-testid="neo-gm-approval">
        <div className="neo-host-sec-head">
          <ShieldCheck size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.group.sideApproval', { defaultValue: '审批门' })}
          </span>
          {pending.length > 0 && <span className="neo-host-sec-meta">{pending.length}</span>}
        </div>
        {pending.length === 0 && rejected.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.group.approvalEmpty', { defaultValue: '暂无待审批事项' })}
          </div>
        ) : (
          <>
            {pending.map((item) => (
              <div className="neo-gm-approval-item" key={item.approval_id}>
                <div className="neo-gm-approval-item-head">
                  <span className="neo-gm-approval-submitter">
                    {item.submitter_name || item.gate_id}
                  </span>
                  <span className="neo-gm-approval-waiting">
                    {t('neo.group.approvalWaiting', {
                      defaultValue: '已等待 {{text}}',
                      text: gmWaitingText(item.waiting_seconds),
                    })}
                  </span>
                </div>
                {item.summary && (
                  <div className="neo-gm-approval-summary" title={item.summary}>
                    {item.summary}
                  </div>
                )}
                <div className="neo-gm-approval-actions">
                  <button
                    type="button"
                    className="neo-gm-btn neo-gm-btn--approve"
                    disabled={approvalBusy !== null}
                    onClick={() => void decideApproval(item, 'approve')}
                  >
                    <Check size={11} strokeWidth={2} />
                    {t('neo.group.approvalApprove', { defaultValue: '批准' })}
                  </button>
                  <button
                    type="button"
                    className="neo-gm-btn neo-gm-btn--reject"
                    disabled={approvalBusy !== null}
                    onClick={() => {
                      setRejectingId(item.approval_id);
                      setRejectReason('');
                    }}
                  >
                    <X size={11} strokeWidth={2} />
                    {t('neo.group.approvalReject', { defaultValue: '驳回' })}
                  </button>
                </div>
                {rejectingId === item.approval_id && (
                  <div className="neo-gm-approval-rejectbox">
                    <input
                      className="neo-gm-approval-rejectbox-input"
                      value={rejectReason}
                      placeholder={t('neo.group.approvalRejectReasonPlaceholder', {
                        defaultValue: '驳回理由（可选）',
                      })}
                      disabled={approvalBusy !== null}
                      onChange={(e) => setRejectReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void decideApproval(item, 'reject', rejectReason.trim());
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="neo-gm-btn neo-gm-btn--reject"
                      disabled={approvalBusy !== null}
                      onClick={() => void decideApproval(item, 'reject', rejectReason.trim())}
                    >
                      {t('neo.group.approvalConfirm', { defaultValue: '确认' })}
                    </button>
                    <button
                      type="button"
                      className="neo-gm-btn"
                      disabled={approvalBusy !== null}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                    >
                      {t('neo.group.approvalCancel', { defaultValue: '取消' })}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {rejected.map((r) => (
              <div className="neo-gm-approval-rejected" key={r.approval_id}>
                <div className="neo-gm-approval-rejected-head">
                  <span className="neo-gm-approval-rejected-name">{r.label}</span>
                  <span className="neo-gm-approval-rejected-tag">
                    {t('neo.group.approvalRejectedTag', { defaultValue: '已驳回' })}
                  </span>
                </div>
                <div className="neo-gm-approval-rejected-reason" title={r.reason}>
                  {r.reason}
                </div>
              </div>
            ))}
            {approvalFailed && (
              <div className="neo-host-tree-note neo-host-tree-note--pad">
                {t('neo.group.approvalFailed', { defaultValue: '操作失败，请重试' })}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* 群简报折叠区：按天聚合的 agent 产出；空 → 空态 */}
      <details className="neo-host-sec neo-gm-brief" data-testid="neo-gm-brief">
        <summary className="neo-host-sec-head neo-gm-brief-head">
          <Newspaper size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t('neo.group.sideBrief', { defaultValue: '简报' })}
          </span>
          {briefEntries.length > 0 && (
            <span className="neo-host-sec-meta">{briefEntries.length}</span>
          )}
        </summary>
        {briefEntries.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.group.briefEmpty', { defaultValue: '今日暂无产出' })}
          </div>
        ) : (
          briefEntries.map((e, i) => (
            <div className="neo-gm-brief-entry" key={`${e.timestamp}-${i}`}>
              <div className="neo-gm-brief-meta">
                <span className="neo-gm-brief-agent">{e.agent_name}</span>
                <span className="neo-gm-brief-time">
                  {e.timestamp.length >= 16 ? e.timestamp.slice(11, 16) : e.timestamp}
                </span>
              </div>
              {e.summary && <div className="neo-gm-brief-text">{e.summary}</div>}
            </div>
          ))
        )}
      </details>
    </div>
  );
}

export default GroupMembersPanel;

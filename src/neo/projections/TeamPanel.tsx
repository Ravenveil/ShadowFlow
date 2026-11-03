/**
 * TeamPanel — NeoHost「编队」tab（agent 编队面板，阶段 2.4 切面）。
 *
 * 触发：NeoRail 团队态选中 team（target.kind === "team"）时由 NeoHost 挂载。
 *
 * 数据源（全部真实端点，不 mock；缺失即空态）：
 *   - GET /api/teams/{id}          → TeamRecord（roster = agent_ids）
 *   - GET /api/teams/{id}/workflow → TeamWorkflow（DAG，section 内联编辑）
 *   - GET /api/teams/{id}/policy   → TeamPolicyMatrix（permit/warn/deny 矩阵）
 *   - GET /api/agents              → 成员名/状态解析（roster 行 + 矩阵行头）
 *   - useRunSession.perNodeChunks  → run 进行中的 per-node 输出归属
 *     （键 = SSE DAG 事件携带的 node_id；经 workflow 节点 data.name 解析显示名）
 *
 * 2026-11-03 用户反馈批（矩阵联动 + 就地编辑）：
 *   - 「编辑 DAG」不再切走整面板：TeamDagEditor 直接在「工作流」section
 *     内联展开，拖拽/连线/边模式编辑就地完成，保存/取消后收起画布。
 *   - 「协作策略」改为 roster × roster 策略矩阵：格子点击循环 permit →
 *     warn → deny → 清除（未配置），有改动才出现「保存策略」钮；未展开时
 *     按成员显示策略染色 chips 摘要。
 *   - 策略 → 画布联动：agentPolicyColor（成员最严策略态 deny > warn）经
 *     policyColorOf 传给 TeamDagCanvas / TeamDagEditor，节点描边随策略
 *     实时变化 —— 矩阵一点，画布立变。
 *   - 「最近运行」section 移除（用户判定冗余，run 现场看群聊页）。
 *
 * per-node 输出只在 SSE 事件带 node_id（DAG 调度多 Agent run）时才有内容；
 * 单 Agent run 走全局流，此处显示干净空态说明，不伪造归属。
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  GitBranch,
  MessageSquareText,
  Pencil,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import {
  deleteTeam,
  getTeam,
  getTeamPolicy,
  getTeamWorkflow,
  patchTeam,
  putTeamPolicy,
  type PolicyCellState,
  type TeamPolicyMatrix,
  type TeamRecord,
  type TeamWorkflow,
} from "../../api/teams";
import { listAgents, type AgentRecord } from "../../api/agents";
import { resolveTeamGroup } from "../../api/groupApi";
import type { NodeChunkBuffer } from "../../core/hooks/useRunSession";
import { useI18n } from "../../common/i18n";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useInboxStore } from "../../core/store/useInboxStore";
import { TeamDagEditor } from "./TeamDagEditor";

export interface TeamPanelProps {
  teamId: string;
  teamName: string;
  /** useRunSession 的 per-node chunk buffer（NeoHost 持有的 SSE 视图）。 */
  perNodeChunks: Record<string, NodeChunkBuffer>;
  /** SSE 仍在流。 */
  streaming: boolean;
}

const AGENT_STATUS_CLASS: Record<string, string> = {
  idle: "neo-host-pill--muted",
  running: "neo-host-pill--running",
  paused: "neo-host-pill--oscillating",
  error: "neo-host-pill--err",
};

/** 策略格循环次序：未配置 → permit → warn → deny → 清除（回默认允许）。 */
const POLICY_CYCLE: PolicyCellState[] = ["permit", "warn", "deny"];

/** 策略态 → 染色（矩阵格 / 节点描边 / chips 共用）。 */
const POLICY_COLOR: Record<PolicyCellState, string> = {
  permit: "var(--t-ok, #16A34A)",
  warn: "var(--t-warn, #D97706)",
  deny: "var(--t-err, #DC2626)",
};
const POLICY_RANK: Record<PolicyCellState, number> = { deny: 3, warn: 2, permit: 1 };

/** agentId → 最严策略态（deny > warn > permit；自环忽略），画布染色源。 */
export function buildAgentPolicyColor(
  matrix: TeamPolicyMatrix | null,
): Map<string, PolicyCellState> {
  const map = new Map<string, PolicyCellState>();
  if (!matrix) return map;
  for (const [from, row] of Object.entries(matrix)) {
    for (const [to, state] of Object.entries(row ?? {})) {
      if (from === to) continue;
      const s = state as PolicyCellState;
      if (!(s in POLICY_RANK)) continue;
      const prevFrom = map.get(from);
      if (!prevFrom || POLICY_RANK[s] > POLICY_RANK[prevFrom]) map.set(from, s);
      const prevTo = map.get(to);
      if (!prevTo || POLICY_RANK[s] > POLICY_RANK[prevTo]) map.set(to, s);
    }
  }
  return map;
}

export function TeamPanel({ teamId, teamName, perNodeChunks, streaming }: TeamPanelProps) {
  const { t } = useI18n();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [workflow, setWorkflow] = useState<TeamWorkflow | null>(null);
  const [policy, setPolicy] = useState<TeamPolicyMatrix | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 2026-11-04 编辑器常驻：不再有 editingDag 开关。dagDirty 由编辑器经
  // onDirtyChange 上报，驱动头部「● 未保存」徽标；workflowStateKey 递增
  // 强制重挂编辑器（取消 = 丢弃本地画布改动回滚服务端图）。
  const [dagDirty, setDagDirty] = useState(false);
  const [workflowStateKey, setWorkflowStateKey] = useState(0);
  // GAP D（2026-08-22）「发起群聊」CTA：find-or-create 绑 team_id 的群后跳
  // 群聊现场页（/group/:gid，NeoGroupChat 路由页），失败给明确提示不静默。
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  // 管理面闭环（2026-08-23）：头部团队重命名/删除。
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFailed(false);
    setDagDirty(false);
    setWorkflowStateKey((k) => k + 1);
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
  const roster = team?.agent_ids ?? [];
  const wfNodes = workflow?.nodes ?? [];
  const wfEdges = workflow?.edges ?? [];
  const wfNodeNameById = new Map(
    wfNodes.map((n) => [n.id, n.data?.name || n.data?.agentId || n.id]),
  );

  // ── 协作策略矩阵（2026-11-03）──────────────────────────────────────
  // 展示草稿本地即时翻转，点「保存策略」才 PUT（有真实 diff 才出保存钮）；
  // 成功后本地态即服务端态。矩阵同时驱动画布节点染色（联动）。
  const [policyDraft, setPolicyDraft] = useState<TeamPolicyMatrix>({});
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyJustSaved, setPolicyJustSaved] = useState(false);

  // 服务端 policy → 展示草稿（team 切换 / 保存成功回写时重置）。
  useEffect(() => {
    setPolicyDraft(policy ? JSON.parse(JSON.stringify(policy)) : {});
    setPolicyJustSaved(false);
    setPolicyError(null);
  }, [policy]);

  const policyDraftCell = (from: string, to: string): PolicyCellState | null =>
    (policyDraft?.[from]?.[to] as PolicyCellState | undefined) ?? null;

  /** 单格点击循环：未配置 → permit → warn → deny → 未配置；只改草稿不落库。 */
  const cyclePolicyCell = (from: string, to: string) => {
    setPolicyError(null);
    setPolicyJustSaved(false);
    setPolicyDraft((prev) => {
      const next: TeamPolicyMatrix = prev ? JSON.parse(JSON.stringify(prev)) : {};
      const row = { ...(next[from] ?? {}) };
      const cur = (row[to] as PolicyCellState | undefined) ?? null;
      if (!cur) {
        row[to] = "permit";
      } else {
        const nextVal = POLICY_CYCLE[POLICY_CYCLE.indexOf(cur) + 1];
        if (nextVal) row[to] = nextVal;
        else delete row[to];
      }
      if (Object.keys(row).length === 0) delete next[from];
      else next[from] = row;
      return next;
    });
  };

  const policyDirty = useMemo(
    () => JSON.stringify(policyDraft) !== JSON.stringify(policy ?? {}),
    [policyDraft, policy],
  );

  const savePolicy = async () => {
    if (!policyDirty || policySaving) return;
    setPolicySaving(true);
    setPolicyError(null);
    try {
      await putTeamPolicy(teamId, policyDraft);
      setPolicy(JSON.parse(JSON.stringify(policyDraft)));
      setPolicyJustSaved(true);
    } catch {
      setPolicyError(t("neo.host.teamPolicySaveFailed", { defaultValue: "策略保存失败，请重试" }));
    } finally {
      setPolicySaving(false);
    }
  };

  /** 策略 → 画布联动：agentId → 最严策略态（matrix 草稿即时驱动）。 */
  const agentPolicyColor = useMemo(() => buildAgentPolicyColor(policyDraft), [policyDraft]);

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
      { team_id: teamId, name: team?.name ?? teamName, agent_ids: roster },
      workspaceId ?? undefined,
    );
    if (gid) {
      // 刷新 inbox，左栏「群聊现场」列表即时出新群（Python 未起时静默）
      void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
      navigate(`/group/${encodeURIComponent(gid)}`);
    } else {
      setLaunchError(
        t("neo.host.teamChatError", { defaultValue: "建群失败：后端不可用或群创建被拒绝" }),
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
      .prompt(t("neo.host.teamRenamePrompt", { defaultValue: "团队新名称" }), current)
      ?.trim();
    if (!name || name === current) return;
    setManageBusy(true);
    setManageError(null);
    try {
      const updated = await patchTeam(teamId, { name });
      setTeam(updated);
    } catch {
      setManageError(t("neo.host.teamManageError", { defaultValue: "操作失败，请重试" }));
    } finally {
      setManageBusy(false);
    }
  };

  // 团队删除：二次确认 → deleteTeam；成功回 Neo home，失败红条并恢复可操作。
  const handleDeleteTeam = async () => {
    if (manageBusy) return;
    if (
      !window.confirm(
        t("neo.host.teamDeleteConfirm", {
          defaultValue: `确定删除团队「${team?.name ?? teamName}」？此操作不可撤销`,
        }),
      )
    )
      return;
    setManageBusy(true);
    setManageError(null);
    try {
      await deleteTeam(teamId);
      navigate("/");
    } catch {
      setManageError(t("neo.host.teamManageError", { defaultValue: "操作失败，请重试" }));
      setManageBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t("neo.host.loading", { defaultValue: "读取中…" })}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-empty neo-host-empty--fill neo-host-empty--err">
          {t("neo.host.teamError", { defaultValue: "编队数据加载失败" })}
        </div>
      </div>
    );
  }

  // roster 中解析得到 AgentRecord 的成员（矩阵行/列头 + 编辑器候选用）。
  const rosterAgents = roster
    .map((id) => agentById.get(id))
    .filter((a): a is AgentRecord => Boolean(a));

  return (
    <div className="neo-host-list">
      {/* 成员 roster（头部带「发起群聊」CTA — GAP D；2026-08-23 管理面闭环：
          头部追加团队重命名/删除钮） */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <UsersRound size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t("neo.host.teamRoster", { defaultValue: "成员" })}
          </span>
          <span className="neo-host-sec-meta">{team?.name ?? teamName}</span>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => void handleRenameTeam()}
            disabled={manageBusy}
            title={t("neo.manage.rename", { defaultValue: "重命名" })}
            data-testid="team-rename-btn"
          >
            <Pencil size={11} strokeWidth={1.8} />
            {t("neo.manage.rename", { defaultValue: "重命名" })}
          </button>
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => void handleDeleteTeam()}
            disabled={manageBusy}
            title={t("common.delete", { defaultValue: "删除" })}
            data-testid="team-delete-btn"
          >
            <Trash2 size={11} strokeWidth={1.8} />
            {t("common.delete", { defaultValue: "删除" })}
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
              ? t("neo.host.teamChatLaunching", { defaultValue: "建群中…" })
              : t("neo.host.teamChatLaunch", { defaultValue: "发起群聊" })}
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
            {t("neo.host.teamRosterEmpty", { defaultValue: "该团队暂无成员" })}
          </div>
        ) : (
          roster.map((id) => {
            const agent = agentById.get(id);
            return (
              <div key={id} className="neo-host-roster-row">
                <span className="neo-host-roster-name">{agent?.name ?? id}</span>
                {agent && (
                  <span className={`neo-host-pill ${AGENT_STATUS_CLASS[agent.status] ?? "neo-host-pill--muted"}`}>
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

      {/* workflow DAG — 2026-11-03 起「编辑 DAG」section 内联展开：不跳页、
          不切走整面板，拖拽/连线/边模式就地完成；未展开时显示只读画布。 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <GitBranch size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t("neo.host.teamWorkflow", { defaultValue: "工作流" })}
          </span>
          <span className="neo-host-sec-meta">
            {t("neo.host.procGraphMeta", {
              defaultValue: "{{nodes}} 节点 · {{edges}} 边",
              nodes: wfNodes.length,
              edges: wfEdges.length,
            })}
          </span>
          {dagDirty && (
            <span className="neo-team-dag-dirty" data-testid="team-dag-dirty">
              {t("neo.host.teamDagDirty", { defaultValue: "● 未保存" })}
            </span>
          )}
        </div>
        {/* 2026-11-04 用户反馈：编辑器常驻 —— 不再有「编辑 DAG」开关，工作流
            section 本身就是可拖拽/连线/就地编辑的画布；工具条按钮（AI 生成/
            校验/保存/版本）由 TeamDagEditor 自带。空团队时给引导文案。
            注意：固定高度容器是 reactflow 的硬前提 —— 编辑器在滚动列表里
            不能用 height:100%（父容器无确定高度 → 画布 0 高 → 空白）。 */}
        {wfNodes.length === 0 && !dagDirty ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t("neo.host.teamWorkflowEmpty", { defaultValue: "该团队尚未编排工作流" })}
          </div>
        ) : (
          <div className="neo-host-dag-inline-editor">
            <TeamDagEditor
              key={workflowStateKey}
              teamId={teamId}
              workflow={workflow ?? { nodes: [], edges: [] }}
              agents={rosterAgents}
              policyColorOf={agentPolicyColor}
              onDirtyChange={setDagDirty}
              onSaved={(wf) => {
                setWorkflow(wf);
                setDagDirty(false);
                // 常驻编辑器：保存/版本回滚后重挂（key 递增），画布重建为
                // 已保存图，脏检查基线同步归零（否则 dirty 卡在 true）。
                setWorkflowStateKey((k) => k + 1);
              }}
              onCancel={() => {
                // 常驻编辑器没有「退出编辑」语义：取消 = 放弃未保存修改并
                // 回滚到服务端图（重挂编辑器即可，key 强制重建画布状态）。
                setWorkflowStateKey((k) => k + 1);
                setDagDirty(false);
              }}
            />
          </div>
        )}
      </div>

      {/* 协作策略矩阵（2026-11-03）：roster × roster 三态格子，点击循环
          permit → warn → deny → 清除；保存后与工作流画布联动（节点描边
          随策略染色即时变化）。 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <ShieldCheck size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t("neo.host.teamPolicy", { defaultValue: "协作策略" })}
          </span>
          {policyJustSaved && !policyDirty && (
            <span className="neo-host-pill neo-host-pill--ok" data-testid="team-policy-saved">
              {t("neo.host.teamPolicySaved", { defaultValue: "已保存" })}
            </span>
          )}
          <button
            type="button"
            className="neo-host-wf-edit-btn"
            onClick={() => setPolicyOpen((v) => !v)}
            data-testid="team-policy-toggle"
            aria-expanded={policyOpen}
          >
            <ChevronDown
              size={11}
              strokeWidth={1.8}
              style={{ transform: policyOpen ? "rotate(180deg)" : undefined }}
            />
            {policyOpen
              ? t("neo.host.teamPolicyCollapse", { defaultValue: "收起矩阵" })
              : t("neo.host.teamPolicyExpand", { defaultValue: "编辑矩阵" })}
          </button>
        </div>
        {/* 未展开：成员策略染色 chips 摘要（与画布同源，颜色即矩阵联动结果） */}
        {!policyOpen && (
          <div className="neo-host-policy-summary">
            {rosterAgents.length === 0 ? (
              <span className="neo-host-tree-note neo-host-tree-note--pad">
                {t("neo.host.teamRosterEmpty", { defaultValue: "该团队暂无成员" })}
              </span>
            ) : (
              rosterAgents.map((a) => {
                const st = agentPolicyColor.get(a.agent_id) ?? null;
                return (
                  <span
                    key={a.agent_id}
                    className="neo-host-policy-chip"
                    style={st ? { borderColor: POLICY_COLOR[st], color: POLICY_COLOR[st] } : undefined}
                    title={st
                      ? t(`neo.host.teamPolicyState_${st}`, { defaultValue: st })
                      : t("neo.host.teamPolicyNoConstraint", { defaultValue: "无限制" })}
                  >
                    {a.name}
                  </span>
                );
              })
            )}
            <span className="neo-host-policy-summary-hint">
              {t("neo.host.teamPolicySummaryHint", { defaultValue: "点「编辑矩阵」配置成员间协作限制" })}
            </span>
          </div>
        )}
        {policyOpen && (
          <div className="neo-host-policy-matrix" data-testid="team-policy-matrix">
            {rosterAgents.length === 0 ? (
              <div className="neo-host-tree-note neo-host-tree-note--pad">
                {t("neo.host.teamRosterEmpty", { defaultValue: "该团队暂无成员" })}
              </div>
            ) : (
              <table className="neo-host-policy-table">
                <thead>
                  <tr>
                    <th className="neo-host-policy-corner" />
                    {rosterAgents.map((a) => (
                      <th key={a.agent_id} title={a.agent_id}>{a.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rosterAgents.map((from) => (
                    <tr key={from.agent_id}>
                      <th scope="row" title={from.agent_id}>{from.name}</th>
                      {rosterAgents.map((to) => {
                        if (from.agent_id === to.agent_id) {
                          return <td key={to.agent_id} className="neo-host-policy-self" />;
                        }
                        const st = policyDraftCell(from.agent_id, to.agent_id);
                        return (
                          <td key={to.agent_id}>
                            <button
                              type="button"
                              className={`neo-host-policy-cell${st ? ` is-${st}` : ""}`}
                              onClick={() => cyclePolicyCell(from.agent_id, to.agent_id)}
                              data-testid={`team-policy-cell-${from.agent_id}-${to.agent_id}`}
                              title={st
                                ? t(`neo.host.teamPolicyState_${st}`, { defaultValue: st })
                                : t("neo.host.teamPolicyState_none", { defaultValue: "默认允许（点击设限）" })}
                              aria-label={`${from.name} → ${to.name}: ${st ?? "none"}`}
                            >
                              {st ? "" : "·"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="neo-host-policy-rowsum">
                        {(() => {
                          const worst = (["deny", "warn", "permit"] as const).find((s) =>
                            rosterAgents.some(
                              (o) => o.agent_id !== from.agent_id && policyDraftCell(from.agent_id, o.agent_id) === s,
                            ),
                          );
                          if (!worst) return null;
                          return (
                            <span
                              className="neo-host-policy-chip"
                              style={{ borderColor: POLICY_COLOR[worst], color: POLICY_COLOR[worst] }}
                            >
                              {t(`neo.host.teamPolicyState_${worst}`, { defaultValue: worst })}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="neo-host-policy-actions">
              <span className="neo-host-policy-legend">
                {(["permit", "warn", "deny"] as const).map((s) => (
                  <span key={s} className="neo-host-policy-legend-item">
                    <span className="neo-host-policy-dot" style={{ background: POLICY_COLOR[s] }} />
                    {t(`neo.host.teamPolicyState_${s}`, { defaultValue: s })}
                  </span>
                ))}
              </span>
              <span className="neo-host-policy-hint">
                {t("neo.host.teamPolicyCycleHint", { defaultValue: "点击格子：允许 → 警告 → 拒绝 → 清除" })}
              </span>
              <span className="neo-host-policy-spacer" />
              {policyDirty && (
                <button
                  type="button"
                  className="neo-team-dag-btn neo-team-dag-btn--primary"
                  onClick={() => void savePolicy()}
                  disabled={policySaving}
                  data-testid="team-policy-save"
                >
                  {policySaving
                    ? t("neo.host.teamPolicySaving", { defaultValue: "保存中…" })
                    : t("neo.host.teamPolicySave", { defaultValue: "保存策略" })}
                </button>
              )}
            </div>
            {policyError && (
              <div
                className="neo-host-tree-note neo-host-tree-note--pad neo-host-empty--err"
                role="alert"
                data-testid="team-policy-error"
              >
                {policyError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* run 进行中：per-node 输出归属 */}
      <div className="neo-host-sec">
        <div className="neo-host-sec-head">
          <UsersRound size={12} strokeWidth={1.8} />
          <span className="neo-host-sec-title">
            {t("neo.host.teamNodeOutput", { defaultValue: "分节点输出" })}
          </span>
          {streaming && (
            <span className="neo-host-pill neo-host-pill--running">live</span>
          )}
        </div>
        {nodeOutputs.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t("neo.host.teamNodeOutputEmpty", {
              defaultValue: "暂无分节点输出（仅 DAG 多 Agent 运行按节点归属；单 Agent 走全局流）",
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

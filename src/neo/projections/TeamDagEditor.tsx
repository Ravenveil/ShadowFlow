/**
 * TeamDagEditor — Team DAG 可视化编辑器（GAP B28 / L2-L3，2026-08-22）。
 *
 * 与 ProcessDagCanvas 的关系：ProcessDagCanvas 是 run 态「执行」只读投影；
 * 本组件是 team 配置态「拓扑」编辑器，挂在 TeamPanel「编辑 DAG」入口之后。
 *
 * 能力：
 *   - 节点增删：工具条从 roster 选择 agent 添加（一个 agent 至多一个节点）；
 *     选中后 Delete/Backspace 或「删除选中」移除（连带清掉相连的边）
 *   - 连线增删：拖拽 Handle 连线（onConnect，拒自环/重复边），删除同上
 *   - 边 mode 编辑：选中一条边后右上角属性面板可切换 direct/approve
 *     （approve = L6 人工审批门，流转前需人工确认），随 workflow 边数据保存
 *   - 拖拽布局：SfReactFlowBase 默认 nodesDraggable，坐标即持久化载体
 *   - 脏检查：有未保存改动时「取消」需二次确认，避免误丢拓扑
 *   - 版本管理（借鉴 StaffDeck SOP 版本）：后端 team_workflow_versions 仓在
 *     每次 PUT workflow 成功时自动快照；「版本」面板（TeamWorkflowVersionsPanel）
 *     提供版本列表 / 回滚（二次确认，走后端 restore 端点）/「存为分支」
 *     （POST …/workflow/branch 复制为新 team 变体，默认名「· 分支」后缀）
 *
 * 保存链路（校验不过不允许保存）：
 *   1. 客户端 preflight —— validateTeamWorkflowGraph（镜像后端
 *      team_validation.validate_workflow 的 D1 规则），有错直接列出、不发请求
 *   2. PUT /api/teams/{id}/workflow —— 服务端 D1/D2 二次校验，422 时把
 *      detail.error.errors 逐条回显
 *   3. PUT /api/teams/{id}/dag —— 布局坐标写回 yaml team 的 dag_layout
 *      （best-effort：Python JSON team 没有 yaml 层，404 TEAM_NOT_FOUND 容忍，
 *      坐标已随 workflow node.position 持久化）
 *
 * 注意：POST /dag/validate 校验的是 Node yaml team（members/edges_v1）模型，
 * 与本编辑器操作的 Python workflow 模型不是同一份数据，故不在保存链路里调它。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Handle,
  Position,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
} from 'reactflow';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import {
  putTeamWorkflow,
  putTeamDagLayout,
  listTeamWorkflowVersions,
  restoreTeamWorkflowVersion,
  branchTeamWorkflow,
  generateTeamDagDraft,
  TeamApiError,
  type TeamDagDraft,
  type TeamWorkflow,
  type TeamWorkflowVersionMeta,
} from '../../api/teams';
import type { AgentRecord } from '../../api/agents';
import { validateTeamWorkflowGraph, normalizeEdgeMode, applyEdgeMode, type TeamEdgeMode } from './teamDagValidation';
import { dagDraftToWorkflow } from './teamDagDraft';
import { useI18n } from '../../common/i18n';

export interface TeamDagEditorProps {
  teamId: string;
  /** 初始图（GET /api/teams/{id}/workflow 的结果；空图传 {nodes:[],edges:[]}）。 */
  workflow: TeamWorkflow;
  /** 可添加为节点的候选 agent（TeamPanel 传入 roster 成员）。 */
  agents: AgentRecord[];
  /** 保存成功（服务端已持久化）后回传新图，父组件刷新只读视图。 */
  onSaved: (workflow: TeamWorkflow) => void;
  onCancel: () => void;
}

interface TeamAgentNodeData extends Record<string, unknown> {
  agentId: string;
  name: string;
  soul: string;
  /** 原 workflow 节点的 type（存量数据为 'agentTask'），保存时原样回写。 */
  nodeType: string;
}

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  background: 'var(--t-fg-4, #737373)',
  border: '1px solid var(--t-border, #27272A)',
} as const;

const NODE_TYPES: NodeTypes = { teamAgent: TeamAgentNode };

/** approve 边的视觉标识：虚线 + 警示色（颜色由 edge.style.stroke 控制，箭头色随动）。 */
const APPROVE_EDGE_CLASS = 'neo-team-dag-edge--approve';
const APPROVE_EDGE_STYLE = { stroke: 'var(--t-warn, #D97706)' } as const;

/** 按 mode 生成 reactflow 边的展示属性（虚线 className + 描边色）。 */
function edgeVisual(mode: TeamEdgeMode): Pick<Edge, 'className' | 'style'> {
  return mode === 'approve' ? { className: APPROVE_EDGE_CLASS, style: { ...APPROVE_EDGE_STYLE } } : {};
}

function TeamAgentNode({ data }: { data: TeamAgentNodeData }) {
  return (
    <div className="neo-team-dag-node">
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span className="neo-team-dag-node-label" title={data.name}>
        {data.name || data.agentId}
      </span>
      <span className="neo-team-dag-node-id" title={data.agentId}>
        {data.agentId || '—'}
      </span>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}

/** 把后端 422 detail 拆成逐条错误文案。 */
function extractSaveErrors(err: unknown): string[] {
  if (err instanceof TeamApiError) {
    const detail = err.detail as { error?: { errors?: unknown; message?: unknown } } | null;
    const inner = detail && typeof detail === 'object' ? detail.error : undefined;
    if (inner && Array.isArray(inner.errors) && inner.errors.length > 0) {
      return inner.errors.map(String);
    }
    if (inner && typeof inner.message === 'string') return [inner.message];
    return [`保存失败（HTTP ${err.status}）`];
  }
  return [err instanceof Error ? err.message : '保存失败'];
}

// ---------------------------------------------------------------------------
// 版本面板 — workflow 版本列表 / 回滚 / 存为分支（后端 team_workflow_versions 仓）
// ---------------------------------------------------------------------------

export interface TeamWorkflowVersionsPanelProps {
  teamId: string;
  /** 保存成功后父组件递增，触发版本列表刷新。 */
  refreshToken: number;
  /** 回滚成功后回传服务端写回的 workflow（与 onSaved 同语义，父组件刷新视图）。 */
  onRestored: (workflow: TeamWorkflow) => void;
}

/**
 * 版本列表 + 回滚（二次确认）+ 「存为分支」。抽成独立导出组件、不依赖
 * reactflow，便于 vitest 直接渲染测试；编辑器里包在 <Panel> 中展示。
 */
export function TeamWorkflowVersionsPanel({ teamId, refreshToken, onRestored }: TeamWorkflowVersionsPanelProps) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<TeamWorkflowVersionMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState('');
  const [branchInfo, setBranchInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    listTeamWorkflowVersions(teamId)
      .then((vs) => {
        if (!cancelled) setVersions(vs);
      })
      .catch(() => {
        if (!cancelled) {
          setVersions([]);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, refreshToken]);

  const handleRestore = useCallback(
    async (version: number) => {
      if (
        !window.confirm(
          t('neo.host.teamDagRestoreConfirm', {
            defaultValue: `确定回滚到 v${version} 吗？画布上未保存的修改将丢失。`,
          }),
        )
      ) {
        return;
      }
      setBusy(true);
      setActionError('');
      try {
        const wf = await restoreTeamWorkflowVersion(teamId, version);
        onRestored(wf);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [teamId, onRestored, t],
  );

  const handleBranch = useCallback(async () => {
    setBusy(true);
    setActionError('');
    setBranchInfo('');
    try {
      const branch = await branchTeamWorkflow(teamId);
      setBranchInfo(
        t('neo.host.teamDagBranchDone', { defaultValue: `已存为分支：${branch.name}` }),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [teamId, t]);

  return (
    <div className="neo-team-dag-versions">
      <div className="neo-team-dag-versions-head">
        <span className="neo-team-dag-versions-title">
          {t('neo.host.teamDagVersionsTitle', { defaultValue: '版本' })}
        </span>
        <button
          type="button"
          className="neo-team-dag-btn"
          disabled={busy}
          onClick={handleBranch}
          data-testid="team-dag-branch-btn"
        >
          {t('neo.host.teamDagBranch', { defaultValue: '存为分支' })}
        </button>
      </div>
      {branchInfo && <div className="neo-team-dag-versions-info">{branchInfo}</div>}
      {actionError && (
        <div className="neo-team-dag-error-row" role="alert">
          {actionError}
        </div>
      )}
      {loadFailed ? (
        <div className="neo-team-dag-versions-empty">
          {t('neo.host.teamDagVersionsLoadFailed', { defaultValue: '版本列表加载失败' })}
        </div>
      ) : versions === null ? (
        <div className="neo-team-dag-versions-empty">
          {t('neo.host.teamDagVersionsLoading', { defaultValue: '加载中…' })}
        </div>
      ) : versions.length === 0 ? (
        <div className="neo-team-dag-versions-empty" data-testid="team-dag-versions-empty">
          {t('neo.host.teamDagVersionsEmpty', { defaultValue: '暂无版本，保存后自动生成快照' })}
        </div>
      ) : (
        <ul className="neo-team-dag-versions-list" data-testid="team-dag-versions-list">
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="neo-team-dag-versions-row">
              <span className="neo-team-dag-versions-label">v{v.version}</span>
              <span className="neo-team-dag-versions-time">
                {new Date(v.saved_at).toLocaleString()}
              </span>
              {v.summary && <span className="neo-team-dag-versions-summary">{v.summary}</span>}
              <button
                type="button"
                className="neo-team-dag-btn"
                disabled={busy}
                onClick={() => handleRestore(v.version)}
                data-testid={`team-dag-restore-v${v.version}`}
              >
                {t('neo.host.teamDagRestore', { defaultValue: '回滚' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TeamDagEditor({ teamId, workflow, agents, onSaved, onCancel }: TeamDagEditorProps) {
  const { t } = useI18n();

  /** 节点展示名：优先 workflow 存量 name，缺失时回退 roster 里的 agent 名。 */
  const resolveNodeName = useCallback(
    (agentId: string, stored: string | undefined, nodeId: string): string => {
      if (stored) return stored;
      const roster = agents.find((a) => a.agent_id === agentId);
      return roster?.name || nodeId;
    },
    [agents],
  );

  const seedNodes = useMemo<Node<TeamAgentNodeData>[]>(
    () =>
      workflow.nodes.map((n, i) => ({
        id: n.id,
        type: 'teamAgent',
        // 无坐标的旧数据给一列种子位，避免全部叠在 (0,0)
        position: n.position ?? { x: 0, y: i * 106 },
        data: {
          agentId: n.data?.agentId ?? '',
          name: resolveNodeName(n.data?.agentId ?? '', n.data?.name, n.id),
          soul: n.data?.soul ?? '',
          nodeType: n.type || 'agentTask',
        },
      })),
    [workflow, resolveNodeName],
  );
  const seedEdges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((e) => {
        const mode = normalizeEdgeMode(e.data?.mode);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          data: { mode },
          ...edgeVisual(mode),
          ...(e.label ? { label: e.label } : {}),
        };
      }),
    [workflow],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<TeamAgentNodeData>(seedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(seedEdges);

  const [pendingAgentId, setPendingAgentId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [layoutWarning, setLayoutWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versionsToken, setVersionsToken] = useState(0);

  // 添加候选：roster 里还没上画布的 agent（data.agentId 为空占位的旧节点不挡）。
  const placedAgentIds = useMemo(
    () => new Set(rfNodes.map((n) => n.data.agentId).filter(Boolean)),
    [rfNodes],
  );
  const addableAgents = useMemo(
    () => agents.filter((a) => !placedAgentIds.has(a.agent_id)),
    [agents, placedAgentIds],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      setRfEdges((eds) => {
        if (eds.some((e) => e.source === conn.source && e.target === conn.target)) return eds;
        return addEdge(
          { ...conn, id: `${conn.source}->${conn.target}`, type: 'smoothstep', data: { mode: 'direct' } },
          eds,
        );
      });
      setErrors([]);
    },
    [setRfEdges],
  );

  const addAgentNode = useCallback(() => {
    const agent = agents.find((a) => a.agent_id === pendingAgentId);
    if (!agent) return;
    const id = `n-${agent.agent_id}`;
    setRfNodes((ns) => {
      if (ns.some((n) => n.id === id)) return ns;
      const maxX = ns.reduce((m, n) => Math.max(m, n.position.x), 0);
      return [
        ...ns,
        {
          id,
          type: 'teamAgent',
          position: { x: maxX + (ns.length ? 200 : 0), y: 40 + (ns.length % 6) * 90 },
          data: { agentId: agent.agent_id, name: agent.name, soul: agent.soul, nodeType: 'agentTask' },
        },
      ];
    });
    setPendingAgentId('');
    setErrors([]);
  }, [agents, pendingAgentId, setRfNodes]);

  const selectedNodes = rfNodes.filter((n) => n.selected);
  const selectedEdges = rfEdges.filter((e) => e.selected);
  /** 边属性面板只针对单选的第一条边。 */
  const activeEdge = selectedEdges[0];
  const activeEdgeMode: TeamEdgeMode = activeEdge
    ? normalizeEdgeMode((activeEdge.data as { mode?: unknown } | undefined)?.mode)
    : 'direct';

  /** 切换边 mode（direct/approve），并同步虚线/警示色展示属性。 */
  const setEdgeMode = useCallback(
    (edgeId: string, mode: TeamEdgeMode) => {
      setRfEdges((es) =>
        applyEdgeMode(es, edgeId, mode).map((e) =>
          // direct 时显式清掉 approve 的 className/style，避免残留虚线
          e.id === edgeId ? { ...e, className: undefined, style: undefined, ...edgeVisual(mode) } : e,
        ),
      );
      setErrors([]);
    },
    [setRfEdges],
  );

  const deleteSelected = useCallback(() => {
    const nodeIds = new Set(rfNodes.filter((n) => n.selected).map((n) => n.id));
    const edgeIds = new Set(rfEdges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    setRfNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
    // 节点删除连带清掉相连的边
    setRfEdges((es) =>
      es.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    );
    setErrors([]);
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges]);

  const serialize = useCallback((): TeamWorkflow => {
    return {
      nodes: rfNodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        data: { agentId: n.data.agentId, name: n.data.name, soul: n.data.soul },
      })),
      edges: rfEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: { mode: normalizeEdgeMode((e.data as { mode?: unknown } | undefined)?.mode) },
        ...(e.label ? { label: String(e.label) } : {}),
      })),
    };
  }, [rfNodes, rfEdges]);

  /**
   * 初始图的序列化快照（与 serialize 同构：坐标取整、name 走 roster 回退、
   * mode 归一化），作为脏检查基线 —— 未做任何编辑时 dirty 必须为 false。
   */
  const initialSerialized = useMemo<TeamWorkflow>(() => {
    return {
      nodes: workflow.nodes.map((n, i) => {
        const agentId = n.data?.agentId ?? '';
        const pos = n.position ?? { x: 0, y: i * 106 };
        return {
          id: n.id,
          type: n.type || 'agentTask',
          position: { x: Math.round(pos.x), y: Math.round(pos.y) },
          data: {
            agentId,
            name: resolveNodeName(agentId, n.data?.name, n.id),
            soul: n.data?.soul ?? '',
          },
        };
      }),
      edges: workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: { mode: normalizeEdgeMode(e.data?.mode) },
        ...(e.label ? { label: e.label } : {}),
      })),
    };
  }, [workflow, resolveNodeName]);

  const dirty = useMemo(
    () => JSON.stringify(serialize()) !== JSON.stringify(initialSerialized),
    [serialize, initialSerialized],
  );

  /** 有未保存改动时取消需二次确认，避免误丢拓扑。 */
  const handleCancel = useCallback(() => {
    if (
      dirty &&
      !window.confirm(
        t('neo.host.teamDagDiscardConfirm', {
          defaultValue: '有未保存的 DAG 修改，确定放弃吗？',
        }),
      )
    ) {
      return;
    }
    onCancel();
  }, [dirty, onCancel, t]);

  const onSave = useCallback(async () => {
    const wf = serialize();
    // 1. 客户端 preflight —— 不过就不发请求
    const errs = validateTeamWorkflowGraph(wf);
    setErrors(errs);
    setLayoutWarning('');
    if (errs.length > 0) return;

    // 2. PUT workflow（服务端 D1/D2 二次校验）
    setSaving(true);
    try {
      await putTeamWorkflow(teamId, wf);
    } catch (err) {
      setErrors(extractSaveErrors(err));
      setSaving(false);
      return;
    }

    // 3. PUT dag 布局（best-effort：Python JSON team 无 yaml 层，404 容忍）
    try {
      await putTeamDagLayout(teamId, {
        mode: 'manual',
        nodes: wf.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        viewport: { zoom: 1, pan_x: 0, pan_y: 0 },
      });
    } catch (err) {
      if (!(err instanceof TeamApiError && err.status === 404)) {
        setLayoutWarning(
          t('neo.host.teamDagLayoutWarn', {
            defaultValue: '拓扑已保存；布局坐标写回失败（不影响使用）',
          }),
        );
      }
    }
    setSaving(false);
    // 保存成功 → 服务端已自动记一版，刷新版本面板（若开着）
    setVersionsToken((k) => k + 1);
    onSaved(wf);
  }, [serialize, teamId, onSaved, t]);

  return (
    <div className="neo-team-dag-editor">
      {errors.length > 0 && (
        <div className="neo-team-dag-errors" role="alert">
          {errors.map((e, i) => (
            <div key={i} className="neo-team-dag-error-row">
              {e}
            </div>
          ))}
        </div>
      )}
      {layoutWarning && <div className="neo-team-dag-warn">{layoutWarning}</div>}
      <div className="neo-team-dag-editor-canvas">
        <SfReactFlowBase
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          className="neo-team-dag"
          reactFlowProps={{ deleteKeyCode: ['Delete', 'Backspace'] }}
        >
          <Panel position="top-left" className="neo-team-dag-toolbar">
            <select
              className="neo-team-dag-select"
              value={pendingAgentId}
              onChange={(e) => setPendingAgentId(e.target.value)}
              disabled={saving}
              data-testid="team-dag-add-select"
            >
              <option value="">
                {t('neo.host.teamDagAddPlaceholder', { defaultValue: '选择成员…' })}
              </option>
              {addableAgents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={!pendingAgentId || saving}
              onClick={addAgentNode}
              data-testid="team-dag-add-btn"
            >
              {t('neo.host.teamDagAddNode', { defaultValue: '+ 节点' })}
            </button>
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={(selectedNodes.length === 0 && selectedEdges.length === 0) || saving}
              onClick={deleteSelected}
              data-testid="team-dag-del-btn"
            >
              {t('neo.host.teamDagDelete', { defaultValue: '删除选中' })}
            </button>
            <span className="neo-team-dag-hint">
              {t('neo.host.teamDagHint', { defaultValue: '拖点连线 · 点边改模式 · Delete 删除' })}
            </span>
            <span className="neo-team-dag-toolbar-spacer" />
            {dirty && !saving && (
              <span className="neo-team-dag-dirty" data-testid="team-dag-dirty">
                {t('neo.host.teamDagDirty', { defaultValue: '● 未保存' })}
              </span>
            )}
            <button
              type="button"
              className="neo-team-dag-btn neo-team-dag-btn--primary"
              disabled={saving}
              onClick={onSave}
              data-testid="team-dag-save-btn"
            >
              {saving
                ? t('neo.host.teamDagSaving', { defaultValue: '保存中…' })
                : t('neo.host.teamDagSave', { defaultValue: '校验并保存' })}
            </button>
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={saving}
              onClick={handleCancel}
              data-testid="team-dag-cancel-btn"
            >
              {t('neo.host.teamDagCancel', { defaultValue: '取消' })}
            </button>
            <button
              type="button"
              className={`neo-team-dag-btn${showVersions ? ' is-active' : ''}`}
              disabled={saving}
              onClick={() => setShowVersions((v) => !v)}
              data-testid="team-dag-versions-btn"
            >
              {t('neo.host.teamDagVersions', { defaultValue: '版本' })}
            </button>
          </Panel>
          {showVersions && (
            <Panel position="bottom-right" className="neo-team-dag-versions-panel" data-testid="team-dag-versions-panel">
              <TeamWorkflowVersionsPanel
                teamId={teamId}
                refreshToken={versionsToken}
                onRestored={onSaved}
              />
            </Panel>
          )}
          {activeEdge && (
            <Panel position="top-right" className="neo-team-dag-edge-panel" data-testid="team-dag-edge-panel">
              <div className="neo-team-dag-edge-panel-title">
                {activeEdge.source} → {activeEdge.target}
              </div>
              <div className="neo-team-dag-edge-modes">
                <button
                  type="button"
                  className={`neo-team-dag-edge-mode-btn${activeEdgeMode === 'direct' ? ' is-active' : ''}`}
                  onClick={() => setEdgeMode(activeEdge.id, 'direct')}
                  data-testid="team-dag-edge-mode-direct"
                >
                  {t('neo.host.teamDagEdgeModeDirect', { defaultValue: '直接流转' })}
                </button>
                <button
                  type="button"
                  className={`neo-team-dag-edge-mode-btn neo-team-dag-edge-mode-btn--approve${activeEdgeMode === 'approve' ? ' is-active' : ''}`}
                  onClick={() => setEdgeMode(activeEdge.id, 'approve')}
                  data-testid="team-dag-edge-mode-approve"
                >
                  {t('neo.host.teamDagEdgeModeApprove', { defaultValue: '人工审批' })}
                </button>
              </div>
              <div className="neo-team-dag-edge-hint">
                {activeEdgeMode === 'approve'
                  ? t('neo.host.teamDagEdgeApproveHint', {
                      defaultValue: '审批边：结果流转前需人工确认（L6 审批门）',
                    })
                  : t('neo.host.teamDagEdgeDirectHint', {
                      defaultValue: '直接边：上游完成后自动流转到下游',
                    })}
              </div>
            </Panel>
          )}
        </SfReactFlowBase>
      </div>
    </div>
  );
}

export default TeamDagEditor;

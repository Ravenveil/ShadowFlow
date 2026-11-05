/**
 * TeamDagEditor — Team DAG 可视化编辑器（GAP B28 / L2-L3，2026-08-22）。
 *
 * 与 ProcessDagCanvas 的关系：ProcessDagCanvas 是 run 态「执行」只读投影；
 * 本组件是 team 配置态「拓扑」编辑器，挂在 TeamPanel「编辑 DAG」入口之后。
 *
 * 能力（2026-11-05 顺滑化改版：n8n 式连线/排布 + 工具条四钮合一）：
 *   - 节点增删：工具条下拉**选中即添加**（落画布视口中心，级联偏移防堆叠）；
 *     或拖拽连线松手到画布空白处，浮出「连接到…」浮层选成员 —— 建节点 +
 *     连线一步完成（n8n 式 drop-to-connect）
 *   - 连线增删：ConnectionMode.Loose（任意手柄都能拉线/接线，方向自动归一），
 *     圆角 smoothstep 边；删除：选中后 Delete/Backspace 或「删除选中」
 *     （连带清掉相连的边）
 *   - 自动排列：工具条「自动排列」图标钮 —— 最长路径分层（复用
 *     TeamDagCanvas.computeTeamDagColumns）×列内行序重排 + fitView
 *   - 边 mode 编辑：选中一条边后右上角属性面板可切换 direct/approve
 *     （approve = L6 人工审批门，流转前需人工确认），随 workflow 边数据保存
 *   - 拖拽布局：SfReactFlowBase 默认 nodesDraggable，坐标即持久化载体
 *   - 脏检查：有未保存改动时「放弃修改」需二次确认，避免误丢拓扑
 *   - 版本管理（借鉴 StaffDeck SOP 版本）：后端 team_workflow_versions 仓在
 *     每次 PUT workflow 成功时自动快照；「版本历史」面板（
 *     TeamWorkflowVersionsPanel）收进「⋯」溢出菜单，提供版本列表 / 回滚
 *     （二次确认，走后端 restore 端点）/「存为分支」
 *   - AI 生成草稿：工具条「AI 生成」开 bottom-left 面板，输入自然语言描述
 *     → POST /api/teams/dag-draft（BYOK LLM）生成 {nodes,edges} 草稿 →
 *     dagDraftToWorkflow 铺进画布并标脏；只进画布不落库，确认后走既有保存通路
 *
 * 工具条收纳（2026-11-05 用户反馈：右侧「服务端校验/校验并保存/取消/版本」
 * 四钮合并为一个「保存」主按钮）：
 *   - 右侧只留 [自动排列] [⋯] [保存]；版本历史、放弃修改收进 ⋯ 菜单
 *   - 服务端干跑校验不再是按钮：保存成功后自动 best-effort 跑一遍
 *     POST /api/teams/{id}/dag/validate，结果回显提示行（ok/未通过），
 *     Python JSON team 无 yaml 层 → 404 静默；不过不挡保存（保存链路自有 D1/D2）
 *   - 「放弃修改」= 原「取消」：dirty 时先弹 NeoConfirmModal 确认
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
 * 与本编辑器操作的 Python workflow 模型不是同一份数据，故不在保存链路里调它；
 * 保存成功后的自动干跑校验仅作提示（404 容忍静默），不阻塞保存结果。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Handle,
  Position,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  ConnectionLineType,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type OnConnectStart,
  type OnConnectEnd,
} from 'reactflow';
import { ListTree, MoreHorizontal, Redo2, Trash2, Undo2, Wand2 } from 'lucide-react';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import {
  putTeamWorkflow,
  putTeamDagLayout,
  listTeamWorkflowVersions,
  restoreTeamWorkflowVersion,
  branchTeamWorkflow,
  generateTeamDagDraft,
  validateTeamDag,
  TeamApiError,
  type TeamDagDraft,
  type TeamWorkflow,
  type TeamWorkflowVersionMeta,
  type PolicyCellState,
} from '../../api/teams';
import type { AgentRecord } from '../../api/agents';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import { validateTeamWorkflowGraph, normalizeEdgeMode, applyEdgeMode, type TeamEdgeMode } from './teamDagValidation';
import { computeTeamDagColumns } from './TeamDagCanvas';
import { dagDraftToWorkflow } from './teamDagDraft';
import { useI18n } from '../../common/i18n';
import { NeoConfirmModal } from '../NeoConfirmModal';

export interface TeamDagEditorProps {
  teamId: string;
  /** 初始图（GET /api/teams/{id}/workflow 的结果；空图传 {nodes:[],edges:[]}）。 */
  workflow: TeamWorkflow;
  /** 可添加为节点的候选 agent（TeamPanel 传入 roster 成员）。 */
  agents: AgentRecord[];
  /** 保存成功（服务端已持久化）后回传新图，父组件刷新只读视图。 */
  onSaved: (workflow: TeamWorkflow) => void;
  onCancel: () => void;
  /**
   * 2026-11-03 策略联动：agentId → 最严策略态（可选）。命中时编辑态画布
   * 节点描边按策略染色，与协作策略矩阵即时呼应（草稿态即反映，不需保存）。
   */
  policyColorOf?: Map<string, PolicyCellState> | null;
  /**
   * 2026-11-04 编辑器常驻（TeamPanel 工作流 section 不再有「编辑」开关）：
   * dirty 翻转时上报父组件，驱动 section 头部「● 未保存」徽标。可选，
   * 不传时内部脏检查照常工作（取消确认仍用内部 dirty）。
   */
  onDirtyChange?: (dirty: boolean) => void;
}

interface TeamAgentNodeData extends Record<string, unknown> {
  agentId: string;
  name: string;
  soul: string;
  /** 原 workflow 节点的 type（存量数据为 'agentTask'），保存时原样回写。 */
  nodeType: string;
  /**
   * 2026-11-04：节点改用 Agent 真实头像（DiceBear / avatar_image），与侧栏、
   * 气泡、成员面板同源。roster 查不到时回退文字首字色块。
   */
  avatarStyle?: string | null;
  avatarSeed?: string | null;
  avatarImage?: string | null;
  /** 2026-11-03：策略联动染色（可选；无策略 = 默认边框）。 */
  policyState?: PolicyCellState | null;
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

/**
 * 统一建边工厂（2026-11-05 顺滑化）：smoothstep + 14px 圆角（n8n 式柔和
 * 折线，直角太生硬），mode 视觉随动。seed/load/onConnect/drop-connect 四处
 * 建边共用，保证观感一致。
 * 2026-11-05 四轮：reconnectable —— 直接抓线的端点拖到别的手柄即可改接
 * （n8n 式改连），配合 onReconnect 完成端点替换。
 */
function makeTeamEdge(
  base: { id: string; source: string; target: string; label?: string },
  mode: TeamEdgeMode = 'direct',
): Edge {
  return {
    ...base,
    type: 'smoothstep',
    pathOptions: { borderRadius: 14 },
    reconnectable: true,
    data: { mode },
    ...edgeVisual(mode),
    ...(base.label ? { label: base.label } : {}),
  };
}

/**
 * DAG 节点（2026-11-04 用户反馈批）：Agent 真实头像在上、名字在下。
 *
 * 之前是「名字 + agentId」两行纯文字的方块，画布上认不出谁是谁，也没法
 * 靠视觉定位拖拽目标。改成头像卡片后：拖动 = 直接抓头像卡片，连线 = 从
 * 卡片左右两侧的 Handle 拉出，节点本身可点选/拖动（SfReactFlowBase 默认
 * nodesDraggable，坐标即持久化载体）。
 */
/** 策略态 → 节点描边色（与 TeamDagCanvas / 策略矩阵配色一致）。 */
const POLICY_NODE_COLOR: Record<PolicyCellState, string> = {
  permit: 'var(--t-ok, #16A34A)',
  warn: 'var(--t-warn, #D97706)',
  deny: 'var(--t-err, #DC2626)',
};

function TeamAgentNode({ data, id }: { data: TeamAgentNodeData; id?: string }) {
  const policyStyle =
    data.policyState && POLICY_NODE_COLOR[data.policyState]
      ? { border: `2px solid ${POLICY_NODE_COLOR[data.policyState]}` }
      : undefined;
  return (
    <div
      className="neo-team-dag-node"
      style={policyStyle}
      title={`${data.name || data.agentId} · ${data.agentId}`}
      data-testid={`team-dag-node-${id ?? data.agentId}`}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <span className="neo-team-dag-node-avatar">
        <AgentAvatar
          name={data.name || data.agentId || '?'}
          style={data.avatarStyle}
          seed={data.avatarSeed ?? data.name ?? data.agentId}
          image={data.avatarImage ?? null}
          size={36}
        />
      </span>
      <span className="neo-team-dag-node-label" title={data.name}>
        {data.name || data.agentId}
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

/** 把 TeamApiError detail 拆成逐条错误文案（AI 草稿 / 服务端校验共用，fallback 为兜底动词短语）。 */
function extractApiErrorLines(err: unknown, fallback: string): string[] {
  if (err instanceof TeamApiError) {
    const detail = err.detail as { error?: { errors?: unknown; message?: unknown } } | null;
    const inner = detail && typeof detail === 'object' ? detail.error : undefined;
    if (inner && Array.isArray(inner.errors) && inner.errors.length > 0) {
      return inner.errors.map(String);
    }
    if (inner && typeof inner.message === 'string') return [inner.message];
    return [`${fallback}（HTTP ${err.status}）`];
  }
  return [err instanceof Error ? err.message : fallback];
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

  // 二次确认弹窗（2026-11-04 用户反馈批）：window.confirm 原生框替换为
  // NeoConfirmModal。restoreVersion = 待回滚版本号；discardDirty = 放弃未保存
  // 修改确认。两者共用一个弹窗实例（同一时间只会有一个来源）。
  const [confirmAsk, setConfirmAsk] = useState<
    { kind: 'restore'; version: number } | { kind: 'discard' } | null
  >(null);

  const handleRestore = useCallback(
    (version: number) => {
      setConfirmAsk({ kind: 'restore', version });
    },
    [],
  );

  const runRestore = useCallback(
    async (version: number) => {
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
    [teamId, onRestored],
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

      {/* 回滚二次确认弹窗（2026-11-04 用户反馈批，替换 window.confirm 原生框） */}
      {confirmAsk?.kind === 'restore' && (
        <NeoConfirmModal
          title={t('neo.host.teamDagRestoreTitle', { defaultValue: '回滚版本' })}
          message={t('neo.host.teamDagRestoreConfirm', {
            defaultValue: `确定回滚到 v${confirmAsk.version} 吗？画布上未保存的修改将丢失。`,
          })}
          confirmLabel={t('common.confirm', { defaultValue: '确定' })}
          busy={busy}
          onConfirm={() => {
            const { version } = confirmAsk;
            setConfirmAsk(null);
            void runRestore(version);
          }}
          onClose={() => setConfirmAsk(null)}
        />
      )}
    </div>
  );
}

export function TeamDagEditor(props: TeamDagEditorProps) {
  /**
   * Provider 包装（2026-11-05 三轮 hotfix，reactflow error #001）：
   * 本组件函数体直接调用 useReactFlow()（drop-to-connect 坐标换算 /
   * fitView），必须在 Provider **之内**渲染；而 SfReactFlowBase 自带的
   * Provider 在它自己的渲染树里，是本组件的**子节点**，帮不到我们。
   * 因此外层自建 Provider，并让 SfReactFlowBase withProvider={false}
   * —— 两层若各建各的 store，screenToFlowPosition 会读错视口实例。
   */
  return (
    <ReactFlowProvider>
      <TeamDagEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function TeamDagEditorInner({ teamId, workflow, agents, onSaved, onCancel, policyColorOf, onDirtyChange }: TeamDagEditorProps) {
  const { t } = useI18n();

  // 放弃未保存修改的二次确认（2026-11-04 用户反馈批）：window.confirm 原生框
  // 替换为 NeoConfirmModal（dirty 时点「取消」先弹此窗）。
  const [discardAsk, setDiscardAsk] = useState(false);

  /** 节点展示名：优先 workflow 存量 name，缺失时回退 roster 里的 agent 名。 */
  const resolveNodeName = useCallback(
    (agentId: string, stored: string | undefined, nodeId: string): string => {
      if (stored) return stored;
      const roster = agents.find((a) => a.agent_id === agentId);
      return roster?.name || nodeId;
    },
    [agents],
  );

  /** roster → 节点头像字段（与侧栏/气泡/成员面板同源的 AgentAvatar 参数）。 */
  const resolveAvatar = useCallback(
    (agentId: string): Pick<TeamAgentNodeData, 'avatarStyle' | 'avatarSeed' | 'avatarImage'> => {
      const roster = agents.find((a) => a.agent_id === agentId);
      if (!roster) return {};
      return {
        avatarStyle: roster.avatar_style,
        avatarSeed: roster.avatar_seed ?? roster.name,
        avatarImage: roster.avatar_image ?? null,
      };
    },
    [agents],
  );

  /**
   * n8n 式初始排布（2026-11-05 四轮，用户反馈）：团队 roster 全员以孤立点
   * 铺在画布上，用户直接拖手柄连线即可 —— 不再需要「+ 添加成员」入口。
   * workflow 已有的节点按存量坐标铺；roster 里没上画布的成员补成孤立点，
   * 网格排布在既有节点下方（4 列，120×110 间距）。id 规则 n-<agentId> 与
   * addAgentNode 一致，保存后即为持久坐标。
   */
  const seedNodes = useMemo<Node<TeamAgentNodeData>[]>(() => {
    const placed: Node<TeamAgentNodeData>[] = workflow.nodes.map((n, i) => {
      const agentId = n.data?.agentId ?? '';
      return {
        id: n.id,
        type: 'teamAgent',
        // 无坐标的旧数据给一列种子位，避免全部叠在 (0,0)
        position: n.position ?? { x: 0, y: i * 106 },
        data: {
          agentId,
          name: resolveNodeName(agentId, n.data?.name, n.id),
          soul: n.data?.soul ?? '',
          nodeType: n.type || 'agentTask',
          policyState: policyColorOf?.get(agentId) ?? null,
          ...resolveAvatar(agentId),
        },
      };
    });
    const placedIds = new Set(placed.map((n) => n.data.agentId).filter(Boolean));
    const missing = agents.filter((a) => !placedIds.has(a.agent_id));
    const GRID_COL = 4;
    const CELL_W = 130;
    const CELL_H = 110;
    const baseY =
      placed.reduce((m, n) => Math.max(m, n.position.y + 120), 0);
    const orphans: Node<TeamAgentNodeData>[] = missing.map((a, i) => ({
      id: `n-${a.agent_id}`,
      type: 'teamAgent',
      position: { x: (i % GRID_COL) * CELL_W, y: baseY + Math.floor(i / GRID_COL) * CELL_H },
      data: {
        agentId: a.agent_id,
        name: a.name,
        soul: a.soul ?? '',
        nodeType: 'agentTask',
        policyState: policyColorOf?.get(a.agent_id) ?? null,
        ...resolveAvatar(a.agent_id),
      },
    }));
    return [...placed, ...orphans];
  }, [workflow, agents, resolveNodeName, resolveAvatar, policyColorOf]);
  const seedEdges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((e) => {
        const mode = normalizeEdgeMode(e.data?.mode);
        return makeTeamEdge({ id: e.id, source: e.source, target: e.target, label: e.label }, mode);
      }),
    [workflow],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<TeamAgentNodeData>(seedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(seedEdges);

  /** 序列化画布 → TeamWorkflow（保存 payload 与撤销快照同构）。 */
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
   * 撤销/重做（2026-11-05 三轮新增，n8n 式编辑器标配）。
   *
   * 快照栈设计：只记录**结构性变更**（增删节点/边、自动排列、AI 草稿铺入、
   * 边 mode 切换、放弃修改回滚），不记录拖拽/平移/缩放/选中 —— 拖拽是高频
   * 连续 position 变化，进栈会把「挪一下」拆成几十步 undo，体验反而差。
   * 实现上不侵入 reactflow 状态流：pushHistory 由各结构变更点显式调用，
   * undo/redo 直接整体回放 nodes+edges 快照（结构级小图，快照成本可忽略）。
   * 快照存 serialize() 同构的 TeamWorkflow（不含选中态等 UI 噪音），
   * 回放时重投影头像/策略字段（与 loadWorkflowToCanvas 同源逻辑）。
   */
  const [undoStack, setUndoStack] = useState<TeamWorkflow[]>([]);
  const [redoStack, setRedoStack] = useState<TeamWorkflow[]>([]);
  const suppressHistoryRef = useRef(false);

  /** 显式记录一步结构变更（清空 redo 栈；上限 50 步防内存膨胀）。 */
  const pushHistory = useCallback(() => {
    if (suppressHistoryRef.current) return;
    const snap = serialize();
    setUndoStack((stack) => [...stack.slice(-49), snap]);
    setRedoStack([]);
  }, [serialize]);

  /** 把一份 TeamWorkflow 回放进画布（撤销/重做共用；重投影头像/策略字段）。 */
  const replayWorkflow = useCallback(
    (wf: TeamWorkflow) => {
      suppressHistoryRef.current = true;
      setRfNodes(
        wf.nodes.map((n, i) => {
          const agentId = n.data?.agentId ?? '';
          return {
            id: n.id,
            type: 'teamAgent',
            position: n.position ?? { x: 0, y: i * 106 },
            data: {
              agentId,
              name: resolveNodeName(agentId, n.data?.name, n.id),
              soul: n.data?.soul ?? '',
              nodeType: n.type || 'agentTask',
              policyState: policyColorOf?.get(agentId) ?? null,
              ...resolveAvatar(agentId),
            },
          };
        }),
      );
      setRfEdges(
        wf.edges.map((e) => {
          const mode = normalizeEdgeMode(e.data?.mode);
          return makeTeamEdge({ id: e.id, source: e.source, target: e.target, label: e.label }, mode);
        }),
      );
      suppressHistoryRef.current = false;
    },
    [setRfNodes, setRfEdges, resolveNodeName, resolveAvatar, policyColorOf],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const current = serialize();
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current]);
    replayWorkflow(prev);
    setErrors([]);
  }, [undoStack, serialize, replayWorkflow]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const current = serialize();
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current]);
    replayWorkflow(next);
    setErrors([]);
  }, [redoStack, serialize, replayWorkflow]);

  // reactflow 实例：视口换算（新节点落视口中心）/ fitView（自动排列后收拢）。
  const { screenToFlowPosition, fitView } = useReactFlow();
  // 画布容器 ref：新节点落点取容器中心（window 中心在右栏布局下会偏）。
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [layoutWarning, setLayoutWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versionsToken, setVersionsToken] = useState(0);
  // 「⋯」溢出菜单（版本历史 / 放弃修改收纳处，2026-11-05 四钮合一）
  const [menuOpen, setMenuOpen] = useState(false);
  // AI 生成草稿面板（bottom-left）：prompt 输入 + 生成中/错误态（错误面板内联，不关面板）
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErrors, setAiErrors] = useState<string[]>([]);
  // 服务端干跑校验（POST /dag/validate，yaml 模型）：保存成功后自动 best-effort
  // 跑一遍（2026-11-05 起不再是独立按钮），ok/不适用走提示行，errors 走错误区
  const [validating, setValidating] = useState(false);
  const [validateInfo, setValidateInfo] = useState('');
  // n8n 式 drop-to-connect：拖线松手在空白处 → 记住连线起点，浮层选成员建节点+连线。
  // 2026-11-05 二轮修复：同时记屏幕坐标（浮层定位用，Panel 在屏幕坐标系）与
  // flow 坐标（新节点落点用）—— 上一版只有 flow 坐标，缩放/平移后浮层会飘。
  const [pendingConnection, setPendingConnection] = useState<{
    source: string;
    position: { x: number; y: number };
    screen: { x: number; y: number };
  } | null>(null);

  /**
   * 点画布空白处关闭所有浮层（2026-11-05 二轮新增）：⋯ 菜单 / drop-connect
   * 浮层 / AI 面板此前只能再点一次按钮收起，点空白无反应，不合编辑器直觉。
   * （版本面板/AI 面板一并收起 —— 空白点击语义 = 「我不用这些浮层了」。）
   */
  const closeOverlays = useCallback(() => {
    setMenuOpen(false);
    setPendingConnection(null);
    setShowAiDraft(false);
    setShowVersions(false);
  }, []);

  // 撤销/重做快捷键（2026-11-05 三轮）：Ctrl+Z 撤销、Ctrl+Y / Ctrl+Shift+Z 重做。
  // 输入框聚焦时不拦截（textarea 打字时 Ctrl+Z 应该是输入级撤销）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  // 添加候选逻辑已随「+ 添加成员」下拉移除（2026-11-05 四轮）：roster 全员
  // 由 seedNodes 直接铺成孤立点，无需再挑人添加。

  /**
   * 方向归一（n8n 画布语义）：目标节点应在其上游的右侧 → x 小者为 source；
   * 同 x 保持调用方给的方向。onConnect / onReconnect / drop-connect 共用。
   */
  const normalizeDirection = useCallback(
    (a: string, b: string): [string, string] => {
      const ax = rfNodes.find((n) => n.id === a)?.position.x ?? 0;
      const bx = rfNodes.find((n) => n.id === b)?.position.x ?? 0;
      return ax <= bx ? [a, b] : [b, a];
    },
    [rfNodes],
  );

  /**
   * Loose 模式连线（2026-11-05）：任意手柄可起步/落地，方向按「画布语义」
   * 归一 —— 目标节点应在其上游的右侧，故按两节点 x 坐标定方向（x 小者为
   * source）；同 x 时保持用户拖拽方向。拒自环/重复边。
   */
  const onConnect = useCallback(
    (rawConn: Connection) => {
      const { source, target } = rawConn;
      if (!source || !target || source === target) return;
      const [from, to] = normalizeDirection(source, target);
      pushHistory();
      setRfEdges((eds) => {
        if (eds.some((e) => e.source === from && e.target === to)) return eds;
        return addEdge(makeTeamEdge({ id: `${from}->${to}`, source: from, target: to }), eds);
      });
      setErrors([]);
    },
    [setRfEdges, normalizeDirection, pushHistory],
  );

  /**
   * 改接已有边（2026-11-05 四轮，n8n 式）：直接抓一条边的任一端点拖到
   * 另一个手柄松手 → 替换该端点（改 source 或 target 视抓的是哪头）。
   * 方向仍按 x 归一；自环/与既有边重复时忽略本次改接（边保持原样）。
   * id 保留原值（mode/label 随边保留）—— 只换拓扑不改属性。
   */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      const { source, target } = newConn;
      if (!source || !target || source === target) return;
      const [from, to] = normalizeDirection(source, target);
      // 与其它既有边重复（排除自身）→ 改接后会出现两条同向边，拒
      const dup = rfEdges.some((e) => e.id !== oldEdge.id && e.source === from && e.target === to);
      if (dup) return;
      pushHistory();
      setRfEdges((eds) =>
        eds.map((e) => (e.id === oldEdge.id ? { ...e, source: from, target: to } : e)),
      );
      setErrors([]);
    },
    [rfEdges, normalizeDirection, setRfEdges, pushHistory],
  );

  /**
   * 连线拖拽开始：记起点（drop-to-connect 用）+ 清上一次错误。
   */
  const connectStartRef = useRef<{ nodeId: string | null; handleType: 'source' | 'target' | null } | null>(null);
  const onConnectStartCapture = useCallback<OnConnectStart>(
    (_event, params) => {
      connectStartRef.current = { nodeId: params.nodeId, handleType: params.handleType };
      setErrors([]);
    },
    [],
  );
  /**
   * 连线拖拽结束（2026-11-05 n8n 式 drop-to-connect）：松手时没有落在任何
   * 手柄上（命中手柄时 reactflow 已自行走 onConnect）→ 弹出「连接到…」
   * 浮层；选成员即"建节点 + 连线"一步完成。起点从 Start 回调的 ref 取。
   */
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const start = connectStartRef.current;
      connectStartRef.current = null;
      if (!start?.nodeId) return;
      // 松手点是否命中某个 Handle（命中则 reactflow 已自行 onConnect，跳过）
      const target = event.target as HTMLElement | null;
      if (target && (target.classList.contains('react-flow__handle') || target.closest?.('.react-flow__handle'))) {
        return;
      }
      const client =
        event instanceof MouseEvent
          ? { x: event.clientX, y: event.clientY }
          : {
              x: (event as TouchEvent).changedTouches?.[0]?.clientX ?? 0,
              y: (event as TouchEvent).changedTouches?.[0]?.clientY ?? 0,
            };
      setPendingConnection({
        source: start.nodeId,
        position: screenToFlowPosition(client),
        screen: client,
      });
    },
    [screenToFlowPosition],
  );

  /**
   * drop-to-connect 浮层（2026-11-05 四轮语义升级）：全员已在画布上，
   * 松手到空白 → 浮层选的是**画布上已有的节点**，点选即连线（不再建新节点）。
   * 方向按两节点 x 归一；拒自环/重复边。
   */
  const connectDroppedToAgent = useCallback(
    (agentId: string) => {
      if (!pendingConnection) return;
      const targetNode = rfNodes.find((n) => n.data.agentId === agentId);
      if (!targetNode || targetNode.id === pendingConnection.source) return;
      const [from, to] = normalizeDirection(pendingConnection.source, targetNode.id);
      pushHistory();
      setRfEdges((eds) => {
        if (eds.some((e) => e.source === from && e.target === to)) return eds;
        return [...eds, makeTeamEdge({ id: `${from}->${to}`, source: from, target: to })];
      });
      setPendingConnection(null);
      setErrors([]);
    },
    [pendingConnection, rfNodes, normalizeDirection, setRfEdges, pushHistory],
  );

  const selectedNodes = rfNodes.filter((n) => n.selected);
  const selectedEdges = rfEdges.filter((e) => e.selected);
  /** 边属性面板只针对单选的第一条边。 */
  const activeEdge = selectedEdges[0];
  const activeEdgeMode: TeamEdgeMode = activeEdge
    ? normalizeEdgeMode((activeEdge.data as { mode?: unknown } | undefined)?.mode)
    : 'direct';

  /** 切换边 mode（direct/approve），并同步虚线/警示色展示属性。三轮起入撤销栈。 */
  const setEdgeMode = useCallback(
    (edgeId: string, mode: TeamEdgeMode) => {
      pushHistory();
      setRfEdges((es) =>
        applyEdgeMode(es, edgeId, mode).map((e) =>
          // direct 时显式清掉 approve 的 className/style，避免残留虚线
          e.id === edgeId ? { ...e, className: undefined, style: undefined, ...edgeVisual(mode) } : e,
        ),
      );
      setErrors([]);
    },
    [setRfEdges, pushHistory],
  );

  const deleteSelected = useCallback(() => {
    const nodeIds = new Set(rfNodes.filter((n) => n.selected).map((n) => n.id));
    const edgeIds = new Set(rfEdges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    pushHistory();
    setRfNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
    // 节点删除连带清掉相连的边
    setRfEdges((es) =>
      es.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    );
    setErrors([]);
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges, pushHistory]);

  /**
   * 自动排列（2026-11-05 顺滑化）：最长路径分层（复用 TeamDagCanvas 纯函数，
   * 环安全）×列内行序，n8n 式从左到右整列排布 + fitView 收拢。三轮起入撤销栈。
   */
  const autoLayout = useCallback(() => {
    const wf = serialize();
    if (wf.nodes.length === 0) return;
    pushHistory();
    const cols = computeTeamDagColumns(wf);
    const buckets = new Map<number, string[]>();
    for (const n of wf.nodes) {
      const c = cols.get(n.id) ?? 0;
      const arr = buckets.get(c) ?? [];
      arr.push(n.id);
      buckets.set(c, arr);
    }
    const COL_GAP = 180;
    const ROW_GAP = 110;
    setRfNodes((ns) =>
      ns.map((n) => {
        const c = cols.get(n.id) ?? 0;
        const row = (buckets.get(c) ?? []).indexOf(n.id);
        return { ...n, position: { x: c * COL_GAP, y: row * ROW_GAP } };
      }),
    );
    setErrors([]);
    window.setTimeout(() => fitView({ padding: 0.18, duration: 320 }), 50);
  }, [serialize, setRfNodes, fitView, pushHistory]);

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

  // dirty 翻转上报（编辑器常驻后父组件据此显示「● 未保存」徽标）。
  const lastDirtyRef = useRef(dirty);
  useEffect(() => {
    if (lastDirtyRef.current !== dirty) {
      lastDirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [dirty, onDirtyChange]);

  /** 有未保存改动时取消需二次确认，避免误丢拓扑（NeoConfirmModal 弹窗化）。 */
  const handleCancel = useCallback(() => {
    if (dirty) {
      setDiscardAsk(true);
      return;
    }
    onCancel();
  }, [dirty, onCancel]);

  /**
   * 服务端干跑校验（2026-11-05 改版：不再有独立按钮）——保存成功后自动
   * best-effort 跑一遍 POST /dag/validate 校验服务端 yaml DAG。注意它校验的
   * 是 yaml members/edges_v1 模型，不是画布上的 workflow —— 结果仅作提示，
   * 不挡保存；Python JSON team 无 yaml 层时 404 TEAM_NOT_FOUND **静默**
   * （原「不适用」提示行对自动触发场景太吵）。
   */
  const runServerValidate = useCallback(async () => {
    setValidating(true);
    setValidateInfo('');
    try {
      const result = await validateTeamDag(teamId);
      if (result.ok) {
        setValidateInfo(
          t('neo.host.teamDagValidateOk', { defaultValue: '服务端 DAG 校验通过' }),
        );
      } else {
        setErrors(
          result.errors.length > 0
            ? result.errors
            : [t('neo.host.teamDagValidateFailed', { defaultValue: '服务端 DAG 校验未通过' })],
        );
      }
    } catch (err) {
      if (!(err instanceof TeamApiError && err.status === 404)) {
        setErrors(
          extractApiErrorLines(
            err,
            t('neo.host.teamDagValidateFailed', { defaultValue: '服务端 DAG 校验未通过' }),
          ),
        );
      }
    } finally {
      setValidating(false);
    }
  }, [teamId, t]);

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
    // 4. 自动干跑校验（2026-11-05：原独立「服务端校验」按钮收编为保存后的
    //    best-effort 附加动作，不阻塞/不影响保存结果；404 = 无 yaml 层，静默）
    void runServerValidate();
  }, [serialize, teamId, onSaved, t, runServerValidate]);

  /** 把一份 workflow 图整体铺进画布（AI 草稿用；映射与 seedNodes/seedEdges 同构）。 */
  const loadWorkflowToCanvas = useCallback(
    (wf: TeamWorkflow) => {
      setRfNodes(
        wf.nodes.map((n, i) => {
          const agentId = n.data?.agentId ?? '';
          return {
            id: n.id,
            type: 'teamAgent',
            position: n.position ?? { x: 0, y: i * 106 },
            data: {
              agentId,
              name: resolveNodeName(agentId, n.data?.name, n.id),
              soul: n.data?.soul ?? '',
              nodeType: n.type || 'agentTask',
              policyState: policyColorOf?.get(agentId) ?? null,
              ...resolveAvatar(agentId),
            },
          };
        }),
      );
      setRfEdges(
        wf.edges.map((e) => {
          const mode = normalizeEdgeMode(e.data?.mode);
          return makeTeamEdge({ id: e.id, source: e.source, target: e.target, label: e.label }, mode);
        }),
      );
    },
    [setRfNodes, setRfEdges, resolveNodeName, resolveAvatar, policyColorOf],
  );

  /** AI 生成草稿：NL → POST /dag-draft → dagDraftToWorkflow → 铺画布标脏（不落库）。 */
  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiErrors([]);
    try {
      const draft: TeamDagDraft = await generateTeamDagDraft(
        prompt,
        agents.map((a) => a.agent_id),
      );
      loadWorkflowToCanvas(dagDraftToWorkflow(draft, agents));
      pushHistory();
      setShowAiDraft(false);
      setAiPrompt('');
      setErrors([]);
      setValidateInfo('');
    } catch (err) {
      // 502 LLM_NO_KEY/LLM_FAILED、422 DAG_DRAFT_INVALID —— 面板内联回显，不关面板
      setAiErrors(
        extractApiErrorLines(err, t('neo.host.teamDagAiFailed', { defaultValue: '生成失败' })),
      );
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiBusy, agents, loadWorkflowToCanvas, t, pushHistory]);

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
      {validateInfo && (
        <div className="neo-team-dag-warn" data-testid="team-dag-validate-info">
          {validateInfo}
        </div>
      )}
      <div className="neo-team-dag-editor-canvas" ref={canvasRef}>
        <SfReactFlowBase
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          withProvider={false}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStartCapture}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          onPaneClick={closeOverlays}
          className="neo-team-dag"
          connectionMode={ConnectionMode.Loose}
          reactFlowProps={{
            deleteKeyCode: ['Delete', 'Backspace'],
            connectionLineType: ConnectionLineType.SmoothStep,
            connectionRadius: 28,
          }}
        >
          <Panel position="top-left" className="neo-team-dag-toolbar">
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={undoStack.length === 0 || saving}
              onClick={undo}
              title={t('neo.host.teamDagUndo', { defaultValue: '撤销（Ctrl+Z）' })}
              aria-label={t('neo.host.teamDagUndo', { defaultValue: '撤销（Ctrl+Z）' })}
              data-testid="team-dag-undo-btn"
            >
              <Undo2 size={13} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={redoStack.length === 0 || saving}
              onClick={redo}
              title={t('neo.host.teamDagRedo', { defaultValue: '重做（Ctrl+Y）' })}
              aria-label={t('neo.host.teamDagRedo', { defaultValue: '重做（Ctrl+Y）' })}
              data-testid="team-dag-redo-btn"
            >
              <Redo2 size={13} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={(selectedNodes.length === 0 && selectedEdges.length === 0) || saving}
              onClick={deleteSelected}
              title={t('neo.host.teamDagDelete', { defaultValue: '删除选中（Delete）' })}
              aria-label={t('neo.host.teamDagDelete', { defaultValue: '删除选中（Delete）' })}
              data-testid="team-dag-del-btn"
            >
              <Trash2 size={13} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className={`neo-team-dag-btn${showAiDraft ? ' is-active' : ''}`}
              disabled={saving || validating}
              onClick={() => {
                setShowAiDraft((v) => !v);
                setAiErrors([]);
              }}
              title={t('neo.host.teamDagAiGenerate', { defaultValue: 'AI 生成草稿' })}
              aria-label={t('neo.host.teamDagAiGenerate', { defaultValue: 'AI 生成草稿' })}
              data-testid="team-dag-ai-btn"
            >
              <Wand2 size={13} strokeWidth={1.9} />
            </button>
            <span className="neo-team-dag-hint">
              {t('neo.host.teamDagHint', { defaultValue: '拖手柄连线 · 抓边端点改接 · 松手到空白选目标 · 点边改模式' })}
            </span>
            <span className="neo-team-dag-toolbar-spacer" />
            {dirty && !saving && (
              <span className="neo-team-dag-dirty" data-testid="team-dag-dirty">
                {t('neo.host.teamDagDirty', { defaultValue: '● 未保存' })}
              </span>
            )}
            {/* 2026-11-05 四钮合一：右侧只留 [自动排列] [⋯] [保存]。
                版本历史/放弃修改收进 ⋯；服务端校验改为保存后自动干跑。 */}
            <button
              type="button"
              className="neo-team-dag-btn"
              disabled={saving || rfNodes.length === 0}
              onClick={autoLayout}
              title={t('neo.host.teamDagAutoLayout', { defaultValue: '自动排列（分层布局）' })}
              aria-label={t('neo.host.teamDagAutoLayout', { defaultValue: '自动排列（分层布局）' })}
              data-testid="team-dag-layout-btn"
            >
              <ListTree size={13} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className={`neo-team-dag-btn${menuOpen ? ' is-active' : ''}`}
              disabled={saving}
              onClick={() => setMenuOpen((v) => !v)}
              title={t('neo.host.teamDagMore', { defaultValue: '版本历史 / 放弃修改' })}
              aria-label={t('neo.host.teamDagMore', { defaultValue: '版本历史 / 放弃修改' })}
              aria-expanded={menuOpen}
              data-testid="team-dag-more-btn"
            >
              <MoreHorizontal size={14} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="neo-team-dag-btn neo-team-dag-btn--primary"
              disabled={saving}
              onClick={onSave}
              data-testid="team-dag-save-btn"
            >
              {saving
                ? t('neo.host.teamDagSaving', { defaultValue: '保存中…' })
                : t('neo.host.teamDagSave', { defaultValue: '保存' })}
            </button>
          </Panel>
          {/* ⋯ 溢出菜单：版本历史开关 + 放弃修改（原「取消」钮，dirty 时二次确认）。
              2026-11-05 二轮：从 top-right 移到工具条下方左上（right 语义让给
              边属性面板，避免两 Panel 重叠）；菜单位置由 CSS 类锚定工具条尾部。 */}
          {menuOpen && (
            <Panel position="top-left" className="neo-team-dag-menu-panel" data-testid="team-dag-menu-panel">
              <button
                type="button"
                className={`neo-team-dag-menu-item${showVersions ? ' is-active' : ''}`}
                onClick={() => setShowVersions((v) => !v)}
                data-testid="team-dag-versions-toggle"
              >
                {t('neo.host.teamDagVersions', { defaultValue: '版本历史' })}
              </button>
              <button
                type="button"
                className="neo-team-dag-menu-item neo-team-dag-menu-item--danger"
                disabled={!dirty || saving}
                onClick={handleCancel}
                data-testid="team-dag-cancel-btn"
              >
                {t('neo.host.teamDagDiscard', { defaultValue: '放弃修改' })}
              </button>
            </Panel>
          )}
          {showVersions && (
            <Panel position="bottom-right" className="neo-team-dag-versions-panel" data-testid="team-dag-versions-panel">
              <TeamWorkflowVersionsPanel
                teamId={teamId}
                refreshToken={versionsToken}
                onRestored={onSaved}
              />
            </Panel>
          )}
          {showAiDraft && (
            <Panel position="bottom-left" className="neo-team-dag-ai-panel" data-testid="team-dag-ai-panel">
              <div className="neo-team-dag-ai">
                <div className="neo-team-dag-versions-head">
                  <span className="neo-team-dag-versions-title">
                    {t('neo.host.teamDagAiTitle', { defaultValue: 'AI 生成草稿' })}
                  </span>
                </div>
                <textarea
                  className="neo-team-dag-ai-input"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={t('neo.host.teamDagAiPlaceholder', {
                    defaultValue: '一句话描述协作流程，如：研究员查资料 → 写手成稿 → 审校批准后发布',
                  })}
                  rows={3}
                  disabled={aiBusy}
                  data-testid="team-dag-ai-input"
                />
                {aiErrors.length > 0 && (
                  <div className="neo-team-dag-ai-errors" role="alert">
                    {aiErrors.map((e, i) => (
                      <div key={i} className="neo-team-dag-error-row">
                        {e}
                      </div>
                    ))}
                  </div>
                )}
                <div className="neo-team-dag-ai-actions">
                  <button
                    type="button"
                    className="neo-team-dag-btn neo-team-dag-btn--primary"
                    disabled={!aiPrompt.trim() || aiBusy}
                    onClick={handleAiGenerate}
                    data-testid="team-dag-ai-submit"
                  >
                    {aiBusy
                      ? t('neo.host.teamDagAiBusy', { defaultValue: '生成中…' })
                      : t('neo.host.teamDagAiSubmit', { defaultValue: '生成草稿' })}
                  </button>
                  <button
                    type="button"
                    className="neo-team-dag-btn"
                    disabled={aiBusy}
                    onClick={() => {
                      setShowAiDraft(false);
                      setAiErrors([]);
                    }}
                    data-testid="team-dag-ai-cancel"
                  >
                    {t('neo.host.teamDagCancel', { defaultValue: '取消' })}
                  </button>
                </div>
                <div className="neo-team-dag-edge-hint">
                  {t('neo.host.teamDagAiHint', {
                    defaultValue: '草稿只进画布不落库，确认后点「保存」',
                  })}
                </div>
              </div>
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
          {/* 空图引导（2026-11-05 三轮）：TeamPanel 空工作流时也渲染编辑器
              （修死胡同），首节点引导放画布中央；有节点后自动消失。 */}
          {rfNodes.length === 0 && (
            <Panel position="top-left" className="neo-team-dag-empty-hint" data-testid="team-dag-empty-hint">
              <span>
                {t('neo.host.teamDagEmptyHint', {
                  defaultValue: '团队成员已就位 —— 从节点手柄拖线连接，或用「AI 生成」一键编排',
                })}
              </span>
            </Panel>
          )}
          {/* n8n 式 drop-to-connect（四轮语义）：全员已在画布，拖线松手到空白
              → 浮层选一个**已有节点**连线。定位：屏幕坐标 − 画布容器原点
              （Panel 是容器内绝对定位，用 flow 坐标会在缩放/平移后错位）。 */}
          {pendingConnection && (
            <Panel
              position="top-left"
              className="neo-team-dag-drop-panel"
              style={(() => {
                const rect = canvasRef.current?.getBoundingClientRect();
                const left = rect ? pendingConnection.screen.x - rect.left : pendingConnection.screen.x;
                const top = rect ? pendingConnection.screen.y - rect.top : pendingConnection.screen.y;
                return { left: Math.max(0, left), top: Math.max(0, top) };
              })()}
              data-testid="team-dag-drop-panel"
            >
              <div className="neo-team-dag-versions-head">
                <span className="neo-team-dag-versions-title">
                  {t('neo.host.teamDagDropTitle', { defaultValue: '连接到…' })}
                </span>
              </div>
              <div className="neo-team-dag-drop-list">
                {rfNodes
                  .filter((n) => n.id !== pendingConnection.source)
                  .map((n) => {
                    const already = rfEdges.some(
                      (e) =>
                        (e.source === pendingConnection.source && e.target === n.id) ||
                        (e.source === n.id && e.target === pendingConnection.source),
                    );
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className="neo-team-dag-drop-item"
                        onClick={() => connectDroppedToAgent(n.data.agentId)}
                        disabled={already}
                        title={already ? '已连接' : undefined}
                        data-testid={`team-dag-drop-item-${n.data.agentId}`}
                      >
                        <span className="neo-team-dag-drop-avatar">
                          <AgentAvatar
                            name={n.data.name}
                            style={n.data.avatarStyle}
                            seed={n.data.avatarSeed ?? n.data.name}
                            image={n.data.avatarImage ?? null}
                            size={20}
                          />
                        </span>
                        <span className="neo-team-dag-drop-name">{n.data.name}</span>
                      </button>
                    );
                  })}
              </div>
              <button
                type="button"
                className="neo-team-dag-drop-item neo-team-dag-drop-item--cancel"
                onClick={() => setPendingConnection(null)}
                data-testid="team-dag-drop-cancel"
              >
                {t('neo.host.teamDagDropCancel', { defaultValue: '取消连接' })}
              </button>
            </Panel>
          )}
        </SfReactFlowBase>
      </div>

      {/* 放弃未保存修改确认弹窗（2026-11-04 用户反馈批，替换 window.confirm） */}
      {discardAsk && (
        <NeoConfirmModal
          title={t('neo.host.teamDagDiscardTitle', { defaultValue: '放弃修改' })}
          message={t('neo.host.teamDagDiscardConfirm', {
            defaultValue: '有未保存的 DAG 修改，确定放弃吗？',
          })}
          confirmLabel={t('common.confirm', { defaultValue: '确定' })}
          onConfirm={() => {
            setDiscardAsk(false);
            onCancel();
          }}
          onClose={() => setDiscardAsk(false)}
        />
      )}
    </div>
  );
}

export default TeamDagEditor;
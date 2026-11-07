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
 *   - 连线增删：ConnectionMode.Loose（任意手柄都能拉线/接线），方向 =
 *     交接语义（拖拽方向，起手在入口手柄时按 n8n 语义调换；2026-11-07 起
 *     不再按 x 坐标翻转 —— 翻转让「驳回回炉」回边永远画不对），圆角
 *     smoothstep 边；逆向回边走上方 U 形回弧（teamDagGeometry），
 *     不再穿节点身体/与顺向边叠线；删除：选中后 Delete/Backspace 或
 *     「删除选中」（连带清掉相连的边）
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
 * 2026-11-07 顺手化改版（用户反馈「dag 太乱，连接/删除不顺手」）：
 *   - 初始布局：退化竖列（缺坐标 / 全挤一条 x 窄带）自动分层展开成左→右
 *     流水线（computeTeamDagSeedLayout），边不再绕大圈；展开不算脏
 *   - 删边/删节点：自定义 smoothstep 边药丸「×」一键删边、节点角「×」一键
 *     删节点（连带清边）、边属性面板「删除此边」、Delete/Backspace 全部入
 *     撤销栈；边隐形命中区加宽到 28px，细线好点选
 *   - 连线手柄：10px 圆点、节点 hover 放大、拖线中 valid/connecting 高亮
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  BaseEdge,
  EdgeLabelRenderer,
  type Connection,
  type Node,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
  type OnConnectStart,
  type OnConnectEnd,
} from 'reactflow';
import { ListTree, MoreHorizontal, Redo2, Trash2, Undo2, Wand2, X } from 'lucide-react';
import SfReactFlowBase from '../../core/components/Canvas/SfReactFlowBase';
import {
  putTeamWorkflow,
  putTeamDagLayout,
  listTeamWorkflowVersions,
  restoreTeamWorkflowVersion,
  branchTeamWorkflow,
  generateTeamDagDraft,
  confirmTeamPlan,
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
import { computeTeamDagEdgePath, resolveConnectDirection } from './teamDagGeometry';
import { computeTeamDagColumns, computeTeamDagSeedLayout } from './TeamDagCanvas';
import { dagDraftToWorkflow } from './teamDagDraft';
import { POLICY_COLOR, edgeVisualFor, lookupPairPolicy, type EdgeVisual } from './teamPolicyVisual';
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
   * 2026-11-06 边线策略联动：成员对无向键 → 策略态（可选，
   * TeamPanel 用 buildPairPolicyColor 从矩阵草稿构造）。命中时边线随
   * 策略染色（允许绿/警告琥珀/拒绝红加粗），与协作策略矩阵即时呼应
   * （草稿态即反映，不需保存）。
   */
  pairPolicy?: Map<string, PolicyCellState> | null;
  /**
   * 2026-11-04 编辑器常驻（TeamPanel 工作流 section 不再有「编辑」开关）：
   * dirty 翻转时上报父组件，驱动 section 头部「● 未保存」徽标。可选，
   * 不传时内部脏检查照常工作（取消确认仍用内部 dirty）。
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export interface TeamAgentNodeData extends Record<string, unknown> {
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

/** 节点/边手柄改用 .neo-team-dag-handle 类样式（2026-11-07：hover 放大、连线高亮）。 */

const NODE_TYPES: NodeTypes = { teamAgent: TeamAgentNode };

/**
 * 边级/节点级删除回调（2026-11-07「删除不顺手」修复）：编辑器把删除动作
 * 经 context 注入自定义边的「×」钮与节点角上的「×」钮 —— 一键删除、入撤销栈，
 * 不必先精准点中再按 Delete。
 */
export interface TeamDagActions {
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
}
export const TeamDagActionCtx = createContext<TeamDagActions | null>(null);

/**
 * 自定义 smoothstep 边（2026-11-07「DAG 太乱/不好删」修复），注册为全局
 * smoothstep 类型 —— makeTeamEdge/onConnect/onReconnect 建的边全部走这里：
 *   - BaseEdge interactionWidth=28：线细难点中，加宽隐形命中区，点选容易
 *   - 路径几何走 teamDagGeometry.computeTeamDagEdgePath：逆向回边（送审/
 *     驳回回炉互逆边对里的反向那条）走上方 U 形回弧，不再退化成穿过节点
 *     身体的水平直线、不再与顺向边叠线（叠线时两颗「×」药丸同点堆叠，
 *     删一条还剩一条 = 「删除后边还在」）
 *   - EdgeLabelRenderer 药丸：label 文字 + 「×」一键删边（nodrag/nopan，
 *     不触发节点拖拽/画布平移）；无 label 的审批边补「审批」二字，直接边
 *     只留 × 圆钮；选中时药丸高亮
 *   - 虚线/approve、conditional 强调虚线与策略染色仍走 edge.className/style
 */
export function TeamDagEdge(props: EdgeProps) {
  const actions = useContext(TeamDagActionCtx);
  const { path, labelX, labelY } = computeTeamDagEdgePath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  const mode = normalizeEdgeMode((props.data as { mode?: unknown } | undefined)?.mode);
  const label = typeof props.label === 'string' && props.label ? props.label : mode === 'approve' ? '审批' : '';
  return (
    <>
      <BaseEdge path={path} markerEnd={props.markerEnd} style={props.style} interactionWidth={28} />
      <EdgeLabelRenderer>
        <div
          className={`neo-team-dag-edge-chip${props.selected ? ' is-selected' : ''}${label ? '' : ' is-icon-only'}${mode === 'approve' ? ' is-approve' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          {label && <span className="neo-team-dag-edge-chip-label">{label}</span>}
          <button
            type="button"
            className="neo-team-dag-edge-chip-del nodrag nopan"
            title="删除此边"
            aria-label="删除此边"
            data-testid={`team-dag-edge-del-${props.id}`}
            onClick={(e) => {
              e.stopPropagation();
              actions?.deleteEdge(props.id);
            }}
          >
            <X size={10} strokeWidth={2.6} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const TEAM_EDGE_TYPES: EdgeTypes = { smoothstep: TeamDagEdge };

/** approve 边的虚线 CSS 标记（颜色由 edge.style.stroke 控制，箭头色随动）。 */
const APPROVE_EDGE_CLASS = 'neo-team-dag-edge--approve';
/** conditional（驳回回炉/条件回边）的强调虚线 CSS 标记（与只读画布同语义）。 */
const CONDITIONAL_EDGE_CLASS = 'neo-team-dag-edge--conditional';

/**
 * 按 mode × 成员对策略生成边的展示属性（2026-11-06 策略联动）：
 * 策略色优先（允许绿/警告琥珀/拒绝红加粗），approve/conditional 虚线形态保留；
 * 无策略时沿用 mode 视觉（approve 警示虚线 / conditional 强调虚线，direct 默认实线）。
 */
function edgeVisual(mode: TeamEdgeMode, policy?: PolicyCellState | null): EdgeVisual {
  return edgeVisualFor(mode, policy, APPROVE_EDGE_CLASS, CONDITIONAL_EDGE_CLASS);
}

/**
 * 统一建边工厂（2026-11-05 顺滑化）：smoothstep + 14px 圆角（n8n 式柔和
 * 折线，直角太生硬），mode 视觉随动。seed/load/onConnect/drop-connect 四处
 * 建边共用，保证观感一致。
 * 2026-11-05 四轮：reconnectable —— 直接抓线的端点拖到别的手柄即可改接
 * （n8n 式改连），配合 onReconnect 完成端点替换。
 * 2026-11-06：可选 policyState —— 成员对策略命中时边线随策略染色。
 */
function makeTeamEdge(
  base: { id: string; source: string; target: string; label?: string },
  mode: TeamEdgeMode = 'direct',
  policyState?: PolicyCellState | null,
): Edge {
  return {
    ...base,
    type: 'smoothstep',
    pathOptions: { borderRadius: 14 },
    reconnectable: true,
    data: { mode },
    ...edgeVisual(mode, policyState),
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
/** 策略态 → 节点描边色（与 TeamDagCanvas / 策略矩阵配色一致；真源在 teamPolicyVisual）。 */
const POLICY_NODE_COLOR = POLICY_COLOR;

export function TeamAgentNode({ data, id }: { data: TeamAgentNodeData; id?: string }) {
  const actions = useContext(TeamDagActionCtx);
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
      {/* 手柄 id（2026-11-07）：'in'/'out' 供 resolveConnectDirection 识别
          拖拽语义方向（从入口手柄起手 = 在画反向边） */}
      <Handle type="target" position={Position.Left} id="in" className="neo-team-dag-handle" />
      {/* 节点角「×」（2026-11-07）：hover 显现，一键删节点（连带清边），nodrag 防误拖 */}
      {actions && (
        <button
          type="button"
          className="neo-team-dag-node-del nodrag"
          title="删除节点（连带删除相连的边）"
          aria-label="删除节点（连带删除相连的边）"
          data-testid={`team-dag-node-del-${id ?? data.agentId}`}
          onClick={(e) => {
            e.stopPropagation();
            actions.deleteNode(id ?? data.agentId);
          }}
        >
          <X size={11} strokeWidth={2.4} />
        </button>
      )}
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
      <Handle type="source" position={Position.Right} id="out" className="neo-team-dag-handle" />
    </div>
  );
}

/**
 * roster 孤点投影（2026-11-07「成员增加后 DAG 里没有新成员」修复）：把当前
 * 画布上还没有节点的 roster 成员补成孤点节点（id 规则 n-<agentId>，与
 * seedNodes/addAgentNode 同构），网格排在既有节点下方（4 列，130×110，
 * baseY = 最低节点 y + 120）。
 *
 * 背景：useNodesState 只吃初始值 —— 编辑器常驻（TeamPanel 只在保存/取消时
 * 重挂）后 roster 增员的 agents 变更到不了画布。seed 与增员同步共用本函数，
 * 铺出来的孤点两处同构。纯函数（policyColorOf 只影响描边），vitest 可直测。
 */
export function makeRosterOrphanNodes(
  agents: AgentRecord[],
  existing: Array<{ position: { x: number; y: number }; data: { agentId: string } }>,
  policyColorOf?: Map<string, PolicyCellState> | null,
): Node<TeamAgentNodeData>[] {
  const placed = new Set(existing.map((n) => n.data.agentId).filter(Boolean));
  const missing = agents.filter((a) => !placed.has(a.agent_id));
  const baseY = existing.reduce((m, n) => Math.max(m, n.position.y + 120), 0);
  const GRID_COL = 4;
  const CELL_W = 130;
  const CELL_H = 110;
  return missing.map((a, i) => ({
    id: `n-${a.agent_id}`,
    type: 'teamAgent',
    position: { x: (i % GRID_COL) * CELL_W, y: baseY + Math.floor(i / GRID_COL) * CELL_H },
    data: {
      agentId: a.agent_id,
      name: a.name,
      soul: a.soul ?? '',
      nodeType: 'agentTask',
      policyState: policyColorOf?.get(a.agent_id) ?? null,
      avatarStyle: a.avatar_style,
      avatarSeed: a.avatar_seed ?? a.name,
      avatarImage: a.avatar_image ?? null,
    },
  }));
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

/** rfNode → workflow 节点（serialize 与脏检查基线共用，防两处口径漂移）。 */
function serializeNode(n: Node<TeamAgentNodeData>): TeamWorkflow['nodes'][number] {
  return {
    id: n.id,
    type: n.data.nodeType,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: { agentId: n.data.agentId, name: n.data.name, soul: n.data.soul },
  };
}

/** rfEdge → workflow 边（同上共用）。 */
function serializeEdge(e: Edge): TeamWorkflow['edges'][number] {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    data: { mode: normalizeEdgeMode((e.data as { mode?: unknown } | undefined)?.mode) },
    ...(e.label ? { label: String(e.label) } : {}),
  };
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

function TeamDagEditorInner({ teamId, workflow, agents, onSaved, onCancel, policyColorOf, pairPolicy, onDirtyChange }: TeamDagEditorProps) {
  const { t } = useI18n();

  // 放弃未保存修改的二次确认（2026-11-04 用户反馈批）：window.confirm 原生框
  // 替换为 NeoConfirmModal（dirty 时点「取消」先弹此窗）。
  const [discardAsk, setDiscardAsk] = useState(false);

  /**
   * roster 同步的两个防误伤 ref（2026-11-07，非渲染态）：
   *   - removedAgentsRef：用户主动 ×/Delete 删掉的成员，本会话不再自动铺回
   *   - rosterOrphansRef：roster 同步补出的孤点 id，只有这些在成员离队时才回收
   */
  const removedAgentsRef = useRef<Set<string>>(new Set());
  const rosterOrphansRef = useRef<Set<string>>(new Set());

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

  /** nodeId → agentId（策略查询用；画布外无 roster 归属时返回 ''）。 */
  const agentOfNode = useCallback(
    (nodeId: string): string => {
      const n = workflow.nodes.find((w) => w.id === nodeId);
      if (n?.data?.agentId) return n.data.agentId;
      // 孤儿节点（roster 铺开的 n-${agent_id}）与新增节点（n-${agent_id} 同构）
      if (nodeId.startsWith('n-')) return nodeId.slice(2);
      return agents.find((a) => a.agent_id === nodeId)?.agent_id ?? '';
    },
    [workflow, agents],
  );

  /** 边（nodeId 对）→ 成员对策略态；pairPolicy 未传时恒 null。 */
  const edgePolicy = useCallback(
    (source: string, target: string): PolicyCellState | null => {
      if (!pairPolicy) return null;
      return lookupPairPolicy(pairPolicy, agentOfNode(source), agentOfNode(target));
    },
    [pairPolicy, agentOfNode],
  );

  /**
   * n8n 式初始排布（2026-11-05 四轮，用户反馈）：团队 roster 全员以孤立点
   * 铺在画布上，用户直接拖手柄连线即可 —— 不再需要「+ 添加成员」入口。
   * workflow 已有的节点按存量坐标铺；roster 里没上画布的成员补成孤立点，
   * 网格排布在既有节点下方（4 列，120×110 间距）。id 规则 n-<agentId> 与
   * addAgentNode 一致，保存后即为持久坐标。
   * 2026-11-07「DAG 太乱」修复：存量坐标经 computeTeamDagSeedLayout 决策 ——
   * 缺坐标/退化竖列自动分层展开（左→右流水线），有真实布局才原样保留。
   */
  const seedNodes = useMemo<Node<TeamAgentNodeData>[]>(() => {
    const seedPos = computeTeamDagSeedLayout(workflow);
    const placed: Node<TeamAgentNodeData>[] = workflow.nodes.map((n) => {
      const agentId = n.data?.agentId ?? '';
      return {
        id: n.id,
        type: 'teamAgent',
        // 退化布局（全挤一条竖列）时分层展开，避免边绕成大圈
        position: seedPos.get(n.id) ?? { x: 0, y: 0 },
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
    // roster 里没上画布的成员补成孤立点（与增员同步共用 makeRosterOrphanNodes）
    const orphans = makeRosterOrphanNodes(agents, placed, policyColorOf);
    return [...placed, ...orphans];
  }, [workflow, agents, resolveNodeName, resolveAvatar, policyColorOf]);
  const seedEdges = useMemo<Edge[]>(
    () =>
      workflow.edges.map((e) => {
        const mode = normalizeEdgeMode(e.data?.mode);
        return makeTeamEdge(
          { id: e.id, source: e.source, target: e.target, label: e.label },
          mode,
          edgePolicy(e.source, e.target),
        );
      }),
    [workflow, edgePolicy],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<TeamAgentNodeData>(seedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(seedEdges);

  /** 序列化画布 → TeamWorkflow（保存 payload 与撤销快照同构）。 */
  const serialize = useCallback((): TeamWorkflow => {
    return {
      nodes: rfNodes.map(serializeNode),
      edges: rfEdges.map(serializeEdge),
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
          return makeTeamEdge({ id: e.id, source: e.source, target: e.target, label: e.label }, mode, edgePolicy(e.source, e.target));
        }),
      );
      suppressHistoryRef.current = false;
    },
    [setRfNodes, setRfEdges, resolveNodeName, resolveAvatar, policyColorOf, edgePolicy],
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

  const deleteSelected = useCallback(() => {
    const nodeIds = new Set(rfNodes.filter((n) => n.selected).map((n) => n.id));
    const edgeIds = new Set(rfEdges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    pushHistory();
    // 记入 removedAgentsRef：roster 同步不得把用户刚删掉的成员再铺回画布
    for (const n of rfNodes) {
      if (nodeIds.has(n.id) && n.data.agentId) removedAgentsRef.current.add(n.data.agentId);
    }
    setRfNodes((ns) => ns.filter((n) => !nodeIds.has(n.id)));
    // 节点删除连带清掉相连的边
    setRfEdges((es) =>
      es.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    );
    setErrors([]);
  }, [rfNodes, rfEdges, setRfNodes, setRfEdges, pushHistory]);

  /**
   * 单边删除（2026-11-07）：自定义边药丸「×」与边属性面板「删除此边」共用，
   * 入撤销栈。边点不准是高频痛点 —— 现在不必先精准选中再按 Delete。
   */
  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      if (!rfEdges.some((e) => e.id === edgeId)) return;
      pushHistory();
      setRfEdges((es) => es.filter((e) => e.id !== edgeId));
      setErrors([]);
    },
    [rfEdges, setRfEdges, pushHistory],
  );

  /** 单节点删除：节点角「×」用，连带清掉相连的边，入撤销栈。 */
  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const target = rfNodes.find((n) => n.id === nodeId);
      if (!target) return;
      pushHistory();
      if (target.data.agentId) removedAgentsRef.current.add(target.data.agentId);
      setRfNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setRfEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setErrors([]);
    },
    [rfNodes, setRfNodes, setRfEdges, pushHistory],
  );

  /** 注入自定义边/节点「×」钮的删除动作（memo 防止 context 高频重渲）。 */
  const dagActions = useMemo<TeamDagActions>(
    () => ({ deleteEdge: deleteEdgeById, deleteNode: deleteNodeById }),
    [deleteEdgeById, deleteNodeById],
  );

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
  // 2026-11-07：Delete/Backspace 删除选中也收编进来（走 deleteSelected 入撤销栈，
  // 替代 reactflow 内置 deleteKeyCode 的无痕删除）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) {
        // 纯 Delete/Backspace（无修饰键）→ 删除选中
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) {
          const el = e.target as HTMLElement | null;
          if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
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
  }, [undo, redo, deleteSelected]);

  // 添加候选逻辑已随「+ 添加成员」下拉移除（2026-11-05 四轮）：roster 全员
  // 由 seedNodes 直接铺成孤立点，无需再挑人添加。

  /**
   * 连线方向（2026-11-07「边连接还是奇怪」修复）：边方向 = 交接语义
   * （source 产出交给 target），走 teamDagGeometry.resolveConnectDirection
   * —— 拖拽方向即语义方向，只在「从入口手柄起手、落到出口手柄」时调换。
   * 此前按 x 坐标翻转：「驳回回炉」这类逆向边永远画不出来（方向被静默
   * 改写成顺向、撞重复边被丢弃），互逆边对也被压成同向重复。
   */
  const onConnect = useCallback(
    (rawConn: Connection) => {
      const { source, target, sourceHandle, targetHandle } = rawConn;
      if (!source || !target || source === target) return;
      const [from, to] = resolveConnectDirection(source, target, sourceHandle, targetHandle);
      pushHistory();
      setRfEdges((eds) => {
        if (eds.some((e) => e.source === from && e.target === to)) return eds;
        return addEdge(makeTeamEdge({ id: `${from}->${to}`, source: from, target: to }, 'direct', edgePolicy(from, to)), eds);
      });
      setErrors([]);
    },
    [setRfEdges, pushHistory, edgePolicy],
  );

  /**
   * 改接已有边（2026-11-05 四轮，n8n 式）：直接抓一条边的任一端点拖到
   * 另一个手柄松手 → 替换该端点（改 source 或 target 视抓的是哪头）。
   * 2026-11-07 起保持边的语义方向（source 侧仍是 source 侧），不做 x 翻转；
   * 自环/与既有同向边重复时忽略本次改接（边保持原样）。
   * id 保留原值（mode/label 随边保留）—— 只换拓扑不改属性。
   */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      const { source, target } = newConn;
      if (!source || !target || source === target) return;
      // 与其它既有同向边重复（排除自身）→ 改接后出现两条同源同宿边，拒
      const dup = rfEdges.some((e) => e.id !== oldEdge.id && e.source === source && e.target === target);
      if (dup) return;
      pushHistory();
      setRfEdges((eds) =>
        eds.map((e) => (e.id === oldEdge.id ? { ...e, source, target } : e)),
      );
      setErrors([]);
    },
    [rfEdges, setRfEdges, pushHistory],
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
   * 方向 = 拖拽语义（从哪只手柄拉出 = 上游，2026-11-07 起不做 x 翻转）；
   * 拒自环/同向重复边（反向边合法：送审/驳回回炉互逆边对）。
   */
  const connectDroppedToAgent = useCallback(
    (agentId: string) => {
      if (!pendingConnection) return;
      const targetNode = rfNodes.find((n) => n.data.agentId === agentId);
      if (!targetNode || targetNode.id === pendingConnection.source) return;
      const from = pendingConnection.source;
      const to = targetNode.id;
      pushHistory();
      setRfEdges((eds) => {
        if (eds.some((e) => e.source === from && e.target === to)) return eds;
        return [...eds, makeTeamEdge({ id: `${from}->${to}`, source: from, target: to }, 'direct', edgePolicy(from, to))];
      });
      setPendingConnection(null);
      setErrors([]);
    },
    [pendingConnection, rfNodes, setRfEdges, pushHistory, edgePolicy],
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
          // direct 时显式清掉 approve 的 className/style，避免残留虚线；
          // 策略色经 edgeVisual(mode, edgePolicy) 保留（策略命中时不清色）。
          e.id === edgeId
            ? { ...e, className: undefined, style: undefined, ...edgeVisual(mode, edgePolicy(e.source, e.target)) }
            : e,
        ),
      );
      setErrors([]);
    },
    [setRfEdges, pushHistory, edgePolicy],
  );

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
   * 脏检查基线（2026-11-07 两改）：与 serialize 同构的 TeamWorkflow 快照，
   * 未做任何编辑时 dirty 必须为 false。
   *   ① 从 seedNodes/seedEdges 派生而非 workflow 原文 —— 退化竖列分层展开、
   *      孤点直铺都发生在 seed 阶段，「铺画布」不算用户修改；
   *   ② 改为 state 而非 useMemo —— roster 增员同步（下方 effect）与画布
   *      **同批**增删基线，同步不误报「● 未保存」；workflow prop 中途变化
   *      也不会再让基线与画布失配（useMemo 版会假性报脏）。
   */
  const [baseline, setBaseline] = useState<TeamWorkflow>(() => ({
    nodes: seedNodes.map(serializeNode),
    edges: seedEdges.map(serializeEdge),
  }));

  const dirty = useMemo(
    () => JSON.stringify(serialize()) !== JSON.stringify(baseline),
    [serialize, baseline],
  );

  // dirty 翻转上报（编辑器常驻后父组件据此显示「● 未保存」徽标）。
  const lastDirtyRef = useRef(dirty);
  useEffect(() => {
    if (lastDirtyRef.current !== dirty) {
      lastDirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [dirty, onDirtyChange]);

  /**
   * 策略联动实时投影（2026-11-06）。
   *
   * 关键背景：useNodesState/useEdgesState 只吃初始值 —— 2026-11-04 编辑器
   * 常驻化后 TeamPanel 不再重挂编辑器（workflowStateKey 只在保存/取消时递增），
   * policyColorOf 随矩阵草稿变化的更新从此到不了画布，节点描边联动实际已
   * 静默失效；边线联动（本次新增 pairPolicy）同理会失效。此 effect 监听
   * 两张策略表变化，就地把现有节点/边的策略展示字段重投影：不动 position、
   * selected、data.mode 等一切编辑态（与拖拽/撤销栈零交互），纯视觉。
   */
  useEffect(() => {
    setRfNodes((ns) =>
      ns.map((n) => {
        const next = policyColorOf?.get(n.data.agentId) ?? null;
        return n.data.policyState === next ? n : { ...n, data: { ...n.data, policyState: next } };
      }),
    );
    setRfEdges((es) =>
      es.map((e) => {
        const mode = normalizeEdgeMode((e.data as { mode?: unknown } | undefined)?.mode);
        const visual = edgeVisual(mode, edgePolicy(e.source, e.target));
        return e.className === visual.className && JSON.stringify(e.style) === JSON.stringify(visual.style)
          ? e
          : { ...e, className: visual.className, style: visual.style };
      }),
    );
  }, [policyColorOf, pairPolicy, edgePolicy, setRfNodes, setRfEdges]);

  /**
   * roster 增员同步（2026-11-07「成员增加后 DAG 里没有新成员」修复）。
   *
   * 背景：useNodesState 只吃初始值，而编辑器常驻（TeamPanel 仅在保存/取消
   * 时重挂）——成员管理里加人后 agents prop 更新了，画布却永远见不到新成员。
   * 此 effect 把「画布上还没有节点的 roster 成员」补成孤点（与 seed 同构的
   * makeRosterOrphanNodes），并把基线同批更新（铺画布不算脏）；补人后
   * fitView 收拢视口，让新成员直接可见。防误伤守卫见组件顶部两个 ref。
   */
  useEffect(() => {
    const additions = makeRosterOrphanNodes(
      agents.filter((a) => !removedAgentsRef.current.has(a.agent_id)),
      rfNodes.map((n) => ({ position: n.position, data: { agentId: n.data.agentId } })),
      policyColorOf,
    );
    const rosterIds = new Set(agents.map((a) => a.agent_id));
    const connected = new Set(rfEdges.flatMap((e) => [e.source, e.target]));
    const removals = [...rosterOrphansRef.current].filter((id) => {
      const n = rfNodes.find((r) => r.id === id);
      return !!n && !rosterIds.has(n.data.agentId) && !connected.has(id);
    });
    if (additions.length === 0 && removals.length === 0) return;

    for (const n of additions) rosterOrphansRef.current.add(n.id);
    for (const id of removals) rosterOrphansRef.current.delete(id);
    const removeSet = new Set(removals);
    setRfNodes((ns) => [...ns.filter((n) => !removeSet.has(n.id)), ...additions]);
    // 基线同批增删：roster 同步是外部数据对齐，不是用户修改，不误报未保存
    setBaseline((b) => ({
      nodes: [...b.nodes.filter((n) => !removeSet.has(n.id)), ...additions.map(serializeNode)],
      edges: b.edges,
    }));
    if (additions.length > 0) {
      window.setTimeout(() => fitView({ padding: 0.18, duration: 320 }), 50);
    }
  }, [agents, rfNodes, rfEdges, policyColorOf, setRfNodes, fitView]);

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
    // T05① — 保存成功 = 用户确认了计划（"随后'确认'写入"）→ 确认放行执行门。
    // best-effort：无计划（纯手工编辑）时 404 静默，不影响保存结果。
    void confirmTeamPlan(teamId).catch(() => {});
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
          return makeTeamEdge({ id: e.id, source: e.source, target: e.target, label: e.label }, mode, edgePolicy(e.source, e.target));
        }),
      );
    },
    [setRfNodes, setRfEdges, resolveNodeName, resolveAvatar, policyColorOf, edgePolicy],
  );

  /** AI 生成草稿：NL → POST /dag-draft → dagDraftToWorkflow → 铺画布标脏（不落库）。 */
  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiErrors([]);
    try {
      // T05① — 传 teamId：生成成功即把草稿挂为该团队 pending 计划（未确认前
      // 执行侧不启动执行节点；保存成功 = 确认放行，见 onSave）。
      const draft: TeamDagDraft = await generateTeamDagDraft(
        prompt,
        agents.map((a) => a.agent_id),
        teamId,
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
  }, [aiPrompt, aiBusy, agents, teamId, loadWorkflowToCanvas, t, pushHistory]);

  return (
    <TeamDagActionCtx.Provider value={dagActions}>
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
          edgeTypes={TEAM_EDGE_TYPES}
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
              {t('neo.host.teamDagHint', { defaultValue: '拖手柄连线 · 点 × 删边/删节点 · 抓边端点改接 · 点边改模式' })}
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
                {/* 显示成员名而非裸 node id（2026-11-07）：id 在面板里没法认人 */}
                {rfNodes.find((n) => n.id === activeEdge.source)?.data.name ?? activeEdge.source}
                {' → '}
                {rfNodes.find((n) => n.id === activeEdge.target)?.data.name ?? activeEdge.target}
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
                <button
                  type="button"
                  className={`neo-team-dag-edge-mode-btn neo-team-dag-edge-mode-btn--conditional${activeEdgeMode === 'conditional' ? ' is-active' : ''}`}
                  onClick={() => setEdgeMode(activeEdge.id, 'conditional')}
                  data-testid="team-dag-edge-mode-conditional"
                >
                  {t('neo.host.teamDagEdgeModeConditional', { defaultValue: '条件回流' })}
                </button>
              </div>
              <div className="neo-team-dag-edge-hint">
                {activeEdgeMode === 'approve'
                  ? t('neo.host.teamDagEdgeApproveHint', {
                      defaultValue: '审批边：结果流转前需人工确认（L6 审批门）',
                    })
                  : activeEdgeMode === 'conditional'
                    ? t('neo.host.teamDagEdgeConditionalHint', {
                        defaultValue: '条件边（驳回回炉）：按条件退回上游重做，不参与顺序环检测',
                      })
                    : t('neo.host.teamDagEdgeDirectHint', {
                        defaultValue: '直接边：上游完成后自动流转到下游',
                      })}
              </div>
              <button
                type="button"
                className="neo-team-dag-btn neo-team-dag-edge-del-btn"
                onClick={() => deleteEdgeById(activeEdge.id)}
                data-testid="team-dag-edge-del-btn"
              >
                <Trash2 size={12} strokeWidth={1.9} />
                {t('neo.host.teamDagEdgeDelete', { defaultValue: '删除此边' })}
              </button>
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
                    // 同向已有边才禁选（2026-11-07）：反向边合法（送审/驳回
                    // 回炉互逆边对），不能把「连到上游」的回边入口堵死
                    const already = rfEdges.some(
                      (e) => e.source === pendingConnection.source && e.target === n.id,
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
    </TeamDagActionCtx.Provider>
  );
}

export default TeamDagEditor;
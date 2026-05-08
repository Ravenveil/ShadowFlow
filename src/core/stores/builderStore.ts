/**
 * Builder 统一状态 — Story 8.3 (AC2, AC6)
 *
 * 双状态层：
 *   blueprint state  → source of truth（用户编辑的 Builder 语义状态）
 *   graph projection → 从 blueprint 派生的画布节点/边（memoized selector）
 *
 * 不在 render 时临时拼装 nodes/edges，而是在 store action 里更新 blueprint，
 * 画布从派生选择器中读取投影。
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AgentBlueprint, BuilderSmokeRunResponse, ExecutionMode, KnowledgeBinding, RoleProfile, ToolPolicy } from '../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Scene Projection 类型
// ---------------------------------------------------------------------------

export type SceneNodeKind =
  | 'team'
  | 'boss'
  | 'worker'
  | 'shared-tools'
  | 'shared-knowledge'
  | 'shared-memory';

export type SceneEdgeKind = 'spawn_task' | 'handoff' | 'uses';

export interface SceneNode {
  id: string;
  kind: SceneNodeKind;
  label: string;
  parentId: string | null;
  /** Canvas position hint (column index, row index) */
  col: number;
  row: number;
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  kind: SceneEdgeKind;
  dashed?: boolean;
}

export interface SceneProjection {
  nodes: SceneNode[];
  edges: SceneEdge[];
}

// ---------------------------------------------------------------------------
// Builder Store State
// ---------------------------------------------------------------------------

export type BuilderView = 'goal' | 'scene' | 'graph' | 'validate';

export interface BuilderState {
  // --- source of truth ---
  mode: BuilderView;
  blueprint: AgentBlueprint | null;
  /** role_id, 'team', 'shared-tools', 'shared-knowledge', 'shared-memory', or null */
  selection: string | null;
  /** Tree node expand state: nodeId → expanded */
  treeExpanded: Record<string, boolean>;
  /** Most recent Smoke Run result (null = not yet run). Used by Publish Gate (Story 8.6). */
  lastSmokeRunResult: BuilderSmokeRunResponse['data'] | null;

  // --- actions ---
  setMode: (m: BuilderView) => void;
  setBlueprint: (bp: AgentBlueprint) => void;
  clearBlueprint: () => void;
  setSelection: (id: string | null) => void;
  toggleTreeNode: (id: string) => void;
  updateRoleProfile: (roleId: string, patch: Partial<RoleProfile>) => void;
  addSubAgent: (bossRoleId: string, worker: RoleProfile) => void;
  addKnowledgeBinding: (binding: KnowledgeBinding) => void;
  removeKnowledgeBinding: (bindingId: string) => void;
  updateKnowledgeBinding: (bindingId: string, patch: Partial<KnowledgeBinding>) => void;
  updateToolPolicy: (toolId: string, patch: Partial<ToolPolicy>) => void;
  /** Store latest Smoke Run result for Publish Gate. */
  setLastSmokeRunResult: (result: BuilderSmokeRunResponse['data'] | null) => void;
  /** Story 13.2: 更新 Blueprint 执行方式 */
  updateExecutionMode: (em: ExecutionMode) => void;
}

// ---------------------------------------------------------------------------
// Blueprint → SceneProjection 派生函数（纯函数，可独立测试）
// ---------------------------------------------------------------------------

export function blueprintToSceneProjection(bp: AgentBlueprint | null): SceneProjection {
  if (!bp) return { nodes: [], edges: [] };

  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  // F7: track seen ids to deduplicate
  const seenIds = new Set<string>();

  function pushNode(node: SceneNode) {
    if (seenIds.has(node.id)) return;
    seenIds.add(node.id);
    nodes.push(node);
  }

  // Team root
  pushNode({ id: 'team', kind: 'team', label: `Team · ${bp.name}`, parentId: null, col: 0, row: 0 });

  // Flatten all roles with position hints
  let roleRow = 0;
  let workerRow = 0;
  // col 3 uses a separate row counter so sub-agents don't share row indices with col-2 workers
  let subAgentRow = 0;

  bp.role_profiles.forEach((role) => {
    const isBoss = role.can_spawn_tasks || role.sub_agents.length > 0;
    const kind: SceneNodeKind = isBoss ? 'boss' : 'worker';
    const col = isBoss ? 1 : 2;
    const row = isBoss ? roleRow++ : workerRow++;

    pushNode({
      id: role.role_id,
      kind,
      label: role.name,
      parentId: 'team',
      col,
      row,
    });

    edges.push({ id: `team-${role.role_id}`, from: 'team', to: role.role_id, kind: 'handoff' });

    role.sub_agents.forEach((sub) => {
      pushNode({
        id: sub.role_id,
        kind: 'worker',
        label: sub.name,
        parentId: role.role_id,
        col: 3,
        row: subAgentRow++,
      });
      edges.push({
        id: `${role.role_id}-${sub.role_id}`,
        from: role.role_id,
        to: sub.role_id,
        kind: 'spawn_task',
      });
    });
  });

  // Shared resource anchors — use pushNode to respect seenIds dedup
  // Always show shared-tools so users can open ToolPicker even before adding policies (mirrors shared-knowledge)
  pushNode({ id: 'shared-tools', kind: 'shared-tools', label: 'Shared Tools', parentId: null, col: 4, row: 0 });
  edges.push({ id: 'team-shared-tools', from: 'team', to: 'shared-tools', kind: 'uses', dashed: true });
  // Always show shared-knowledge so users can open the dock even before adding bindings
  pushNode({ id: 'shared-knowledge', kind: 'shared-knowledge', label: 'Shared Knowledge', parentId: null, col: 4, row: 1 });
  edges.push({ id: 'team-shared-knowledge', from: 'team', to: 'shared-knowledge', kind: 'uses', dashed: true });
  if (bp.memory_profile.enabled) {
    pushNode({ id: 'shared-memory', kind: 'shared-memory', label: 'Shared Memory', parentId: null, col: 4, row: 2 });
    edges.push({ id: 'team-shared-memory', from: 'team', to: 'shared-memory', kind: 'uses', dashed: true });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBuilderStore = create<BuilderState>()(
  immer((set) => ({
    mode: 'goal',
    blueprint: null,
    selection: null,
    treeExpanded: {},
    lastSmokeRunResult: null,

    setMode: (m) =>
      set((s) => {
        s.mode = m;
      }),

    setBlueprint: (bp) =>
      set((s) => {
        s.blueprint = { ...bp, knowledge_bindings: bp.knowledge_bindings ?? [] };
        s.treeExpanded = {};
        bp.role_profiles.forEach((r) => {
          if (r.sub_agents.length > 0 || r.can_spawn_tasks) s.treeExpanded[r.role_id] = true;
        });
      }),

    clearBlueprint: () =>
      set((s) => {
        s.blueprint = null;
        s.selection = null;
        s.treeExpanded = {};
      }),

    setSelection: (id) =>
      set((s) => {
        s.selection = id;
      }),

    toggleTreeNode: (id) =>
      set((s) => {
        s.treeExpanded[id] = !(s.treeExpanded[id] ?? false);
      }),

    updateRoleProfile: (roleId, patch) =>
      set((s) => {
        if (!s.blueprint) return;
        function apply(roles: RoleProfile[]): boolean {
          for (const role of roles) {
            if (role.role_id === roleId) { Object.assign(role, patch); return true; }
            if (role.sub_agents.length > 0 && apply(role.sub_agents)) return true;
          }
          return false;
        }
        apply(s.blueprint.role_profiles);
      }),

    addSubAgent: (bossRoleId, worker) =>
      set((s) => {
        if (!s.blueprint) return;
        const boss = s.blueprint.role_profiles.find((r) => r.role_id === bossRoleId);
        if (!boss) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[builderStore] addSubAgent: boss role "${bossRoleId}" not found`);
          }
          return;
        }
        if (boss.sub_agents.some((w) => w.role_id === worker.role_id)) return;
        boss.sub_agents.push(worker);
        s.treeExpanded[bossRoleId] = true;
      }),

    addKnowledgeBinding: (binding) =>
      set((s) => {
        if (!s.blueprint) return;
        s.blueprint.knowledge_bindings.push(binding);
      }),

    removeKnowledgeBinding: (bindingId) =>
      set((s) => {
        if (!s.blueprint) return;
        s.blueprint.knowledge_bindings = s.blueprint.knowledge_bindings.filter(
          (b) => b.binding_id !== bindingId,
        );
      }),

    updateKnowledgeBinding: (bindingId, patch) =>
      set((s) => {
        if (!s.blueprint) return;
        const idx = s.blueprint.knowledge_bindings.findIndex((b) => b.binding_id === bindingId);
        if (idx !== -1) {
          Object.assign(s.blueprint.knowledge_bindings[idx], patch);
        }
      }),

    updateToolPolicy: (toolId, patch) =>
      set((s) => {
        if (!s.blueprint) return;
        const idx = s.blueprint.tool_policies.findIndex((p) => p.tool_id === toolId);
        if (idx !== -1) {
          Object.assign(s.blueprint.tool_policies[idx], patch);
        } else {
          // Create new entry with defaults, then apply patch
          const defaults: ToolPolicy = {
            tool_id: toolId,
            visibility: 'enabled',
            permission_rules: [],
            default_permission: 'allow',
            trust_level: 'internal',
            side_effects: 'read_only',
            requires_confirmation: false,
            metadata: {},
          };
          // Ensure the function-parameter toolId always wins even if patch carries a different tool_id
          s.blueprint.tool_policies.push({ ...defaults, ...patch, tool_id: toolId });
        }
      }),

    setLastSmokeRunResult: (result) =>
      set((s) => {
        s.lastSmokeRunResult = result;
      }),

    updateExecutionMode: (em) =>
      set((s) => {
        if (!s.blueprint) return;
        s.blueprint.execution_mode = em;
      }),
  })),
);

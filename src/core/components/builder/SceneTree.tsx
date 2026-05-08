/**
 * Scene Tree — Story 8.3 (AC3)
 *
 * 左侧树面板：Team根 → Boss/Manager → Worker子节点 → Shared资源
 * 点击节点 → 驱动 builderStore.selection，画布与 Inspector 随之响应
 */
import { useBuilderStore } from '../../stores/builderStore';
import type { AgentBlueprint, RoleProfile } from '../../../common/types/agent-builder';
import { Icon } from '../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// Role icon helpers — return Lucide token names so renderer maps to SVG.
// ---------------------------------------------------------------------------

function roleIcon(role: RoleProfile): string {
  if (role.can_spawn_tasks || role.sub_agents.length > 0) return 'Target';
  return 'HardHat';
}

// ---------------------------------------------------------------------------
// Tree node atom
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  id: string;
  icon: string;
  label: string;
  indent: number;
  selected: boolean;
  canExpand: boolean;
  expanded: boolean;
  badge?: string;
  onSelect: () => void;
  onToggle?: () => void;
}

function TreeNode({
  id,
  icon,
  label,
  indent,
  selected,
  canExpand,
  expanded,
  badge,
  onSelect,
  onToggle,
}: TreeNodeProps) {
  const caretClass = 'w-[10px] font-mono text-[9px] text-sf-fg5 shrink-0';

  function handleCaretClick(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    onToggle?.();
  }

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={canExpand ? expanded : undefined}
      data-testid={`tree-node-${id}`}
      onClick={onSelect}
      className={[
        'flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] text-[12px] cursor-pointer transition-colors select-none',
        selected
          ? 'bg-sf-accent-tint text-sf-accent-bright'
          : 'text-sf-fg2 hover:bg-sf-elev2',
      ].join(' ')}
      style={{ paddingLeft: `${10 + indent * 18}px` }}
    >
      {canExpand ? (
        <button
          type="button"
          className={caretClass}
          data-testid={`tree-node-caret-${id}`}
          onClick={handleCaretClick}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCaretClick(e)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'}
        </button>
      ) : (
        <span className={caretClass} aria-hidden> </span>
      )}
      <span className="w-[14px] inline-flex items-center justify-center shrink-0 text-sf-fg2" aria-hidden>
        <Icon token={icon} size={14} />
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge && (
        <span className="ml-auto shrink-0 rounded-[4px] border border-sf-accent/35 bg-sf-accent-tint px-[5px] py-px font-mono text-[8px] uppercase tracking-[0.1em] text-sf-accent-bright">
          {badge}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneTree
// ---------------------------------------------------------------------------

interface SceneTreeProps {
  blueprint: AgentBlueprint;
  /** Story 13.3: team 模式下触发 Catalog 引入 Drawer */
  onOpenCatalogImport?: () => void;
}

export function SceneTree({ blueprint, onOpenCatalogImport }: SceneTreeProps) {
  const selection = useBuilderStore((s) => s.selection);
  const treeExpanded = useBuilderStore((s) => s.treeExpanded);
  const setSelection = useBuilderStore((s) => s.setSelection);
  const toggleTreeNode = useBuilderStore((s) => s.toggleTreeNode);

  // Shared resource counts (knowledge dock always visible — AC1 first-class entry)
  const hasTools = blueprint.tool_policies.length > 0;
  const hasMemory = blueprint.memory_profile.enabled;
  const sharedKnowledgeCount = (blueprint.knowledge_bindings ?? []).filter((b) => b.scope === 'shared').length;

  return (
    <div
      className="flex flex-col overflow-auto border-r border-sf-border bg-sf-panel py-2"
      role="tree"
      aria-label="Scene Tree"
      data-testid="scene-tree"
    >
      <p className="mb-1 px-4 pb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-sf-fg5">
        Scene Tree
      </p>

      {/* Team root */}
      <TreeNode
        id="team"
        icon="◈"
        label={`Team · ${blueprint.name}`}
        indent={0}
        selected={selection === 'team'}
        canExpand={false}
        expanded={false}
        onSelect={() => setSelection('team')}
      />

      {/* Top-level roles */}
      {blueprint.role_profiles.map((role) => {
        const isBoss = role.can_spawn_tasks || role.sub_agents.length > 0;
        const isExpanded = !!treeExpanded[role.role_id];
        // Phase 1: 主负责人徽章（原"锚点"，仅信息展示）
        const isAnchor = role.metadata?.anchor === true;
        const nodeBadge = isAnchor ? '💬 主负责人' : isBoss ? 'boss' : undefined;

        return (
          <div key={role.role_id}>
            <TreeNode
              id={role.role_id}
              icon={roleIcon(role)}
              label={role.name}
              indent={1}
              selected={selection === role.role_id}
              canExpand={isBoss}
              expanded={isExpanded}
              badge={nodeBadge}
              onSelect={() => setSelection(role.role_id)}
              onToggle={() => toggleTreeNode(role.role_id)}
            />
            {isBoss && isExpanded && (
              <div role="group">
                {role.sub_agents.map((sub) => (
                  <TreeNode
                    key={sub.role_id}
                    id={sub.role_id}
                    icon="HardHat"
                    label={sub.name}
                    indent={2}
                    selected={selection === sub.role_id}
                    canExpand={false}
                    expanded={false}
                    onSelect={() => setSelection(sub.role_id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Story 13.3: "从 Catalog 引入" button — team 模式专属（AC1） */}
      {blueprint.mode === 'team' && onOpenCatalogImport && (
        <button
          type="button"
          onClick={onOpenCatalogImport}
          className="mx-3 mt-1 flex items-center gap-1.5 rounded-[6px] border border-dashed border-sf-accent/40 px-3 py-[5px] text-[11px] text-sf-accent-bright transition-colors hover:border-sf-accent hover:bg-sf-accent-tint"
          data-testid="import-from-catalog-btn"
        >
          <span aria-hidden>＋</span>
          从 Catalog 引入
        </button>
      )}

      {/* Shared resources separator — Knowledge always visible per AC1 */}
      <div className="mx-3 my-2 h-px bg-sf-border/50" />

      {/* shared-tools always visible — mirrors shared-knowledge; users need ToolPicker entry
          even before adding any policy (matches blueprintToSceneProjection always-present logic) */}
      <TreeNode
        id="shared-tools"
        icon="Wrench"
        label="Shared Tools"
        indent={0}
        selected={selection === 'shared-tools'}
        canExpand={false}
        expanded={false}
        badge={hasTools ? String(blueprint.tool_policies.length) : undefined}
        onSelect={() => setSelection('shared-tools')}
      />

      <TreeNode
        id="shared-knowledge"
        icon="BookOpen"
        label="Shared Knowledge"
        indent={0}
        selected={selection === 'shared-knowledge'}
        canExpand={false}
        expanded={false}
        badge={sharedKnowledgeCount > 0 ? String(sharedKnowledgeCount) : undefined}
        onSelect={() => setSelection('shared-knowledge')}
      />
      {hasMemory && (
        <TreeNode
          id="shared-memory"
          icon="Brain"
          label="Shared Memory"
          indent={0}
          selected={selection === 'shared-memory'}
          canExpand={false}
          expanded={false}
          onSelect={() => setSelection('shared-memory')}
        />
      )}

      {/* Empty blueprint guard */}
      {blueprint.role_profiles.length === 0 && (
        <p className="px-4 py-3 text-[11px] text-sf-fg5">
          No roles yet — generate a blueprint first.
        </p>
      )}
    </div>
  );
}

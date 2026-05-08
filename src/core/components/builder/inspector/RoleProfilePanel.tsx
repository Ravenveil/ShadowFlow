/**
 * RoleProfilePanel — Story 8.3b (AC1–AC6)
 *
 * Inspector 主面板：5 分组折叠手风琴
 *   1. 基本信息（默认展开）— role title + description
 *   2. 能力边界（默认展开）— capabilities[]
 *   3. Handoff 规则           — handoff_rules[]
 *   4. 个性特征               — persona_traits
 *   5. 持久状态字段            — state_fields[]
 *
 * 每次编辑实时写回 builderStore blueprint state（精确 selector，无全量订阅）。
 */
import { useState, useEffect } from 'react';
import { useBuilderStore } from '../../../stores/builderStore';
import { HardHat as RpHardHat, MessageCircle } from '../../../../common/icons/iconRegistry';
import type { RoleProfile } from '../../../../common/types/agent-builder';
import { CapabilitiesEditor } from './fields/CapabilitiesEditor';
import { HandoffRulesEditor } from './fields/HandoffRulesEditor';
import { PersonaTraitsEditor } from './fields/PersonaTraitsEditor';
import { StateFieldsEditor } from './fields/StateFieldsEditor';
import { KnowledgeDock } from '../KnowledgeDock';
import { ToolPicker } from './fields/ToolPicker';
import { ExecutionModeSection } from './ExecutionModeSection';
import { ScopeSectionCard } from './ScopeSectionCard';

// ---------------------------------------------------------------------------
// Accordion section
// ---------------------------------------------------------------------------

interface AccordionSectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId?: string;
}

function AccordionSection({
  title,
  badge,
  defaultOpen = false,
  children,
  testId,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-sf-border/50" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        data-testid={testId ? `${testId}-toggle` : undefined}
        aria-expanded={open}
      >
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
          {title}
          {badge !== undefined && badge !== 0 && (
            <span className="ml-1.5 rounded-[4px] bg-sf-elev3 px-1.5 py-px text-[8px] text-sf-fg3">
              {badge}
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] text-sf-fg5">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function InspLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
      {children}
    </p>
  );
}

function ChipButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
        selected
          ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
          : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Switch-lead-role button — Phase 1 rename of "替换锚点"; no longer represents
// a structural lock, only the user-facing primary speaker for the team.
// ---------------------------------------------------------------------------

function SwitchLeadButton({ roleId }: { roleId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        window.dispatchEvent(
          new CustomEvent('sf:open-catalog-import', {
            detail: { replaceRoleId: roleId },
          }),
        );
        window.setTimeout(() => setBusy(false), 600);
      }}
      className="rounded-[4px] border border-sf-accent/40 bg-sf-accent-tint px-2 py-0.5 font-mono text-[10px] text-sf-accent-bright hover:bg-sf-accent/10 disabled:opacity-50"
      data-testid="role-lead-switch"
    >
      切换主负责人 →
    </button>
  );
}

// ---------------------------------------------------------------------------
// RoleProfilePanel
// ---------------------------------------------------------------------------

export interface RoleProfilePanelProps {
  role: RoleProfile;
  isBoss: boolean;
  onAddWorker?: () => void;
}

export function RoleProfilePanel({ role, isBoss, onAddWorker }: RoleProfilePanelProps) {
  const updateRoleProfile = useBuilderStore((s) => s.updateRoleProfile);
  const updateExecutionMode = useBuilderStore((s) => s.updateExecutionMode);

  // Blueprint 级别的 execution_mode（用于"执行方式"分组）
  const blueprintMode = useBuilderStore((s) => s.blueprint?.mode);
  const executionMode = useBuilderStore((s) => s.blueprint?.execution_mode);

  // Subscribe to live role from store so array/object fields react to onChange updates.
  // Falls back to prop if store doesn't have the role (e.g. before blueprint is set).
  const liveRole = useBuilderStore((s) => {
    if (!s.blueprint) return role;
    return (
      s.blueprint.role_profiles.find((r) => r.role_id === role.role_id) ??
      s.blueprint.role_profiles.flatMap((r) => r.sub_agents).find((r) => r.role_id === role.role_id) ??
      role
    );
  });

  const allRoles = useBuilderStore((s) =>
    s.blueprint?.role_profiles.flatMap((r) => [r, ...r.sub_agents]) ?? []
  );

  const agentKnowledgeCount = useBuilderStore((s) =>
    s.blueprint?.knowledge_bindings.filter(
      (b) => b.scope === 'agent' && b.target_ref === role.role_id,
    ).length ?? 0
  );

  // 可作为 handoff 目标的角色（排除自身）
  const handoffTargets = allRoles
    .filter((r) => r.role_id !== role.role_id)
    .map((r) => ({ role_id: r.role_id, name: r.name }));

  // Local state only for text inputs to avoid stale-prop issue on controlled inputs.
  // Array/object fields come from liveRole (store-subscribed) instead.
  const [localName, setLocalName] = useState(role.name);
  const [localDesc, setLocalDesc] = useState(role.description);

  // P4: reset local text state when selected role changes (e.g. external blueprint update)
  // LOW-5: normalize empty handoff_style to 'parallel' on first render per role
  useEffect(() => {
    setLocalName(liveRole.name);
    setLocalDesc(liveRole.description ?? '');
    if (!liveRole.metadata?.handoff_style) {
      updateRoleProfile(liveRole.role_id, { metadata: { ...liveRole.metadata, handoff_style: 'parallel' } });
    }
  }, [liveRole.role_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handoffStyle = (liveRole.metadata?.handoff_style as string) || 'parallel';

  function patchName(v: string) {
    setLocalName(v);
    updateRoleProfile(role.role_id, { name: v });
  }

  function patchDesc(v: string) {
    setLocalDesc(v);
    updateRoleProfile(role.role_id, { description: v });
  }

  function patchHandoff(style: 'parallel' | 'sequential') {
    updateRoleProfile(role.role_id, { metadata: { ...liveRole.metadata, handoff_style: style } });
  }

  function removeToolById(tool: string) {
    updateRoleProfile(role.role_id, { tools: liveRole.tools.filter((t) => t !== tool) });
  }

  return (
    <div
      className="flex flex-col overflow-auto border-l border-sf-border bg-sf-panel"
      data-testid="inspector-role"
    >
      {/* Header */}
      <div className="border-b border-sf-border/50 px-4 py-3">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-sf-accent-bright">
          ● selection{isBoss ? ' · boss' : ''}
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold leading-tight">{localName}</span>
          {isBoss && (
            <span className="rounded-[4px] bg-sf-accent-tint px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-sf-accent-bright">
              boss
            </span>
          )}
          {/* Phase 1: 主负责人徽章（原"锚点"，仅信息展示，不再锁定删除） */}
          {liveRole.metadata?.anchor === true && (
            <span
              className="sf-lead-badge inline-flex items-center gap-1 rounded-[4px] border border-sf-accent/40 bg-sf-accent-tint px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-sf-accent-bright"
              data-testid="role-lead-badge"
              title="主负责人 — 与用户对话的接口角色（可自由编辑/删除/切换）"
            >
              <MessageCircle size={10} strokeWidth={2} aria-hidden />
              主负责人
            </span>
          )}
        </div>
        {/* Phase 1: 主负责人操作行（仅"切换"，不再有"删除不可用"） */}
        {liveRole.metadata?.anchor === true && (
          <div
            className="mt-2 flex items-center gap-2"
            data-testid="role-lead-actions"
          >
            <SwitchLeadButton roleId={liveRole.role_id} />
          </div>
        )}
      </div>

      {/* ── 分组 0: Agent Scope（Story 13.5） ── */}
      <ScopeSectionCard
        role={liveRole}
        onUpdate={(patch) => updateRoleProfile(liveRole.role_id, patch)}
      />

      {/* ── 分组 1: 基本信息 ── */}
      <AccordionSection title="基本信息" defaultOpen={true} testId="section-basic">
        <div className="space-y-3">
          <div>
            <InspLabel>Role title</InspLabel>
            <input
              type="text"
              value={localName}
              onChange={(e) => patchName(e.target.value)}
              placeholder="e.g. Research Manager"
              data-testid="insp-role-title"
              className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-2.5 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
            />
          </div>

          <div>
            <InspLabel>Description · system prompt</InspLabel>
            <textarea
              value={localDesc}
              onChange={(e) => patchDesc(e.target.value)}
              placeholder="Describe this role's responsibilities and how it behaves."
              rows={3}
              data-testid="insp-role-description"
              className="w-full resize-none rounded-[7px] border border-sf-border bg-sf-elev1 px-2.5 py-2 text-[11px] leading-[1.55] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
            />
          </div>

          <div>
            <InspLabel>Handoff style</InspLabel>
            <div className="flex gap-2" data-testid="insp-handoff-style">
              <ChipButton
                label="parallel"
                selected={handoffStyle === 'parallel'}
                onClick={() => patchHandoff('parallel')}
              />
              <ChipButton
                label="sequential"
                selected={handoffStyle === 'sequential'}
                onClick={() => patchHandoff('sequential')}
              />
            </div>
          </div>

          <div>
            <InspLabel>Visible tools · {(liveRole.tools ?? []).length}</InspLabel>
            {(liveRole.tools ?? []).length > 0 ? (
              <div className="flex flex-col gap-1.5" data-testid="insp-tools-list">
                {(liveRole.tools ?? []).map((tool) => (
                  <div
                    key={tool}
                    className="flex items-center justify-between py-1 text-[12px] text-sf-fg2"
                  >
                    <span className="font-mono text-[11px]">{tool}</span>
                    <button
                      type="button"
                      onClick={() => removeToolById(tool)}
                      className="text-[10px] text-sf-fg5 hover:text-sf-reject"
                      aria-label={`Remove ${tool}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[11px] text-sf-fg5" data-testid="insp-tools-empty">
                No tools — inherits shared.
              </p>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* ── 分组 2: 能力边界 ── */}
      <AccordionSection
        title="能力边界"
        badge={(liveRole.capabilities ?? []).length}
        defaultOpen={true}
        testId="section-capabilities"
      >
        <CapabilitiesEditor
          capabilities={liveRole.capabilities ?? []}
          onChange={(next) => updateRoleProfile(role.role_id, { capabilities: next })}
        />
      </AccordionSection>

      {/* ── 分组 3: Handoff 规则 ── */}
      <AccordionSection
        title="Handoff 规则"
        badge={(liveRole.handoff_rules ?? []).length}
        defaultOpen={false}
        testId="section-handoff-rules"
      >
        <HandoffRulesEditor
          handoff_rules={liveRole.handoff_rules ?? []}
          availableRoles={handoffTargets}
          onChange={(next) => updateRoleProfile(role.role_id, { handoff_rules: next })}
        />
      </AccordionSection>

      {/* ── 分组 4: 个性特征 ── */}
      <AccordionSection
        title="个性特征"
        badge={Object.keys(liveRole.persona_traits ?? {}).length}
        defaultOpen={false}
        testId="section-persona-traits"
      >
        <PersonaTraitsEditor
          persona_traits={liveRole.persona_traits ?? {}}
          onChange={(next) => updateRoleProfile(role.role_id, { persona_traits: next })}
        />
      </AccordionSection>

      {/* ── 分组 5: 持久状态字段 ── */}
      <AccordionSection
        title="持久状态字段"
        badge={(liveRole.state_fields ?? []).length}
        defaultOpen={false}
        testId="section-state-fields"
      >
        <StateFieldsEditor
          state_fields={liveRole.state_fields ?? []}
          onChange={(next) => updateRoleProfile(role.role_id, { state_fields: next })}
        />
      </AccordionSection>

      {/* ── 分组 6: 工具 (Story 8.4b) ── */}
      <AccordionSection
        title="工具 · Tools"
        defaultOpen={false}
        testId="section-tools"
      >
        <ToolPicker roleId={role.role_id} />
      </AccordionSection>

      {/* ── 分组 7: 知识来源 (Story 8.4) ── */}
      <AccordionSection
        title="知识来源"
        badge={agentKnowledgeCount}
        defaultOpen={false}
        testId="section-knowledge"
      >
        <div className="-mx-4 -mb-3">
          <KnowledgeDock scope="agent" targetRef={role.role_id} />
        </div>
      </AccordionSection>

      {/* ── 分组 8: 执行方式（Story 13.2，仅 single 模式） ── */}
      {blueprintMode === 'single' && (
        <AccordionSection
          title="执行方式"
          defaultOpen={false}
          testId="section-execution-mode"
        >
          <ExecutionModeSection
            executionMode={executionMode}
            onUpdate={updateExecutionMode}
          />
        </AccordionSection>
      )}

      <div className="border-b border-sf-border/50 px-4 py-3" data-testid="section-memory-profile">
        <InspLabel>Memory profile · scope</InspLabel>
        <div className="flex flex-wrap gap-2" data-testid="insp-memory-scope">
          {(['session', 'persistent', 'ephemeral'] as const).map((scope) => (
            <ChipButton
              key={scope}
              label={scope}
              selected={((liveRole.metadata?.memory_scope as string) || 'session') === scope}
              onClick={() => updateRoleProfile(role.role_id, { metadata: { ...liveRole.metadata, memory_scope: scope } })}
            />
          ))}
        </div>
      </div>

      {/* Workers list（boss only） */}
      {isBoss && (
        <div className="px-4 py-3">
          <InspLabel>Workers · sub_agents · {(liveRole.sub_agents ?? []).length}</InspLabel>
          <div className="flex flex-col gap-1.5" data-testid="insp-workers-list">
            {(liveRole.sub_agents ?? []).map((sub) => (
              <div
                key={sub.role_id}
                className="flex items-center gap-2 rounded-[7px] border border-sf-border/60 border-l-2 border-l-sf-run bg-sf-elev1 px-2.5 py-2 text-[12px]"
              >
                <span className="inline-flex items-center justify-center text-sf-fg2"><RpHardHat size={12} strokeWidth={2} /></span>
                <span className="font-medium text-sf-fg1">{sub.name}</span>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-sf-fg5">
                  worker
                </span>
              </div>
            ))}
            <button
              type="button"
              data-testid="insp-add-worker-btn"
              onClick={onAddWorker}
              className="flex items-center justify-center gap-1.5 rounded-[7px] border border-dashed border-sf-border py-2 text-[11px] text-sf-fg4 hover:text-sf-fg2"
            >
              ＋ Add worker
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Team Inspector — 选中 Team 根节点时显示（read-only: team-level edits handled in Goal mode） */
import type { AgentBlueprint } from '../../../../common/types/agent-builder';

interface TeamInspectorProps {
  blueprint: AgentBlueprint;
}

export function TeamInspector({ blueprint }: TeamInspectorProps) {
  return (
    <div
      className="flex flex-col overflow-auto border-l border-sf-border bg-sf-panel"
      data-testid="inspector-team"
    >
      <div className="border-b border-sf-border/50 px-4 py-3">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-sf-accent-bright">
          ● team
        </p>
        <p className="text-[15px] font-bold">{blueprint.name}</p>
      </div>
      <div className="px-4 py-3">
        <dl className="flex flex-col gap-2.5 font-mono text-[11px]">
          <div className="flex items-baseline gap-2">
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">mode</dt>
            <dd className="text-sf-fg2">{blueprint.mode}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">goal</dt>
            <dd className="text-sf-fg2 break-words leading-relaxed">
              {blueprint.goal.length > 120 ? blueprint.goal.slice(0, 120) + '…' : blueprint.goal}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">roles</dt>
            <dd className="text-sf-fg2">{blueprint.role_profiles.length}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">audience</dt>
            <dd className="text-sf-fg2">{blueprint.audience || '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

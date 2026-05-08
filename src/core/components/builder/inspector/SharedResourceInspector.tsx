/** Shared Resources Inspector — Shared Tools / Knowledge / Memory 选中时显示 */
import type { ReactNode } from 'react';
import type { AgentBlueprint } from '../../../../common/types/agent-builder';
import { KnowledgeDock } from '../KnowledgeDock';
import { Wrench, BookOpen, Brain } from '../../../../common/icons/iconRegistry';

type ResourceKind = 'shared-tools' | 'shared-knowledge' | 'shared-memory';

interface SharedResourceInspectorProps {
  kind: ResourceKind;
  blueprint: AgentBlueprint;
}

const TITLES: Record<ResourceKind, ReactNode> = {
  'shared-tools': <span className="inline-flex items-center gap-1.5"><Wrench size={14} strokeWidth={2} /> Shared Tools</span>,
  'shared-knowledge': <span className="inline-flex items-center gap-1.5"><BookOpen size={14} strokeWidth={2} /> Shared Knowledge</span>,
  'shared-memory': <span className="inline-flex items-center gap-1.5"><Brain size={14} strokeWidth={2} /> Shared Memory</span>,
};

export function SharedResourceInspector({ kind, blueprint }: SharedResourceInspectorProps) {
  // Knowledge Dock takes over the full panel for shared-knowledge (AC1, AC6)
  // h-full + overflow-hidden on wrapper ensures KnowledgeDock's own overflow-auto works correctly
  // within the 300px Inspector column (BuilderPage: w-[300px] shrink-0 overflow-hidden)
  if (kind === 'shared-knowledge') {
    return (
      <div data-testid="inspector-shared-knowledge" className="flex flex-col h-full overflow-hidden">
        <KnowledgeDock scope="shared" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-auto border-l border-sf-border bg-sf-panel"
      data-testid={`inspector-${kind}`}
    >
      <div className="border-b border-sf-border/50 px-4 py-3">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-sf-accent-bright">
          ● shared resource
        </p>
        <p className="text-[15px] font-bold">{TITLES[kind]}</p>
      </div>
      <div className="px-4 py-3">
        {kind === 'shared-tools' && (
          <ul className="flex flex-col gap-1.5">
            {blueprint.tool_policies.length > 0
              ? blueprint.tool_policies.map((t) => (
                  <li key={t.tool_id} className="font-mono text-[11px] text-sf-fg2">
                    {t.tool_id} · {t.trust_level}
                  </li>
                ))
              : <li className="text-[11px] text-sf-fg5">No tools bound yet.</li>}
          </ul>
        )}
        {kind === 'shared-memory' && (
          <dl className="flex flex-col gap-2 font-mono text-[11px]">
            <div className="flex gap-2">
              <dt className="text-sf-fg5">scope</dt>
              <dd className="text-sf-fg2">{blueprint.memory_profile.scope}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-sf-fg5">writeback</dt>
              <dd className="text-sf-fg2">{blueprint.memory_profile.writeback_target ?? 'none'}</dd>
            </div>
          </dl>
        )}
        <p className="mt-4 text-[11px] text-sf-fg5">
          Deep configuration available in Epic 9 (Knowledge / Memory foundations).
        </p>
      </div>
    </div>
  );
}

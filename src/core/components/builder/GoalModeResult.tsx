import type { AgentBlueprint } from '../../../common/types/agent-builder';
import { AlertTriangle as GmrAlert } from '../../../common/icons/iconRegistry';

interface BlueprintMeta {
  confidence: number;
  missing_inputs: string[];
  suggested_next_step: string;
  source?: string;
}

interface Props {
  blueprint: AgentBlueprint;
  meta: BlueprintMeta;
  onAcceptScene: () => void;
  onRegenerate: () => void;
  onFromTemplate: () => void;
  onOpenGraph: () => void;
  isLoading: boolean;
}

export function GoalModeResult({
  blueprint,
  meta,
  onAcceptScene,
  onRegenerate,
  onFromTemplate,
  onOpenGraph,
  isLoading,
}: Props) {
  const confidencePct = Math.min(100, Math.round(meta.confidence * 100));
  const teamSummary =
    blueprint.mode === 'team'
      ? `team · 1 boss + ${Math.max(0, blueprint.role_profiles.length - 1)} workers`
      : 'single assistant';

  const roleNames = blueprint.role_profiles
    .map((r) => r.name)
    .join(', ');

  return (
    <div
      className="sticky top-5 h-max rounded-[14px] border border-sf-border bg-sf-panel p-6"
      data-testid="goal-mode-result"
    >
      <p className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sf-accent-bright">
        ● Blueprint generated
      </p>
      <h4 className="text-[18px] font-bold tracking-[-0.02em]">{blueprint.name}</h4>
      <p className="mb-4 mt-0.5 text-[12px] italic text-sf-fg3">
        "{blueprint.goal.length > 80 ? blueprint.goal.slice(0, 80) + '…' : blueprint.goal}"
      </p>

      {/* Confidence bar */}
      <div className="mb-5 flex items-center gap-2.5" data-testid="confidence-bar">
        <span className="font-mono text-[13px] font-bold text-sf-fg1">
          {Math.min(1, meta.confidence).toFixed(2)}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sf-elev2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sf-run to-sf-ok"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-sf-fg5">
          confidence
        </span>
      </div>

      {/* Meta grid */}
      <dl
        className="mb-5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2.5 font-mono text-[11px]"
        data-testid="blueprint-meta"
      >
        <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">mode</dt>
        <dd className="text-sf-fg2">{teamSummary}</dd>
        {roleNames && (
          <>
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">roles</dt>
            <dd className="text-sf-fg2 break-words">{roleNames}</dd>
          </>
        )}
        {meta.suggested_next_step && (
          <>
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">next step</dt>
            <dd className="text-sf-fg2">{meta.suggested_next_step}</dd>
          </>
        )}
        {meta.source && (
          <>
            <dt className="text-[9px] uppercase tracking-[0.08em] text-sf-fg5">source</dt>
            <dd className="text-sf-fg2">{meta.source}</dd>
          </>
        )}
      </dl>

      {/* Missing inputs */}
      {meta.missing_inputs.length > 0 && (
        <div
          className="mb-5 rounded-[8px] border border-sf-warn/30 bg-sf-warn-tint px-3 py-2.5"
          data-testid="missing-inputs"
        >
          <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-warn">
            <span className="inline-flex items-center gap-1.5"><GmrAlert size={11} strokeWidth={2} /> Missing inputs</span>
          </p>
          <ul className="ml-3.5 list-disc space-y-1 text-[12px] leading-[1.7] text-sf-fg2">
            {meta.missing_inputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action CTAs */}
      <div className="flex flex-col gap-2" data-testid="result-actions">
        <button
          type="button"
          data-testid="action-accept-scene"
          onClick={onAcceptScene}
          disabled={isLoading}
          className="inline-flex h-9.5 items-center justify-between gap-2 rounded-[9px] bg-sf-accent px-3.5 py-2 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <span>Accept &amp; enter Scene Mode</span>
          <span className="opacity-60">→</span>
        </button>
        <button
          type="button"
          data-testid="action-regenerate"
          onClick={onRegenerate}
          disabled={isLoading}
          className="inline-flex h-9.5 items-center justify-between gap-2 rounded-[9px] border border-sf-border px-3.5 py-2 text-[12px] font-semibold text-sf-fg2 hover:text-sf-fg1 transition-colors disabled:opacity-50"
        >
          <span>↻ Regenerate (keeps form)</span>
        </button>
        <button
          type="button"
          data-testid="action-from-template"
          onClick={onFromTemplate}
          className="inline-flex h-9.5 items-center justify-between gap-2 rounded-[9px] border border-sf-border px-3.5 py-2 text-[12px] font-semibold text-sf-fg2 hover:text-sf-fg1 transition-colors"
        >
          <span>Start from a template</span>
          <span className="opacity-60">→</span>
        </button>
        <button
          type="button"
          data-testid="action-open-graph"
          onClick={onOpenGraph}
          className="inline-flex h-9.5 items-center justify-between gap-2 rounded-[9px] border border-sf-border px-3.5 py-2 text-[12px] font-semibold text-sf-fg2 hover:text-sf-fg1 transition-colors"
        >
          <span>Open in Graph Mode</span>
          <span className="opacity-60">→</span>
        </button>
      </div>
    </div>
  );
}

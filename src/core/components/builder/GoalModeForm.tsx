import { useId } from 'react';
import type { BuilderFormState } from '../../../pages/BuilderPage';
import { Sparkles as GoalSparkles } from '../../../common/icons/iconRegistry';

type KnowledgeSource = 'docs' | 'urls' | 'knowledge_pack' | 'none';
type Mode = 'single' | 'team';
type DesiredOutput = 'answer' | 'report' | 'review' | 'workflow_draft';

interface Props {
  values: BuilderFormState;
  onChange: (patch: Partial<BuilderFormState>) => void;
  onSubmit: () => void;
  onFromTemplate: () => void;
  onSkipToGraph: () => void;
  isLoading: boolean;
  validationError: string | null;
}

const KNOWLEDGE_OPTIONS: { value: KnowledgeSource; label: string }[] = [
  { value: 'docs', label: 'Documents' },
  { value: 'urls', label: 'URLs' },
  { value: 'knowledge_pack', label: 'Knowledge Pack' },
  { value: 'none', label: 'None · decide later' },
];

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'single', label: 'Single assistant' },
  { value: 'team', label: 'Team · boss + workers' },
];

const OUTPUT_OPTIONS: { value: DesiredOutput; label: string }[] = [
  { value: 'answer', label: 'Answer' },
  { value: 'report', label: 'Report' },
  { value: 'review', label: 'Review' },
  { value: 'workflow_draft', label: 'Workflow draft' },
];

function FieldLabel({
  htmlFor,
  name,
  required,
  help,
}: {
  htmlFor?: string;
  name: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <label
      {...(htmlFor ? { htmlFor } : {})}
      className="mb-2 flex items-baseline gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-sf-fg3"
    >
      <span>{name}</span>
      {required && <span className="text-sf-reject">*</span>}
      {help && (
        <span className="ml-auto font-sans normal-case tracking-normal font-medium text-sf-fg5 text-[11px]">
          {help}
        </span>
      )}
    </label>
  );
}

function ChoiceButton<T extends string>({
  value,
  label,
  selected,
  onClick,
  disabled,
  isRadio,
}: {
  value: T;
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  isRadio?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(isRadio
        ? { role: 'radio', 'aria-checked': selected }
        : { 'aria-pressed': selected })}
      className={[
        'inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        selected
          ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
          : 'border-sf-border bg-sf-elev1 text-sf-fg2 hover:border-sf-fg5',
      ].join(' ')}
      data-testid={`choice-${value}`}
    >
      <span className="font-mono text-[10px] opacity-70">{selected ? '●' : '○'}</span>
      {label}
    </button>
  );
}

export function GoalModeForm({
  values,
  onChange,
  onSubmit,
  onFromTemplate,
  onSkipToGraph,
  isLoading,
  validationError,
}: Props) {
  const goalId = useId();
  const audienceId = useId();

  const canSubmit =
    !isLoading &&
    values.goal.trim().length > 0 &&
    values.mode !== undefined &&
    values.desired_output !== undefined;

  function toggleKnowledge(v: KnowledgeSource) {
    const current = values.knowledge_sources ?? [];
    if (v === 'none') {
      onChange({ knowledge_sources: ['none'] });
      return;
    }
    const withoutNone = current.filter((k) => k !== 'none');
    if (withoutNone.includes(v)) {
      const remaining = withoutNone.filter((k) => k !== v);
      onChange({ knowledge_sources: remaining.length > 0 ? remaining : ['none'] });
    } else {
      onChange({ knowledge_sources: [...withoutNone, v] });
    }
  }

  return (
    <div
      className="rounded-[14px] border border-sf-border bg-sf-panel p-8"
      data-testid="goal-mode-form"
    >
      <h3 className="text-[22px] font-bold tracking-[-0.02em]">
        Tell me what this agent should do.
      </h3>
      <p className="mt-1.5 mb-7 text-[13px] text-sf-fg3">
        I'll grow the skeleton from here. You can refine everything later.
      </p>

      {/* goal */}
      <div className="mb-5">
        <FieldLabel
          htmlFor={goalId}
          name="goal"
          required
          help="what you want it to accomplish"
        />
        <textarea
          id={goalId}
          data-testid="field-goal"
          value={values.goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          disabled={isLoading}
          placeholder="e.g. Survey the last 6 months of open-source coding-agent research and produce a weekly digest."
          rows={3}
          className={[
            'w-full resize-none rounded-[10px] border bg-sf-elev1 px-3.5 py-3 text-[14px] text-sf-fg1 placeholder:text-sf-fg5 focus:outline-none transition-shadow',
            validationError
              ? 'border-sf-warn focus:border-sf-warn focus:shadow-none'
              : 'border-sf-border focus:border-sf-accent focus:shadow-[0_0_0_3px_var(--t-accent-tint)]',
          ].join(' ')}
        />
        {validationError && (
          <p
            className="mt-1.5 text-[12px] text-sf-warn"
            data-testid="goal-validation-error"
            role="alert"
          >
            {validationError}
          </p>
        )}
      </div>

      {/* audience */}
      <div className="mb-5">
        <FieldLabel htmlFor={audienceId} name="audience" help="who this is for" />
        <input
          id={audienceId}
          data-testid="field-audience"
          type="text"
          value={values.audience ?? ''}
          onChange={(e) => onChange({ audience: e.target.value })}
          disabled={isLoading}
          placeholder="e.g. Internal engineering team, ~20 readers"
          className="w-full rounded-[10px] border border-sf-border bg-sf-elev1 px-3.5 py-3 text-[14px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:shadow-[0_0_0_3px_var(--t-accent-tint)] focus:outline-none transition-shadow"
        />
      </div>

      {/* knowledge_sources */}
      <div className="mb-5">
        <FieldLabel name="knowledge_sources" help="multi-select" />
        <div className="flex flex-wrap gap-2" data-testid="field-knowledge-sources">
          {KNOWLEDGE_OPTIONS.map(({ value, label }) => (
            <ChoiceButton
              key={value}
              value={value}
              label={label}
              selected={(values.knowledge_sources ?? []).includes(value)}
              onClick={() => toggleKnowledge(value)}
              disabled={isLoading}
            />
          ))}
        </div>
      </div>

      {/* mode */}
      <div className="mb-5">
        <FieldLabel name="mode" required />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="mode" data-testid="field-mode">
          {MODE_OPTIONS.map(({ value, label }) => (
            <ChoiceButton
              key={value}
              value={value}
              label={label}
              selected={values.mode === value}
              onClick={() => onChange({ mode: value })}
              disabled={isLoading}
              isRadio
            />
          ))}
        </div>
      </div>

      {/* desired_output */}
      <div className="mb-5">
        <FieldLabel name="desired_output" required />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="desired_output" data-testid="field-desired-output">
          {OUTPUT_OPTIONS.map(({ value, label }) => (
            <ChoiceButton
              key={value}
              value={value}
              label={label}
              selected={values.desired_output === value}
              onClick={() => onChange({ desired_output: value })}
              disabled={isLoading}
              isRadio
            />
          ))}
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-5 flex items-center gap-2.5 border-t border-sf-border pt-5">
        <button
          type="button"
          data-testid="cta-generate"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={[
            'inline-flex h-11 items-center gap-2 rounded-[10px] px-5 text-[14px] font-bold transition-opacity',
            canSubmit
              ? 'bg-sf-accent text-white hover:opacity-90 cursor-pointer'
              : 'bg-sf-accent/40 text-white/50 cursor-not-allowed',
          ].join(' ')}
        >
          {isLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating…
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5"><GoalSparkles size={14} strokeWidth={2} /> Generate Blueprint</span>
          )}
        </button>

        <button
          type="button"
          data-testid="cta-from-template"
          onClick={onFromTemplate}
          className="inline-flex h-11 items-center rounded-[10px] border border-sf-border px-4 text-[13px] font-semibold text-sf-fg2 hover:text-sf-fg1 transition-colors"
        >
          Start from a template →
        </button>

        <button
          type="button"
          data-testid="cta-skip-graph"
          onClick={onSkipToGraph}
          className="ml-auto inline-flex h-11 items-center rounded-[10px] px-4 text-[13px] text-sf-fg4 hover:text-sf-fg2 transition-colors"
        >
          Skip to Graph Mode
        </button>
      </div>
    </div>
  );
}

import type { BuilderView } from '../../../core/stores/builderStore';

interface Props {
  current: BuilderView;
  onChange: (v: BuilderView) => void;
}

const MODES: { key: BuilderView; label: string; num: string }[] = [
  { key: 'goal', label: 'Goal', num: '01' },
  { key: 'scene', label: 'Scene', num: '02' },
  { key: 'graph', label: 'Graph', num: '03' },
  { key: 'validate', label: 'Validate', num: '04' },
];

export function BuilderModeSwitcher({ current, onChange }: Props) {
  return (
    <div
      className="inline-flex items-center gap-[2px] rounded-[10px] border border-sf-border bg-sf-elev1 p-1"
      role="tablist"
      aria-label="Builder mode"
    >
      {MODES.map(({ key, label, num }) => (
        <button
          key={key}
          role="tab"
          aria-selected={current === key}
          data-testid={`mode-tab-${key}`}
          onClick={() => onChange(key)}
          className={[
            'rounded-[7px] px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
            current === key
              ? 'bg-sf-accent text-white'
              : 'text-sf-fg4 hover:text-sf-fg2',
          ].join(' ')}
        >
          <span className="mr-1 opacity-70">{num}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

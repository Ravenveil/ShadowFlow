/** 知识与记忆：三块独立开关 + 用量条 + 单块清空。 */
import { SETTINGS_COPY } from '../../content/settings';
import type { MemoryZone } from '../../data/types';
import { Meter, Switch, Tag, Tile, useFlash } from '../primitives';
import type { SectionProps } from '../types';

const C = SETTINGS_COPY.memory;

const TONE = { lessons: 'teal', profile: 'violet', river: 'blue' } as const;

export function MemorySection({ settings, onPatch }: SectionProps) {
  const { memory } = settings;
  const [flash, setFlash] = useFlash();

  const patchZone = (id: string, patch: Partial<MemoryZone>) =>
    onPatch({ memory: memory.map((z) => (z.id === id ? { ...z, ...patch } : z)) });

  return (
    <div className="st-stack">
      <div className="st-list">
        {memory.map((z) => {
          const full = z.cap > 0 && z.used / z.cap >= 0.85;
          return (
            <div className="st-card" key={z.id} data-off={z.on ? undefined : 'true'}>
              <div className="st-card-head">
                <Tile tone={TONE[z.id as keyof typeof TONE] ?? 'slate'}>{z.label.slice(0, 1)}</Tile>
                <div className="st-card-text">
                  <b>{z.label}</b>
                  <span>{z.note}</span>
                </div>
                {full ? <Tag tone="warn">{C.full}</Tag> : null}
                <Switch
                  label={z.label}
                  on={z.on}
                  onChange={(on) => patchZone(z.id, { on })}
                />
              </div>
              <div className="st-card-body">
                <div className="st-meter-row">
                  <Meter used={z.used} cap={z.cap} tone={z.on ? undefined : 'slate'} />
                  <span className="st-value">{C.used(z.used, z.cap)}</span>
                  <button
                    className="st-btn st-btn--ghost"
                    title={C.clearHint}
                    onClick={() => {
                      patchZone(z.id, { used: 0 });
                      setFlash(C.cleared(z.label));
                    }}
                  >
                    {C.clear}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {flash ? <p className="st-flash">{flash}</p> : null}
    </div>
  );
}

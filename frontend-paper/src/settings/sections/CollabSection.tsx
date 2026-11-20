/** 协作：主控怎么派活、什么时候打断你。最后一项是并行上限（单选）。 */
import { SETTINGS_COPY } from '../../content/settings';
import type { PrefItem } from '../../data/types';
import { Row, Seg, Switch } from '../primitives';
import type { SectionProps } from '../types';

const C = SETTINGS_COPY.collab;

const PARALLEL = 'parallel';

export function CollabSection({ settings, onPatch }: SectionProps) {
  const { collab } = settings;

  const patchItem = (id: string, patch: Partial<PrefItem>) =>
    onPatch({ collab: collab.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div className="st-stack">
      {collab.map((item) =>
        item.value !== undefined ? (
          <Row key={item.id} label={item.label} note={item.note}>
            <Seg
              label={item.label}
              value={item.value}
              options={C.parallelOptions}
              onChange={(value) => patchItem(PARALLEL, { value })}
            />
          </Row>
        ) : (
          <Row key={item.id} label={item.label} note={item.note}>
            <Switch
              label={item.label}
              on={Boolean(item.on)}
              onChange={(on) => patchItem(item.id, { on })}
            />
          </Row>
        ),
      )}
    </div>
  );
}

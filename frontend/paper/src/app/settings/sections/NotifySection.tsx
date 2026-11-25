/** 通知：四类提醒开关 + 发一条测试。 */
import { SETTINGS_COPY } from '@/shared/content/settings';
import type { PrefItem } from '@/shared/data/types';
import { Row, Switch, useFlash } from '@/app/settings/primitives';
import type { SectionProps } from '@/app/settings/types';

const C = SETTINGS_COPY.notify;

export function NotifySection({ settings, onPatch }: SectionProps) {
  const { notify } = settings;
  const [flash, setFlash] = useFlash();

  const patchItem = (id: string, patch: Partial<PrefItem>) =>
    onPatch({ notify: notify.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div className="st-stack">
      {notify.map((item) => (
        <Row key={item.id} label={item.label} note={item.note}>
          <Switch
            label={item.label}
            on={Boolean(item.on)}
            onChange={(on) => patchItem(item.id, { on })}
          />
        </Row>
      ))}

      <div className="st-actions">
        <button className="st-btn" onClick={() => setFlash(C.tested)}>
          {C.test}
        </button>
        {flash ? <span className="st-flash">{flash}</span> : null}
      </div>
    </div>
  );
}

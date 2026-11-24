/** 数据与隐私：三个开关 + 导出工作区 + 重置演示数据 + 关于。 */
import { useEffect, useState } from 'react';
import { SETTINGS_COPY } from '../../content/settings';
import type { PrefItem } from '../../data/types';
import { Row, Switch, useFlash } from '../primitives';
import type { SectionProps } from '../types';

const C = SETTINGS_COPY.data;

export function DataSection({
  settings,
  onPatch,
  onExport,
  onReset,
}: SectionProps & { onExport: () => void; onReset: () => Promise<void> }) {
  const { privacy } = settings;
  const [flash, setFlash] = useFlash();
  const [armed, setArmed] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 三秒内不点第二次就自动撤销「确认重置」
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const patchItem = (id: string, patch: Partial<PrefItem>) =>
    onPatch({ privacy: privacy.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const reset = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setResetting(true);
    try {
      await onReset();
      setFlash(C.resetDone);
    } finally {
      setResetting(false);
      setArmed(false);
    }
  };

  return (
    <div className="st-stack">
      {privacy.map((item) => (
        <Row key={item.id} label={item.label} note={item.note}>
          <Switch
            label={item.label}
            on={Boolean(item.on)}
            onChange={(on) => patchItem(item.id, { on })}
          />
        </Row>
      ))}

      <div className="st-block">
        <div className="st-block-text">
          <b>{C.exportTitle}</b>
          <span>{C.exportNote}</span>
        </div>
        <button
          className="st-btn st-btn--solid"
          onClick={() => {
            onExport();
            setFlash(C.exported);
          }}
        >
          {C.exportBtn}
        </button>
      </div>

      <div className="st-block" data-danger="true">
        <div className="st-block-text">
          <b>{C.resetTitle}</b>
          <span>{C.resetNote}</span>
        </div>
        <button className="st-btn st-btn--danger" onClick={() => void reset()} disabled={resetting}>
          {armed ? C.resetConfirm : C.resetBtn}
        </button>
      </div>

      <div className="st-about">
        <b>{C.aboutTitle}</b>
        <span>{C.version}</span>
        <span>{C.build}</span>
      </div>

      {flash ? <p className="st-flash">{flash}</p> : null}
    </div>
  );
}

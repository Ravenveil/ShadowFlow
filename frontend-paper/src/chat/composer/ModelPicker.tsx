/**
 * ModelPicker — 输入框里的模型选择器。
 *
 * 数据是 `ComposerData.models`（按 group 分组），组件不认识任何具体模型名；
 * 现在选中的是 id，显示时再去表里查 label，所以模型改名不用动组件。
 */
import { useMemo, useRef, useState } from 'react';
import { COMPOSER } from '../../content/app';
import type { ModelRef } from '../../data/types';
import { IconChevronDown, IconSparkle } from '../../shell/icons';
import { useDismiss } from '../../ui/useDismiss';

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelRef[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDismiss(open, boxRef, () => setOpen(false));

  const current = models.find((m) => m.id === value) ?? models[0];
  const groups = useMemo(() => {
    const map = new Map<string, ModelRef[]>();
    for (const m of models) {
      const list = map.get(m.group) ?? [];
      list.push(m);
      map.set(m.group, list);
    }
    return [...map.entries()];
  }, [models]);

  if (!current) return null;

  return (
    <div className="cp-anchor" ref={boxRef}>
      <button
        type="button"
        className="composer-chip"
        aria-expanded={open}
        title={`${current.label}${current.note ? ` · ${current.note}` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSparkle size={13} />
        <span>{current.label}</span>
        <IconChevronDown size={12} />
      </button>

      {open ? (
        <div className="cp-pop cp-pop--model">
          <div className="cp-pop-head">{COMPOSER.modelTitle}</div>
          <div className="cp-pop-body">
            {groups.map(([group, list]) => (
              <div key={group} className="cp-pop-group">
                <div className="cp-pop-group-head">{group}</div>
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="cp-pop-row"
                    data-on={m.id === current.id ? 'true' : undefined}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <span className="cp-pop-row-main">
                      <span className="cp-pop-row-label">{m.label}</span>
                      {m.note ? <span className="cp-pop-row-desc">{m.note}</span> : null}
                    </span>
                    {m.id === current.id ? <span className="cp-pop-tick">✓</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

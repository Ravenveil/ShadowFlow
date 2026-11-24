/**
 * ModelPicker — 输入框里的模型选择器（按 group 分组）。
 *
 * 组件不认识任何具体模型，只吃 { id, label, group, note } 列表。
 */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { COMPOSER } from "../content/composer";
import { useDismiss } from "./useDismiss";

export type ComposerModel = {
  id: string;
  label: string;
  group: string;
  note?: string;
};

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ComposerModel[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDismiss(open, boxRef, () => setOpen(false));

  const current = models.find((m) => m.id === value) ?? models[0];
  const groups = useMemo(() => {
    const map = new Map<string, ComposerModel[]>();
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
        className="sf-composer-chip"
        aria-expanded={open}
        title={`${current.label}${current.note ? ` · ${current.note}` : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Sparkles size={13} />
        <span>{current.label}</span>
        <ChevronDown size={12} />
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
                    data-on={m.id === current.id ? "true" : undefined}
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

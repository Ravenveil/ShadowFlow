/**
 * KnowledgePicker — 知识包多选。勾上的包随本轮消息一起提交。
 */
import { useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { COMPOSER } from "../content/composer";
import { useDismiss } from "./useDismiss";

export type ComposerKnowledgePack = {
  id: string;
  name: string;
  desc?: string;
  docs: number;
};

export function KnowledgePicker({
  packs,
  value,
  onToggle,
}: {
  packs: ComposerKnowledgePack[];
  value: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useDismiss(open, boxRef, () => setOpen(false));

  return (
    <div className="cp-anchor" ref={boxRef}>
      <button
        type="button"
        className="sf-composer-chip"
        data-configured={value.length ? "true" : undefined}
        aria-expanded={open}
        title={COMPOSER.knowledge}
        onClick={() => setOpen((v) => !v)}
      >
        <BookOpen size={13} />
        {value.length ? <span>{value.length}</span> : null}
      </button>

      {open ? (
        <div className="cp-pop cp-pop--wide">
          <div className="cp-pop-head">{COMPOSER.knowledgeTitle}</div>
          <div className="cp-pop-body">
            {packs.length === 0 ? (
              <p className="cp-menu-empty">{COMPOSER.knowledgeEmpty}</p>
            ) : (
              packs.map((p) => {
                const on = value.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="cp-pop-row"
                    data-on={on ? "true" : undefined}
                    title={p.desc}
                    onClick={() => onToggle(p.id)}
                  >
                    <span className="cp-check" data-on={on ? "true" : undefined} />
                    <span className="cp-pop-row-main">
                      <span className="cp-pop-row-label">{p.name}</span>
                      {p.desc ? <span className="cp-pop-row-desc">{p.desc}</span> : null}
                    </span>
                    <span className="cp-pop-count">{COMPOSER.knowledgeDocs(p.docs)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

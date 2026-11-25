/**
 * KnowledgePicker — 知识包多选。勾上的包随本轮消息一起提交（Composer 负责带过去）。
 *
 * 按钮上显示已选数量，所以不占宽度也能看出「这轮引用了东西」。
 */
import { useRef, useState } from 'react';
import { COMPOSER } from '@/shared/content/app';
import type { KnowledgePack } from '@/shared/data/types';
import { IconBook } from '@/shared/ui/icons';
import { useDismiss } from '@/shared/ui/useDismiss';

export function KnowledgePicker({
  packs,
  value,
  onToggle,
}: {
  packs: KnowledgePack[];
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
        className="composer-chip"
        data-configured={value.length ? 'true' : undefined}
        aria-expanded={open}
        title={COMPOSER.knowledge}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBook size={13} />
        {value.length ? <span>{value.length}</span> : null}
      </button>

      {open ? (
        <div className="cp-pop cp-pop--wide">
          <div className="cp-pop-head">{COMPOSER.knowledgeTitle}</div>
          <div className="cp-pop-body">
            {packs.map((p) => {
              const on = value.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="cp-pop-row"
                  data-on={on ? 'true' : undefined}
                  title={p.desc}
                  onClick={() => onToggle(p.id)}
                >
                  <span className="cp-check" data-on={on ? 'true' : undefined} />
                  <span className="cp-pop-row-main">
                    <span className="cp-pop-row-label">{p.name}</span>
                    {p.desc ? <span className="cp-pop-row-desc">{p.desc}</span> : null}
                  </span>
                  <span className="cp-pop-count">{COMPOSER.knowledgeDocs(p.docs)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

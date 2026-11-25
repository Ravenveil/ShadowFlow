/**
 * KnowledgePane — 「知识库」的第二栏：这页要选的是**哪个知识包**。
 *
 * 列表来自 packsStore（与正文同一份快照），所以正文里新建完一个包，
 * 这一列立刻多一行，不需要谁去通知谁。
 */
import { useEffect } from 'react';
import { PANE } from '@/shared/content/views';
import { packKey, packTitle, packsStore } from '@/business/knowledge/packs';

export function KnowledgePane({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (key: string) => void;
}) {
  const { items: packs, state } = packsStore.useList();

  useEffect(() => {
    void packsStore.load();
  }, []);

  /** 没有选中就点亮第一个包：右侧总得有一份东西可看。 */
  useEffect(() => {
    if (selected) return;
    const key = packs[0] ? packKey(packs[0]) : '';
    if (key) onPick(key);
  }, [selected, packs, onPick]);

  return (
    <aside className="pane" aria-label={PANE.packs}>
      <div className="pane-scroll">
        {state === 'loading' && !packs.length ? (
          <div className="pane-state">{PANE.loading}</div>
        ) : null}
        {state === 'error' ? <div className="pane-state">{PANE.loadFailed}</div> : null}

        {packs.map((pack) => {
          const key = packKey(pack);
          return (
            <button
              key={key}
              type="button"
              className="pane-row"
              data-active={key === selected ? 'true' : undefined}
              aria-pressed={key === selected}
              onClick={() => onPick(key)}
            >
              <span className="pane-row-text">
                <strong>{packTitle(pack)}</strong>
                <small>
                  {PANE.sources(pack.stats?.sources ?? 0)} · {PANE.chunks(pack.stats?.chunks ?? 0)}
                </small>
              </span>
            </button>
          );
        })}

        {state === 'ready' && !packs.length ? (
          <div className="pane-state">{PANE.emptyPacks}</div>
        ) : null}
      </div>
    </aside>
  );
}

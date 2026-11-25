/**
 * HelpSheet — 快捷键说明（`/help` 与输入框右下角的问号都打开它）。
 *
 * 键位表来自 `content/app.ts` 的 COMPOSER.helpKeys，改文案不用动组件。
 */
import { useEffect } from 'react';
import { COMPOSER } from '@/shared/content/app';
import { IconClose, IconKeyboard } from '@/shared/ui/icons';

export function HelpSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cp-sheet-mask" onMouseDown={onClose}>
      <div
        className="cp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={COMPOSER.helpTitle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="cp-sheet-head">
          <span className="cp-sheet-title">
            <IconKeyboard size={15} />
            {COMPOSER.helpTitle}
          </span>
          <button className="sf-icon-btn" onClick={onClose} title={COMPOSER.close}>
            <IconClose size={15} />
          </button>
        </header>
        <div className="cp-sheet-body">
          <dl className="cp-keys">
            {COMPOSER.helpKeys.map(([keys, desc]) => (
              <div className="cp-keys-row" key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
          <p className="cp-sheet-note">{COMPOSER.helpCommands}</p>
        </div>
      </div>
    </div>
  );
}

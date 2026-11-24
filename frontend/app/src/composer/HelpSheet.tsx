/**
 * HelpSheet — 快捷键说明（`/help` 与工具栏键盘按钮都能打开）。
 */
import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { COMPOSER } from "../content/composer";

export function HelpSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
            <Keyboard size={15} />
            {COMPOSER.helpTitle}
          </span>
          <button type="button" className="cp-icon-btn" onClick={onClose} title={COMPOSER.close}>
            <X size={15} />
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

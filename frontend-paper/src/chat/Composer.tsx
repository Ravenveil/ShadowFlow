/**
 * Composer — 输入框 + 模型切换。文案与模型清单见 `content/app.ts` 的 COMPOSER。
 */
import { useRef, useState } from 'react';
import { COMPOSER } from '../content/app';
import { IconArrowUp, IconPaperclip, IconSlash, IconSparkle, IconChevronDown } from '../shell/icons';

/** 输入框最大自增高（px）——版式参数，改这里即可。 */
const MAX_GROW = 160;

export function Composer({
  onSend,
  placeholder,
  model,
  onModelChange,
}: {
  onSend: (text: string) => void;
  placeholder: string;
  model: string;
  onModelChange: (m: string) => void;
}) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_GROW)}px`;
  }

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
        />
        <div className="composer-bar">
          <div className="composer-bar-left">
            <button className="sf-icon-btn" title={COMPOSER.attach}>
              <IconPaperclip size={15} />
            </button>
            <button className="composer-chip" onClick={() => setMenu((v) => !v)}>
              <IconSparkle size={13} />
              <span>{model}</span>
              <IconChevronDown size={12} />
            </button>
            {menu ? (
              <div className="composer-menu">
                {COMPOSER.models.map((m) => (
                  <button
                    key={m}
                    data-active={m === model ? 'true' : undefined}
                    onClick={() => {
                      onModelChange(m);
                      setMenu(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : null}
            <button className="sf-icon-btn" title={COMPOSER.slash}>
              <IconSlash size={15} />
            </button>
            <button className="composer-at" title={COMPOSER.mention}>
              @
            </button>
          </div>
          <button className="composer-send" onClick={submit} disabled={!text.trim()} title={COMPOSER.send}>
            <IconArrowUp size={16} />
          </button>
        </div>
      </div>
      <div className="composer-hint">
        <span>{COMPOSER.hintKeys}</span>
        <span>{COMPOSER.hintTools}</span>
      </div>
    </div>
  );
}

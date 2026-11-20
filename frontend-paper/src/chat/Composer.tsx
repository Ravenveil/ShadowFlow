import { useRef, useState } from 'react';
import { IconArrowUp, IconPaperclip, IconSlash, IconSparkle, IconChevronDown } from '../shell/icons';

const MODELS = ['Claude Sonnet 4.6', 'GPT-5.2', 'Gemini 3 Pro'];

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
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
            <button className="sf-icon-btn" title="添加附件">
              <IconPaperclip size={15} />
            </button>
            <button className="composer-chip" onClick={() => setMenu((v) => !v)}>
              <IconSparkle size={13} />
              <span>{model}</span>
              <IconChevronDown size={12} />
            </button>
            {menu ? (
              <div className="composer-menu">
                {MODELS.map((m) => (
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
            <button className="sf-icon-btn" title="斜杠命令">
              <IconSlash size={15} />
            </button>
            <button className="composer-at" title="提及角色">
              @
            </button>
          </div>
          <button className="composer-send" onClick={submit} disabled={!text.trim()} title="发送">
            <IconArrowUp size={16} />
          </button>
        </div>
      </div>
      <div className="composer-hint">
        <span>Enter 发送 · Shift + Enter 换行</span>
        <span>@ 提及角色 · / 调用命令</span>
      </div>
    </div>
  );
}

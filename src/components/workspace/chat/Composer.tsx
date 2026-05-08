/**
 * Composer — 消息输入框（textarea + 斜杠命令 + @ 提及提示 + 工具栏）
 */

import { useState, useRef, useCallback } from 'react';
import { FBIcons } from '../FBAtoms';
import { CI } from './icons';
import { SLASH_COMMANDS } from './mockData';

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [skillLink, setSkillLink] = useState<string | null>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    try {
      const url = new URL(pasted.trim());
      if (url.searchParams.has('import')) {
        e.preventDefault();
        setSkillLink(pasted.trim());
        return;
      }
    } catch {
      // not a URL — fall through to default paste
    }
  }, []);

  const showSlash = text.startsWith('/') && text.length > 0;
  const filteredCmds = showSlash
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(text.split(' ')[0]))
    : SLASH_COMMANDS;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredCmds.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredCmds.length) % filteredCmds.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (filteredCmds[slashIdx]) { setText(filteredCmds[slashIdx].cmd + ' '); }
        return;
      }
      if (e.key === 'Escape') { setText(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) { onSend(text.trim()); setText(''); }
    }
  };

  const applySlash = (cmd: string) => {
    setText(cmd + ' ');
    textareaRef.current?.focus();
  };

  const showMentionHint = text.includes('@') && !text.endsWith('@');

  return (
    <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--t-border)', background: 'var(--t-panel)', position: 'relative', flexShrink: 0 }}>
      {/* skill link banner */}
      {skillLink && (
        <div style={{
          marginBottom: 8, padding: '7px 10px', borderRadius: 7,
          background: 'var(--t-accent-tint)', border: '1px solid color-mix(in oklab, var(--accent) 40%, transparent)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--t-accent-bright)', fontWeight: 700 }}>↓ 检测到 skill 链接</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-fg-3)' }}>{skillLink}</span>
          <button
            className="fb-btn fb-btn-primary fb-btn-sm"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => { onSend(`/import ${skillLink}`); setSkillLink(null); }}
          >导入</button>
          <button
            className="fb-btn fb-btn-ghost fb-btn-sm"
            style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={() => setSkillLink(null)}
          >×</button>
        </div>
      )}
      {/* slash command popover */}
      {showSlash && filteredCmds.length > 0 && (
        <div data-testid="slash-popup" style={{
          position: 'absolute', bottom: 84, left: 18, width: 340, zIndex: 10,
          background: 'var(--skin-panel)', border: '1px solid var(--t-border)', borderRadius: 9,
          boxShadow: 'var(--shadow-pop)', padding: 5,
        }}>
          <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', letterSpacing: '0.06em' }}>SLASH COMMANDS</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>↑↓ 选 · ↵ 用</span>
          </div>
          {filteredCmds.map((it, i) => (
            <div key={it.cmd} onClick={() => applySlash(it.cmd)} data-testid={`slash-${it.cmd.slice(1)}`} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 5,
              background: i === slashIdx ? 'var(--t-accent-tint)' : 'transparent', cursor: 'pointer',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: i === slashIdx ? 'var(--t-accent-bright)' : 'var(--t-fg-2)', minWidth: 72 }}>{it.cmd}</span>
              <span style={{ fontSize: 11.5, color: 'var(--t-fg-3)', flex: 1 }}>{it.d}</span>
            </div>
          ))}
        </div>
      )}

      {/* mention hint */}
      {showMentionHint && (
        <div style={{ position: 'absolute', top: -46, right: 18, padding: '4px 9px', background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>@ 提及面板可按角色筛选</div>
      )}

      <div style={{ background: 'var(--skin-panel)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          {[
            [CI.at, '@'], [CI.slash, '/'], [CI.smile, '表情'], [CI.clip, '附件'],
            [CI.scissor, '截图'], [CI.task, '任务'], [CI.bot, 'AI ⌘K'],
          ].map(([ic, t], i) => (
            <span key={i} title={t as string} onClick={() => { if (t === '/') { setText('/'); textareaRef.current?.focus(); } }} style={{
              width: 26, height: 24, borderRadius: 5,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--t-fg-4)', cursor: 'pointer',
            }}><span style={{ width: 14, height: 14, display: 'flex' }}>{ic}</span></span>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', padding: '0 6px' }}>Markdown</span>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <textarea
            ref={textareaRef}
            data-testid="composer-textarea"
            className="fb-composer-area"
            value={text}
            onChange={e => { setText(e.target.value); setSlashIdx(0); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="发消息 · / 命令 · @ 提及"
            rows={2}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 7px', borderTop: '1px solid var(--border-subtle)', background: 'var(--t-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>⏎ 发送 · ⇧⏎ 换行 · / 命令</span>
            {text.trim() && (
              <>
                <span className="fb-dot fb-dot-ok" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>{text.length} 字</span>
              </>
            )}
          </div>
          <button
            data-testid="composer-send"
            className="fb-btn fb-btn-primary fb-btn-sm"
            disabled={!text.trim()}
            onClick={() => { if (text.trim()) { onSend(text.trim()); setText(''); } }}
            style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: text.trim() ? 1 : 0.4 }}
          >
            <span style={{ width: 12, height: 12, display: 'flex' }}>{FBIcons.send}</span> 发送
          </button>
        </div>
      </div>
    </div>
  );
}

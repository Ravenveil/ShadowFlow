/**
 * ComposerFB · 底部输入区（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 498-535（composer / slash-pop / comp-shell / comp-tools / comp-area / comp-foot）
 *   - HTML: 行 1276-1309
 *
 * Props 与旧 ChatPage.tsx 内 RichComposer 对齐。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AtSign, Slash, Smile, Paperclip, Scissors, CheckSquare, Sparkles, Send,
} from 'lucide-react';
import styles from './chatFB.module.css';
import ModelPicker from '../ModelPicker';
import type { ModelPickerValue } from '../../common/constants/modelPicker';

export interface ComposerFBProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** 运行成 Skill（设计稿无此按钮，保留与旧 RichComposer 兼容） */
  onRunSkill?: () => void;
  loading?: boolean;
  /** i18n 函数，可选 */
  t?: (k: string) => string;
  placeholder?: string;
  /**
   * 2026-05-29 · 模型/执行器选择器。状态由父（ChatPage）持有——发送时要把
   * executor/model 拼进请求。未传则不渲染（保持向后兼容）。
   */
  modelPicker?: {
    value: ModelPickerValue;
    onChange: (v: ModelPickerValue) => void;
    onNavigateSettings?: (target: string) => void;
  };
}

const SLASH_CMDS: Array<{ cmd: string; d: string; sel?: boolean }> = [
  { cmd: '/run', d: '触发 team 跑一轮', sel: true },
  { cmd: '/approve', d: '批准当前 gate' },
  { cmd: '/retry', d: '让 agent 重写' },
  { cmd: '/assign', d: '把任务派给 agent' },
  { cmd: '/pin', d: '置顶为 brief 卡片' },
];

export default function ComposerFB({
  value,
  onChange,
  onSend,
  onRunSkill,
  loading = false,
  t,
  placeholder,
  modelPicker,
}: ComposerFBProps) {
  const tr = (k: string, fb: string) => {
    if (!t) return fb;
    const v = t(k);
    return v && v !== k ? v : fb;
  };
  const [slashOpen, setSlashOpen] = useState(false);
  const slashPopRef = useRef<HTMLDivElement>(null);
  const slashBtnRef = useRef<HTMLButtonElement>(null);

  // 点击弹窗与「/命令」按钮之外的任何地方 → 收起 slash 菜单。排除按钮本身，
  // 否则开着时点按钮会先被这里关、再被按钮 onClick 切回，等于关不掉。
  useEffect(() => {
    if (!slashOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (slashPopRef.current?.contains(target)) return;
      if (slashBtnRef.current?.contains(target)) return;
      setSlashOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [slashOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !loading) onSend();
    }
    if (e.key === '/' && value === '') {
      setSlashOpen(true);
    }
    if (e.key === 'Escape') {
      setSlashOpen(false);
    }
  };

  const canSend = !!value.trim() && !loading;

  return (
    <div className={styles.composer}>
      {slashOpen && (
        <div ref={slashPopRef} className={styles.slashPop} role="listbox">
          <div className={styles.slashHead}>
            <span className={styles.slashLab}>SLASH COMMANDS</span>
            <span className={styles.slashHint}>↑↓ 选 · ↵ 用</span>
          </div>
          {SLASH_CMDS.map((it, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={!!it.sel}
              className={`${styles.slashItem} ${it.sel ? styles.slashItemSel : ''}`}
              onClick={() => {
                onChange(it.cmd + ' ');
                setSlashOpen(false);
              }}
            >
              <span className={styles.slashCmd}>{it.cmd}</span>
              <span className={styles.slashDesc}>{it.d}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.compShell}>
        {/* 工具栏 */}
        <div className={styles.compTools}>
          <button type="button" className={styles.compToolBtn} title="@提及">
            <AtSign strokeWidth={1.7} />
          </button>
          <button
            ref={slashBtnRef}
            type="button"
            className={styles.compToolBtn}
            title="/命令"
            onClick={() => setSlashOpen((p) => !p)}
          >
            <Slash strokeWidth={1.7} />
          </button>
          <button type="button" className={styles.compToolBtn} title="表情">
            <Smile strokeWidth={1.7} />
          </button>
          <button type="button" className={styles.compToolBtn} title="附件">
            <Paperclip strokeWidth={1.7} />
          </button>
          <button type="button" className={styles.compToolBtn} title="截图">
            <Scissors strokeWidth={1.7} />
          </button>
          <button type="button" className={styles.compToolBtn} title="任务">
            <CheckSquare strokeWidth={1.7} />
          </button>
          {onRunSkill && (
            <button
              type="button"
              className={styles.compToolBtn}
              title="技能 ⌘K"
              onClick={onRunSkill}
              data-testid="chat-run-skill-button"
            >
              <Sparkles strokeWidth={1.7} />
            </button>
          )}
          {modelPicker && (
            <div style={{ marginLeft: 4 }}>
              <ModelPicker
                value={modelPicker.value}
                onChange={modelPicker.onChange}
                onNavigateSettings={modelPicker.onNavigateSettings}
                variant="compact"
              />
            </div>
          )}
          <span className={styles.compMd}>Markdown</span>
        </div>

        {/* 输入区 */}
        <textarea
          className={styles.compArea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ?? tr('chat.composerPlaceholder', '输入消息 · 支持 Markdown · @ 提及 / 触发 skill')
          }
          rows={2}
        />

        {/* 底部 */}
        <div className={styles.compFoot}>
          <div className={styles.compFootL}>
            <span className={styles.compKbd}>
              {tr('chat.composerHint', '⏎ 发送 · ⇧⏎ 换行 · / 命令')}
            </span>
            <span className={styles.dotOk} />
            <span className={styles.compSaved}>已保存草稿 · 0G synced</span>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
            disabled={!canSend}
            onClick={onSend}
          >
            <Send size={13} strokeWidth={1.6} />
            {loading ? tr('chat.sending', '发送中…') : tr('chat.send', '发送')}
          </button>
        </div>
      </div>
    </div>
  );
}

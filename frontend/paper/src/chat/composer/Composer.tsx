/**
 * Composer — 输入区（功能对齐旧前端 NeoComposer）。
 *
 * 自带能力：多行自增高、Enter / ⌘⏎ 发送、`@` 提及成员、`/` 斜杠命令、
 * 模型选择、知识包多选、附件（点选 + 拖拽 + 图片缩略图）、语音输入、
 * 发送中原地变停止、提交错误条、轻提示、快捷键面板。
 *
 * 它只管**交互**：发什么由 props 的 onSend 决定，数据（成员 / 命令 / 知识包）
 * 全部由上游从 `data/source.ts` 取来传进来 —— 组件不认识任何具体项。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPOSER } from '../../content/app';
import type {
  ComposerData,
  ComposerCommand,
  ModelRef,
  Outbound,
  RosterMember,
} from '../../data/types';
import {
  IconArrowUp,
  IconClose,
  IconKeyboard,
  IconMic,
  IconPaperclip,
  IconSlash,
  IconStop,
  IconCheck,
} from '../../shell/icons';
import { AttachmentBar } from './AttachmentBar';
import { HelpSheet } from './HelpSheet';
import { KnowledgePicker } from './KnowledgePicker';
import { ModelPicker } from './ModelPicker';
import { TriggerMenu, type MenuItem, type TriggerMenuHandle } from './TriggerMenu';
import { detectTrigger, matches, replaceRange, type DetectedTrigger } from './trigger';
import { useAttachments } from './useAttachments';
import { useVoice, formatSeconds } from './useVoice';

/** 输入框最大自增高（px）——版式参数，改这里即可。 */
const MAX_GROW = 180;
const TOAST_MS = 1800;

export function Composer({
  placeholder,
  roster,
  composer,
  model,
  onModelChange,
  sending,
  onSend,
  onStop,
  transcribe,
  onInspect,
}: {
  placeholder: string;
  roster: RosterMember[];
  composer: ComposerData;
  model: string;
  onModelChange: (id: string) => void;
  sending: boolean;
  onSend: (out: Outbound) => Promise<void>;
  onStop: () => void;
  transcribe: (audio: Blob) => Promise<string>;
  onInspect: () => void;
}) {
  const [text, setText] = useState('');
  const [trigger, setTrigger] = useState<DetectedTrigger | null>(null);
  const [knowledge, setKnowledge] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<TriggerMenuHandle>(null);
  const attachments = useAttachments();

  const models: ModelRef[] = composer.models;
  const commands: ComposerCommand[] = composer.commands;

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** 自增高：先归零再按 scrollHeight 设，否则删字不会缩回去。 */
  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_GROW)}px`;
  }, []);

  /** 改文案并把光标放回指定位置（菜单插入后不能丢焦点）。 */
  const setTextAt = useCallback(
    (next: { text: string; caret: number }) => {
      setText(next.text);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        grow(el);
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [grow],
  );

  const hasContent = text.trim().length > 0 || attachments.items.length > 0;

  const submit = useCallback(async () => {
    if (sending) return;
    const body = text.trim();
    if (!body && !attachments.items.length) return;
    try {
      await onSend({
        text: body,
        attachments: attachments.items.length ? attachments.items : undefined,
        knowledge: knowledge.length ? knowledge : undefined,
        model,
      });
      setText('');
      attachments.clear();
      setKnowledge([]);
      setError(null);
      setTrigger(null);
      const el = taRef.current;
      if (el) el.style.height = 'auto';
    } catch (err) {
      setError(COMPOSER.submitFailed(err instanceof Error ? err.message : String(err)));
    }
  }, [attachments, knowledge, model, onSend, sending, text]);

  const runAction = useCallback(
    (action: NonNullable<ComposerCommand['action']>) => {
      if (action === 'clear') {
        setText('');
        attachments.clear();
        setKnowledge([]);
        const el = taRef.current;
        if (el) el.style.height = 'auto';
        setToast(COMPOSER.cleared);
      } else if (action === 'help') {
        setHelpOpen(true);
      } else {
        onInspect();
      }
    },
    [attachments, onInspect],
  );

  const menuItems: MenuItem[] = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query;
    if (trigger.mode === '@') {
      return roster
        .filter((m) => matches(q, m.name, m.role, m.short))
        .map<MenuItem>((m) => ({
          id: `m:${m.id}`,
          label: `@${m.name}`,
          desc: m.role,
          group: COMPOSER.menuGroupMember,
        }));
    }
    return commands
      .filter((c) => matches(q, c.name, c.desc))
      .map<MenuItem>((c) => ({
        id: `c:${c.id}`,
        label: c.name,
        desc: c.desc,
        group: c.insert ? COMPOSER.menuGroupTemplate : COMPOSER.menuGroupCommand,
      }));
  }, [commands, roster, trigger]);

  const pick = useCallback(
    (item: MenuItem) => {
      if (!trigger) return;
      if (item.id.startsWith('m:')) {
        setTextAt(
          replaceRange(text, trigger.start, trigger.end, `${item.label} `),
        );
        setTrigger(null);
        return;
      }
      const cmd = commands.find((c) => `c:${c.id}` === item.id);
      if (!cmd) return;
      if (cmd.action) {
        setTextAt(replaceRange(text, trigger.start, trigger.end, ''));
        setTrigger(null);
        runAction(cmd.action);
        return;
      }
      setTextAt(replaceRange(text, trigger.start, trigger.end, cmd.insert ?? ''));
      setTrigger(null);
    },
    [commands, runAction, setTextAt, text, trigger],
  );

  /** 语音转写结果追加到末尾（不在中间插，避免打乱用户已写的内容）。 */
  const voice = useVoice({
    onText: (spoken) => {
      const joined = text.trim() ? `${text.trimEnd()} ${spoken}` : spoken;
      setTextAt({ text: joined, caret: joined.length });
      setToast(COMPOSER.voiceAppended);
    },
    onError: (msg) => setError(msg),
    transcribe,
  });

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    grow(e.target);
    setTrigger(detectTrigger(v, e.target.selectionStart ?? v.length));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 菜单开着时先让菜单吃键（↑↓↵TabEsc），否则回车会误发
    if (trigger && menuRef.current?.key(e)) {
      if (e.key === 'Escape') setTrigger(null);
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  /** 点 `@` / `/` 按钮：在光标处补上触发符并把菜单叫出来。 */
  const insertTrigger = (mode: '@' | '/') => {
    const el = taRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const pad = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const ins = `${pad}${mode}`;
    const next = replaceRange(text, caret, caret, ins);
    setTextAt(next);
    setTrigger({ mode, query: '', start: caret + pad.length, end: caret + ins.length });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files?.length) attachments.add(files);
  };

  const voiceBusy = voice.status === 'starting' || voice.status === 'transcribing';

  return (
    <div className="composer">
      <div
        className="composer-box"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {dragging ? (
          <div className="cp-drop">
            <IconPaperclip size={20} />
            <span>{COMPOSER.dropHint}</span>
          </div>
        ) : null}

        {attachments.items.length ? (
          <AttachmentBar
            items={attachments.items}
            onRemove={attachments.remove}
            removeLabel={COMPOSER.attachRemove}
          />
        ) : null}

        <div className="composer-input-wrap">
          <textarea
            ref={taRef}
            className="composer-input"
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onSelect={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setTrigger(detectTrigger(el.value, el.selectionStart ?? 0));
            }}
          />
          <TriggerMenu
            ref={menuRef}
            open={trigger !== null}
            title={trigger?.mode === '/' ? COMPOSER.menuCommandTitle : COMPOSER.menuMentionTitle}
            items={menuItems}
            query={trigger?.query ?? ''}
            onPick={pick}
          />
        </div>

        <div className="composer-bar">
          <div className="composer-bar-left">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="cp-file"
              onChange={(e) => {
                if (e.target.files?.length) attachments.add(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="sf-icon-btn"
              title={COMPOSER.attach}
              onClick={() => fileRef.current?.click()}
            >
              <IconPaperclip size={15} />
            </button>
            <KnowledgePicker
              packs={composer.knowledge}
              value={knowledge}
              onToggle={(id) =>
                setKnowledge((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
            />
            <ModelPicker models={models} value={model} onChange={onModelChange} />
            <button
              type="button"
              className="sf-icon-btn"
              title={COMPOSER.slash}
              onClick={() => insertTrigger('/')}
            >
              <IconSlash size={15} />
            </button>
            <button
              type="button"
              className="composer-at"
              title={COMPOSER.mention}
              onClick={() => insertTrigger('@')}
            >
              @
            </button>

            {voice.status === 'recording' ? (
              <div className="cp-rec">
                <span className="cp-rec-pill">
                  <span className="cp-rec-dot" />
                  <span>{formatSeconds(voice.seconds)}</span>
                </span>
                <button
                  type="button"
                  className="cp-rec-btn cp-rec-btn--ok"
                  title={COMPOSER.voiceStop}
                  onClick={voice.stop}
                >
                  <IconCheck size={13} />
                </button>
                <button
                  type="button"
                  className="cp-rec-btn"
                  title={COMPOSER.voiceCancel}
                  onClick={voice.cancel}
                >
                  <IconClose size={13} />
                </button>
              </div>
            ) : voice.supported ? (
              <button
                type="button"
                className="sf-icon-btn"
                title={
                  voice.status === 'starting'
                    ? COMPOSER.voiceStarting
                    : voice.status === 'transcribing'
                      ? COMPOSER.voiceTranscribing
                      : COMPOSER.voice
                }
                disabled={voiceBusy}
                onClick={voice.start}
              >
                {voiceBusy ? <span className="cp-spin" /> : <IconMic size={15} />}
              </button>
            ) : null}
          </div>

          <div className="composer-bar-spacer" />

          <button
            type="button"
            className="sf-icon-btn cp-help-btn"
            title={COMPOSER.helpTitle}
            onClick={() => setHelpOpen(true)}
          >
            <IconKeyboard size={15} />
          </button>

          {sending ? (
            <button type="button" className="composer-send cp-stop" title={COMPOSER.stop} onClick={onStop}>
              <IconStop size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="composer-send"
              onClick={() => void submit()}
              disabled={!hasContent}
              title={COMPOSER.send}
            >
              <IconArrowUp size={16} />
            </button>
          )}
        </div>

        {error ? (
          <div className="cp-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} title={COMPOSER.close}>
              <IconClose size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="composer-hint">
        <span>{COMPOSER.hintKeys}</span>
        <span>{COMPOSER.hintTools}</span>
      </div>

      {toast ? (
        <div className="cp-toast" role="status">
          {toast}
        </div>
      ) : null}

      {helpOpen ? <HelpSheet onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}

/**
 * StudioChat — Studio 中栏：与选中的 Agent / Team 对话（真实流式 + 统一气泡）。
 *
 * OWNER: chat-unify。本 round 兑现 reviewer punch-list：
 *  1) 用 StudioMessageRow 的回合分组（chat-message--grouped + AvatarSpacer，一个
 *     回合一个头像、整列对齐）替换原先各自为政的左右气泡 —— 把「乱」治好。
 *  2) 真实流式：onSend 不传时内置接 run-session SSE（createRunSession +
 *     subscribeRunSession）。agent / team 目标都走 run-session（mode=single/team），
 *     onText 增量累积进 assistant 气泡，tool-call / 思考块同列展示，error 态收口。
 *     移除原「（占位）echo」终态。
 *  3) contextFolder（右栏选中工作目录）透传为后端 cwd —— 在选中目录里干活。
 *
 * 保留 polish owner 已落地的 footer：斜杠命令快捷栏 + SlashCommandMenu +
 * ComposerTokenMeter（实时 used vs 模型窗口，hermes ContextGauge）。
 *
 * 复用：
 *  - src/components/composer/UnifiedComposer.tsx（chat variant 输入条）
 *  - src/api/runSessions.ts（createRunSession + subscribeRunSession SSE）
 *  - src/components/studio/StudioMessageRow.tsx（统一气泡 + 回合分组）
 *  - ComposerTokenMeter / SlashCommandMenu / studioTokens（polish owner）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Slash, Bot, Users, FolderOpen } from 'lucide-react';
import { UnifiedComposer, type UnifiedComposerSubmitPayload } from '../composer/UnifiedComposer';
import { ComposerTokenMeter } from './ComposerTokenMeter';
import {
  SlashCommandMenu,
  defaultStudioSlashCommands,
  type SlashCommand,
} from './SlashCommandMenu';
import { estimateTokens, currentModelWindow } from './studioTokens';
import { StudioMessageRow, isContinuation, type StudioMessage, type StudioToolRow } from './StudioMessageRow';
import {
  createRunSession,
  subscribeRunSession,
  abortRunSession,
  type ToolCallEvent,
} from '../../api/runSessions';

export interface StudioChatTarget {
  kind: 'agent' | 'team';
  id: string;
  name: string;
}

// StudioMessage 现统一从 StudioMessageRow 导出（含 role/system、tools、error、
// streaming、attachments 等），这里 re-export 保持既有导入兼容。
export type { StudioMessage } from './StudioMessageRow';

export interface StudioChatProps {
  /** 当前对话对象（左栏选中的 agent / team）。null = 未选择。 */
  target?: StudioChatTarget | null;
  /** 右栏选中的工作目录（绑定为对话 contextFolder，透传给后端 cwd）。 */
  contextFolder?: string;
  /**
   * 可选外部发送处理器。传入则完全接管发送；不传则用内置 run-session SSE 流式
   * （默认行为，保证 /studio 开箱即用，不再是占位 echo）。
   */
  onSend?: (text: string, target: StudioChatTarget | null) => Promise<void> | void;
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StudioChat({ target, contextFolder, onSend }: StudioChatProps) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [seedText, setSeedText] = useState<string | undefined>(undefined);
  const [seedKey, setSeedKey] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // 标记挂载后新增的消息，仅它们走入场动画（历史不抖）。
  const seenIds = useRef<Set<string>>(new Set());

  const nextId = (p: string) => `${p}${seq.current++}`;

  // ── 真实用量：累加所有消息文本估算 contextTokens，对当前选中模型窗口取比。
  const usedTokens = useMemo(
    () => messages.reduce((sum, m) => sum + estimateTokens(m.text), 0),
    [messages],
  );
  const modelWindow = useMemo(() => currentModelWindow(), [messages.length]);

  // 自动滚到底（新消息 / 流式增量）。
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 卸载时断开 SSE，避免泄漏。
  useEffect(
    () => () => {
      unsubRef.current?.();
      if (activeSessionRef.current) void abortRunSession(activeSessionRef.current);
    },
    [],
  );

  // 切换对话对象时收口当前流（不清历史，让用户可回看）。
  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    if (activeSessionRef.current) {
      void abortRunSession(activeSessionRef.current);
      activeSessionRef.current = null;
    }
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.kind]);

  const patchMsg = useCallback(
    (id: string, patch: (prev: StudioMessage) => StudioMessage) => {
      setMessages((list) => list.map((mm) => (mm.id === id ? patch(mm) : mm)));
    },
    [],
  );

  // 内置流式：创建 run-session 并把 SSE 增量累积进 assistant 气泡。
  const runViaSse = useCallback(
    async (text: string, tgt: StudioChatTarget) => {
      setBusy(true);
      const assistantId = nextId('a');
      seenIds.current.add(assistantId);
      setMessages((list) => [
        ...list,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          senderName: tgt.name,
          kind: tgt.kind,
          streaming: true,
          timestamp: nowTime(),
        },
      ]);

      try {
        const resp = await createRunSession({
          goal: text,
          mode: tgt.kind === 'team' ? 'team' : 'single',
          // 右栏工作目录 → 后端 cwd（cli:/acp:/mcp: executor 生效；空则后端回退）。
          cwd: contextFolder || undefined,
          // 复用 RunSessionPage 的 BYOK 选择，保持与现有体验一致。
          executor: localStorage.getItem('sf.defaultExecutor') || undefined,
          model: localStorage.getItem('sf.model') || undefined,
        });
        activeSessionRef.current = resp.session_id;

        const toolMap = new Map<string, StudioToolRow>();
        const applyTool = (ev: ToolCallEvent) => {
          toolMap.set(ev.id, {
            id: ev.id,
            tool: ev.tool,
            title: ev.title || ev.input_summary || undefined,
            status: ev.status,
            resultSummary: ev.result_summary,
          });
          const tools = Array.from(toolMap.values());
          patchMsg(assistantId, (prev) => ({ ...prev, tools }));
        };

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            patchMsg(assistantId, (prev) => ({ ...prev, streaming: false }));
            activeSessionRef.current = null;
            unsubRef.current = null;
            resolve();
          };
          unsubRef.current = subscribeRunSession(resp.session_id, {
            onText: (d) => {
              patchMsg(assistantId, (prev) => ({ ...prev, text: prev.text + (d.text ?? '') }));
            },
            onThinkingChunk: (d) => {
              patchMsg(assistantId, (prev) => ({
                ...prev,
                reasoning: (prev.reasoning ?? '') + (d.text ?? ''),
              }));
            },
            onToolCall: applyTool,
            onComplete: () => finish(),
            onServerError: (msg) => {
              patchMsg(assistantId, (prev) => ({
                ...prev,
                streaming: false,
                error: true,
                text: prev.text || msg,
              }));
              finish();
            },
            onError: () => {
              patchMsg(assistantId, (prev) => ({
                ...prev,
                streaming: false,
                error: prev.text ? prev.error : true,
                text: prev.text || '连接中断，请重试。',
              }));
              finish();
            },
          });
        });
      } catch (err) {
        patchMsg(assistantId, (prev) => ({
          ...prev,
          streaming: false,
          error: true,
          text: prev.text || (err instanceof Error ? err.message : '发送失败'),
        }));
      } finally {
        setBusy(false);
      }
    },
    [contextFolder, patchMsg],
  );

  const handleSubmit = useCallback(
    async (p: UnifiedComposerSubmitPayload) => {
      const text = p.text.trim();
      if (!text || busy) return;

      const userId = nextId('u');
      seenIds.current.add(userId);
      setMessages((list) => [
        ...list,
        {
          id: userId,
          role: 'user',
          text,
          senderName: '我',
          timestamp: nowTime(),
          attachments: p.attachments?.map((a) => ({ id: a.id, label: a.label, meta: a.meta })),
        },
      ]);

      if (onSend) {
        await onSend(text, target ?? null);
        return;
      }
      if (!target) {
        const sysId = nextId('s');
        seenIds.current.add(sysId);
        setMessages((list) => [
          ...list,
          { id: sysId, role: 'system', text: '请先在左栏选择一个 Agent 或 Team。' },
        ]);
        return;
      }
      await runViaSse(text, target);
    },
    [busy, onSend, target, runViaSse],
  );

  // 斜杠命令真实动作分发。
  const handleSlashPick = useCallback((cmd: SlashCommand) => {
    setSlashOpen(false);
    switch (cmd.id) {
      case 'new':
        setMessages([]);
        setToast('已开始新会话');
        break;
      case 'clear':
        setMessages([]);
        setToast('已清空对话');
        break;
      case 'web':
        setSeedText('/web ');
        setSeedKey((k) => k + 1);
        setToast('联网搜索模式');
        break;
      case 'code':
        setSeedText('/code ');
        setSeedKey((k) => k + 1);
        setToast('代码模式');
        break;
      case 'files':
        window.dispatchEvent(new CustomEvent('studio:focus-files'));
        setToast('已聚焦右栏文件');
        break;
      case 'help':
        setToast('快捷键：/ 命令 · @ 提及 Skill · Enter 发送');
        break;
      default:
        setToast(`/${cmd.label} 未实现`);
    }
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  // 回合分组：与上一条「同 role 且同发言者」即为续行（隐藏头像/头部）。
  // 走共享 isContinuation —— 与群聊 / 个人聊用同一套归并规格（对话框统一）。
  const isGrouped = (idx: number): boolean => isContinuation(messages[idx - 1], messages[idx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* header — 当前对话对象 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        {target &&
          (target.kind === 'team' ? (
            <Users size={15} strokeWidth={2} aria-hidden style={{ color: 'var(--t-accent)' }} />
          ) : (
            <Bot size={15} strokeWidth={2} aria-hidden style={{ color: 'var(--t-accent)' }} />
          ))}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)' }}>
          {target ? target.name : 'Studio'}
        </span>
        {target && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--t-fg-4)',
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--t-panel-2)',
              border: '1px solid var(--t-border)',
            }}
          >
            {target.kind}
          </span>
        )}
        {contextFolder && (
          <span
            className="sf-bar"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--t-fg-4)',
              maxWidth: 260,
              padding: '2px 7px',
            }}
            title={`工作目录：${contextFolder}`}
          >
            <FolderOpen size={11} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                direction: 'rtl',
              }}
            >
              {contextFolder}
            </span>
          </span>
        )}
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className="sf-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px 18px' }}
      >
        {messages.length === 0 ? (
          <div className="sf-empty" style={{ marginTop: 60 }}>
            <div className="sf-empty-title">开始对话</div>
            <p className="sf-empty-sub">
              {target ? `与 ${target.name} 开始工作` : '从左栏选择一个 Agent 或 Team'}
            </p>
          </div>
        ) : (
          messages.map((m, idx) => (
            <StudioMessageRow
              key={m.id}
              message={m}
              grouped={isGrouped(idx)}
              animateIn={seenIds.current.has(m.id) && !m.streaming}
            />
          ))
        )}
      </div>

      {/* composer */}
      <div style={{ flexShrink: 0, padding: '8px 14px 12px', borderTop: '1px solid var(--t-border)' }}>
        {/* 斜杠命令快捷栏 + 菜单（真实命令源 defaultStudioSlashCommands） */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button
            type="button"
            className="sf-press sf-focus-ring"
            onClick={() => setSlashOpen((v) => !v)}
            aria-expanded={slashOpen}
            data-testid="studio-slash-toggle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 24,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--t-border)',
              background: slashOpen ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
              color: slashOpen ? 'var(--t-accent)' : 'var(--t-fg-3)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title="斜杠命令"
          >
            <Slash size={12} strokeWidth={2.2} />
            命令
          </button>
          <SlashCommandMenu
            open={slashOpen}
            items={defaultStudioSlashCommands}
            onPick={handleSlashPick}
            onClose={() => setSlashOpen(false)}
          />
          {/* footer 用量计 — 真实 used(估算累加) vs 选中模型窗口（hermes ContextGauge） */}
          <div style={{ marginLeft: 'auto' }}>
            <ComposerTokenMeter used={usedTokens} window={modelWindow} />
          </div>
        </div>

        <UnifiedComposer
          variant="chat"
          onSubmit={handleSubmit}
          placeholder={
            target
              ? `给 ${target.name} 一个任务…（试试 / 命令 · @ 提及 Skill）`
              : '给 Studio 一个任务…（试试 / 命令 · @ 提及 Skill）'
          }
          initialText={seedText}
          key={`studio-composer-${seedKey}`}
        />
      </div>

      {/* toast — 斜杠命令反馈 */}
      {toast && (
        <div
          role="status"
          className="sf-anim-fade"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            color: 'var(--t-fg-2)',
            fontSize: 12,
            boxShadow: '0 8px 24px -8px rgba(0,0,0,.45)',
            zIndex: 60,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default StudioChat;

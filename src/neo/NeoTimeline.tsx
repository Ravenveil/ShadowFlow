/**
 * NeoTimeline — Neo 壳消息流渲染器（2026-08-15 阶段 2.5 视觉返工）。
 *
 * 替代旧体系 components/run-session/timeline/Timeline（终端风 CSS-module
 * 渲染器，禁止 import 进 Neo 壳）。数据源不变：useRunSession / useGroupTimeline
 * 产出的 TimelineMessage 流原样传入，本组件只换渲染层。
 *
 * 视觉基准：.tmp/clawsgo-clone/running.html（+ done.html 完成态）——
 *   - 用户气泡：右对齐灰气泡（88% max-width / 14px 圆角 / 10px 14px padding）
 *   - 深度思考 / 搜索 / 工具：op 行（图标 15px fg-2 + 标题 12.5px + chev fg-4
 *     + 右侧耗时 11px fg-4 tabular-nums；running 行标题灰化）
 *   - 思考体：op 行下方缩进灰字段落（done.html .think）
 *   - 富卡（plan/commit/diff/table/preview/artifact/verdict）：hairline 边框
 *     + 14px 圆角白卡，全部走 var(--t-*) token（样式见 neo-timeline.css）
 *
 * 从旧体系仅复用纯逻辑（无渲染输出）：
 *   - types.ts 的 TimelineMessage 等类型（type-only import）
 *   - rows/extractRows.ts — assistant_text markdown → 类型化子行（纯解析函数）
 *   - toolMeta.ts — 工具名 → 友好标签/类别图标映射（纯映射模块，无 JSX）
 *
 * 与旧 Timeline 的行为对齐：
 *   - hoistMsgFootToEnd：msg_foot 归位到每个 turn 末尾（projector 懒发射会
 *     让它落在 turn 中间，纯 FE 重排，不动数据）
 *   - status_line 不进滚动流（Neo 的状态面是 NeoRunInline 的底部 pill）
 *   - 首屏已有消息不播入场动画，仅新到的消息淡入
 *   - 滚动交给外层容器（neo-chat-scroll / neo-group-scroll），本组件不自滚
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Cloud,
  FileCode2,
  FileText,
  FileWarning,
  GitCommitHorizontal,
  Globe,
  Lightbulb,
  Loader2,
  Package,
  Pencil,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  DiffLine,
  PlanTaskRow,
  StepRow,
  TimelineMessage,
} from '../components/run-session/timeline/types';
import { extractRows } from '../components/run-session/timeline/messages/rows/extractRows';
import { humanizeToolName, toolIconFor } from '../components/run-session/timeline/toolMeta';
import { useI18n } from '../common/i18n';
import './neo-timeline.css';

export interface NeoTimelineProps {
  messages: TimelineMessage[];
  /**
   * assistant_text 行内编辑回调（NeoRunInline → useRunSession.editMessage
   * PATCH 持久化）。缺省时渲染为只读（NeoGroupChat）。
   */
  onEditMessage?: (
    msg: Extract<TimelineMessage, { kind: 'assistant_text' }>,
    nextBody: string,
  ) => void;
}

/* ── 纯逻辑：msg_foot 归位（逐 turn 搬到末尾，保持其余相对顺序） ──────────── */
function hoistMsgFootToEnd(
  messages: readonly TimelineMessage[],
): TimelineMessage[] {
  const byTurn = new Map<string, TimelineMessage[]>();
  const turnOrder: string[] = [];
  for (const m of messages) {
    let bucket = byTurn.get(m.turn_id);
    if (!bucket) {
      bucket = [];
      byTurn.set(m.turn_id, bucket);
      turnOrder.push(m.turn_id);
    }
    bucket.push(m);
  }
  const out: TimelineMessage[] = [];
  for (const t of turnOrder) {
    const group = byTurn.get(t)!;
    const feet: TimelineMessage[] = [];
    const others: TimelineMessage[] = [];
    for (const m of group) {
      if (m.kind === 'msg_foot') feet.push(m);
      else others.push(m);
    }
    out.push(...others, ...feet);
  }
  return out;
}

/* ── 纯逻辑：剥离 CLI tool-call XML 残片（防御，同旧 AssistantText） ───────── */
function stripToolXml(raw: string): string {
  let out = raw;
  out = out.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');
  out = out.replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '');
  out = out.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '');
  const partial = out.match(/<(?:function_calls?|invoke|parameter)\b[^>]*$/i);
  if (partial && partial.index !== undefined) out = out.slice(0, partial.index);
  out = out.replace(/<\/?(?:function_calls?|invoke|parameter)\b[^>]*>/gi, '');
  return out;
}

/* ── 耗时格式 ─────────────────────────────────────────────────────────────── */
/** 工具行耗时：43ms / 3.6s / 12s（对齐旧 ToolCallChip / Hermes）。 */
function fmtDuration(ms?: number): string {
  if (ms == null || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

/** 思考耗时：8s / 1m 4s。 */
function fmtThinkDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** 步骤/面板耗时：… / 632ms / 5.4s。 */
function fmtElapsed(ms?: number): string {
  if (typeof ms !== 'number') return '…';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** msg_foot 耗时：0s / 42s / 3m 42s。 */
function fmtFootElapsed(ms?: number): string {
  if (typeof ms !== 'number') return '0s';
  if (ms < 1000) return `${ms}ms`;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ── 通用折叠容器（grid 0fr↔1fr 过渡，内容常驻 DOM） ─────────────────────── */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={open ? 'neo-tl-collapse neo-tl-collapse-open' : 'neo-tl-collapse'} aria-hidden={!open}>
      <div className="neo-tl-collapse-inner">{children}</div>
    </div>
  );
}

/* ═══ user_turn — 右对齐灰气泡（running.html .msg-user） ════════════════════ */
const NeoUserTurn = memo(function NeoUserTurn({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'user_turn' }>;
}) {
  return <div className="neo-tl-user">{msg.text}</div>;
});

/* ═══ thinking — op 行（灯泡图标 + 标签 + chev + 耗时）+ 缩进思考体 ══════════
   running.html「深度思考」行 + done.html .think 展开体。展开态按消息 id
   持久化 localStorage（刷新不丢），与旧 ThinkCard/ThinkingMessage 同策略。 */
const THINK_STORAGE_PREFIX = 'sf:neo-think:';

function readThinkOpen(id: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(THINK_STORAGE_PREFIX + id);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

const NeoThinking = memo(function NeoThinking({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'thinking' }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => readThinkOpen(msg.id, false));
  useEffect(() => {
    try {
      window.localStorage.setItem(THINK_STORAGE_PREFIX + msg.id, open ? '1' : '0');
    } catch {
      /* quota / 隐私模式 → 仅内存态 */
    }
  }, [msg.id, open]);

  const isStreaming = msg.status === 'streaming';
  const hasBody = Boolean(msg.body && msg.body.length > 0);
  const durText =
    typeof msg.duration_ms === 'number' && msg.duration_ms > 0
      ? fmtThinkDuration(msg.duration_ms)
      : null;

  // 终态且无体（gateway 过程卡「xxx 正在思考」）→ 安静单行，不可折叠
  if (!isStreaming && !hasBody) {
    return (
      <div className="neo-tl-op neo-tl-op-static">
        <span className="neo-tl-op-icon">
          <Cloud size={15} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="neo-tl-op-title">{msg.label || t('neo.tl.thought', { defaultValue: '深度思考' })}</span>
        <span className="neo-tl-op-time">{durText ?? '0s'}</span>
      </div>
    );
  }

  const headLabel = isStreaming
    ? msg.label || t('neo.tl.thinking', { defaultValue: '深度思考' })
    : durText
      ? t('neo.tl.thoughtFor', { defaultValue: `深度思考 ${durText}`, dur: durText })
      : msg.label || t('neo.tl.thought', { defaultValue: '深度思考' });

  return (
    <div className="neo-tl-think">
      <button
        type="button"
        className="neo-tl-op"
        data-status={isStreaming ? 'running' : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="neo-tl-op-icon">
          {isStreaming ? (
            <span className="neo-tl-spinner" aria-hidden />
          ) : (
            <Lightbulb size={15} strokeWidth={1.75} aria-hidden />
          )}
        </span>
        <span className="neo-tl-op-title">{headLabel}</span>
        {typeof msg.tokens === 'number' && (
          <span className="neo-tl-op-tokens">{msg.tokens.toLocaleString()}t</span>
        )}
        {hasBody && (
          <ChevronRight size={13} className="neo-tl-op-chev" data-open={open || undefined} aria-hidden />
        )}
        {durText && <span className="neo-tl-op-time">{durText}</span>}
      </button>
      {hasBody && (
        <Collapse open={open}>
          <div className="neo-tl-think-body">
            {msg.body!.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
});

/* ═══ assistant_meta — 模型 pill + identity + summary 单行 ═══════════════════ */
const NeoAssistantMeta = memo(function NeoAssistantMeta({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'assistant_meta' }>;
}) {
  return (
    <div className="neo-tl-meta">
      <span className="neo-tl-meta-pill">
        {msg.model_brand}
        <span className="neo-tl-meta-sep">·</span>
        {msg.model_ver}
      </span>
      <span className="neo-tl-meta-dot" aria-hidden />
      <span className="neo-tl-meta-who">{msg.identity}</span>
      <span className="neo-tl-meta-dot" aria-hidden />
      <span>{msg.summary}</span>
    </div>
  );
});

/* ═══ assistant_text — markdown → 类型化子行（文本/bash chip/代码块/小节头） ══
   解析复用旧体系纯函数 extractRows；渲染全部 Neo 化。hover 铅笔 → 行内编辑。 */

/** 行内解析：**bold** / `code` / 路径 / +N -N diff 标记（路径与 diff 规则同旧 TextRow）。 */
const INLINE_TOKEN_RE =
  /(\*\*[^*\n]+?\*\*)|(`[^`\n]+?`)|([A-Za-z]:\\[^\s"'`<>|*?]+|~?\/(?:tmp|home|usr|var|etc|opt)\/[^\s"'`<>|*?]+|\+\d+ ?-\d+)/g;

/** 单个文本片段 → ReactNode 序列（bold/code/highlight 交替）。 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastEnd = 0;
  INLINE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastEnd) parts.push(text.slice(lastEnd, m.index));
    const token = m[0];
    if (m[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b-${key++}`}>{token.slice(2, -2)}</strong>);
    } else if (m[2] !== undefined) {
      parts.push(
        <code key={`${keyPrefix}-c-${key++}`} className="neo-tl-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const isDiff = /^\+\d+ ?-\d+$/.test(token);
      parts.push(
        <span key={`${keyPrefix}-h-${key++}`} className={isDiff ? 'neo-tl-diffmark' : 'neo-tl-path'}>
          {token}
        </span>,
      );
    }
    lastEnd = m.index + token.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return parts.length ? parts : [text];
}

/** 行首 `* ` / `- `（允许前导空格）→ 项目符号行（done.html .md .li 观感）。 */
const BULLET_LINE_RE = /^\s*[*-]\s+(.*)$/;

const NeoTextRow = memo(function NeoTextRow({
  body,
  streaming,
}: {
  body: string;
  streaming?: boolean;
}) {
  // 逐行拆分：bullet 行独立成项目符号块，其余连续行合成一段（保留 pre-wrap 换行）。
  const blocks: ReactNode[] = [];
  let paraLines: string[] = [];
  const flushPara = () => {
    if (paraLines.length === 0) return;
    const text = paraLines.join('\n');
    blocks.push(
      <span key={`p-${blocks.length}`} className="neo-tl-text-para">
        {renderInline(text, `p${blocks.length}`)}
      </span>,
    );
    paraLines = [];
  };
  for (const line of body.split('\n')) {
    const b = BULLET_LINE_RE.exec(line);
    if (b) {
      flushPara();
      blocks.push(
        <span key={`li-${blocks.length}`} className="neo-tl-bullet">
          <span className="neo-tl-bullet-dot" aria-hidden>•</span>
          <span className="neo-tl-bullet-body">{renderInline(b[1] ?? '', `li${blocks.length}`)}</span>
        </span>,
      );
    } else {
      paraLines.push(line);
    }
  }
  flushPara();

  return (
    <div className="neo-tl-text">
      {blocks}
      {streaming && <span className="neo-tl-caret" aria-hidden />}
    </div>
  );
});

const NeoBashChip = memo(function NeoBashChip({
  label,
  cmd,
  body,
}: {
  label?: string;
  cmd: string;
  body: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const multiline = body.includes('\n');
  return (
    <div className="neo-tl-chip">
      <div className="neo-tl-chip-head">
        <span className="neo-tl-chip-lead">$</span>
        <span className="neo-tl-chip-kind">Bash</span>
        <span className="neo-tl-chip-title">{label ?? cmd}</span>
        <span className="neo-tl-chip-badge">{t('neo.tl.chipDone', { defaultValue: 'done' })}</span>
        {multiline && (
          <button
            type="button"
            className="neo-tl-chip-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? t('neo.tl.chipHide', { defaultValue: 'hide' }) : t('neo.tl.chipOutput', { defaultValue: 'output' })}
            <ChevronRight size={12} className="neo-tl-op-chev" data-open={open || undefined} aria-hidden />
          </button>
        )}
      </div>
      {open && multiline && <pre className="neo-tl-chip-body">{body}</pre>}
    </div>
  );
});

const NeoCodeBlock = memo(function NeoCodeBlock({ lang, body }: { lang: string; body: string }) {
  const { t } = useI18n();
  return (
    <div className="neo-tl-chip">
      <div className="neo-tl-chip-head">
        <span className="neo-tl-chip-lead">‹›</span>
        <span className="neo-tl-chip-kind">{lang}</span>
        <span className="neo-tl-chip-badge" data-tone="info">
          {t('neo.tl.chipCode', { defaultValue: 'code' })}
        </span>
      </div>
      <pre className="neo-tl-chip-body">{body}</pre>
    </div>
  );
});

const NeoSectionRow = memo(function NeoSectionRow({
  label,
  meta,
  defaultOpen = true,
}: {
  label: string;
  meta?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <button
      type="button"
      className="neo-tl-section"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
    >
      <ChevronRight size={13} className="neo-tl-op-chev" data-open={open || undefined} aria-hidden />
      <span className="neo-tl-section-label">{label}</span>
      {meta && <span className="neo-tl-section-meta">{meta}</span>}
    </button>
  );
});

const NeoAssistantText = memo(function NeoAssistantText({
  msg,
  onEdit,
  live = false,
}: {
  msg: Extract<TimelineMessage, { kind: 'assistant_text' }>;
  onEdit?: NeoTimelineProps['onEditMessage'];
  /**
   * 流式光标门控（2026-08-15 实测修复）：仅当本消息是所属 turn 的最后一条
   * 内容消息、且该 turn 尚未收到终态 msg_foot（status='done'）时为 true。
   * 防止 replay/完成态下残留的 streaming 标记让光标块挂在已完成消息末尾。
   */
  live?: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const rows = useMemo(() => extractRows(stripToolXml(msg.body)), [msg.body]);

  if (rows.length === 0) return null;

  let lastTextIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]?.kind === 'text') {
      lastTextIdx = i;
      break;
    }
  }
  // 编辑铅笔同光标一套门控：streaming 标记残留但 turn 已落定（!live）时可编辑。
  const canEdit = Boolean(onEdit) && !(msg.streaming && live);

  return (
    <div className="neo-tl-assistant">
      {msg.sender_name && <div className="neo-tl-sender">{msg.sender_name}</div>}
      {editing ? (
        <div className="neo-tl-edit">
          <textarea
            className="neo-tl-edit-area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
            autoFocus
          />
          <div className="neo-tl-edit-actions">
            <button
              type="button"
              className="neo-tl-edit-btn neo-tl-edit-btn-primary"
              disabled={!draft.trim() || draft === msg.body}
              onClick={() => {
                onEdit?.(msg, draft);
                setEditing(false);
              }}
            >
              <Check size={12} aria-hidden /> {t('neo.tl.save', { defaultValue: '保存' })}
            </button>
            <button
              type="button"
              className="neo-tl-edit-btn"
              onClick={() => setEditing(false)}
            >
              <X size={12} aria-hidden /> {t('neo.tl.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      ) : (
        <>
          {rows.map((row, i) => {
            const key = `r-${i}-${row.kind}`;
            switch (row.kind) {
              case 'bash-chip':
                return <NeoBashChip key={key} label={row.label} cmd={row.cmd} body={row.body} />;
              case 'bash-inline':
                return (
                  <div key={key} className="neo-tl-chip">
                    <div className="neo-tl-chip-head">
                      <span className="neo-tl-chip-lead">$</span>
                      <span className="neo-tl-chip-title">{row.cmd}</span>
                    </div>
                  </div>
                );
              case 'code-chip':
                return <NeoCodeBlock key={key} lang={row.lang} body={row.body} />;
              case 'section-header':
                return <NeoSectionRow key={key} label={row.title} />;
              case 'text':
                return (
                  <NeoTextRow
                    key={key}
                    body={row.body}
                    streaming={Boolean(msg.streaming) && live && i === lastTextIdx}
                  />
                );
              default: {
                const _exhaustive: never = row;
                void _exhaustive;
                return null;
              }
            }
          })}
          {canEdit && (
            <button
              type="button"
              className="neo-tl-edit-trigger"
              title={t('neo.tl.edit', { defaultValue: '编辑消息' })}
              aria-label={t('neo.tl.edit', { defaultValue: '编辑消息' })}
              onClick={() => {
                setDraft(msg.body);
                setEditing(true);
              }}
            >
              <Pencil size={12} aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
});

/* ═══ raw — 折叠 mono 块（泄漏帧/未知内容，可检查但不污染回答区） ════════════ */
const NeoRaw = memo(function NeoRaw({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'raw' }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const body = msg.body?.trim() ?? '';
  if (!body) return null;
  const lineCount = body.split('\n').length;
  return (
    <div className="neo-tl-raw">
      <button
        type="button"
        className="neo-tl-raw-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <FileWarning size={13} aria-hidden />
        <span className="neo-tl-raw-label">{t('neo.tl.raw', { defaultValue: '原始输出' })}</span>
        {msg.source && <span className="neo-tl-raw-source">{msg.source}</span>}
        <span className="neo-tl-raw-count">
          {t('neo.tl.rawLines', { defaultValue: '{{count}} 行', count: lineCount })}
          {!open ? ` · ${t('neo.tl.rawExpand', { defaultValue: '点击展开' })}` : ''}
        </span>
      </button>
      <Collapse open={open}>
        <pre className="neo-tl-raw-body">{body}</pre>
      </Collapse>
    </div>
  );
});

/* ═══ rationale — RATIONALE 标签 + bullet 列表（左侧 accent gutter） ═════════ */
const NeoRationale = memo(function NeoRationale({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'rationale' }>;
}) {
  return (
    <div className="neo-tl-rationale">
      <span className="neo-tl-rationale-label">RATIONALE</span>
      <ul className="neo-tl-rationale-list">
        {msg.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
});

/* ═══ tool_call — clawsgo op 行：类别图标 + 名称/参数 + 耗时 + 状态 ═══════════ */
const NeoToolCall = memo(function NeoToolCall({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'tool_call' }>;
}) {
  const Icon = toolIconFor(msg.name);
  const label = humanizeToolName(msg.name);
  const dur = fmtDuration(msg.duration_ms);
  const status = msg.status ?? 'ok';
  return (
    <div className="neo-tl-op neo-tl-op-static" data-status={status === 'running' ? 'running' : undefined}>
      <span className="neo-tl-op-icon" data-status={status === 'ok' ? 'done' : status === 'error' ? 'failed' : 'running'}>
        <Icon size={15} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="neo-tl-op-title">
        {label}
        {msg.args_summary ? <span className="neo-tl-op-args">{msg.args_summary}</span> : null}
      </span>
      {msg.link && (
        <a className="neo-tl-op-link" href={msg.link.href} target="_blank" rel="noopener noreferrer">
          {msg.link.label}
          <ArrowUpRight size={11} aria-hidden />
        </a>
      )}
      {(dur || msg.result_summary) && (
        <span className="neo-tl-op-time">
          {dur}
          {dur && msg.result_summary ? ' · ' : ''}
          {msg.result_summary ?? ''}
        </span>
      )}
      {status === 'running' && <Loader2 size={12} strokeWidth={2.4} className="neo-tl-spin" aria-hidden />}
      {status === 'ok' && <Check size={12} strokeWidth={2.6} className="neo-tl-ok" aria-hidden />}
      {status === 'error' && <X size={12} strokeWidth={2.6} className="neo-tl-err" aria-hidden />}
    </div>
  );
});

/* ═══ tool_echo — ⎿ 缩进续行（diff/file/num 行内高亮） ══════════════════════ */
type EchoSeg = { kind: 'text' | 'add' | 'del' | 'file' | 'num'; text: string };

const ECHO_HIGHLIGHT_RE =
  /([+-]\d+(?:\s*(?:lines?|行))?)|([\w./-]+\.(?:ts|tsx|js|jsx|json|yaml|yml|md|py|css|html|sh|toml)(?::\d+)?)|(\b\d+(?:\.\d+)?(?:s|ms|t|k|kb|mb)\b)/gi;

function segmentEcho(raw: string): EchoSeg[] {
  const segs: EchoSeg[] = [];
  let lastIdx = 0;
  for (const m of raw.matchAll(ECHO_HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (start > lastIdx) segs.push({ kind: 'text', text: raw.slice(lastIdx, start) });
    if (m[1] !== undefined) {
      segs.push({ kind: m[1].trim().startsWith('+') ? 'add' : 'del', text: m[1] });
    } else if (m[2] !== undefined) {
      segs.push({ kind: 'file', text: m[2] });
    } else if (m[3] !== undefined) {
      segs.push({ kind: 'num', text: m[3] });
    }
    lastIdx = start + m[0].length;
  }
  if (lastIdx < raw.length) segs.push({ kind: 'text', text: raw.slice(lastIdx) });
  return segs;
}

const ECHO_SEG_CLASS: Record<Exclude<EchoSeg['kind'], 'text'>, string> = {
  add: 'neo-tl-echo-add',
  del: 'neo-tl-echo-del',
  file: 'neo-tl-echo-file',
  num: 'neo-tl-echo-num',
};

const NeoToolEcho = memo(function NeoToolEcho({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'tool_echo' }>;
}) {
  const segs = useMemo(() => segmentEcho(stripToolXml(msg.body)), [msg.body]);
  if (segs.length === 0) return null;
  if (segs.every((s) => !s.text.trim())) return null;
  return (
    <div className="neo-tl-echo">
      <span className="neo-tl-echo-glyph" aria-hidden>⎿</span>
      <span className="neo-tl-echo-body">
        {segs.map((s, i) =>
          s.kind === 'text' ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className={ECHO_SEG_CLASS[s.kind]}>{s.text}</span>
          ),
        )}
      </span>
    </div>
  );
});

/* ═══ step_panel — 可折叠「N 个步骤」面板（只渲染 done/running，pending 过滤） ═ */
function NeoStepIcon({ status, index }: { status: StepRow['status']; index: number }) {
  if (status === 'done') {
    return <span className="neo-tl-step-icon neo-tl-step-icon-done" aria-hidden>✓</span>;
  }
  if (status === 'running') {
    return (
      <span className="neo-tl-step-icon neo-tl-step-icon-run" aria-hidden>
        <span className="neo-tl-spinner neo-tl-spinner-sm" />
      </span>
    );
  }
  return <span className="neo-tl-step-icon" aria-hidden>{index + 1}</span>;
}

const NeoStepPanel = memo(function NeoStepPanel({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'step_panel' }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const visibleSteps = msg.steps.filter((s) => s.status !== 'pending');
  const totalElapsed = msg.steps.reduce((acc, s) => acc + (s.elapsed_ms ?? 0), 0);
  const doneCount = msg.steps.filter((s) => s.status === 'done').length;

  return (
    <div className="neo-tl-panel">
      <button type="button" className="neo-tl-panel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown size={13} className="neo-tl-op-chev" data-open={open || undefined} aria-hidden />
        <span className="neo-tl-panel-name">
          {t('neo.tl.stepCount', { defaultValue: '{{count}} 个步骤', count: msg.total_steps })}
        </span>
        <span className="neo-tl-panel-ct">
          <b>{doneCount}</b>/{msg.total_steps} · {fmtElapsed(totalElapsed)}
        </span>
      </button>
      <Collapse open={open}>
        <div className="neo-tl-steps">
          {visibleSteps.map((s) => {
            const realIdx = msg.steps.indexOf(s);
            const isRun = s.status === 'running';
            const visibleSubs = s.substeps?.filter((x) => x.status !== 'pending') ?? [];
            return (
              <div key={`${realIdx}-${s.name}`}>
                <div className="neo-tl-step" data-status={isRun ? 'running' : undefined}>
                  <NeoStepIcon status={s.status} index={realIdx} />
                  <span className="neo-tl-step-name">{s.name}</span>
                  <span className="neo-tl-step-time">{isRun ? '…' : fmtElapsed(s.elapsed_ms)}</span>
                </div>
                {visibleSubs.length > 0 && (
                  <div className="neo-tl-substeps">
                    {visibleSubs.map((sub, j) => (
                      <div key={`${j}-${sub.name}`} className="neo-tl-sub">
                        <span className="neo-tl-sub-dot" data-status={sub.status} aria-hidden />
                        <span className="neo-tl-sub-name" data-status={sub.status}>{sub.name}</span>
                        <span className="neo-tl-sub-time">
                          {sub.status === 'running' ? '…' : fmtElapsed(sub.elapsed_ms)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
});

/* ═══ diff 行渲染（diff_panel / file_diff 共用） ════════════════════════════ */
function diffLineClass(mark: DiffLine['mark']): string {
  if (mark === '+') return 'neo-tl-diff-line neo-tl-diff-line-add';
  if (mark === '-') return 'neo-tl-diff-line neo-tl-diff-line-del';
  return 'neo-tl-diff-line';
}

function diffMarkClass(mark: DiffLine['mark']): string {
  if (mark === '+') return 'neo-tl-diff-gut-mark neo-tl-diff-gut-add';
  if (mark === '-') return 'neo-tl-diff-gut-mark neo-tl-diff-gut-del';
  return 'neo-tl-diff-gut-mark';
}

function NeoDiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="neo-tl-diff-body">
      {lines.map((line, i) => (
        <div key={`${i}-${line.no}`} className={diffLineClass(line.mark)}>
          <span className="neo-tl-diff-gut">{line.no}</span>
          <span className={diffMarkClass(line.mark)}>{line.mark}</span>
          <span className="neo-tl-diff-code">
            {line.code}
            {line.cursor && <span className="neo-tl-caret" aria-hidden />}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══ diff_panel — YAML 蓝图 diff ═══════════════════════════════════════════ */
const NeoDiffPanel = memo(function NeoDiffPanel({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'diff_panel' }>;
}) {
  return (
    <div className="neo-tl-diff">
      <div className="neo-tl-diff-head">
        <span className="neo-tl-diff-file">{msg.filename}</span>
        <span className="neo-tl-diff-stats">
          <span className="neo-tl-diff-add">+{msg.added}</span>{' '}
          <span className="neo-tl-diff-del">−{msg.removed}</span>
        </span>
      </div>
      <NeoDiffLines lines={msg.lines} />
    </div>
  );
});

/* ═══ file_diff — 真实文件 diff（>30 行折叠） ═══════════════════════════════ */
const FILE_DIFF_COLLAPSE = 30;

const NeoFileDiff = memo(function NeoFileDiff({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'file_diff' }>;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const collapsible = msg.lines.length > FILE_DIFF_COLLAPSE;
  const shown = collapsible && !expanded ? msg.lines.slice(0, FILE_DIFF_COLLAPSE) : msg.lines;
  return (
    <div className="neo-tl-diff">
      <div className="neo-tl-diff-head">
        <span className="neo-tl-diff-file">{msg.path}</span>
        {msg.language ? <span className="neo-tl-diff-lang">{msg.language}</span> : null}
        <span className="neo-tl-diff-stats">
          <span className="neo-tl-diff-add">+{msg.added}</span>{' '}
          <span className="neo-tl-diff-del">−{msg.removed}</span>
        </span>
      </div>
      <NeoDiffLines lines={shown} />
      {collapsible && (
        <button type="button" className="neo-tl-diff-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          {expanded
            ? t('neo.tl.collapse', { defaultValue: '收起' })
            : t('neo.tl.expandAll', { defaultValue: `展开全部 ${msg.lines.length} 行`, count: msg.lines.length })}
        </button>
      )}
    </div>
  );
});

/* ═══ msg_foot — 每 turn 末尾汇总行（Running → Done） ═══════════════════════ */
const NeoMsgFoot = memo(function NeoMsgFoot({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'msg_foot' }>;
}) {
  const running = msg.status === 'running';
  return (
    <div className="neo-tl-foot">
      <span className="neo-tl-foot-dot" data-status={running ? 'running' : 'done'} aria-hidden />
      <span className="neo-tl-foot-label">{running ? 'Running' : 'Done'}</span>
      {typeof msg.elapsed_ms === 'number' && (
        <>
          <span className="neo-tl-foot-sep">·</span>
          <span className="neo-tl-foot-num"><b>{fmtFootElapsed(msg.elapsed_ms)}</b></span>
        </>
      )}
      {typeof msg.tools === 'number' && (
        <>
          <span className="neo-tl-foot-sep">·</span>
          <span className="neo-tl-foot-num"><b>{msg.tools}</b> tools</span>
        </>
      )}
      {typeof msg.tokens === 'number' && (
        <>
          <span className="neo-tl-foot-sep">·</span>
          <span className="neo-tl-foot-num"><b>{msg.tokens}</b>t</span>
        </>
      )}
      {typeof msg.cost_cny === 'number' && (
        <>
          <span className="neo-tl-foot-sep">·</span>
          <span className="neo-tl-foot-num">¥<b>{msg.cost_cny.toFixed(3)}</b></span>
        </>
      )}
    </div>
  );
});

/* ═══ plan_card — 编排计划卡（任务拆解 + 实时状态） ══════════════════════════ */
const PLAN_STATUS_LABEL: Record<PlanTaskRow['status'], string> = {
  pending: '待派发',
  running: '执行中',
  done: '完成',
  failed: '失败',
  blocked: '受阻',
};

function NeoPlanTaskIcon({ status }: { status: PlanTaskRow['status'] }) {
  if (status === 'running') return <Loader2 size={13} className="neo-tl-spin" aria-hidden />;
  if (status === 'done') return <CircleCheck size={13} className="neo-tl-ok" aria-hidden />;
  if (status === 'failed') return <CircleX size={13} className="neo-tl-err" aria-hidden />;
  if (status === 'blocked') return <Ban size={13} className="neo-tl-err" aria-hidden />;
  return <Circle size={13} className="neo-tl-dim" aria-hidden />;
}

const NeoPlanCard = memo(function NeoPlanCard({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'plan_card' }>;
}) {
  const done = msg.tasks.filter((task) => task.status === 'done').length;
  return (
    <div className="neo-tl-card">
      <div className="neo-tl-card-head">
        <span className="neo-tl-card-title">{msg.title}</span>
        <span className="neo-tl-card-count">{done}/{msg.tasks.length}</span>
      </div>
      {msg.goal ? <div className="neo-tl-card-goal">{msg.goal}</div> : null}
      <div className="neo-tl-plan-tasks">
        {msg.tasks.map((task) => (
          <div key={task.id} className="neo-tl-plan-task" data-status={task.status}>
            <span className="neo-tl-plan-task-icon"><NeoPlanTaskIcon status={task.status} /></span>
            <span className="neo-tl-plan-task-title">{task.title}</span>
            {task.assignee ? <span className="neo-tl-plan-task-assignee">{task.assignee}</span> : null}
            {task.elapsed_ms != null ? (
              <span className="neo-tl-plan-task-elapsed">{(task.elapsed_ms / 1000).toFixed(1)}s</span>
            ) : (
              <span className="neo-tl-plan-task-status">{PLAN_STATUS_LABEL[task.status]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ═══ commit_record — git 提交卡 ════════════════════════════════════════════ */
function fmtCommitDate(iso?: string): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const NeoCommitRecord = memo(function NeoCommitRecord({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'commit_record' }>;
}) {
  const [open, setOpen] = useState(false);
  const dateText = fmtCommitDate(msg.date);
  return (
    <div className="neo-tl-card">
      <div className="neo-tl-commit-row">
        <GitCommitHorizontal size={14} className="neo-tl-dim" aria-hidden />
        <span className="neo-tl-commit-sha">{msg.short_sha}</span>
        <span className="neo-tl-commit-msg">{msg.message}</span>
      </div>
      <div className="neo-tl-commit-meta">
        <span>{msg.repo}</span>
        {msg.author ? <span>{msg.author}</span> : null}
        {dateText ? <span>{dateText}</span> : null}
        {msg.files_changed > 0 ? <span>{msg.files_changed} files</span> : null}
        <span className="neo-tl-diff-stats">
          <span className="neo-tl-diff-add">+{msg.insertions}</span>{' '}
          <span className="neo-tl-diff-del">−{msg.deletions}</span>
        </span>
        {msg.files && msg.files.length > 0 ? (
          <button type="button" className="neo-tl-commit-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          </button>
        ) : null}
      </div>
      {open && msg.files && msg.files.length > 0 ? (
        <div className="neo-tl-commit-files">
          {msg.files.map((f) => (
            <div key={f.path} className="neo-tl-commit-file">
              <span className="neo-tl-commit-file-status" data-status={f.status}>{f.status}</span>
              <span className="neo-tl-commit-file-path">{f.path}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

/* ═══ table_panel — 内联数据表 ══════════════════════════════════════════════ */
const NeoTablePanel = memo(function NeoTablePanel({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'table_panel' }>;
}) {
  if (msg.columns.length === 0) return null;
  const colIsNumeric = (col: number) =>
    msg.rows.length > 0 && msg.rows.every((r) => typeof r[col] === 'number');
  return (
    <div className="neo-tl-card neo-tl-table">
      {msg.caption ? <div className="neo-tl-table-caption">{msg.caption}</div> : null}
      <div className="neo-tl-table-scroll">
        <table>
          <thead>
            <tr>
              {msg.columns.map((c, i) => (
                <th key={i} scope="col" className={colIsNumeric(i) ? 'neo-tl-table-num' : undefined}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {msg.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={c === 0 ? 'neo-tl-table-first' : colIsNumeric(c) ? 'neo-tl-table-num' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/* ═══ image_panel — 内联图片 ════════════════════════════════════════════════ */
const NeoImagePanel = memo(function NeoImagePanel({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'image_panel' }>;
}) {
  return (
    <figure className="neo-tl-image">
      <a href={msg.src} target="_blank" rel="noreferrer">
        <img src={msg.src} alt={msg.alt ?? msg.title ?? ''} loading="lazy" />
      </a>
      {msg.title ? <figcaption className="neo-tl-image-caption">{msg.title}</figcaption> : null}
    </figure>
  );
});

/* ═══ web_preview — 浏览器框 + sandboxed iframe ══════════════════════════════ */
const NeoWebPreview = memo(function NeoWebPreview({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'web_preview' }>;
}) {
  const { t } = useI18n();
  const href = msg.url;
  return (
    <div className="neo-tl-web">
      <div className="neo-tl-web-chrome">
        <span className="neo-tl-web-dots" aria-hidden><i /><i /><i /></span>
        <span className="neo-tl-web-url">{href ?? msg.title}</span>
        {href ? (
          <a className="neo-tl-web-open" href={href} target="_blank" rel="noreferrer">
            {t('neo.tl.open', { defaultValue: '打开' })} ↗
          </a>
        ) : null}
      </div>
      <iframe
        className="neo-tl-web-frame"
        src={href}
        srcDoc={href ? undefined : msg.src}
        title={msg.title}
        sandbox="allow-scripts allow-forms allow-popups"
        loading="lazy"
      />
    </div>
  );
});

/* ═══ artifact_card — 产物引用卡 ════════════════════════════════════════════ */
function artifactIcon(type: string) {
  if (type === 'html') return <Globe size={14} aria-hidden />;
  if (type === 'markdown' || type === 'md') return <FileText size={14} aria-hidden />;
  if (type === 'yaml' || type === 'yml') return <FileCode2 size={14} aria-hidden />;
  return <Package size={14} aria-hidden />;
}

const NeoArtifactCard = memo(function NeoArtifactCard({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'artifact_card' }>;
}) {
  const { t } = useI18n();
  return (
    <div className="neo-tl-card neo-tl-artifact">
      <span className="neo-tl-artifact-icon">{artifactIcon(msg.artifact_type)}</span>
      <div className="neo-tl-artifact-body">
        <span className="neo-tl-artifact-name">{msg.filename}</span>
        {msg.note ? <span className="neo-tl-artifact-note">{msg.note}</span> : null}
      </div>
      <span className="neo-tl-artifact-type">{msg.artifact_type}</span>
      {msg.url ? (
        <a className="neo-tl-artifact-open" href={msg.url} target="_blank" rel="noreferrer">
          {t('neo.tl.view', { defaultValue: '查看' })} ↗
        </a>
      ) : null}
    </div>
  );
});

/* ═══ verdict_card — verifier/critique 评审卡（得分条 + 指标 + 备注） ═════════
   clawsgo 无对应帧，按 running.html 白卡体系呈现：hairline 边 + 14px 圆角，
   得分用 --t-ok/--t-err 双态，比例条横贯头部。 */
const NeoVerdictCard = memo(function NeoVerdictCard({
  msg,
}: {
  msg: Extract<TimelineMessage, { kind: 'verdict_card' }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const max = msg.max_score ?? 10;
  const pct =
    typeof msg.score === 'number' && max > 0
      ? Math.max(0, Math.min(100, Math.round((msg.score / max) * 100)))
      : null;
  const good = typeof msg.score === 'number' ? msg.score / max >= 0.7 : msg.passed === true;
  return (
    <div className="neo-tl-card neo-tl-verdict" data-good={good || undefined}>
      <div className="neo-tl-verdict-head">
        <ShieldCheck size={14} className="neo-tl-verdict-icon" aria-hidden />
        <span className="neo-tl-verdict-title">{msg.title}</span>
        {typeof msg.score === 'number' ? (
          <span className="neo-tl-verdict-score">
            {msg.score}
            <span className="neo-tl-verdict-max">/{max}</span>
          </span>
        ) : null}
        {pct !== null ? (
          <span className="neo-tl-verdict-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
        ) : null}
      </div>
      {msg.summary ? <div className="neo-tl-verdict-summary">{msg.summary}</div> : null}
      {msg.metrics && msg.metrics.length > 0 ? (
        <div className="neo-tl-verdict-metrics">
          <button type="button" className="neo-tl-verdict-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
            {t('neo.tl.metricCount', { defaultValue: '{{count}} 项指标', count: msg.metrics.length })}
          </button>
          {open ? (
            <div className="neo-tl-verdict-metric-list">
              {msg.metrics.map((m, i) => (
                <div key={i} className="neo-tl-verdict-metric">
                  <span className="neo-tl-verdict-metric-label">{m.label}</span>
                  <span className="neo-tl-verdict-metric-value">{m.value}</span>
                  {m.detail ? <span className="neo-tl-verdict-metric-detail">{m.detail}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {msg.notes && msg.notes.length > 0 ? (
        <div className="neo-tl-verdict-notes">
          {msg.notes.map((n, i) => (
            <span key={i} className="neo-tl-verdict-note">{n}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
});

/* ═══ kind 分发（exhaustive，新增 kind 时编译期强制补分支） ══════════════════ */
function NeoMessage({
  msg,
  onEditMessage,
  live,
}: {
  msg: TimelineMessage;
  onEditMessage?: NeoTimelineProps['onEditMessage'];
  /** 见 NeoAssistantText.live：流式光标门控。 */
  live: boolean;
}) {
  switch (msg.kind) {
    case 'user_turn':
      return <NeoUserTurn msg={msg} />;
    case 'thinking':
      return <NeoThinking msg={msg} />;
    case 'assistant_meta':
      return <NeoAssistantMeta msg={msg} />;
    case 'assistant_text':
      return <NeoAssistantText msg={msg} onEdit={onEditMessage} live={live} />;
    case 'raw':
      return <NeoRaw msg={msg} />;
    case 'rationale':
      return <NeoRationale msg={msg} />;
    case 'tool_call':
      return <NeoToolCall msg={msg} />;
    case 'tool_echo':
      return <NeoToolEcho msg={msg} />;
    case 'step_panel':
      return <NeoStepPanel msg={msg} />;
    case 'diff_panel':
      return <NeoDiffPanel msg={msg} />;
    case 'msg_foot':
      return <NeoMsgFoot msg={msg} />;
    case 'status_line':
      // 不进滚动流：Neo 的实时状态面是 NeoRunInline 的底部 pill。
      return null;
    case 'section_header':
      return <NeoSectionRow label={msg.title} meta={msg.meta} defaultOpen={msg.default_open ?? true} />;
    case 'plan_card':
      return <NeoPlanCard msg={msg} />;
    case 'commit_record':
      return <NeoCommitRecord msg={msg} />;
    case 'file_diff':
      return <NeoFileDiff msg={msg} />;
    case 'table_panel':
      return <NeoTablePanel msg={msg} />;
    case 'image_panel':
      return <NeoImagePanel msg={msg} />;
    case 'web_preview':
      return <NeoWebPreview msg={msg} />;
    case 'artifact_card':
      return <NeoArtifactCard msg={msg} />;
    case 'verdict_card':
      return <NeoVerdictCard msg={msg} />;
    default: {
      const _exhaustive: never = msg;
      void _exhaustive;
      return null;
    }
  }
}

export const NeoTimeline = memo(function NeoTimeline({ messages, onEditMessage }: NeoTimelineProps) {
  // 首屏已有 id = 历史（刷新/只读回放）不播入场动画；仅新到消息淡入。
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }

  const streamMessages = hoistMsgFootToEnd(messages.filter((m) => m.kind !== 'status_line'));

  // 流式光标门控（2026-08-15 实测修复「完成态光标残留」）：
  //   完成信号 = 该 turn 收到 status='done' 的 msg_foot（projector 在 onComplete
  //   落定）；assistant_text 的 streaming 标记在 replay/异常断流下可能残留为
  //   true，不能单独作为光标依据。
  //   live = 本消息是所属 turn 的最后一条内容消息（msg_foot 不算内容）
  //          且该 turn 未落定。两个条件都在流内可推导，无需调用方传参。
  const doneTurns = new Set<string>();
  for (const m of messages) {
    if (m.kind === 'msg_foot' && m.status === 'done') doneTurns.add(m.turn_id);
  }
  const lastContentIdByTurn = new Map<string, string>();
  for (const m of streamMessages) {
    if (m.kind === 'msg_foot') continue;
    lastContentIdByTurn.set(m.turn_id, m.id);
  }

  return (
    <div className="neo-tl">
      {streamMessages.map((m) => (
        <div
          key={m.id}
          className="neo-tl-item"
          data-kind={m.kind}
          data-new={!initialIdsRef.current!.has(m.id) || undefined}
        >
          <NeoMessage
            msg={m}
            onEditMessage={onEditMessage}
            live={!doneTurns.has(m.turn_id) && lastContentIdByTurn.get(m.turn_id) === m.id}
          />
        </div>
      ))}
    </div>
  );
});

export default NeoTimeline;

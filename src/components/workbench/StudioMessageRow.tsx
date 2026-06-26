/**
 * StudioMessageRow — 统一对话气泡 + 回合分组（turn grouping）。
 *
 * OWNER: chat-unify。这是把「乱」治好的核心组件，移植 hermes-desktop
 * screens/Chat/MessageRow.tsx 的回合分组思路到 ShadowFlow 设计 token 体系：
 *
 *   - 一个回合 = 一个发言者的连续若干条消息；只在回合首行渲染头像，
 *     续行渲染 <AvatarSpacer/>（等宽占位），让整回合所有行对齐到同一内容列。
 *   - .chat-message-{role} 行容器 + .chat-bubble-{role} 气泡；user 右对齐暖色、
 *     agent 左对齐冷静面板色，对比清晰但都很「干净」（hermes / cherry clean）。
 *   - 续行（grouped）隐藏发言者头部（名字/时间），只保留气泡，视觉收敛。
 *   - 统一 markdown-lite 渲染（粗体/行内码/链接/列表/换行）、附件 chip、
 *     error 态、tool / reasoning 行，全部走同一内容列、同一视觉规格。
 *
 * 纯展示组件：无副作用、无数据获取。由 StudioChat 投喂 StudioMessage[]。
 */
import { memo, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { User, Bot, Users, Wrench, Brain, AlertTriangle, Paperclip, Copy, Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import './fileViewerHljs.css';
import { relTime } from '../../core/utils/relTime';

// Module-level constant: fenced-code regex (fix: allocation + trailing-space edge case + trailing newline).
// (\w*)[^\n]* → language token + any trailing chars on the fence line (handles ` ```ts \n`).
// \n?          → optional newline before closing fence (avoids capturing a blank last line in <pre>).
const FENCED_CODE_RE = /```(\w*)[^\n]*\n([\s\S]*?)\n?```/g;

// Module-scoped expansion state for collapsible code blocks.
// Key = messageId + ":" + blockIndex.  Persists across remounts during streaming
// without triggering re-renders in other components.
// Bounded LRU (max 500 entries) to prevent unbounded growth over long sessions.
class BoundedSet<T> {
  private readonly _map: Map<T, true>;
  private readonly _max: number;
  constructor(max: number) { this._map = new Map(); this._max = max; }
  has(key: T): boolean { return this._map.has(key); }
  add(key: T): void {
    if (this._map.has(key)) { this._map.delete(key); }
    else if (this._map.size >= this._max) {
      const oldest = this._map.keys().next().value as T;
      this._map.delete(oldest);
    }
    this._map.set(key, true);
  }
  delete(key: T): void { this._map.delete(key); }
}
const expandedBlocks = new BoundedSet<string>(500);
const COLLAPSE_LINE_THRESHOLD = 15;
const COLLAPSE_CHAR_THRESHOLD = 800;

export type StudioRole = 'user' | 'assistant' | 'system';

export interface StudioToolRow {
  id: string;
  tool: string;
  title?: string;
  status: 'running' | 'done' | 'failed';
  resultSummary?: string;
}

export interface StudioAttachment {
  id: string;
  label: string;
  meta?: string;
}

export interface StudioMessage {
  id: string;
  role: StudioRole;
  text: string;
  /** 发言者显示名（assistant 回合的 agent / team 名）。 */
  senderName?: string;
  /** 单字头像字形（缺省按 role 用 lucide 图标）。 */
  senderGlyph?: string;
  /** 头像底色 token / #rrggbb；缺省用 --t-accent。 */
  senderColor?: string;
  /** 该回合的发言主体类型，用于默认头像图标（agent=Bot / team=Users）。 */
  kind?: 'agent' | 'team';
  /** 仍在流式输出 → 追加闪烁光标。 */
  streaming?: boolean;
  /** error 态气泡（红色描边 + 警示图标）。 */
  error?: boolean;
  /** 用户侧发送状态；'error' 时在气泡旁显示重试按钮。 */
  status?: 'sent' | 'delivered' | 'read' | 'error';
  /** 推理 / 思考折叠预览行（assistant）。 */
  reasoning?: string;
  /** 工具调用行（assistant）。 */
  tools?: StudioToolRow[];
  /** 附件 chip。 */
  attachments?: StudioAttachment[];
  /** 已格式化时间串（如 "14:03"）。 */
  timestamp?: string;
}

// ── 头像列宽（与续行占位等宽，保证整列对齐）────────────────────────────────────
const AVATAR_SIZE = 28;
const AVATAR_GAP = 10;
// 气泡最大宽度占内容列比例 —— 长行不铺满整宽，保持 hermes / cherry「单内容列」的
// 干净观感（user / agent 都收口，不会一条消息横贯到底）。
const BUBBLE_MAX_WIDTH = '78%';

// ── 围栏代码块（triple-backtick）渲染：hljs 高亮 + 语言 chip + 复制按钮 ─────────
// blockKey: messageId + ":" + blockIndex — used to persist expansion state across remounts.
function FencedCodeBlock({ lang, code, blockKey }: { lang: string; code: string; blockKey?: string }) {
  const lineCount = code.split('\n').length;
  const collapsible = blockKey != null && (lineCount > COLLAPSE_LINE_THRESHOLD || code.length > COLLAPSE_CHAR_THRESHOLD);

  const [expanded, setExpanded] = useState<boolean>(() =>
    !collapsible || expandedBlocks.has(blockKey!),
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  // Deferred: only compute when expanded so collapsed blocks pay no hljs cost.
  // (hljs.highlight benchmarks at 3–109 ms depending on language and code size)
  const highlighted = useMemo(() => {
    if (!expanded) return '';
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    // Skip auto-detection (benchmarks at 109 ms on 6k chars vs 3 ms for named lang).
    // Escape HTML and render as plain text — 36x faster, no visible difference for unknown languages.
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }, [expanded, lang, code]);

  const handleCopyCode = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (blockKey) {
      if (next) expandedBlocks.add(blockKey);
      else expandedBlocks.delete(blockKey);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 8,
        border: '1px solid var(--t-border)',
        background: 'var(--t-panel-2)',
        overflow: 'hidden',
        margin: '4px 0',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.55,
      }}
    >
      {/* 语言 chip + 行数 + 复制按钮 + 折叠切换 — 整行可点击切换展开/折叠 */}
      <div
        onClick={collapsible ? handleToggle : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 10px',
          borderBottom: expanded ? '1px solid var(--t-border)' : 'none',
          background: 'color-mix(in oklab, var(--t-panel-2) 80%, var(--t-border))',
          cursor: collapsible ? 'pointer' : undefined,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--t-fg-4)',
            fontWeight: 500,
          }}
        >
          {lang || 'code'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {collapsible && (
            <span style={{ fontSize: 10, color: 'var(--t-fg-4)' }}>{lineCount} 行</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCopyCode(); }}
            aria-label={copied ? '已复制' : '复制'}
            title={copied ? '已复制' : '复制'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 5,
              border: '1px solid var(--t-border)',
              background: 'var(--t-panel)',
              color: copied ? 'var(--sf-green, #21A678)' : 'var(--t-fg-3)',
              cursor: 'pointer',
              fontSize: 11,
              transition: 'color 0.15s',
            }}
          >
            {copied ? (
              <Check size={11} strokeWidth={2.5} aria-hidden />
            ) : (
              <Copy size={11} strokeWidth={2} aria-hidden />
            )}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          {collapsible && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleToggle(); }}
              aria-label={expanded ? '折叠' : '展开'}
              aria-expanded={expanded}
              title={expanded ? '折叠' : '展开'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 5px',
                borderRadius: 5,
                border: '1px solid var(--t-border)',
                background: 'var(--t-panel)',
                color: 'var(--t-fg-3)',
                cursor: 'pointer',
                fontSize: 11,
                transition: 'color 0.15s',
              }}
            >
              {expanded ? (
                <ChevronUp size={11} strokeWidth={2} aria-hidden />
              ) : (
                <ChevronDown size={11} strokeWidth={2} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
      {/* 代码区：折叠时隐藏 */}
      {expanded && (
        <pre style={{ margin: 0, padding: '8px 12px', overflowX: 'auto' }}>
          <code
            className={`hljs${lang ? ` language-${lang}` : ''}`}
            style={{ background: 'transparent', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      )}
    </div>
  );
}

// ── 极简 markdown 渲染：**bold** / `code` / 链接 / 换行。无第三方依赖，避免在
//    中栏引入重型 markdown 包；复杂排版交给右栏 FileViewer。──────────────────────
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // 先按行内代码 `code` 切，再在非代码片段里处理 **bold** 与裸链接。
  const codeRe = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const pushPlain = (s: string) => {
    // 处理 **bold**
    const boldRe = /\*\*([^*]+)\*\*/g;
    let bl = 0;
    let bm: RegExpExecArray | null;
    while ((bm = boldRe.exec(s)) !== null) {
      if (bm.index > bl) pushLinks(s.slice(bl, bm.index));
      out.push(
        <strong key={`${keyBase}-b${i++}`} style={{ fontWeight: 650 }}>
          {bm[1]}
        </strong>,
      );
      bl = bm.index + bm[0].length;
    }
    if (bl < s.length) pushLinks(s.slice(bl));
  };
  const pushLinks = (s: string) => {
    const urlRe = /(https?:\/\/[^\s)]+)/g;
    let ul = 0;
    let um: RegExpExecArray | null;
    while ((um = urlRe.exec(s)) !== null) {
      if (um.index > ul) out.push(s.slice(ul, um.index));
      out.push(
        <a
          key={`${keyBase}-l${i++}`}
          href={um[1]}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'var(--t-accent)', textDecoration: 'underline' }}
        >
          {um[1]}
        </a>,
      );
      ul = um.index + um[0].length;
    }
    if (ul < s.length) out.push(s.slice(ul));
  };
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    out.push(
      <code
        key={`${keyBase}-c${i++}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.92em',
          padding: '1px 5px',
          borderRadius: 4,
          background: 'var(--t-panel-2)',
          border: '1px solid var(--t-border)',
        }}
      >
        {m[1]}
      </code>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return out;
}

function MarkdownLite({ text, trailingCursor, messageId }: { text: string; trailingCursor?: boolean; messageId?: string }) {
  // 先按围栏代码块边界（```lang\n...\n```）切分；其余段落按行渲染。
  type Seg = { type: 'text'; content: string } | { type: 'code'; lang: string; code: string };
  const segments: Seg[] = [];

  // Reset lastIndex — FENCED_CODE_RE is a module-level /g regex; must reset on each call.
  FENCED_CODE_RE.lastIndex = 0;
  let lastIdx = 0;
  let fm: RegExpExecArray | null;
  while ((fm = FENCED_CODE_RE.exec(text)) !== null) {
    if (fm.index > lastIdx) segments.push({ type: 'text', content: text.slice(lastIdx, fm.index) });
    segments.push({ type: 'code', lang: fm[1], code: fm[2] });
    lastIdx = fm.index + fm[0].length;
  }

  // Handle trailing text or an incomplete (streaming) code fence without a closing ```.
  // Without this, an in-progress code block renders as raw text with visible backtick markers.
  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx);
    const openFenceIdx = tail.indexOf('```');
    if (openFenceIdx !== -1) {
      // Any text before the unclosed opening fence
      if (openFenceIdx > 0) segments.push({ type: 'text', content: tail.slice(0, openFenceIdx) });
      const fenceStr = tail.slice(openFenceIdx);
      // Match: ```lang\n<partial code body> (no closing fence yet)
      const inc = /^```(\w*)[^\n]*\n([\s\S]*)$/.exec(fenceStr);
      if (inc) {
        segments.push({ type: 'code', lang: inc[1], code: inc[2] });
      } else {
        // Fence header not yet fully typed (no newline yet) — render as plain text until complete
        segments.push({ type: 'text', content: fenceStr });
      }
    } else {
      segments.push({ type: 'text', content: tail });
    }
  }
  if (segments.length === 0) segments.push({ type: 'text', content: text });

  // trailing cursor 只附加到最后一个文本段的最后一行。
  // 若最后段是代码块，cursor 在 forEach 后追加（否则光标在代码块尾消失）。
  const lastTextSegIdx = (() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].type === 'text') return i;
    }
    return -1;
  })();

  const nodes: ReactNode[] = [];
  let codeBlockIdx = 0;
  segments.forEach((seg, si) => {
    if (seg.type === 'code') {
      const blockKey = messageId ? `${messageId}:${codeBlockIdx}` : undefined;
      codeBlockIdx++;
      nodes.push(<FencedCodeBlock key={`code-${si}`} lang={seg.lang} code={seg.code} blockKey={blockKey} />);
      return;
    }
    const lines = seg.content.split('\n');
    const lastNonEmptyIdx = (() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() !== '') return i;
      }
      return lines.length - 1;
    })();
    const isLastSeg = si === lastTextSegIdx;
    lines.forEach((line, idx) => {
      const isLast = isLastSeg && idx === lastNonEmptyIdx;
      const listMatch = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
      if (listMatch) {
        nodes.push(
          <div key={`${si}-${idx}`} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
            <span aria-hidden style={{ color: 'var(--t-fg-4)', flexShrink: 0 }}>
              {/^\d/.test(listMatch[1]) ? listMatch[1] : '•'}
            </span>
            <span>
              {renderInline(listMatch[2], `l${si}-${idx}`)}
              {trailingCursor && isLast && <span className="sf-blink-cursor" aria-hidden />}
            </span>
          </div>,
        );
        return;
      }
      if (line.trim() === '') {
        nodes.push(<div key={`${si}-${idx}`} style={{ height: 6 }} />);
        return;
      }
      nodes.push(
        <div key={`${si}-${idx}`}>
          {renderInline(line, `p${si}-${idx}`)}
          {trailingCursor && isLast && <span className="sf-blink-cursor" aria-hidden />}
        </div>,
      );
    });
  });

  // If the last segment is a code block, the per-line cursor logic above never fires.
  // Append a standalone cursor node so the blink remains visible during streaming.
  if (trailingCursor && segments.length > 0 && segments[segments.length - 1].type === 'code') {
    nodes.push(<span key="trailing-cursor" className="sf-blink-cursor" aria-hidden />);
  }

  return <>{nodes}</>;
}

// ── 头像 / 占位 ────────────────────────────────────────────────────────────────
function AvatarSpacer() {
  return <span aria-hidden style={{ width: AVATAR_SIZE, flexShrink: 0 }} />;
}

function Avatar({ m }: { m: StudioMessage }) {
  // 头像底色：优先发言者自带色；缺省时 user 用主品牌紫、agent/team 用 clawsgo 软蓝，
  // 让用户回合与 AI 回合的色温一眼可分（clawsgo 冷静蓝 vs 主品牌紫）。
  const color = m.senderColor || (m.role === 'user' ? 'var(--t-accent)' : 'var(--sf-blue, #1890FF)');
  let icon: ReactNode;
  if (m.senderGlyph) icon = m.senderGlyph;
  else if (m.role === 'user') icon = <User size={15} strokeWidth={2} aria-hidden />;
  else if (m.kind === 'team') icon = <Users size={15} strokeWidth={2} aria-hidden />;
  else icon = <Bot size={15} strokeWidth={2} aria-hidden />;
  return (
    <span
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: 8,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        background: `color-mix(in oklab, ${color} 16%, var(--t-panel))`,
        border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
        color,
      }}
    >
      {icon}
    </span>
  );
}

// ── 工具行 / 推理行 ────────────────────────────────────────────────────────────
function ToolRow({ t }: { t: StudioToolRow }) {
  // 状态色温对齐 clawsgo：running=软蓝、done=辅助绿、failed=红。
  const tone =
    t.status === 'failed'
      ? 'var(--t-danger, #e5484d)'
      : t.status === 'running'
        ? 'var(--sf-blue, #1890FF)'
        : 'var(--sf-green, #21A678)';
  return (
    <div
      className="sf-toolrow"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--t-fg-3)',
        padding: '3px 8px',
        borderRadius: 7,
        background: 'var(--t-panel-2)',
        border: '1px solid var(--t-border)',
      }}
    >
      <Wrench size={11} strokeWidth={2} aria-hidden style={{ color: tone, flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: 'var(--t-fg-2)' }}>{t.tool}</span>
      {t.title && <span style={{ color: 'var(--t-fg-4)' }}>{t.title}</span>}
      <span style={{ marginLeft: 'auto', color: tone, flexShrink: 0 }}>
        {t.status === 'running' ? '…' : t.status === 'failed' ? '✕' : '✓'}
      </span>
    </div>
  );
}

function ReasoningRow({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        fontSize: 11.5,
        lineHeight: 1.5,
        color: 'var(--t-fg-4)',
        fontStyle: 'italic',
        padding: '2px 0',
      }}
    >
      <Brain size={12} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
    </div>
  );
}

function AttachmentChip({ a }: { a: StudioAttachment }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '2px 7px',
        borderRadius: 6,
        background: 'var(--t-panel-2)',
        border: '1px solid var(--t-border)',
        color: 'var(--t-fg-2)',
        maxWidth: 200,
      }}
      title={a.meta}
    >
      <Paperclip size={11} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
    </span>
  );
}

export interface StudioMessageRowProps {
  message: StudioMessage;
  /** 是否为同回合续行：true → 隐藏头部 + 用 AvatarSpacer 顶替头像。 */
  grouped: boolean;
  /** 入场动画（仅新增消息）。 */
  animateIn?: boolean;
  /** 重试回调：用户气泡 status==='error' 时显示重试按钮，点击后调用。 */
  onRetry?: (text: string) => void;
}

/**
 * 单条消息行。整列结构恒定：
 *   [ 头像 / 占位 ] [ 内容列：可选头部 + 气泡 + 工具/推理/附件 ]
 * user 行右对齐（头像在右），agent/system 左对齐（头像在左）。
 */
/**
 * 共享回合分组判定（抽离自 StudioChat 的内联 isGrouped）—— 让三个聊天面
 * （workbench StudioChat、群聊 ChatPage、个人 PersonalChatView）走同一套
 * 「一个回合一个头像」的归并规格。
 *
 * 续行（continuation）= 与上一条「同 role 且同发言者」的非 system 消息。
 * 续行渲染 <AvatarSpacer/>、隐藏发言者头部，整回合对齐到同一内容列。
 */
export function isContinuation(
  prev: Pick<StudioMessage, 'role' | 'senderName'> | undefined,
  cur: Pick<StudioMessage, 'role' | 'senderName'>,
): boolean {
  if (!prev) return false;
  if (cur.role === 'system' || prev.role === 'system') return false;
  return prev.role === cur.role && (prev.senderName ?? '') === (cur.senderName ?? '');
}

/** 给一条消息列表标注每条是否为同回合续行（grouped）。纯函数，O(n)。 */
export function groupMessages<T extends Pick<StudioMessage, 'role' | 'senderName'>>(
  list: readonly T[],
): boolean[] {
  return list.map((m, i) => isContinuation(list[i - 1], m));
}

export const StudioMessageRow = memo(function StudioMessageRow({
  message: m,
  grouped,
  animateIn,
  onRetry,
}: StudioMessageRowProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [bubbleHovered, setBubbleHovered] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending timer on unmount to avoid setState on unmounted component.
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopyError(false);
      setCopied(true);
      // Cancel any previous timer before scheduling a new one to prevent flicker.
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopyError(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyError(false), 2000);
    });
  };

  if (m.role === 'system') {
    // 系统行居中、低存在感，不参与回合分组。
    return (
      <div
        className={animateIn ? 'sf-msg-in' : undefined}
        style={{
          display: 'flex',
          justifyContent: 'center',
          margin: '8px 0',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--t-fg-4)', textAlign: 'center', maxWidth: '80%' }}>
          {m.text}
        </span>
      </div>
    );
  }

  const isUser = m.role === 'user';
  // Treat status==='error' the same as m.error for visual purposes so the
  // failure state is immediately discoverable even when only status is set.
  const isErrorState = m.error || m.status === 'error';
  const bubbleBg = isErrorState
    ? 'color-mix(in oklab, var(--t-danger, #e5484d) 12%, var(--t-panel))'
    : isUser
      ? 'color-mix(in oklab, var(--t-accent) 16%, var(--t-panel))'
      : 'var(--t-panel-2)';
  const bubbleBorder = isErrorState
    ? 'color-mix(in oklab, var(--t-danger, #e5484d) 40%, transparent)'
    : 'var(--t-border)';

  const avatarCol = grouped ? <AvatarSpacer /> : <Avatar m={m} />;

  const content = (
    <div
      onMouseEnter={() => setBubbleHovered(true)}
      onMouseLeave={() => setBubbleHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        minWidth: 0,
        // 整回合（工具行 / 推理行 / 气泡）共用同一收口宽度，对齐 hermes 单内容列。
        maxWidth: BUBBLE_MAX_WIDTH,
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* 回合头部：仅回合首行显示发言者名 + 时间 */}
      {!grouped && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--t-fg-3)',
            flexDirection: isUser ? 'row-reverse' : 'row',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--t-fg-2)' }}>
            {m.senderName ?? (isUser ? '我' : 'Agent')}
          </span>
          {m.timestamp && (
            <span
              title={m.timestamp}
              style={{
                color: 'var(--t-fg-4)',
                opacity: bubbleHovered ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: bubbleHovered ? undefined : 'none',
              }}
            >
              {relTime(m.timestamp) || m.timestamp}
            </span>
          )}
        </div>
      )}

      {/* 推理行（assistant，气泡上方） */}
      {!isUser && m.reasoning && <ReasoningRow text={m.reasoning} />}

      {/* 工具行 */}
      {!isUser && m.tools && m.tools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          {m.tools.map((t) => (
            <ToolRow key={t.id} t={t} />
          ))}
        </div>
      )}

      {/* 气泡 */}
      {(m.text || m.streaming) && (
        <div>
          <div
            key={m.id + (m.streaming ? '-s' : '-d')}
            className={`chat-bubble-${m.role}${!isUser && !m.streaming ? ' sf-bubble-settle' : ''}`}
            style={{
              // user 圆角偏向左下、agent 偏向右下 —— 气泡尾巴指向各自头像侧，回合归属一眼可辨。
              position: 'relative',
              maxWidth: '100%',
              padding: '8px 12px',
              borderRadius: 12,
              borderTopRightRadius: isUser ? 4 : 12,
              borderTopLeftRadius: !isUser ? 4 : 12,
              fontSize: 13,
              lineHeight: 1.6,
              wordBreak: 'break-word',
              background: bubbleBg,
              border: `1px solid ${bubbleBorder}`,
              color: 'var(--t-fg)',
            }}
          >
            {isErrorState && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, color: 'var(--t-danger, #e5484d)' }}>
                <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                <span style={{ fontSize: 11, fontWeight: 600 }}>出错</span>
              </div>
            )}
            {m.text ? (
              <MarkdownLite text={m.text} trailingCursor={!isUser && m.streaming} messageId={m.id} />
            ) : (
              // 流式刚开始、文本未到 —— 显示「思考中」三点占位，避免空气泡。
              m.streaming && (
                <span
                  aria-label="生成中"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--t-fg-4)' }}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="sf-typing-dot"
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--sf-blue, #1890FF)',
                        animationDelay: `${i * 0.16}s`,
                      }}
                    />
                  ))}
                </span>
              )
            )}
            {/* 悬浮复制按钮：放在气泡内部 position:absolute，避免依赖外层无 overflow:hidden 假设 */}
            {(bubbleHovered || copied || copyError) && m.text && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? '已复制' : copyError ? '复制失败' : '复制'}
                title={copied ? '已复制' : copyError ? '复制失败' : '复制'}
                style={{
                  position: 'absolute',
                  top: 4,
                  [isUser ? 'left' : 'right']: 4,
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  border: '1px solid var(--t-border)',
                  background: 'var(--t-panel)',
                  color: copied
                    ? 'var(--sf-green, #21A678)'
                    : copyError
                      ? 'var(--t-danger, #e5484d)'
                      : 'var(--t-fg-3)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 0.15s',
                }}
              >
                {copied ? (
                  <Check size={12} strokeWidth={2.5} aria-hidden />
                ) : copyError ? (
                  <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                ) : (
                  <Copy size={12} strokeWidth={2} aria-hidden />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 重试按钮：user 气泡发送失败（status==='error'）时显示 */}
      {isUser && m.status === 'error' && onRetry && (
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            if (retrying) return;
            setRetrying(true);
            onRetry(m.text);
          }}
          aria-label={retrying ? '重试中…' : '重试'}
          title={retrying ? '重试中…' : '重试'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid var(--t-danger, #e5484d)',
            background: 'color-mix(in oklab, var(--t-danger, #e5484d) 10%, var(--t-panel))',
            color: 'var(--t-danger, #e5484d)',
            cursor: retrying ? 'not-allowed' : 'pointer',
            opacity: retrying ? 0.5 : 1,
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            transition: 'opacity 0.15s',
          }}
        >
          <RotateCcw size={11} strokeWidth={2} aria-hidden style={retrying ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          <span>{retrying ? '重试中…' : '重试'}</span>
        </button>
      )}

      {/* 附件 chip */}
      {m.attachments && m.attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
          {m.attachments.map((a) => (
            <AttachmentChip key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`chat-message-${m.role}${grouped ? ' chat-message--grouped' : ''}${animateIn ? ' sf-msg-in' : ''}`}
      style={{
        display: 'flex',
        gap: AVATAR_GAP,
        alignItems: 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
        // 续行紧贴上一行（同回合一块），回合首行留出回合间距。
        marginTop: grouped ? 2 : 12,
      }}
    >
      {avatarCol}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {content}
      </div>
    </div>
  );
});

export default StudioMessageRow;

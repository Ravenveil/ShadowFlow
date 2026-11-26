/**
 * TimelineList — 把一条会话画成「一条时间线」：用户开口、过程（思考 / 工具 /
 * 步骤）、正文、收尾按发生顺序排下来，每格按 `kind` 交给对应的小块。
 *
 * 与 `MessageList`（一问一答的气泡流）的分工：
 *   时间线读得到 —— 过程帧齐全，用它；
 *   读不到（老后端 / 没跑过 run）—— 回落气泡流，界面不会因为「少了一条通道」而空掉。
 *
 * 折叠块默认收起，只有正在流式输出的思考会自己展开、收口后自己合上 ——
 * 过程是解释性的，不该一上来就占满整屏。
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { CHAT, DEMO, STEP_STATUS_TEXT, TIMELINE } from '@/shared/content/app';
import { clockLabel, dayKey, elapsedLabel, stampLabel } from '@/shared/ui/format';
import { groupTimeline, approvalSignalOf, type TimelineWho } from '@/shared/data/timeline';
import { speakerLinesToMarkdown, stripMarkdown, type MdSpeakerLine } from '@/shared/data/markdown';
import type { ReplyQuote } from '@/shared/data/types';
import { MarkdownText } from '@/runtime/chat/MarkdownText';
import { MsgFeedback } from '@/runtime/chat/MsgFeedback';
import { GroupMsgActions } from '@/runtime/chat/GroupMsgActions';
import type { TimelineMessage, TimelineStep } from '@/shared/data/types';
import {
  IconAlert,
  IconArrowRight,
  IconBrain,
  IconBranch,
  IconCheck,
  IconChevron,
  IconCircleDashed,
  IconFile,
  IconFileCheck,
  IconGrid,
  IconImage,
  IconLink,
  IconTerminal,
} from '@/shared/ui/icons';

/** 跨天或间隔太久才插一条日期线；一轮内部不切刀。 */
const DAY_GAP_MS = 30 * 60_000;

/** 回复引用条里正文摘录的长度。 */
const REPLY_EXCERPT = 60;

/**
 * 取某条消息所在「一轮」的 Markdown：同一 turn_id 的用户提问 + 助手正文，
 * 按时间排好拼成可复制文本。找不到 turn 归属时至少带上自己。
 */
function roundMarkdown(all: readonly TimelineMessage[], anchor: TimelineMessage): string {
  const turn = anchor.turn_id || anchor.id;
  const inTurn = all.filter((m) => (m.turn_id || m.id) === turn);
  const lines: MdSpeakerLine[] = [];
  for (const m of inTurn) {
    if (m.kind === 'user_turn' && m.text?.trim()) {
      lines.push({ label: CHAT.msg.speakerYou, text: m.text });
    } else if (m.kind === 'assistant_text' && m.body?.trim()) {
      lines.push({
        label: m.agent_name || m.sender_name || CHAT.msg.speakerAssistant,
        text: m.body,
      });
    }
  }
  return speakerLinesToMarkdown(lines);
}

/** 从一条助手消息造回复引用（作者取说话人，正文剥 Markdown 后截断）。 */
function replyQuoteOf(m: TimelineMessage): ReplyQuote {
  const body = stripMarkdown(m.body ?? m.text ?? '');
  return {
    messageId: m.id,
    author: m.agent_name || m.sender_name || CHAT.msg.speakerAssistant,
    text: body.length > REPLY_EXCERPT ? `${body.slice(0, REPLY_EXCERPT)}…` : body,
  };
}

/* ── 小件 ─────────────────────────────────────────────────────────── */

/** 状态徽标：跑着的、成了的、砸了的，各一个说法。 */
function Badge({ status, streaming }: { status?: string; streaming?: boolean }) {
  if (streaming || status === 'streaming' || status === 'running') {
    return <em className="tl-badge is-running">{TIMELINE.badge.running}</em>;
  }
  if (status === 'ok' || status === 'done' || status === 'succeeded') {
    return <em className="tl-badge is-ok">{TIMELINE.badge.ok}</em>;
  }
  if (status === 'error' || status === 'failed') {
    return <em className="tl-badge is-error">{TIMELINE.badge.error}</em>;
  }
  return null;
}

/**
 * 可折叠卡。`active` 只在**边沿**上自动动作：开始流式就展开、收口就合上；
 * 人不在这两个时刻点它，它就不去抢开合权。
 */
function Fold({
  title,
  meta,
  badge,
  icon,
  defaultOpen = false,
  active = false,
  children,
}: {
  title: string;
  meta?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  active?: boolean;
  children?: ReactNode;
}) {
  // 已经在流式的块直接张开：思考正在长，不该让人先点一下才看见
  const [open, setOpen] = useState(defaultOpen || active);
  const prev = useRef(active);
  useEffect(() => {
    if (prev.current === active) return;
    prev.current = active;
    setOpen(active);
  }, [active]);

  return (
    <div className="tl-fold" data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className="tl-fold-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tl-fold-caret" data-open={open ? 'true' : undefined}>
          <IconChevron size={11} />
        </span>
        {icon ? <span className="tl-fold-icon">{icon}</span> : null}
        <strong className="tl-fold-title">{title}</strong>
        {meta ? <small className="tl-fold-meta">{meta}</small> : null}
        {badge}
      </button>
      {open && children != null ? <div className="tl-fold-body">{children}</div> : null}
    </div>
  );
}

function stepStatusLabel(step: TimelineStep): string {
  if (step.status === 'done') return STEP_STATUS_TEXT.done;
  if (step.status === 'running') return STEP_STATUS_TEXT.running;
  return STEP_STATUS_TEXT.wait;
}

/** 步骤树：父行带序号/勾，子行缩进一级。 */
function StepTree({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="tl-steps">
      {steps.map((step, i) => (
        <li key={`${step.name}-${i}`} className="tl-step" data-status={step.status}>
          <span className="tl-step-mark">
            {step.status === 'done' ? (
              <IconCheck size={9} />
            ) : step.status === 'running' ? (
              <IconCircleDashed size={9} />
            ) : (
              i + 1
            )}
          </span>
          <span className="tl-step-name">{step.name}</span>
          <span className="tl-step-tail">
            {step.status === 'running' ? stepStatusLabel(step) : elapsedLabel(step.elapsed_ms)}
          </span>
          {step.substeps?.length ? (
            <ul className="tl-substeps">
              {step.substeps.map((sub, j) => (
                <li key={`${sub.name}-${j}`} className="tl-substep" data-status={sub.status}>
                  <span>{sub.name}</span>
                  <em>{stepStatusLabel(sub)}</em>
                  <small>{elapsedLabel(sub.elapsed_ms)}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** diff 行：只染「加了 / 删了」，不做语法高亮（行号已是足够的定位）。 */
function DiffLines({ lines }: { lines: NonNullable<TimelineMessage['lines']> }) {
  return (
    <pre className="tl-diff">
      {lines.map((line, i) => (
        <span key={`${line.no}-${i}`} className="tl-diff-line" data-mark={line.mark}>
          <i>{line.no}</i>
          {line.mark} {line.code}
        </span>
      ))}
    </pre>
  );
}

/* ── 整块内容 ─────────────────────────────────────────────────────── */

function PlanCard({ msg }: { msg: TimelineMessage }) {
  const tasks = msg.tasks ?? [];
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="tl-plan">
      <div className="tl-plan-head">
        <IconBranch size={13} />
        <strong>{msg.title || TIMELINE.plan}</strong>
        <span>{TIMELINE.stepProgress(done, tasks.length)}</span>
      </div>
      {msg.goal ? <p className="tl-plan-goal">{msg.goal}</p> : null}
      <ol className="tl-plan-tasks">
        {tasks.map((task, i) => (
          <li key={task.id || i} className="tl-plan-task" data-status={task.status}>
            <span className="tl-plan-mark">
              {task.status === 'done' ? (
                <IconCheck size={10} />
              ) : task.status === 'failed' ? (
                <IconAlert size={10} />
              ) : (
                i + 1
              )}
            </span>
            <span className="tl-plan-title">{task.title}</span>
            {task.assignee ? <span className="tl-plan-who">{task.assignee}</span> : null}
            <em className="tl-plan-status">{TIMELINE.planTask[task.status]}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TablePanel({ msg }: { msg: TimelineMessage }) {
  const columns = msg.columns ?? [];
  const rows = msg.rows ?? [];
  if (!columns.length) return null;
  return (
    <Fold
      title={msg.caption || TIMELINE.table}
      meta={TIMELINE.tableRows(rows.length)}
      icon={<IconGrid size={11} />}
      defaultOpen
    >
      <div className="md-tablewrap">
        <table className="md-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={`${c}-${i}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Fold>
  );
}

function VerdictCard({ msg }: { msg: TimelineMessage }) {
  const passed = msg.passed;
  return (
    <div className="tl-verdict" data-passed={passed === undefined ? undefined : String(passed)}>
      <div className="tl-verdict-head">
        <IconFileCheck size={13} />
        <strong>{msg.title}</strong>
        {passed === undefined ? null : (
          <em className="tl-badge" data-passed={String(passed)}>
            {passed ? TIMELINE.verdictPass : TIMELINE.verdictFail}
          </em>
        )}
        {msg.score !== undefined ? (
          <span className="tl-verdict-score">
            {msg.score}
            {msg.max_score ? ` / ${msg.max_score}` : ''}
          </span>
        ) : null}
      </div>
      {msg.summary ? <p className="tl-verdict-summary">{msg.summary}</p> : null}
      {msg.notes?.length ? (
        <ul className="tl-verdict-notes">
          {msg.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IntentCard({ msg }: { msg: TimelineMessage }) {
  return (
    <div className="tl-intent">
      <div className="tl-intent-head">
        <IconArrowRight size={12} />
        <strong>{TIMELINE.intent(msg.target_name || msg.target_kind || '')}</strong>
      </div>
      {msg.intent ? <p className="tl-intent-goal">{msg.intent}</p> : null}
      {msg.reason ? <p className="tl-intent-reason">{msg.reason}</p> : null}
      {msg.assignments?.length ? (
        <ul className="tl-intent-list">
          {msg.assignments.map((a) => (
            <li key={`${a.agent_id}-${a.title}`}>
              <span>{a.name}</span>
              {a.title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ── 单格 ─────────────────────────────────────────────────────────── */

/** 一格时间线。`inTurn` = 已经被包进「某位 Agent 的一轮」卡里（头像与名字由卡出）。 */
function Row({
  msg,
  inTurn,
  groupId,
  msgState,
  onMsgState,
  allMessages,
  onReply,
}: {
  msg: TimelineMessage;
  inTurn: boolean;
  groupId?: string;
  msgState?: { reactions?: Record<string, string[]>; pinned?: boolean };
  onMsgState?: (next: { reactions?: Record<string, string[]>; pinned?: boolean }) => void;
  allMessages: readonly TimelineMessage[];
  onReply?: (quote: ReplyQuote) => void;
}) {
  switch (msg.kind) {
    case 'user_turn': {
      const attachments = msg.attachments ?? [];
      return (
        <div className="sf-msg sf-msg--user" data-msg-id={msg.id}>
          {msg.text ? <div className="sf-msg-userbubble">{msg.text}</div> : null}
          {attachments.length ? (
            <div className="tl-refs">
              {attachments.map((a) => (
                <span className="tl-ref" key={a.path}>
                  {a.is_image ? <IconImage size={11} /> : <IconFile size={11} />}
                  {a.name}
                </span>
              ))}
            </div>
          ) : null}
          <span className="sf-msg-time">{clockLabel(msg.ts)}</span>
        </div>
      );
    }

    case 'thinking': {
      const streaming = msg.status === 'streaming';
      const raw = (msg.label ?? '').trim();
      // 卡里已经有名字：label 的「某某 正在思考」去掉人名，只留动作
      const stripped =
        inTurn && msg.agent_name && raw.startsWith(msg.agent_name)
          ? raw.slice(msg.agent_name.length).trim()
          : raw;
      const title = stripped || TIMELINE.thinkingFallback;
      const meta = streaming
        ? TIMELINE.thinkingLive
        : msg.tokens !== undefined
          ? TIMELINE.tokenCount(msg.tokens)
          : elapsedLabel(msg.duration_ms) || msg.preview || '';
      return (
        <Fold
          title={title}
          meta={meta}
          badge={<Badge status={msg.status} streaming={streaming} />}
          icon={<IconBrain size={11} />}
          active={streaming}
        >
          <pre className="tl-pre">{msg.body || msg.preview || TIMELINE.empty}</pre>
        </Fold>
      );
    }

    case 'tool_call':
      return (
        <Fold
          title={msg.name || TIMELINE.toolCall}
          meta={msg.args_summary || ''}
          badge={<Badge status={msg.status} />}
          icon={<IconTerminal size={11} />}
        >
          {msg.result_summary ? <p className="tl-result">{msg.result_summary}</p> : null}
          {msg.link ? (
            <a className="tl-link" href={msg.link.href} target="_blank" rel="noreferrer">
              <IconLink size={11} />
              {msg.link.label}
            </a>
          ) : null}
          {msg.duration_ms !== undefined ? (
            <small className="tl-meta-line">{elapsedLabel(msg.duration_ms)}</small>
          ) : null}
        </Fold>
      );

    case 'tool_echo':
      return (
        <Fold
          title={TIMELINE.toolOutput}
          meta={(msg.body ?? '').slice(0, 32)}
          icon={<IconTerminal size={11} />}
        >
          <pre className="tl-pre">{msg.body}</pre>
        </Fold>
      );

    case 'assistant_text': {
      const body = (
        <div className="tl-text">
          {msg.body ? <MarkdownText text={msg.body} className="sf-msg-text" /> : null}
          {msg.streaming ? <span className="tl-cursor" aria-hidden /> : null}
          {!msg.streaming ? <MsgFeedback messageId={msg.id} /> : null}
        </div>
      );
      if (inTurn) return body;
      const name = msg.agent_name || msg.sender_name || DEMO.leadAuthor;
      return (
        <div className="sf-msg sf-msg--agent" data-msg-id={msg.id}>
          <div className="sf-msg-gutter">
            <AgentAvatar label={name} size={AVATAR_SIZE.base} />
          </div>
          <div className="sf-msg-main">
            <div className="sf-msg-head">
              <span className="sf-msg-author">{name}</span>
              <span className="sf-msg-time">{clockLabel(msg.ts)}</span>
            </div>
            {body}
            {groupId && onMsgState ? (
              <GroupMsgActions
                groupId={groupId}
                messageId={msg.id}
                reactions={msgState?.reactions ?? {}}
                pinned={msgState?.pinned ?? false}
                onReactionsChange={(mid, reactions) =>
                  onMsgState({ ...(msgState ?? {}), [mid]: { ...(msgState ?? {}), reactions } })
                }
                onPinnedChange={(mid, pinned) =>
                  onMsgState({ ...(msgState ?? {}), [mid]: { ...(msgState ?? {}), pinned } })
                }
                markdown={roundMarkdown(allMessages, msg)}
                onReply={onReply ? () => onReply(replyQuoteOf(msg)) : undefined}
              />
            ) : null}
          </div>
        </div>
      );
    }

    case 'assistant_meta':
      return (
        <p className="tl-meta-line">
          {[msg.model_brand, msg.model_ver, msg.identity, msg.summary].filter(Boolean).join(' · ')}
        </p>
      );

    case 'rationale':
      return (
        <div className="tl-rationale">
          <strong>{TIMELINE.rationale}</strong>
          <ul>
            {(msg.bullets ?? []).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      );

    case 'step_panel': {
      const steps = msg.steps ?? [];
      const done = steps.filter((s) => s.status === 'done').length;
      return (
        <Fold
          title={TIMELINE.stepPanel}
          meta={TIMELINE.stepProgress(done, msg.total_steps ?? steps.length)}
          icon={<IconCheck size={11} />}
          defaultOpen
        >
          <StepTree steps={steps} />
        </Fold>
      );
    }

    case 'diff_panel':
    case 'file_diff':
      return (
        <Fold
          title={msg.filename || msg.path || TIMELINE.diff}
          meta={TIMELINE.diffStat(msg.added ?? 0, msg.removed ?? 0)}
          icon={<IconFile size={11} />}
        >
          <DiffLines lines={msg.lines ?? []} />
        </Fold>
      );

    case 'plan_card':
      return <PlanCard msg={msg} />;

    case 'table_panel':
      return <TablePanel msg={msg} />;

    case 'verdict_card':
      return <VerdictCard msg={msg} />;

    case 'intent':
      return <IntentCard msg={msg} />;

    case 'commit_record':
      return (
        <div className="tl-commit">
          <IconBranch size={12} />
          <code>{msg.short_sha || (msg.sha ?? '').slice(0, 8)}</code>
          <strong>{msg.message}</strong>
          <small>
            {[msg.repo, msg.author, msg.files_changed !== undefined ? TIMELINE.commitFiles(msg.files_changed) : '']
              .filter(Boolean)
              .join(' · ')}
          </small>
        </div>
      );

    case 'hop_card':
      return (
        <p className="tl-meta-line">
          {TIMELINE.hop}
          {' · '}
          {TIMELINE.hopRoute(msg.from_name || msg.from_agent || '', msg.to_name || msg.to_agent || '')}
          {' · '}
          <Badge status={msg.status} />
          {msg.duration_ms !== undefined ? ` · ${elapsedLabel(msg.duration_ms)}` : ''}
          {msg.detail ? ` · ${msg.detail}` : ''}
        </p>
      );

    case 'status_line':
      return (
        <p className="tl-meta-line">
          {[msg.verb, elapsedLabel((msg.elapsed_s ?? 0) * 1000), msg.tools_running ? TIMELINE.toolsRunning(msg.tools_running) : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      );

    case 'msg_foot':
      return (
        <p className="tl-meta-line tl-foot">
          {[
            msg.status === 'done' ? TIMELINE.footDone : TIMELINE.footRunning,
            elapsedLabel(msg.elapsed_ms),
            msg.tools !== undefined ? TIMELINE.toolCount(msg.tools) : '',
            msg.tokens !== undefined ? TIMELINE.tokenCount(msg.tokens) : '',
            msg.cost_cny !== undefined ? TIMELINE.cost(msg.cost_cny) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      );

    case 'image_panel':
      return msg.src ? (
        <figure className="tl-image">
          <img src={msg.src} alt={msg.alt || msg.title || TIMELINE.image} loading="lazy" />
          {msg.title ? <figcaption>{msg.title}</figcaption> : null}
        </figure>
      ) : null;

    case 'web_preview':
      return (
        <a className="tl-link-card" href={msg.url || '#'} target="_blank" rel="noreferrer">
          <IconLink size={13} />
          <span>
            <strong>{msg.title}</strong>
            {msg.url ? <small>{msg.url}</small> : null}
          </span>
        </a>
      );

    case 'artifact_card':
      return (
        <div className="tl-artifact">
          <IconFile size={13} />
          <strong>{msg.filename || msg.title || TIMELINE.artifactFallback}</strong>
          <small>
            {[msg.artifact_type || TIMELINE.artifactKind, msg.note].filter(Boolean).join(' · ')}
          </small>
        </div>
      );

    case 'raw': {
      // 网关系统提示（审批挂起 / 中止 / 交接摘要）本来就该被看见：
      // 折进「原始输出」等于把「在等你审批」藏起来。
      if (msg.source === 'chat-gateway') {
        const approval = approvalSignalOf(msg.body) === 'request';
        return (
          <p className="tl-sys" data-approval={approval ? 'true' : undefined}>
            <span className="tl-sys-tag">{approval ? TIMELINE.approvalTag : TIMELINE.systemTag}</span>
            <span className="tl-sys-body">{msg.body}</span>
          </p>
        );
      }
      return (
        <Fold
          title={TIMELINE.raw}
          meta={msg.source || ''}
          icon={<IconTerminal size={11} />}
        >
          <pre className="tl-pre">{msg.body}</pre>
        </Fold>
      );
    }

    default:
      // 认不出的 kind：不猜语义，把正文/标签露出来就够；两者都没有就不占位。
      if (!msg.body && !msg.text && !msg.label) return null;
      return (
        <Fold title={msg.label || msg.kind} icon={<IconTerminal size={11} />}>
          <pre className="tl-pre">{msg.body || msg.text}</pre>
        </Fold>
      );
  }
}

/* ── 一轮一卡 ─────────────────────────────────────────────────────── */

function AgentTurn({
  msgs,
  who,
  groupId,
  msgStateOf,
  onMsgState,
  allMessages,
  onReply,
}: {
  msgs: TimelineMessage[];
  who: TimelineWho;
  groupId?: string;
  msgStateOf?: (id: string) => { reactions?: Record<string, string[]>; pinned?: boolean } | undefined;
  onMsgState?: (id: string, next: { reactions?: Record<string, string[]>; pinned?: boolean }) => void;
  allMessages: readonly TimelineMessage[];
  onReply?: (quote: ReplyQuote) => void;
}) {
  const name = who.name || DEMO.leadAuthor;
  const lastAssistant = [...msgs].reverse().find((m) => m.kind === 'assistant_text');
  return (
    <article className="sf-msg sf-msg--agent tl-turn" data-msg-id={msgs[0]?.id}>
      <div className="sf-msg-gutter">
        <AgentAvatar label={name} size={AVATAR_SIZE.base} />
      </div>
      <div className="sf-msg-main">
        <div className="sf-msg-head">
          <span className="sf-msg-author">{name}</span>
          <span className="sf-msg-time">{clockLabel(msgs[0]?.ts ?? 0)}</span>
        </div>
        {msgs.map((m) => (
          <Row key={m.id} msg={m} inTurn allMessages={allMessages} onReply={onReply} />
        ))}
        {groupId && lastAssistant && onMsgState ? (
          <GroupMsgActions
            groupId={groupId}
            messageId={lastAssistant.id}
            reactions={msgStateOf?.(lastAssistant.id)?.reactions ?? {}}
            pinned={msgStateOf?.(lastAssistant.id)?.pinned ?? false}
            onReactionsChange={(mid, reactions) =>
              onMsgState(mid, { ...(msgStateOf?.(mid) ?? {}), reactions })
            }
            onPinnedChange={(mid, pinned) =>
              onMsgState(mid, { ...(msgStateOf?.(mid) ?? {}), pinned })
            }
            markdown={roundMarkdown(allMessages, lastAssistant)}
            onReply={onReply ? () => onReply(replyQuoteOf(lastAssistant)) : undefined}
          />
        ) : null}
      </div>
    </article>
  );
}

export function TimelineList({
  messages,
  truncated,
  groupId,
  messageStates,
  onMessageStates,
  onReply,
}: {
  messages: TimelineMessage[];
  truncated?: boolean;
  /** 群会话 id；给了才渲染消息 reactions/pin 悬浮操作。 */
  groupId?: string;
  /** 消息级 reactions/pinned 水合态（群详情拉来，调用方持有）。 */
  messageStates?: Record<string, { reactions?: Record<string, string[]>; pinned?: boolean }>;
  onMessageStates?: (next: Record<string, { reactions?: Record<string, string[]>; pinned?: boolean }>) => void;
  /** 点消息「回复」：把引用灌进输入框。 */
  onReply?: (quote: ReplyQuote) => void;
}) {
  const rows = groupTimeline(messages);
  let lastTs = 0;

  return (
    <div className="sf-thread sf-timeline">
      {truncated ? <p className="tl-truncated">{TIMELINE.truncated}</p> : null}
      {rows.map((row) => {
        const first = row.kind === 'turn' ? row.msgs[0] : row.msg;
        const startTs = first?.ts ?? 0;
        const showDay =
          startTs > 0 && (lastTs === 0 || dayKey(startTs) !== dayKey(lastTs) || startTs - lastTs >= DAY_GAP_MS);
        if (startTs > 0) lastTs = startTs;

        return (
          <Fragment key={row.kind === 'turn' ? `turn-${row.msgs[0].id}` : `msg-${row.msg.id}`}>
            {showDay ? (
              <div className="tl-day">
                <span>{stampLabel(startTs)}</span>
              </div>
            ) : null}
            {row.kind === 'turn' ? (
              <AgentTurn
                msgs={row.msgs}
                who={row.who}
                groupId={groupId}
                msgStateOf={(id) => messageStates?.[id]}
                onMsgState={
                  onMessageStates
                    ? (id, next) => onMessageStates({ ...(messageStates ?? {}), [id]: next })
                    : undefined
                }
                allMessages={messages}
                onReply={onReply}
              />
            ) : (
              <Row
                msg={row.msg}
                inTurn={false}
                groupId={groupId}
                allMessages={messages}
                onReply={onReply}
                msgState={messageStates?.[row.msg.id]}
                onMsgState={
                  onMessageStates
                    ? (next) => onMessageStates({ ...(messageStates ?? {}), [row.msg.id]: next })
                    : undefined
                }
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

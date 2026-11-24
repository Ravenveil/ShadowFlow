/**
 * TimelineView.tsx — TimelineMessage 判别渲染器（真实时间线）。
 *
 * 对齐 S6.10-A 消息模型（backend node/src/lib/contracts.ts）：
 *   user_turn（用户气泡）/ assistant_text（正式输出，流式光标）/
 *   thinking（可折叠，默认收起 label+preview，展开 body）/
 *   tool_call + tool_echo（可折叠工具卡，状态徽标）/
 *   plan_card / step_panel（计划与步骤）/ rationale / assistant_meta /
 *   status_line / msg_foot / raw / diff_panel / file_diff / commit_record /
 *   table_panel / image_panel / web_preview / artifact_card / verdict_card /
 *   intent / hop_card —— 未知 kind 走紧凑兜底行。
 *
 * 样式类沿用 product-app.css（sf-*），新增 sf-tl-* 见文件尾部。
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  Link2,
  RotateCcw,
  Table2,
  Terminal,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { chatAssetUrl, type DiffLine, type StepRow, type TimelineMessage } from "./chat-api";
import { approvalSignalOf } from "./message-patches";
import { AgentAvatar } from "./avatar";
import { Markdown } from "./markdown-render";

function fmtClock(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDay(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return `今天 ${fmtClock(ts)}`;
  if (same(d, yesterday)) return `昨天 ${fmtClock(ts)}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${fmtClock(ts)}`;
}

function fmtMs(ms?: number): string {
  if (ms == null) return "";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  return m < 60 ? `${m}m ${totalSec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** 可折叠卡片（thinking / tool_call / diff / raw …）。默认收起。
 *  active（2026-11-09 流式思考自动折叠）：true = 流式进行中——进入 active 自动
 *  展开看过程，active 结束（thinking_finalize）自动折叠成摘要行；用户手动点开/收
 *  起仍然优先（只在边沿触发自动动作，不与人抢开合）。 */
export function SfFold({
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
  const [open, setOpen] = useState(defaultOpen);
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = active;
    if (prev === active) return;
    // 流式开始 → 展开看过程；流式收口 → 自动折叠成摘要行（可再手动展开回看）。
    setOpen(active);
  }, [active]);
  return (
    <div className={`sf-tl-fold ${open ? "open" : ""}`}>
      <button type="button" className="sf-tl-fold-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight size={11} className="sf-tl-caret" />
        {icon}
        <strong>{title}</strong>
        {meta && <small>{meta}</small>}
        {badge}
      </button>
      {open && children != null && <div className="sf-tl-fold-body">{children}</div>}
    </div>
  );
}

function statusBadge(status?: string, streaming?: boolean): ReactNode {
  if (streaming || status === "streaming" || status === "running") {
    return <em className="sf-tl-badge running">进行中</em>;
  }
  if (status === "ok" || status === "done" || status === "succeeded") {
    return <em className="sf-tl-badge ok">完成</em>;
  }
  if (status === "error" || status === "failed") {
    return <em className="sf-tl-badge err">失败</em>;
  }
  return null;
}

function stepMeta(step: StepRow): string {
  if (step.elapsed_ms != null) return fmtMs(step.elapsed_ms);
  return step.status === "pending" ? "等待中" : "";
}

function renderSteps(steps: StepRow[]): ReactNode {
  return (
    <div className="sf-step-tree">
      {steps.map((step, idx) => (
        <div key={`${step.name}-${idx}`}>
          <div className={`sf-step-row ${step.status}`}>
            <span className="sf-step-dot">
              {step.status === "done" ? (
                <Check size={9} />
              ) : step.status === "running" ? (
                <RotateCcw size={9} className="sf-spin" />
              ) : (
                idx + 1
              )}
            </span>
            <div>
              <strong>{step.name}</strong>
              <small>{stepMeta(step)}</small>
            </div>
            {step.status === "running" && <span className="sf-step-live">执行中</span>}
          </div>
          {(step.substeps ?? []).map((sub, si) => (
            <div className="sf-step-sub" key={`${sub.name}-${si}`}>
              <span />
              <p>
                {sub.name}
                {sub.status === "done" ? "" : sub.status === "running" ? " · 执行中" : " · 等待中"}
              </p>
              <em className={sub.status}>{sub.status === "done" ? "已完成" : sub.status === "running" ? "执行中" : "等待中"}</em>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderDiffLines(lines: DiffLine[]): ReactNode {
  return (
    <pre className="sf-tl-diff">
      {lines.map((line, i) => (
        <span key={`${line.no}-${i}`} className={`sf-tl-diff-line ${line.mark === "+" ? "add" : line.mark === "-" ? "del" : ""}`}>
          {line.mark} {line.code}
        </span>
      ))}
    </pre>
  );
}

function assistantIdentity(msg: TimelineMessage): { name: string; label: string } {
  const name = msg.agent_name || msg.sender_name || "Agent";
  return { name, label: name.slice(0, 2).toUpperCase() };
}

function renderBody(body: string | undefined): ReactNode {
  if (!body) return null;
  return <Markdown text={body} />;
}

// ── 用户消息展示清洗（2026-11-08）────────────────────────────────────────────
// craft 协议标记行（[post] {...} 等，行首标签 + 单行紧凑 JSON）不进眼睛：
// 小红书徽标自动包装 / 旧版手插模板 / 用户手打标记，气泡只显示人话部分
//（与后端对 agent 回复的 cleaned 剥离语义一致）。整条消息只有标记时回落
// [post] 的 text/title（历史旧消息不留空泡）；解析不出正文原样兜底不静默吞。
// 后端 lib/craft-markers.userVisibleText 同语义（intent 卡/goal 预览就近清洗）；
// 本函数同时供 ProductApp 会话列表预览复用（导出）。
const CRAFT_MARKER_LINE =
  /^\s*\[(?:craft:)?(?:intake|post|link|order|ship|report|build-team|dispatch|draft)\]\s*\{.*\}\s*$/;

export function userVisibleText(text: string): string {
  const kept: string[] = [];
  const payloads: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (CRAFT_MARKER_LINE.test(line)) {
      const json = line.trim().replace(/^\[(?:craft:)?[a-z-]+\]\s*/i, "");
      try {
        payloads.push(JSON.parse(json) as Record<string, unknown>);
      } catch {
        kept.push(line); // JSON 不合法 = 不是协议标记，原样保留
      }
    } else {
      kept.push(line);
    }
  }
  const cleaned = kept.join("\n").trim();
  if (cleaned) return cleaned;
  for (const p of payloads) {
    for (const key of ["text", "title", "name", "summary"] as const) {
      const v = p[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return text;
}

/** 单条时间线消息渲染。inBlock=true 表示已包在 Agent 一轮卡里（头部/头像由卡渲染）。 */
export function TimelineRow({ msg, inBlock = false }: { msg: TimelineMessage; inBlock?: boolean }) {
  switch (msg.kind) {
    case "user_turn":
      return (
        <article className="sf-user-message sf-new-message">
          <Markdown text={userVisibleText(msg.text ?? "")} />
          {(msg.attachments ?? []).map((att) =>
            att.is_image ? (
              // 图片附件缩略图（2026-11-09）：att.url 经 chatAssetUrl 拼直链，
              // 限高约 120px，点击新窗口看原图；非图片保留原 chip
              <a
                className="sf-tl-attach-img-link"
                key={att.path}
                href={chatAssetUrl(att.url)}
                target="_blank"
                rel="noreferrer"
                title={`${att.name}（点击看原图）`}
              >
                <img className="sf-tl-attach-img" src={chatAssetUrl(att.url)} alt={att.name} loading="lazy" />
              </a>
            ) : (
              <span className="sf-tl-attach" key={att.path}>
                <FileText size={11} /> {att.name}
              </span>
            ),
          )}
        </article>
      );

    case "assistant_text": {
      const who = assistantIdentity(msg);
      const body = (
        <div className="sf-tl-text">
          {renderBody(msg.body)}
          {msg.streaming && <span className="sf-tl-cursor" aria-label="流式输出中" />}
        </div>
      );
      if (inBlock) return body;
      return (
        <article className="sf-agent-message">
          <AgentAvatar label={who.label} small />
          <div className="sf-message-body">
            <div className="sf-message-author">
              <strong>{who.name}</strong>
              <span>{fmtClock(msg.ts)}</span>
            </div>
            {body}
          </div>
        </article>
      );
    }

    case "thinking": {
      // 流式思考（2026-11-09）：streaming 时展开流式渲染正文，thinking_finalize
      // 后自动折叠成 label+meta 摘要行（SfFold active 边沿触发），可再展开回看。
      const streaming = msg.status === "streaming" || msg.status === "running";
      // 一轮一卡内头部已有名字：label 的「XX 正在思考」前缀去重，只留「正在思考」
      let title = msg.label || "思考过程";
      if (inBlock && /(^|\s)正在思考\s*$/.test(title)) title = "正在思考";
      return (
        <SfFold
          title={title}
          meta={
            streaming
              ? `思考流式输出中${msg.body ? ` · ${msg.body.length} 字` : ""}`
              : `${msg.preview ? `${msg.preview.slice(0, 24)}… · ` : ""}${msg.tokens != null ? `${msg.tokens} tokens` : msg.duration_ms != null ? fmtMs(msg.duration_ms) : ""}`
          }
          badge={statusBadge(msg.status, streaming)}
          icon={<Terminal size={11} />}
          defaultOpen={streaming}
          active={streaming}
        >
          <pre className="sf-tl-pre">{msg.body || "（无内容）"}</pre>
        </SfFold>
      );
    }

    case "tool_call":
      return (
        <SfFold
          title={msg.name || "工具调用"}
          meta={msg.args_summary || ""}
          badge={statusBadge(msg.status)}
          icon={<GitBranch size={11} />}
        >
          {msg.result_summary && <p className="sf-tl-result">{msg.result_summary}</p>}
          {msg.link && (
            <a className="sf-tl-link" href={msg.link.href} target="_blank" rel="noreferrer">
              <Link2 size={11} /> {msg.link.label}
            </a>
          )}
          {msg.duration_ms != null && <small className="sf-tl-meta-line">耗时 {fmtMs(msg.duration_ms)}</small>}
        </SfFold>
      );

    case "tool_echo":
      return (
        <SfFold title="工具输出" meta={(msg.body ?? "").slice(0, 28)} icon={<Terminal size={11} />}>
          <pre className="sf-tl-pre">{msg.body}</pre>
        </SfFold>
      );

    case "assistant_meta":
      return (
        <p className="sf-tl-meta-line">
          {msg.model_brand} {msg.model_ver} · {msg.identity}
          {msg.summary ? ` · ${msg.summary}` : ""}
        </p>
      );

    case "rationale":
      return (
        <div className="sf-tl-rationale">
          <strong>思路</strong>
          <ul>
            {(msg.bullets ?? []).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      );

    case "status_line":
      return (
        <p className="sf-tl-meta-line">
          {msg.verb} · {fmtMs((msg.elapsed_s ?? 0) * 1000)}
          {msg.tools_running ? ` · ${msg.tools_running} 个工具运行中` : ""}
          {msg.terminal ? "" : " ·"}
          {!msg.terminal && <span className="sf-tl-cursor inline" />}
        </p>
      );

    case "msg_foot":
      return (
        <p className="sf-tl-meta-line">
          {msg.status === "done" ? "本轮完成" : "执行中"}
          {msg.elapsed_ms != null ? ` · ${fmtMs(msg.elapsed_ms)}` : ""}
          {msg.tools != null ? ` · ${msg.tools} tools` : ""}
          {msg.tokens != null ? ` · ${msg.tokens} tokens` : ""}
          {msg.cost_cny != null ? ` · ¥${msg.cost_cny.toFixed(3)}` : ""}
        </p>
      );

    case "step_panel":
      return (
        <SfFold
          title="执行步骤"
          meta={`${(msg.steps ?? []).filter((s) => s.status === "done").length} / ${msg.total_steps ?? (msg.steps ?? []).length} 完成`}
          icon={<Check size={11} />}
          defaultOpen
        >
          {renderSteps(msg.steps ?? [])}
        </SfFold>
      );

    case "plan_card":
      return (
        <div className="sf-plan">
          <div className="sf-plan-head">
            <span>
              <GitBranch size={15} /> {msg.title || "执行计划"}
            </span>
            {msg.goal && <small>{userVisibleText(msg.goal).slice(0, 40)}</small>}
          </div>
          {(msg.tasks ?? []).map((task, idx) => (
            <div className="sf-plan-row" key={task.id || idx}>
              <span className={task.status}>
                {task.status === "done" ? <Check size={12} /> : task.status === "failed" ? "!" : idx + 1}
              </span>
              <div>
                <strong>{task.title}</strong>
                <small>{task.assignee || task.agent_id || ""}</small>
              </div>
              <em className={task.status}>
                {task.status === "done" ? "完成" : task.status === "running" ? "执行中" : task.status === "failed" ? "失败" : "等待中"}
              </em>
            </div>
          ))}
        </div>
      );

    case "diff_panel":
    case "file_diff":
      return (
        <SfFold
          title={msg.filename || msg.path || "diff"}
          meta={`+${msg.added ?? 0} −${msg.removed ?? 0}`}
          icon={<FileText size={11} />}
        >
          {renderDiffLines(msg.lines ?? [])}
        </SfFold>
      );

    case "commit_record":
      return (
        <div className="sf-tl-commit">
          <GitBranch size={12} />
          <code>{msg.short_sha || (msg.sha ?? "").slice(0, 8)}</code>
          <strong>{msg.message}</strong>
          <small>
            {msg.repo}
            {msg.author ? ` · ${msg.author}` : ""}
            {msg.files_changed != null ? ` · ${msg.files_changed} 文件` : ""}
          </small>
        </div>
      );

    case "table_panel":
      return (
        <SfFold title={msg.caption || "数据表"} meta={`${(msg.rows ?? []).length} 行`} icon={<Table2 size={11} />}>
          <table className="sf-tl-table">
            <thead>
              <tr>
                {(msg.columns ?? []).map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(msg.rows ?? []).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </SfFold>
      );

    case "image_panel":
      return (
        <figure className="sf-tl-image">
          <img src={msg.src} alt={msg.alt || msg.title || "图片"} loading="lazy" />
          {msg.title && <figcaption>{msg.title}</figcaption>}
        </figure>
      );

    case "web_preview":
      return (
        <a className="sf-tl-link-card" href={msg.url || "#"} target="_blank" rel="noreferrer">
          <Link2 size={13} />
          <div>
            <strong>{msg.title}</strong>
            <small>{msg.url || "网页预览"}</small>
          </div>
        </a>
      );

    case "artifact_card":
      return (
        <button className="sf-artifact" type="button">
          <span>
            <FileText size={17} />
          </span>
          <div>
            <strong>{msg.filename || msg.title || "产物"}</strong>
            <small>
              {msg.artifact_type || "文件"}
              {msg.note ? ` · ${msg.note}` : ""}
            </small>
          </div>
          <ChevronRight size={16} />
        </button>
      );

    case "verdict_card":
      return (
        <div className="sf-tl-verdict">
          <strong>{msg.title}</strong>
          {msg.passed != null &&
            (msg.passed ? (
              <em className="sf-tl-badge ok">
                <ThumbsUp size={10} /> 通过{msg.score != null ? ` · ${msg.score}${msg.max_score ? `/${msg.max_score}` : ""}` : ""}
              </em>
            ) : (
              <em className="sf-tl-badge err">
                <ThumbsDown size={10} /> 未通过
              </em>
            ))}
          {msg.summary && <small>{msg.summary}</small>}
          {(msg.notes ?? []).map((n, i) => (
            <small key={i}>· {n}</small>
          ))}
        </div>
      );

    case "intent":
      return (
        <div className="sf-tl-intent">
          <strong>意图派发 · {msg.target_name}</strong>
          <small>{userVisibleText(msg.intent ?? "")}</small>
          <small className="sf-tl-meta-line">{msg.reason}</small>
          {(msg.assignments ?? []).map((a, i) => (
            <small key={i}>
              → {a.name}：{a.title}
            </small>
          ))}
        </div>
      );

    case "hop_card":
      return (
        <p className="sf-tl-meta-line">
          交接：{msg.from_name || msg.from_agent} → {msg.to_name || msg.to_agent} ·{" "}
          {statusBadge(msg.status) ?? msg.status}
          {msg.duration_ms != null ? ` · ${fmtMs(msg.duration_ms)}` : ""}
          {msg.detail ? ` · ${msg.detail}` : ""}
        </p>
      );

    case "raw": {
      // chat-gateway 系统提示（审批挂起/中止/交接摘要…）：直接可见的系统行——
      // 此前折叠进「原始输出」，审批门挂起提示因此没人看得见（2026-11-09）。
      if (msg.source === "chat-gateway") {
        const signal = approvalSignalOf(msg.body);
        return (
          <p className={`sf-tl-sys ${signal === "request" ? "sf-tl-sys-approval" : ""}`}>
            <span className="sf-tl-sys-tag">{signal === "request" ? "待审批" : "系统"}</span>
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.body ?? ""}</span>
          </p>
        );
      }
      return (
        <SfFold title="原始输出" meta={msg.source || ""} icon={<Terminal size={11} />}>
          <pre className="sf-tl-pre">{msg.body}</pre>
        </SfFold>
      );
    }

    default:
      return (
        <SfFold title={String(msg.kind)} meta="" icon={<Terminal size={11} />}>
          <pre className="sf-tl-pre">{JSON.stringify(msg, null, 2)}</pre>
        </SfFold>
      );
  }
}

// ── 一轮一卡（2026-11-08 排版）────────────────────────────────────────────
// 思考条/工具卡/正文/收尾归并成一张 Agent 卡：头像+名字+时间在卡顶，思考条
// 落在头部与正文之间（数组即时间序），msg_foot 稳定挪到卡片末尾（回放路径
// 按 ts 排序会把它插到正文前）。归属比对：agent_id / agent_name / sender_name
// / thinking label 前缀回落（对齐 contracts「老数据回落 label 前缀匹配」），
// 空归属并入相邻卡；归属冲突（不同 agent）即拆卡。时间分隔线只在跨天或
// 间隔 ≥30 分钟时出现，不再每变一分钟就切一刀把一轮拆散。
const TURN_KINDS = new Set([
  "thinking",
  "tool_call",
  "tool_echo",
  "assistant_text",
  "assistant_meta",
  "rationale",
  "status_line",
  "msg_foot",
]);

type MsgWho = { id: string; name: string };

function whoOf(msg: TimelineMessage): MsgWho {
  let name = msg.agent_name || msg.sender_name || "";
  if (!name && msg.kind === "thinking" && msg.label) {
    const m = /^(.+?)[ \t]+正在思考/.exec(msg.label.trim());
    if (m) name = m[1];
  }
  return { id: msg.agent_id || "", name };
}

function whoConflict(a: MsgWho, b: MsgWho): boolean {
  if (a.id && b.id && a.id !== b.id) return true;
  if (a.name && b.name && a.name !== b.name) return true;
  return false;
}

type TurnRow = { kind: "turn"; msgs: TimelineMessage[]; who: MsgWho };
type FlatRow = { kind: "user" | "system"; msg: TimelineMessage } | TurnRow;

function groupTurnRows(messages: TimelineMessage[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const msg of messages) {
    if (msg.kind === "user_turn") {
      rows.push({ kind: "user", msg });
      continue;
    }
    const last = rows[rows.length - 1];
    if (TURN_KINDS.has(msg.kind)) {
      const who = whoOf(msg);
      if (last && last.kind === "turn" && !whoConflict(last.who, who)) {
        last.msgs.push(msg);
        if (!last.who.name && who.name) last.who.name = who.name;
        if (!last.who.id && who.id) last.who.id = who.id;
      } else {
        rows.push({ kind: "turn", msgs: [msg], who });
      }
    } else {
      rows.push({ kind: "system", msg });
    }
  }
  for (const row of rows) {
    if (row.kind !== "turn") continue;
    const foots = row.msgs.filter((m) => m.kind === "msg_foot");
    if (foots.length > 0) {
      row.msgs = [...row.msgs.filter((m) => m.kind !== "msg_foot"), ...foots];
    }
  }
  return rows;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const DIVIDER_GAP_MS = 30 * 60_000;

/** 一张 Agent 回合卡：头部（头像/名字/时间）→ 过程条（思考/工具）→ 正文 → 收尾行。 */
function AgentTurn({ msgs, who }: { msgs: TimelineMessage[]; who: MsgWho }) {
  const name = who.name || "Agent";
  return (
    <article className="sf-agent-message sf-agent-turn">
      <AgentAvatar label={name.slice(0, 2).toUpperCase()} small />
      <div className="sf-message-body">
        <div className="sf-message-author">
          <strong>{name}</strong>
          <span>{fmtClock(msgs[0].ts)}</span>
        </div>
        {msgs.map((m) => (
          <TimelineRow key={m.id} msg={m} inBlock />
        ))}
      </div>
    </article>
  );
}

/** 时间线列表：一轮一卡分组 + 跨天/长间隔时间分隔 + 逐块渲染。 */
export function TimelineList({ messages }: { messages: TimelineMessage[] }) {
  const rows = groupTurnRows(messages);
  let lastTs = 0;
  return (
    <>
      {rows.map((row) => {
        const msgs = row.kind === "turn" ? row.msgs : [row.msg];
        const startTs = msgs[0].ts;
        const endTs = msgs[msgs.length - 1].ts;
        const showDivider =
          startTs > 0 && (lastTs === 0 || dayKey(startTs) !== dayKey(lastTs) || startTs - lastTs >= DIVIDER_GAP_MS);
        if (endTs > 0) lastTs = endTs;
        return (
          <Fragment key={row.kind === "turn" ? `turn-${row.msgs[0].id}` : `${row.kind}-${row.msg.id}`}>
            {showDivider && (
              <div className="sf-date-line">
                <span>{fmtDay(startTs)}</span>
              </div>
            )}
            {row.kind === "turn" ? <AgentTurn msgs={row.msgs} who={row.who} /> : <TimelineRow msg={row.msg} />}
          </Fragment>
        );
      })}
    </>
  );
}

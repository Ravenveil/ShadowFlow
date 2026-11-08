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
  const paragraphs = body.split(/\n{2,}/);
  return paragraphs.map((p, i) => (
    <p key={i} style={{ whiteSpace: "pre-wrap" }}>
      {p}
    </p>
  ));
}

/** 单条时间线消息渲染。 */
export function TimelineRow({ msg }: { msg: TimelineMessage }) {
  switch (msg.kind) {
    case "user_turn":
      return (
        <article className="sf-user-message sf-new-message">
          <p style={{ whiteSpace: "pre-wrap" }}>{msg.text ?? ""}</p>
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
      return (
        <article className="sf-agent-message">
          <AgentAvatar label={who.label} small />
          <div className="sf-message-body">
            <div className="sf-message-author">
              <strong>{who.name}</strong>
              <span>{fmtClock(msg.ts)}</span>
            </div>
            <div className="sf-tl-text">
              {renderBody(msg.body)}
              {msg.streaming && <span className="sf-tl-cursor" aria-label="流式输出中" />}
            </div>
          </div>
        </article>
      );
    }

    case "thinking": {
      // 流式思考（2026-11-09）：streaming 时展开流式渲染正文，thinking_finalize
      // 后自动折叠成 label+meta 摘要行（SfFold active 边沿触发），可再展开回看。
      const streaming = msg.status === "streaming" || msg.status === "running";
      return (
        <SfFold
          title={msg.label || "思考过程"}
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
            {msg.goal && <small>{msg.goal.slice(0, 40)}</small>}
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
          <small>{msg.intent}</small>
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

/** 时间线列表：按天分隔 + 逐条渲染。 */
export function TimelineList({ messages }: { messages: TimelineMessage[] }) {
  let lastDay = "";
  return (
    <>
      {messages.map((msg) => {
        const day = fmtDay(msg.ts);
        const showDay = day && day !== lastDay;
        if (showDay) lastDay = day;
        return (
          <Fragment key={msg.id}>
            {showDay && (
              <div className="sf-date-line">
                <span>{day}</span>
              </div>
            )}
            <TimelineRow msg={msg} />
          </Fragment>
        );
      })}
    </>
  );
}

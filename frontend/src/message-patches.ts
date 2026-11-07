/**
 * message-patches.ts — 时间线消息流式补丁 reducer（纯函数、可单测）。
 *
 * 语义与后端 node/src/lib/timeline-replay.ts `applyPatch` 一一对应（同源于
 * 老前端 src/components/run-session/timeline/types.ts 的 reducer 契约）：
 *   - message 事件 → upsertMessage（同 id 覆盖，位置保持；新 id 追加）
 *   - message-patch 事件 → applyPatchToList（按 id 定位，就地不可变更新）
 *   - op 与消息 kind 不匹配 → 防御性 no-op（返回原对象）
 *   - patch 指向未知 id → 丢弃（环形缓冲可能已驱逐原消息）
 */

import type { DiffLine, MessagePatch, PlanTaskRow, StepRow, TimelineMessage } from "./chat-api";

/** 把一条 MessagePatch 应用到单条 TimelineMessage。返回新对象（不可变）。 */
export function applyPatch(msg: TimelineMessage, patch: MessagePatch): TimelineMessage {
  switch (patch.op) {
    case "text_append": {
      if (msg.kind !== "assistant_text") return msg;
      const chunk = typeof patch.chunk === "string" ? patch.chunk : "";
      return { ...msg, body: (msg.body ?? "") + chunk, streaming: true };
    }
    case "text_finalize": {
      if (msg.kind !== "assistant_text") return msg;
      return { ...msg, streaming: false };
    }
    case "append_step": {
      if (msg.kind !== "step_panel") return msg;
      const step = patch.step as StepRow | undefined;
      if (!step) return msg;
      return { ...msg, steps: [...(msg.steps ?? []), step] };
    }
    case "update_step": {
      if (msg.kind !== "step_panel") return msg;
      const index = typeof patch.index === "number" ? patch.index : -1;
      const sub = patch.patch as Partial<StepRow> | undefined;
      if (index < 0 || !sub) return msg;
      const steps = (msg.steps ?? []).map((s, i) => (i === index ? { ...s, ...sub } : s));
      return { ...msg, steps };
    }
    case "append_substep": {
      if (msg.kind !== "step_panel") return msg;
      const stepIndex = typeof patch.step_index === "number" ? patch.step_index : -1;
      const sub = patch.sub as StepRow | undefined;
      if (stepIndex < 0 || !sub) return msg;
      const steps = (msg.steps ?? []).map((s, i) =>
        i === stepIndex ? { ...s, substeps: [...(s.substeps ?? []), sub] } : s,
      );
      return { ...msg, steps };
    }
    case "update_substep": {
      if (msg.kind !== "step_panel") return msg;
      const stepIndex = typeof patch.step_index === "number" ? patch.step_index : -1;
      const subIndex = typeof patch.sub_index === "number" ? patch.sub_index : -1;
      const sub = patch.patch as Partial<StepRow> | undefined;
      if (stepIndex < 0 || subIndex < 0 || !sub) return msg;
      const steps = (msg.steps ?? []).map((s, i) => {
        if (i !== stepIndex) return s;
        const subs: StepRow[] = (s.substeps ?? []).map((row, j) =>
          j === subIndex ? { ...row, ...sub } : row,
        );
        return { ...s, substeps: subs };
      });
      return { ...msg, steps };
    }
    case "thinking_append_body": {
      if (msg.kind !== "thinking") return msg;
      const chunk = typeof patch.chunk === "string" ? patch.chunk : "";
      return { ...msg, body: (msg.body ?? "") + chunk };
    }
    case "thinking_finalize": {
      if (msg.kind !== "thinking") return msg;
      return {
        ...msg,
        status: "done",
        tokens: typeof patch.tokens === "number" ? patch.tokens : msg.tokens,
        duration_ms: typeof patch.duration_ms === "number" ? patch.duration_ms : msg.duration_ms,
      };
    }
    case "tool_finalize": {
      if (msg.kind !== "tool_call") return msg;
      return {
        ...msg,
        status: typeof patch.status === "string" ? patch.status : msg.status,
        duration_ms: typeof patch.duration_ms === "number" ? patch.duration_ms : msg.duration_ms,
        result_summary:
          typeof patch.result_summary === "string" ? patch.result_summary : msg.result_summary,
      };
    }
    case "diff_append_line": {
      if (msg.kind !== "diff_panel" && msg.kind !== "file_diff") return msg;
      const line = patch.line as DiffLine | undefined;
      if (!line) return msg;
      return { ...msg, lines: [...(msg.lines ?? []), line] };
    }
    case "msg_foot_update": {
      if (msg.kind !== "msg_foot") return msg;
      const sub = patch.patch as Partial<TimelineMessage> | undefined;
      return { ...msg, ...(sub ?? {}) };
    }
    case "plan_update_task": {
      if (msg.kind !== "plan_card") return msg;
      const taskId = typeof patch.task_id === "string" ? patch.task_id : "";
      const sub = patch.patch as Partial<PlanTaskRow> | undefined;
      if (!taskId || !sub) return msg;
      const tasks = (msg.tasks ?? []).map((t) => (t.id === taskId ? { ...t, ...sub } : t));
      return { ...msg, tasks };
    }
    case "hop_update": {
      if (msg.kind !== "hop_card") return msg;
      const sub = patch.patch as Partial<TimelineMessage> | undefined;
      return { ...msg, ...(sub ?? {}) };
    }
    default:
      return msg;
  }
}

/** 同 id 覆盖 / 新 id 追加（保持原位置）。返回新数组。 */
export function upsertMessage(messages: TimelineMessage[], msg: TimelineMessage): TimelineMessage[] {
  const pos = messages.findIndex((m) => m.id === msg.id);
  if (pos === -1) return [...messages, msg];
  const next = messages.slice();
  next[pos] = msg;
  return next;
}

/** 按 id 定位并应用补丁；未知 id 丢弃。返回新数组。 */
export function applyPatchToList(
  messages: TimelineMessage[],
  patch: MessagePatch,
): TimelineMessage[] {
  const pos = messages.findIndex((m) => m.id === patch.id);
  if (pos === -1) return messages;
  const next = messages.slice();
  next[pos] = applyPatch(next[pos], patch);
  return next;
}

/** run 流事件缓冲折叠：message 追加 + message-patch 就地更新（对齐 replayTimeline）。 */
export function foldTimelineEvents(
  messages: TimelineMessage[],
  events: Array<{ event: string; data: unknown }>,
): TimelineMessage[] {
  let out = messages;
  for (const rec of events) {
    const data = rec.data as { id?: unknown; kind?: unknown; op?: unknown } | null;
    if (!data || typeof data.id !== "string") continue;
    if (rec.event === "message" && typeof data.kind === "string") {
      out = upsertMessage(out, data as unknown as TimelineMessage);
    } else if (rec.event === "message-patch" && typeof data.op === "string") {
      out = applyPatchToList(out, data as unknown as MessagePatch);
    }
  }
  return out;
}

/** 是否终态 run 状态（非终态才订阅 run 流）。 */
export function isTerminalRunStatus(status: string | undefined | null): boolean {
  if (!status) return true;
  const s = status.toLowerCase();
  return s !== "running" && s !== "pending";
}

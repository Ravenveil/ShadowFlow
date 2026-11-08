/**
 * message-patches.test.ts — MessagePatch reducer 最小用例（node:test）。
 *
 * 运行（零依赖，Node ≥ 22.6 自带类型剥离）：
 *   node --experimental-strip-types --test src/message-patches.test.ts
 * 或（vitest 可用时）：
 *   npx vitest run src
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPatch,
  applyPatchToList,
  approvalSignalOf,
  deriveWaitingApproval,
  foldTimelineEvents,
  isTerminalRunStatus,
  upsertMessage,
} from "./message-patches.ts";
import type { MessagePatch, TimelineMessage } from "./chat-api.ts";

function base(id: string, kind: string, extra: Partial<TimelineMessage> = {}): TimelineMessage {
  return { id, kind, turn_id: "turn-1", ts: 1000, ...extra } as TimelineMessage;
}

function patchOf(id: string, op: string, extra: Record<string, unknown> = {}): MessagePatch {
  return { id, kind: "", turn_id: "", ts: 0, op, ...extra } as MessagePatch;
}

test("text_append 追加正文并置 streaming 光标", () => {
  const msg = base("m1", "assistant_text", { body: "你好" });
  const out = applyPatch(msg, patchOf("m1", "text_append", { chunk: "，世界" }));
  assert.equal(out.body, "你好，世界");
  assert.equal(out.streaming, true);
});

test("text_finalize 收口流式光标", () => {
  const msg = base("m1", "assistant_text", { body: "你好", streaming: true });
  const out = applyPatch(msg, patchOf("m1", "text_finalize"));
  assert.equal(out.streaming, false);
});

test("thinking_append_body / thinking_finalize", () => {
  let msg = base("m1", "thinking", { label: "思考", status: "streaming", body: "先" });
  msg = applyPatch(msg, patchOf("m1", "thinking_append_body", { chunk: "想后做" }));
  assert.equal(msg.body, "先想后做");
  msg = applyPatch(msg, patchOf("m1", "thinking_finalize", { tokens: 42, duration_ms: 900 }));
  assert.equal(msg.status, "done");
  assert.equal(msg.tokens, 42);
  assert.equal(msg.duration_ms, 900);
});

test("tool_finalize 落定工具卡状态", () => {
  const msg = base("m1", "tool_call", { name: "search", status: "running" });
  const out = applyPatch(
    msg,
    patchOf("m1", "tool_finalize", { status: "ok", duration_ms: 1200, result_summary: "找到 3 条" }),
  );
  assert.equal(out.status, "ok");
  assert.equal(out.duration_ms, 1200);
  assert.equal(out.result_summary, "找到 3 条");
});

test("append_step / update_step / append_substep / update_substep", () => {
  let msg = base("m1", "step_panel", { total_steps: 2, steps: [] });
  msg = applyPatch(msg, patchOf("m1", "append_step", { step: { name: "研究", status: "running" } }));
  msg = applyPatch(msg, patchOf("m1", "append_step", { step: { name: "策略", status: "pending" } }));
  assert.equal(msg.steps?.length, 2);
  msg = applyPatch(msg, patchOf("m1", "update_step", { index: 0, patch: { status: "done", elapsed_ms: 500 } }));
  assert.equal(msg.steps?.[0].status, "done");
  assert.equal(msg.steps?.[0].elapsed_ms, 500);
  msg = applyPatch(msg, patchOf("m1", "append_substep", { step_index: 0, sub: { name: "扫描", status: "done" } }));
  assert.equal(msg.steps?.[0].substeps?.length, 1);
  msg = applyPatch(
    msg,
    patchOf("m1", "update_substep", { step_index: 0, sub_index: 0, patch: { status: "running" } }),
  );
  assert.equal(msg.steps?.[0].substeps?.[0].status, "running");
});

test("diff_append_line 追加 diff 行（diff_panel 与 file_diff 同语义）", () => {
  for (const kind of ["diff_panel", "file_diff"]) {
    const msg = base("m1", kind, { filename: "a.ts", lines: [] });
    const out = applyPatch(msg, patchOf("m1", "diff_append_line", { line: { no: 1, mark: "+", code: "x" } }));
    assert.equal(out.lines?.length, 1, kind);
    assert.equal(out.lines?.[0].code, "x");
  }
});

test("msg_foot_update 合并补丁字段", () => {
  const msg = base("m1", "msg_foot", { status: "running", elapsed_ms: 100 });
  const out = applyPatch(
    msg,
    patchOf("m1", "msg_foot_update", { patch: { status: "done", elapsed_ms: 2500, tokens: 320, cost_cny: 0.01 } }),
  );
  assert.equal(out.status, "done");
  assert.equal(out.elapsed_ms, 2500);
  assert.equal(out.tokens, 320);
  assert.equal(out.cost_cny, 0.01);
});

test("plan_update_task 按 task_id 更新任务状态", () => {
  const msg = base("m1", "plan_card", {
    title: "计划",
    tasks: [
      { id: "node:a", title: "研究", status: "running" },
      { id: "node:b", title: "策略", status: "pending" },
    ],
  });
  const out = applyPatch(
    msg,
    patchOf("m1", "plan_update_task", { task_id: "node:a", patch: { status: "done" } }),
  );
  assert.equal(out.tasks?.[0].status, "done");
  assert.equal(out.tasks?.[1].status, "pending");
});

test("hop_update 推进交接卡生命周期", () => {
  const msg = base("m1", "hop_card", { from_agent: "a", to_agent: "b", status: "pending" });
  const out = applyPatch(
    msg,
    patchOf("m1", "hop_update", { patch: { status: "done", output_chars: 320, duration_ms: 1500 } }),
  );
  assert.equal(out.status, "done");
  assert.equal(out.output_chars, 320);
});

test("op 与 kind 不匹配 → 防御性 no-op（返回原对象）", () => {
  const msg = base("m1", "tool_call", { name: "x" });
  const out = applyPatch(msg, patchOf("m1", "text_append", { chunk: "y" }));
  assert.equal(out, msg);
});

test("upsertMessage：同 id 覆盖保位置，新 id 追加", () => {
  const a = base("a", "user_turn", { text: "1" });
  const b = base("b", "assistant_text", { body: "2" });
  let list = upsertMessage([], a);
  list = upsertMessage(list, b);
  assert.equal(list.length, 2);
  list = upsertMessage(list, { ...a, text: "1改" });
  assert.equal(list.length, 2);
  assert.equal(list[0].text, "1改");
});

test("applyPatchToList：未知 id 丢弃不抛错", () => {
  const list = [base("a", "assistant_text", { body: "x" })];
  const out = applyPatchToList(list, patchOf("ghost", "text_append", { chunk: "y" }));
  assert.equal(out, list);
});

test("foldTimelineEvents：message + message-patch 按序折叠", () => {
  const events = [
    { event: "message", data: base("m1", "assistant_text", { body: "你" }) },
    { event: "message-patch", data: patchOf("m1", "text_append", { chunk: "好" }) },
    { event: "message", data: base("m2", "tool_call", { name: "search", status: "running" }) },
    { event: "message-patch", data: patchOf("m2", "tool_finalize", { status: "ok" }) },
    { event: "message-patch", data: patchOf("ghost", "text_append", { chunk: "?" }) },
  ];
  const out = foldTimelineEvents([], events);
  assert.equal(out.length, 2);
  assert.equal(out[0].body, "你好");
  assert.equal(out[1].status, "ok");
});

test("isTerminalRunStatus 终态判定", () => {
  assert.equal(isTerminalRunStatus("running"), false);
  assert.equal(isTerminalRunStatus("pending"), false);
  assert.equal(isTerminalRunStatus("succeeded"), true);
  assert.equal(isTerminalRunStatus("failed"), true);
  assert.equal(isTerminalRunStatus("canceled"), true);
  assert.equal(isTerminalRunStatus("idle"), true);
  assert.equal(isTerminalRunStatus(undefined), true);
});

// ── 2026-11-09 审批挂起可见化 — 系统提示审批信号推导 ─────────────────────────
function sys(body: string): TimelineMessage {
  return base(`sys_${body.length}`, "raw", { body, source: "chat-gateway" });
}

test("approvalSignalOf：挂起/请批准 → request；决定收场 → decision", () => {
  assert.equal(
    approvalSignalOf("[approval] 内容策划师 的执行已挂起，等待人工审批（该节点带审批入边）。"),
    "request",
  );
  assert.equal(
    approvalSignalOf("✅ 博文《竹编灯罩》已确认。\n审批门① 品牌定稿：请董事长批准（回复「批准」）。"),
    "request",
  );
  assert.equal(approvalSignalOf("[approval] 内容策划师 的审批结果：已批准 ✅"), "decision");
  assert.equal(
    approvalSignalOf("[approval] 运营专员 的执行被拒绝，本轮该节点跳过（产出不落库、下游不再等待它）。"),
    "decision",
  );
  assert.equal(approvalSignalOf("[chat] 上一轮回复已中止（新消息开始新一轮）。"), null);
  assert.equal(approvalSignalOf("[chat] 市场分析师 出错：模型服务暂不可达。"), null);
});

test("approvalSignalOf：门①已批准+门②请批准的合并消息按「仍待批」计", () => {
  // request 判定优先 —— 合并消息的语义是「还有一道门在等人」
  assert.equal(
    approvalSignalOf("✅ 审批门① 品牌定稿已批准。\n审批门② 对外发布：请董事长批准（回复「批准」）。"),
    "request",
  );
});

test("deriveWaitingApproval：倒序取最近一条审批信号", () => {
  // 挂起 → true
  assert.equal(deriveWaitingApproval([sys("[approval] X 的执行已挂起，等待人工审批。")]), true);
  // 决定收场 → false
  assert.equal(
    deriveWaitingApproval([
      sys("[approval] X 的执行已挂起，等待人工审批。"),
      sys("[approval] X 的审批结果：已批准 ✅"),
    ]),
    false,
  );
  // 无关系统消息不干扰倒序判定
  assert.equal(
    deriveWaitingApproval([
      sys("[approval] X 的执行已挂起，等待人工审批。"),
      sys("[chat] 交接摘要：A → B。"),
    ]),
    true,
  );
  // 无系统消息 / 消息流（含 assistant_text）不误报
  assert.equal(deriveWaitingApproval([]), false);
  assert.equal(deriveWaitingApproval([base("m1", "assistant_text", { body: "好的" })]), false);
  // 新一轮又挂起 → true
  assert.equal(
    deriveWaitingApproval([
      sys("[approval] X 的审批结果：已拒绝 ❌"),
      sys("[approval] Y 的执行已挂起，等待人工审批。"),
    ]),
    true,
  );
});

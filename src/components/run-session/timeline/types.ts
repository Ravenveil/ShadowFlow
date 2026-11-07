/**
 * Front-end mirror of `server/src/lib/contracts.ts` TimelineMessage/MessagePatch
 * types (S6.10-A). Kept as a parallel definition because the front-end
 * tsconfig only includes `src/` — the server module is not directly importable.
 *
 * SOURCE OF TRUTH: server/src/lib/contracts.ts (must stay in sync).
 *
 * SSE contract:
 *   event: 'message'       → data = TimelineMessage   (full new message)
 *   event: 'message-patch' → data = MessagePatch      (mutates existing by id)
 */

export type MessageKind =
  | 'user_turn'
  | 'thinking'
  | 'assistant_meta'
  | 'assistant_text'
  /**
   * T3 — first-class bucket for unclassified content (leaked SSE frames,
   * off-protocol blobs, raw CLI lines). Rendered as a collapsed raw block so
   * it never pollutes the answer bubble. Mirrors OpenDesign's `raw` kind.
   */
  | 'raw'
  | 'rationale'
  | 'tool_call'
  | 'tool_echo'
  | 'step_panel'
  | 'diff_panel'
  | 'msg_foot'
  | 'status_line'
  /**
   * Round 2.5 — section divider row (e.g. "Builder", "思考过程",
   * "工作 · 白名单运行"). Standalone foldable header without inline
   * children; subsequent messages live under it visually. Currently
   * only emitted by FE-side extractors; server can emit later.
   */
  | 'section_header'
  /**
   * Polynoia-parity rich inline content (2026-08-15) — work artifacts
   * rendered directly in the chat stream: the orchestrator's task plan,
   * git commit records, real file diffs, data tables, images, live web
   * previews, artifact references and verifier verdicts. Mirror of the
   * server contracts; additive — unknown kinds were already appended by id.
   */
  | 'plan_card'
  | 'commit_record'
  | 'file_diff'
  | 'table_panel'
  | 'image_panel'
  | 'web_preview'
  | 'artifact_card'
  | 'verdict_card'
  /**
   * 2026-08-23 — WorkBuddy 式意图分发可视化：网关 INTENT_PARSE 后补发的
   * 派发决策帧（派给谁、为什么）。群聊现场由 NeoGroupChat 的
   * NeoDispatchCard 渲染；通用 Timeline 不渲染（见 NeoTimeline case）。
   */
  | 'intent'
  /**
   * 2026-11-05 — 群聊 DAG 交接边实时播报（hop 生命周期可视化）：A→B 交接边
   * open→终态逐帧上屏（open 全量帧 + hop_update patch 推进），用户在聊天流里
   * 直接看到「谁的产出交给了谁、哪里断了」。additive。
   */
  | 'hop_card';

export interface TimelineMessageBase {
  /** ULID-ish stable id. React key + patch target. */
  id: string;
  kind: MessageKind;
  /** All messages in one user turn share this. */
  turn_id: string;
  /** epoch ms. */
  ts: number;
}

export interface StepRow {
  name: string;
  status: 'done' | 'running' | 'pending';
  elapsed_ms?: number;
  substeps?: StepRow[];
}

export interface DiffLine {
  no: number;
  mark: '+' | '-' | ' ';
  code: string;
  /** P2-4 — when true, render a blinking caret at end of line (v8 .cur). */
  cursor?: boolean;
}

/** One task row inside a plan_card — the orchestrator's decomposition. */
export interface PlanTaskRow {
  /** Stable id (e.g. `node:<node_id>`). Patch target for plan_update_task. */
  id: string;
  title: string;
  /** Display name of the assigned agent (worker). */
  assignee?: string;
  /** Agent id true-source for deterministic attribution (U0 convention). */
  agent_id?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  /** 1-based parallel batch/layer — same batch = dispatched concurrently. */
  batch?: number;
  elapsed_ms?: number;
  note?: string;
}

export interface CommitFileEntry {
  path: string;
  /** Git letter: A added / M modified / D deleted / R renamed. */
  status: string;
}

/** intent 卡里的一条派发明细（镜像 server contracts.IntentAssignment）。 */
export interface IntentAssignment {
  agent_id: string;
  name: string;
  title: string;
}

export type TimelineMessage =
  | (TimelineMessageBase & { kind: 'user_turn'; text: string })
  | (TimelineMessageBase & {
      kind: 'thinking';
      label: string;
      tokens?: number;
      preview?: string;
      body?: string;
      status: 'streaming' | 'done';
      /** Thinking duration ms, set on finalize. Renders as "Thought for Xs". */
      duration_ms?: number;
      /** 2026-11-06 Agent 检查器 — 群聊 fanout 归属（additive，老数据回落 label 前缀）。 */
      agent_id?: string;
      agent_name?: string;
    })
  | (TimelineMessageBase & {
      kind: 'assistant_meta';
      model_brand: string;
      model_ver: string;
      identity: string;
      summary: string;
    })
  | (TimelineMessageBase & {
      kind: 'assistant_text';
      body: string;
      /** While true, the AssistantText renderer shows a trailing blink-caret. */
      streaming?: boolean;
      /**
       * F2 (2026-06-11) — optional speaker attribution for group-chat-origin
       * messages (server chatMessagesToTimeline keeps the chat sender_name;
       * run-originated timeline messages never set it). Additive: absent →
       * no header rendered, run-session page unaffected.
       */
      sender_name?: string;
      /**
       * U0 绑角色（2026-06-23 消息引擎归一）— 发送者 agent_id 真源。sender_name 仅
       * 展示（可重名）；agent_id 用于 color/avatar/权限确定性归属。run 产出的消息无此字段。
       */
      agent_id?: string;
    })
  | (TimelineMessageBase & {
      kind: 'raw';
      /** Unclassified content, verbatim. Rendered in a collapsed mono block. */
      body: string;
      /** Optional provenance hint (e.g. 'sse-frame-leak', 'unknown-tag'). */
      source?: string;
      /** F2 — optional speaker attribution (see assistant_text.sender_name). */
      sender_name?: string;
      /** U0 绑角色 — 发送者 agent_id（见 assistant_text.agent_id）。 */
      agent_id?: string;
    })
  | (TimelineMessageBase & { kind: 'rationale'; bullets: string[] })
  | (TimelineMessageBase & {
      kind: 'tool_call';
      name: string;
      args_summary: string;
      link?: { label: string; href: string };
      /**
       * gap #2（2026-06-24，对齐 Hermes 工具卡）— per-tool 执行状态与耗时。
       * status: 调用中 / 成功 / 失败；duration_ms: 从 tool_use 到 tool_result 的耗时；
       * result_summary: 结果摘要（如 "3 files" / "527 elements" / 首行）。
       * 由 projector 的 onToolUse(running) → onToolResult(tool_finalize patch) 填充。
       */
      status?: 'running' | 'ok' | 'error';
      duration_ms?: number;
      result_summary?: string;
      /** 2026-11-06 Agent 检查器 — 群聊 fanout 归属（additive，单聊不传）。 */
      agent_id?: string;
      agent_name?: string;
    })
  | (TimelineMessageBase & {
      kind: 'tool_echo';
      body: string;
      /** 2026-11-06 — 同 tool_call.agent_id（echo 与其 call 成对出现）。 */
      agent_id?: string;
      agent_name?: string;
    })
  | (TimelineMessageBase & {
      kind: 'step_panel';
      total_steps: number;
      steps: StepRow[];
    })
  | (TimelineMessageBase & {
      kind: 'diff_panel';
      filename: string;
      added: number;
      removed: number;
      lines: DiffLine[];
    })
  | (TimelineMessageBase & {
      kind: 'msg_foot';
      status: 'running' | 'done';
      elapsed_ms?: number;
      tools?: number;
      tokens?: number;
      cost_cny?: number;
    })
  | (TimelineMessageBase & {
      kind: 'status_line';
      verb: string;
      elapsed_s: number;
      tools_running: number;
      /**
       * True once the turn is terminal (projector onComplete). When set the
       * StatusLine ticker freezes — elapsed_s is the final duration.
       */
      terminal?: boolean;
    })
  | (TimelineMessageBase & {
      kind: 'section_header';
      title: string;
      /** Optional trailing meta (e.g. "5 steps · 5.4s"). */
      meta?: string;
      /** Default true; FE persists toggle state per id. */
      default_open?: boolean;
    })
  // ── Polynoia-parity rich inline content payloads ──────────────────────────
  | (TimelineMessageBase & {
      kind: 'plan_card';
      title: string;
      /** The user goal this plan decomposes. */
      goal?: string;
      tasks: PlanTaskRow[];
    })
  | (TimelineMessageBase & {
      kind: 'commit_record';
      repo: string;
      sha: string;
      short_sha: string;
      message: string;
      author: string;
      /** ISO date of the commit. */
      date?: string;
      files_changed: number;
      insertions: number;
      deletions: number;
      files?: CommitFileEntry[];
      /** Optional external link (e.g. web UI commit page). */
      url?: string;
      /** 2026-11-07 检查器产出归属 — 提交者 agent（additive；无归属 = 老数据 /
       *  编排者合并提交，检查器对无归属卡不进流）。 */
      agent_id?: string;
      agent_name?: string;
    })
  | (TimelineMessageBase & {
      kind: 'file_diff';
      path: string;
      /** Highlight language hint (e.g. 'ts', 'py'); optional. */
      language?: string;
      added: number;
      removed: number;
      lines: DiffLine[];
      /** 2026-11-07 检查器产出归属 — 同 commit_record.agent_id（与其成对出现）。 */
      agent_id?: string;
      agent_name?: string;
    })
  | (TimelineMessageBase & {
      kind: 'table_panel';
      caption?: string;
      columns: string[];
      rows: (string | number)[][];
    })
  | (TimelineMessageBase & {
      kind: 'image_panel';
      src: string;
      alt?: string;
      title?: string;
    })
  | (TimelineMessageBase & {
      kind: 'web_preview';
      title: string;
      /** URL to load in the sandboxed iframe (same-origin artifact paths ok). */
      url?: string;
      /** Inline HTML source alternative when no URL exists. */
      src?: string;
    })
  | (TimelineMessageBase & {
      kind: 'artifact_card';
      title?: string;
      /** 'yaml' | 'html' | 'markdown' today; open string for future kinds. */
      artifact_type: string;
      filename: string;
      /** Servable URL (e.g. /projects/<session>/artifact.html). */
      url?: string;
      note?: string;
    })
  | (TimelineMessageBase & {
      kind: 'verdict_card';
      title: string;
      /** Verifier/critique pass flag; omitted when no threshold semantics. */
      passed?: boolean;
      /** Aggregate score (verifier 0-1 probability or critique 0-10 avg). */
      score?: number;
      /** Score ceiling for display normalization (e.g. 10). */
      max_score?: number;
      summary?: string;
      metrics?: { label: string; value: string | number; detail?: string }[];
      notes?: string[];
    })
  | (TimelineMessageBase & {
      kind: 'intent';
      /** 用户原始意图（原文截断）。 */
      intent: string;
      /** team = 团队 DAG 派发；agent = 串行逐个派发。 */
      target_kind: 'team' | 'agent';
      target_name: string;
      /** 派发理由（LLM 拆解说明 / 降级原因）。 */
      reason: string;
      /** 可选：per-agent 子任务明细（仅 LLM 拆解成功时有）。 */
      assignments?: IntentAssignment[];
    })
  | (TimelineMessageBase & {
      kind: 'hop_card';
      /** 交接发起方 agent id。 */
      from_agent: string;
      /** 接收方 agent id。 */
      to_agent: string;
      /** 展示名快照（open 时刻服务端解析，避免前端查不到 agent 时裸露 id）。 */
      from_name: string;
      to_name: string;
      status: 'pending' | 'running' | 'done' | 'failed' | 'timeout' | 'empty' | 'denied' | 'aborted';
      /** 结算时上游产出的字符数（0 = 无产出）。 */
      output_chars?: number;
      /** 终态原因（错误信息 / denied 原因 / aborted 来源）。 */
      detail?: string;
      /** 结算耗时 ms。 */
      duration_ms?: number;
    });

export type MessagePatch =
  | { id: string; op: 'text_append'; chunk: string }
  | { id: string; op: 'text_finalize' }
  | { id: string; op: 'append_step'; step: StepRow }
  | { id: string; op: 'update_step'; index: number; patch: Partial<StepRow> }
  | { id: string; op: 'append_substep'; step_index: number; sub: StepRow }
  | {
      id: string;
      op: 'update_substep';
      step_index: number;
      sub_index: number;
      patch: Partial<StepRow>;
    }
  | { id: string; op: 'thinking_append_body'; chunk: string }
  | { id: string; op: 'thinking_finalize'; tokens?: number; duration_ms?: number }
  // gap #2 — tool_call 终态：tool_result 回来时把对应 tool_call 从 running 落定。
  | { id: string; op: 'tool_finalize'; status: 'ok' | 'error'; duration_ms?: number; result_summary?: string }
  | { id: string; op: 'diff_append_line'; line: DiffLine }
  | {
      id: string;
      op: 'msg_foot_update';
      patch: Partial<{
        status: 'running' | 'done';
        elapsed_ms: number;
        tools: number;
        tokens: number;
        cost_cny: number;
      }>;
    }
  // Polynoia-parity — live task status transitions inside an open plan_card.
  | { id: string; op: 'plan_update_task'; task_id: string; patch: Partial<PlanTaskRow> }
  // 2026-11-05 — hop_card 生命周期推进：running / 终态结算（open 已有全量帧）。
  | {
      id: string;
      op: 'hop_update';
      patch: Partial<{
        status: 'running' | 'done' | 'failed' | 'timeout' | 'empty' | 'denied' | 'aborted';
        output_chars: number;
        detail: string;
        duration_ms: number;
      }>;
    };

/**
 * Pure reducer helper — apply a `MessagePatch` onto the matching
 * `TimelineMessage`. Returns a new message instance (immutability) or the
 * original if op is incompatible with the message's kind (defensive — server
 * shouldn't emit mismatched patches, but we no-op rather than crash).
 *
 * Tested in `src/core/hooks/__tests__/useRunSession.timeline.test.ts`.
 */
export function applyPatch(
  msg: TimelineMessage,
  patch: MessagePatch,
): TimelineMessage {
  switch (patch.op) {
    case 'text_append': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, body: msg.body + patch.chunk, streaming: true };
    }
    case 'text_finalize': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, streaming: false };
    }
    case 'append_step': {
      if (msg.kind !== 'step_panel') return msg;
      return { ...msg, steps: [...msg.steps, patch.step] };
    }
    case 'update_step': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) =>
        i === patch.index ? { ...s, ...patch.patch } : s,
      );
      return { ...msg, steps };
    }
    case 'append_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) => {
        if (i !== patch.step_index) return s;
        return { ...s, substeps: [...(s.substeps ?? []), patch.sub] };
      });
      return { ...msg, steps };
    }
    case 'update_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const steps = msg.steps.map((s, i) => {
        if (i !== patch.step_index) return s;
        const subs = (s.substeps ?? []).map((sub, j) =>
          j === patch.sub_index ? { ...sub, ...patch.patch } : sub,
        );
        return { ...s, substeps: subs };
      });
      return { ...msg, steps };
    }
    case 'thinking_append_body': {
      if (msg.kind !== 'thinking') return msg;
      return { ...msg, body: (msg.body ?? '') + patch.chunk };
    }
    case 'thinking_finalize': {
      if (msg.kind !== 'thinking') return msg;
      return {
        ...msg,
        status: 'done',
        tokens: patch.tokens ?? msg.tokens,
        duration_ms: patch.duration_ms ?? msg.duration_ms,
      };
    }
    case 'tool_finalize': {
      if (msg.kind !== 'tool_call') return msg;
      return {
        ...msg,
        status: patch.status,
        duration_ms: patch.duration_ms ?? msg.duration_ms,
        result_summary: patch.result_summary ?? msg.result_summary,
      };
    }
    case 'diff_append_line': {
      if (msg.kind !== 'diff_panel') return msg;
      return { ...msg, lines: [...msg.lines, patch.line] };
    }
    case 'msg_foot_update': {
      if (msg.kind !== 'msg_foot') return msg;
      return { ...msg, ...patch.patch };
    }
    case 'plan_update_task': {
      if (msg.kind !== 'plan_card') return msg;
      return {
        ...msg,
        tasks: msg.tasks.map((t) =>
          t.id === patch.task_id ? { ...t, ...patch.patch } : t,
        ),
      };
    }
    case 'hop_update': {
      if (msg.kind !== 'hop_card') return msg;
      return { ...msg, ...patch.patch };
    }
    default:
      return msg;
  }
}

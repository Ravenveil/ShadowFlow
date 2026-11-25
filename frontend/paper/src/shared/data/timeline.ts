/**
 * timeline.ts — 时间线的**纯函数**层：流式补丁、去重合并、按轮分组。
 *
 * 三件事都只吃数据、不碰网络也不碰 DOM，所以能单测：
 *   1. `applyTimelinePatch` —— 后端一路 `text_append` / `thinking_append_body`
 *      推过来的增量，就地长进那一格（正文流式、步骤树长大的核心）
 *   2. `reconcileTimeline` —— 轮询拿到的服务端结果 + 本地还没被确认的
 *      乐观回声，合成一份不重不漏的列表
 *   3. `groupTimeline`   —— 把一条直线切成「用户 / 系统 / 某位 Agent 的一轮」，
 *      让头像与名字只出现一次，而不是每格都挂一遍
 *
 * 补丁语义与后端 `lib/timeline-replay.ts` 的 `applyPatch` 一一对应：
 * op 与消息 kind 不匹配 → 原样返回（防御性 no-op，永不抛）；
 * 补丁指向不认识的 id → 丢弃（环形缓冲可能已经驱逐了原消息）。
 */
import type { TimelineMessage, TimelinePatch, TimelineStep } from '@/shared/data/types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** run 是否还在跑（只有 running / pending 值得订阅过程流）。 */
export function isActiveRun(status: string | undefined | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'running' || s === 'pending';
}

/** 同 id 覆盖（位置不动），新 id 追加 —— 时间线是「一格一格长出来」的，顺序不能被打乱。 */
export function upsertTimeline(
  list: readonly TimelineMessage[],
  msg: TimelineMessage,
): TimelineMessage[] {
  const pos = list.findIndex((m) => m.id === msg.id);
  if (pos === -1) return [...list, msg];
  const next = list.slice();
  next[pos] = msg;
  return next;
}

/** 把一条补丁应用到单格；返回新对象（不可变）。op 与 kind 不匹配时原样返回。 */
export function applyTimelinePatch(msg: TimelineMessage, patch: TimelinePatch): TimelineMessage {
  switch (patch.op) {
    case 'text_append': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, body: (msg.body ?? '') + str(patch.chunk), streaming: true };
    }
    case 'text_finalize': {
      if (msg.kind !== 'assistant_text') return msg;
      return { ...msg, streaming: false };
    }
    case 'thinking_append_body': {
      if (msg.kind !== 'thinking') return msg;
      return { ...msg, body: (msg.body ?? '') + str(patch.chunk) };
    }
    case 'thinking_finalize': {
      if (msg.kind !== 'thinking') return msg;
      return {
        ...msg,
        status: 'done',
        tokens: num(patch.tokens) ?? msg.tokens,
        duration_ms: num(patch.duration_ms) ?? msg.duration_ms,
      };
    }
    case 'tool_finalize': {
      if (msg.kind !== 'tool_call') return msg;
      const status = str(patch.status);
      return {
        ...msg,
        status: status === 'ok' || status === 'error' ? status : msg.status,
        duration_ms: num(patch.duration_ms) ?? msg.duration_ms,
        result_summary: str(patch.result_summary) || msg.result_summary,
      };
    }
    case 'append_step': {
      if (msg.kind !== 'step_panel') return msg;
      const step = rec(patch.step);
      if (!step) return msg;
      return { ...msg, steps: [...(msg.steps ?? []), step as unknown as TimelineStep] };
    }
    case 'update_step': {
      if (msg.kind !== 'step_panel') return msg;
      const index = num(patch.index);
      const sub = rec(patch.patch);
      if (index === undefined || !sub) return msg;
      return {
        ...msg,
        steps: (msg.steps ?? []).map((s, i) => (i === index ? { ...s, ...sub } : s)),
      };
    }
    case 'append_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const at = num(patch.step_index);
      const sub = rec(patch.sub);
      if (at === undefined || !sub) return msg;
      return {
        ...msg,
        steps: (msg.steps ?? []).map((s, i) =>
          i === at ? { ...s, substeps: [...(s.substeps ?? []), sub as unknown as TimelineStep] } : s,
        ),
      };
    }
    case 'update_substep': {
      if (msg.kind !== 'step_panel') return msg;
      const at = num(patch.step_index);
      const subAt = num(patch.sub_index);
      const sub = rec(patch.patch);
      if (at === undefined || subAt === undefined || !sub) return msg;
      return {
        ...msg,
        steps: (msg.steps ?? []).map((s, i) =>
          i === at
            ? {
                ...s,
                substeps: (s.substeps ?? []).map((row, j) => (j === subAt ? { ...row, ...sub } : row)),
              }
            : s,
        ),
      };
    }
    case 'diff_append_line': {
      if (msg.kind !== 'diff_panel' && msg.kind !== 'file_diff') return msg;
      const line = rec(patch.line);
      if (!line) return msg;
      return {
        ...msg,
        lines: [...(msg.lines ?? []), line as unknown as NonNullable<TimelineMessage['lines']>[number]],
      };
    }
    case 'msg_foot_update': {
      if (msg.kind !== 'msg_foot') return msg;
      return { ...msg, ...(rec(patch.patch) ?? {}) };
    }
    case 'plan_update_task': {
      if (msg.kind !== 'plan_card') return msg;
      const taskId = str(patch.task_id);
      const sub = rec(patch.patch);
      if (!taskId || !sub) return msg;
      return {
        ...msg,
        tasks: (msg.tasks ?? []).map((t) => (t.id === taskId ? { ...t, ...sub } : t)),
      };
    }
    case 'hop_update': {
      if (msg.kind !== 'hop_card') return msg;
      return { ...msg, ...(rec(patch.patch) ?? {}) };
    }
    default:
      return msg;
  }
}

/** 按 id 定位并打补丁；未知 id 丢弃。返回新数组。 */
export function applyTimelinePatchToList(
  list: TimelineMessage[],
  patch: TimelinePatch,
): TimelineMessage[] {
  const pos = list.findIndex((m) => m.id === patch.id);
  if (pos === -1) return list;
  const next = list.slice();
  next[pos] = applyTimelinePatch(next[pos], patch);
  return next;
}

/** 本地回声被服务端确认的时间窗：超出这个距离的同文本消息不算「同一句」。 */
const ECHO_WINDOW_MS = 120_000;

/**
 * 服务端结果 + 本地乐观回声 → 一份不重不漏的列表。
 *
 * 乐观回声（`local-` 前缀）只是「我刚发出去的那句」的占位：服务端一旦
 * 回显同文本的用户消息，占位就该退场，否则同一句话会渲染两遍。
 */
export function reconcileTimeline(
  server: readonly TimelineMessage[],
  echoes: readonly TimelineMessage[],
): TimelineMessage[] {
  if (!echoes.length) return [...server];
  const pending = new Map<string, number>();
  for (const m of server) {
    if (m.kind !== 'user_turn') continue;
    const key = (m.text ?? '').trim();
    pending.set(key, (pending.get(key) ?? 0) + 1);
  }
  const kept = echoes.filter((e) => {
    const key = (e.text ?? '').trim();
    const confirmed = server.some(
      (m) => m.kind === 'user_turn' && (m.text ?? '').trim() === key && m.ts >= e.ts - ECHO_WINDOW_MS,
    );
    if (confirmed) {
      const left = pending.get(key) ?? 0;
      if (left > 0) pending.set(key, left - 1);
      return false;
    }
    return true;
  });
  if (!kept.length) return [...server];
  return [...server, ...kept].sort((a, b) => a.ts - b.ts);
}

/* ── 系统提示的分类 ───────────────────────────────────────────────── */

/**
 * 网关系统提示的语义分类：
 *   'request'  —— 有审批门在等人（挂起 / 请批准）
 *   'decision' —— 一次审批已收场（已批准 / 被拒绝 / 超时）
 *   null       —— 与审批无关（中止提示、交接摘要、报错…）
 *
 * 先判 request：「门①已批准，门②请批准」这种合并消息的语义仍是「还有门要批」。
 * 这套判定放在这里而不是组件里：它是**文案匹配**，属于数据层的脏活，
 * 后端改了措辞只需要改这一处，界面不必动。
 */
export function approvalSignalOf(body: string | undefined): 'request' | 'decision' | null {
  const text = body ?? '';
  if (!text) return null;
  if (/等待(人工)?审批|请.{0,16}批准|回复「批准」/.test(text)) return 'request';
  if (/审批结果|已获批准|被拒绝|已拒绝|等待超时/.test(text)) return 'decision';
  return null;
}

/* ── 按轮分组 ─────────────────────────────────────────────────────── */
/** 同一轮里的格子：这些 kind 归到「某位 Agent 的一轮」卡里，共用头像与名字。 */
const TURN_KINDS = new Set([
  'thinking',
  'tool_call',
  'tool_echo',
  'assistant_text',
  'assistant_meta',
  'rationale',
  'status_line',
  'msg_foot',
]);

export interface TimelineWho {
  id: string;
  name: string;
}

export type TimelineRow =
  | { kind: 'user' | 'system'; msg: TimelineMessage }
  | { kind: 'turn'; msgs: TimelineMessage[]; who: TimelineWho };

/**
 * 这一格是谁的。群聊 fanout 下后端的归属字段可能只有 agent_id，
 * 老数据还可能是 thinking 的 label 前缀（「张三 正在思考」），依次回落。
 */
function whoOf(msg: TimelineMessage): TimelineWho {
  let name = msg.agent_name || msg.sender_name || '';
  if (!name && msg.kind === 'thinking' && msg.label) {
    const m = /^(.+?)[\s]+(?:is thinking|正在思考)/.exec(msg.label.trim());
    if (m) name = m[1].trim();
  }
  return { id: msg.agent_id || '', name };
}

function whoConflict(a: TimelineWho, b: TimelineWho): boolean {
  if (a.id && b.id && a.id !== b.id) return true;
  return !!(a.name && b.name && a.name !== b.name);
}

/**
 * 一条直线 → 可渲染的行。
 *   user_turn          → 用户气泡（自带 turn 边界）
 *   过程 / 正文 / 收尾  → 并进同一张 Agent 卡（换了人就拆卡）
 *   其余（计划卡、diff、裁决…）→ 独立块，不参与分组
 * `msg_foot` 稳定挪到卡末：回放按 ts 排序时它可能落在一轮中间。
 */
export function groupTimeline(list: readonly TimelineMessage[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const msg of list) {
    if (msg.kind === 'user_turn') {
      rows.push({ kind: 'user', msg });
      continue;
    }
    // 收尾行没有归属，而且常被后置的计划卡 / 裁决卡隔开：直接挂到上一张
    // Agent 卡的末尾，别让它单独成一张「主控说了句用时 1m 18s」的卡。
    if (msg.kind === 'msg_foot') {
      const lastTurn = [...rows].reverse().find((r) => r.kind === 'turn');
      if (lastTurn) {
        lastTurn.msgs.push(msg);
        continue;
      }
    }
    if (!TURN_KINDS.has(msg.kind)) {
      rows.push({ kind: 'system', msg });
      continue;
    }
    const who = whoOf(msg);
    const last = rows[rows.length - 1];
    if (last && last.kind === 'turn' && !whoConflict(last.who, who)) {
      last.msgs.push(msg);
      if (!last.who.name && who.name) last.who.name = who.name;
      if (!last.who.id && who.id) last.who.id = who.id;
    } else {
      rows.push({ kind: 'turn', msgs: [msg], who });
    }
  }
  for (const row of rows) {
    if (row.kind !== 'turn') continue;
    const foots = row.msgs.filter((m) => m.kind === 'msg_foot');
    if (!foots.length) continue;
    row.msgs = [...row.msgs.filter((m) => m.kind !== 'msg_foot'), ...foots];
  }
  return rows;
}

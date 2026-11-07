/**
 * action-journal.ts — 行动留痕日志（2026-11-07，OpenBot 对齐批）。
 *
 * OpenBot：「every action decided before it happens and recorded after」。
 * 本模块是 "recorded after" 一侧的持久留痕：每次工具派发记两条成对条目 —
 *
 *   phase:'decided'  — 执行前的裁定（auto / approve / deny / block）
 *   phase:'recorded' — 执行后的结果（ok / error / duration）
 *
 * 连接器作用域（connector.scope）与策略变更（connector.policy）也记入本
 * 日志，形成「谁、在什么作用域下、裁定了什么、结果如何」的可回放链条。
 *
 * 存储：$CWD/.shadowflow/action-journal.jsonl（env SF_ACTION_JOURNAL_PATH
 * 可覆盖，测试用）。追加式 JSONL，一行一条；读取按倒序（新→旧）截断。
 * 写失败静默吞掉 —— 留痕永远不能反过来弄坏工具执行路径。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ActionPhase = 'decided' | 'recorded';

export interface ActionJournalEntry {
  id: string;
  ts: number;
  phase: ActionPhase;
  /** 动作名（工具名 / connector.scope / connector.policy）。 */
  tool_name: string;
  session_id?: string;
  /** decided 帧：执行前裁定结果。 */
  decision?: 'auto' | 'approve' | 'deny' | 'block';
  /** recorded 帧：执行是否成功。 */
  ok?: boolean;
  duration_ms?: number;
  /** 自由形状补充（输入摘要 / 错误信息 / 策略快照等）。 */
  detail?: unknown;
}

export type ActionRecordInput = Omit<ActionJournalEntry, 'id' | 'ts'> & { ts?: number };

function journalPath(): string {
  if (process.env.SF_ACTION_JOURNAL_PATH) return process.env.SF_ACTION_JOURNAL_PATH;
  // vitest 环境默认落 tmp —— 测试不得往仓库 .shadowflow/ 写脏文件。
  if (process.env.VITEST) {
    return path.join(os.tmpdir(), `sf-action-journal-${process.pid}.jsonl`);
  }
  return path.join(process.cwd(), '.shadowflow', 'action-journal.jsonl');
}

/** 追加一条留痕。返回成型条目（写盘失败也返回，只是不落盘）。 */
export function recordAction(input: ActionRecordInput): ActionJournalEntry {
  const entry: ActionJournalEntry = {
    id: randomUUID(),
    ts: input.ts ?? Date.now(),
    phase: input.phase,
    tool_name: input.tool_name,
    ...(input.session_id !== undefined ? { session_id: input.session_id } : {}),
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
    ...(input.ok !== undefined ? { ok: input.ok } : {}),
    ...(input.duration_ms !== undefined ? { duration_ms: input.duration_ms } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
  try {
    const file = journalPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* 留痕失败不阻塞主流程 */
  }
  return entry;
}

export interface ActionListFilter {
  /** 最多返回条数（新→旧），默认 200，上限 1000。 */
  limit?: number;
  sessionId?: string;
  toolName?: string;
  phase?: ActionPhase;
}

/** 读取留痕（新→旧）。文件缺失/损坏行 fail-soft 跳过。 */
export function listActions(filter: ActionListFilter = {}): ActionJournalEntry[] {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  let raw: string;
  try {
    raw = fs.readFileSync(journalPath(), 'utf8');
  } catch {
    return [];
  }
  const out: ActionJournalEntry[] = [];
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const e = parsed as ActionJournalEntry;
    if (typeof e.tool_name !== 'string' || typeof e.phase !== 'string') continue;
    if (filter.sessionId && e.session_id !== filter.sessionId) continue;
    if (filter.toolName && e.tool_name !== filter.toolName) continue;
    if (filter.phase && e.phase !== filter.phase) continue;
    out.push(e);
  }
  return out;
}

/** 测试隔离：置空 env 路径缓存等（当前实现无内存态，保留接口对称）。 */
export function _resetForTests(): void {
  /* no in-memory state — nothing to reset */
}

/**
 * NeoRunInline — clawsgo 式 inline 任务执行视图（Neo 中栏核心）。
 *
 * 纯展示组件：session 由 NeoChat 的 useRunSession 提供（SSE 唯一数据源，
 * D11 决议：不 mock、缺帧暴露）。渲染：
 *   1. 用户灰气泡（右对齐，来自 SSE user_turn 消息）
 *   2. agent 头（✳ 名称 + 累计耗时）
 *   3. 「执行了 N 个操作」可折叠列表 —— 工具调用（tool-call 帧）+ 深度思考
 *      （thinking-chunk 帧）+ Loop 节点（GET /api/runs/{id}/loops，REST 轮询
 *      补充：运行中 5s/次，完成后再拉一次）按当天时间归并排序
 *   4. agent 回复（assistant_text / chatReply，左对齐无气泡）
 *   5. 底部状态 pill（运行中：当前步骤 + x/y；完成：✓ 已完成全部任务，
 *      点击折叠/展开操作列表）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Repeat,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { RunSessionToolCall, UseRunSessionReturn } from '../core/hooks/useRunSession';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { getRunLoops, type LoopStatus, type LoopStep } from '../api/runs';
import { useI18n } from '../common/i18n';

export interface NeoRunInlineProps {
  /** 当前 run 的 session id（同时作为 /api/runs/{id}/loops 的 run id）。 */
  runId: string;
  session: UseRunSessionReturn;
  /** 左栏当前选中对象名（agent/team），用于 agent 头展示。 */
  targetName: string | null;
}

/**
 * AgentTextBlock — agent 回复块（左对齐无气泡）。Coze 桌面端形态：hover
 * 右上角浮出工具条，目前只提供「复制」（真实 clipboard 功能；引用/重生成
 * 等需要后端语义支持，不编造）。
 */
function AgentTextBlock({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板权限被拒等 — 静默，不弹错（非核心路径）
    }
  }
  return (
    <div className="neo-agent-text">
      <div className="neo-agent-toolbar">
        <button
          type="button"
          className="neo-agent-tool"
          onClick={() => { void handleCopy(); }}
          aria-label={t('neo.reply.copy', { defaultValue: '复制' })}
          title={t('neo.reply.copy', { defaultValue: '复制' })}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 时间工具 —— toolCalls.startedAt 是 epoch ms，thinkingStream.ts 是
// "HH:MM:SS"，LoopStep.started_at 是 ISO。统一折算成「当天秒数」做归并排序
// （同一 run 内跨午夜的误差可忽略，且全部为真实数据，无合成字段）。
// ---------------------------------------------------------------------------

function daySecondsFromHMS(ts: string): number {
  const m = /^(\d{2}):(\d{2}):(\d{2})/.exec(ts);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function daySecondsFromEpoch(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function daySecondsFromIso(iso: string | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : daySecondsFromEpoch(t);
}

/** clawsgo 耗时格式：1.7s / 33s / 1m05s。 */
function fmtMs(ms: number): string {
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------------------
// 操作行归并 —— 工具调用 / 深度思考块 / Loop 节点统一成按时间排序的行列表。
// 深度思考分块规则：step 字段变化或相邻条目时间差 ≥3s 视为新一轮思考
// （thinking-chunk 同一轮 reasoning 的分片都在 1-2s 内连续到达）。
// ---------------------------------------------------------------------------

type ThinkEntry = { ts: string; step: string | null; text: string };

type OpRow =
  | { kind: 'tool'; key: string; sort: number; call: RunSessionToolCall }
  | { kind: 'think'; key: string; sort: number; entries: ThinkEntry[] }
  | { kind: 'loop'; key: string; sort: number; loopStep: LoopStep };

function buildOpRows(
  toolCalls: RunSessionToolCall[],
  thinkingStream: ThinkEntry[],
  loops: LoopStep[],
): OpRow[] {
  const rows: OpRow[] = [];

  let thinkBlock: ThinkEntry[] = [];
  let thinkBlockSort = 0;
  let prevThinkSec = -1;
  let prevThinkStep: string | null = null;
  let thinkIdx = 0;
  const flushThink = () => {
    if (thinkBlock.length === 0) return;
    rows.push({ kind: 'think', key: `think_${thinkIdx++}`, sort: thinkBlockSort, entries: thinkBlock });
    thinkBlock = [];
  };
  for (const entry of thinkingStream) {
    const sec = daySecondsFromHMS(entry.ts);
    const newBlock =
      thinkBlock.length > 0 &&
      (entry.step !== prevThinkStep ||
        (sec !== Number.MAX_SAFE_INTEGER && prevThinkSec >= 0 && sec - prevThinkSec >= 3));
    if (newBlock) flushThink();
    if (thinkBlock.length === 0) thinkBlockSort = sec;
    thinkBlock.push(entry);
    prevThinkSec = sec;
    prevThinkStep = entry.step;
  }
  flushThink();

  for (const call of toolCalls) {
    rows.push({ kind: 'tool', key: `tool_${call.id}`, sort: daySecondsFromEpoch(call.startedAt), call });
  }
  for (const loopStep of loops) {
    rows.push({
      kind: 'loop',
      key: `loop_${loopStep.loop.loop_id}`,
      sort: daySecondsFromIso(loopStep.started_at),
      loopStep,
    });
  }

  // Array.prototype.sort 稳定 —— 同秒时保持 思考 → 工具 → loop 的插入序。
  rows.sort((a, b) => a.sort - b.sort);
  return rows;
}

export function NeoRunInline({ runId, session, targetName }: NeoRunInlineProps) {
  const { t } = useI18n();

  // ---- loop 数据（REST 轮询补充 SSE；失败 → 空列表，不 mock）----
  const [loops, setLoops] = useState<LoopStep[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await getRunLoops(runId);
        if (alive) setLoops(r.loops ?? []);
      } catch {
        // 后端无 loop 数据 / 端点未就绪 → 空列表（干净排版，不编造）
        if (alive) setLoops([]);
      }
    }
    void load();
    if (!session.isStreaming) return;
    const iv = setInterval(() => { void load(); }, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [runId, session.isStreaming, session.isComplete]);

  // ---- 操作列表展开/折叠（底部 pill 与「执行了 N 个操作」共用此开关）----
  const [opsOpen, setOpsOpen] = useState(true);
  // 行级展开：深度思考默认展开（clawsgo c1_07），工具/loop 行默认收起。
  const [rowToggled, setRowToggled] = useState<Record<string, boolean>>({});
  const toggleRow = (key: string) => setRowToggled((prev) => ({ ...prev, [key]: !prev[key] }));

  // ---- 累计耗时（agent 头右侧，运行中每秒跳动）----
  const mountMsRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!session.isStreaming) return;
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session.isStreaming]);
  const startMs = useMemo(() => {
    const times = session.toolCalls.map((c) => c.startedAt);
    return times.length > 0 ? Math.min(...times, mountMsRef.current) : mountMsRef.current;
  }, [session.toolCalls]);

  // ---- 消息流（SSE 唯一数据源；user_turn / assistant_text 由后端帧驱动）----
  const userTurns = useMemo(
    () =>
      session.messages.filter(
        (m): m is Extract<TimelineMessage, { kind: 'user_turn' }> => m.kind === 'user_turn',
      ),
    [session.messages],
  );
  const assistantTexts = useMemo(
    () =>
      session.messages.filter(
        (m): m is Extract<TimelineMessage, { kind: 'assistant_text' }> => m.kind === 'assistant_text',
      ),
    [session.messages],
  );

  const opRows = useMemo(
    () => buildOpRows(session.toolCalls, session.thinkingStream, loops),
    [session.toolCalls, session.thinkingStream, loops],
  );

  const hasActivity =
    opRows.length > 0 ||
    session.steps.length > 0 ||
    assistantTexts.length > 0 ||
    session.chatReply.trim().length > 0 ||
    session.isStreaming;

  // ---- 状态 pill 文案 ----
  const doneSteps = session.steps.filter((s) => s.status === 'done').length;
  const doneTools = session.toolCalls.filter((c) => c.status !== 'running').length;
  const progress =
    session.steps.length > 0
      ? `${doneSteps}/${session.steps.length}`
      : session.toolCalls.length > 0
        ? `${doneTools}/${session.toolCalls.length}`
        : '';
  const runningLabel =
    session.steps.find((s) => s.status === 'running')?.name ??
    session.toolCalls.find((c) => c.status === 'running')?.title ??
    session.thinkingMessage ??
    t('neo.run.working', { defaultValue: '正在执行' });

  const loopStatusText = (status: LoopStatus): string => {
    switch (status) {
      case 'running': return t('neo.loop.running', { defaultValue: '运行中' });
      case 'converged': return t('neo.loop.converged', { defaultValue: '已收敛' });
      case 'oscillating': return t('neo.loop.oscillating', { defaultValue: '震荡中' });
      case 'diverged': return t('neo.loop.diverged', { defaultValue: '已发散' });
      case 'halted': return t('neo.loop.halted', { defaultValue: '已停止' });
    }
  };

  const showPill = !session.error && hasActivity && (session.isStreaming || session.isComplete);

  return (
    <div className="neo-run">
      {/* 用户消息（灰气泡右对齐） */}
      {userTurns.map((m) => (
        <div key={m.id} className="neo-msg-user">{m.text}</div>
      ))}

      {hasActivity && (
        <>
          {/* agent 头：✳ 名称 + 累计耗时 */}
          <div className="neo-agent-head">
            <Sparkles size={13} className="neo-agent-star" aria-hidden />
            <span className="neo-agent-name">{targetName ?? t('neo.run.agentFallback', { defaultValue: 'Agent' })}</span>
            <span className="neo-agent-elapsed">{fmtMs(Math.max(0, nowMs - startMs))}</span>
          </div>

          {/* 「执行了 N 个操作」可折叠列表 */}
          {opRows.length > 0 && (
            <div className="neo-ops">
              <button
                type="button"
                className="neo-ops-toggle"
                onClick={() => setOpsOpen((v) => !v)}
                aria-expanded={opsOpen}
              >
                {t('neo.ops.count', { defaultValue: '执行了 {{count}} 个操作', count: opRows.length })}
                <ChevronDown size={13} className="neo-chevron" data-open={opsOpen || undefined} aria-hidden />
              </button>

              {opsOpen && (
                <div className="neo-ops-list">
                  {opRows.map((row) => {
                    const open = rowToggled[row.key] ?? row.kind === 'think';

                    if (row.kind === 'think') {
                      return (
                        <div key={row.key} className="neo-op">
                          <button type="button" className="neo-op-row" onClick={() => toggleRow(row.key)} aria-expanded={open}>
                            <Sparkles size={13} className="neo-op-icon" data-status="think" aria-hidden />
                            <span className="neo-op-title">{t('neo.think.title', { defaultValue: '深度思考' })}</span>
                            <ChevronRight size={12} className="neo-chevron" data-open={open || undefined} aria-hidden />
                          </button>
                          {open && (
                            <div className="neo-op-detail neo-think-body">
                              {row.entries.map((e, i) => (
                                <p key={`${e.ts}_${i}`}>{e.text}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (row.kind === 'loop') {
                      const { loop } = row.loopStep;
                      const total =
                        loop.kind === 'fixed_count' && loop.setpoint?.value
                          ? `/${loop.setpoint.value}`
                          : '';
                      return (
                        <div key={row.key} className="neo-op">
                          <div className="neo-op-row neo-op-row-static">
                            <Repeat size={13} className="neo-op-icon" data-status={loop.status === 'converged' ? 'done' : loop.status === 'running' ? 'running' : 'failed'} aria-hidden />
                            <span className="neo-op-title">
                              {t('neo.loop.title', { defaultValue: '循环 {{id}}', id: loop.loop_id })}
                            </span>
                            <span className="neo-loop-badge" data-status={loop.status}>
                              {t('neo.loop.iteration', {
                                defaultValue: `第 ${loop.iteration_count}${total} 轮`,
                                count: loop.iteration_count,
                                total,
                              })}
                              {' · '}
                              {loopStatusText(loop.status)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // 工具调用行：状态图标 + 名称 + 耗时 + chevron；展开 = 参数/结果摘要/链接
                    const { call } = row;
                    const hasDetail =
                      !!call.resultSummary || !!call.inputSummary || (call.links?.length ?? 0) > 0;
                    return (
                      <div key={row.key} className="neo-op">
                        <button
                          type="button"
                          className="neo-op-row"
                          onClick={() => hasDetail && toggleRow(row.key)}
                          aria-expanded={hasDetail ? open : undefined}
                          disabled={!hasDetail}
                        >
                          <span className="neo-op-icon" data-status={call.status} aria-hidden>
                            {call.status === 'running' ? (
                              <Loader2 size={13} className="neo-spin" />
                            ) : call.status === 'done' ? (
                              <Check size={13} />
                            ) : (
                              <XCircle size={13} />
                            )}
                          </span>
                          <span className="neo-op-title">{call.title}</span>
                          {call.elapsedMs != null && (
                            <span className="neo-op-elapsed">{fmtMs(call.elapsedMs)}</span>
                          )}
                          {hasDetail && (
                            <ChevronRight size={12} className="neo-chevron" data-open={open || undefined} aria-hidden />
                          )}
                        </button>
                        {hasDetail && open && (
                          <div className="neo-op-detail">
                            {call.inputSummary && (
                              <div className="neo-op-kv">
                                <span className="neo-op-k">{t('neo.op.params', { defaultValue: '参数' })}</span>
                                <p>{call.inputSummary}</p>
                              </div>
                            )}
                            {call.resultSummary && (
                              <div className="neo-op-kv">
                                <span className="neo-op-k">{t('neo.op.result', { defaultValue: '结果' })}</span>
                                <p>{call.resultSummary}</p>
                              </div>
                            )}
                            {call.links && call.links.length > 0 && (
                              <div className="neo-op-links">
                                {call.links.map((l) => (
                                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* agent 回复（左对齐无气泡，干净排版 + hover 复制工具条，Coze 形态）。
              assistant_text 消息优先；后端只发了 chatReply（琐碎目标直接自然
              语言回复）时回退渲染。 */}
          {assistantTexts.map((m) => (
            <AgentTextBlock key={m.id} text={m.body} />
          ))}
          {assistantTexts.length === 0 && session.chatReply.trim().length > 0 && (
            <AgentTextBlock text={session.chatReply} />
          )}
        </>
      )}

      {/* 错误条（替代状态 pill，含重试次数后缀由 reducer 维护 occurrences） */}
      {session.error && (
        <div className="neo-run-error" role="alert">
          {session.error.message}
          {session.error.hint ? <span className="neo-run-error-hint"> · {session.error.hint}</span> : null}
        </div>
      )}

      {/* 底部状态 pill：运行中 = 当前步骤 + x/y；完成 = ✓ 已完成全部任务。
          点击折叠/展开操作列表（clawsgo 底部 pill 行为）。 */}
      {showPill && (
        <button
          type="button"
          className={session.isComplete ? 'neo-pill neo-pill-done' : 'neo-pill'}
          onClick={() => setOpsOpen((v) => !v)}
          aria-expanded={opsOpen}
        >
          {session.isComplete ? (
            <Check size={13} className="neo-pill-icon" aria-hidden />
          ) : (
            <span className="neo-pill-dot" aria-hidden />
          )}
          <span className="neo-pill-label">
            {session.isComplete
              ? t('neo.pill.done', { defaultValue: '已完成全部任务' })
              : runningLabel}
          </span>
          {progress && <span className="neo-pill-count">{progress}</span>}
          <ChevronDown size={13} className="neo-chevron" data-open={opsOpen || undefined} aria-hidden />
        </button>
      )}
    </div>
  );
}

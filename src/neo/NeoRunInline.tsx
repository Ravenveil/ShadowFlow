/**
 * NeoRunInline — clawsgo 式 inline 任务执行视图（Neo 中栏核心）。
 *
 * 2026-08-15 重构（Polynoia 对标）+ 阶段 2.5 视觉返工：消息流主体由
 * NeoTimeline 渲染（./NeoTimeline，Neo 原生渲染层，视觉对齐
 * .tmp/clawsgo-clone/running.html，滚动交给外层 neo-chat-scroll）。
 * 由此 Neo 聊天直接获得全部内联渲染类型——用户气泡 / thinking / 工具行 /
 * 步骤面板 / YAML diff / plan_card（编排计划）/ commit_record（提交记录）/
 * file_diff（文件 diff）/ table_panel（表格）/ image_panel / web_preview
 * （网页预览）/ artifact_card / verdict_card（评审结论）/ msg_foot——以及
 * assistant_text 的行内编辑（PATCH 会话消息）。
 *
 * 本组件保留的 Neo 特有件：
 *   1. agent 头（✳ 名称 + 累计耗时，首条消息 ts 起算）
 *   2. Loop 徽标行（loops 数据源优先级：SSE loop 帧 → loops/stream SSE →
 *      5s REST 轮询回落；2026-08-22 L6 证据层打包）
 *   3. 错误条 + 底部状态 pill（进度 x/y，点击无操作——Timeline 自带交互）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Play, Repeat, Sparkles } from 'lucide-react';
import type { UseRunSessionReturn } from '../core/hooks/useRunSession';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { NeoTimeline } from './NeoTimeline';
import { NeoMsgFeedback } from './NeoMsgFeedback';
import { getRunLoops, streamRunLoops, type LoopRecord, type LoopStatus } from '../api/runs';
import { retryStep, resumeRunSession } from '../api/runSessions';
import { useI18n } from '../common/i18n';
import './neo-chat.css';
import './neo-run.css';

export interface NeoRunInlineProps {
  /** 当前 run 的 session id（同时作为 /api/runs/{id}/loops 的 run id）。 */
  runId: string;
  session: UseRunSessionReturn;
  /** 左栏当前选中对象名（agent/team），用于 agent 头展示。 */
  targetName: string | null;
}

/** clawsgo 耗时格式：1.7s / 33s / 1m05s。 */
function fmtMs(ms: number): string {
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

export function NeoRunInline({ runId, session, targetName }: NeoRunInlineProps) {
  const { t } = useI18n();

  // ---- loop 数据（数据源优先级：SSE loop 帧 → loops/stream SSE → 5s REST
  //      轮询回落；全部失败 → 空列表，不 mock）----
  const [loops, setLoops] = useState<LoopRecord[]>([]);
  useEffect(() => {
    // 1) 网关 loop-watcher 的 SSE `loop` 帧（useRunSession 已订阅，全量快照）
    if (session.loops && session.loops.length > 0) {
      const byId = new Map<string, LoopRecord>();
      for (const raw of session.loops) {
        const loop = raw as unknown as LoopRecord;
        if (loop?.loop_id) byId.set(loop.loop_id, loop);
      }
      setLoops([...byId.values()]);
      return;
    }
    let alive = true;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const r = await getRunLoops(runId);
        if (alive) setLoops((r.loops ?? []).map((s) => s.loop));
      } catch {
        // 后端无 loop 数据 / 端点未就绪 → 空列表（干净排版，不编造）
        if (alive) setLoops([]);
      }
    }
    void load();
    if (!session.isStreaming) return () => { alive = false; };
    // 2) loops 专属 SSE；3) 端点不可用时回落 5s 轮询
    const stream = streamRunLoops(
      runId,
      (steps) => {
        if (alive) setLoops(steps.map((s) => s.loop));
      },
      () => {
        if (alive && !pollIv) pollIv = setInterval(() => { void load(); }, 5000);
      },
    );
    return () => {
      alive = false;
      stream.close();
      if (pollIv) clearInterval(pollIv);
    };
  }, [runId, session.loops, session.isStreaming, session.isComplete]);

  // ---- 操作列表折叠开关（底部 pill 控制 loops 区展开）----
  const [loopsOpen, setLoopsOpen] = useState(true);

  // ---- 累计耗时（agent 头右侧，运行中每秒跳动；起点 = 首条消息 ts）----
  const mountMsRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!session.isStreaming) return;
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session.isStreaming]);
  const startMs = useMemo(() => {
    if (session.messages.length > 0) {
      return session.messages.reduce((min, m) => (m.ts < min ? m.ts : min), session.messages[0]!.ts);
    }
    return mountMsRef.current;
  }, [session.messages]);

  const hasActivity =
    session.messages.length > 0 ||
    session.toolCalls.length > 0 ||
    session.chatReply.trim().length > 0 ||
    session.isStreaming;

  // ---- 行内编辑：PATCH 持久化会话行 + 本地重写（useRunSession.editMessage）----
  const handleEditMessage = useCallback(
    (msg: Extract<TimelineMessage, { kind: 'assistant_text' }>, nextBody: string) => {
      void session.editMessage(msg.id, nextBody);
    },
    [session.editMessage],
  );

  // ---- L1（2026-08-22）— 单聊消息底部 👍/👎 反馈行（仅 agent 回复）----
  // 独立小组件 NeoMsgFeedback，经 NeoTimeline 可选挂载点插入，不动消息主组件。
  const renderMsgActions = useCallback(
    (msg: TimelineMessage) =>
      msg.kind === 'assistant_text' ? <NeoMsgFeedback messageId={msg.id} /> : null,
    [],
  );

  // ---- 单步重跑（2026-08-23 救场）：step_panel 已完成步骤行尾「重跑」按钮
  //      → 网关 POST /api/run-sessions/:id/steps/:n/retry（full_rerun 语义）。
  //      false = 端点缺失，按钮行内红字提示（NeoStepRetry 处理）。
  //      202 接受后主动 restartStream()：重跑多发生在 run 终态（SSE 已随
  //      complete 关闭，retry-pending 帧无人接收），必须重挂才能让「过程」
  //      tab / 时间线自动续跑；流仍开着时则由 retry-pending 帧路径负责。----
  const handleRetryStep = useCallback(
    (stepIndex: number) =>
      retryStep(runId, stepIndex).then((ok) => {
        if (ok) session.restartStream();
        return ok;
      }),
    [runId, session.restartStream],
  );

  // ---- 整 run 续跑（S4.2 resume 前端入口）：aborted（用户停止）/ failed
  //      （SSE error 帧）终态时露出「继续」按钮。语义同单步重跑（full_rerun）：
  //      202 接受后主动 restartStream()——resume 多发生在 run 终态（SSE 已随
  //      complete/abort 关闭，resume-pending 帧无人接收），必须重挂才能让
  //      时间线自动续跑。false/410（全部已完成）→ 行内红字提示。----
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeFailed, setResumeFailed] = useState(false);
  const handleResume = useCallback(() => {
    if (resumeBusy) return;
    setResumeBusy(true);
    setResumeFailed(false);
    resumeRunSession(runId).then(
      (ok) => {
        setResumeBusy(false);
        if (ok) session.restartStream();
        else setResumeFailed(true);
      },
      () => {
        setResumeBusy(false);
        setResumeFailed(true);
      },
    );
  }, [runId, resumeBusy, session.restartStream]);

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

  // 状态 pill：仅运行中显示（spinner + 当前步骤 + x/y）。完成态的绿色
  // 「已完成全部任务」条已删（2026-10-31 用户反馈：多余，交付卡已表达完成）。
  const showPill = !session.error && hasActivity && session.isStreaming;
  // 整 run 续跑按钮可见性：仅 aborted（用户停止）/ failed（SSE error 帧）
  // 终态；成功完成（isComplete && !aborted && !error）与运行中不显示。
  const canResume = !session.isStreaming && hasActivity && (session.aborted || session.error != null);

  return (
    <div className="neo-run">
      {/* agent 头：✳ 名称 + 累计耗时 */}
      {hasActivity && (
        <div className="neo-agent-head">
          <Sparkles size={13} className="neo-agent-star" aria-hidden />
          <span className="neo-agent-name">{targetName ?? t('neo.run.agentFallback', { defaultValue: 'Agent' })}</span>
          <span className="neo-agent-elapsed">{fmtMs(Math.max(0, nowMs - startMs))}</span>
        </div>
      )}

      {/* Loop 徽标行（SSE 优先 + REST 回落，Timeline 不覆盖的补充维度） */}
      {loops.length > 0 && (
        <div className="neo-ops">
          <button
            type="button"
            className="neo-ops-toggle"
            onClick={() => setLoopsOpen((v) => !v)}
            aria-expanded={loopsOpen}
          >
            {t('neo.ops.loopCount', { defaultValue: '{{count}} 个循环', count: loops.length })}
            <ChevronDown size={13} className="neo-chevron" data-open={loopsOpen || undefined} aria-hidden />
          </button>
          {loopsOpen && (
            <div className="neo-ops-list">
              {loops.map((loop) => {
                const total =
                  loop.kind === 'fixed_count' && loop.setpoint?.value
                    ? `/${loop.setpoint.value}`
                    : '';
                return (
                  <div key={loop.loop_id} className="neo-op">
                    <div
                      className="neo-op-row neo-op-row-static"
                      data-status={loop.status === 'running' ? 'running' : undefined}
                    >
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
              })}
            </div>
          )}
        </div>
      )}

      {/* 消息流主体：NeoTimeline（SSE 唯一数据源，纯 Neo 渲染层）。
          滚动交给外层 neo-chat-scroll；全部富内联卡片
          （plan/commit/diff/table/preview/verdict）在此渲染；
          assistant_text 行内编辑经 handleEditMessage 落库。 */}
      <NeoTimeline
        messages={session.messages}
        onEditMessage={handleEditMessage}
        renderMsgActions={renderMsgActions}
        onRetryStep={handleRetryStep}
      />

      {/* 错误条（替代状态 pill，含重试次数后缀由 reducer 维护 occurrences） */}
      {session.error && (
        <div className="neo-run-error" role="alert">
          {session.error.message}
          {session.error.hint ? <span className="neo-run-error-hint"> · {session.error.hint}</span> : null}
        </div>
      )}

      {/* 整 run 续跑入口：aborted/failed 终态出现；复用单步重跑的 ghost
          小按钮样式（neo-tl-step-retry）。点击 → POST /:id/resume，
          202 后 restartStream() 重挂 SSE 自动续跑。 */}
      {canResume && (
        <div className="neo-run-resume">
          <button
            type="button"
            className="neo-tl-step-retry"
            disabled={resumeBusy}
            onClick={handleResume}
            title={t('neo.run.resumeTip', { defaultValue: '从中断处继续运行' })}
            data-testid="neo-run-resume"
          >
            {resumeBusy ? (
              <Loader2 size={11} strokeWidth={2.2} className="neo-tl-spin" aria-hidden />
            ) : (
              <Play size={11} strokeWidth={2} aria-hidden />
            )}
            {resumeBusy
              ? t('neo.run.resuming', { defaultValue: '续跑中…' })
              : t('neo.run.resume', { defaultValue: '继续' })}
          </button>
          {resumeFailed && (
            <span className="neo-tl-step-retry-fail" role="alert">
              {t('neo.run.resumeFailed', { defaultValue: '续跑失败' })}
            </span>
          )}
        </div>
      )}

      {/* 状态 pill：仅运行中（spinner + 当前步骤 + x/y progress）。
          完成态不渲染（完成由交付卡/消息流表达）；点击折叠/展开 Loop 徽标行。 */}
      {showPill && (
        <button
          type="button"
          className="neo-pill"
          onClick={() => setLoopsOpen((v) => !v)}
          aria-expanded={loopsOpen}
        >
          <span className="neo-pill-spinner" aria-hidden />
          <span className="neo-pill-label">{runningLabel}</span>
          {progress && <span className="neo-pill-count">{progress}</span>}
          <ChevronDown size={13} className="neo-chevron" data-open={loopsOpen || undefined} aria-hidden />
        </button>
      )}
    </div>
  );
}

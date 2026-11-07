/**
 * NeoChat — Neo 中栏：聊天 + inline 任务执行（clawsgo 中栏形态）。
 *
 * 布局：
 *   顶部条  「当前选中：{target.name}」 + 群聊现场入口
 *           （「新任务」按钮已删 2026-08-19 用户要求——左栏导航与 Ctrl+K
 *            已有同款入口；纯空态整条隐藏）
 *   消息流  run 活跃 → NeoRunInline（用户灰气泡 / 操作列表 / agent 回复 /
 *           状态 pill）；无 run → 聊天化空态（首页 hero 已下线 2026-11-07
 *           用户反馈「这个首页不要再显示了」：无问候/版本 pill/模板卡，
 *           一行轻提示 + composer 钉底）
 *   底部    NeoComposer（run 活跃时沉底）
 *
 * 数据通路完全复用 chat-home 现有实现（不另造数据流）：
 *   首条消息 → createGroup(尽力而为) + createRunSession（同 NewTaskComposer），
 *   多轮接力 → POST /api/run-sessions/:id/messages（daemon 返回新 session_id
 *   就地切换），SSE 由 useRunSession 消费（唯一 SSE 数据源）。
 * runId 由 NeoApp 持有（受控）：本组件经 onRunChange 上报启动/清除。
 * 错误/中断态：SSE error 帧（6 桶）与 watchdog 超时 → 会话内错误卡
 * （重试=重发最后一条用户消息走 /messages，中止=abort）；用户停止后
 * timeline 末尾渲染「已中断」标记（session.aborted，useRunSession 维护）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, OctagonX, RotateCcw, UsersRound } from 'lucide-react';
import type { NeoChatProps } from './types';
import { useRunSession, type ErrorCode } from '../core/hooks/useRunSession';
import { createRunSession, listRunSessions } from '../api/runSessions';
import { getAgent } from '../api/agents';
import { createGroup } from '../api/groupApi';
import { getApiBase, authHeaders } from '../api/_base';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
import { NeoRunInline } from './NeoRunInline';
import { NeoTeamSavedCard } from './NeoTeamSavedCard';
import { KnowledgeCitations } from '../components/knowledge/KnowledgeCitations';
import './neo-chat.css';

/** SSE error 帧 6 桶分类（server classify-error）→ 错误卡标题。i18n key + 中文兜底。 */
function errorTitleByCode(code: ErrorCode): { key: string; fallback: string } {
  switch (code) {
    case 'auth': return { key: 'neo.error.auth', fallback: 'API Key 未配置或已失效' };
    case 'rate_limit': return { key: 'neo.error.rateLimit', fallback: '请求频率超限，请稍后重试' };
    case 'context_too_long': return { key: 'neo.error.contextTooLong', fallback: '上下文过长，请缩减输入' };
    case 'network': return { key: 'neo.error.network', fallback: '连接中断或会话超时' };
    case 'server': return { key: 'neo.error.server', fallback: '服务端错误' };
    default: return { key: 'neo.error.unknown', fallback: '执行出错' };
  }
}

export function NeoChat({ target, runId, onRunChange, onNavigate }: NeoChatProps) {
  const { t } = useI18n();
  const workspaceId = useWorkspaceStore((s) => s.currentId);

  // ── ClawHub（2026-06，FR-03/04）：当前 Claw 聊天 target ──────────────────
  // 选中已安装 Claw（ClawHub 「对话」桥）后：提交时注入
  // executor:'cli:<id>'（Claw 完全接管对话；多轮接力 POST /:id/messages 继承
  // source session.executor，见架构文档 D6）。
  const [clawTarget, setClawTarget] = useState<{ cliId: string; name: string } | null>(null);
  // ClawHub 页「对话」按钮经 localStorage 桥（sf.claw-target）跳转过来 —— 装载时消费。
  useEffect(() => {
    try {
      const raw = localStorage.getItem('sf.claw-target');
      if (!raw) return;
      localStorage.removeItem('sf.claw-target');
      const parsed = JSON.parse(raw) as { cliId: string; name?: string; at?: number };
      // 桥接 5 分钟内有效（防陈旧值复活）
      if (parsed?.cliId && (!parsed.at || Date.now() - parsed.at < 5 * 60_000)) {
        setClawTarget({ cliId: parsed.cliId, name: parsed.name ?? parsed.cliId });
      }
    } catch {
      /* ignore malformed bridge value */
    }
  }, []);
  // 切走 run → 清 Claw target（run 已在跑，target 态失效）
  useEffect(() => {
    if (runId) setClawTarget(null);
  }, [runId]);

  // ── ClawHub（2026-06，D6）：绑定了 claw_id 的 Agent → Claw 完全接管 ──────
  // target 为 agent 时读它的 AgentRecord.claw_id（getAgent）；未绑定 → null。
  const [agentClawId, setAgentClawId] = useState<string | null>(null);
  useEffect(() => {
    if (target?.kind !== 'agent') {
      setAgentClawId(null);
      return;
    }
    let alive = true;
    getAgent(target.id)
      .then((a) => {
        if (!alive) return;
        setAgentClawId(typeof a.claw_id === 'string' && a.claw_id ? a.claw_id : null);
      })
      .catch(() => {
        if (alive) setAgentClawId(null);
      });
    return () => {
      alive = false;
    };
  }, [target?.kind, target?.id]);

  // SSE 唯一数据源。runId 为 null 时传 ''——hook 内部对空 id 直接跳过订阅，
  // 保持 hooks 调用顺序稳定。
  const session = useRunSession(runId ?? '');

  // ── 群聊现场跳转（Polynoia 对标 2026-08-15）─────────────────────────────
  // 首条消息 best-effort 建的群经 B1 互链挂在 run 的 conversation 上；经
  // listRunSessions 反查当前 session 的 group_id，顶栏出「群聊现场」入口。
  const [linkedGroupId, setLinkedGroupId] = useState<string | null>(null);
  const createdGroupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runId) {
      setLinkedGroupId(null);
      createdGroupRef.current = null;
      return;
    }
    // 本组件刚建的群立即点亮（不等反查）。
    if (createdGroupRef.current) setLinkedGroupId(createdGroupRef.current);
    let alive = true;
    listRunSessions()
      .then((rows) => {
        if (!alive) return;
        const hit = rows.find((r) => r.session_id === runId);
        if (hit?.group_id) setLinkedGroupId(hit.group_id);
      })
      .catch(() => {
        /* Python 未起等 — 静默，无跳转入口即可 */
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  // 消息流自动滚动到底（新消息 / 新工具调用 / 新思考 / 新文本时）。
  // A28：仅当用户停留在底部时才跟随滚底；用户上翻阅读时不打断，
  // 上滚超过 ~400px 由底部中央浮钮（.neo-jump-bottom）承接回底。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 80;
    setShowJump(dist > 400);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ── 知识库引用（L5/L1）─────────────────────────────────────────────────
  // 发送带知识库的消息后，对选中的 pack 走 /knowledge/packs/{id}/query，
  // 引用卡渲染在消息流底部（NeoRunInline 之下）。未选中 pack 时不展示。
  const [citations, setCitations] = useState<{ packIds: string[]; query: string } | null>(null);

  // 切换 run → 重置贴底标记（新会话总是从底部开始跟随），浮钮收起。
  useEffect(() => {
    atBottomRef.current = true;
    setShowJump(false);
    setCitations(null);
  }, [runId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [
    runId,
    session.messages,
    session.toolCalls,
    session.thinkingStream,
    session.chatReply,
    session.steps,
    session.error,
    session.aborted,
    session.teamSaved,
  ]);

  // 模板画廊已随首页 hero 下线（2026-11-07）：prefill 通路一并移除。

  /**
   * 提交链路（与 NewTaskComposer.handleSubmit 同一通路）：
   *   无活跃 run → 建群(尽力,失败降级匿名) + createRunSession → onRunChange
   *   有活跃 run → POST /:id/messages 多轮接力，daemon 返回新 session_id 就切
   * 抛错 → UnifiedComposer 卡片内错误条展示。
   */
  async function handleSubmit(p: UnifiedComposerSubmitPayload) {
    const text = p.text.trim();
    if (!text) return;
    try {
      if (!runId) {
        let groupId: string | undefined;
        try {
          const g = await createGroup({
            templateId: 'new-task',
            groupTemplateId: '',
            // ClawHub（2026-10-30）：Claw 直聊会话命名带爪印前缀，左栏一眼
            // 识别是哪个 Claw（替代"消息前 20 字符"的默认命名）。
            name: clawTarget
              ? `🐾 ${clawTarget.name || clawTarget.cliId}`
              : text.slice(0, 20),
            agentIds: [],
            memberEmails: [],
            policyMatrix: {},
            workspaceId: workspaceId ?? undefined,
          });
          groupId = g.groupId;
          createdGroupRef.current = g.groupId;
          setLinkedGroupId(g.groupId);
          // 左栏会话列表实时刷新（Python 未起时静默降级）
          void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
        } catch {
          // Python 后端未启等 — 静默降级为匿名 run 会话，聊天体验优先
        }
        // CLI 工作目录 chip 写 localStorage('sf.cwd')，localStorage-at-
        // request-time 惯例；空/缺失 → undefined（服务端回落默认工作目录）。
        const cwd = localStorage.getItem('sf.cwd')?.trim() || undefined;
        // ── ClawHub（2026-06，D6）：executor 注入点（唯一）──────────────────
        // 优先级：Claw target（直接选 Claw 对话）> 绑定 claw_id 的 Agent
        // （Claw 完全接管）。两者皆无 → 不传（createRunSession 照旧从
        // sf.defaultExecutor 合并，原行为零变化）。
        // run-sessions 原生支持 executor:'cli:<id>'（Story 15.19 v2 链路）。
        const executorOverride: string | undefined = clawTarget
          ? `cli:${clawTarget.cliId}`
          : target?.kind === 'agent' && agentClawId
            ? `cli:${agentClawId}`
            : undefined;
        const resp = await createRunSession({
          goal: text,
          skill_name: p.skillName,
          // Claw 接管态：单 agent 直连（不走团队编排）；否则按目标类型回落
          // （团队目标不传，由服务端决定；单 agent 目标固定 single）。
          mode:
            executorOverride
              ? 'single'
              : target?.kind === 'team'
                ? undefined
                : 'single',
          executor: executorOverride,
          group_id: groupId,
          cwd,
          // 对话框知识库（2026-11-06）— 记忆库 pack id 随会话落库，run 组装
          // 提示词时按 goal 检索命中注入「知识库参考」块。
          knowledge_pack_ids: p.knowledgePackIds.length > 0 ? p.knowledgePackIds : undefined,
        });
        window.dispatchEvent(new CustomEvent('sf:run-created'));
        onRunChange(resp.session_id);
      } else {
        // 多轮接力：cwd 作为 override 一并带上（服务端仅接受绝对路径，
        // 空/缺失 → 继承 source session 的值）。
        const cwd = localStorage.getItem('sf.cwd')?.trim() || undefined;
        const resp = await fetch(`${getApiBase()}/api/run-sessions/${runId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            content: text,
            cwd,
            // 对话框知识库（2026-11-06）— 每轮显式给出（空数组 = 本轮取消挂载）。
            knowledge_pack_ids: p.knowledgePackIds,
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as { session_id?: string };
        if (data.session_id && data.session_id !== runId) {
          onRunChange(data.session_id);
          window.dispatchEvent(new CustomEvent('sf:run-created'));
        }
        // 多轮接力成功 → 清掉上一轮的陈旧错误条（若曾出错）。
        session.clearError();
      }
      // 选中知识库 → 发送成功后对记忆库 pack 走 RAG query，引用卡挂消息流底部。
      if (p.knowledgePackIds.length > 0) {
        setCitations({ packIds: p.knowledgePackIds, query: text });
      }
    } catch (err) {
      throw new Error(
        t('neo.chat.sendFailed', {
          defaultValue: `发送失败：${err instanceof Error ? err.message : String(err)}。请确认后端 server 在运行（:8002），或在「设置 → BYOK」配置 API Key。`,
        }),
      );
    }
  }

  // ── 错误卡（SSE 命名 error 帧 6 桶 / watchdog 15min 超时承接 UI）──────────
  // NeoRunInline 内的 .neo-run-error 条只展示文本；本卡补分类标题 + 操作：
  //   重试 = 重发最后一条用户消息，走真实 POST /:id/messages（不假按钮）；
  //   中止 = session.abort()（POST /:id/abort，best-effort）。
  const lastUserText = useMemo(() => {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m && m.kind === 'user_turn') return m.text;
    }
    return null;
  }, [session.messages]);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryFailed, setRetryFailed] = useState<string | null>(null);

  async function handleRetry() {
    if (!lastUserText || retryBusy) return;
    setRetryBusy(true);
    setRetryFailed(null);
    try {
      await handleSubmit({ text: lastUserText, knowledgePackIds: [], attachments: [] });
      // 重发成功（可能就地换了新 session_id，NeoApp 会同步 URL/存储）。
      session.clearError();
    } catch (err) {
      // 重发失败（如会话已过期 404）——保留原错误条，卡内补失败原因。
      setRetryFailed(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryBusy(false);
    }
  }

  const errorTitle = session.error ? errorTitleByCode(session.error.code) : null;

  return (
    <div className="neo-chat">
      {/* 顶部条：页面标题 + 群聊现场入口（←/→/折叠 导航簇已移至左栏顶部；
          「新任务」按钮已删，新任务走左栏导航 / Ctrl+K）。纯空态
          （无 run 无 target）不渲染。 */}
      {(runId || target || clawTarget) && (
        <header className="neo-chat-topbar">
          <span className="neo-chat-topbar-title">
            {clawTarget
              ? `🐾 ${clawTarget.name || clawTarget.cliId}`
              : target?.name ?? t('neo.chat.newTask', { defaultValue: '新任务' })}
          </span>
          {/* 群聊现场（B1 互链反查到 group 时出现）— 中栏内打开（ZCode 式停留同页） */}
          {runId && linkedGroupId && (
            <button
              type="button"
              className="neo-topbar-btn"
              onClick={() => onNavigate({ view: 'conversation', groupId: linkedGroupId })}
              data-testid="neo-chat-group-link"
            >
              <UsersRound size={14} strokeWidth={1.9} aria-hidden />
              {t('neo.chat.viewGroup', { defaultValue: '群聊现场' })}
            </button>
          )}
        </header>
      )}

      {runId ? (
        <>
          {/* 消息流 + inline 任务执行（key=runId：多轮接力换 session 即重挂）。
              scrollwrap 是相对定位容器：回到底部浮钮绝对定位于其内底部中央，
              不随消息流滚动。 */}
          <div className="neo-chat-scrollwrap">
            <div className="neo-chat-scroll" ref={scrollRef} onScroll={handleScroll}>
            <NeoRunInline
              key={runId}
              runId={runId}
              session={session}
              targetName={target?.name ?? null}
            />

            {/* 团队已保存引导卡（SSE team-saved 帧）：组装落库成功后给下一步
                引导；CTA 只做跳转（已互链群）/内联提示，不直接建群。 */}
            {session.teamSaved && (
              <NeoTeamSavedCard
                team={session.teamSaved}
                groupId={linkedGroupId}
                onOpenGroup={(gid) => onNavigate({ view: 'conversation', groupId: gid })}
              />
            )}

            {/* 知识库引用卡：本轮消息选了 pack 时展示检索命中来源列表 */}
            {citations && (
              <KnowledgeCitations packIds={citations.packIds} query={citations.query} />
            )}

            {/* 错误卡：分类标题 + 重试/中止（消息正文由 NeoRunInline 错误条展示） */}
            {session.error && errorTitle && (
              <div className="neo-error-card" data-testid="neo-error-card">
                <div className="neo-error-card-head">
                  <span className="neo-error-card-title">
                    {t(errorTitle.key, { defaultValue: errorTitle.fallback })}
                  </span>
                  {session.error.occurrences > 1 && (
                    <span className="neo-error-card-occ">
                      {t('neo.error.occurrences', {
                        defaultValue: `已连续失败 ${session.error.occurrences} 次`,
                        count: session.error.occurrences,
                      })}
                    </span>
                  )}
                </div>
                <div className="neo-error-card-actions">
                  <button
                    type="button"
                    className="neo-error-btn neo-error-btn-primary"
                    onClick={() => void handleRetry()}
                    disabled={retryBusy || !lastUserText}
                    data-testid="neo-error-retry"
                  >
                    <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
                    {retryBusy
                      ? t('neo.error.retrying', { defaultValue: '重试中…' })
                      : t('neo.error.retry', { defaultValue: '重试' })}
                  </button>
                  <button
                    type="button"
                    className="neo-error-btn"
                    onClick={session.abort}
                    disabled={session.aborted}
                    data-testid="neo-error-abort"
                  >
                    <OctagonX size={13} strokeWidth={1.9} aria-hidden />
                    {t('neo.error.abort', { defaultValue: '中止' })}
                  </button>
                </div>
                {retryFailed && <div className="neo-error-card-retry-failed">{retryFailed}</div>}
              </div>
            )}

            {/* 中断态标记：用户点「停止」后 timeline 末尾的分隔标记；
                composer 因 isStreaming=false 已自动恢复可输入。 */}
            {session.aborted && (
              <div className="neo-run-aborted" data-testid="neo-run-aborted">
                <span className="neo-run-aborted-label">
                  {t('neo.run.aborted', { defaultValue: '已中断' })}
                </span>
              </div>
            )}
            </div>

            {/* A28 回到底部浮钮（ClawsGO a_015）：上滚 >400px 浮现，点击平滑回底，
                接近底部（<80px）由 handleScroll 自动收起。 */}
            {showJump && (
              <button
                type="button"
                className="neo-jump-bottom"
                onClick={scrollToBottom}
                aria-label={t('neo.chat.backToBottom', { defaultValue: '回到底部' })}
                title={t('neo.chat.backToBottom', { defaultValue: '回到底部' })}
                data-testid="neo-jump-bottom"
              >
                <ArrowDown size={14} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
          <div className="neo-chat-composer">
            <NeoComposer
              variant="chat"
              onSubmit={handleSubmit}
              streaming={session.isStreaming}
              onStop={session.abort}
              onNavigate={onNavigate}
              clawTarget={clawTarget}
              onClearClawTarget={() => setClawTarget(null)}
              onPickClaw={(cliId) => setClawTarget({ cliId, name: cliId })}
              placeholder={t('neo.chat.followupPlaceholder', {
                defaultValue: '补充指令，AI 会接着干 · 试试 @ 提及 Skill',
              })}
            />
          </div>
        </>
      ) : (
        /* 空态（首页 hero 已下线 2026-11-07 用户反馈「这个首页不要再显示了」）：
           直接落聊天框——一行轻提示 + composer 钉列底，无问候/版本 pill/轮播/
           模板卡。agent-target 兜底态由 NeoApp 常驻重试自动升级进真会话，
           此态多为后端未起时的过渡。 */
        <>
          <div className="neo-empty">
            <div className="neo-empty-hint">
              {target
                ? t('neo.chat.emptyTarget', { defaultValue: `与 ${target.name} 对话` })
                : t('neo.chat.emptyHint', {
                    defaultValue: '发消息即开始对话 · 试试 @ 提及 Skill 或 / 命令',
                  })}
            </div>
          </div>
          <div className="neo-empty-composer">
            <NeoComposer
              variant="hero"
              onSubmit={handleSubmit}
              onNavigate={onNavigate}
              clawTarget={clawTarget}
              onClearClawTarget={() => setClawTarget(null)}
              onPickClaw={(cliId) => setClawTarget({ cliId, name: cliId })}
              placeholder={
                clawTarget
                  ? t('neo.chat.clawPlaceholder', {
                      defaultValue: `与 ${clawTarget.cliId} 对话中 · 输入内容直接发送`,
                    })
                  : t('neo.chat.heroPlaceholder', {
                      defaultValue: '描述一个目标，直接开干 · 试试 @ 提及 Skill 或 / 命令',
                    })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

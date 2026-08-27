/**
 * NeoChat — Neo 中栏：聊天 + inline 任务执行（clawsgo 中栏形态）。
 *
 * 布局：
 *   顶部条  「当前选中：{target.name}」 + 群聊现场入口
 *           （「新任务」按钮已删 2026-08-19 用户要求——左栏导航与 Ctrl+K
 *            已有同款入口；纯首页空态整条隐藏，hero 即全部内容）
 *   消息流  run 活跃 → NeoRunInline（用户灰气泡 / 操作列表 / agent 回复 /
 *           状态 pill）；无 run → hero 问候 → 分类 tabs + 模板卡网格 →
 *           composer 沉底（clawsgo 首页态 tmp29A7）
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
import { createGroup } from '../api/groupApi';
import { getApiBase, authHeaders } from '../api/_base';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
import { NeoRunInline } from './NeoRunInline';
import { NeoRunSuggestions } from './NeoRunSuggestions';
import { NeoTeamSavedCard } from './NeoTeamSavedCard';
import { KnowledgeCitations } from '../components/knowledge/KnowledgeCitations';
import { StartGallery } from '../pages/chat-home/StartGallery';
import pkg from '../../package.json';
import './neo-chat.css';

/** clawsgo 式时段问候（对齐 StartLanding）。i18n key + 中文 defaultValue。 */
function greetingKeyByHour(h: number): { key: string; fallback: string } {
  if (h < 5) return { key: 'neo.greeting.latenight', fallback: '夜深了' };
  if (h < 11) return { key: 'neo.greeting.morning', fallback: '早上好' };
  if (h < 14) return { key: 'neo.greeting.noon', fallback: '中午好' };
  if (h < 18) return { key: 'neo.greeting.afternoon', fallback: '下午好' };
  return { key: 'neo.greeting.evening', fallback: '晚上好' };
}

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

/* ── A9 hero 动词轮播（ClawsGO a_001/a_003/a_004：深度调研→论文复现→数据分析）──
   4s 间隔交叉淡入淡出（CSS 堆叠 span opacity 过渡），纯前端；页面隐藏
   （document.hidden）时跳过推进，恢复可见后按原节奏继续。 */
const HERO_VERBS = [
  { key: 'neo.chat.heroVerb.research', zh: '深度调研', en: 'deep research' },
  { key: 'neo.chat.heroVerb.paper', zh: '论文复现', en: 'paper reproduction' },
  { key: 'neo.chat.heroVerb.data', zh: '数据分析', en: 'data analysis' },
  { key: 'neo.chat.heroVerb.market', zh: '市场调研', en: 'market research' },
] as const;

const HERO_VERB_INTERVAL_MS = 4000;

function HeroVerbCarousel() {
  const { t, language } = useI18n();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      // 页面隐藏时暂停轮播计时（对齐 usePythonBackendStatus 的可见性策略）
      if (typeof document !== 'undefined' && document.hidden) return;
      setIdx((i) => (i + 1) % HERO_VERBS.length);
    }, HERO_VERB_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="neo-verb-carousel" data-testid="neo-hero-verbs">
      {HERO_VERBS.map((v, i) => (
        <span
          key={v.key}
          className={`neo-verb${i === idx ? ' on' : ''}`}
          aria-hidden={i !== idx}
        >
          {t(v.key, { defaultValue: language === 'zh' ? v.zh : v.en })}
        </span>
      ))}
    </span>
  );
}

export function NeoChat({ target, runId, onRunChange, onNavigate }: NeoChatProps) {
  const { t, language } = useI18n();
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  const { user } = useAuth();

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
    setChatPrefill(undefined);
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

  // 模板画廊点选 → 预填 `@<skill_id> ` 进 hero composer（StartGallery 同一
  // 通路，UnifiedComposer parseSkillToken 自动选中该 skill）。state 而非
  // ref：initialText 受控下发，同一卡片重复点选也能再次触发聚焦。
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

  // 完成态「后续建议」点选 → 预填进 chat composer（NeoComposer initialText
  // 受控下发，仅填入不发送，用户确认后再提交）。
  const [chatPrefill, setChatPrefill] = useState<string | undefined>(undefined);

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
            name: text.slice(0, 20),
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
        const resp = await createRunSession({
          goal: text,
          skill_name: p.skillName,
          // 个人/未选目标默认单 agent（Auto → 'single'，后端锁 roster=1）；
          // 团队目标保持 Auto → undefined（走团队编排）。显式选择的 mode 优先。
          mode:
            p.mode && p.mode !== 'auto'
              ? p.mode
              : target?.kind === 'team'
                ? undefined
                : 'single',
          group_id: groupId,
        });
        window.dispatchEvent(new CustomEvent('sf:run-created'));
        onRunChange(resp.session_id);
      } else {
        const resp = await fetch(`${getApiBase()}/api/run-sessions/${runId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ content: text }),
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
      // 选中知识库 → 发送成功后对 pack 走 RAG query，引用卡挂消息流底部。
      if (p.knowledge.length > 0) {
        setCitations({ packIds: p.knowledge, query: text });
      }
    } catch (err) {
      throw new Error(
        t('neo.chat.sendFailed', {
          defaultValue: `发送失败：${err instanceof Error ? err.message : String(err)}。请确认后端 server 在运行（:8002），或在「设置 → BYOK」配置 API Key。`,
        }),
      );
    }
  }

  const greeting = greetingKeyByHour(new Date().getHours());
  const greetingText = `${t(greeting.key, { defaultValue: greeting.fallback })}${user?.display_name ? `, ${user.display_name}` : ''}`;

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
      await handleSubmit({ text: lastUserText, knowledge: [], attachments: [] });
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
          「新任务」按钮已删，新任务走左栏导航 / Ctrl+K）。纯首页空态
          （无 run 无 target）不渲染，hero 问候即整屏内容。 */}
      {(runId || target) && (
        <header className="neo-chat-topbar">
          <span className="neo-chat-topbar-title">
            {target?.name ?? t('neo.chat.newTask', { defaultValue: '新任务' })}
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
              placeholder={t('neo.chat.followupPlaceholder', {
                defaultValue: '补充指令，AI 会接着干 · 试试 @ 提及 Skill',
              })}
            />
          </div>
        </>
      ) : (
        /* 空态（clawsgo 首页态 tmp29A7）：hero 问候 → 分类 tabs + 模板卡网格，
           composer 钉在列底（滚动区之外），卡片再多也不被顶出视口。
           hero 块用上下 auto margin 在剩余空间居中，内容超高时滚动区自滚。 */
        <>
          <div className="neo-empty">
            <div className="neo-empty-hero">
              {/* 版本 pill（ClawsGO a_001「v1.0 正式上线」形态）：hairline + 灰字小胶囊 */}
              <span className="neo-version-pill">ShadowFlow v{pkg.version}</span>
              <h1 className="neo-empty-title">{greetingText}</h1>
              {/* A9 hero 动词轮播（ClawsGO「让 ClawsGO 帮你 深度调研→论文复现→
                  数据分析」形态）：固定前缀 + 4s 交叉淡入淡出短句，页面隐藏暂停。 */}
              <p className="neo-empty-sub" aria-live="polite">
                {t('neo.chat.heroHelpPrefix', {
                  defaultValue: language === 'zh' ? '让 Agent 帮你 ' : 'Let Agent help you with ',
                })}
                <HeroVerbCarousel />
              </p>
              <StartGallery onPick={setPrefill} />
            </div>
          </div>
          <div className="neo-empty-composer">
            <NeoComposer
              variant="hero"
              onSubmit={handleSubmit}
              initialText={prefill}
              placeholder={t('neo.chat.heroPlaceholder', {
                defaultValue: '描述一个目标，直接开干 · 试试 @ 提及 Skill 或 / 命令',
              })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * NeoChat — Neo 中栏：聊天 + inline 任务执行（clawsgo 中栏形态）。
 *
 * 布局：
 *   顶部条  「当前选中：{target.name}」 + 右侧「新任务」按钮
 *   消息流  run 活跃 → NeoRunInline（用户灰气泡 / 操作列表 / agent 回复 /
 *           状态 pill）；无 run → hero 问候 + 居中大 composer（clawsgo 首页态）
 *   底部    NeoComposer（run 活跃时沉底）
 *
 * 数据通路完全复用 chat-home 现有实现（不另造数据流）：
 *   首条消息 → createGroup(尽力而为) + createRunSession（同 NewTaskComposer），
 *   多轮接力 → POST /api/run-sessions/:id/messages（daemon 返回新 session_id
 *   就地切换），SSE 由 useRunSession 消费（唯一 SSE 数据源）。
 * runId 由 NeoApp 持有（受控）：本组件经 onRunChange 上报启动/清除。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SquarePen } from 'lucide-react';
import type { NeoChatProps } from './types';
import { useRunSession } from '../core/hooks/useRunSession';
import { createRunSession } from '../api/runSessions';
import { createGroup } from '../api/groupApi';
import { getApiBase, authHeaders } from '../api/_base';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
import { NeoRunInline } from './NeoRunInline';
import { StartGallery } from '../pages/chat-home/StartGallery';
import './neo-chat.css';

/** clawsgo 式时段问候（对齐 StartLanding）。i18n key + 中文 defaultValue。 */
function greetingKeyByHour(h: number): { key: string; fallback: string } {
  if (h < 5) return { key: 'neo.greeting.latenight', fallback: '夜深了' };
  if (h < 11) return { key: 'neo.greeting.morning', fallback: '早上好' };
  if (h < 14) return { key: 'neo.greeting.noon', fallback: '中午好' };
  if (h < 18) return { key: 'neo.greeting.afternoon', fallback: '下午好' };
  return { key: 'neo.greeting.evening', fallback: '晚上好' };
}

export function NeoChat({ target, runId, onRunChange }: NeoChatProps) {
  const { t } = useI18n();
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  const { user } = useAuth();

  // SSE 唯一数据源。runId 为 null 时传 ''——hook 内部对空 id 直接跳过订阅，
  // 保持 hooks 调用顺序稳定。
  const session = useRunSession(runId ?? '');

  // 消息流自动滚动到底（新消息 / 新工具调用 / 新思考 / 新文本时）。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [
    runId,
    session.messages,
    session.toolCalls,
    session.thinkingStream,
    session.chatReply,
    session.steps,
  ]);

  // 「新任务」—— 清除当前 run，回到 hero 空态（NeoApp 把 runId 置 null）。
  const handleNewTask = useCallback(() => {
    onRunChange(null);
  }, [onRunChange]);

  // 模板画廊点选 → 预填 `@<skill_id> ` 进 hero composer（StartGallery 同一
  // 通路，UnifiedComposer parseSkillToken 自动选中该 skill）。state 而非
  // ref：initialText 受控下发，同一卡片重复点选也能再次触发聚焦。
  const [prefill, setPrefill] = useState<string | undefined>(undefined);

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

  return (
    <div className="neo-chat">
      {/* 顶部条：当前选中 + 新任务 */}
      <header className="neo-chat-topbar">
        <span className="neo-chat-topbar-label">
          {t('neo.chat.currentTarget', { defaultValue: '当前选中：' })}
          <strong>{target?.name ?? t('neo.chat.noTarget', { defaultValue: '未选择' })}</strong>
        </span>
        <button type="button" className="neo-topbar-btn" onClick={handleNewTask}>
          <SquarePen size={14} strokeWidth={1.9} aria-hidden />
          {t('neo.chat.newTask', { defaultValue: '新任务' })}
        </button>
      </header>

      {runId ? (
        <>
          {/* 消息流 + inline 任务执行（key=runId：多轮接力换 session 即重挂） */}
          <div className="neo-chat-scroll" ref={scrollRef}>
            <NeoRunInline
              key={runId}
              runId={runId}
              session={session}
              targetName={target?.name ?? null}
            />
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
        /* 空态（target 为 null 或尚无 run）：hero 问候 + 居中大 composer
           + 模板画廊（clawsgo 首页态：分类 tab + 真实 skills 卡片） */
        <div className="neo-empty">
          <h1 className="neo-empty-title">{greetingText}</h1>
          <p className="neo-empty-sub">
            {t('neo.chat.heroSub', { defaultValue: '描述一个目标，Agent 直接开干' })}
          </p>
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
          <StartGallery onPick={setPrefill} />
        </div>
      )}
    </div>
  );
}

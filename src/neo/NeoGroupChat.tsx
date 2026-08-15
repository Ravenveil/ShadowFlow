/**
 * NeoGroupChat — 群聊现场页（Neo 形态，2026-08-15 Polynoia 对标）。
 *
 * 单聊（NeoChat）里编排者拆解派发后，agents 的干活现场就在这里：
 *   - 数据：useGroupTimeline（B2 统一读路径 GET /api/groups/:id/timeline
 *     + 群 SSE + 活跃 run 的 /stream 订阅）——聊天消息与 run 过程卡已在
 *     服务端归并为统一 TimelineMessage 流
 *   - 渲染：完整 Timeline 渲染器（variant="neo"）——thinking/工具组卡/
 *     plan_card 编排卡/commit_record 提交卡/file_diff/table_panel/
 *     web_preview/verdict_card 全部内联呈现
 *   - 发言：NeoComposer → postGroupMessage（sender_kind=user）→ 网关
 *     runFanout 触发新一轮 INTENT_PARSE → 分层派发（在群里说话即派活）
 *
 * 入口：NeoRail 群列表行 / NeoChat 顶栏「群聊现场」跳转（session ↔ group
 * 经 B1 互链反查）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UsersRound } from 'lucide-react';
import { useGroupTimeline } from '../core/hooks/useGroupTimeline';
import { getGroup, postGroupMessage } from '../api/groupApi';
import { Timeline } from '../components/run-session/timeline/Timeline';
import { useI18n } from '../common/i18n';
import { NeoComposer, type UnifiedComposerSubmitPayload } from './NeoComposer';
import './neo-chat.css';

export function NeoGroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useI18n();

  const timeline = useGroupTimeline(groupId ?? null);

  // 群名（getGroup 失败 → 退化用 groupId，不阻塞页面）
  const [groupName, setGroupName] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    getGroup(groupId)
      .then((g) => {
        if (!alive || !g) return;
        setGroupName(g.name);
        setMemberCount(g.agent_ids?.length ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);

  // 活跃 run → composer 显示 Stop 视觉（本页不直接支持中止，仅状态呈现）
  const busy = timeline.runs.some((r) => r.status === 'running');

  // 发言 = 在群里说话 → 网关触发新一轮派发（INTENT_PARSE → 分层并行）。
  // executor/model 与其他 composer 调用方同源：UnifiedComposer 的内部
  // picker 写 localStorage（sf.defaultExecutor / sf.model），此处原样读取。
  const handleSubmit = useCallback(
    async (p: UnifiedComposerSubmitPayload) => {
      if (!groupId) return;
      const text = p.text.trim();
      if (!text) return;
      let executor: string | undefined;
      let model: string | undefined;
      try {
        executor = localStorage.getItem('sf.defaultExecutor') || undefined;
        model = localStorage.getItem('sf.model') || undefined;
      } catch {
        /* localStorage 不可用 → 网关默认 executor */
      }
      timeline.appendLocalUser(text);
      try {
        await postGroupMessage(groupId, text, {
          senderName: 'user',
          senderKind: 'user',
          executor,
          model,
        });
      } catch (err) {
        throw new Error(
          t('neo.group.sendFailed', {
            defaultValue: `发送失败：${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      }
    },
    [groupId, timeline, t],
  );

  if (!groupId) return null;

  return (
    <div className="neo-chat neo-group-chat">
      <header className="neo-chat-topbar">
        <Link to="/" className="neo-topbar-btn" aria-label={t('neo.group.back', { defaultValue: '返回' })}>
          <ArrowLeft size={14} strokeWidth={1.9} aria-hidden />
        </Link>
        <span className="neo-chat-topbar-label">
          <UsersRound size={13} strokeWidth={1.9} aria-hidden style={{ marginRight: 4, verticalAlign: -2 }} />
          <strong>{groupName ?? groupId.slice(0, 8)}</strong>
          {memberCount > 0 && (
            <span className="neo-group-members">
              {' '}
              · {t('neo.group.members', { defaultValue: '{{count}} 个 Agent', count: memberCount })}
            </span>
          )}
        </span>
        {busy && (
          <span className="neo-group-live" data-testid="neo-group-live">
            <span className="neo-pill-dot" aria-hidden />
            {t('neo.group.live', { defaultValue: '执行中' })}
          </span>
        )}
      </header>

      <div className="neo-group-scroll">
        {timeline.loading ? (
          <div className="neo-group-note">{t('common.loading', { defaultValue: '加载中…' })}</div>
        ) : timeline.error ? (
          <div className="neo-group-note neo-group-error" role="alert">
            {timeline.error}
            {' · '}
            {t('neo.group.hint', {
              defaultValue: '请确认后端 server 在运行（:8002），且群存在',
            })}
          </div>
        ) : (
          <Timeline messages={timeline.messages} variant="neo" />
        )}
      </div>

      <div className="neo-chat-composer">
        <NeoComposer
          variant="chat"
          onSubmit={handleSubmit}
          streaming={busy}
          placeholder={t('neo.group.placeholder', {
            defaultValue: '在群里说话，Agents 开始干活 · 拆解/派发/合并全程可见',
          })}
        />
      </div>
    </div>
  );
}

export default NeoGroupChat;

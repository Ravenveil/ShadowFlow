/**
 * NeoAgentInspector — Agent 检查器（2026-11-05 Task#11，ZCode「后台运行」式）。
 *
 * 触发：群聊里点某 agent 的气泡头像 / 顶栏成员头像 → NeoApp 记 inspectAgent
 * → NeoHost 右栏整体覆盖为本组件。
 *
 * 内容两节：
 *   1. 后台活动 — 该 agent 在本群的后台工作流：
 *      - assistant_text/raw（agent_id 命中）= 它在群里说的话；
 *      - thinking 卡（label 以它的名字开头）= 它的过程流（含工具调用上下文）；
 *      - hop_card（from_agent 或 to_agent 命中）= 它参与的交接边。
 *      同源复用 useGroupTimeline（与中栏同一 SSE 订阅，多 sink 安全），流内
 *      过滤后交给 NeoTimeline 只读渲染 —— 零新端点。
 *   2. 发起私聊 — resolveDmConversation find-or-create 该 agent 的 DM 会话
 *      （与左栏点 agent 同一条通路），成功即 onNavigate 切换会话。
 *
 * 不 mock：timeline 加载失败/无活动 = 干净空态文案。
 */
import { useEffect, useMemo } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useI18n } from '../common/i18n';
import { useGroupTimeline } from '../core/hooks/useGroupTimeline';
import { resolveDmConversation } from '../api/groupApi';
import { NeoTimeline } from './NeoTimeline';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { getAgent, type AgentRecord } from '../api/agents';
import { useState } from 'react';

export interface NeoAgentInspectorProps {
  agentId: string;
  /** 展示名（触发时刻的 sender_name / 成员记录名；记录拉到后以记录为准）。 */
  name: string;
  /** 被检查的群（活动流数据源）。 */
  groupId: string;
  /** 发起私聊成功 → 切换会话（NeoApp.navigate）。 */
  onOpenDm: (groupId: string) => void;
  /** 关闭检查器（× 钮）。 */
  onClose: () => void;
}

export function NeoAgentInspector({ agentId, name, groupId, onOpenDm, onClose }: NeoAgentInspectorProps) {
  const { t } = useI18n();
  const timeline = useGroupTimeline(groupId);

  // 完整 Agent 记录（DiceBear 头像；拉不到就用触发时刻的名字，头像走字符兜底）。
  const [record, setRecord] = useState<AgentRecord | null>(null);
  useEffect(() => {
    let alive = true;
    getAgent(agentId)
      .then((a) => {
        if (alive) setRecord(a);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [agentId]);

  const displayName = record?.name || name || agentId;

  // 后台活动过滤：该 agent 的发言 / 过程卡（label 前缀匹配）/ 参与的交接边。
  const activity = useMemo(() => {
    const labelPrefix = `${displayName} `; // 过程卡 label 形如 `${name} 正在思考`
    return timeline.messages.filter((m) => {
      if (m.kind === 'assistant_text' || m.kind === 'raw') return m.agent_id === agentId;
      if (m.kind === 'thinking') return m.label.startsWith(labelPrefix);
      if (m.kind === 'hop_card') return m.from_agent === agentId || m.to_agent === agentId;
      return false;
    });
  }, [timeline.messages, agentId, displayName]);

  // ── 发起私聊（find-or-create DM → 切会话）──────────────────────────────
  const [dmBusy, setDmBusy] = useState(false);
  const [dmErr, setDmErr] = useState<string | null>(null);
  const openDm = async () => {
    setDmBusy(true);
    setDmErr(null);
    try {
      const dmGroupId = await resolveDmConversation(agentId);
      if (!dmGroupId) throw new Error('resolve failed');
      onOpenDm(dmGroupId);
    } catch {
      setDmErr(t('neo.inspect.dmFailed', { defaultValue: '私聊创建失败，请重试' }));
    } finally {
      setDmBusy(false);
    }
  };

  return (
    <div className="neo-inspect" data-testid="neo-agent-inspector">
      <header className="neo-inspect-head">
        {record ? (
          <AgentAvatar
            name={displayName}
            style={record.avatar_style}
            seed={record.avatar_seed ?? displayName}
            image={record.avatar_image ?? null}
            size={28}
          />
        ) : (
          <span className="neo-inspect-avatar-fallback" aria-hidden>
            {Array.from(displayName)[0] ?? '?'}
          </span>
        )}
        <div className="neo-inspect-title">
          <strong>{displayName}</strong>
          <span className="neo-inspect-sub">
            {t('neo.inspect.subtitle', { defaultValue: '后台活动 · {{group}}', group: groupId.slice(0, 8) })}
          </span>
        </div>
        <button
          type="button"
          className="neo-inspect-close"
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: '关闭' })}
          data-testid="neo-agent-inspector-close"
        >
          <X size={14} strokeWidth={1.9} aria-hidden />
        </button>
      </header>

      <button
        type="button"
        className="neo-inspect-dm"
        onClick={() => void openDm()}
        disabled={dmBusy}
        data-testid="neo-agent-inspector-dm"
      >
        <MessageSquare size={13} strokeWidth={1.9} aria-hidden />
        {dmBusy
          ? t('neo.inspect.dmOpening', { defaultValue: '创建私聊…' })
          : t('neo.inspect.dm', { defaultValue: '发起私聊' })}
      </button>
      {dmErr && <div className="neo-inspect-dm-err" role="alert">{dmErr}</div>}

      <div className="neo-inspect-sec-label">
        {t('neo.inspect.activity', { defaultValue: '后台活动' })}
      </div>
      <div className="neo-inspect-stream" data-testid="neo-agent-inspector-stream">
        {timeline.loading && activity.length === 0 ? (
          <div className="neo-inspect-empty">{t('common.loading', { defaultValue: '加载中…' })}</div>
        ) : activity.length === 0 ? (
          <div className="neo-inspect-empty">
            {t('neo.inspect.empty', { defaultValue: '本回合还没有它的后台活动' })}
          </div>
        ) : (
          <NeoTimeline messages={activity} />
        )}
      </div>
    </div>
  );
}

export default NeoAgentInspector;

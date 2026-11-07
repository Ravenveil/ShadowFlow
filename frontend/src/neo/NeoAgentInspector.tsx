/**
 * NeoAgentInspector — Agent 检查器（2026-11-05 Task#11，2026-11-06 对齐 ZCode
 * 「后台运行」面板形态）。
 *
 * 触发：群聊里点某 agent 的气泡头像 / 顶栏成员头像 → NeoApp 记 inspectAgent
 * → NeoHost 右栏整体覆盖为本组件。
 *
 * 2026-11-06 用户需求：模仿 ZCode/WorkBuddy 的 Agent 后台活动面板——单个
 * agent 的完整流程（思考 / 工具调用 / 交接 / 产出）都在右栏显示，保持群聊
 * 聊天区域清爽；且必须能明显地「回去」。
 *
 * 内容：
 *   1. 头部 — 头像 + 名字 + 「返回群聊」钮（← 主退路）+「发起私聊」图标钮
 *      +「×」关闭。三路都能离开检查器，聊天区不会被卡死。
 *   2. 后台活动 — 该 agent 在本群的后台工作流（同源复用 useGroupTimeline，
 *      与中栏同一 SSE 订阅，多 sink 安全，零新端点）：
 *      - assistant_text/raw（agent_id 命中）= 它在群里说的话；
 *      - thinking（agent_id 命中；老数据回落 label 前缀匹配）= 过程流；
 *      - tool_call/tool_echo（agent_id 命中）= 工具调用与结果；
 *      - plan_card 含它的任务行（行 agent_id / 行 id `node:<agentId>` 命中）；
 *        commit_record / file_diff 等 run 产物卡 — 有 agent_id 的按 id 筛；
 *        无归属的（老数据/编排者合并提交）不进流（宁可少不串台）；
 *      - hop_card（from_agent 或 to_agent 命中）= 它参与的交接边。
 *      流内过滤后交给 NeoTimeline 只读渲染。
 *
 * 不 mock：timeline 加载失败/无活动 = 干净空态文案。
 */
import { useEffect, useMemo } from 'react';
import { ArrowLeft, MessageSquare, X } from 'lucide-react';
import { useI18n } from '../common/i18n';
import { useGroupTimeline } from '../core/hooks/useGroupTimeline';
import { resolveDmConversation } from '../api/groupApi';
import { NeoTimeline } from './NeoTimeline';
import { isAgentActivity, thinkingLabelPrefix } from './agent-activity';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { getAgent, type AgentRecord } from '../api/agents';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { useState } from 'react';

export interface NeoAgentInspectorProps {
  agentId: string;
  /** 展示名（触发时刻的 sender_name / 成员记录名；记录拉到后以记录为准）。 */
  name: string;
  /** 被检查的群（活动流数据源）。 */
  groupId: string;
  /** 发起私聊成功 → 切换会话（NeoApp.navigate）。 */
  onOpenDm: (groupId: string) => void;
  /** 关闭检查器（× / ← 返回群聊）。 */
  onClose: () => void;
}

/**
 * 后台活动过滤（导出供单测）— 该 agent 的发言 / 过程卡 / 工具卡 / 交接边。
 * 归属判定委托 agent-activity.isAgentActivity（与群聊 busy roster 共用单真源）。
 */
export function filterAgentActivity(
  messages: readonly TimelineMessage[],
  agentId: string,
  displayName: string,
): TimelineMessage[] {
  const labelPrefix = thinkingLabelPrefix(displayName); // 老数据过程卡 label 形如 `${name} 正在思考`
  return messages.filter((m) => isAgentActivity(m, agentId, labelPrefix));
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

  // 后台活动过滤（纯函数，导出可单测）。
  const activity = useMemo(
    () => filterAgentActivity(timeline.messages, agentId, displayName),
    [timeline.messages, agentId, displayName],
  );

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
        <button
          type="button"
          className="neo-inspect-back"
          onClick={onClose}
          aria-label={t('neo.inspect.back', { defaultValue: '返回群聊' })}
          title={t('neo.inspect.back', { defaultValue: '返回群聊' })}
          data-testid="neo-agent-inspector-back"
        >
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden />
        </button>
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
          className="neo-inspect-dm-icon"
          onClick={() => void openDm()}
          disabled={dmBusy}
          aria-label={dmBusy
            ? t('neo.inspect.dmOpening', { defaultValue: '创建私聊…' })
            : t('neo.inspect.dm', { defaultValue: '发起私聊' })}
          title={t('neo.inspect.dm', { defaultValue: '发起私聊' })}
          data-testid="neo-agent-inspector-dm"
        >
          <MessageSquare size={14} strokeWidth={1.9} aria-hidden />
        </button>
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

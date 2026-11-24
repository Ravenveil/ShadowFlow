/**
 * agent 活动归属判定（2026-11-07 群聊 busy roster 三态批）— 纯函数、单真源。
 *
 * 消费方：
 *   - NeoAgentInspector.filterAgentActivity（检查器活动流过滤）；
 *   - NeoGroupChat.busyRoster（顶栏成员状态点：干过活才算「处理中」）。
 * 两边共用同一实现，避免双实现漂移（归属语义：显式 agent_id >
 * thinking 老数据 label 前缀 > 不算）。
 */
import type { TimelineMessage } from '../components/run-session/timeline/types';

/** 老数据过程卡 label 形如 `${name} 正在思考` —— 显式 agent_id 缺席时的兜底锚点。 */
export function thinkingLabelPrefix(displayName: string): string {
  return `${displayName} `;
}

/** 该条消息是否属于这个 agent 的活动（发言/思考/工具/任务行/交接边/带归属产物卡）。 */
export function isAgentActivity(
  m: TimelineMessage,
  agentId: string,
  labelPrefix: string,
): boolean {
  switch (m.kind) {
    case 'assistant_text':
    case 'raw':
      return m.agent_id === agentId;
    case 'thinking':
      return m.agent_id != null ? m.agent_id === agentId : m.label.startsWith(labelPrefix);
    case 'tool_call':
    case 'tool_echo':
      return m.agent_id === agentId;
    case 'hop_card':
      return m.from_agent === agentId || m.to_agent === agentId;
    case 'plan_card':
      // 「含它的任务行」才算：行归属 显式 agent_id > 行 id `node:<agentId>`
      // （2026-11-07 前的行只有 id/assignee，id 即确定性归属锚点，不猜名字）。
      return m.tasks.some((t) => t.agent_id === agentId || t.id === `node:${agentId}`);
    default: {
      // 其余 run 产物卡（commit_record/file_diff/table/verdict…）：有 agent_id
      // 的按 id 筛；无归属的（老数据/编排者合并提交）不算（宁可少不串台）。
      const aid = (m as { agent_id?: string }).agent_id;
      return aid != null && aid === agentId;
    }
  }
}

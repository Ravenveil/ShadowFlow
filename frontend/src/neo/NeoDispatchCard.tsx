/**
 * NeoDispatchCard — WorkBuddy 式「派发卡」（2026-08-23 意图分发可视化）。
 *
 * 数据源：网关 groups-chat.ts 在 INTENT_PARSE 后补发的 `intent`
 * TimelineMessage（NeverRaising 附加帧，含 intent/target/reason/可选
 * assignments 明细）。契约：server/src/lib/contracts.ts TimelineMessage
 * kind='intent'。
 *
 * 渲染：意图 → 派发给 团队X / 员工Y（理由）+ 可选 per-agent 子任务明细。
 * 无数据（旧网关/串行未发帧）→ 调用方不挂载，本组件不自造空态。
 */
import { Send } from 'lucide-react';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { useI18n } from '../common/i18n';

export type IntentMessage = Extract<TimelineMessage, { kind: 'intent' }>;

export function NeoDispatchCard({ msg }: { msg: IntentMessage }) {
  const { t } = useI18n();
  const targetLabel =
    msg.target_kind === 'team'
      ? t('neo.group.dispatchTargetTeam', { defaultValue: `团队 ${msg.target_name}`, name: msg.target_name })
      : t('neo.group.dispatchTargetAgent', { defaultValue: `员工 ${msg.target_name}`, name: msg.target_name });

  return (
    <div className="neo-gc-dispatch" data-testid="neo-gc-dispatch">
      <div className="neo-gc-dispatch-head">
        <Send size={12} strokeWidth={1.9} aria-hidden />
        <span>{t('neo.group.dispatchTitle', { defaultValue: '派发' })}</span>
      </div>
      <div className="neo-gc-dispatch-body">
        <span className="neo-gc-dispatch-intent">{msg.intent}</span>
        <span className="neo-gc-dispatch-arrow" aria-hidden>
          →
        </span>
        <span className="neo-gc-dispatch-target">{targetLabel}</span>
        <span className="neo-gc-dispatch-reason">（{msg.reason}）</span>
      </div>
      {msg.assignments && msg.assignments.length > 0 && (
        <ul className="neo-gc-dispatch-list">
          {msg.assignments.map((a) => (
            <li key={a.agent_id} className="neo-gc-dispatch-item">
              <span className="neo-gc-dispatch-item-name">{a.name}</span>
              <span className="neo-gc-dispatch-item-title">{a.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NeoDispatchCard;

/**
 * NeoTeamSavedCard — 「团队已保存」引导卡（2026-08-22 第二轮缺口 A）。
 *
 * 数据源：SSE `team-saved` 帧（server/src/team-persistence.ts 在组装流
 * complete 之前插入，team+agents 已落 Python 存储）→ useRunSession.teamSaved。
 * NeoChat 把它渲染在消息流末尾（NeoRunInline 之下），给用户明确的下一步
 * 引导（WorkBuddy 式闭环）：团队名 + 成员数 + 「去群聊运行」CTA。
 *
 * CTA 纪律：只做跳转/提示，【不直接调 groupApi 建群】——群聊入口（建群/
 * resolveTeamGroup）归另一代理。当前 run 已互链群（linkedGroupId）时直接
 * 跳群聊现场；尚未互链时点击展开内联下一步说明，不假按钮。
 *
 * 样式：inline style + var(--t-*) 主题变量（与 CreateTeamModal 同款），
 * 文案走 t(key, { defaultValue })，不改 locale 文件。
 */
import { useState } from 'react';
import { CheckCircle2, UsersRound } from 'lucide-react';
import type { TeamSavedEvent } from '../api/runSessions';
import { useI18n } from '../common/i18n';

export interface NeoTeamSavedCardProps {
  team: TeamSavedEvent;
  /** 当前 run 互链的聊天群 id（B1 互链反查）；null = 尚未互链，CTA 降级为提示。 */
  groupId: string | null;
  /** 跳转群聊现场（NeoChat 注入 onNavigate({view:'conversation', groupId})）。 */
  onOpenGroup: (groupId: string) => void;
}

export function NeoTeamSavedCard({ team, groupId, onOpenGroup }: NeoTeamSavedCardProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  // 无互链群时点击 CTA 展开的内联下一步说明（一次性提示，展开后保持）。
  const [hintOpen, setHintOpen] = useState(false);
  const memberCount = team.agent_ids?.length ?? 0;

  return (
    <div
      data-testid="neo-team-saved-card"
      style={{
        margin: '10px 0', padding: '10px 12px', borderRadius: 10,
        background: 'color-mix(in oklab, var(--t-accent) 7%, var(--t-panel))',
        border: '1px solid color-mix(in oklab, var(--t-accent) 30%, transparent)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <CheckCircle2 size={14} strokeWidth={2} aria-hidden style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>
          {t('runSession.teamSaved', { defaultValue: zh ? '团队已保存' : 'Team saved' })}
        </span>
        <span
          data-testid="neo-team-saved-name"
          style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 12, color: 'var(--t-fg-2)', fontWeight: 600,
          }}
        >
          {team.name}
        </span>
        <span
          data-testid="neo-team-saved-count"
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)',
            padding: '1px 6px', borderRadius: 4, flexShrink: 0,
            background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
          }}
        >
          {t('neo.teamSaved.memberCount', {
            defaultValue: zh ? `${memberCount} 名成员` : `${memberCount} members`,
            count: memberCount,
          })}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          data-testid="neo-team-saved-cta"
          onClick={() => {
            if (groupId) onOpenGroup(groupId);
            else setHintOpen(true);
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid color-mix(in oklab, var(--t-accent) 50%, transparent)',
            background: 'color-mix(in oklab, var(--t-accent) 18%, var(--t-panel-2))',
            color: 'var(--t-accent)',
          }}
        >
          <UsersRound size={13} strokeWidth={2} aria-hidden />
          {t('neo.teamSaved.gotoGroup', { defaultValue: zh ? '去群聊运行' : 'Run in group chat' })}
        </button>
      </div>

      {hintOpen && !groupId && (
        <div
          data-testid="neo-team-saved-hint"
          style={{ fontSize: 11.5, color: 'var(--t-fg-4)', lineHeight: 1.6 }}
        >
          {t('neo.teamSaved.hint', {
            defaultValue: zh
              ? '下一步：从左侧「团队」进入该团队的群聊，描述任务即可让整个团队协同运行。'
              : 'Next: open this team’s group chat from the left rail and describe a task to run the whole team.',
          })}
        </div>
      )}
    </div>
  );
}

export default NeoTeamSavedCard;

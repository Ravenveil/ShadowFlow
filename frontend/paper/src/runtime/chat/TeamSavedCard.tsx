/**
 * TeamSavedCard — 「团队已保存」引导卡（搬 legacy NeoTeamSavedCard）。
 *
 * 数据源：run 流里的 team-saved 帧（团队+成员已落库）→ 调用方传入。
 * 渲染在消息流末尾，给用户明确的下一步引导：团队名 + 成员数 +
 * 「去群聊运行」CTA。只做跳转/提示，不直接建群。
 * 文案在 content/app.ts 的 TEAM_SAVED；样式 chat.css 的 tsaved-*。
 */
import { useState } from 'react';
import { TEAM_SAVED } from '@/shared/content/app';
import { IconCheckCircle, IconUsers } from '@/shared/ui/icons';

export interface TeamSavedInfo {
  name: string;
  agent_ids?: string[];
}

export function TeamSavedCard({
  team,
  groupId,
  onOpenGroup,
}: {
  team: TeamSavedInfo;
  /** 当前 run 互链的群 id；null = 尚未互链，CTA 降级为提示。 */
  groupId: string | null;
  onOpenGroup: (groupId: string) => void;
}) {
  const [hintOpen, setHintOpen] = useState(false);
  const memberCount = team.agent_ids?.length ?? 0;

  return (
    <div className="tsaved">
      <div className="tsaved-head">
        <IconCheckCircle size={14} />
        <span className="tsaved-title">{TEAM_SAVED.title}</span>
        <span className="tsaved-name">{team.name}</span>
        <span className="tsaved-count">{TEAM_SAVED.members(memberCount)}</span>
      </div>
      <div className="tsaved-actions">
        <button
          type="button"
          className="tsaved-cta"
          onClick={() => {
            if (groupId) onOpenGroup(groupId);
            else setHintOpen(true);
          }}
        >
          <IconUsers size={13} />
          {TEAM_SAVED.goto}
        </button>
      </div>
      {hintOpen && !groupId ? <div className="tsaved-hint">{TEAM_SAVED.hint}</div> : null}
    </div>
  );
}

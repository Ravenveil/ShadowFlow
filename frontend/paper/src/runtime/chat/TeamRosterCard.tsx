/**
 * TeamRosterCard — 聊天流里的「团队成员」卡（对齐 WorkBuddy）。
 *
 * 形态：一行折叠头（头像栈 + 「N 位团队成员」+ 折叠箭头），展开后每人一行：
 * 头像、名字、右侧状态（已完成 / 进行中 / 待命）+ 箭头。点一行 = 右栏切到
 * 这个人的产物，右栏标题随之变成「某某的产物」。
 *
 * 状态不给假值：busy 来自 roster，交过东西（消息里有交付）才算已完成，
 * 什么都没交就是待命。文案在 `content/app.ts` 的 CHAT。
 */
import { useMemo, useState } from 'react';
import { AgentAvatar, AvatarStack, AVATAR_SIZE } from '@/shared/ui/avatar';
import { CHAT } from '@/shared/content/app';
import { deliverablesOf, groupDeliverables, sameMember } from '@/shared/data/deliverables';
import type { Message, PanelStep, RosterMember } from '@/shared/data/types';
import { IconCheck, IconChevron, IconChevronDown } from '@/shared/ui/icons';

export function TeamRosterCard({
  members,
  messages,
  steps,
  focused,
  onPick,
}: {
  members: RosterMember[];
  messages: Message[];
  /** 执行摘要里的步骤也算交付（真后端两者同源，这里都收）。 */
  steps?: PanelStep[];
  /** 右栏正在看谁（高亮那一行）。 */
  focused?: string | null;
  onPick: (name: string) => void;
}) {
  // 默认收起：卡片只在有人被调用时才出现，出现时也别摊开占时间线，
  // 点头部才展开看每个人的状态。曾展开过则记住（本轮会话内）。
  const [open, setOpen] = useState(false);
  const groups = useMemo(
    () => groupDeliverables(messages, steps ?? [], []),
    [messages, steps],
  );

  return (
    <section className="trc">
      <button
        type="button"
        className="trc-head"
        aria-expanded={open}
        aria-label={CHAT.teamToggle}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarStack labels={members.map((m) => m.name)} max={3} size={AVATAR_SIZE.xs} />
        <span className="trc-title">{CHAT.teamTitle(members.length)}</span>
        <IconChevronDown size={13} className="trc-caret" data-open={open ? 'true' : undefined} />
      </button>

      {open ? (
        <ul className="trc-list">
          {members.map((m) => {
            const delivered = (deliverablesOf(groups, m)?.items.length ?? 0) > 0;
            const state = m.state === 'busy' ? 'busy' : delivered ? 'done' : 'idle';
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className="trc-row"
                  data-active={focused && sameMember(focused, m) ? 'true' : undefined}
                  title={CHAT.teamStripJump(m.name)}
                  onClick={() => onPick(m.name)}
                >
                  <AgentAvatar label={m.name} size={AVATAR_SIZE.sm} status={false} />
                  <span className="trc-name">{m.name}</span>
                  <span className="trc-state" data-state={state}>
                    {state === 'done' ? <IconCheck size={12} /> : null}
                    {CHAT.teamState[state]}
                  </span>
                  <IconChevron size={12} className="trc-go" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

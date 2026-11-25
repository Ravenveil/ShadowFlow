/**
 * TeamBlock — 群聊里主控带的团队成员面板（头像堆叠 + 成员行）。
 */
import { useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { STEP_STATUS_TEXT } from '@/shared/content/app';
import type { TeamPayload } from '@/shared/data/types';
import { IconChevron, IconChevronDown } from '@/shared/ui/icons';
import { StepStatusMark } from '@/runtime/chat/RunBlock';

/** 抬头最多露几张脸。 */
const HEAD_FACES = 3;

export function TeamBlock({ team }: { team: TeamPayload }) {
  const [open, setOpen] = useState(true);
  const done = team.members.filter((m) => m.status === 'done').length;

  return (
    <div className="sf-team">
      <button className="sf-team-head" onClick={() => setOpen((v) => !v)}>
        <span className="sf-team-faces">
          {team.members.slice(0, HEAD_FACES).map((m) => (
            <AgentAvatar key={m.id} label={m.role} size={AVATAR_SIZE.row} status={false} />
          ))}
        </span>
        <span className="sf-team-title">{team.title}</span>
        <span className="sf-team-count">
          {done}/{team.members.length}
        </span>
        <span className="sf-team-chevron" data-open={open ? 'true' : undefined}>
          {open ? <IconChevronDown size={13} /> : <IconChevron size={13} />}
        </span>
      </button>

      {open ? (
        <ul className="sf-team-list">
          {team.members.map((m) => (
            <li key={m.id} className="sf-team-row" data-status={m.status}>
              <AgentAvatar label={m.role} size={AVATAR_SIZE.team} />
              <span className="sf-team-role">{m.role}</span>
              <span className="sf-team-name">{m.name}</span>
              {m.note ? <span className="sf-team-note">{m.note}</span> : null}
              <span className="sf-team-status">
                <StepStatusMark status={m.status} />
                {STEP_STATUS_TEXT[m.status]}
              </span>
              <span className="sf-team-go">
                <IconChevron size={13} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import { AgentAvatar } from '../avatar';
import type { TeamPayload } from '../data/types';
import { IconChevron, IconChevronDown } from '../shell/icons';
import { StepStatusMark } from './RunBlock';

const STATUS_LABEL = {
  done: '已完成',
  running: '进行中',
  wait: '等待中',
  failed: '失败',
} as const;

/**
 * 团队成员面板 —— 群聊里主控带的管道角色。
 * 形态对齐截图：头像堆叠 + 「3 位团队成员」+ 每行「角色名 人名 …… ✓ 已完成 >」
 */
export function TeamBlock({ team }: { team: TeamPayload }) {
  const [open, setOpen] = useState(true);
  const done = team.members.filter((m) => m.status === 'done').length;

  return (
    <div className="sf-team">
      <button className="sf-team-head" onClick={() => setOpen((v) => !v)}>
        <span className="sf-team-faces">
          {team.members.slice(0, 3).map((m) => (
            <AgentAvatar key={m.id} label={m.role} size={18} status={false} />
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
              <AgentAvatar label={m.role} size={24} />
              <span className="sf-team-role">{m.role}</span>
              <span className="sf-team-name">{m.name}</span>
              {m.note ? <span className="sf-team-note">{m.note}</span> : null}
              <span className="sf-team-status">
                <StepStatusMark status={m.status} />
                {STATUS_LABEL[m.status]}
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

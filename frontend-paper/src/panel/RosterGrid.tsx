/**
 * RosterGrid — 右栏「编队」的成员区：微信群/钉钉群成员式横向头像网格。
 *
 * 形态对齐旧前端 TeamPanel 的成员区（.neo-gm-grid）：头像在上、名字在下、
 * 运行状态点挂在头像右下角；宽度不够自动换行，成员再多也不撑破 340px。
 *
 * 为什么不用行列表：右栏只有 340 宽，行列表一个人占一整行、还要塞角色和
 * note，六个人就要滚一屏 —— 网格一眼看全编队，工作流和策略矩阵才不会被挤到
 * 首屏之外。
 *
 * 只认 RosterMember[]，不含任何具体人名；点格子的资料卡留给后续（需要接口）。
 */
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import type { RosterMember } from '../data/types';

export function RosterGrid({ members }: { members: RosterMember[] }) {
  return (
    <ul className="rg">
      {members.map((m) => {
        const busy = m.state === 'busy';
        return (
          <li key={m.id} title={m.name === m.role ? m.name : `${m.name} · ${m.role}`}>
            <span className="rg-face">
              <AgentAvatar label={m.role} size={AVATAR_SIZE.xl} status={false} />
              <i className="rg-dot" data-busy={busy ? 'true' : undefined} aria-hidden />
            </span>
            <span className="rg-name">{m.short ?? m.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

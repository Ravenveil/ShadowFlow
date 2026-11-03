/**
 * GroupStackAvatar — 群聊组合头像（os-unified 2026-11-04 用户反馈批）。
 *
 * 之前的群聊行/群顶栏是一枚「双人剪影」图标，看不出群里都是谁。Grok/微信
 * 的范式是**群头像 = 成员头像的组合**：
 *   - 1 位成员 → 直接显示该成员的真实头像；
 *   - 2-4 位 → 成员头像 2×2 拼贴（圆底裁切）；
 *   - 0 位 / 记录缺失 → 回退双人剪影圆块（不伪造成员）。
 *
 * 纯展示组件：成员记录由调用方从 agents 列表 join（agent_ids → AgentRecord），
 * 组件只负责拼贴渲染。样式在 neo.css `.neo-gstack*`。
 */
import { UsersRound } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';

/** 成员记录的最小结构（AgentRecord 天然满足）。 */
export interface GroupStackMember {
  agent_id?: string;
  name: string;
  avatar_style?: string | null;
  avatar_seed?: string | null;
  avatar_image?: string | null;
}

export function GroupStackAvatar({
  members,
  size = 32,
}: {
  members: GroupStackMember[];
  size?: number;
}) {
  const shown = members.filter((m) => !!m.name).slice(0, 4);

  // 无成员：回退剪影圆块（与旧 NeoGroupAvatar 同视觉，不编造头像）
  if (shown.length === 0) {
    return (
      <span
        className="neo-avatar neo-avatar--group"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <UsersRound size={Math.round(size * 0.5)} strokeWidth={1.9} />
      </span>
    );
  }

  // 单成员：群就是 TA 的会话，直接用真实头像
  if (shown.length === 1) {
    const m = shown[0];
    return (
      <span className="neo-gstack neo-gstack--single" style={{ width: size, height: size }}>
        <AgentAvatar
          name={m.name}
          style={m.avatar_style}
          seed={m.avatar_seed ?? m.name}
          image={m.avatar_image ?? null}
          size={size}
        />
      </span>
    );
  }

  // 2-4 成员：2×2 拼贴
  return (
    <span className="neo-gstack" style={{ width: size, height: size }} aria-hidden>
      {shown.map((m, i) => (
        <span key={m.agent_id ?? `${m.name}-${i}`} className="neo-gstack-cell">
          <AgentAvatar
            name={m.name}
            style={m.avatar_style}
            seed={m.avatar_seed ?? m.name}
            image={m.avatar_image ?? null}
            size={Math.round(size / 2)}
          />
        </span>
      ))}
    </span>
  );
}

export default GroupStackAvatar;

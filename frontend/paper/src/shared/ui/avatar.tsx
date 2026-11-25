/**
 * avatar.tsx — Agent 头像渲染器（纯展示层）。
 *
 * 名单与色值都在 `src/data/identities.ts`，这里只做三件事：
 *   1. 把 seed 画成 dicebear micah 的 SVG（本地生成，离线可用、零网络请求）；
 *   2. 按 `size` 尺寸档渲染，底色取身份表；
 *   3. `AvatarStack` 处理堆叠与「+N」。
 *
 * 想改某人的脸/色：改 identities.ts。想改头像尺寸档：改 AVATAR_SIZE。
 */
import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as micah from '@dicebear/micah';
import { agentIdentity, type AgentIdentity } from '@/shared/data/identities';
import { useAgentAvatar } from '@/shared/data/avatarRegistry';
import { renderAvatarSvg } from '@/shared/data/avatarStyles';

/** 尺寸档（px）。组件一律用档位，不写裸数字，改一处即全站统一。 */
export const AVATAR_SIZE = {
  xs: 13,
  sm: 16,
  /** 矩阵行头 / 团队抬头的小堆叠。 */
  row: 18,
  md: 20,
  /** 会话卡里的头像（比 md 大一点点，标题才不显挤）。 */
  list: 22,
  /** 团队列表行。 */
  team: 24,
  base: 26,
  lg: 30,
  xl: 34,
} as const;

export type AvatarSize = number | keyof typeof AVATAR_SIZE;

function resolveSize(size: AvatarSize | undefined, small: boolean): number {
  if (typeof size === 'number') return size;
  if (size) return AVATAR_SIZE[size];
  return small ? AVATAR_SIZE.md : AVATAR_SIZE.lg;
}

export interface AgentAvatarProps {
  label: string;
  small?: boolean;
  /** 尺寸档（或显式像素）。 */
  size?: AvatarSize;
  /** 是否显示右下角在线状态点（默认 true）。 */
  status?: boolean;
  className?: string;
}

export function AgentAvatar({ label, small = false, size, status = true, className }: AgentAvatarProps) {
  const identity: AgentIdentity = useMemo(() => agentIdentity(label), [label]);
  /** 全局头像表（每个 Agent 一条，灵魂面板改后所有视图同步）；未命中才回落身份表。 */
  const live = useAgentAvatar(label);
  const px = resolveSize(size, small);

  const image = live?.image;
  const bg = live?.color || identity.color;

  const face = useMemo(() => {
    if (image) return null;
    // 配过风格 → 同一套 DiceBear；只配了种子/默认 → 仍是身份表的 micah 脸，
    // 但种子取全局登记值，保证同一个 Agent 在任何视图都同一张脸。
    if (live?.style) return renderAvatarSvg(live.style, live.seed, label);
    try {
      return createAvatar(micah, {
        seed: live?.seed || identity.seed,
        backgroundColor: [bg.replace('#', '')],
        radius: 0,
      }).toString();
    } catch {
      return null;
    }
  }, [image, live?.style, live?.seed, label, bg, identity.seed]);

  return (
    <span
      className={`sf-avatar${className ? ` ${className}` : ''}`}
      style={
        {
          width: px,
          height: px,
          '--avatar-color': bg,
        } as React.CSSProperties
      }
      data-agent={identity.seed}
      data-tone={identity.tone}
      title={label}
    >
      {image ? (
        <img className="sf-avatar-img" src={image} alt={label} />
      ) : face ? (
        <span className="sf-avatar-face" dangerouslySetInnerHTML={{ __html: face }} />
      ) : (
        <span className="sf-avatar-fallback">{(label ?? '').trim().slice(0, 1) || '?'}</span>
      )}
      {status ? <i className="sf-avatar-dot" /> : null}
    </span>
  );
}

/** 头像堆叠（团队成员概要）。 */
export function AvatarStack({
  labels,
  max = 4,
  size = AVATAR_SIZE.md,
  showRest = true,
}: {
  labels: string[];
  max?: number;
  size?: AvatarSize;
  /** 是否显示「+N」尾巴；窄卡片里关掉更干净。 */
  showRest?: boolean;
}) {
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  const px = resolveSize(size, false);
  return (
    <span className="sf-avatar-stack">
      {shown.map((l) => (
        <AgentAvatar key={l} label={l} size={px} status={false} />
      ))}
      {showRest && rest > 0 ? (
        <span className="sf-avatar-more" style={{ width: px, height: px }}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export { agentIdentity };
export default AgentAvatar;

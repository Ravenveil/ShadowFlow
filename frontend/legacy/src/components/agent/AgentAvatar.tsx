/**
 * AgentAvatar — DiceBear 统一头像组件（ClawHub 2026-06，FR-06）。
 *
 *  - 本地生成（@dicebear/core createAvatar → SVG 字符串，离线可用，不走公网）
 *  - 尺寸档：24 / 32 / 48 / 128（PRD §6.2；其他数值也接受，按 px 直出）
 *  - 兜底链：avatar_style 缺失/未知 → bottts-neutral；seed 缺失/空串 → name
 *    本身直作种子（与调用方 `avatar_seed ?? name` 唯一约定——2026-11-05 修复：
 *    此前组件内兜底 hashSeed(name)，与侧栏的名字直作种子两条规则并存，
 *    同一 agent 在侧栏与灵魂页预览画出两张脸）
 *    SVG 生成异常 → fallback 节点（调用方传入或首字母色块）
 *
 * 使用方（T08）：NeoRail 列表行 / NeoHost / NeoGroupChat / NeoCreateAgentModal 预览。
 */
import { useMemo, useState } from 'react';
import { normalizeStyle, renderAvatarSvg } from '../../config/clawhub';

export interface AgentAvatarProps {
  /** Agent 名（seed 缺省时的种子来源 + 兜底首字母）。 */
  name: string;
  /** DiceBear 风格 id（normalizeStyle 兜底 bottts-neutral）。 */
  style?: string | null;
  /** DiceBear 种子（缺省/空串 = name 直作种子，与调用方兜底约定一致）。 */
  seed?: string | null;
  /** 提示词生成头像图（dataURL/URL）；非空时优先渲染（os-unified 2026-11-04）。 */
  image?: string | null;
  /** 尺寸档（px）。默认 32。 */
  size?: 24 | 32 | 48 | 128 | number;
  /** SVG 生成失败时的兜底节点（缺省 = 首字母色块）。 */
  fallback?: React.ReactNode;
  /** 附加 class。 */
  className?: string;
  /** alt/aria 文本（缺省 = name）。 */
  title?: string;
}

/** 兜底首字母色块（与 Neo 字符头像同视觉语言）。 */
function InitialFallback({ name, size }: { name: string; size: number }) {
  const first = Array.from((name ?? '').trim())[0] ?? '?';
  const initial = /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
  return (
    <span
      className="neo-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function AgentAvatar({
  name,
  style,
  seed,
  image,
  size = 32,
  fallback,
  className,
  title,
}: AgentAvatarProps) {
  const [failed, setFailed] = useState(false);

  const svg = useMemo(() => {
    // 生成图优先（提示词生成的 dataURL/URL）——有图不跑 DiceBear
    if (image && image.trim().length > 0) return null;
    if (failed) return null;
    try {
      const styleId = normalizeStyle(style);
      // 种子兜底：空/缺省 → name 直作种子。唯一约定（2026-11-05 修复），
      // 与全部调用方 `avatar_seed ?? name` 同规则，保证同 agent 各处同脸。
      const effectiveSeed = seed && seed.trim().length > 0 ? seed : name;
      return renderAvatarSvg(styleId, effectiveSeed);
    } catch {
      setFailed(true);
      return null;
    }
    // name 参与 seed 兜底，故入依赖
  }, [style, seed, name, failed, image]);

  // 生成图渲染分支（img 圆形裁切；加载失败回落 DiceBear → fallback）
  if (image && image.trim().length > 0 && !failed) {
    return (
      <span
        className={`claw-avatar claw-avatar--img${className ? ` ${className}` : ''}`}
        data-testid="agent-avatar"
        style={{ width: size, height: size }}
        title={title ?? name}
        aria-label={title ?? name}
        role="img"
      >
        <img
          src={image}
          alt={title ?? name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  if (!svg) {
    return <>{fallback ?? <InitialFallback name={name} size={size} />}</>;
  }

  return (
    <span
      className={`claw-avatar${className ? ` ${className}` : ''}`}
      data-testid="agent-avatar"
      style={{ width: size, height: size }}
      title={title ?? name}
      aria-label={title ?? name}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default AgentAvatar;

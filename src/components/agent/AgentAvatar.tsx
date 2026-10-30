/**
 * AgentAvatar — DiceBear 统一头像组件（ClawHub 2026-06，FR-06）。
 *
 *  - 本地生成（@dicebear/core createAvatar → SVG 字符串，离线可用，不走公网）
 *  - 尺寸档：24 / 32 / 48 / 128（PRD §6.2；其他数值也接受，按 px 直出）
 *  - 兜底链：avatar_style 缺失/未知 → bottts-neutral；seed 缺失 → hashSeed(name)；
 *    SVG 生成异常 → fallback 节点（调用方传入或首字母色块）
 *
 * 使用方（T08）：NeoRail 列表行 / NeoHost / NeoGroupChat / NeoCreateAgentModal 预览。
 */
import { useMemo, useState } from 'react';
import { hashSeed, normalizeStyle, renderAvatarSvg } from '../../config/clawhub';

export interface AgentAvatarProps {
  /** Agent 名（seed 缺省时的 hash 源 + 兜底首字母）。 */
  name: string;
  /** DiceBear 风格 id（normalizeStyle 兜底 bottts-neutral）。 */
  style?: string | null;
  /** DiceBear 种子（缺省 hashSeed(name)）。 */
  seed?: string | null;
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
  size = 32,
  fallback,
  className,
  title,
}: AgentAvatarProps) {
  const [failed, setFailed] = useState(false);

  const svg = useMemo(() => {
    if (failed) return null;
    try {
      const styleId = normalizeStyle(style);
      const effectiveSeed = seed && seed.trim().length > 0 ? seed : hashSeed(name);
      return renderAvatarSvg(styleId, effectiveSeed);
    } catch {
      setFailed(true);
      return null;
    }
    // name 参与 seed 兜底，故入依赖
  }, [style, seed, name, failed]);

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

/**
 * Hi-Fi v2 atoms — Day + Night theme aware.
 *
 * Derived 1:1 from the Claude Design handoff bundle (`hf-shared.jsx`).
 * Theme is set via `[data-theme="day"|"night"]` on `documentElement` by the
 * `useTheme` hook. All visuals reference `var(--t-*)` tokens declared in
 * `src/index.css` so a theme switch is a single attribute change.
 */
import type { CSSProperties, ReactNode } from 'react';

export type HfStatus = 'ok' | 'warn' | 'err' | 'run' | 'gated';

interface HfAvatarProps {
  glyph: string;
  color: string;
  size?: number;
  status?: HfStatus;
}

export function HfAvatar({ glyph, color, size = 28, status }: HfAvatarProps) {
  const wrap: CSSProperties = {
    position: 'relative',
    flexShrink: 0,
    width: size,
    height: size,
  };
  const tile: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size * 0.28,
    background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`,
    border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
    color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: size * 0.42,
    letterSpacing: '-0.02em',
  };
  const dot: CSSProperties | undefined = status
    ? {
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: Math.max(8, size * 0.28),
        height: Math.max(8, size * 0.28),
        borderRadius: '50%',
        background: `var(--t-${status})`,
        border: '2px solid var(--t-panel)',
        animation: status === 'run' ? 'hf-pulse 1.4s ease-in-out infinite' : 'none',
      }
    : undefined;

  return (
    <div style={wrap}>
      <div style={tile}>{glyph}</div>
      {dot && <span style={dot} />}
    </div>
  );
}

interface HfPillProps {
  color?: string;
  children: ReactNode;
  dim?: boolean;
}

export function HfPill({ color = 'var(--t-accent)', children, dim }: HfPillProps) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 7px',
    borderRadius: 5,
    background: `color-mix(in oklab, ${color} ${dim ? 10 : 16}%, transparent)`,
    border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
    color,
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
  };
  return <span style={style}>{children}</span>;
}

interface HfDotProps {
  color?: string;
  pulse?: boolean;
  size?: number;
}

export function HfDot({ color = 'var(--t-fg-5)', pulse, size = 6 }: HfDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    display: 'inline-block',
    animation: pulse ? 'hf-pulse 1.4s ease-in-out infinite' : 'none',
  };
  return <span style={style} />;
}

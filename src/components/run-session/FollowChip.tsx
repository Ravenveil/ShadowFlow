/**
 * FollowChip — toolbar chip that shows whether the right-pane tabs are
 * auto-following the current run step ("实时跟随") or have been locked by
 * the user on a manually-selected tab ("返回跟随" CTA).
 *
 * Dimensions track design-spec run-session-v2.html `.follow-chip`:
 *   height 26px, padding 0 10px, rounded 6px, gap 7px
 *   ● accent dot (6px) with pulse animation in 'auto' mode
 *   ● gray dot (no animation) in 'locked' mode
 *
 * Tokens — no new colors are introduced. accent/border/fg-3/fg-5 come
 * from the existing --t-* theme tokens that already drive the dark + light
 * frames.
 *
 * Clicking the chip toggles between modes via onToggle:
 *   - 'auto'   → user wants to leave follow mode → onToggle() flips to 'locked'
 *   - 'locked' → user wants to resume following  → onToggle() flips to 'auto'
 */
export interface FollowChipProps {
  /** 'auto' = chip follows live step; 'locked' = chip parked by user. */
  mode: 'auto' | 'locked';
  /**
   * Human-readable label for the currently-followed step. Shown in the
   * native title (tooltip) so users hovering the chip can verify which
   * step they are tracking, e.g. "配置 Agent · reader · tools 4/8".
   */
  currentStepLabel?: string;
  /**
   * Fires when the chip is clicked. Parent should flip mode in response;
   * the chip itself is uncontrolled.
   */
  onToggle: () => void;
}

const DOT_SIZE = 6;

export function FollowChip({ mode, currentStepLabel, onToggle }: FollowChipProps) {
  const isAuto = mode === 'auto';
  const tooltip = isAuto
    ? `跟随中${currentStepLabel ? ` · ${currentStepLabel}` : ''}`
    : `已暂停跟随${currentStepLabel ? ` · ${currentStepLabel}` : ''}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      data-testid="run-session-follow-chip"
      data-mode={mode}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 26,
        padding: '0 10px',
        borderRadius: 6,
        background: isAuto ? 'var(--t-accent-tint)' : 'transparent',
        border: `1px solid ${isAuto ? 'var(--t-accent)' : 'var(--t-border)'}`,
        color: isAuto ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11.5,
        fontWeight: 500,
        lineHeight: 1,
        flexShrink: 0,
        transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: '50%',
          background: isAuto ? 'currentColor' : 'var(--t-fg-5)',
          flexShrink: 0,
          // sf-pulse is a globally-defined keyframe in src/index.css and is
          // reused here so the chip pulses in lockstep with other live
          // indicators (e.g. .sf-pill-live dot).
          animation: isAuto ? 'sf-pulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <span>{isAuto ? '实时跟随' : '返回跟随'}</span>
    </button>
  );
}

export default FollowChip;

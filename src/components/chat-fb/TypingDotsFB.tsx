/**
 * TypingDotsFB · "agent 正在思考…" 三点脉冲指示
 *
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 487-496 `.typing` / `.dots` / `.meta`
 *   - HTML: 行 1267-1272
 *
 * 用法：
 *   <TypingDotsFB agentName="审审" tokens={480} elapsedSec={3.2} />
 */

import styles from './chatFB.module.css';

export interface TypingDotsFBProps {
  /** Agent 显示名（默认 "Agent"）。 */
  agentName?: string;
  /** Agent 头像字（单字符），可选。 */
  agentGlyph?: string;
  /** Agent 头像主色（hex），可选。 */
  agentColor?: string;
  /** 已生成 token 数（meta 行），可选。 */
  tokens?: number;
  /** 已耗时（秒，meta 行），可选。 */
  elapsedSec?: number;
}

function initialOf(name: string | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const first = Array.from(t)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

export function TypingDotsFB({
  agentName,
  agentGlyph,
  agentColor,
  tokens,
  elapsedSec,
}: TypingDotsFBProps) {
  const letter = agentGlyph || initialOf(agentName);
  const showAv = agentName || agentGlyph;
  const metaBits: string[] = [];
  if (tokens != null) metaBits.push(`~${tokens} tokens`);
  if (elapsedSec != null) metaBits.push(`~${elapsedSec.toFixed(1)}s`);
  const meta = metaBits.join(' · ');

  return (
    <div className={styles.typing} role="status" aria-live="polite">
      {showAv && (
        <span
          className={styles.typingAv}
          style={
            agentColor
              ? {
                  background: `color-mix(in oklab, ${agentColor} 14%, var(--skin-panel))`,
                  borderColor: `color-mix(in oklab, ${agentColor} 35%, transparent)`,
                  color: agentColor,
                }
              : undefined
          }
        >
          {letter}
        </span>
      )}
      <span className={styles.typingNm}>
        {agentName ? `${agentName} 正在思考` : 'Agent 正在思考'}
      </span>
      <span className={styles.typingDots} aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {meta && <span className={styles.typingMeta}>{meta}</span>}
    </div>
  );
}

export default TypingDotsFB;

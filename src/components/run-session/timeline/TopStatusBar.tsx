/**
 * TopStatusBar — wall-clock + cost chip above the timeline pane.
 *
 * Mirrors v8 .app-bread + .app-pill + .app-run-meta (lines 1545-1547):
 *
 *   [构建中]   3m 42s · ¥0.012
 *
 * Cost (`cost_cny`) often isn't computed yet by the server; we placeholder
 * with `¥ —` rather than `¥0.000` so it's obvious the field is N/A.
 *
 * Wall-clock is derived from `startedAt` (ms epoch) — pure front-end ticker
 * at 1Hz, no server roundtrip needed. Resets when `runState` flips to
 * 'done'/'error' (final freezes on the last value).
 */
import { memo, useEffect, useState } from 'react';
import styles from './timeline.module.css';

interface Props {
  /** ms-epoch when the run started. If undefined, wall-clock shows `—`. */
  startedAt?: number;
  /** Visual status pill. */
  state: 'running' | 'done' | 'error';
  /** Final elapsed (ms) for done/error — overrides ticker when present. */
  finalElapsedMs?: number;
  /** Cost in CNY (sum across providers). undefined → `¥ —`. */
  costCny?: number;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function formatCost(cny: number | undefined): string {
  if (cny === undefined || cny === null || Number.isNaN(cny)) return '—';
  // < 0.01 still shows with 3 decimals (¥0.003 matters at scale)
  return cny.toFixed(3);
}

const STATE_LABEL: Record<Props['state'], string> = {
  running: '运行中',
  done: '已完成',
  error: '已中断',
};

const STATE_CLASS: Record<Props['state'], string> = {
  running: '',
  done: styles.topBarPillDone,
  error: styles.topBarPillErr,
};

export const TopStatusBar = memo(function TopStatusBar({
  startedAt,
  state,
  finalElapsedMs,
  costCny,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    // Only tick while running. Done/error → freeze on finalElapsedMs.
    if (state !== 'running') return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  let elapsedMs: number;
  if (state !== 'running' && typeof finalElapsedMs === 'number') {
    elapsedMs = finalElapsedMs;
  } else if (typeof startedAt === 'number') {
    elapsedMs = nowMs - startedAt;
  } else {
    elapsedMs = 0;
  }

  const elapsedStr = typeof startedAt === 'number' ? formatElapsed(elapsedMs) : '—';

  return (
    <div className={styles.topBar} role="status" aria-live="polite">
      <span className={`${styles.topBarPill} ${STATE_CLASS[state]}`}>
        {STATE_LABEL[state]}
      </span>
      <span className={styles.topBarMeta}>
        <b>{elapsedStr}</b>
        <span className={styles.topBarMetaSep}>·</span>
        ¥<b>{formatCost(costCny)}</b>
      </span>
      <span className={styles.topBarSpacer} />
    </div>
  );
});

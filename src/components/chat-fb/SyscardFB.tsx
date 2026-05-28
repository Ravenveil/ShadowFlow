/**
 * SyscardFB · feed 流内"系统决策事件卡"（Policy Matrix REJECT 等）
 *
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 330-339 `.syscard`
 *   - HTML: 行 1220-1231（POLICY MATRIX · REJECT 实例）
 *
 * 用法：
 *   <SyscardFB
 *     kind="policy-reject"
 *     title="POLICY MATRIX · REJECT"
 *     reason='阿批 → 小写 · reason "missing baseline data"'
 *     meta={{ rollback: 'draft.v2', retry: 'r2/3' }}
 *     timestamp={Date.now()}
 *   />
 */

import { Flag } from 'lucide-react';
import styles from './chatFB.module.css';

export type SyscardKind =
  | 'policy-reject'
  | 'policy-approve'
  | 'gate-fail'
  | 'gate-pass'
  | 'system-event';

export interface SyscardFBProps {
  kind: SyscardKind;
  /** 顶部 lab 文案（默认按 kind 推断）。 */
  title?: string;
  /** 卡片主消息体 — 可含换行。 */
  reason: string;
  /** 可选时间戳（ms 或 ISO 字符串），渲染为 hh:mm。 */
  timestamp?: number | string;
  /** key/value meta 行（mono 字体），如 `{ rollback: 'draft.v2' }`。 */
  meta?: Record<string, string>;
}

const KIND_LABEL: Record<SyscardKind, string> = {
  'policy-reject': 'POLICY MATRIX · REJECT',
  'policy-approve': 'POLICY MATRIX · APPROVE',
  'gate-fail': 'APPROVAL GATE · FAIL',
  'gate-pass': 'APPROVAL GATE · PASS',
  'system-event': 'SYSTEM EVENT',
};

/** REJECT/FAIL 用红，APPROVE/PASS 用绿，其它用中性。 */
function dotColorVar(kind: SyscardKind): string {
  if (kind === 'policy-approve' || kind === 'gate-pass') return 'var(--status-ok)';
  if (kind === 'policy-reject' || kind === 'gate-fail') return 'var(--status-reject)';
  return 'var(--fg-4)';
}

function fmtTs(ts: number | string | undefined): string {
  if (ts == null) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SyscardFB({ kind, title, reason, timestamp, meta }: SyscardFBProps) {
  const label = title ?? KIND_LABEL[kind];
  const ts = fmtTs(timestamp);

  return (
    <div className={styles.syscard}>
      <div className={styles.syscardBox} data-kind={kind}>
        <span
          className={styles.syscardDot}
          style={{ background: dotColorVar(kind) }}
        />
        <div className={styles.syscardCol}>
          <div className={styles.syscardTag} data-kind={kind}>
            <Flag size={10} strokeWidth={2.2} className={styles.syscardTagIcon} aria-hidden />
            {label}
          </div>
          <div className={styles.syscardBody}>
            {/* 主消息行 — 允许 \n 换行 */}
            {reason.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {meta && Object.keys(meta).length > 0 && (
              <div className={styles.syscardMetaRow}>
                {Object.entries(meta).map(([k, v]) => (
                  <span key={k} className={styles.syscardMetaKv}>
                    <span className={styles.syscardMetaK}>{k}</span>
                    <span className={styles.syscardMetaV}>{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {ts && <div className={styles.syscardTs}>{ts}</div>}
        </div>
      </div>
    </div>
  );
}

export default SyscardFB;

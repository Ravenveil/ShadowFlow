/**
 * InlineApprovalFB · feed 内嵌的 Approval Gate 卡（飞书风）
 *
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 461-484 `.gate-wrap` / `.gate` / `.tag` / `.row` / `.body` / `.kv` / `.ctas`
 *   - HTML: 行 1243-1265
 *
 * 注意：这是 feed 流内的"行内审批卡"；右侧 Thread Drawer 里的整体 Approval
 *      Panel 在 Stream G 的 ApprovalGatePanel 范畴，两者不同。
 *
 * 用法：
 *   <InlineApprovalFB
 *     gateId="gate-001"
 *     agentName="小写"
 *     agentGlyph="写"
 *     agentRole="WRITER · L3 · gate"
 *     title="重写 §6 完成"
 *     description="新增 RetroCorr 基线对比 + 联合消融表。请审审过目。"
 *     metrics={[
 *       { k: 'diff', v: '+142 / -38' },
 *       { k: 'tokens', v: '2.1k / 5k' },
 *       { k: 'retry', v: 'r2/3' },
 *     ]}
 *     choices={[
 *       { key: 'approve', label: '批准 · 进 Review', kind: 'approve' },
 *       { key: 'reject', label: '驳回 · 重写', kind: 'reject' },
 *       { key: 'diff', label: '看 diff', kind: 'edit' },
 *     ]}
 *     status="pending"
 *     waitText="等待 1m04s"
 *     onChoose={(key) => console.log(key)}
 *   />
 */

import { Check, X } from 'lucide-react';
import styles from './chatFB.module.css';

export type InlineApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface InlineApprovalChoice {
  key: string;
  label: string;
  kind: 'approve' | 'reject' | 'edit';
}

export interface InlineApprovalMetric {
  k: string;
  v: string;
}

export interface InlineApprovalFBProps {
  gateId: string;
  /** 等待审批的 agent 名（如 "小写"）。 */
  agentName?: string;
  /** Agent 头像字（单字符首选）。 */
  agentGlyph?: string;
  /** Agent 头像主色（hex，如 "#EF4444"）。 */
  agentColor?: string;
  /** Agent role 副标（如 "WRITER · L3 · gate"）。 */
  agentRole?: string;
  /** 卡片标题（hd 主标题，可选）。 */
  title?: string;
  /** 描述正文。 */
  description: string;
  /** 中间 kv 网格。 */
  metrics?: InlineApprovalMetric[];
  /** 待选择动作 list（pending 时显示按钮，否则只显示结果）。 */
  choices: InlineApprovalChoice[];
  /** 当前状态 — pending 显示按钮，approved/rejected 显示结果条。 */
  status: InlineApprovalStatus;
  /** 等待文案（如 "09:21 · 等待 1m04s"），仅 pending 时显示。 */
  waitText?: string;
  /** 用户选择回调（按下任意 choice）。 */
  onChoose?: (choiceKey: string) => void;
  /** 快捷键提示（默认 "Y / N · ⌘↵ 批准"）。 */
  kbdHint?: string;
}

function initialOf(name: string | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const first = Array.from(t)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

export function InlineApprovalFB({
  gateId,
  agentName,
  agentGlyph,
  agentColor = '#EF4444',
  agentRole,
  title,
  description,
  metrics,
  choices,
  status,
  waitText,
  onChoose,
  kbdHint = 'Y / N · ⌘↵ 批准',
}: InlineApprovalFBProps) {
  const letter = agentGlyph || initialOf(agentName);

  return (
    <div className={styles.gateWrap} data-gate-id={gateId} data-status={status}>
      <div className={styles.gate}>
        <div className={styles.gateTag}>⚑ APPROVAL GATE</div>

        <div className={styles.gateRow}>
          <span
            className={styles.gateAv}
            style={{
              background: `color-mix(in oklab, ${agentColor} 14%, var(--skin-panel))`,
              borderColor: `color-mix(in oklab, ${agentColor} 35%, transparent)`,
              color: agentColor,
            }}
          >
            {letter}
          </span>
          {agentName && <span className={styles.gateNm}>{agentName}</span>}
          {agentRole && <span className={styles.gateRole}>{agentRole}</span>}
          {status === 'pending' && waitText && (
            <span className={styles.gateWait}>{waitText}</span>
          )}
          {status === 'approved' && (
            <span className={styles.gateResultOk}>
              <Check size={11} strokeWidth={2.4} aria-hidden /> 已批准
            </span>
          )}
          {status === 'rejected' && (
            <span className={styles.gateResultReject}>
              <X size={11} strokeWidth={2.4} aria-hidden /> 已驳回
            </span>
          )}
        </div>

        {title && <div className={styles.gateTitle}>{title}</div>}
        <div className={styles.gateBody}>{description}</div>

        {metrics && metrics.length > 0 && (
          <div className={styles.gateKv}>
            {metrics.map((m, i) => (
              <div key={`${m.k}-${i}`} className={styles.gateKvCell}>
                <div className={styles.gateKvK}>{m.k}</div>
                <div className={styles.gateKvV}>{m.v}</div>
              </div>
            ))}
          </div>
        )}

        {status === 'pending' && (
          <div className={styles.gateCtas}>
            {choices.map(c => {
              const cls =
                c.kind === 'approve'
                  ? `${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`
                  : c.kind === 'reject'
                  ? `${styles.btn} ${styles.btnReject} ${styles.btnSm}`
                  : `${styles.btn} ${styles.btnGhost} ${styles.btnSm}`;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={cls}
                  onClick={() => onChoose?.(c.key)}
                  data-choice-kind={c.kind}
                >
                  {c.kind === 'approve' && (
                    <Check size={12} strokeWidth={2.4} aria-hidden />
                  )}
                  {c.kind === 'reject' && (
                    <X size={12} strokeWidth={2.4} aria-hidden />
                  )}
                  {c.label}
                </button>
              );
            })}
            <span className={styles.gateKbd}>{kbdHint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default InlineApprovalFB;

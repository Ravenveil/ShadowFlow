/**
 * PinnedBriefFB · 顶部 brief 置顶横幅（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 301-313（brief / pin / tag / pinned-by / body / more）
 *   - HTML: 行 1123-1138
 *
 * 用 cream 色作为次级条带，承载 run #/目标/SLA/预算/Gate 等元信息。
 */

import { Pin } from 'lucide-react';
import styles from './chatFB.module.css';

interface GroupLike {
  id: string;
  name: string;
  status?: string;
  metrics?: {
    members?: number;
    activeRuns?: number;
  };
}

export interface PinnedBriefFBProps {
  group?: GroupLike;
  /** 谁置顶 + 何时（设计稿用 "由 张明 置顶 · 09:14"） */
  pinnedBy?: string;
  pinnedAt?: string;
  /** 目标 / SLA / 预算 / Gate 字段，传啥显啥；不传走 fallback */
  goal?: string;
  sla?: string;
  budget?: string;
  gate?: string;
  /** 展开按钮回调 */
  onExpand?: () => void;
  /** i18n 翻译函数，可选 */
  t?: (k: string, opts?: Record<string, unknown>) => string;
}

export default function PinnedBriefFB({
  group,
  pinnedBy,
  pinnedAt,
  goal,
  sla,
  budget,
  gate,
  onExpand,
  t,
}: PinnedBriefFBProps) {
  if (!group) return null;

  // 注意：useI18n.t() 在 key 不存在时会原样返回 key（含点号字符串），
  // 因此用 "包含 . 的返回值 = 未命中" 启发式来回退到中文 fallback。
  const tr = (k: string, fb: string) => {
    if (!t) return fb;
    const v = t(k);
    return v && v !== k ? v : fb;
  };
  const runCount = group.metrics?.activeRuns ?? 0;
  const runTag = runCount > 0 ? `#${String(runCount).padStart(3, '0')}` : '#---';

  // fallback 文案对齐设计稿
  const goalText = goal ?? `${group.name} · ${tr('chat.brief.goalDefault', '深读 arXiv:2410.11215，找出方法/实验中的不一致')}`;
  const slaText = sla ?? '30min';
  const budgetText = budget ?? '5k tokens';
  const gateText = gate ?? 'CRITIC → REVIEW';
  const pinnedByText = pinnedBy
    ? `由 ${pinnedBy} 置顶${pinnedAt ? ` · ${pinnedAt}` : ''}`
    : tr('chat.brief.pinned', '· 置顶');

  return (
    <div className={styles.brief}>
      <Pin
        className={styles.briefPin}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span className={styles.briefTag}>
            BRIEF · run {runTag}
          </span>
          <span className={styles.briefPinnedBy}>{pinnedByText}</span>
        </div>
        <div className={styles.briefBody}>
          <b>{tr('chat.brief.goal', '目标')}</b> {goalText} ·
          <b>{tr('chat.brief.sla', 'SLA')}</b> {slaText} ·
          <b>{tr('chat.brief.budget', '预算')}</b> {budgetText} ·
          <b>{tr('chat.brief.gate', 'Gate')}</b> {gateText}
        </div>
      </div>
      <button
        type="button"
        className={styles.briefMore}
        onClick={onExpand}
      >
        {tr('chat.brief.expand', '展开 ▾')}
      </button>
    </div>
  );
}

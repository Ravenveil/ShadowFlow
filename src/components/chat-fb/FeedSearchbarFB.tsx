/**
 * FeedSearchbarFB · feed 顶部 inline 搜索条（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 555-596（.searchbar / .sb-inner / .sb-row / .sb-input / .sb-chips）
 *   - HTML: 行 1098-1121
 *
 * 行为：
 *   - open=true 展开（max-height 96px），false 折叠（max-height 0）
 *   - 搜索 input + 5 个 filter chip：来自 agent / 含文件 / 含 issue / 仅本 run #042 / 今天
 *   - chip active 态 = accent-tint 底
 *
 * 仅 UI 层；onChange 由父组件本地 setState；
 * TODO(Stream H): 接 backend 真正的 search API（grep group/run/agent/file/issue）。
 */

import { Search, X } from 'lucide-react';
import styles from './chatFB.module.css';

export type FeedSearchFilterKey =
  | 'fromAgent'
  | 'withFile'
  | 'withIssue'
  | 'thisRun'
  | 'today';

export interface FeedSearchbarFBProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  /** 已激活的 filter key 列表 */
  filters: FeedSearchFilterKey[];
  onToggleFilter: (key: FeedSearchFilterKey) => void;
  /** 用于"仅本 run #xxx"chip 文案；不传则显示通用"仅本 run" */
  runId?: string;
  /** 命中数；不传不显示 */
  hitCount?: number;
}

const CHIP_DEFS: Array<{ key: FeedSearchFilterKey; label: string }> = [
  { key: 'fromAgent', label: '来自 agent' },
  { key: 'withFile', label: '含文件' },
  { key: 'withIssue', label: '含 issue' },
  { key: 'thisRun', label: '仅本 run' },
  { key: 'today', label: '今天' },
];

export function FeedSearchbarFB({
  open,
  onClose,
  value,
  onChange,
  filters,
  onToggleFilter,
  runId,
  hitCount,
}: FeedSearchbarFBProps) {
  return (
    <div className={`${styles.searchbar} ${open ? styles.searchbarOpen : ''}`}>
      <div className={styles.sbInner}>
        <div className={styles.sbRow}>
          <div className={styles.sbInput}>
            <Search size={13} strokeWidth={1.6} />
            <input
              type="text"
              placeholder="在本群内搜索 · 关键字 / @人 / 文件 / issue"
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onClose();
              }}
              autoFocus={open}
              aria-label="搜索"
            />
            <span className={styles.sbCount}>
              <span className={styles.sbNum}>
                {typeof hitCount === 'number' ? `${hitCount} 条命中` : '0 条命中'}
              </span>
              <span className={styles.sbNav}>
                <span className={styles.sbKbd}>↑</span>
                <span className={styles.sbKbd}>↓</span>
                跳转
              </span>
              · <span className={styles.sbKbd}>Esc</span> 关闭
            </span>
          </div>
          <button
            type="button"
            className={styles.sbClose}
            onClick={onClose}
            title="关闭搜索"
            aria-label="关闭搜索"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
        <div className={styles.sbChips}>
          {CHIP_DEFS.map(c => {
            const active = filters.includes(c.key);
            const label =
              c.key === 'thisRun' && runId ? `仅本 run #${runId}` : c.label;
            return (
              <button
                key={c.key}
                type="button"
                className={`${styles.sbChip} ${active ? styles.sbChipOn : ''}`}
                onClick={() => onToggleFilter(c.key)}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FeedSearchbarFB;

/**
 * NeoDeliveryCard — WorkBuddy 式「交付卡」（2026-08-23 交付收口）。
 *
 * run 跑完后在群消息流尾部汇总本轮交付：
 *   - 最终产物列表：从该轮 gateway run 的 TimelineMessage 里收集真实产物
 *     （artifact_card 的 filename/url、commit_record 的变更文件、file_diff
 *     的路径）——与 artifact-lineage 同一真相源（worktree 提交证据），
 *     无产物 → 调用方不挂载（禁止 mock 假数据）；
 *   - 一句话总结：本轮最后一条 agent 回复首行（截断）；
 *   - 「查看产物」跳转：产物自带可服务 url 时才出链接（无 url 不伪造）。
 *
 * collectDeliverables / summarizeText 为纯函数，便于单测。
 */
import { PackageCheck } from 'lucide-react';
import type { TimelineMessage } from '../components/run-session/timeline/types';
import { useI18n } from '../common/i18n';

export interface DeliveryItem {
  /** 展示名（文件名 / 路径）。 */
  label: string;
  /** 可服务 url（artifact_card.url）；无则 undefined，不伪造链接。 */
  url?: string;
}

/** 产物列表展示上限（超出折叠为 +N，避免长清单刷屏）。 */
export const DELIVERY_MAX_ITEMS = 8;

/**
 * 从一轮 run 的过程卡里收集最终产物（ts 升序去重，先到先得）。
 * 只认三类真产物卡：artifact_card / commit_record.files / file_diff.path。
 */
export function collectDeliverables(messages: readonly TimelineMessage[]): DeliveryItem[] {
  const seen = new Set<string>();
  const out: DeliveryItem[] = [];
  const push = (label: string, url?: string) => {
    const key = label.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ label: key, ...(url ? { url } : {}) });
  };
  for (const m of messages) {
    if (m.kind === 'artifact_card') {
      push(m.title?.trim() || m.filename, m.url);
    } else if (m.kind === 'commit_record') {
      for (const f of m.files ?? []) push(f.path);
    } else if (m.kind === 'file_diff') {
      push(m.path);
    }
  }
  return out;
}

/** 一句话总结：取首行、压空白、截断（默认 80 字）。空输入 → ''。 */
export function summarizeText(text: string, max = 80): string {
  const first = (text.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!first) return '';
  return first.length > max ? `${first.slice(0, max)}…` : first;
}

export function NeoDeliveryCard({
  items,
  summary,
}: {
  items: DeliveryItem[];
  summary?: string;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null; // 防御：调用方已保证，双保险不渲染空卡
  const shown = items.slice(0, DELIVERY_MAX_ITEMS);
  const overflow = items.length - shown.length;
  const viewAllHref = items.find((i) => i.url)?.url;

  return (
    <div className="neo-gc-delivery" data-testid="neo-gc-delivery">
      <div className="neo-gc-delivery-head">
        <PackageCheck size={13} strokeWidth={1.9} aria-hidden />
        <span>{t('neo.group.deliveryTitle', { defaultValue: '交付汇总' })}</span>
        <span className="neo-gc-delivery-count">
          {t('neo.group.deliveryCount', { defaultValue: '{{count}} 项产物', count: items.length })}
        </span>
      </div>
      {summary && <div className="neo-gc-delivery-summary">{summary}</div>}
      <ul className="neo-gc-delivery-list">
        {shown.map((item) => (
          <li key={item.label} className="neo-gc-delivery-item">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
        {overflow > 0 && (
          <li className="neo-gc-delivery-item neo-gc-delivery-more" aria-hidden>
            +{overflow}
          </li>
        )}
      </ul>
      {viewAllHref && (
        <a
          className="neo-gc-delivery-view"
          href={viewAllHref}
          target="_blank"
          rel="noreferrer"
        >
          {t('neo.group.deliveryView', { defaultValue: '查看产物' })}
        </a>
      )}
    </div>
  );
}

export default NeoDeliveryCard;

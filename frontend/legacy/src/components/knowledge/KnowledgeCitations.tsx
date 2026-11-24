/**
 * KnowledgeCitations — 单聊消息底部的知识库引用列表（2026-11-06 重做）。
 *
 * 数据源换多模态记忆库：父组件在发送带知识库（composer KNOWLEDGE chip 勾选的
 * 记忆库 packIds）的消息时把 {packIds, query} 传下来；本组件对每个 pack 调
 * POST /api/memory-bank/packs/{id}/query，把命中（text/source/score）聚合成
 * 一张引用卡渲染在消息流底部。同一命中的内容由服务端在 run 组装提示词时注入
 * 「知识库参考」块（Agent 真正用上），本卡负责让用户看见用了什么。
 *
 * 降级契约（与后端一致）：零命中 → 显示「无命中引用」；
 * 查询异常 → 卡片内一行错误提示（暴露不掩盖），不炸消息流。
 */

import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { queryPack, type MemoryBankHit } from '../../api/memoryBank';
import { useI18n } from '../../common/i18n';

export interface KnowledgeCitationsProps {
  /** composer 选中的记忆库 pack id 列表。 */
  packIds: string[];
  /** 用户本轮消息文本（作为检索 query）。 */
  query: string;
}

const TOP_K = 5;

export function KnowledgeCitations({ packIds, query }: KnowledgeCitationsProps) {
  const { t } = useI18n();
  const [hits, setHits] = useState<MemoryBankHit[] | null>(null);
  const [ragBackend, setRagBackend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (packIds.length === 0 || !query.trim()) return;
    let cancelled = false;
    setHits(null);
    setRagBackend(null);
    setError(null);
    Promise.all(packIds.map((id) => queryPack(id, { query, top_k: TOP_K })))
      .then((rs) => {
        if (cancelled) return;
        setHits(rs.flatMap((r) => r.data.hits));
        const backend = rs.map((r) => r.meta?.rag_backend).find((b) => typeof b === 'string' && b);
        setRagBackend(typeof backend === 'string' ? backend : null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [packIds, query]);

  if (packIds.length === 0) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-sm"
      style={{
        border: '1px solid var(--t-border)',
        background: 'var(--t-bg-2, transparent)',
      }}
      data-testid="knowledge-citations"
    >
      <div
        className="flex items-center gap-1.5 text-xs"
        style={{ color: 'var(--t-fg-3)' }}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('knowledge.citations.title', { defaultValue: '知识库引用' })}
        {ragBackend && (
          <span
            className="rounded px-1 py-0.5"
            style={{ border: '1px solid var(--t-border)', fontSize: 10 }}
            data-testid="knowledge-citations-backend"
            title={t('knowledge.citations.backend', { defaultValue: '检索后端' })}
          >
            {ragBackend}
          </span>
        )}
        {hits === null && !error && (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        )}
      </div>
      {error && (
        <div className="text-xs mt-1" style={{ color: 'var(--t-err, #ef4444)' }}>
          {t('knowledge.citations.failed', { defaultValue: '检索失败' })}：{error}
        </div>
      )}
      {hits !== null && hits.length === 0 && !error && (
        <div className="text-xs mt-1" style={{ color: 'var(--t-fg-3)' }}>
          {t('knowledge.citations.empty', { defaultValue: '无命中引用' })}
        </div>
      )}
      {hits !== null && hits.length > 0 && (
        <ul className="mt-1 space-y-1">
          {hits.map((h, i) => (
            <li key={i} className="text-xs leading-snug" data-testid="knowledge-citation-hit">
              <span style={{ color: 'var(--t-fg)' }}>{h.text}</span>
              <span
                className="ml-2 inline-block max-w-[14rem] truncate align-bottom"
                style={{ color: 'var(--t-fg-3)' }}
                title={h.citation ? `${h.citation} · ${h.source}` : h.source}
                data-testid="knowledge-citation-meta"
              >
                — {h.source} · {h.score.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

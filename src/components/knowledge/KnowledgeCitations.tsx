/**
 * KnowledgeCitations — 单聊消息底部的知识库引用列表（L5/L1 RAG 查询引用展示）。
 *
 * 挂载方式：父组件在发送带知识库（composer KNOWLEDGE chip 选中的 packIds）的
 * 消息时，把 {packIds, query} 传下来；本组件对每个 pack 调
 * POST /api/knowledge/packs/{id}/query，把命中（text/source/score）聚合成
 * 一张引用卡渲染在消息流底部。层级检索（hier）命中额外带 path（doc > chapter
 * 层级来源）与 trace（定位路径），分别以面包屑与「检索调试」折叠区展示。
 *
 * 降级契约（与后端一致）：未配置 LightRAG / 无命中 → 空 hits → 不渲染卡片；
 * 查询异常 → 卡片内一行错误提示（暴露不掩盖），不炸消息流。
 */

import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { queryPack } from '../../api/knowledge';
import type { KnowledgeHit, KnowledgeQueryTrace } from '../../common/types/knowledge';
import { useI18n } from '../../common/i18n';

export interface KnowledgeCitationsProps {
  /** composer 选中的知识库 pack id 列表。 */
  packIds: string[];
  /** 用户本轮消息文本（作为检索 query）。 */
  query: string;
}

export function KnowledgeCitations({ packIds, query }: KnowledgeCitationsProps) {
  const { t } = useI18n();
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const [traces, setTraces] = useState<Array<{ packId: string; trace: KnowledgeQueryTrace }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (packIds.length === 0 || !query.trim()) return;
    let cancelled = false;
    setHits(null);
    setTraces([]);
    setError(null);
    Promise.all(packIds.map((id) => queryPack(id, query)))
      .then((rs) => {
        if (cancelled) return;
        setHits(rs.flatMap((r) => r.data.hits));
        setTraces(
          rs.flatMap((r, i) => (r.data.trace ? [{ packId: packIds[i], trace: r.data.trace }] : [])),
        );
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
                title={h.path ? `${h.path} · ${h.source}` : h.source}
                data-testid="knowledge-citation-meta"
              >
                — {h.source} · {h.score.toFixed(2)}
              </span>
              {h.path && (
                <span
                  className="ml-2 inline-block max-w-[16rem] truncate align-bottom"
                  style={{ color: 'var(--t-fg-3)' }}
                  title={h.path}
                  data-testid="knowledge-citation-path"
                >
                  {h.path}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {traces.length > 0 && (
        <details className="mt-1 text-xs" data-testid="knowledge-citations-debug">
          <summary className="cursor-pointer select-none" style={{ color: 'var(--t-fg-3)' }}>
            {t('knowledge.citations.debug', { defaultValue: '检索调试' })}
          </summary>
          <ul className="mt-1 space-y-1" style={{ color: 'var(--t-fg-3)' }}>
            {traces.map(({ packId, trace }) => (
              <li key={packId} data-testid="knowledge-citations-trace">
                <span>
                  {packId.slice(0, 8)} · strategy={trace.strategy}
                  {trace.reason ? ` · ${trace.reason}` : ''}
                  {trace.candidate_chunks !== undefined
                    ? ` · candidates=${trace.candidate_chunks}`
                    : ''}
                </span>
                {(trace.located ?? []).map((n) => (
                  <div
                    key={n.node_id}
                    className="ml-3 truncate"
                    title={n.path}
                    data-testid="knowledge-citations-trace-node"
                  >
                    ↳ {n.path} · {n.score}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

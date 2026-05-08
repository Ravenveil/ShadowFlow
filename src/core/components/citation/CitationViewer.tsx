/**
 * CitationViewer — Story 9.2 AC5
 *
 * 显示一次 run 的所有引用 trace。可内嵌在：
 *   - TraceView（Epic 4.4 节点详情）
 *   - BriefBoard 摘要卡片
 *   - 未来的 Report 导出视图
 *
 * 自动调 GET /citations/{run_id}（可选 node_id 过滤），不持有真源——
 * 父级控制 runId / nodeId 即可触发刷新。
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from '../../../common/icons/iconRegistry';
import { CitationApiError, getCitations } from '../../../api/citations';
import type { CitationTrace } from '../../../common/types/citation';

export interface CitationViewerProps {
  runId: string;
  /** Optional node_id filter. When set only traces for that node are shown. */
  nodeId?: string;
  /**
   * Initial collapsed state for the trace list. Header summary is always visible.
   * Default: collapsed.
   */
  defaultExpanded?: boolean;
}

interface State {
  loading: boolean;
  traces: CitationTrace[];
  citationMissing: boolean;
  error: string | null;
}

const INITIAL_STATE: State = {
  loading: false,
  traces: [],
  citationMissing: false,
  error: null,
};

function _confidenceColor(conf: number): string {
  // 0.0 → red-ish, 0.5 → amber, 1.0 → green
  const safe = Math.max(0, Math.min(1, conf));
  const hue = Math.round(safe * 120); // 0=red, 120=green
  return `hsl(${hue}, 65%, 45%)`;
}

export default function CitationViewer({
  runId,
  nodeId,
  defaultExpanded = false,
}: CitationViewerProps) {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

  const refresh = useCallback(async () => {
    if (!runId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getCitations(runId, nodeId ? { node_id: nodeId } : {});
      setState({
        loading: false,
        traces: res.data.traces,
        citationMissing: Boolean(res.data.citation_missing),
        error: null,
      });
    } catch (err) {
      const code = err instanceof CitationApiError ? err.code : 'UNKNOWN';
      // CITATION_NOT_FOUND just means the run has no trace file — show empty.
      if (code === 'CITATION_NOT_FOUND') {
        setState({
          loading: false,
          traces: [],
          citationMissing: false,
          error: null,
        });
        return;
      }
      setState({
        loading: false,
        traces: [],
        citationMissing: false,
        error: code,
      });
    }
  }, [runId, nodeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summaryLabel: React.ReactNode =
    state.traces.length === 0
      ? state.citationMissing
        ? <span className="inline-flex items-center gap-1.5"><AlertTriangle size={12} strokeWidth={2} /> 缺少引用</span>
        : '无引用'
      : `引用自 ${state.traces.length} 个来源`;

  return (
    <section className="sf-citation-viewer" aria-label="citation-viewer">
      <header
        className="sf-citation-viewer__header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: state.traces.length > 0 ? 'pointer' : 'default',
          padding: '8px 0',
          fontWeight: 600,
        }}
      >
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        <span>{summaryLabel}</span>
        {state.citationMissing && (
          <span
            className="sf-citation-viewer__badge"
            data-testid="citation-missing-badge"
            style={{
              background: 'color-mix(in oklab, var(--t-warn) 18%, var(--t-panel))',
              color: 'var(--t-warn)',
              borderRadius: 12,
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            citation_missing
          </span>
        )}
        {state.loading && (
          <span style={{ color: 'var(--t-fg-3)', fontSize: 12 }}>加载中…</span>
        )}
        {state.error && (
          <span style={{ color: 'var(--t-err)', fontSize: 12 }}>
            加载失败：{state.error}
          </span>
        )}
      </header>

      {expanded && state.traces.length > 0 && (
        <ul
          className="sf-citation-viewer__list"
          style={{ listStyle: 'none', padding: 0, margin: 0 }}
          data-testid="citation-trace-list"
        >
          {state.traces.map((t) => (
            <li
              key={t.trace_id}
              className="sf-citation-viewer__item"
              style={{
                padding: 8,
                borderTop: '1px solid var(--t-panel)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: 'var(--t-fg-4)', marginRight: 6 }}>
                  pack:
                </span>
                <code style={{ marginRight: 12 }}>{t.pack_id}</code>
                <span style={{ color: 'var(--t-fg-4)', marginRight: 6 }}>
                  source:
                </span>
                <code>{t.source_id}</code>
              </div>
              <blockquote
                style={{
                  margin: '4px 0',
                  paddingLeft: 8,
                  borderLeft: '3px solid var(--t-accent)',
                  color: 'var(--t-fg)',
                }}
              >
                {t.excerpt || '<空摘要>'}
              </blockquote>
              <div style={{ display: 'flex', gap: 12, color: 'var(--t-fg-4)', fontSize: 12 }}>
                <span
                  data-testid="citation-confidence"
                  style={{ color: _confidenceColor(t.confidence) }}
                >
                  confidence: {Math.round(t.confidence * 100)}%
                </span>
                <span>chunk: {t.chunk_id}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

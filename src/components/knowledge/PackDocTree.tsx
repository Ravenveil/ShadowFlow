/**
 * PackDocTree — 知识包「文档树」浏览区块（层级检索 hier_index 的可视化）。
 *
 * 拉 GET /api/knowledge/packs/{id}/index（tree_view：文档→章节→页面，chunk
 * 正文已被后端剥离），渲染可展开/折叠的树。index 响应没有 chunk 内容字段，
 * 故点击叶子节点只展示节点元信息（kind / level / 关联 chunk 序号），不编数据。
 *
 * 降级契约：documents 为空 → 干净空态；请求失败 → 一行错误提示（暴露不掩盖）。
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree, Loader2 } from 'lucide-react';
import { getPackIndex } from '../../api/knowledge';
import type { KnowledgeIndexDocument, KnowledgeIndexNode } from '../../api/knowledge';
import { useI18n } from '../../common/i18n';

export interface PackDocTreeProps {
  packId: string;
}

interface IndexStats {
  documents: number;
  nodes: number;
  chunks: number;
}

/** 连续 chunk 序号压缩成区间："0-2, 4"（元信息展示用，序号多时不刷屏）。 */
function compressIndexes(idxs: number[]): string {
  const sorted = [...idxs].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function PackDocTree({ packId }: PackDocTreeProps) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<KnowledgeIndexDocument[] | null>(null);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocuments(null);
    setStats(null);
    setError(null);
    setCollapsed(new Set());
    setSelectedId(null);
    getPackIndex(packId)
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.data.documents);
        setStats(res.data.stats);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  // 选中节点的元信息（叶子或任意节点均可；index 无 chunk 正文，只给结构信息）
  const selectedNode = useMemo(() => {
    if (!selectedId || !documents) return null;
    const find = (node: KnowledgeIndexNode): KnowledgeIndexNode | null => {
      if (node.node_id === selectedId) return node;
      for (const child of node.children) {
        const hit = find(child);
        if (hit) return hit;
      }
      return null;
    };
    for (const doc of documents) {
      const hit = find(doc.tree);
      if (hit) return hit;
    }
    return null;
  }, [selectedId, documents]);

  const toggle = (nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNode = (node: KnowledgeIndexNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.node_id);
    const isSelected = selectedId === node.node_id;
    return (
      <div key={node.node_id}>
        <button
          type="button"
          data-testid={`doc-tree-node-${node.node_id}`}
          className={`neo-kv-dt-row${isSelected ? ' neo-kv-dt-row--active' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 6}px` }}
          onClick={() => {
            setSelectedId(node.node_id);
            if (hasChildren) toggle(node.node_id);
          }}
          title={node.title}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight size={12} className="neo-kv-dt-chevron" />
            ) : (
              <ChevronDown size={12} className="neo-kv-dt-chevron" />
            )
          ) : (
            <span className="neo-kv-dt-chevron neo-kv-dt-chevron--leaf" />
          )}
          <span className="neo-kv-dt-title">{node.title}</span>
          <span className="neo-kv-dt-kind">{node.kind}</span>
          <span className="neo-kv-dt-count">{node.chunk_indexes.length} chunks</span>
        </button>
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div data-testid="pack-doc-tree" className="neo-kv-doctree">
      <div className="neo-kv-pd-section-label">
        {t('neo.knowledge.docTree.title', { defaultValue: '文档树' })}
        {stats && (
          <span className="neo-kv-dt-stats" data-testid="doc-tree-stats">
            {stats.documents} 文档 · {stats.nodes} 节点 · {stats.chunks} chunks
          </span>
        )}
      </div>

      {documents === null && !error && (
        <div className="neo-kv-hint" data-testid="doc-tree-loading">
          <Loader2 size={12} className="animate-spin" />{' '}
          {t('neo.knowledge.docTree.loading', { defaultValue: '索引加载中…' })}
        </div>
      )}

      {error && (
        <div className="neo-kv-hint neo-kv-dt-error" role="alert" data-testid="doc-tree-error">
          {t('neo.knowledge.docTree.error', { defaultValue: '文档树加载失败' })}：{error}
        </div>
      )}

      {documents !== null && documents.length === 0 && !error && (
        <div className="neo-kv-hint" data-testid="doc-tree-empty">
          <ListTree size={13} />{' '}
          {t('neo.knowledge.docTree.empty', { defaultValue: '还没有可浏览的文档树' })}
        </div>
      )}

      {documents !== null &&
        documents.map((doc) => (
          <div key={doc.doc_id} data-testid={`doc-tree-doc-${doc.doc_id}`}>
            {renderNode(doc.tree, 0)}
          </div>
        ))}

      {selectedNode && (
        <div className="neo-kv-dt-meta" data-testid="doc-tree-meta">
          <span className="neo-kv-dt-meta-title">{selectedNode.title}</span>
          <span>
            {selectedNode.node_id} · kind={selectedNode.kind} · level={selectedNode.level}
          </span>
          {selectedNode.chunk_indexes.length > 0 && (
            <span data-testid="doc-tree-meta-chunks">
              chunks: {compressIndexes(selectedNode.chunk_indexes)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

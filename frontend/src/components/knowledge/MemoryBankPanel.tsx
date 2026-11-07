/**
 * MemoryBankPanel — 多模态记忆库「包详情」面板（PR #7 设计移植，2026-11-06；
 * 2026-11-07 知识库统一批改为受控详情面板）。
 *
 * 统一后的知识库唯一实现：/api/memory-bank（Python memory_bank.py）。
 * 包列表 / 建包 / 导入本地文件夹在 KnowledgePage（neo-kv-rail + 添加菜单）；
 * 本面板只负责单个知识包的详情：上传文件（multipart）→ 来源列表 → 文本检索
 * → 删除来源/删除包。KnowledgePage 以 `key` 重挂载或 `reloadKey` 触发来源刷新。
 *
 * 后端：未注入 Embedder 时退化为 BM25 关键词检索
 * （meta.rag_backend = 'keyword+structure'）。弹窗一律用 NeoConfirmModal。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Loader2, Search, Trash2 } from 'lucide-react';
import {
  MemoryBankApiError,
  deletePack,
  deleteSource,
  ingestFile,
  listSources,
  queryPack,
} from '../../api/memoryBank';
import type { MemoryBankHit, MemoryBankSource } from '../../api/memoryBank';
import { NeoConfirmModal } from '../../neo/NeoConfirmModal';
import './memory-bank.css';

type Busy = null | 'upload' | 'query' | 'delete';

/** 删除目标：来源（NeoConfirmModal 二次确认）或整包。 */
type DeleteTarget =
  | { kind: 'pack'; id: string; name: string }
  | { kind: 'source'; id: string; name: string }
  | null;

export interface MemoryBankPanelProps {
  /** 当前选中的知识包（KnowledgePage 左栏下发）。 */
  packId: string | null;
  /** 包名（头部展示；为空时显示 packId）。 */
  packName?: string;
  /** 递增触发来源列表刷新（KnowledgePage 目录导入等批量摄入后调用）。 */
  reloadKey?: number;
  /** 整包删除完成后回调（KnowledgePage 同步左栏列表）。 */
  onPackDeleted?: () => void;
}

export default function MemoryBankPanel({
  packId,
  packName,
  reloadKey = 0,
  onPackDeleted,
}: MemoryBankPanelProps) {
  const [sources, setSources] = useState<MemoryBankSource[]>([]);
  const [hits, setHits] = useState<MemoryBankHit[] | null>(null);
  const [ragBackend, setRagBackend] = useState<string>('');
  const [queryText, setQueryText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshSources = useCallback(async (id: string) => {
    try {
      const res = await listSources(id);
      setSources(res.data.sources);
    } catch {
      setSources([]);
    }
  }, []);

  useEffect(() => {
    setSources([]);
    setHits(null);
    setError('');
    if (packId) void refreshSources(packId);
  }, [packId, reloadKey, refreshSources]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !packId || busy) return;
    setBusy('upload');
    setError('');
    try {
      for (const f of Array.from(files)) {
        await ingestFile(packId, f);
      }
      await refreshSources(packId);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `上传失败：${e.code || e.status}` : '上传失败');
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleQuery = async () => {
    const q = queryText.trim();
    if (!q || !packId || busy) return;
    setBusy('query');
    setError('');
    try {
      const res = await queryPack(packId, { query: q, top_k: 5 });
      setHits(res.data.hits);
      setRagBackend(res.meta.rag_backend ?? '');
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `检索失败：${e.code || e.status}` : '检索失败');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy('delete');
    setError('');
    try {
      if (deleteTarget.kind === 'pack') {
        await deletePack(deleteTarget.id);
        setDeleteTarget(null);
        onPackDeleted?.();
        return;
      }
      if (packId) {
        await deleteSource(packId, deleteTarget.id);
        await refreshSources(packId);
      }
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `删除失败：${e.code || e.status}` : '删除失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mbk mbk--detail" data-testid="memory-bank-panel">
      <section className="mbk-main">
        {!packId ? (
          <div className="mbk-empty" data-testid="mbk-empty">
            <p className="mbk-empty-t1">选择或创建一个知识包</p>
            <p className="mbk-empty-t2">
              上传文件或导入本地文件夹，建立可检索的多模态记忆库（支持 TXT/MD/CSV/JSON/HTML/XLSX/DOCX/PDF/图片）。
            </p>
          </div>
        ) : (
          <>
            <div className="mbk-detail-head">
              <span className="mbk-detail-title" data-testid="mbk-pack-title">
                {packName || packId}
              </span>
              <button
                data-testid="mbk-delete-pack"
                onClick={() =>
                  setDeleteTarget({ kind: 'pack', id: packId, name: packName || packId })
                }
                className="mbk-btn mbk-btn--danger"
              >
                <Trash2 size={13} /> 删除知识包
              </button>
            </div>

            <div className="mbk-toolbar">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => void handleUpload(e.target.files)}
                className="mbk-file"
                aria-label="上传文件到记忆库"
                data-testid="mbk-file-input"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy === 'upload'}
                className="mbk-btn"
                data-testid="mbk-upload-btn"
              >
                {busy === 'upload' ? <Loader2 size={13} className="mbk-spin" /> : <FileUp size={13} />}
                上传文件
              </button>
              <div className="mbk-queryrow">
                <input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleQuery();
                  }}
                  placeholder="检索记忆库…"
                  aria-label="检索记忆库"
                  className="mbk-input mbk-input--query"
                />
                <button
                  onClick={() => void handleQuery()}
                  disabled={busy === 'query' || !queryText.trim()}
                  className="mbk-btn mbk-btn--primary"
                  data-testid="mbk-query-btn"
                >
                  {busy === 'query' ? <Loader2 size={13} className="mbk-spin" /> : <Search size={13} />}
                  检索
                </button>
              </div>
              {ragBackend && <span className="mbk-backend">{ragBackend}</span>}
            </div>

            {error && (
              <div role="alert" className="mbk-error">
                {error}
              </div>
            )}

            <div className="mbk-cols">
              <div className="mbk-sources" data-testid="mbk-sources">
                <p className="mbk-coltitle">来源（{sources.length}）</p>
                {sources.map((s) => (
                  <div key={s.source_id} className="mbk-srcrow" data-testid={`mbk-source-${s.source_id}`}>
                    <span className="mbk-srcrow-name" title={s.filename}>
                      {s.filename}
                    </span>
                    <span className={`mbk-pill mbk-pill--${s.status ?? 'done'}`}>{s.status ?? 'done'}</span>
                    {s.version !== undefined && s.version > 1 && (
                      <span className="mbk-pill mbk-pill--ver">v{s.version}</span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`删除来源 ${s.filename}`}
                      className="mbk-srcrow-del"
                      onClick={() => setDeleteTarget({ kind: 'source', id: s.source_id, name: s.filename })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setDeleteTarget({ kind: 'source', id: s.source_id, name: s.filename });
                      }}
                    >
                      <Trash2 size={12} />
                    </span>
                  </div>
                ))}
                {sources.length === 0 && <p className="mbk-hint">还没有来源，点「上传文件」或「导入本地文件夹」。</p>}
              </div>

              <div className="mbk-results" data-testid="mbk-results">
                <p className="mbk-coltitle">检索结果{hits ? `（${hits.length}）` : ''}</p>
                {hits?.map((h, i) => (
                  <div key={i} className="mbk-hit" data-testid={`mbk-hit-${i}`}>
                    <div className="mbk-hit-head">
                      <span className="mbk-hit-src" title={h.citation ?? h.source}>
                        {h.source}
                      </span>
                      <span className="mbk-pill mbk-pill--kind">{h.kind ?? 'text'}</span>
                      <span className="mbk-hit-score">score {h.score.toFixed(3)}</span>
                    </div>
                    <p className="mbk-hit-text">{h.text}</p>
                    {h.retrieval_channels && h.retrieval_channels.length > 0 && (
                      <p className="mbk-hit-chan">{h.retrieval_channels.join(' · ')}</p>
                    )}
                  </div>
                ))}
                {hits !== null && hits.length === 0 && <p className="mbk-hint">没有命中，换个说法试试。</p>}
              </div>
            </div>
          </>
        )}
      </section>

      {deleteTarget && (
        <NeoConfirmModal
          title={deleteTarget.kind === 'pack' ? '删除知识包' : '删除来源'}
          message={
            deleteTarget.kind === 'pack'
              ? `确定删除知识包「${deleteTarget.name}」？其中的记忆库数据将一并删除。`
              : `确定删除来源「${deleteTarget.name}」？若存在同名旧版本会自动恢复为默认检索版本。`
          }
          busy={busy === 'delete'}
          error={error || null}
          onConfirm={() => void handleConfirmDelete()}
          onClose={() => {
            setDeleteTarget(null);
            setError('');
          }}
        />
      )}
    </div>
  );
}

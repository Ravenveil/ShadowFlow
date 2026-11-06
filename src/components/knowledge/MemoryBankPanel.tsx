/**
 * MemoryBankPanel — 多模态记忆库面板（PR #7 设计移植，2026-11-06）。
 *
 * 挂在知识库页（KnowledgePage）作为独立的「记忆库」视图，与现有
 * KnowledgePack（/api/knowledge）并行不互替。
 *
 * 主链路：建知识包 → 上传文件（multipart）→ 来源列表 → 文本检索 → 原文回读。
 * 后端：Python sidecar /api/memory-bank（memory_bank.py），未注入 Embedder
 * 时退化为 BM25 关键词检索（meta.rag_backend = 'keyword+structure'）。
 * 弹窗一律用 NeoConfirmModal（项目原生弹窗清零约定）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, FileUp, Loader2, Search, Trash2 } from 'lucide-react';
import {
  MemoryBankApiError,
  createPack,
  deletePack,
  deleteSource,
  ingestFile,
  listPacks,
  listSources,
  queryPack,
} from '../../api/memoryBank';
import type { MemoryBankHit, MemoryBankPack, MemoryBankSource } from '../../api/memoryBank';
import { NeoConfirmModal } from '../../neo/NeoConfirmModal';
import './memory-bank.css';

type Busy = null | 'create' | 'upload' | 'query' | 'delete';

/** 删除目标：包或来源（NeoConfirmModal 二次确认）。 */
type DeleteTarget = { kind: 'pack'; id: string; name: string } | { kind: 'source'; id: string; name: string } | null;

export default function MemoryBankPanel() {
  const [packs, setPacks] = useState<MemoryBankPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [sources, setSources] = useState<MemoryBankSource[]>([]);
  const [hits, setHits] = useState<MemoryBankHit[] | null>(null);
  const [ragBackend, setRagBackend] = useState<string>('');
  const [queryText, setQueryText] = useState('');
  const [newPackName, setNewPackName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePack = packs.find((p) => p.pack_id === activePackId) ?? null;

  const refreshPacks = useCallback(async () => {
    try {
      const res = await listPacks();
      setPacks(res.data.packs);
      setActivePackId((cur) => cur ?? res.data.packs[0]?.pack_id ?? null);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `记忆库不可用：${e.status}` : '加载知识包失败');
    }
  }, []);

  const refreshSources = useCallback(async (packId: string) => {
    try {
      const res = await listSources(packId);
      setSources(res.data.sources);
    } catch {
      setSources([]);
    }
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  useEffect(() => {
    setSources([]);
    setHits(null);
    if (activePackId) void refreshSources(activePackId);
  }, [activePackId, refreshSources]);

  const handleCreatePack = async () => {
    const name = newPackName.trim();
    if (!name || busy) return;
    setBusy('create');
    setError('');
    try {
      const res = await createPack({ name });
      setNewPackName('');
      await refreshPacks();
      setActivePackId(res.data.pack_id);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `创建失败：${e.code || e.status}` : '创建失败');
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !activePackId || busy) return;
    setBusy('upload');
    setError('');
    try {
      for (const f of Array.from(files)) {
        await ingestFile(activePackId, f);
      }
      await refreshSources(activePackId);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `上传失败：${e.code || e.status}` : '上传失败');
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleQuery = async () => {
    const q = queryText.trim();
    if (!q || !activePackId || busy) return;
    setBusy('query');
    setError('');
    try {
      const res = await queryPack(activePackId, { query: q, top_k: 5 });
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
        const rest = packs.filter((p) => p.pack_id !== deleteTarget.id);
        setPacks(rest);
        setActivePackId(rest[0]?.pack_id ?? null);
      } else if (activePackId) {
        await deleteSource(activePackId, deleteTarget.id);
        await refreshSources(activePackId);
      }
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof MemoryBankApiError ? `删除失败：${e.code || e.status}` : '删除失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mbk" data-testid="memory-bank-panel">
      <aside className="mbk-rail">
        <div className="mbk-rail-head">
          <Database size={15} />
          <span>记忆库</span>
        </div>
        <div className="mbk-newpack">
          <input
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreatePack();
            }}
            placeholder="新知识包名称"
            aria-label="新知识包名称"
            className="mbk-input"
          />
          <button
            onClick={() => void handleCreatePack()}
            disabled={busy === 'create' || !newPackName.trim()}
            className="mbk-btn mbk-btn--primary"
            data-testid="mbk-create-pack"
          >
            {busy === 'create' ? <Loader2 size={13} className="mbk-spin" /> : '建包'}
          </button>
        </div>
        <div className="mbk-packlist">
          {packs.map((p) => (
            <button
              key={p.pack_id}
              onClick={() => setActivePackId(p.pack_id)}
              className={`mbk-packrow${p.pack_id === activePackId ? ' is-active' : ''}`}
              data-testid={`mbk-pack-${p.pack_id}`}
            >
              <span className="mbk-packrow-name">{p.name}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`删除知识包 ${p.name}`}
                className="mbk-packrow-del"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ kind: 'pack', id: p.pack_id, name: p.name });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    setDeleteTarget({ kind: 'pack', id: p.pack_id, name: p.name });
                  }
                }}
              >
                <Trash2 size={12} />
              </span>
            </button>
          ))}
          {packs.length === 0 && <p className="mbk-hint">还没有知识包，先建一个。</p>}
        </div>
      </aside>

      <section className="mbk-main">
        {!activePack ? (
          <div className="mbk-empty" data-testid="mbk-empty">
            <p className="mbk-empty-t1">选择或创建一个知识包</p>
            <p className="mbk-empty-t2">上传文件建立可检索的多模态记忆库（支持 TXT/MD/CSV/JSON/HTML/XLSX/DOCX/PDF/图片）。</p>
          </div>
        ) : (
          <>
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
                {sources.length === 0 && <p className="mbk-hint">还没有来源，点「上传文件」。</p>}
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

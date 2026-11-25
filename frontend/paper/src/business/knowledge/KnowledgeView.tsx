/**
 * KnowledgeView — 知识库（工作台子页）。
 *
 * 搬 legacy MemoryBankPanel + KnowledgePage 添加菜单的完整能力：
 *   上传文件（multipart）→ 来源列表 → 文本检索（BM25+结构）→ 删除来源/删除包，
 *   外加「导入本地文件夹」（后端弹系统选夹器 → 目录批量摄入，checksum 幂等去重）。
 * 选哪个包仍由第二栏（KnowledgePane）决定，这页呈现选中的那一个。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { KNOWLEDGE, SUBVIEW } from '@/shared/content/views';
import {
  createPack,
  deletePack,
  deletePackSource,
  getPackSources,
  ingestPackFolder,
  pickNativeDir,
  queryPack,
  uploadPackFile,
  type PackHit,
  type PackSource,
} from '@/shared/data/http/generic';
import { sizeLabel } from '@/shared/ui/format';
import { IconClose, IconSearch } from '@/shared/ui/icons';
import { packKey, packReady, packTitle, packsStore } from './packs';

type Busy = null | 'upload' | 'import' | 'query' | 'delete';

export default function KnowledgeView({ selected }: { selected?: string }) {
  const { items: packs, state } = packsStore.useList();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<PackSource[]>([]);
  const [hits, setHits] = useState<PackHit[] | null>(null);
  const [ragBackend, setRagBackend] = useState('');
  const [queryText, setQueryText] = useState('');
  const [confirming, setConfirming] = useState<{ kind: 'pack' | 'source'; id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void packsStore.load();
  }, []);

  const active = packs.find((p) => packKey(p) === selected) ?? null;
  const activeId = active ? packKey(active) : '';

  const refreshSources = useCallback(async (packId: string) => {
    try {
      const list = await getPackSources(packId);
      setSources(Array.isArray(list) ? list : []);
    } catch {
      setSources([]);
    }
  }, []);

  /** 来源按包取：包里的原文件才是这一页真正的内容，统计数字只是抬头。 */
  useEffect(() => {
    setSources([]);
    setHits(null);
    setError(null);
    setQueryText('');
    if (activeId) void refreshSources(activeId);
  }, [activeId, refreshSources]);

  const toggleForm = () => {
    setFormOpen((open) => !open);
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy('upload');
    setFormError(null);
    try {
      await createPack({ name: name.trim(), description: description.trim() });
      setName('');
      setDescription('');
      setFormOpen(false);
      setNotice(KNOWLEDGE.created);
      // 让第二栏立刻多一行：两处读同一份快照，这里刷完那边就跟着变。
      await packsStore.load(true);
    } catch {
      setFormError(SUBVIEW.loadFailed);
    } finally {
      setBusy(null);
    }
  };

  /** 上传文件（可多选，逐个传；失败不中断后面的）。 */
  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !activeId || busy) return;
    setBusy('upload');
    setError(null);
    try {
      for (const f of Array.from(files)) {
        await uploadPackFile(activeId, f);
      }
      await refreshSources(activeId);
      await packsStore.load(true);
    } catch {
      setError(KNOWLEDGE.uploadFailed);
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** 导入本地文件夹：后端弹系统选夹器 → 目录批量摄入。 */
  const handleImportFolder = async () => {
    if (!activeId) {
      setNotice(KNOWLEDGE.needPack);
      return;
    }
    setError(null);
    setNotice(KNOWLEDGE.importPicking);
    let dir: string | null = null;
    try {
      dir = await pickNativeDir();
    } catch {
      dir = null;
    }
    setNotice(null);
    if (!dir) return;
    setBusy('import');
    try {
      const d = await ingestPackFolder(activeId, dir);
      setNotice(KNOWLEDGE.imported(d.ingested, d.deduplicated, d.skipped, d.failed));
      await refreshSources(activeId);
      await packsStore.load(true);
    } catch {
      setError(KNOWLEDGE.loadFailed);
    } finally {
      setBusy(null);
    }
  };

  const handleQuery = async () => {
    const q = queryText.trim();
    if (!q || !activeId || busy) return;
    setBusy('query');
    setError(null);
    try {
      const res = await queryPack(activeId, q);
      setHits(res.hits);
      setRagBackend(res.ragBackend);
    } catch {
      setError(KNOWLEDGE.searchFailed);
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirming) return;
    setBusy('delete');
    setError(null);
    try {
      if (confirming.kind === 'pack') {
        await deletePack(confirming.id);
        setConfirming(null);
        setNotice(KNOWLEDGE.deletedPack);
        await packsStore.load(true);
      } else if (activeId) {
        await deletePackSource(activeId, confirming.id);
        setConfirming(null);
        setNotice(KNOWLEDGE.deletedSource);
        await refreshSources(activeId);
        await packsStore.load(true);
      }
    } catch {
      setError(KNOWLEDGE.loadFailed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{active ? packTitle(active) : KNOWLEDGE.title}</h1>
        {active?.description ? <p className="subview-blurb">{active.description}</p> : null}
      </header>

      <div className="subview-toolbar">
        <button className="subview-btn" type="button" onClick={() => fileInputRef.current?.click()} disabled={!activeId || busy === 'upload'}>
          {busy === 'upload' ? KNOWLEDGE.uploading : KNOWLEDGE.upload}
        </button>
        <button className="subview-btn" type="button" onClick={() => void handleImportFolder()} disabled={!activeId || busy === 'import'}>
          {busy === 'import' ? KNOWLEDGE.importing : KNOWLEDGE.importFolder}
        </button>
        <button className="subview-btn" type="button" data-primary="true" onClick={toggleForm}>
          {KNOWLEDGE.create}
        </button>
        {active ? (
          <>
            <span className="subview-tag" data-on={packReady(active) ? 'true' : undefined}>
              {packReady(active) ? KNOWLEDGE.statusActive : KNOWLEDGE.statusOther}
            </span>
            <span className="subview-tag">{KNOWLEDGE.sources(active.stats?.sources ?? sources.length)}</span>
            <span className="subview-tag">{KNOWLEDGE.chunks(active.stats?.chunks ?? 0)}</span>
          </>
        ) : null}
        {notice ? <span className="subview-tag">{notice}</span> : null}
      </div>

      {/* 隐藏的文件选择器：按钮点它 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => void handleUpload(e.target.files)}
        style={{ display: 'none' }}
        aria-label={KNOWLEDGE.upload}
      />

      {error ? <div className="subview-state">{error}</div> : null}

      {activeId ? (
        <>
          {/* 检索行 */}
          <div className="kb-queryrow">
            <div className="kb-query">
              <IconSearch size={13} />
              <input
                value={queryText}
                onChange={(e) => setQueryText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleQuery();
                }}
                placeholder={KNOWLEDGE.searchPlaceholder}
                aria-label={KNOWLEDGE.searchPlaceholder}
              />
              <button
                className="subview-btn"
                type="button"
                data-primary="true"
                onClick={() => void handleQuery()}
                disabled={busy === 'query' || !queryText.trim()}
              >
                {busy === 'query' ? KNOWLEDGE.searching : KNOWLEDGE.searchBtn}
              </button>
            </div>
            {ragBackend ? <span className="subview-tag">{KNOWLEDGE.ragBackend(ragBackend)}</span> : null}
          </div>

          {/* 双栏：来源 | 检索结果 */}
          <div className="kb-cols">
            <div className="kb-col">
              <p className="kb-coltitle">{KNOWLEDGE.sources(sources.length)}</p>
              {sources.map((source) => (
                <div className="kb-srcrow" key={source.source_id ?? source.filename}>
                  <span className="kb-srcname" title={source.filename}>
                    {source.filename ?? source.source_name ?? source.source_id ?? ''}
                  </span>
                  <span className="kb-pill" data-kind={source.ingest_status === 'done' || !source.ingest_status ? 'ok' : 'busy'}>
                    {source.ingest_status ?? 'done'}
                  </span>
                  <span className="kb-srcmeta">
                    {KNOWLEDGE.chunks(source.chunk_count ?? 0)} · {sizeLabel(source.size_bytes ?? 0)}
                  </span>
                  <button
                    className="kb-srcdel"
                    type="button"
                    aria-label={KNOWLEDGE.deleteSource}
                    title={KNOWLEDGE.deleteSource}
                    onClick={() =>
                      setConfirming({
                        kind: 'source',
                        id: source.source_id ?? '',
                        name: source.filename ?? source.source_name ?? '',
                      })
                    }
                  >
                    <IconClose size={12} />
                  </button>
                </div>
              ))}
              {sources.length === 0 ? <p className="kb-hint">{KNOWLEDGE.sourcesEmpty}</p> : null}
              <p className="kb-hint kb-hint--soft">{KNOWLEDGE.supportHint}</p>
            </div>

            <div className="kb-col">
              <p className="kb-coltitle">{hits ? KNOWLEDGE.resultsTitle(hits.length) : KNOWLEDGE.searchPlaceholder}</p>
              {hits?.map((hit, i) => (
                <div className="kb-hit" key={i}>
                  <div className="kb-hithead">
                    <span className="kb-hitsrc" title={hit.citation ?? hit.source}>
                      {hit.source}
                    </span>
                    <span className="kb-pill">{hit.kind ?? 'text'}</span>
                    <span className="kb-hitscore">score {(hit.score ?? 0).toFixed(3)}</span>
                  </div>
                  <p className="kb-hittext">{hit.text}</p>
                  {hit.retrieval_channels && hit.retrieval_channels.length > 0 ? (
                    <p className="kb-hitchan">{hit.retrieval_channels.join(' · ')}</p>
                  ) : null}
                </div>
              ))}
              {hits !== null && hits.length === 0 ? <p className="kb-hint">{KNOWLEDGE.hitsEmpty}</p> : null}
            </div>
          </div>
        </>
      ) : null}

      {formOpen ? (
        <div className="subview-form">
          <form onSubmit={submit}>
            <label>
              <span className="subview-tag">{KNOWLEDGE.createName}</span>
              <input
                className="subview-input"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span className="subview-tag">{KNOWLEDGE.createDesc}</span>
              <textarea
                className="subview-textarea"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </label>
            {formError ? <div className="subview-state">{formError}</div> : null}
            <div className="subview-toolbar">
              <button className="subview-btn" type="submit" data-primary="true" disabled={busy !== null}>
                {KNOWLEDGE.createSubmit}
              </button>
              <button className="subview-btn" type="button" onClick={toggleForm} disabled={busy !== null}>
                {KNOWLEDGE.cancel}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* 删除确认（legacy NeoConfirmModal 的轻量版） */}
      {confirming ? (
        <div className="kb-mask" onClick={() => setConfirming(null)}>
          <div className="kb-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{confirming.kind === 'pack' ? KNOWLEDGE.confirmDeletePack(confirming.name) : KNOWLEDGE.confirmDeleteSource(confirming.name)}</p>
            <div className="kb-confirm-actions">
              <button className="subview-btn" type="button" onClick={() => setConfirming(null)}>
                {KNOWLEDGE.cancel}
              </button>
              <button
                className="subview-btn"
                type="button"
                data-danger="true"
                disabled={busy === 'delete'}
                onClick={() => void handleConfirmDelete()}
              >
                {KNOWLEDGE.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="subview-state">
          <span>{KNOWLEDGE.loadFailed}</span>
          <button className="subview-btn" type="button" onClick={() => void packsStore.load(true)}>
            {SUBVIEW.retry}
          </button>
        </div>
      ) : null}
    </section>
  );
}

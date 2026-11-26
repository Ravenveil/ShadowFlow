/**
 * FilesView — 工作空间文件浏览（项目页内嵌 / 会话文件视图共用）。
 *
 * 与 legacy NeoHost 的文件面板对齐三件事：列目录、新建 / 上传文件、文本预览。
 * 二进制（图片 / PDF / Excel）继续走 raw 直链，不在前端做 utf8 解码。
 * 所有可见文案来自 content/views.ts 的 FILES。
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FILES, SUBVIEW } from '@/shared/content/views';
import {
  fileRawUrl,
  listDir,
  readTextFile,
  uploadWorkspaceFile,
  writeWorkspaceFile,
  type FsEntry,
  type FsListing,
} from '@/shared/data/http/generic';

type LoadState = 'loading' | 'ready' | 'error';

/** 能按 utf8 文本预览的扩展名；其余（图片 / PDF / 表格）交给 raw 直链。 */
const TEXT_EXT = /\.(md|markdown|txt|json|ya?ml|csv|tsv|ts|tsx|js|jsx|py|css|html|xml|log|tex|bib)$/i;

const WORKSPACE_KEY = 'sf.paper.activeWorkspaceDir';

const readWorkspace = (): string => {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY) ?? '';
  } catch {
    return '';
  }
};

const parentOf = (dir: string): string => {
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
  parts.pop();
  return parts.join('/');
};

const isDirectory = (entry: FsEntry): boolean =>
  entry.type === 'dir' || entry.type === 'directory';

interface Preview {
  path: string;
  content: string;
  truncated: boolean;
}

export default function FilesView({ initialDir, embedded }: { initialDir?: string; embedded?: boolean } = {}) {
  const [dir, setDir] = useState<string>(() => initialDir ?? readWorkspace());
  const [listing, setListing] = useState<FsListing | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!dir) {
      setListing(null);
      setState('ready');
      return;
    }
    setState('loading');
    listDir(dir)
      .then((data) => {
        setListing(data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [dir]);

  useEffect(() => {
    if (initialDir && initialDir !== dir) setDir(initialDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDir]);

  useEffect(() => {
    load();
  }, [load, reload]);

  const parent = parentOf(dir);
  const canGoUp = Boolean(parent) && parent !== dir;
  const entries = listing?.entries ?? [];
  const root = listing?.root ?? dir;

  /** 换目录就收掉预览与错误：旧文件的内容不能挂在新目录上。 */
  useEffect(() => {
    setPreview(null);
    setError(null);
    setNewOpen(false);
    setEditing(false);
  }, [dir]);

  const openFile = (entry: FsEntry) => {
    setError(null);
    setEditing(false);
    if (!TEXT_EXT.test(entry.name)) {
      window.open(fileRawUrl(entry.path, root), '_blank', 'noreferrer');
      return;
    }
    setPreviewState('loading');
    setPreview({ path: entry.path, content: '', truncated: false });
    readTextFile(entry.path, root)
      .then((data) => {
        setPreview({ path: entry.path, content: data.content, truncated: data.truncated });
        setPreviewState('ready');
      })
      .catch(() => setPreviewState('error'));
  };

  const startEdit = () => {
    if (!preview) return;
    setDraft(preview.content);
    setEditing(true);
    setError(null);
  };

  const saveEdit = async () => {
    if (!preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      await writeWorkspaceFile(preview.path, draft, root);
      setPreview({ ...preview, content: draft.replace(/\r\n/g, '\n'), truncated: false });
      setEditing(false);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : FILES.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const submitNewFile = async () => {
    const name = newName.trim();
    if (!name || !dir || busy) return;
    setBusy(true);
    setError(null);
    try {
      await writeWorkspaceFile(name, '', root);
      setNewOpen(false);
      setNewName('');
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : FILES.newFileFailed);
    } finally {
      setBusy(false);
    }
  };

  const onUploadPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !dir || busy) return;
    setBusy(true);
    setError(null);
    try {
      await uploadWorkspaceFile(dir, root, file);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : FILES.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={embedded ? 'subview subview--embedded' : 'subview'}>
      {!embedded ? (
        <header className="subview-head">
          <h1 className="subview-title">{FILES.title}</h1>
        </header>
      ) : null}

      {!dir ? (
        <div className="subview-state">{FILES.noSession}</div>
      ) : (
        <>
          <div className="subview-toolbar">
            <button
              className="subview-btn"
              disabled={!canGoUp}
              onClick={() => canGoUp && setDir(parent)}
            >
              {FILES.up}
            </button>
            <button className="subview-btn" disabled={busy} onClick={() => setNewOpen((v) => !v)}>
              {FILES.newFile}
            </button>
            <button className="subview-btn" disabled={busy} onClick={() => uploadRef.current?.click()}>
              {FILES.upload}
            </button>
            <button className="subview-btn" onClick={() => setReload((n) => n + 1)}>
              {SUBVIEW.retry}
            </button>
            <input
              ref={uploadRef}
              type="file"
              hidden
              onChange={(e) => void onUploadPicked(e)}
            />
          </div>

          {newOpen ? (
            <div className="subview-toolbar">
              <input
                className="subview-input"
                value={newName}
                autoFocus
                placeholder={FILES.newFilePlaceholder}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewFile();
                  if (e.key === 'Escape') setNewOpen(false);
                }}
              />
              <button
                className="subview-btn"
                data-primary="true"
                disabled={busy || !newName.trim()}
                onClick={() => void submitNewFile()}
              >
                {FILES.newFileConfirm}
              </button>
            </div>
          ) : null}

          {error ? <div className="subview-state subview-state--error">{error}</div> : null}

          <div className="subview-kv">
            <span>path</span>
            <span>{dir}</span>
          </div>

          {state === 'loading' && <div className="subview-state">{FILES.loading}</div>}

          {state === 'error' && (
            <div className="subview-state">
              <span>{FILES.loadFailed}</span>
              <button className="subview-btn" onClick={load}>
                {SUBVIEW.retry}
              </button>
            </div>
          )}

          {state === 'ready' && entries.length === 0 && (
            <div className="subview-state">{FILES.empty}</div>
          )}

          {state === 'ready' && entries.length > 0 && (
            <div className="subview-list">
              {entries.map((entry, index) => {
                const folder = isDirectory(entry);
                return (
                  <div className="subview-card" key={entry.path || entry.name || String(index)}>
                    <div className="subview-kv">
                      <span>
                        {folder ? (
                          <button className="subview-btn" onClick={() => setDir(entry.path)}>
                            {entry.name}
                          </button>
                        ) : (
                          <button className="subview-btn" onClick={() => openFile(entry)}>
                            {entry.name}
                          </button>
                        )}
                      </span>
                      <span className="subview-tag">{folder ? FILES.folder : FILES.file}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {preview ? (
            <div className="subview-card file-preview">
              <div className="subview-kv">
                <span>{preview.path}</span>
                <span className="file-preview-actions">
                  {editing ? (
                    <>
                      <button className="subview-btn" onClick={() => setEditing(false)} disabled={saving}>
                        {FILES.cancelEdit}
                      </button>
                      <button
                        className="subview-btn"
                        data-primary="true"
                        onClick={() => void saveEdit()}
                        disabled={saving}
                      >
                        {saving ? FILES.saving : FILES.save}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="subview-btn" onClick={startEdit} disabled={previewState !== 'ready'}>
                        {FILES.edit}
                      </button>
                      <button className="subview-btn" onClick={() => setPreview(null)}>
                        {FILES.previewClose}
                      </button>
                    </>
                  )}
                </span>
              </div>
              {previewState === 'loading' ? <div className="subview-state">{FILES.previewLoading}</div> : null}
              {previewState === 'error' ? <div className="subview-state">{FILES.previewFailed}</div> : null}
              {previewState === 'ready' ? (
                <>
                  {preview.truncated && !editing ? (
                    <div className="subview-tag">{FILES.previewTruncated}</div>
                  ) : null}
                  {editing ? (
                    <textarea
                      className="file-preview-edit"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      spellCheck={false}
                      aria-label={FILES.editHint}
                    />
                  ) : (
                    <pre className="file-preview-body">
                      {preview.content || FILES.previewEmpty}
                    </pre>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

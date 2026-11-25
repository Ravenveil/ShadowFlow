/**
 * FilesView - workspace file browser workbench subview.
 * All visible copy comes from content/views.ts; no literals live in this file.
 */
import { useCallback, useEffect, useState } from 'react';
import { FILES, SUBVIEW } from '@/shared/content/views';
import { fileRawUrl, listDir, type FsEntry, type FsListing } from '@/shared/data/http/generic';

type LoadState = 'loading' | 'ready' | 'error';

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

export default function FilesView() {
  const [dir, setDir] = useState<string>(readWorkspace);
  const [listing, setListing] = useState<FsListing | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [reload, setReload] = useState(0);

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
    load();
  }, [load, reload]);

  const parent = parentOf(dir);
  const canGoUp = Boolean(parent) && parent !== dir;
  const entries = listing?.entries ?? [];
  const root = listing?.root ?? dir;

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{FILES.title}</h1>
      </header>

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
            <button className="subview-btn" onClick={() => setReload((n) => n + 1)}>
              {SUBVIEW.retry}
            </button>
          </div>

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
                          <a
                            href={fileRawUrl(entry.path, root)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {entry.name}
                          </a>
                        )}
                      </span>
                      <span className="subview-tag">{folder ? FILES.folder : FILES.file}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

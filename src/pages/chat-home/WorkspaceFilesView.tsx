import { useEffect, useState } from 'react';
import { listFiles, readFile, type FsFile } from '../../api/fsFiles';
import PreviewMarkdown from '../../components/run-session/PreviewMarkdown';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function WorkspaceFilesView({ root }: { root: string | null }) {
  const [files, setFiles] = useState<FsFile[]>([]);
  const [sel, setSel] = useState<FsFile | null>(null);
  const [body, setBody] = useState<string>('');

  useEffect(() => {
    if (!root) { setFiles([]); return; }
    listFiles(root).then(setFiles).catch(() => setFiles([]));
  }, [root]);

  useEffect(() => {
    if (!sel || !root) { setBody(''); return; }
    readFile(sel.path, root)
      .then((r) => setBody(r.content))
      .catch(() => setBody('（无法预览此文件）'));
  }, [sel, root]);

  if (!root) {
    return (
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--t-fg-4)',
          fontSize: 12,
        }}
      >
        这个会话还没有工作目录文件
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          maxHeight: '40%',
          overflowY: 'auto',
          borderBottom: '1px solid var(--t-border)',
        }}
      >
        {files.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--t-fg-4)', fontSize: 12 }}>
            暂无文件（任务可能仍在生成）
          </div>
        ) : (
          files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSel(f)}
              style={{
                display: 'flex',
                width: '100%',
                gap: 8,
                padding: '8px 12px',
                background: sel?.path === f.path ? 'var(--t-panel-2)' : 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: 'var(--t-fg-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.name}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: 'var(--t-fg-5)',
                  fontFamily: 'monospace',
                }}
              >
                {formatBytes(f.size)}
              </span>
            </button>
          ))
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {sel ? (
          <PreviewMarkdown source={body} />
        ) : (
          <div style={{ color: 'var(--t-fg-4)', fontSize: 12 }}>选择左侧文件预览</div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  listFiles,
  listDirs,
  pickNativeFolder,
  readFile,
  type FsFile,
  type FsDirEntry,
} from '../../api/fsFiles';
import PreviewMarkdown from '../../components/run-session/PreviewMarkdown';
import { FolderOpen, ArrowUp, Folder, FileText, ChevronRight, X } from 'lucide-react';

const LS_KEY = 'sf.project-folder';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 截断中间路径，保留首尾各 N 个字符 */
function truncatePath(p: string, max = 42): string {
  if (p.length <= max) return p;
  const half = Math.floor((max - 3) / 2);
  return `${p.slice(0, half + 4)}…${p.slice(p.length - half)}`;
}

// ─── 内置目录浏览器（浮层） ──────────────────────────────────────────────────

interface InlineBrowserProps {
  onPick: (absPath: string) => void;
  onClose: () => void;
}

function InlineDirBrowser({ onPick, onClose }: InlineBrowserProps) {
  const [curPath, setCurPath] = useState<string | undefined>(undefined);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsDirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (p?: string) => {
    setLoading(true);
    setErr(null);
    listDirs(p)
      .then((r) => {
        if (!r) {
          setErr(p ? `无法读取：${p}` : '后端未响应，检查 Node 服务是否运行');
          return;
        }
        const real = r.path === 'ROOT' ? undefined : r.path;
        setCurPath(real);
        setParent(r.parent);
        setEntries(r.entries);
      })
      .finally(() => setLoading(false));
  };

  // 初始加载（从 home 开始）
  useEffect(() => { load(undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--t-panel)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <Folder size={13} strokeWidth={1.8} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--t-fg)' }}>
          选择项目文件夹
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--t-fg-4)', display: 'flex', padding: 2 }}
          title="取消"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* path bar + up button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          title="上一级"
          disabled={parent === null && !curPath}
          onClick={() => load(parent ?? 'ROOT')}
          style={{
            background: 'transparent',
            border: '1px solid var(--t-border)',
            borderRadius: 5,
            cursor: parent === null && !curPath ? 'default' : 'pointer',
            color: 'var(--t-fg-3)',
            display: 'flex',
            alignItems: 'center',
            padding: 3,
            flexShrink: 0,
            opacity: parent === null && !curPath ? 0.4 : 1,
          }}
        >
          <ArrowUp size={12} strokeWidth={2} />
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 10.5,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--t-fg-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={curPath ?? '（盘符列表）'}
        >
          {curPath ? truncatePath(curPath) : '（盘符列表）'}
        </span>
      </div>

      {/* entry list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-fg-4)' }}>读取中…</div>
        ) : err ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-danger, #e5484d)' }}>{err}</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-fg-4)' }}>（无子目录）</div>
        ) : (
          entries.map((e) => (
            <button
              key={e.path}
              type="button"
              onClick={() => load(e.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--t-fg)',
              }}
              onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--t-hover, var(--t-bg))'; }}
              onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Folder size={13} strokeWidth={1.8} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </span>
              <ChevronRight size={12} strokeWidth={1.8} style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
            </button>
          ))
        )}
      </div>

      {/* footer: pick current dir */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ flex: 1, fontSize: 10.5, color: 'var(--t-fg-4)' }}>
          {curPath ? '进入目录后点「选此文件夹」' : '进入一个盘符后可选目录'}
        </span>
        <button
          type="button"
          disabled={!curPath}
          onClick={() => { if (curPath) onPick(curPath); }}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: 0,
            cursor: curPath ? 'pointer' : 'default',
            background: curPath ? 'var(--t-accent)' : 'var(--t-border)',
            color: curPath ? '#fff' : 'var(--t-fg-4)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          选此文件夹
        </button>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function WorkspaceFilesView({ root }: { root: string | null }) {
  // 项目文件夹（用户手动选的），优先于传入 root
  const [projectFolder, setProjectFolder] = useState<string | null>(
    () => localStorage.getItem(LS_KEY),
  );
  const [showBrowser, setShowBrowser] = useState(false);
  const [picking, setPicking] = useState(false);

  // 当前浏览目录（项目文件夹或 root）
  const activeRoot = projectFolder ?? root;

  // 目录内容
  const [dirs, setDirs] = useState<FsDirEntry[]>([]);
  const [files, setFiles] = useState<FsFile[]>([]);
  const [absDir, setAbsDir] = useState<string>('');
  const [curDir, setCurDir] = useState<string | null>(null);
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [loadingDir, setLoadingDir] = useState(false);

  // 选中文件预览
  const [sel, setSel] = useState<FsFile | null>(null);
  const [body, setBody] = useState<string>('');

  const openBtnRef = useRef<HTMLButtonElement>(null);

  // 持久化选中文件夹
  const applyProjectFolder = (p: string) => {
    localStorage.setItem(LS_KEY, p);
    setProjectFolder(p);
    setShowBrowser(false);
    setSel(null);
    setBody('');
  };

  const clearProjectFolder = () => {
    localStorage.removeItem(LS_KEY);
    setProjectFolder(null);
    setSel(null);
    setBody('');
  };

  // 点「打开项目文件夹」按钮
  const handleOpenFolder = async () => {
    setPicking(true);
    const p = await pickNativeFolder();
    setPicking(false);
    if (p) {
      applyProjectFolder(p);
    } else {
      // 503 / 取消 → 回退内置浏览器
      setShowBrowser(true);
    }
  };

  // 加载某目录（子目录列表 + 文件列表）
  const loadDir = async (dir: string) => {
    setLoadingDir(true);
    setSel(null);
    setBody('');
    try {
      const [dirsResult, filesResult] = await Promise.all([
        listDirs(dir),
        listFiles(dir),
      ]);
      const dirEntries = dirsResult?.entries.filter((e) => e.isDir) ?? [];
      setDirs(dirEntries);
      setAbsDir(filesResult.dir || dir);
      setFiles(filesResult.files);
      setCurDir(dir);
      setParentDir(dirsResult?.parent ?? null);
    } finally {
      setLoadingDir(false);
    }
  };

  // activeRoot 变化时重新加载
  useEffect(() => {
    if (!activeRoot) {
      setDirs([]);
      setFiles([]);
      setAbsDir('');
      setCurDir(null);
      setParentDir(null);
      setSel(null);
      setBody('');
      return;
    }
    loadDir(activeRoot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoot]);

  // 选中文件 → 预览
  useEffect(() => {
    if (!sel || !absDir) { setBody(''); return; }
    readFile(sel.path, absDir)
      .then((r) => setBody(r.content))
      .catch(() => setBody('（无法预览此文件）'));
  }, [sel, absDir]);

  // ── 无 activeRoot 空状态 ──
  if (!activeRoot && !showBrowser) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 }}>
          <button
            ref={openBtnRef}
            type="button"
            disabled={picking}
            onClick={handleOpenFolder}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 7,
              border: '1px solid var(--t-accent)',
              background: 'var(--t-accent-tint)',
              color: 'var(--t-accent-bright)',
              cursor: picking ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: picking ? 0.7 : 1,
            }}
          >
            <FolderOpen size={14} strokeWidth={1.8} />
            {picking ? '正在弹出…' : '打开项目文件夹'}
          </button>
        </div>
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
      </div>
    );
  }

  // ── 内置浏览器覆盖层 ──
  if (showBrowser) {
    return (
      <div style={{ flex: 1, position: 'relative' }}>
        <InlineDirBrowser
          onPick={applyProjectFolder}
          onClose={() => setShowBrowser(false)}
        />
      </div>
    );
  }

  // ── 主文件视图 ──
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 顶部工具栏：路径 + 打开/清除按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        {/* 返回上级 */}
        {curDir && parentDir !== null && (
          <button
            type="button"
            title="返回上级"
            onClick={() => loadDir(parentDir)}
            style={{
              background: 'transparent',
              border: '1px solid var(--t-border)',
              borderRadius: 5,
              cursor: 'pointer',
              color: 'var(--t-fg-3)',
              display: 'flex',
              alignItems: 'center',
              padding: 3,
              flexShrink: 0,
            }}
          >
            <ArrowUp size={12} strokeWidth={2} />
          </button>
        )}
        {/* 当前路径 */}
        <span
          style={{
            flex: 1,
            fontSize: 10.5,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--t-fg-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={curDir ?? activeRoot ?? ''}
        >
          {truncatePath(curDir ?? activeRoot ?? '')}
        </span>
        {/* 打开新文件夹 */}
        <button
          ref={openBtnRef}
          type="button"
          disabled={picking}
          onClick={handleOpenFolder}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid var(--t-accent)',
            background: 'var(--t-accent-tint)',
            color: 'var(--t-accent-bright)',
            cursor: picking ? 'default' : 'pointer',
            fontSize: 10.5,
            fontWeight: 600,
            flexShrink: 0,
            opacity: picking ? 0.7 : 1,
          }}
          title="打开项目文件夹"
        >
          <FolderOpen size={12} strokeWidth={1.8} />
          {picking ? '…' : '换目录'}
        </button>
        {/* 清除手动选中（仅有 projectFolder 时显示） */}
        {projectFolder && (
          <button
            type="button"
            onClick={clearProjectFolder}
            title="清除选中的项目文件夹"
            style={{
              background: 'transparent',
              border: '1px solid var(--t-border)',
              borderRadius: 5,
              cursor: 'pointer',
              color: 'var(--t-fg-4)',
              display: 'flex',
              alignItems: 'center',
              padding: 3,
              flexShrink: 0,
            }}
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* 文件/目录列表 */}
      <div
        style={{
          maxHeight: '40%',
          overflowY: 'auto',
          borderBottom: '1px solid var(--t-border)',
        }}
      >
        {loadingDir ? (
          <div style={{ padding: 14, color: 'var(--t-fg-4)', fontSize: 12 }}>读取中…</div>
        ) : dirs.length === 0 && files.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--t-fg-4)', fontSize: 12 }}>
            暂无文件（任务可能仍在生成）
          </div>
        ) : (
          <>
            {/* 子目录 */}
            {dirs.map((d) => (
              <button
                key={d.path}
                type="button"
                onClick={() => loadDir(d.path)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--t-hover, var(--t-bg))'; }}
                onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <Folder size={13} strokeWidth={1.8} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
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
                  {d.name}
                </span>
                <ChevronRight size={12} strokeWidth={1.8} style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
              </button>
            ))}
            {/* 文件 */}
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSel(f)}
                style={{
                  display: 'flex',
                  width: '100%',
                  gap: 8,
                  alignItems: 'center',
                  padding: '7px 12px',
                  background: sel?.path === f.path ? 'var(--t-panel-2)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <FileText size={13} strokeWidth={1.8} style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
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
            ))}
          </>
        )}
      </div>

      {/* 预览区 */}
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

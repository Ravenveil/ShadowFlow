/**
 * ProjectFileTree — Studio 右栏：项目目录树 + 打开文件（OWNER: right-files）。
 *
 * 真正的递归可展开树（参考 hermes-desktop 文件树 + WorkspacePage 的「目录树 + 记忆」）：
 *   - 每个目录节点独立 expand/collapse，懒加载（展开时才拉子目录 + 文件）。
 *   - 文件按扩展名上色图标。
 *   - 展开态按 root 记忆到 localStorage（sf.studio.tree.expanded.<root>）。
 *   - 顶部搜索框：跨已加载节点按名称过滤（命中保留路径上的父目录）。
 *   - 选择文件夹（root）由上层 WorkspacePane 控制；这里只渲染树。
 *
 * 复用：src/api/fsBrowse.ts → fsList(path)（列子目录）
 *       src/api/fsFiles.ts  → listFiles(dir)（列文件）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, File as FileIcon, Folder, RefreshCw, Search, X } from 'lucide-react';
import { fsList } from '../../api/fsBrowse';
import { listFiles } from '../../api/fsFiles';

export interface ProjectFileTreeProps {
  /** 工作目录根绝对路径。空 = 显示「选择文件夹」空态。 */
  root: string;
  /** 当前浏览到的子目录（受控）。本组件用 root 作为树根，cwd 仅用于初始展开。 */
  cwd?: string;
  /** 下钻到某目录（保留 prop 兼容；树内点目录走 expand，不再切 cwd）。 */
  onChangeCwd?: (dir: string) => void;
  /** 点开一个文件（绝对路径）。 */
  onOpenFile?: (filePath: string) => void;
  /** 当前打开的文件（高亮）。 */
  activeFile?: string | null;
}

interface DirState {
  loading: boolean;
  loaded: boolean;
  dirs: { name: string; path: string }[];
  files: { name: string; path: string; ext: string }[];
}

const EXPANDED_LS = 'sf.studio.tree.expanded.';

function loadExpanded(root: string): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_LS + root);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set([root]);
}

export function ProjectFileTree({ root, onOpenFile, activeFile }: ProjectFileTreeProps) {
  // path → 该目录的加载状态/内容
  const [tree, setTree] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => (root ? loadExpanded(root) : new Set()));
  const [query, setQuery] = useState('');
  const loadingRef = useRef<Set<string>>(new Set());

  const loadDir = useCallback(async (dir: string, force = false) => {
    if (!dir) return;
    if (!force && loadingRef.current.has(dir)) return;
    loadingRef.current.add(dir);
    setTree((t) => ({ ...t, [dir]: { ...(t[dir] ?? emptyDir()), loading: true } }));
    try {
      const [listed, filed] = await Promise.all([fsList(dir), listFiles(dir)]);
      const dirs = (listed?.entries ?? [])
        .filter((e) => e.isDir)
        .map((e) => ({ name: e.name, path: e.path }));
      const files = (filed.files ?? []).map((f) => ({ name: f.name, path: f.path, ext: f.ext }));
      setTree((t) => ({ ...t, [dir]: { loading: false, loaded: true, dirs, files } }));
    } catch {
      setTree((t) => ({ ...t, [dir]: { loading: false, loaded: true, dirs: [], files: [] } }));
    } finally {
      loadingRef.current.delete(dir);
    }
  }, []);

  // root 变化：重置树 + 展开态，加载 root。
  useEffect(() => {
    if (!root) return;
    setTree({});
    setQuery('');
    const exp = loadExpanded(root);
    exp.add(root);
    setExpanded(exp);
  }, [root]);

  // 持久化展开态。
  useEffect(() => {
    if (!root) return;
    try {
      localStorage.setItem(EXPANDED_LS + root, JSON.stringify([...expanded]));
    } catch {
      /* ignore */
    }
  }, [root, expanded]);

  // 任何已展开但未加载的目录 → 懒加载。
  useEffect(() => {
    expanded.forEach((dir) => {
      const st = tree[dir];
      if (!st || (!st.loaded && !st.loading)) void loadDir(dir);
    });
  }, [expanded, tree, loadDir]);

  const toggle = useCallback((dir: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    // 重载所有已展开目录。
    expanded.forEach((dir) => void loadDir(dir, true));
  }, [expanded, loadDir]);

  const q = query.trim().toLowerCase();

  if (!root) {
    return (
      <div className="sf-empty">
        <span className="sf-empty-icon">
          <Folder size={22} />
        </span>
        <div className="sf-empty-title">未选择工作目录</div>
        <p className="sf-empty-sub">在上方选择一个项目文件夹</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* search + refresh */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <div
          className="sf-focus-ring"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 7px',
            borderRadius: 6,
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
          }}
        >
          <Search size={12} strokeWidth={2} style={{ color: 'var(--t-fg-5)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--t-fg)',
              fontSize: 12,
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => setQuery('')}
              style={{ display: 'inline-flex', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--t-fg-5)', padding: 0 }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="sf-press"
          aria-label="刷新"
          onClick={refresh}
          style={{
            display: 'inline-flex',
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
            color: 'var(--t-fg-4)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={12} strokeWidth={2} />
        </button>
      </div>

      {/* tree */}
      <div className="sf-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 4 }}>
        <TreeNode
          dir={root}
          name={root.split(/[\\/]/).filter(Boolean).pop() ?? root}
          depth={0}
          tree={tree}
          expanded={expanded}
          query={q}
          onToggle={toggle}
          onOpenFile={onOpenFile}
          activeFile={activeFile ?? null}
          isRoot
        />
      </div>
    </div>
  );
}

function emptyDir(): DirState {
  return { loading: false, loaded: false, dirs: [], files: [] };
}

interface TreeNodeProps {
  dir: string;
  name: string;
  depth: number;
  tree: Record<string, DirState>;
  expanded: Set<string>;
  query: string;
  onToggle: (dir: string) => void;
  onOpenFile?: (filePath: string) => void;
  activeFile: string | null;
  isRoot?: boolean;
}

function TreeNode({ dir, name, depth, tree, expanded, query, onToggle, onOpenFile, activeFile, isRoot }: TreeNodeProps) {
  const st = tree[dir];
  const isOpen = expanded.has(dir) || isRoot;
  const indent = 6 + depth * 12;

  const matches = (s: string) => !query || s.toLowerCase().includes(query);

  return (
    <>
      {!isRoot && (
        <button
          type="button"
          className="sf-hoverable"
          style={treeRow(false, indent)}
          onClick={() => onToggle(dir)}
        >
          <ChevronRight
            size={12}
            strokeWidth={2}
            style={{
              color: 'var(--t-fg-5)',
              flexShrink: 0,
              transition: 'transform .15s ease',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          />
          <Folder size={14} strokeWidth={2} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
          <span style={ellip}>{name}</span>
        </button>
      )}

      {isOpen && (
        <>
          {st?.loading && (
            <div style={{ padding: `4px 6px 4px ${indent + 18}px`, fontSize: 11, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)' }}>
              加载中…
            </div>
          )}
          {st?.dirs.map((d) => (
            <TreeNode
              key={d.path}
              dir={d.path}
              name={d.name}
              depth={depth + 1}
              tree={tree}
              expanded={expanded}
              query={query}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              activeFile={activeFile}
            />
          ))}
          {st?.files
            .filter((f) => matches(f.name))
            .map((f) => {
              const on = f.path === activeFile;
              return (
                <button
                  key={f.path}
                  type="button"
                  className="sf-hoverable"
                  style={treeRow(on, indent + (isRoot ? 0 : 12))}
                  onClick={() => onOpenFile?.(f.path)}
                >
                  <FileIcon
                    size={14}
                    strokeWidth={2}
                    style={{ color: on ? 'var(--t-accent)' : extColor(f.ext), flexShrink: 0, marginLeft: 14 }}
                  />
                  <span style={{ ...ellip, color: on ? 'var(--t-accent)' : 'var(--t-fg-2)' }}>{f.name}</span>
                </button>
              );
            })}
          {st?.loaded && !st.loading && st.dirs.length === 0 && st.files.filter((f) => matches(f.name)).length === 0 && (
            <div style={{ padding: `4px 6px 4px ${indent + 18}px`, fontSize: 11, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)' }}>
              {query ? '无匹配' : '空目录'}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** 文件扩展名 → 图标颜色（轻量区分常见类型）。 */
function extColor(ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  switch (e) {
    case 'ts':
    case 'tsx':
      return '#3178c6';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return '#f0b429';
    case 'json':
      return '#a3a300';
    case 'css':
    case 'scss':
    case 'less':
      return '#2965f1';
    case 'md':
    case 'mdx':
      return 'var(--t-fg-3)';
    case 'py':
      return '#3572A5';
    case 'rs':
      return '#dea584';
    case 'go':
      return '#00ADD8';
    case 'html':
    case 'htm':
      return '#e34c26';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return '#16a34a';
    default:
      return 'var(--t-fg-4)';
  }
}

function treeRow(on: boolean, paddingLeft: number): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '4px 6px',
    paddingLeft,
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
    border: '1px solid transparent',
    background: on ? 'color-mix(in oklab, var(--t-accent) 12%, transparent)' : 'transparent',
  };
}

const ellip: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--t-fg-2)',
};

export default ProjectFileTree;

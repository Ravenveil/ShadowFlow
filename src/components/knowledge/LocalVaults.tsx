/**
 * LocalVaults.tsx — 本地仓库(vault)组件库,2026-08-19 拆分(知识库统一布局批)。
 *
 * 原「列表 + 浏览」一体的 LocalVaults 面板已并入 KnowledgePage 统一源列表;
 * 本文件只保留可复用部件:
 *   - VaultBrowser     仓库浏览器(文件树 + 阅读器),无「返回」键 —— 源切换由
 *                      知识页左栏负责;工具条 ··· 菜单提供 重命名/移除/建知识包
 *   - AddVaultModal    注册回退弹窗(粘贴路径;原生选择器不可用时)
 *   - CreateVaultModal 新建本地仓库(名称 + 父目录 → 后端 create:true)
 *   - RenameVaultModal / RemoveVaultModal
 *   - pickNativeFolderEx 原生选夹器三态封装(picked/cancelled/unsupported)
 *
 * 文件只读铁律(Shadow REG-1)不变:移除仓库只删注册行,磁盘文件永不触碰。
 * 样式 neo-kv-*(pages/knowledge-neo.css);Markdown 渲染复用 NeoMarkdown
 * (neo-md-* 全局类在 neo-host.css,这里显式 import 保证独立路由可用)。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Waypoints,
} from 'lucide-react';
import {
  addVault,
  readVaultFile,
  listVaultFiles,
  removeVault,
  renameVault,
  VaultApiError,
} from '../../api/knowledgeVaults';
import { openInEditor, rawUrl } from '../../api/fsFiles';
import { getApiBase } from '../../api/_base';
import DirPicker from '../DirPicker';
import type { KnowledgeVault, VaultFile } from '../../common/types/knowledgeVault';
import { NeoMarkdown } from '../../neo/projections/NeoMarkdown';
import '../../neo/neo-host.css';

// ─── 通用工具(知识页也复用)──────────────────────────────────────────────────

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso ?? '';
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function translateVaultError(err: unknown): string {
  if (err instanceof VaultApiError) {
    switch (err.code) {
      case 'NOT_ABSOLUTE':
        return '路径必须是绝对路径(如 D:\\Notes 或 /Users/me/Notes)。';
      case 'NOT_A_DIR':
        return '该路径不是文件夹,请选择一个目录。';
      case 'NOT_FOUND':
        return '路径不存在,请检查后重试。';
      case 'PARENT_NOT_FOUND':
        return '父目录不存在,请先选择一个已存在的目录。';
      case 'BAD_NAME':
        return '目录名不合法(不能为空或以 . 开头)。';
      case 'VAULT_PATH_MISSING':
        return '仓库路径在磁盘上已不存在(可能被移动或删除)。';
      case 'FORBIDDEN':
        return '路径越权:仅允许读仓库内文件。';
      case 'UNSUPPORTED_TYPE':
        return '该文件类型不支持文本预览。';
      case 'VAULT_API_BAD_RESPONSE':
        return '服务返回了非 JSON 响应,请确认 Node 网关(:8002)已启动。';
      default:
        return `请求失败 (code=${err.code})。`;
    }
  }
  return '网络错误,请稍后重试。';
}

export function basenameOf(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function normalizeDirPath(p: string): string {
  return p.trim().replace(/[\\/]+$/, '');
}

/**
 * 原生选夹器三态封装。共享的 fsFiles.pickNativeFolder 把 503 折叠成 null,
 * 无法区分「用户取消」和「本机不支持」——添加菜单的主路径必须区分:
 * cancelled 静默结束,unsupported 才回退到粘贴路径弹窗。
 */
export type NativePickResult =
  | { status: 'picked'; path: string }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

export async function pickNativeFolderEx(): Promise<NativePickResult> {
  try {
    const r = await fetch(`${getApiBase()}/api/fs/pick-native`);
    if (r.status === 503) return { status: 'unsupported' };
    if (!r.ok) return { status: 'unsupported' };
    const j = await r.json();
    const p = j?.data?.path;
    if (typeof p === 'string' && p.trim()) return { status: 'picked', path: p.trim() };
    return { status: 'cancelled' };
  } catch {
    return { status: 'unsupported' };
  }
}

// ─── 文件树(扁平相对路径 → 嵌套树,Shadow Explorer.buildTree 直译)────────

interface TreeDir {
  dir: true;
  name: string;
  path: string;
  children: TreeEntry[];
}
interface TreeFileNode {
  dir: false;
  name: string;
  path: string;
  file: VaultFile;
}
type TreeEntry = TreeDir | TreeFileNode;

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1; // 目录在前
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) if (e.dir) sortEntries(e.children);
  return entries;
}

function buildTree(files: VaultFile[]): TreeDir {
  const root: TreeDir = { dir: true, name: '', path: '', children: [] };
  const dirMap = new Map<string, TreeDir>([['', root]]);
  for (const f of files) {
    const segs = f.path.split('/');
    const fileName = segs.pop()!;
    let dirPath = '';
    let dir = root;
    for (const seg of segs) {
      dirPath = dirPath ? `${dirPath}/${seg}` : seg;
      let next = dirMap.get(dirPath);
      if (!next) {
        next = { dir: true, name: seg, path: dirPath, children: [] };
        dirMap.set(dirPath, next);
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ dir: false, name: fileName, path: f.path, file: f });
  }
  sortEntries(root.children);
  return root;
}

// ─── 仓库浏览器 ───────────────────────────────────────────────────────────────

export function VaultBrowser({
  vault,
  focusFile,
  onOpenGraph,
  onRename,
  onRemove,
  onCreatePack,
}: {
  vault: KnowledgeVault;
  /** 图谱「打开文件」跳转目标:文件列表就绪后自动选中并展示(相对路径)。 */
  focusFile?: string | null;
  /** 工具栏「图谱」入口(Obsidian 式图标,右栏顶部无切换条)。 */
  onOpenGraph: () => void;
  onRename: () => void;
  onRemove: () => void;
  onCreatePack: () => void;
}) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<VaultFile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(
    async (keepSelection: boolean) => {
      setLoading(true);
      setError('');
      try {
        const res = await listVaultFiles(vault.vault_id);
        setFiles(res.data.files);
        setTruncated(res.data.truncated);
        setSelected((prev) =>
          keepSelection && prev && res.data.files.some((f) => f.path === prev.path) ? prev : null,
        );
        // 首次加载默认展开第一层目录
        setExpanded((prev) => {
          if (prev.size > 0) return prev;
          return new Set(
            res.data.files.filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0]),
          );
        });
      } catch (err) {
        setError(translateVaultError(err));
      } finally {
        setLoading(false);
      }
    },
    [vault.vault_id],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // 图谱节点跳转:focusFile 出现且在当前文件列表中 → 选中它
  useEffect(() => {
    if (!focusFile) return;
    const hit = files.find((f) => f.path === focusFile);
    if (hit) setSelected(hit);
  }, [focusFile, files]);

  const tree = useMemo(() => buildTree(files), [files]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 80);
  }, [files, query]);

  return (
    <div data-testid="vault-browser" className="neo-kv-browser">
      <div className="neo-kv-toolbar">
        <div className="neo-kv-toolbar-title">
          <Folder size={14} />
          <span className="neo-kv-toolbar-name">{vault.name}</span>
          <span className="neo-kv-path" title={vault.path}>
            {vault.path}
          </span>
        </div>
        <div className="neo-kv-toolbar-meta">
          {loading ? '扫描中…' : `${files.length} 个文件`}
          {truncated && (
            <span className="neo-kv-badge-trunc" title="文件数超过上限,仅显示前 20000 个">
              已截断
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="neo-kp-btn neo-kp-btn-ghost"
          data-testid="vault-refresh"
        >
          <RefreshCw size={12} /> 刷新
        </button>
        <button
          onClick={onOpenGraph}
          className="neo-kp-btn neo-kp-btn-ghost"
          aria-label="查看图谱"
          title="查看知识图谱"
          data-testid="vault-graph-btn"
        >
          <Waypoints size={13} />
        </button>
        <div className="neo-kv-addwrap">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="neo-kp-btn neo-kp-btn-ghost"
            aria-label="仓库操作"
            data-testid="vault-menu-btn"
          >
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <>
              <div className="neo-kv-addmenu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="neo-kv-addmenu" data-testid="vault-menu">
                <button
                  className="neo-kv-addmenu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onCreatePack();
                  }}
                >
                  <FolderPlus size={13} /> 从此文件夹建知识包
                </button>
                <button
                  className="neo-kv-addmenu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                >
                  <Pencil size={13} /> 重命名
                </button>
                <button
                  className="neo-kv-addmenu-item neo-kv-addmenu-item--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                >
                  <Trash2 size={13} /> 移除注册…
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="neo-kp-alert">
          {error}
        </div>
      )}

      <div className="neo-kv-layout">
        <aside className="neo-kv-tree" data-testid="vault-tree">
          <div className="neo-kv-filter">
            <input
              data-testid="vault-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="过滤文件路径…"
              className="neo-kp-input"
            />
          </div>
          <div className="neo-kv-tree-scroll">
            {loading && <div className="neo-kv-hint">扫描仓库中…</div>}
            {!loading && files.length === 0 && !error && (
              <div className="neo-kv-hint">
                仓库里没有可识别的知识文件(md/txt/json/pdf/图片…)。
              </div>
            )}
            {!loading && matches !== null && (
              <>
                {matches.length === 0 && (
                  <div className="neo-kv-hint">没有匹配「{query}」的文件。</div>
                )}
                {matches.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelected(f)}
                    className={`neo-kv-row neo-kv-row--file${
                      selected?.path === f.path ? ' neo-kv-row--active' : ''
                    }`}
                    title={f.path}
                  >
                    {f.type === 'image' ? (
                      <ImageIcon size={13} />
                    ) : f.type === 'pdf' ? (
                      <FileIcon size={13} />
                    ) : (
                      <FileText size={13} />
                    )}
                    <span className="neo-kv-row-name">{f.path}</span>
                  </button>
                ))}
              </>
            )}
            {!loading && matches === null && (
              <TreeBranches
                node={tree}
                depth={0}
                expanded={expanded}
                selected={selected}
                onToggleDir={toggleDir}
                onSelect={setSelected}
              />
            )}
          </div>
        </aside>

        <section className="neo-kv-reader" data-testid="vault-reader">
          {selected ? (
            <VaultReader vault={vault} file={selected} />
          ) : (
            <div className="neo-kv-hint neo-kv-hint--center">
              {files.length > 0 ? '在左侧选择一个文件开始阅读。' : ''}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TreeBranches({
  node,
  depth,
  expanded,
  selected,
  onToggleDir,
  onSelect,
}: {
  node: TreeDir;
  depth: number;
  expanded: Set<string>;
  selected: VaultFile | null;
  onToggleDir: (dirPath: string) => void;
  onSelect: (f: VaultFile) => void;
}) {
  return (
    <>
      {node.children.map((child) => {
        const pad = { paddingLeft: 6 + depth * 14 };
        if (child.dir) {
          const isOpen = expanded.has(child.path);
          return (
            <div key={child.path}>
              <button
                onClick={() => onToggleDir(child.path)}
                className="neo-kv-row neo-kv-row--dir"
                style={pad}
              >
                <ChevronRight
                  size={13}
                  className={`neo-kv-chevron${isOpen ? ' neo-kv-chevron--open' : ''}`}
                />
                {isOpen ? <FolderOpen size={13} /> : <Folder size={13} />}
                <span className="neo-kv-row-name">{child.name}</span>
              </button>
              {isOpen && (
                <TreeBranches
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  selected={selected}
                  onToggleDir={onToggleDir}
                  onSelect={onSelect}
                />
              )}
            </div>
          );
        }
        return (
          <button
            key={child.path}
            onClick={() => onSelect(child.file)}
            className={`neo-kv-row neo-kv-row--file${
              selected?.path === child.path ? ' neo-kv-row--active' : ''
            }`}
            style={pad}
            title={child.path}
          >
            {child.file.type === 'image' ? (
              <ImageIcon size={13} />
            ) : child.file.type === 'pdf' ? (
              <FileIcon size={13} />
            ) : (
              <FileText size={13} />
            )}
            <span className="neo-kv-row-name">{child.name}</span>
          </button>
        );
      })}
    </>
  );
}

// ─── 阅读器 ──────────────────────────────────────────────────────────────────

const MD_EXTS = new Set(['md', 'markdown']);

function VaultReader({ vault, file }: { vault: KnowledgeVault; file: VaultFile }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');

  // 图片 / PDF 不拉文本,直接走 /api/fs/raw 直链(root = 仓库根)。
  const isText = file.type === 'doc';
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const isMd = MD_EXTS.has(ext);
  const abs = `${normalizeDirPath(vault.path)}/${file.path}`;
  const url = rawUrl(abs, vault.path);

  useEffect(() => {
    if (!isText) {
      setState('ok'); // 直链由 <img>/<iframe> 自己加载
      return;
    }
    let alive = true;
    setState('loading');
    setError('');
    readVaultFile(vault.vault_id, file.path)
      .then((res) => {
        if (!alive) return;
        setContent(res.data.content);
        setTruncated(res.data.truncated);
        setState('ok');
      })
      .catch((err) => {
        if (!alive) return;
        setError(translateVaultError(err));
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [vault.vault_id, file.path, isText]);

  return (
    <div className="neo-kv-reader-inner">
      <div className="neo-kv-reader-head">
        <div className="neo-kv-reader-title" title={file.path}>
          {file.path}
        </div>
        <div className="neo-kv-reader-meta">
          {fmtSize(file.size)} · {fmtDate(new Date(file.mtime).toISOString())}
          {truncated && <span className="neo-kv-badge-trunc">超 1MB 已截断</span>}
        </div>
        <button onClick={() => void openInEditor(abs)} className="neo-kp-btn neo-kp-btn-ghost">
          在系统中打开
        </button>
      </div>

      {state === 'error' && (
        <div role="alert" className="neo-kp-alert">
          {error}
        </div>
      )}

      {isText && state === 'loading' && <div className="neo-kv-hint">读取中…</div>}
      {isText && state === 'ok' && content !== null && (
        isMd ? <NeoMarkdown source={content} /> : <pre className="neo-kv-plain">{content}</pre>
      )}
      {!isText && file.type === 'image' && (
        <div className="neo-kv-media">
          <img src={url} alt={file.name} loading="lazy" />
        </div>
      )}
      {!isText && file.type === 'pdf' && (
        <div className="neo-kv-media neo-kv-media--pdf">
          <iframe src={url} title={file.name} />
        </div>
      )}
    </div>
  );
}

// ─── Modal:注册(回退)/ 新建仓库 / 重命名 / 移除 ───────────────────────────────

export function AddVaultModal({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: (v: KnowledgeVault) => void;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = path.trim().length > 0 && !submitting && !picking;

  const handlePick = async () => {
    setPicking(true);
    setLocalError('');
    try {
      const r = await pickNativeFolderEx();
      if (r.status === 'picked') {
        setPath(r.path);
        if (!name.trim()) setName(basenameOf(r.path));
      } else if (r.status === 'unsupported') {
        setLocalError('本机不支持原生选择器,请直接粘贴文件夹绝对路径。');
      }
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError('');
    try {
      const res = await addVault({ path: path.trim(), name: name.trim() || undefined });
      onAdded(res.data);
    } catch (err) {
      setLocalError(translateVaultError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="add-vault-modal" className="neo-kp-modal-mask">
      <div className="neo-kp-modal">
        <h2 className="neo-kp-modal-title">添加本地文件夹为知识库</h2>
        <div className="neo-kp-form">
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">文件夹路径</span>
            <div className="neo-kv-pick-row">
              <input
                data-testid="add-vault-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="粘贴绝对路径,如 D:\Notes(或点右侧系统选择)"
                className="neo-kp-input"
              />
              <button
                data-testid="add-vault-pick"
                onClick={handlePick}
                disabled={picking}
                className="neo-kp-btn neo-kp-btn-ghost"
              >
                {picking ? '选择中…' : '系统选择'}
              </button>
            </div>
          </label>
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">显示名(留空 = 文件夹名)</span>
            <input
              data-testid="add-vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={path ? basenameOf(path) : '如:我的笔记库'}
              className="neo-kp-input"
            />
          </label>
        </div>

        {localError && (
          <div role="alert" className="neo-kp-modal-error">
            {localError}
          </div>
        )}

        <div className="neo-kp-modal-actions">
          <button onClick={onCancel} className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn-md">
            取消
          </button>
          <button
            data-testid="add-vault-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="neo-kp-btn neo-kp-btn-primary neo-kp-btn-md"
          >
            {submitting ? '注册中…' : '添加仓库'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateVaultModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (v: KnowledgeVault) => void;
}) {
  const [name, setName] = useState('我的知识库');
  const [parent, setParent] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const parentBtnRef = useRef<HTMLButtonElement>(null);

  const canSubmit = name.trim().length > 0 && parent.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError('');
    try {
      const target = `${normalizeDirPath(parent.trim())}/${name.trim()}`;
      const res = await addVault({ path: target, name: name.trim(), create: true });
      onCreated(res.data);
    } catch (err) {
      setLocalError(translateVaultError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="create-vault-modal" className="neo-kp-modal-mask">
      <div className="neo-kp-modal">
        <h2 className="neo-kp-modal-title">新建本地仓库</h2>
        <p className="neo-kv-warn-text">在指定父目录下创建一个新的空文件夹并注册为知识库。</p>
        <div className="neo-kp-form">
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">仓库名</span>
            <input
              data-testid="create-vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="neo-kp-input"
            />
          </label>
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">父目录(已存在的文件夹)</span>
            <div className="neo-kv-pick-row">
              <input
                data-testid="create-vault-parent"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="如 D:\ 或 /Users/me"
                className="neo-kp-input"
              />
              <button
                ref={parentBtnRef}
                data-testid="create-vault-pick"
                onClick={() => setShowPicker((o) => !o)}
                className="neo-kp-btn neo-kp-btn-ghost"
              >
                浏览
              </button>
            </div>
          </label>
          {showPicker && (
            <DirPicker
              value={parent || undefined}
              anchorRef={parentBtnRef}
              title="选择父目录"
              pickHint="选「此目录」= 在此目录下新建仓库"
              onClose={() => setShowPicker(false)}
              onPick={(p) => {
                setShowPicker(false);
                setParent(p);
              }}
            />
          )}
        </div>

        {localError && (
          <div role="alert" className="neo-kp-modal-error">
            {localError}
          </div>
        )}

        <div className="neo-kp-modal-actions">
          <button onClick={onCancel} className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn-md">
            取消
          </button>
          <button
            data-testid="create-vault-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="neo-kp-btn neo-kp-btn-primary neo-kp-btn-md"
          >
            {submitting ? '创建中…' : '创建并注册'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RenameVaultModal({
  vault,
  onCancel,
  onRenamed,
}: {
  vault: KnowledgeVault;
  onCancel: () => void;
  onRenamed: (v: KnowledgeVault) => void;
}) {
  const [name, setName] = useState(vault.name);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await renameVault(vault.vault_id, name.trim());
      onRenamed(res.data);
    } catch (err) {
      setLocalError(translateVaultError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="rename-vault-modal" className="neo-kp-modal-mask">
      <div className="neo-kp-modal">
        <h2 className="neo-kp-modal-title">重命名仓库</h2>
        <div className="neo-kp-form">
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">显示名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="neo-kp-input"
              autoFocus
            />
          </label>
        </div>
        {localError && (
          <div role="alert" className="neo-kp-modal-error">
            {localError}
          </div>
        )}
        <div className="neo-kp-modal-actions">
          <button onClick={onCancel} className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn-md">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="neo-kp-btn neo-kp-btn-primary neo-kp-btn-md"
          >
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RemoveVaultModal({
  vault,
  onCancel,
  onRemoved,
}: {
  vault: KnowledgeVault;
  onCancel: () => void;
  onRemoved: (vaultId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await removeVault(vault.vault_id); // 服务端只删注册行(disk_untouched)
      onRemoved(vault.vault_id);
    } catch (err) {
      setLocalError(translateVaultError(err));
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="remove-vault-modal" className="neo-kp-modal-mask">
      <div className="neo-kp-modal">
        <h2 className="neo-kp-modal-title">移除仓库「{vault.name}」</h2>
        <p className="neo-kv-warn-text">
          仅从知识库移除注册,<strong>不会删除磁盘上的任何文件或文件夹</strong>。
          随时可以用相同路径重新添加。
        </p>
        <div className="neo-kv-path">{vault.path}</div>
        {localError && (
          <div role="alert" className="neo-kp-modal-error">
            {localError}
          </div>
        )}
        <div className="neo-kp-modal-actions">
          <button onClick={onCancel} className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn-md">
            取消
          </button>
          <button
            data-testid="remove-vault-confirm"
            onClick={handleConfirm}
            disabled={submitting}
            className="neo-kp-btn neo-kp-btn-danger neo-kp-btn-md"
          >
            {submitting ? '移除中…' : '移除注册'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * KnowledgePage — 知识库统一页(2026-08-19 合并重构批;08-20 图谱一等视图)。
 *
 * 布局(Shadow KbRail / ima 的单一知识源列表模式):
 *   左栏 = 扁平知识源列表(本地文件夹 + 知识包,图标区分,最近使用排序,
 *          当前项目文件夹置顶带「项目」徽章;栏头「知识库」+ [+ 添加 ▾])。
 *   右栏 = 内容/图谱双视图:文件夹 → 文件树阅读(VaultBrowser)/ 链接图谱
 *          (Obsidian 式,挂载即有);知识包 → sources 详情 / LightRAG 图谱;
 *          未选中 → 概览。
 *
 * NeoApp 联动:
 *   - 项目选择 → 知识库:读 NeoHost 同一存储键 sf-project-folder,项目文件夹
 *     自动注册为源并置顶(选项目 = 知识库立即可浏览/处理这个项目)。
 *   - NeoRail → 本页:initialSource prop(NeoNav.sourceId 深链)预选;
 *     全页路由 /knowledge 支持 ?source=vault:<id>|pack:<id>。
 *
 * 添加主路径 = 应用内 DirPicker(逐层浏览 + 路径粘贴,不弹系统窗口)。
 * 沿用:知识包状态轮询;文件只读铁律(移除仓库只删注册行,REG-1)。
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Database,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Waypoints,
} from 'lucide-react';
import {
  createPack,
  deletePack,
  getPack,
  KnowledgeApiError,
  listPacks,
  reindexPack,
} from '../api/knowledge';
import { addVault, listVaults } from '../api/knowledgeVaults';
import type {
  CreatePackPayload,
  FreshnessPolicy,
  KnowledgePack,
  KnowledgeSourceInput,
  PackStatus,
  SourceType,
} from '../common/types/knowledge';
import type { KnowledgeVault } from '../common/types/knowledgeVault';
import { useI18n } from '../common/i18n';
import DirPicker from '../components/DirPicker';
import { PackDocTree } from '../components/knowledge/PackDocTree';
// 图谱页懒加载(ForceGraph2D 很重,只在切到「图谱」视图时才拉 chunk)
const KnowledgeGraphPage = lazy(() => import('./KnowledgeGraphPage'));
import {
  basenameOf,
  CreateVaultModal,
  fmtDate,
  normalizeDirPath,
  RemoveVaultModal,
  RenameVaultModal,
  translateVaultError,
  VaultBrowser,
} from '../components/knowledge/LocalVaults';
import './knowledge-neo.css';

/** NeoApp 项目选择器与 NeoHost 共用的存储键(两处通用,NeoHost.tsx 注释约定)。 */
const LS_PROJECT_FOLDER = 'sf.project-folder';

// ─── 源引用(Neo 深链 / URL 查询参数共用)────────────────────────────────────

export type SourceRef = { kind: 'vault' | 'pack'; id: string };

/** 'vault:<id>' / 'pack:<id>' → SourceRef;不合法返回 null。 */
export function parseSourceId(s: string | null | undefined): SourceRef | null {
  if (!s) return null;
  const idx = s.indexOf(':');
  if (idx <= 0) return null;
  const kind = s.slice(0, idx);
  const id = s.slice(idx + 1);
  if ((kind === 'vault' || kind === 'pack') && id) return { kind, id };
  return null;
}

const POLL_INTERVAL_MS = 3000;
// M4: cap polling at ~3 minutes per pack so a stuck `indexing` doesn't burn
// network bandwidth indefinitely.
const POLL_MAX_TICKS = 60;

function StatusBadge({ status }: { status: PackStatus }) {
  return (
    <span data-testid={`pack-status-${status}`} className={`neo-kp-pill neo-kp-pill--${status}`}>
      {status}
    </span>
  );
}

/** lucide alert-triangle 内联版(替代旧 iconRegistry 的 KnowledgeAlert)。 */
function AlertTriangleIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function translateError(err: unknown): string {
  if (err instanceof KnowledgeApiError) {
    if (err.code === 'KNOWLEDGE_PACK_NOT_FOUND' || err.status === 404) {
      return '该 KnowledgePack 已被删除或不存在。';
    }
    if (err.code === 'KNOWLEDGE_API_BAD_RESPONSE') {
      return '服务返回了非 JSON 响应(请求可能被网关/静态页拦截),请确认 API 地址与服务已启动。';
    }
    if (err.status >= 500) return '服务暂时不可用,请稍后重试。';
    if (err.status === 422) return '提交格式不合法,请检查必填字段(name / sources)。';
    return `请求失败 (code=${err.code})。`;
  }
  return '网络错误,请稍后重试。';
}

function RagBackendBadge({ backend }: { backend?: string }) {
  const isLightrag = backend === 'lightrag';
  return (
    <span
      data-testid="rag-backend-badge"
      title={
        isLightrag
          ? 'LightRAG (graph + vector index) is active. Set LIGHTRAG_ENABLED=true in .env to enable.'
          : 'Keyword stub index active. Set LIGHTRAG_ENABLED=true in .env to enable LightRAG.'
      }
      className={`neo-kp-pill neo-kp-pill--rag${isLightrag ? ' neo-kp-pill--rag-lightrag' : ''}`}
    >
      {isLightrag ? 'RAG: LightRAG' : 'RAG: keyword stub'}
    </span>
  );
}

// ─── 页面 ─────────────────────────────────────────────────────────────────────

/**
 * 双形态:路由页 /knowledge 全页模式;NeoApp 中栏 `<KnowledgePage embedded
 * initialSource />` 内嵌变体(rail 常驻,NeoNav.sourceId 深链预选)。
 */
export default function KnowledgePage({
  embedded = false,
  initialSource = null,
}: { embedded?: boolean; initialSource?: SourceRef | null } = {}) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  // 预选优先级:prop(Neo 深链)> ?source= 查询参数
  const deepLink = initialSource ?? parseSourceId(searchParams.get('source'));

  // ── 知识包(原列表逻辑保留:加载 + indexing 轮询)────────────────────────
  const [packs, setPacks] = useState<KnowledgePack[]>([]);
  const [packsStatus, setPacksStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ragBackend, setRagBackend] = useState<string | undefined>(undefined);
  const pollTimers = useRef<Map<string, { handle: number; ticks: number }>>(new Map());
  const stalledPolls = useRef<Set<string>>(new Set());
  const packsRef = useRef<KnowledgePack[]>([]);
  packsRef.current = packs;

  // ── 本地仓库 ────────────────────────────────────────────────────────────
  const [vaults, setVaults] = useState<KnowledgeVault[]>([]);
  const [vaultsStatus, setVaultsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // ── 选中 / 视图(内容|图谱)/ 弹窗 / 菜单 ─────────────────────────────────
  const [selection, setSelection] = useState<SourceRef | null>(deepLink);
  const [viewMode, setViewMode] = useState<'content' | 'graph'>('content');
  // 图谱「打开文件」跳转目标(相对路径):切回内容视图并让 VaultBrowser 选中该文件
  const [focusFile, setFocusFile] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 应用内目录选择器(DirPicker):主路径,不弹系统窗口;pickerInit 记住上次位置
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [pickerInit, setPickerInit] = useState<string | undefined>(undefined);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [showCreateVault, setShowCreateVault] = useState(false);
  const [renaming, setRenaming] = useState<KnowledgeVault | null>(null);
  const [removing, setRemoving] = useState<KnowledgeVault | null>(null);
  // 新建知识包弹窗(可预填:从文件夹源「建知识包」入口带入路径)
  const [createPackPrefill, setCreatePackPrefill] = useState<{
    name: string;
    sourceRef: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // ── 项目文件夹联动(NeoHost sf.project-folder)──────────────────────────
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const autoRegisterRef = useRef<string | null>(null);

  // ── 数据加载 ────────────────────────────────────────────────────────────
  const refreshPacks = useCallback(async () => {
    setPacksStatus('loading');
    try {
      const res = await listPacks({ limit: 50 });
      setPacks(res.data.packs);
      if (res.meta.rag_backend) setRagBackend(res.meta.rag_backend);
      setPacksStatus('success');
    } catch (err) {
      setPacksStatus('error');
      setErrorMsg(translateError(err));
    }
  }, []);

  const refreshVaults = useCallback(async () => {
    setVaultsStatus('loading');
    try {
      const res = await listVaults();
      setVaults(res.data.vaults);
      setVaultsStatus('success');
    } catch (err) {
      setVaultsStatus('error');
      setErrorMsg(translateVaultError(err));
    }
  }, []);

  useEffect(() => {
    refreshPacks();
    refreshVaults();
    try {
      setProjectFolder((localStorage.getItem(LS_PROJECT_FOLDER) || '').trim() || null);
    } catch {
      setProjectFolder(null);
    }
  }, [refreshPacks, refreshVaults]);

  // 项目文件夹自动注册(选项目 = 知识库自动有这个源):幂等,每路径只试一次,
  // 失败(路径已删等)静默 —— 下次挂载再试。
  useEffect(() => {
    if (!projectFolder || vaultsStatus !== 'success') return;
    if (autoRegisterRef.current === projectFolder) return;
    const exists = vaults.some((v) => normalizeDirPath(v.path) === normalizeDirPath(projectFolder));
    if (exists) return;
    autoRegisterRef.current = projectFolder;
    addVault({ path: projectFolder })
      .then(() => refreshVaults())
      .catch(() => {
        /* 路径可能已被删除 —— 不打扰用户 */
      });
  }, [projectFolder, vaultsStatus, vaults, refreshVaults]);

  // ── 知识包轮询(原逻辑)─────────────────────────────────────────────────
  const stopPoll = useCallback((packId: string) => {
    const timers = pollTimers.current;
    const entry = timers.get(packId);
    if (entry !== undefined) {
      window.clearInterval(entry.handle);
      timers.delete(packId);
    }
  }, []);

  const startPoll = useCallback(
    (packId: string) => {
      const timers = pollTimers.current;
      if (timers.has(packId)) return;
      if (stalledPolls.current.has(packId)) return;
      const handle = window.setInterval(async () => {
        const entry = timers.get(packId);
        if (!entry) return;
        entry.ticks += 1;
        if (entry.ticks > POLL_MAX_TICKS) {
          stalledPolls.current.add(packId);
          window.clearInterval(entry.handle);
          timers.delete(packId);
          return;
        }
        try {
          const res = await getPack(packId);
          const updated = res.data;
          setPacks((prev) => prev.map((p) => (p.pack_id === packId ? updated : p)));
          if (updated.status === 'ready' || updated.status === 'failed') {
            window.clearInterval(entry.handle);
            timers.delete(packId);
          }
        } catch {
          // swallow polling errors; user can refresh manually
        }
      }, POLL_INTERVAL_MS);
      timers.set(packId, { handle, ticks: 0 });
    },
    [],
  );

  useEffect(() => {
    packs.forEach((p) => {
      if (p.status === 'pending' || p.status === 'indexing') {
        startPoll(p.pack_id);
      } else {
        stopPoll(p.pack_id);
      }
    });
  }, [packs, startPoll, stopPoll]);

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((entry) => window.clearInterval(entry.handle));
      pollTimers.current.clear();
      stalledPolls.current.clear();
    };
  }, []);

  // ── 深链与自动选中 ───────────────────────────────────────────────────────
  // NeoApp 下发新 initialSource(rail 点了另一行)→ 应用选中
  useEffect(() => {
    if (initialSource) setSelection(initialSource);
  }, [initialSource]);

  // 换源时右栏视图回到「内容」(图谱是按源切的临时视图)
  useEffect(() => {
    setViewMode('content');
  }, [selection?.kind, selection?.id]);

  // 无选中且无深链时,自动选中第一个源(Shadow 同款:进来就有内容)
  useEffect(() => {
    if (selection) return;
    if (vaultsStatus === 'success' && vaults.length > 0) {
      setSelection({ kind: 'vault', id: vaults[0].vault_id });
      return;
    }
    if (packsStatus === 'success' && packs.length > 0) {
      setSelection({ kind: 'pack', id: packs[0].pack_id });
    }
  }, [selection, vaultsStatus, vaults, packsStatus, packs]);

  // ── 统一源列表(扁平,最近使用排序,项目源置顶)───────────────────────────
  const railItems = useMemo(() => {
    const norm = projectFolder ? normalizeDirPath(projectFolder) : null;
    const items = [
      ...vaults.map((v) => ({
        kind: 'vault' as const,
        id: v.vault_id,
        vault: v,
        ts: Date.parse(v.last_opened_at ?? v.created_at) || 0,
        isProject: norm !== null && normalizeDirPath(v.path) === norm,
      })),
      ...packs.map((p) => ({
        kind: 'pack' as const,
        id: p.pack_id,
        pack: p,
        ts: Date.parse(p.updated_at) || 0,
        isProject: false,
      })),
    ].sort((a, b) => {
      if (a.isProject !== b.isProject) return a.isProject ? -1 : 1; // 项目置顶
      return b.ts - a.ts;
    });
    return items;
  }, [vaults, packs, projectFolder]);

  // ── 右侧三态解析 ────────────────────────────────────────────────────────
  const selVault =
    selection?.kind === 'vault' ? vaults.find((v) => v.vault_id === selection.id) : undefined;
  const selPack =
    selection?.kind === 'pack' ? packs.find((p) => p.pack_id === selection.id) : undefined;

  // ── 添加动作(Shadow 三动作;选目录主路径 = 应用内 DirPicker,不弹系统窗)──
  const registerVault = useCallback(
    async (path: string) => {
      try {
        const res = await addVault({ path });
        await refreshVaults();
        setSelection({ kind: 'vault', id: res.data.vault_id });
        setErrorMsg('');
      } catch (err) {
        setErrorMsg(translateVaultError(err));
      }
    },
    [refreshVaults],
  );

  const handleOpenFolder = useCallback(() => {
    setAddMenuOpen(false);
    setShowDirPicker(true);
  }, []);

  const handleCreatePack = useCallback(async (payload: CreatePackPayload) => {
    try {
      const res = await createPack(payload);
      setPacks((prev) => [res.data, ...prev]);
      stalledPolls.current.delete(res.data.pack_id);
      setCreatePackPrefill(null);
      setSelection({ kind: 'pack', id: res.data.pack_id });
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(translateError(err));
      throw err;
    }
  }, []);

  const handleDeletePack = useCallback(
    async (packId: string) => {
      try {
        await deletePack(packId);
        setPacks((prev) => prev.filter((p) => p.pack_id !== packId));
        stopPoll(packId);
        setSelection((s) => (s?.id === packId ? null : s));
      } catch (err) {
        setErrorMsg(translateError(err));
      }
    },
    [stopPoll],
  );

  const handleReindex = useCallback(
    async (packId: string) => {
      try {
        stalledPolls.current.delete(packId);
        const res = await reindexPack(packId);
        setPacks((prev) => prev.map((p) => (p.pack_id === packId ? res.data : p)));
        startPoll(packId);
      } catch (err) {
        setErrorMsg(translateError(err));
      }
    },
    [startPoll],
  );

  const loading = packsStatus === 'loading' || vaultsStatus === 'loading';

  return (
    <div data-testid="knowledge-page" className={`neo-kp${embedded ? ' neo-kp--inline' : ''}`}>
      <div className={`neo-kv-workspace${embedded ? ' neo-kv-workspace--inline' : ''}`}>
        {/* ── 左栏:知识源列表 ─────────────────────────────────────────── */}
        <aside className="neo-kv-rail">
          <div className="neo-kv-rail-head">
            <h1 className="neo-kv-rail-title">
              {t('neo.knowledge.railTitle', { defaultValue: '知识库' })}
            </h1>
            <div className="neo-kv-addwrap">
              <button
                ref={addBtnRef}
                data-testid="kv-add-btn"
                onClick={() => setAddMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn--sm"
              >
                <Plus size={13} /> {t('neo.knowledge.add', { defaultValue: '添加' })}
                <ChevronDown size={12} />
              </button>
              {addMenuOpen && (
                <>
                  <div className="neo-kv-addmenu-overlay" onClick={() => setAddMenuOpen(false)} />
                  <div className="neo-kv-addmenu" role="menu" data-testid="kv-add-menu">
                    <button
                      className="neo-kv-addmenu-item"
                      role="menuitem"
                      onClick={handleOpenFolder}
                      data-testid="kv-add-open-folder"
                    >
                      <FolderOpen size={13} /> 打开本地文件夹…
                    </button>
                    <button
                      className="neo-kv-addmenu-item"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setShowCreateVault(true);
                      }}
                      data-testid="kv-add-create-vault"
                    >
                      <FolderPlus size={13} /> 新建本地仓库…
                    </button>
                    <button
                      className="neo-kv-addmenu-item"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setCreatePackPrefill({ name: '', sourceRef: '' });
                      }}
                      data-testid="kv-add-create-pack"
                    >
                      <Database size={13} /> 新建知识包…
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="neo-kv-rail-list" data-testid="kv-rail-list">
            {loading && railItems.length === 0 && (
              <div className="neo-kv-hint">
                {t('neo.knowledge.loading', { defaultValue: '加载中…' })}
              </div>
            )}
            {!loading && railItems.length === 0 && (
              <div className="neo-kv-hint">还没有知识源 —— 点右上「添加」开始。</div>
            )}
            {railItems.map((item) => {
              const active = selection?.kind === item.kind && selection.id === item.id;
              const testid =
                item.kind === 'vault' ? `rail-vault-${item.id}` : `rail-pack-${item.id}`;
              if (item.kind === 'vault') {
                return (
                  <button
                    key={`v-${item.id}`}
                    data-testid={testid}
                    onClick={() => setSelection({ kind: 'vault', id: item.id })}
                    className={`neo-kv-rail-row${active ? ' neo-kv-rail-row--active' : ''}`}
                    title={item.vault.path}
                  >
                    <Folder size={14} className="neo-kv-rail-row-icon" />
                    <span className="neo-kv-rail-row-name">{item.vault.name}</span>
                    {item.isProject && <span className="neo-kv-badge-project">项目</span>}
                    <span
                      className={`neo-kv-dot${
                        item.vault.health === 'active' ? ' neo-kv-dot--ok' : ' neo-kv-dot--err'
                      }`}
                      title={item.vault.health === 'active' ? '目录正常' : '路径已不存在'}
                    />
                  </button>
                );
              }
              return (
                <button
                  key={`p-${item.id}`}
                  data-testid={testid}
                  onClick={() => setSelection({ kind: 'pack', id: item.id })}
                  className={`neo-kv-rail-row${active ? ' neo-kv-rail-row--active' : ''}`}
                  title={item.pack.description}
                >
                  <Database size={14} className="neo-kv-rail-row-icon" />
                  <span className="neo-kv-rail-row-name">{item.pack.name}</span>
                  <span className={`neo-kv-rail-row-meta neo-kp-pill--${item.pack.status}`}>
                    {item.pack.status}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── 右栏:内容/图谱双视图 + 三态 ──────────────────────────────── */}
        <section className="neo-kv-detail">
          {errorMsg && railItems.length === 0 && (
            <div role="alert" className="neo-kp-alert">
              {errorMsg}
            </div>
          )}

          {selVault && selVault.health !== 'active' && (
            <MissingVaultPane vault={selVault} onRemove={() => setRemoving(selVault)} />
          )}

          {viewMode === 'content' && selVault?.health === 'active' && (
            <VaultBrowser
              key={selVault.vault_id}
              vault={selVault}
              focusFile={focusFile}
              onOpenGraph={() => setViewMode('graph')}
              onRename={() => setRenaming(selVault)}
              onRemove={() => setRemoving(selVault)}
              onCreatePack={() =>
                setCreatePackPrefill({
                  name: selVault.name,
                  sourceRef: selVault.path,
                })
              }
            />
          )}

          {viewMode === 'content' && !selVault && selPack && (
            <PackDetail
              pack={selPack}
              onOpenGraph={() => setViewMode('graph')}
              onReindex={() => handleReindex(selPack.pack_id)}
              onDelete={() => handleDeletePack(selPack.pack_id)}
            />
          )}

          {viewMode === 'graph' && (selVault?.health === 'active' || selPack) && (
            <div className="neo-kv-graphpane">
              <div className="neo-kv-graphpane-head">
                <button
                  onClick={() => setViewMode('content')}
                  className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn--sm"
                  data-testid="kv-graph-back"
                >
                  ← {selVault ? '文件' : '内容'}
                </button>
              </div>
              <div className="neo-kv-graphpane-body">
                <Suspense
                  fallback={<div className="neo-kv-hint neo-kv-hint--center">图谱组件加载中…</div>}
                >
                  {selVault ? (
                    <KnowledgeGraphPage
                      embedded
                      vaultId={selVault.vault_id}
                      onNodeOpen={(relPath) => {
                        setFocusFile(relPath);
                        setViewMode('content');
                      }}
                    />
                  ) : (
                    selPack && <KnowledgeGraphPage embedded packId={selPack.pack_id} />
                  )}
                </Suspense>
              </div>
            </div>
          )}

          {!selVault && !selPack && (
            <OverviewPane
              vaultCount={vaults.length}
              packCount={packs.length}
              projectFolder={projectFolder}
              ragBackend={ragBackend}
              onAdd={() => setAddMenuOpen(true)}
            />
          )}
        </section>
      </div>

      {showDirPicker && (
        <DirPicker
          value={pickerInit}
          anchorRef={addBtnRef}
          title="选择知识库文件夹"
          pickHint="选「此目录」= 挂载为知识库仓库"
          onClose={() => setShowDirPicker(false)}
          onPick={(p) => {
            setShowDirPicker(false);
            setPickerInit(p);
            void registerVault(p);
          }}
        />
      )}
      {showCreateVault && (
        <CreateVaultModal
          onCancel={() => setShowCreateVault(false)}
          onCreated={async (v) => {
            setShowCreateVault(false);
            await refreshVaults();
            setSelection({ kind: 'vault', id: v.vault_id });
          }}
        />
      )}
      {renaming && (
        <RenameVaultModal
          vault={renaming}
          onCancel={() => setRenaming(null)}
          onRenamed={(v) => {
            setVaults((prev) => prev.map((x) => (x.vault_id === v.vault_id ? v : x)));
            setRenaming(null);
          }}
        />
      )}
      {removing && (
        <RemoveVaultModal
          vault={removing}
          onCancel={() => setRemoving(null)}
          onRemoved={(vaultId) => {
            setVaults((prev) => prev.filter((x) => x.vault_id !== vaultId));
            setSelection((s) => (s?.id === vaultId ? null : s));
            setRemoving(null);
          }}
        />
      )}
      {createPackPrefill && (
        <CreatePackModal
          prefill={createPackPrefill}
          onCancel={() => setCreatePackPrefill(null)}
          onSubmit={handleCreatePack}
        />
      )}
    </div>
  );
}

// ─── 右栏:包详情(原 PackCard 展开态改造)─────────────────────────────────────

function PackDetail({
  pack,
  onOpenGraph,
  onReindex,
  onDelete,
}: {
  pack: KnowledgePack;
  onOpenGraph: () => void;
  onReindex: () => void;
  onDelete: () => void;
}) {
  return (
    <div data-testid={`pack-detail-${pack.pack_id}`} className="neo-kv-pd">
      <div className="neo-kv-pd-head">
        <Database size={16} className="neo-kv-rail-row-icon" />
        <span className="neo-kv-pd-title">{pack.name}</span>
        <StatusBadge status={pack.status} />
        <div className="neo-kv-pd-actions">
          <button
            data-testid={`pack-graph-btn`}
            onClick={onOpenGraph}
            className="neo-kp-btn neo-kp-btn-ghost"
            aria-label="查看图谱"
            title="查看知识图谱"
          >
            <Waypoints size={13} />
          </button>
          <button
            data-testid={`reindex-${pack.pack_id}`}
            onClick={onReindex}
            className="neo-kp-btn neo-kp-btn-ghost"
          >
            Reindex
          </button>
          <button
            data-testid={`delete-${pack.pack_id}`}
            onClick={onDelete}
            className="neo-kp-btn neo-kp-btn-danger"
          >
            Delete
          </button>
        </div>
      </div>

      {pack.description && <p className="neo-kv-pd-desc">{pack.description}</p>}
      <div className="neo-kv-pd-meta">
        {pack.sources.length} sources · created {fmtDate(pack.created_at)} · updated{' '}
        {fmtDate(pack.updated_at)}
        {pack.citation_required && (
          <span className="neo-kp-pill neo-kp-pill--ready">citation:required</span>
        )}
      </div>
      <div className="neo-kv-pd-retrieval">
        retrieval: <code>{pack.retrieval_profile.mode}</code> · top_k=
        {pack.retrieval_profile.top_k} · chunk_size={pack.retrieval_profile.chunk_size} · overlap=
        {pack.retrieval_profile.overlap}
      </div>

      <div className="neo-kv-pd-section-label">Sources</div>
      <div className="neo-kv-pd-sources">
        {pack.sources.map((s) => (
          <div key={s.source_id} className="neo-kp-source">
            <code className="neo-kp-source-type">{s.source_type}</code>
            <span className="neo-kp-source-ref">{s.source_ref}</span>
            <span
              className={`neo-kp-source-status${
                s.ingest_status === 'failed'
                  ? ' neo-kp-source-status--failed'
                  : s.ingest_status === 'done'
                    ? ' neo-kp-source-status--done'
                    : s.ingest_status === 'processing'
                      ? ' neo-kp-source-status--processing'
                      : ''
              }`}
            >
              {s.ingest_status}
              {s.chunk_count > 0 ? ` · ${s.chunk_count} chunks` : ''}
            </span>
            {s.error_message && (
              <span className="neo-kp-source-err" title={s.error_message}>
                <AlertTriangleIcon size={11} />
              </span>
            )}
          </div>
        ))}
      </div>

      <PackDocTree packId={pack.pack_id} />
    </div>
  );
}

// ─── 右栏:仓库缺失面板 ───────────────────────────────────────────────────────

function MissingVaultPane({ vault, onRemove }: { vault: KnowledgeVault; onRemove: () => void }) {
  return (
    <div className="neo-kv-center" data-testid={`vault-missing-${vault.vault_id}`}>
      <Folder size={28} className="neo-kv-center-icon" />
      <p className="neo-kv-center-t1">「{vault.name}」的路径已不存在</p>
      <p className="neo-kv-path">{vault.path}</p>
      <p className="neo-kv-center-t2">
        文件夹可能被移动或删除。把文件夹放回原位,或移除注册后重新添加。
      </p>
      <button onClick={onRemove} className="neo-kp-btn neo-kp-btn-danger neo-kp-btn-md">
        移除注册
      </button>
    </div>
  );
}

// ─── 右栏:概览 ───────────────────────────────────────────────────────────────

function OverviewPane({
  vaultCount,
  packCount,
  projectFolder,
  ragBackend,
  onAdd,
}: {
  vaultCount: number;
  packCount: number;
  projectFolder: string | null;
  ragBackend?: string;
  /** 打开「+ 添加」菜单(单一入口,菜单内再分三个动作)。 */
  onAdd: () => void;
}) {
  const empty = vaultCount === 0 && packCount === 0;
  return (
    <div className="neo-kv-center" data-testid="knowledge-overview">
      {empty ? (
        <>
          <p className="neo-kv-center-t1">从添加第一个知识源开始</p>
          <button onClick={onAdd} className="neo-kv-guide-card" data-testid="guide-add">
            <Plus size={20} />
            <span className="neo-kv-guide-title">添加知识源</span>
          </button>
        </>
      ) : (
        <>
          {projectFolder && (
            <div className="neo-kv-overview-project">
              <Folder size={15} />
              <span className="neo-kv-overview-project-name">{basenameOf(projectFolder)}</span>
              <span className="neo-kv-badge-project">项目</span>
              <span className="neo-kv-path">{projectFolder}</span>
            </div>
          )}
          <p className="neo-kv-center-t1">
            {vaultCount} 个本地仓库 · {packCount} 个知识包
          </p>
          <p className="neo-kv-center-t2">在左侧选择一个知识源开始浏览。</p>
          <RagBackendBadge backend={ragBackend} />
        </>
      )}
    </div>
  );
}

// ─── 新建知识包 Modal(可预填:文件夹源「建知识包」入口)──────────────────────

function CreatePackModal({
  prefill,
  onCancel,
  onSubmit,
}: {
  prefill: { name: string; sourceRef: string };
  onCancel: () => void;
  onSubmit: (p: CreatePackPayload) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(prefill.name);
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>(prefill.sourceRef ? 'file' : 'text');
  const [sourceRef, setSourceRef] = useState(prefill.sourceRef);
  const [citationRequired, setCitationRequired] = useState(false);
  const [freshnessPolicy, setFreshnessPolicy] = useState<FreshnessPolicy>('on_demand');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = name.trim().length > 0 && sourceRef.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError('');
    try {
      const sources: KnowledgeSourceInput[] = [
        { source_type: sourceType, source_ref: sourceRef.trim() },
      ];
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        sources,
        citation_required: citationRequired,
        freshness_policy: freshnessPolicy,
      });
    } catch (err) {
      setLocalError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="create-pack-modal" className="neo-kp-modal-mask">
      <div className="neo-kp-modal">
        <h2 className="neo-kp-modal-title">
          {t('neo.knowledge.modalTitle', { defaultValue: '新建 KnowledgePack' })}
        </h2>
        <div className="neo-kp-form">
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">
              {t('neo.knowledge.fieldName', { defaultValue: '名称' })}
            </span>
            <input
              data-testid="modal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('neo.knowledge.fieldNamePh', { defaultValue: '如:项目说明文档' })}
              className="neo-kp-input"
            />
          </label>
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">
              {t('neo.knowledge.fieldDesc', { defaultValue: '描述' })}
            </span>
            <textarea
              data-testid="modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="neo-kp-input"
            />
          </label>
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">
              {t('neo.knowledge.fieldSourceType', { defaultValue: 'Source 类型' })}
            </span>
            <select
              data-testid="modal-source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="neo-kp-input"
            >
              <option value="text">text(直接输入文本)</option>
              <option value="file">file(本地文件路径)</option>
              <option value="url">url(HTTP 链接)</option>
              <option value="dataset">dataset(外部数据集 ref)</option>
            </select>
          </label>
          <label className="neo-kp-field">
            <span className="neo-kp-field-label">
              {sourceType === 'text'
                ? t('neo.knowledge.fieldSourceContent', { defaultValue: 'Source 内容' })
                : t('neo.knowledge.fieldSourceRef', { defaultValue: 'Source 引用' })}
            </span>
            <textarea
              data-testid="modal-source-ref"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              rows={sourceType === 'text' ? 4 : 1}
              placeholder={
                sourceType === 'file'
                  ? '/path/to/file.md'
                  : sourceType === 'url'
                    ? 'https://example.com/docs/intro'
                    : sourceType === 'dataset'
                      ? 'dataset:my-dataset@v1'
                      : t('neo.knowledge.fieldSourceRefPh', { defaultValue: '直接粘贴文本' })
              }
              className="neo-kp-input"
            />
          </label>
          <div className="neo-kp-form-row">
            <label className="neo-kp-check">
              <input
                data-testid="modal-citation-required"
                type="checkbox"
                checked={citationRequired}
                onChange={(e) => setCitationRequired(e.target.checked)}
              />
              {t('neo.knowledge.fieldCitation', { defaultValue: '需要引用出处' })}
            </label>
            <label className="neo-kp-field neo-kp-field--inline">
              <span className="neo-kp-field-label">
                {t('neo.knowledge.fieldFreshness', { defaultValue: '刷新策略' })}
              </span>
              <select
                data-testid="modal-freshness"
                value={freshnessPolicy}
                onChange={(e) => setFreshnessPolicy(e.target.value as FreshnessPolicy)}
                className="neo-kp-input neo-kp-input--sm"
              >
                <option value="on_demand">on_demand</option>
                <option value="always">always</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
            </label>
          </div>
        </div>

        {localError && (
          <div role="alert" className="neo-kp-modal-error">
            {localError}
          </div>
        )}

        <div className="neo-kp-modal-actions">
          <button onClick={onCancel} className="neo-kp-btn neo-kp-btn-ghost neo-kp-btn-md">
            {t('neo.knowledge.cancel', { defaultValue: '取消' })}
          </button>
          <button
            data-testid="modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="neo-kp-btn neo-kp-btn-primary neo-kp-btn-md"
          >
            {submitting
              ? t('neo.knowledge.creating', { defaultValue: '创建中…' })
              : t('neo.knowledge.submit', { defaultValue: '创建' })}
          </button>
        </div>
      </div>
    </div>
  );
}

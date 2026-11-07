/**
 * KnowledgePage — 知识库统一页（2026-11-07 知识库统一批：多模态记忆库唯一实现）。
 *
 * 统一背景：知识库此前有三套并存实现（旧 KnowledgePack /api/knowledge、
 * Node 本地仓库 vaults、多模态记忆库 /api/memory-bank）。本批以记忆库为唯一
 * 实现——本地文件夹语义 =「上传/导入内容」：DirPicker 选路径 → POST
 * /api/memory-bank/packs/{id}/folders 目录批量摄入（checksum 幂等去重）；
 * 挂载浏览/图谱下线，浏览语义由包的「来源列表 + 原文回读」承接。
 *
 * 布局（Shadow KbRail 单一知识源列表模式）：
 *   左栏 = 记忆库知识包列表（栏头「知识库」+ [+ 添加 ▾]：新建知识包 /
 *          导入本地文件夹）。右栏 = 选中包详情（MemoryBankPanel：上传、
 *          来源列表、检索、删除）；未选中 → 概览。
 *
 * NeoApp 联动：NeoApp 中栏 `<KnowledgePage embedded initialSource />`
 * （NeoNav.sourceId 深链 'pack:<id>' 预选）；全页路由 /knowledge 支持
 * ?source=pack:<id>。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Database, FolderOpen, Plus } from 'lucide-react';
import {
  MemoryBankApiError,
  createPack,
  ingestFolder,
  listPacks,
} from '../api/memoryBank';
import type { MemoryBankPack } from '../api/memoryBank';
import { useI18n } from '../common/i18n';
import DirPicker from '../components/DirPicker';
// 多模态记忆库包详情面板（PR #7 设计移植）：BM25+向量混合检索，/api/memory-bank
import MemoryBankPanel from '../components/knowledge/MemoryBankPanel';
import './knowledge-neo.css';

// ─── 源引用(Neo 深链 / URL 查询参数共用)────────────────────────────────────

export type SourceRef = { kind: 'pack'; id: string };

/** 'pack:<id>' → SourceRef;不合法返回 null。 */
export function parseSourceId(s: string | null | undefined): SourceRef | null {
  if (!s) return null;
  const idx = s.indexOf(':');
  if (idx <= 0) return null;
  const kind = s.slice(0, idx);
  const id = s.slice(idx + 1);
  if (kind === 'pack' && id) return { kind, id };
  return null;
}

function translateError(err: unknown): string {
  if (err instanceof MemoryBankApiError) {
    if (err.code === 'MEMORY_BANK_PACK_NOT_FOUND' || err.status === 404) {
      return '该知识包已被删除或不存在。';
    }
    if (err.code === 'MEMORY_BANK_BAD_RESPONSE') {
      return '服务返回了非 JSON 响应(请求可能被网关/静态页拦截),请确认 API 地址与服务已启动。';
    }
    if (err.status >= 500) return '服务暂时不可用,请稍后重试。';
    return `请求失败 (code=${err.code})。`;
  }
  return '网络错误,请稍后重试。';
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

  const [packs, setPacks] = useState<MemoryBankPack[]>([]);
  const [packsStatus, setPacksStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [selection, setSelection] = useState<SourceRef | null>(deepLink);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 目录批量摄入后递增 → MemoryBankPanel 重拉来源列表
  const [reloadKey, setReloadKey] = useState(0);
  // 应用内目录选择器(DirPicker):主路径,不弹系统窗口;pickerInit 记住上次位置
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [pickerInit, setPickerInit] = useState<string | undefined>(undefined);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [showCreatePack, setShowCreatePack] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── 数据加载 ────────────────────────────────────────────────────────────
  const refreshPacks = useCallback(async () => {
    setPacksStatus('loading');
    try {
      const res = await listPacks();
      setPacks(res.data.packs);
      setPacksStatus('success');
    } catch (err) {
      setPacksStatus('error');
      setErrorMsg(translateError(err));
    }
  }, []);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  // ── 深链与自动选中 ───────────────────────────────────────────────────────
  // NeoApp 下发新 initialSource(rail 点了另一行)→ 应用选中
  useEffect(() => {
    if (initialSource) setSelection(initialSource);
  }, [initialSource]);

  // 无选中且无深链时,自动选中第一个包(进来就有内容)
  useEffect(() => {
    if (selection) return;
    if (packsStatus === 'success' && packs.length > 0) {
      setSelection({ kind: 'pack', id: packs[0].pack_id });
    }
  }, [selection, packsStatus, packs]);

  const selPack = useMemo(
    () => (selection ? packs.find((p) => p.pack_id === selection.id) ?? null : null),
    [selection, packs],
  );

  // ── 动作 ────────────────────────────────────────────────────────────────
  const handleCreatePack = useCallback(
    async (name: string, description: string) => {
      try {
        const res = await createPack({ name, description });
        await refreshPacks();
        setSelection({ kind: 'pack', id: res.data.pack_id });
        setErrorMsg('');
      } catch (err) {
        setErrorMsg(translateError(err));
        throw err;
      }
    },
    [refreshPacks],
  );

  const handleDeletePack = useCallback((packId: string) => {
    setPacks((prev) => prev.filter((p) => p.pack_id !== packId));
    setSelection((s) => (s?.id === packId ? null : s));
  }, []);

  /** 目录批量摄入进当前选中包（本地文件夹 = 上传/导入内容）。 */
  const importFolder = useCallback(
    async (path: string) => {
      if (!selection) {
        setErrorMsg('请先选择或新建知识包,再导入本地文件夹。');
        return;
      }
      setErrorMsg('');
      setInfoMsg('导入中…');
      try {
        const res = await ingestFolder(selection.id, { path, recursive: true });
        const d = res.data;
        setInfoMsg(
          `导入完成:摄入 ${d.ingested} · 去重 ${d.deduplicated} · 跳过 ${d.skipped} · 失败 ${d.failed}` +
            (d.failed > 0 ? '(失败明细见来源列表)' : ''),
        );
        setReloadKey((n) => n + 1);
      } catch (err) {
        setInfoMsg('');
        setErrorMsg(translateError(err));
      }
    },
    [selection],
  );

  const handleOpenFolder = useCallback(() => {
    setAddMenuOpen(false);
    setShowDirPicker(true);
  }, []);

  const loading = packsStatus === 'loading';

  return (
    <div data-testid="knowledge-page" className={`neo-kp${embedded ? ' neo-kp--inline' : ''}`}>
      <div className={`neo-kv-workspace${embedded ? ' neo-kv-workspace--inline' : ''}`}>
        {/* ── 左栏:知识包列表 ─────────────────────────────────────────── */}
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
                      <FolderOpen size={13} /> 导入本地文件夹…
                    </button>
                    <button
                      className="neo-kv-addmenu-item"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setShowCreatePack(true);
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
            {loading && packs.length === 0 && (
              <div className="neo-kv-hint">
                {t('neo.knowledge.loading', { defaultValue: '加载中…' })}
              </div>
            )}
            {!loading && packsStatus === 'success' && packs.length === 0 && (
              <div className="neo-kv-hint">还没有知识包 —— 点右上「添加」开始。</div>
            )}
            {packs.map((p) => {
              const active = selection?.id === p.pack_id;
              return (
                <button
                  key={p.pack_id}
                  data-testid={`rail-pack-${p.pack_id}`}
                  onClick={() => setSelection({ kind: 'pack', id: p.pack_id })}
                  className={`neo-kv-rail-row${active ? ' neo-kv-rail-row--active' : ''}`}
                  title={p.description}
                >
                  <Database size={14} className="neo-kv-rail-row-icon" />
                  <span className="neo-kv-rail-row-name">{p.name}</span>
                  {p.status && (
                    <span className={`neo-kv-rail-row-meta neo-kp-pill--${p.status}`}>{p.status}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── 右栏:包详情 / 概览 ──────────────────────────────────────── */}
        <section className="neo-kv-detail">
          {(errorMsg || infoMsg) && (
            <div role="alert" className={`neo-kp-alert${infoMsg && !errorMsg ? ' neo-kp-alert--info' : ''}`}>
              {errorMsg || infoMsg}
            </div>
          )}

          {selPack ? (
            <MemoryBankPanel
              packId={selPack.pack_id}
              packName={selPack.name}
              reloadKey={reloadKey}
              onPackDeleted={() => {
                handleDeletePack(selPack.pack_id);
                void refreshPacks();
              }}
            />
          ) : (
            <OverviewPane packCount={packs.length} onAdd={() => setAddMenuOpen(true)} />
          )}
        </section>
      </div>

      {showDirPicker && (
        <DirPicker
          value={pickerInit}
          anchorRef={addBtnRef}
          title="导入本地文件夹到知识包"
          pickHint="选「此目录」= 目录内文件批量摄入进当前知识包"
          onClose={() => setShowDirPicker(false)}
          onPick={(p) => {
            setShowDirPicker(false);
            setPickerInit(p);
            void importFolder(p);
          }}
        />
      )}
      {showCreatePack && (
        <CreatePackModal
          onCancel={() => setShowCreatePack(false)}
          onSubmit={handleCreatePack}
        />
      )}
    </div>
  );
}

// ─── 右栏:概览 ───────────────────────────────────────────────────────────────

function OverviewPane({ packCount, onAdd }: { packCount: number; onAdd: () => void }) {
  return (
    <div className="neo-kv-center" data-testid="knowledge-overview">
      {packCount === 0 ? (
        <>
          <p className="neo-kv-center-t1">从添加第一个知识包开始</p>
          <button onClick={onAdd} className="neo-kv-guide-card" data-testid="guide-add">
            <Plus size={20} />
            <span className="neo-kv-guide-title">添加知识包</span>
          </button>
        </>
      ) : (
        <>
          <p className="neo-kv-center-t1">{packCount} 个知识包</p>
          <p className="neo-kv-center-t2">在左侧选择一个知识包开始浏览来源与检索。</p>
        </>
      )}
    </div>
  );
}

// ─── 新建知识包 Modal ─────────────────────────────────────────────────────────

function CreatePackModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string, description: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setLocalError('');
    try {
      await onSubmit(name.trim(), description.trim());
      onCancel();
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
          {t('neo.knowledge.modalTitle', { defaultValue: '新建知识包' })}
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

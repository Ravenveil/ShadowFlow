/**
 * KnowledgePage — Story 9.1 AC5
 *
 * UI PROTECTION: 只能加，不能删。/knowledge 是新独立路由，不挤占 TemplatesPage / CatalogPage。
 *
 * 功能：
 *   - 列出 KnowledgePack（GET /knowledge/packs）按 created_at 倒序
 *   - 状态徽章：pending=灰 / indexing=蓝 / ready=绿 / failed=红
 *   - 创建按钮 → Modal（name / description / sources / citation_required / freshness_policy）
 *   - 展开单个 Pack 看 sources 状态列表
 *   - 状态轮询：indexing 期间 3s 一次 GET /knowledge/packs/:id，ready/failed 后停
 *
 * 阶段 2.5 视觉返工（任务 C，2026-08-15）：
 *   视觉 Neo 化（样式见 ./knowledge-neo.css，token 走 var(--t-*)），逻辑一行未动。
 *   旧体系组件 MemoryStatsBar / iconRegistry 不再 import——统计条按原数据源
 *   （GET /memory/stats）在本文件内联 Neo 化重写，告警三角改内联 SVG。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createPack,
  deletePack,
  getPack,
  KnowledgeApiError,
  listPacks,
  reindexPack,
} from '../api/knowledge';
import { getMemoryStats } from '../api/memory';
import type { MemoryStats } from '../api/memory';
import type {
  CreatePackPayload,
  FreshnessPolicy,
  KnowledgePack,
  KnowledgeSourceInput,
  PackStatus,
  SourceType,
} from '../common/types/knowledge';
import { useI18n } from '../common/i18n';
import './knowledge-neo.css';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

const POLL_INTERVAL_MS = 3000;
// M4: cap polling at ~3 minutes per pack so a stuck `indexing` doesn't burn
// network bandwidth indefinitely. After the cap, the user has to reload or
// click Reindex explicitly.
const POLL_MAX_TICKS = 60;

function StatusBadge({ status }: { status: PackStatus }) {
  return (
    <span data-testid={`pack-status-${status}`} className={`neo-kp-pill neo-kp-pill--${status}`}>
      {status}
    </span>
  );
}

/** lucide alert-triangle 内联版（替代旧 iconRegistry 的 KnowledgeAlert）。 */
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

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}

function translateError(err: unknown): string {
  if (err instanceof KnowledgeApiError) {
    if (err.code === 'KNOWLEDGE_PACK_NOT_FOUND' || err.status === 404) {
      return '该 KnowledgePack 已被删除或不存在。';
    }
    if (err.status >= 500) return '服务暂时不可用，请稍后重试。';
    if (err.status === 422) return '提交格式不合法，请检查必填字段（name / sources）。';
    return `请求失败 (code=${err.code})。`;
  }
  return '网络错误，请稍后重试。';
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

/**
 * Memory 统计条（Story 14.1 AC4）— 旧 components/knowledge/MemoryStatsBar 的
 * Neo 化内联重写。数据源不变：GET /memory/stats，placeholder 模式只展示配置
 * 参数（working limit / episodic retention days / semantic skills count），
 * live counts 待 Story 9.4 writeback。
 */
function NeoMemoryStatsBar() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [stats, setStats] = useState<MemoryStats | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await getMemoryStats();
      setStats(res.data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="memory-stats-bar" className="neo-kp-stats-bar">
      {status === 'loading' && (
        <>
          <div className="neo-kp-skeleton" aria-hidden="true" />
          <div className="neo-kp-skeleton" aria-hidden="true" />
          <div className="neo-kp-skeleton" aria-hidden="true" />
        </>
      )}

      {status === 'error' && (
        <span className="neo-kp-stats-error">
          Stats unavailable{' '}
          <button
            onClick={load}
            className="neo-kp-stats-retry"
            aria-label="重试加载 Memory Stats"
          >
            retry
          </button>
        </span>
      )}

      {status === 'success' && stats && (
        <>
          <StatPill label="Working" value={`${stats.working_memory_limit} tokens`} />
          <StatPill label="Episodic" value={`${stats.episodic_retention_days} days`} />
          <StatPill label="Semantic Skills" value={String(stats.semantic_skills_count)} />
          <span className="neo-kp-stats-note">Live memory counts coming soon</span>
        </>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="neo-kp-stat-pill">
      <span className="neo-kp-stat-label">{label}:</span>
      {' '}{value}
    </span>
  );
}

export default function KnowledgePage() {
  const { t } = useI18n();
  const [packs, setPacks] = useState<KnowledgePack[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [ragBackend, setRagBackend] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // M1: timers + their tick counters live in refs so the polling effect doesn't
  // depend on the frequently-changing `packs` array. Map<packId, {handle, ticks}>.
  const pollTimers = useRef<Map<string, { handle: number; ticks: number }>>(new Map());
  // M4: track packs whose polling cap has been hit so we don't restart them.
  const stalledPolls = useRef<Set<string>>(new Set());
  // Latest packs ref — read by the polling tick without making them deps.
  const packsRef = useRef<KnowledgePack[]>([]);
  packsRef.current = packs;

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await listPacks({ limit: 50 });
      setPacks(res.data.packs);
      // Capture rag_backend from response meta (added in LightRAG integration).
      if (res.meta.rag_backend) setRagBackend(res.meta.rag_backend);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(translateError(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        // M4: bump tick + cap check
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

  // M1: this effect re-runs only on `packs` changes (not on startPoll/stopPoll
  // identity churn) and only adds/stops polls for packs whose status changed.
  // Cleanup runs only on unmount, so timers don't churn every poll tick.
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

  const handleCreate = useCallback(
    async (payload: CreatePackPayload) => {
      // M2: rethrow so the modal can render its own error banner instead of
      // silently closing while the page-level banner pops up behind it.
      try {
        const res = await createPack(payload);
        setPacks((prev) => [res.data, ...prev]);
        // Reset stalled-poll tracker for this pack so retry works.
        stalledPolls.current.delete(res.data.pack_id);
        setShowModal(false);
        setErrorMsg('');
      } catch (err) {
        // Surface on the page banner too (defensive — modal will also show it).
        setErrorMsg(translateError(err));
        throw err;
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (packId: string) => {
      try {
        await deletePack(packId);
        setPacks((prev) => prev.filter((p) => p.pack_id !== packId));
        stopPoll(packId);
      } catch (err) {
        setErrorMsg(translateError(err));
      }
    },
    [stopPoll],
  );

  const handleReindex = useCallback(
    async (packId: string) => {
      try {
        // M4: explicit user retry — clear the stall flag so polling can resume.
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

  const total = packs.length;

  return (
    <div data-testid="knowledge-page" className="neo-kp">
      <header className="neo-kp-header">
        <div>
          <div className="neo-kp-eyebrow-row">
            <p className="neo-kp-eyebrow">Knowledge / Story 9.1</p>
            <RagBackendBadge backend={ragBackend} />
          </div>
          <h1 className="neo-kp-title">
            {t('neo.knowledge.title', { defaultValue: 'KnowledgePack 管理' })}
          </h1>
          <p className="neo-kp-sub">
            {t('neo.knowledge.subtitle', {
              defaultValue: '一等对象 — Builder 用来声明 Agent 能访问的知识、检索方式、是否要带出处。',
            })}
          </p>
          <div className="neo-kp-stats">
            <NeoMemoryStatsBar />
          </div>
        </div>
        <button
          data-testid="create-pack-btn"
          onClick={() => setShowModal(true)}
          className="neo-kp-btn neo-kp-btn-primary"
        >
          {t('neo.knowledge.create', { defaultValue: '+ 新建 Pack' })}
        </button>
      </header>

      {errorMsg && (
        <div role="alert" className="neo-kp-alert">
          {errorMsg}
        </div>
      )}

      {status === 'loading' && (
        <div className="neo-kp-loading">{t('neo.knowledge.loading', { defaultValue: '加载中…' })}</div>
      )}

      {status === 'success' && total === 0 && (
        <div className="neo-kp-empty">
          <p className="neo-kp-empty-t1">
            {t('neo.knowledge.emptyTitle', { defaultValue: '还没有任何 KnowledgePack。' })}
          </p>
          <p className="neo-kp-empty-t2">
            {t('neo.knowledge.emptyHint', { defaultValue: '点击右上角「新建 Pack」开始添加你的第一份知识。' })}
          </p>
        </div>
      )}

      {status === 'success' && total > 0 && (
        <div className="neo-kp-list">
          {packs.map((pack) => (
            <PackCard
              key={pack.pack_id}
              pack={pack}
              expanded={expandedId === pack.pack_id}
              onToggle={() => setExpandedId(expandedId === pack.pack_id ? null : pack.pack_id)}
              onDelete={() => handleDelete(pack.pack_id)}
              onReindex={() => handleReindex(pack.pack_id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreatePackModal
          onCancel={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

function PackCard({
  pack,
  expanded,
  onToggle,
  onDelete,
  onReindex,
}: {
  pack: KnowledgePack;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onReindex: () => void;
}) {
  return (
    <div data-testid={`pack-card-${pack.pack_id}`} className="neo-kp-card">
      <div className="neo-kp-card-head">
        <div
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onToggle();
          }}
          className="neo-kp-card-main"
        >
          <div className="neo-kp-card-title-row">
            <span className="neo-kp-card-name">{pack.name}</span>
            <StatusBadge status={pack.status} />
            {pack.citation_required && (
              <span className="neo-kp-citation">citation:required</span>
            )}
          </div>
          <div className="neo-kp-card-meta">
            {pack.sources.length} sources · created {fmtDate(pack.created_at)} · updated {fmtDate(pack.updated_at)}
          </div>
          {pack.description && (
            <p className="neo-kp-card-desc">{pack.description}</p>
          )}
        </div>
        <div className="neo-kp-card-actions">
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

      {expanded && (
        <div className="neo-kp-card-detail">
          <div className="neo-kp-retrieval">
            retrieval: <code>{pack.retrieval_profile.mode}</code> · top_k={pack.retrieval_profile.top_k} ·
            chunk_size={pack.retrieval_profile.chunk_size} · overlap={pack.retrieval_profile.overlap}
          </div>
          <div className="neo-kp-sources">
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
        </div>
      )}
    </div>
  );
}

function CreatePackModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: CreatePackPayload) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [sourceRef, setSourceRef] = useState('');
  const [citationRequired, setCitationRequired] = useState(false);
  const [freshnessPolicy, setFreshnessPolicy] = useState<FreshnessPolicy>('on_demand');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = useMemo(
    () => name.trim().length > 0 && sourceRef.trim().length > 0,
    [name, sourceRef],
  );

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
          <Field label={t('neo.knowledge.fieldName', { defaultValue: '名称' })}>
            <input
              data-testid="modal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('neo.knowledge.fieldNamePh', { defaultValue: '如：项目说明文档' })}
              className="neo-kp-input"
            />
          </Field>
          <Field label={t('neo.knowledge.fieldDesc', { defaultValue: '描述' })}>
            <textarea
              data-testid="modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="neo-kp-input"
            />
          </Field>
          <Field label={t('neo.knowledge.fieldSourceType', { defaultValue: 'Source 类型' })}>
            <select
              data-testid="modal-source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="neo-kp-input"
            >
              <option value="text">text（直接输入文本）</option>
              <option value="file">file（本地文件路径）</option>
              <option value="url">url（HTTP 链接）</option>
              <option value="dataset">dataset（外部数据集 ref）</option>
            </select>
          </Field>
          <Field
            label={
              sourceType === 'text'
                ? t('neo.knowledge.fieldSourceContent', { defaultValue: 'Source 内容' })
                : t('neo.knowledge.fieldSourceRef', { defaultValue: 'Source 引用' })
            }
          >
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
          </Field>
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
            <Field label={t('neo.knowledge.fieldFreshness', { defaultValue: '刷新策略' })} inline>
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
            </Field>
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

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <label className={`neo-kp-field${inline ? ' neo-kp-field--inline' : ''}`}>
      <span className="neo-kp-field-label">{label}</span>
      {children}
    </label>
  );
}

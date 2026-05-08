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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle as KnowledgeAlert } from '../common/icons/iconRegistry';
import {
  createPack,
  deletePack,
  getPack,
  KnowledgeApiError,
  listPacks,
  reindexPack,
} from '../api/knowledge';
import type {
  CreatePackPayload,
  FreshnessPolicy,
  KnowledgePack,
  KnowledgeSourceInput,
  PackStatus,
  SourceType,
} from '../common/types/knowledge';
import { MemoryStatsBar } from '../components/knowledge/MemoryStatsBar';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

const POLL_INTERVAL_MS = 3000;
// M4: cap polling at ~3 minutes per pack so a stuck `indexing` doesn't burn
// network bandwidth indefinitely. After the cap, the user has to reload or
// click Reindex explicitly.
const POLL_MAX_TICKS = 60;

const STATUS_BADGE: Record<PackStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'pending', bg: 'rgba(120,120,120,0.15)', fg: '#A4A4AA' },
  indexing: { label: 'indexing', bg: 'rgba(56,128,255,0.15)', fg: '#6FA8FF' },
  ready: { label: 'ready', bg: 'rgba(58,190,120,0.15)', fg: '#4FCC85' },
  failed: { label: 'failed', bg: 'rgba(232,90,90,0.15)', fg: '#F58484' },
};

function StatusBadge({ status }: { status: PackStatus }) {
  const cfg = STATUS_BADGE[status];
  return (
    <span
      data-testid={`pack-status-${status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 10px',
        borderRadius: 11,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        background: cfg.bg,
        color: cfg.fg,
      }}
    >
      {cfg.label}
    </span>
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

const RAG_BACKEND_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  stub: { label: 'RAG: keyword stub', bg: 'rgba(120,120,120,0.12)', fg: '#8B8B96' },
  lightrag: { label: 'RAG: LightRAG', bg: 'rgba(120,80,220,0.15)', fg: '#A97FFF' },
};

function RagBackendBadge({ backend }: { backend?: string }) {
  const cfg = RAG_BACKEND_BADGE[backend ?? 'stub'] ?? RAG_BACKEND_BADGE.stub;
  return (
    <span
      data-testid="rag-backend-badge"
      title={
        backend === 'lightrag'
          ? 'LightRAG (graph + vector index) is active. Set LIGHTRAG_ENABLED=true in .env to enable.'
          : 'Keyword stub index active. Set LIGHTRAG_ENABLED=true in .env to enable LightRAG.'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 8px',
        borderRadius: 10,
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        background: cfg.bg,
        color: cfg.fg,
        letterSpacing: '0.04em',
      }}
    >
      {cfg.label}
    </span>
  );
}

export default function KnowledgePage() {
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
    <div
      data-testid="knowledge-page"
      style={{
        minHeight: '100vh',
        background: 'var(--t-bg)',
        color: 'var(--fg, #E6EDF3)',
        padding: '32px 40px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.5, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Knowledge / Story 9.1
            </p>
            <RagBackendBadge backend={ragBackend} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>
            KnowledgePack 管理
          </h1>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
            一等对象 — Builder 用来声明 Agent 能访问的知识、检索方式、是否要带出处。
          </p>
          <div style={{ marginTop: 12 }}>
            <MemoryStatsBar />
          </div>
        </div>
        <button
          data-testid="create-pack-btn"
          onClick={() => setShowModal(true)}
          style={{
            height: 36,
            padding: '0 18px',
            background: 'var(--accent, #6FA8FF)',
            color: '#0B1220',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + 新建 Pack
        </button>
      </header>

      {errorMsg && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'rgba(232,90,90,0.1)',
            border: '1px solid rgba(232,90,90,0.3)',
            borderRadius: 8,
            color: '#F58484',
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {status === 'loading' && (
        <div style={{ opacity: 0.6, fontSize: 13 }}>加载中…</div>
      )}

      {status === 'success' && total === 0 && (
        <div
          style={{
            border: '1px dashed var(--border, #2D333B)',
            borderRadius: 14,
            padding: '40px 24px',
            textAlign: 'center',
            opacity: 0.7,
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 8 }}>还没有任何 KnowledgePack。</p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>点击右上角「新建 Pack」开始添加你的第一份知识。</p>
        </div>
      )}

      {status === 'success' && total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    <div
      data-testid={`pack-card-${pack.pack_id}`}
      style={{
        background: 'var(--t-panel)',
        border: '1px solid var(--border, #2D333B)',
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onToggle();
          }}
          style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{pack.name}</span>
            <StatusBadge status={pack.status} />
            {pack.citation_required && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>
                citation:required
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {pack.sources.length} sources · created {fmtDate(pack.created_at)} · updated {fmtDate(pack.updated_at)}
          </div>
          {pack.description && (
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{pack.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid={`reindex-${pack.pack_id}`}
            onClick={onReindex}
            style={{
              height: 28,
              padding: '0 12px',
              fontSize: 11,
              background: 'transparent',
              border: '1px solid var(--border, #2D333B)',
              color: 'var(--fg, #E6EDF3)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reindex
          </button>
          <button
            data-testid={`delete-${pack.pack_id}`}
            onClick={onDelete}
            style={{
              height: 28,
              padding: '0 12px',
              fontSize: 11,
              background: 'transparent',
              border: '1px solid rgba(232,90,90,0.4)',
              color: '#F58484',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border, #2D333B)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            retrieval: <code>{pack.retrieval_profile.mode}</code> · top_k={pack.retrieval_profile.top_k} ·
            chunk_size={pack.retrieval_profile.chunk_size} · overlap={pack.retrieval_profile.overlap}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pack.sources.map((s) => (
              <div
                key={s.source_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12,
                  background: 'var(--t-bg)',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                <code style={{ opacity: 0.6, minWidth: 56 }}>{s.source_type}</code>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.source_ref}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color:
                      s.ingest_status === 'failed'
                        ? '#F58484'
                        : s.ingest_status === 'done'
                          ? '#4FCC85'
                          : s.ingest_status === 'processing'
                            ? '#6FA8FF'
                            : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {s.ingest_status}
                  {s.chunk_count > 0 ? ` · ${s.chunk_count} chunks` : ''}
                </span>
                {s.error_message && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: '#F58484', marginLeft: 8 }} title={s.error_message}>
                    <KnowledgeAlert size={11} strokeWidth={2} />
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
    <div
      role="dialog"
      aria-modal
      data-testid="create-pack-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--t-panel)',
          border: '1px solid var(--border, #2D333B)',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 520,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>新建 KnowledgePack</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="名称">
            <input
              data-testid="modal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：项目说明文档"
              style={textInputStyle}
            />
          </Field>
          <Field label="描述">
            <textarea
              data-testid="modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...textInputStyle, resize: 'vertical' }}
            />
          </Field>
          <Field label="Source 类型">
            <select
              data-testid="modal-source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              style={textInputStyle}
            >
              <option value="text">text（直接输入文本）</option>
              <option value="file">file（本地文件路径）</option>
              <option value="url">url（HTTP 链接）</option>
              <option value="dataset">dataset（外部数据集 ref）</option>
            </select>
          </Field>
          <Field label={sourceType === 'text' ? 'Source 内容' : 'Source 引用'}>
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
                      : '直接粘贴文本'
              }
              style={{ ...textInputStyle, resize: 'vertical' }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                data-testid="modal-citation-required"
                type="checkbox"
                checked={citationRequired}
                onChange={(e) => setCitationRequired(e.target.checked)}
              />
              需要引用出处
            </label>
            <Field label="刷新策略" inline>
              <select
                data-testid="modal-freshness"
                value={freshnessPolicy}
                onChange={(e) => setFreshnessPolicy(e.target.value as FreshnessPolicy)}
                style={{ ...textInputStyle, height: 32 }}
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
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(232,90,90,0.1)',
              color: '#F58484',
              fontSize: 12,
            }}
          >
            {localError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{
              height: 34,
              padding: '0 16px',
              background: 'transparent',
              border: '1px solid var(--border, #2D333B)',
              color: 'var(--fg, #E6EDF3)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            data-testid="modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              height: 34,
              padding: '0 18px',
              background: canSubmit && !submitting ? 'var(--accent, #6FA8FF)' : 'rgba(120,120,120,0.3)',
              border: 'none',
              borderRadius: 6,
              color: '#0B1220',
              fontWeight: 600,
              cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? '创建中…' : '创建'}
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
    <label style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: inline ? 8 : 4, alignItems: inline ? 'center' : 'stretch' }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      {children}
    </label>
  );
}

const textInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--t-bg)',
  border: '1px solid var(--border, #2D333B)',
  borderRadius: 6,
  padding: '8px 10px',
  color: 'var(--fg, #E6EDF3)',
  fontSize: 13,
  fontFamily: 'inherit',
};

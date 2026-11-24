/**
 * MemoryProfilePanel — 记忆画像（MemoryProfile，Story 9.3）前端补齐，2026-08-23。
 *
 * 数据源：src/api/memory.ts → Python `/api/memory/*`（shadowflow/api/memory.py）。
 *   - 画像 CRUD：create/get/update/deleteMemoryProfile
 *   - 列表：listMemoryProfiles（GET /api/memory/profiles，2026-08-23 后端补齐）
 *   - 统计卡：getMemoryStats（工作记忆上限 / 情景保留天数 / 语义技能数）
 *   - 手动写回：triggerManualWriteback（writeback_policy=manual 时按 run 触发）
 *
 * 一次性迁移：列表端点落地前本面板曾把本页创建的 profile_id 记在
 * localStorage（sf.memory-profile-ids）。首次刷新时把其中的 id 与远端列表
 * 并集去重（远端为准，缺失的 id 逐个 GET 取回，404 视为已删除剔除），
 * 迁移成功后移除该 localStorage key，之后纯走远端。空数据给空态，不 mock。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  createMemoryProfile,
  deleteMemoryProfile,
  getMemoryProfile,
  getMemoryStats,
  listMemoryProfiles,
  triggerManualWriteback,
  updateMemoryProfile,
  MemoryApiError,
  type MemoryStats,
} from '../api/memory';
import type {
  CompressionPolicy,
  MemoryProfile,
  StateSyncPolicy,
  UpdateMemoryProfilePayload,
  WritebackPolicy,
} from '../common/types/memory';
import { useI18n } from '../common/i18n';
import { NeoConfirmModal } from '../neo/NeoConfirmModal';

const LEGACY_PROFILE_IDS_KEY = 'sf.memory-profile-ids';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

function _readLegacyProfileIds(): string[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_PROFILE_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function _clearLegacyProfileIds(): void {
  try {
    window.localStorage.removeItem(LEGACY_PROFILE_IDS_KEY);
  } catch {
    // localStorage 不可用时静默降级：下次挂载重试迁移。
  }
}

export default function MemoryProfilePanel() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MemoryProfile | null>(null);
  const [wbRunId, setWbRunId] = useState('');
  const [wbBusy, setWbBusy] = useState(false);
  const [wbMsg, setWbMsg] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await listMemoryProfiles();
      let merged = res.data;
      // 一次性迁移：localStorage 历史 id 与远端列表并集去重，远端为准。
      const legacyIds = _readLegacyProfileIds();
      if (legacyIds.length > 0) {
        const remoteIds = new Set(res.data.map((p) => p.profile_id));
        const extra: MemoryProfile[] = [];
        for (const id of legacyIds) {
          if (remoteIds.has(id)) continue;
          try {
            const r = await getMemoryProfile(id);
            extra.push(r.data);
          } catch (err) {
            // 404（PROFILE_NOT_FOUND）= 已被删除，剔除；其他错误上抛。
            if (err instanceof MemoryApiError && err.status === 404) continue;
            throw err;
          }
        }
        merged = [...res.data, ...extra];
        _clearLegacyProfileIds();
      }
      setProfiles(merged);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(`画像加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const res = await getMemoryStats();
      setStats(res.data);
    } catch {
      // 统计失败不阻塞画像区；保持空态（stats 卡不渲染）。
      setStats(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshStats();
  }, [refresh, refreshStats]);

  const handleSave = useCallback(
    async (payload: UpdateMemoryProfilePayload) => {
      if (editing) {
        const res = await updateMemoryProfile(editing.profile_id, payload);
        setProfiles((prev) =>
          prev.map((p) => (p.profile_id === editing.profile_id ? res.data : p)),
        );
        setEditing(null);
      } else {
        const res = await createMemoryProfile(payload);
        setProfiles((prev) => [res.data, ...prev]);
        setCreating(false);
      }
      setErrorMsg('');
      refreshStats();
    },
    [editing, refreshStats],
  );

  // 删除确认弹窗（2026-11-04 用户反馈批）：window.confirm 原生框替换为
  // NeoConfirmModal（应用内弹窗，红色危险确认钮）。
  const [deleteTarget, setDeleteTarget] = useState<MemoryProfile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = useCallback((profile: MemoryProfile) => {
    setErrorMsg('');
    setDeleteTarget(profile);
  }, []);

  const confirmDelete = useCallback(async () => {
    const profile = deleteTarget;
    if (!profile) return;
    setDeleteBusy(true);
    setErrorMsg('');
    try {
      await deleteMemoryProfile(profile.profile_id);
      setDeleteTarget(null);
      setProfiles((prev) => prev.filter((p) => p.profile_id !== profile.profile_id));
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget]);

  const handleWriteback = useCallback(async () => {
    const runId = wbRunId.trim();
    if (!runId || wbBusy) return;
    setWbBusy(true);
    setWbMsg('');
    try {
      const res = await triggerManualWriteback(runId);
      setWbMsg(
        t('neo.memory.writebackOk', {
          defaultValue: `已触发写回：${res.data.status}`,
        }),
      );
    } catch (err) {
      setWbMsg(`写回失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWbBusy(false);
    }
  }, [wbRunId, wbBusy, t]);

  return (
    <section data-testid="memory-profile-panel" className="neo-mm-section">
      {errorMsg && (
        <div role="alert" className="neo-mm-alert">{errorMsg}</div>
      )}
      <div className="neo-mm-section-head">
        <h2 className="neo-mm-section-title">
          {t('neo.memory.profileTitle', { defaultValue: '记忆画像' })}
        </h2>
        <button
          data-testid="create-profile-btn"
          onClick={() => setCreating(true)}
          className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
        >
          {t('neo.memory.profileCreate', { defaultValue: '+ 新建画像' })}
        </button>
      </div>

      {stats && (
        <div data-testid="memory-stats-card" className="neo-mm-stats">
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.working_memory_limit}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.statsWml', { defaultValue: '工作记忆上限' })}
            </span>
          </div>
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.episodic_retention_days}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.statsRetention', { defaultValue: '情景记忆保留（天）' })}
            </span>
          </div>
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.semantic_skills_count}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.statsSkills', { defaultValue: '语义技能数' })}
            </span>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="neo-mm-loading">
          {t('neo.memory.loading', { defaultValue: '加载中…' })}
        </div>
      )}

      {status === 'success' && profiles.length === 0 && (
        <div data-testid="memory-profile-empty" className="neo-mm-empty">
          {t('neo.memory.profileEmpty', {
            defaultValue: '还没有记忆画像。画像决定 Agent 的工作记忆上限与写回策略，点右上角「新建画像」创建。',
          })}
        </div>
      )}

      {status === 'success' && profiles.length > 0 && (
        <div className="neo-mm-list">
          {profiles.map((p) => (
            <div
              key={p.profile_id}
              data-testid={`memory-profile-${p.profile_id}`}
              className="neo-mm-card"
            >
              <div className="neo-mm-card-head">
                <h3 className="neo-mm-card-title">
                  {t('neo.memory.profileCardTitle', { defaultValue: '画像' })}{' '}
                  {p.profile_id.slice(0, 8)}…
                </h3>
                <span className="neo-mm-scope-pill neo-mm-scope-pill--user">
                  {p.writeback_policy}
                </span>
              </div>
              <p className="neo-mm-card-meta">
                {t('neo.memory.profileWml', { defaultValue: '工作记忆上限' })} {p.working_memory_limit}
                {' · '}
                {t('neo.memory.profileRetention', { defaultValue: '保留' })} {p.episodic_retention_days}
                {t('neo.memory.profileDays', { defaultValue: ' 天' })}
                {' · top_k '}
                {p.semantic_retrieval_top_k}
                {' · sync '}
                {p.state_sync_policy}
                {' · '}
                {t('neo.memory.profileCompression', { defaultValue: '压缩' })} {p.compression_policy}
              </p>
              <div className="neo-mm-card-actions">
                <button
                  data-testid={`edit-profile-${p.profile_id}`}
                  onClick={() => setEditing(p)}
                  className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
                >
                  {t('neo.memory.edit', { defaultValue: '编辑' })}
                </button>
                <button
                  data-testid={`delete-profile-${p.profile_id}`}
                  onClick={() => openDelete(p)}
                  className="neo-mm-btn neo-mm-btn-danger neo-mm-btn-sm"
                >
                  {t('neo.memory.delete', { defaultValue: '删除' })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="neo-mm-writeback">
        <input
          data-testid="writeback-run-id"
          value={wbRunId}
          onChange={(e) => setWbRunId(e.target.value)}
          className="neo-mm-input"
          placeholder={t('neo.memory.writebackRunIdPh', { defaultValue: '输入 run_id' })}
        />
        <button
          data-testid="writeback-btn"
          onClick={handleWriteback}
          disabled={!wbRunId.trim() || wbBusy}
          className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
        >
          {wbBusy
            ? t('neo.memory.writebackBusy', { defaultValue: '写回中…' })
            : t('neo.memory.writeback', { defaultValue: '手动写回' })}
        </button>
      </div>
      {wbMsg && (
        <p data-testid="writeback-msg" className="neo-mm-card-meta">{wbMsg}</p>
      )}

      {creating && (
        <MemoryProfileModal
          title={t('neo.memory.profileModalNew', { defaultValue: '新建画像' })}
          onCancel={() => setCreating(false)}
          onSubmit={handleSave}
        />
      )}
      {editing && (
        <MemoryProfileModal
          title={t('neo.memory.profileModalEdit', { defaultValue: '编辑画像' })}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
        />
      )}

      {/* 删除确认弹窗（2026-11-04 用户反馈批，替换 window.confirm 原生框） */}
      {deleteTarget && (
        <NeoConfirmModal
          title={t('neo.memory.profileDeleteTitle', { defaultValue: '删除记忆画像' })}
          message={t('neo.memory.profileDeleteConfirm', {
            defaultValue: `确定删除该记忆画像（${deleteTarget.profile_id.slice(0, 8)}…）吗？此操作不可恢复。`,
          })}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (deleteBusy) return;
            setDeleteTarget(null);
          }}
        />
      )}
    </section>
  );
}

const WRITEBACK_POLICIES: WritebackPolicy[] = ['always', 'on_task_complete', 'on_session_end', 'manual'];
const SYNC_POLICIES: StateSyncPolicy[] = ['eager', 'lazy', 'disabled'];
const COMPRESSION_POLICIES: CompressionPolicy[] = ['none', 'summarize', 'select_top_k'];

function MemoryProfileModal({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: MemoryProfile;
  onCancel: () => void;
  onSubmit: (p: UpdateMemoryProfilePayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const [wml, setWml] = useState(String(initial?.working_memory_limit ?? 4096));
  const [retention, setRetention] = useState(String(initial?.episodic_retention_days ?? 30));
  const [topK, setTopK] = useState(String(initial?.semantic_retrieval_top_k ?? 5));
  const [wbPolicy, setWbPolicy] = useState<WritebackPolicy>(initial?.writeback_policy ?? 'on_task_complete');
  const [syncPolicy, setSyncPolicy] = useState<StateSyncPolicy>(initial?.state_sync_policy ?? 'lazy');
  const [compression, setCompression] = useState<CompressionPolicy>(initial?.compression_policy ?? 'none');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const wmlNum = Number(wml);
  const retentionNum = Number(retention);
  const topKNum = Number(topK);
  const canSubmit =
    Number.isInteger(wmlNum) && wmlNum >= 256 &&
    Number.isInteger(retentionNum) && retentionNum >= 0 &&
    Number.isInteger(topKNum) && topKNum >= 1;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setLocalError('');
    try {
      await onSubmit({
        working_memory_limit: wmlNum,
        episodic_retention_days: retentionNum,
        semantic_retrieval_top_k: topKNum,
        writeback_policy: wbPolicy,
        state_sync_policy: syncPolicy,
        compression_policy: compression,
      });
    } catch (err) {
      setLocalError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="memory-profile-modal" className="neo-mm-modal-mask">
      <div className="neo-mm-modal">
        <h2 className="neo-mm-modal-title">{title}</h2>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.profileWml', { defaultValue: '工作记忆上限' })}
          </span>
          <input
            data-testid="profile-modal-wml"
            type="number"
            min={256}
            value={wml}
            onChange={(e) => setWml(e.target.value)}
            className="neo-mm-input"
          />
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.statsRetention', { defaultValue: '情景记忆保留（天）' })}
          </span>
          <input
            data-testid="profile-modal-retention"
            type="number"
            min={0}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            className="neo-mm-input"
          />
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.profileTopK', { defaultValue: '语义检索 top_k' })}
          </span>
          <input
            data-testid="profile-modal-topk"
            type="number"
            min={1}
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            className="neo-mm-input"
          />
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.profileWbPolicy', { defaultValue: '写回策略' })}
          </span>
          <select
            data-testid="profile-modal-wb-policy"
            value={wbPolicy}
            onChange={(e) => setWbPolicy(e.target.value as WritebackPolicy)}
            className="neo-mm-input"
          >
            {WRITEBACK_POLICIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.profileSyncPolicy', { defaultValue: '状态同步策略' })}
          </span>
          <select
            data-testid="profile-modal-sync-policy"
            value={syncPolicy}
            onChange={(e) => setSyncPolicy(e.target.value as StateSyncPolicy)}
            className="neo-mm-input"
          >
            {SYNC_POLICIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.profileCompression', { defaultValue: '压缩' })}
          </span>
          <select
            data-testid="profile-modal-compression"
            value={compression}
            onChange={(e) => setCompression(e.target.value as CompressionPolicy)}
            className="neo-mm-input"
          >
            {COMPRESSION_POLICIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        {localError && <div role="alert" className="neo-mm-modal-error">{localError}</div>}

        <div className="neo-mm-modal-actions">
          <button onClick={onCancel} className="neo-mm-btn">
            {t('neo.memory.cancel', { defaultValue: '取消' })}
          </button>
          <button
            data-testid="profile-modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="neo-mm-btn neo-mm-btn-primary"
          >
            {submitting
              ? t('neo.memory.saving', { defaultValue: '保存中…' })
              : t('neo.memory.save', { defaultValue: '保存' })}
          </button>
        </div>
      </div>
    </div>
  );
}

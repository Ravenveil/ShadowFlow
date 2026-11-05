/**
 * MemoryLessonsPanel — 经验记忆面板（2026-11-05，OPC-OS PR#3 设计整合的前端半边）。
 *
 * 定位：与 MemoryPage 顶部的河流记忆（手动条目）+ 记忆画像（Python 侧 profile）
 * 并列的第三区——系统自动沉淀的教训/偏好/弱项，run 结束时写库、下次同域 run
 * 召回进提示词。本面板负责「看得见、管得住」：
 *   - 统计卡：总数 + 三类分布 + 召回口径（top_k / 每域上限）；
 *   - 列表：score 降序，kind/scope 筛选，展示来源与召回次数；
 *   - 手动补一条：与自动沉淀同一张表（source='manual'），重复内容自动加权；
 *   - 删除：软删（归档留痕），NeoConfirmModal 二次确认（原生弹窗已清零）；
 *   - 自动沉淀开关：settings memory.autoLearn（缺省开）。
 *
 * 视觉：复用 memory-neo.css 的 neo-mm-* token，不引新依赖。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  forgetMemoryLesson,
  getMemoryLessonStats,
  getMemorySetting,
  KIND_LABELS,
  listMemoryLessons,
  putMemorySetting,
  rememberLesson,
  SOURCE_LABELS,
  type MemoryLesson,
  type MemoryLessonStats,
} from '../api/memoryLessons';
import { useI18n } from '../common/i18n';
import { NeoConfirmModal } from '../neo/NeoConfirmModal';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type KindFilter = '' | 'lesson' | 'preference' | 'weakness';

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
  { key: '', label: '全部' },
  { key: 'lesson', label: KIND_LABELS.lesson },
  { key: 'preference', label: KIND_LABELS.preference },
  { key: 'weakness', label: KIND_LABELS.weakness },
];

function fmtTs(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return String(ts);
  }
}

export default function MemoryLessonsPanel() {
  const { t } = useI18n();
  const [lessons, setLessons] = useState<MemoryLesson[]>([]);
  const [stats, setStats] = useState<MemoryLessonStats | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('');
  const [creating, setCreating] = useState(false);
  const [autoLearn, setAutoLearn] = useState<boolean | null>(null); // null=读取中

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const [rows, s] = await Promise.all([
        listMemoryLessons(kindFilter ? { kind: kindFilter } : {}),
        getMemoryLessonStats(),
      ]);
      setLessons(rows);
      setStats(s);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(`经验记忆加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [kindFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 自动沉淀开关（缺省开 = 与后端 getSetting('memory.autoLearn') 默认口径一致）
  useEffect(() => {
    let alive = true;
    getMemorySetting<boolean>('memory.autoLearn', true).then((v) => {
      if (alive) setAutoLearn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleAutoLearn = useCallback(async () => {
    const next = !(autoLearn ?? true);
    setAutoLearn(next); // 乐观更新，失败回滚
    try {
      await putMemorySetting('memory.autoLearn', next);
    } catch (err) {
      setAutoLearn(!next);
      setErrorMsg(`开关保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [autoLearn]);

  const handleSave = useCallback(
    async (payload: { kind: string; scope_key: string; content: string }) => {
      await rememberLesson({
        content: payload.content,
        kind: payload.kind || undefined,
        scope_key: payload.scope_key || undefined,
        source: 'manual',
      });
      setCreating(false);
      setErrorMsg('');
      refresh();
    },
    [refresh],
  );

  // 删除二次确认（NeoConfirmModal；busy/error 由父层下发）
  const [deleteTarget, setDeleteTarget] = useState<MemoryLesson | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = useCallback(async () => {
    const lesson = deleteTarget;
    if (!lesson || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await forgetMemoryLesson(lesson.id);
      setDeleteTarget(null);
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
      getMemoryLessonStats().then(setStats).catch(() => undefined);
    } catch (err) {
      setDeleteError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deleteBusy]);

  const totalText = useMemo(() => {
    if (!stats) return '';
    const parts = ['lesson', 'preference', 'weakness']
      .map((k) => `${KIND_LABELS[k]} ${stats.by_kind[k] ?? 0}`)
      .join(' · ');
    return parts;
  }, [stats]);

  return (
    <section data-testid="memory-lessons-panel" className="neo-mm-section">
      {errorMsg && (
        <div role="alert" className="neo-mm-alert">{errorMsg}</div>
      )}

      <div className="neo-mm-section-head">
        <h2 className="neo-mm-section-title">
          {t('neo.memory.lessonsTitle', { defaultValue: '经验记忆' })}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label
            data-testid="memory-lessons-autolearn"
            className="neo-mm-lessons-toggle"
            title="run 结束时自动沉淀教训；关闭后只保留手动记录"
          >
            <input
              type="checkbox"
              checked={autoLearn ?? true}
              disabled={autoLearn === null}
              onChange={toggleAutoLearn}
            />
            <span>自动沉淀</span>
          </label>
          <button
            data-testid="create-lesson-btn"
            onClick={() => setCreating(true)}
            className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
          >
            {t('neo.memory.lessonCreate', { defaultValue: '+ 补一条' })}
          </button>
        </div>
      </div>

      <p className="neo-mm-lessons-sub">
        run 失败、用户中断会被系统自动记成教训，下次同域任务自动带进提示词；也可手动补一条。
      </p>

      {stats && (
        <div data-testid="memory-lessons-stats" className="neo-mm-stats">
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.total}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.lessonsTotal', { defaultValue: '在册经验' })}
              {totalText ? `（${totalText}）` : ''}
            </span>
          </div>
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.top_k}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.lessonsTopK', { defaultValue: '每次召回条数' })}
            </span>
          </div>
          <div className="neo-mm-stat">
            <span className="neo-mm-stat-value">{stats.max_per_scope}</span>
            <span className="neo-mm-stat-label">
              {t('neo.memory.lessonsCap', { defaultValue: '每域保留上限' })}
            </span>
          </div>
        </div>
      )}

      <div className="neo-mm-tabs" role="tablist" aria-label="lesson kind filter">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            role="tab"
            aria-selected={kindFilter === f.key}
            data-testid={`memory-lessons-kind-${f.key || 'all'}`}
            onClick={() => setKindFilter(f.key)}
            className={`neo-mm-tab${kindFilter === f.key ? ' on' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="neo-mm-loading">加载中…</div>
      )}

      {status === 'success' && lessons.length === 0 && (
        <div className="neo-mm-empty">
          {kindFilter
            ? `还没有「${KIND_LABELS[kindFilter]}」类的经验。`
            : '还没有经验记忆。run 失败或用户中断后会自动沉淀到这里，也可以点右上角手动补一条。'}
        </div>
      )}

      {status === 'success' && lessons.length > 0 && (
        <div data-testid="memory-lessons-list" className="neo-mm-list">
          {lessons.map((lesson) => (
            <div
              key={lesson.id}
              data-testid={`memory-lesson-card-${lesson.id}`}
              className="neo-mm-card neo-mm-lesson-card"
            >
              <div className="neo-mm-card-head">
                <h3 className="neo-mm-card-title">{lesson.title || lesson.content}</h3>
                <span className={`neo-mm-lesson-pill neo-mm-lesson-pill--${lesson.kind}`}>
                  {KIND_LABELS[lesson.kind] ?? lesson.kind}
                </span>
              </div>
              <p className="neo-mm-card-content">{lesson.content}</p>
              <p className="neo-mm-card-meta">
                {lesson.scope_key ? `域 ${lesson.scope_key}` : '通用经验'}
                {' · '}
                {SOURCE_LABELS[lesson.source] ?? lesson.source}
                {' · '}score {lesson.score.toFixed(2)}
                {lesson.hits > 0 ? ` · 召回 ${lesson.hits} 次` : ''}
                {' · '}
                {fmtTs(lesson.updated_at)}
              </p>
              <div className="neo-mm-card-actions">
                <button
                  onClick={() => setDeleteTarget(lesson)}
                  className="neo-mm-btn neo-mm-btn-danger neo-mm-btn-sm"
                >
                  {t('neo.memory.delete', { defaultValue: '删除' })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <MemoryLessonModal
          onCancel={() => setCreating(false)}
          onSubmit={handleSave}
        />
      )}

      {deleteTarget && (
        <NeoConfirmModal
          title={t('neo.memory.lessonDeleteTitle', { defaultValue: '删除这条经验记忆？' })}
          message={`「${deleteTarget.title || deleteTarget.content}」将被归档（软删留痕，可在数据库恢复）。`}
          busy={deleteBusy}
          error={deleteError}
          onClose={() => {
            if (!deleteBusy) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

function MemoryLessonModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: { kind: string; scope_key: string; content: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState('lesson');
  const [scopeKey, setScopeKey] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setLocalError('');
    try {
      await onSubmit({ kind, scope_key: scopeKey.trim(), content: content.trim() });
    } catch (err) {
      setLocalError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="memory-lesson-modal" className="neo-mm-modal-mask">
      <div className="neo-mm-modal">
        <h2 className="neo-mm-modal-title">
          {t('neo.memory.lessonModalTitle', { defaultValue: '补一条经验' })}
        </h2>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.lessonFieldKind', { defaultValue: '类型' })}
          </span>
          <select
            data-testid="memory-lesson-modal-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="neo-mm-input"
          >
            <option value="lesson">教训（为什么失败/被打断）</option>
            <option value="preference">偏好（用户/业务倾向）</option>
            <option value="weakness">弱项（反复出现的缺陷）</option>
          </select>
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.lessonFieldScope', { defaultValue: '作用域（留空 = 通用）' })}
          </span>
          <input
            data-testid="memory-lesson-modal-scope"
            value={scopeKey}
            onChange={(e) => setScopeKey(e.target.value)}
            className="neo-mm-input"
            placeholder={t('neo.memory.lessonFieldScopePh', {
              defaultValue: '如：web-search（技能名）；通用经验就留空',
            })}
          />
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.lessonFieldContent', { defaultValue: '内容（≤600 字，重复提交会加权已有条目）' })}
          </span>
          <textarea
            data-testid="memory-lesson-modal-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={600}
            className="neo-mm-input"
            placeholder={t('neo.memory.lessonFieldContentPh', {
              defaultValue: '如：长文翻译先分段再合，整段直译容易丢上下文',
            })}
          />
        </label>

        {localError && <div role="alert" className="neo-mm-modal-error">{localError}</div>}

        <div className="neo-mm-modal-actions">
          <button onClick={onCancel} className="neo-mm-btn">
            {t('neo.memory.cancel', { defaultValue: '取消' })}
          </button>
          <button
            data-testid="memory-lesson-modal-submit"
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

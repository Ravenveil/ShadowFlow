/**
 * MemoryPage — 统一「记忆」视图（2026-11-05 统一批）。
 *
 * 河流记忆（手动条目 /api/memory-entries，Story 16.1）与经验记忆（自动沉淀
 * /api/memory/lessons，OPC-OS PR#3 设计整合）合并为一张列表：
 *   - tab：全部 / 手动 / 经验；卡片带类型徽标（scope pill / kind 三色 pill）；
 *   - 「+ 新记忆」弹窗按类型切字段：手动=层级+标题+内容；经验=kind+作用域+内容；
 *   - 删除统一走 NeoConfirmModal（手动=物理删，经验=软删归档）；
 *   - 工具条右侧保留自动沉淀开关与召回口径（top_k / 每域上限）。
 *
 * 与知识库（/knowledge）的分工不变：本页是记忆（条目+经验），知识库是 RAG。
 * 记忆画像（MemoryProfilePanel）是 Agent 运行时配置，保持独立区块。
 *
 * 三形态（2026-11-06 折叠批）：设置页 `<MemoryPage settings />` 是唯一入口
 * （左栏「记忆」一级导航下线，/memory 重定向到 /settings#memory-entries）；
 * `<MemoryPage embedded />` 保留给未来中栏内嵌；无 props 为独立全页兜底。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMemoryEntry,
  deleteMemoryEntry,
  listMemoryEntries,
  updateMemoryEntry,
  type MemoryEntry,
  type MemoryScope,
} from '../api/memoryEntries';
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
import MemoryProfilePanel from './MemoryProfilePanel';
// 功能线③ 外接面板：A 下班 B 接班 + 长期画像写回（一行挂载，主页面逻辑不变）。
import MemoryHandoffPanel from './MemoryHandoffPanel';
import { NeoConfirmModal } from '../neo/NeoConfirmModal';
import './memory-neo.css';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type TypeFilter = 'all' | 'manual' | 'lesson';

/** 统一列表项：手动条目或经验沉淀，ts 归一成毫秒用于混排。 */
type UnifiedItem =
  | { type: 'manual'; entry: MemoryEntry; ts: number }
  | { type: 'lesson'; lesson: MemoryLesson; ts: number };

const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'manual', label: '手动' },
  { key: 'lesson', label: '经验' },
];

function toTs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function fmtTs(isoOrNum: string | number): string {
  try {
    const ms = typeof isoOrNum === 'number' ? isoOrNum : Date.parse(isoOrNum);
    if (Number.isNaN(ms)) return String(isoOrNum);
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return String(isoOrNum);
  }
}

export default function MemoryPage({
  embedded = false,
  settings = false,
}: { embedded?: boolean; settings?: boolean } = {}) {
  const { t } = useI18n();
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [stats, setStats] = useState<MemoryLessonStats | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [autoLearn, setAutoLearn] = useState<boolean | null>(null); // null=读取中

  // 新建/编辑弹窗：editing 仅手动条目可编辑；creating=true 开新建
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MemoryEntry | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const [entries, lessons, s] = await Promise.all([
        listMemoryEntries(),
        listMemoryLessons({}),
        getMemoryLessonStats(),
      ]);
      const merged: UnifiedItem[] = [
        ...entries.map((entry) => ({
          type: 'manual' as const,
          entry,
          ts: Math.max(toTs(entry.updated_at), toTs(entry.created_at)),
        })),
        ...lessons.map((lesson) => ({
          type: 'lesson' as const,
          lesson,
          ts: lesson.updated_at,
        })),
      ].sort((a, b) => b.ts - a.ts);
      setItems(merged);
      setStats(s);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(`记忆加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

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
    async (payload: {
      modalType: 'manual' | 'lesson' | 'preference' | 'weakness';
      scope: MemoryScope;
      title: string;
      content: string;
      scopeKey: string;
    }) => {
      if (payload.modalType === 'manual') {
        if (editing) {
          const updated = await updateMemoryEntry(editing.id, {
            scope: payload.scope,
            title: payload.title,
            content: payload.content,
          });
          setEditing(null);
          setErrorMsg('');
          void updated;
          await refresh();
          return;
        }
        await createMemoryEntry({
          scope: payload.scope,
          title: payload.title,
          content: payload.content,
        });
      } else {
        await rememberLesson({
          kind: payload.modalType,
          scope_key: payload.scopeKey || undefined,
          content: payload.content,
          source: 'manual',
        });
      }
      setCreating(false);
      setErrorMsg('');
      await refresh();
    },
    [editing, refresh],
  );

  // 删除二次确认（NeoConfirmModal；busy/error 由父层下发）
  const [deleteTarget, setDeleteTarget] = useState<UnifiedItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (target.type === 'manual') {
        await deleteMemoryEntry(target.entry.id);
      } else {
        await forgetMemoryLesson(target.lesson.id);
      }
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setDeleteError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deleteBusy, refresh]);

  const filtered = useMemo(
    () => (typeFilter === 'all' ? items : items.filter((it) => it.type === typeFilter)),
    [items, typeFilter],
  );

  const scopeLabel = useMemo(
    () => ({
      user: t('neo.memory.scopeUser', { defaultValue: '个人' }),
      project: t('neo.memory.scopeProject', { defaultValue: '项目' }),
      session: t('neo.memory.scopeSession', { defaultValue: '会话' }),
    }),
    [t],
  );

  return (
    <div
      data-testid="memory-page"
      className={`neo-mm${embedded ? ' neo-mm--inline' : ''}${settings ? ' neo-mm--settings' : ''}`}
    >
      <header className="neo-mm-header">
        <div>
          {!settings && <p className="neo-mm-eyebrow">Memory</p>}
          {!settings && (
            <h1 className="neo-mm-title">
              {t('neo.memory.title', { defaultValue: '记忆' })}
            </h1>
          )}
          <p className="neo-mm-sub">
            {t('neo.memory.subtitle', {
              defaultValue:
                '统一管理 Agent 的记忆：手动条目（个人 / 项目 / 会话）与任务沉淀的经验（教训 / 偏好 / 弱项），经验会在同域任务中自动召回。',
            })}
          </p>
        </div>
        <button
          data-testid="create-memory-btn"
          onClick={() => setCreating(true)}
          className="neo-mm-btn neo-mm-btn-primary"
        >
          {t('neo.memory.create', { defaultValue: '+ 新记忆' })}
        </button>
      </header>

      {errorMsg && (
        <div role="alert" className="neo-mm-alert">{errorMsg}</div>
      )}

      <div className="neo-mm-toolbar">
        <div className="neo-mm-tabs" role="tablist" aria-label="memory type filter">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={typeFilter === tab.key}
              data-testid={`memory-type-${tab.key}`}
              onClick={() => setTypeFilter(tab.key)}
              className={`neo-mm-tab${typeFilter === tab.key ? ' on' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="neo-mm-toolbar-side">
          {stats && (
            <span data-testid="memory-lessons-stats" className="neo-mm-lessons-stats">
              召回 {stats.top_k} · 每域上限 {stats.max_per_scope}
            </span>
          )}
          <label
            data-testid="memory-lessons-autolearn"
            className="neo-mm-lessons-toggle"
            title="run 结束时自动沉淀经验；关闭后只保留手动记录"
          >
            <input
              type="checkbox"
              checked={autoLearn ?? true}
              disabled={autoLearn === null}
              onChange={toggleAutoLearn}
            />
            <span>自动沉淀</span>
          </label>
        </div>
      </div>

      {/* 设置内已把画像 / 交接拆成独立分区，条目页里不再重复挂载 */}
      {!settings && (
        <>
          <MemoryProfilePanel />
          <MemoryHandoffPanel />
        </>
      )}

      {status === 'loading' && (
        <div className="neo-mm-loading">
          {t('neo.memory.loading', { defaultValue: '加载中…' })}
        </div>
      )}

      {status === 'success' && filtered.length === 0 && (
        <div className="neo-mm-empty">
          {typeFilter === 'manual'
            ? '还没有手动记忆。对话中 Agent 摘录的结论会沉淀到这里，也可以点右上角手动新增。'
            : typeFilter === 'lesson'
              ? '还没有经验沉淀。run 失败或用户中断后会自动记成教训，也可以点右上角手动补一条。'
              : '还没有记忆条目。点右上角「+ 新记忆」手动添加，run 结束后经验也会自动沉淀到这里。'}
        </div>
      )}

      {status === 'success' && filtered.length > 0 && (
        <div className="neo-mm-list">
          {filtered.map((item) =>
            item.type === 'manual' ? (
              <MemoryCard
                key={`m-${item.entry.id}`}
                testId={`memory-card-${item.entry.id}`}
                title={item.entry.title}
                content={item.entry.content}
                pill={
                  <span className={`neo-mm-scope-pill neo-mm-scope-pill--${item.entry.scope}`}>
                    {item.entry.scope}
                  </span>
                }
                meta={`手动 · ${scopeLabel[item.entry.scope]} · updated ${fmtTs(item.entry.updated_at)}`}
                onEdit={() => setEditing(item.entry)}
                onDelete={() => setDeleteTarget(item)}
                onDeleteLabel={t('neo.memory.delete', { defaultValue: '删除' })}
                editLabel={t('neo.memory.edit', { defaultValue: '编辑' })}
              />
            ) : (
              <MemoryCard
                key={`l-${item.lesson.id}`}
                testId={`memory-lesson-card-${item.lesson.id}`}
                title={item.lesson.title || item.lesson.content}
                content={item.lesson.content}
                pill={
                  <span className={`neo-mm-lesson-pill neo-mm-lesson-pill--${item.lesson.kind}`}>
                    {KIND_LABELS[item.lesson.kind] ?? item.lesson.kind}
                  </span>
                }
                meta={`${SOURCE_LABELS[item.lesson.source] ?? item.lesson.source} · score ${item.lesson.score.toFixed(2)}${item.lesson.hits > 0 ? ` · 召回 ${item.lesson.hits} 次` : ''} · ${fmtTs(item.lesson.updated_at)}`}
                onDelete={() => setDeleteTarget(item)}
                onDeleteLabel={t('neo.memory.delete', { defaultValue: '删除' })}
              />
            ),
          )}
        </div>
      )}

      {creating && (
        <MemoryItemModal
          onCancel={() => setCreating(false)}
          onSubmit={handleSave}
        />
      )}
      {editing && (
        <MemoryItemModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
        />
      )}

      {deleteTarget && (
        <NeoConfirmModal
          title={t('neo.memory.deleteTitle', { defaultValue: '删除这条记忆？' })}
          message={
            deleteTarget.type === 'manual'
              ? `「${deleteTarget.entry.title}」将被删除。`
              : `「${deleteTarget.lesson.title || deleteTarget.lesson.content}」将被归档（软删留痕）。`
          }
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
    </div>
  );
}

function MemoryCard({
  testId,
  title,
  content,
  pill,
  meta,
  onEdit,
  onDelete,
  onDeleteLabel,
  editLabel,
}: {
  testId: string;
  title: string;
  content: string;
  pill: React.ReactNode;
  meta: string;
  onEdit?: () => void;
  onDelete: () => void;
  onDeleteLabel: string;
  editLabel?: string;
}) {
  return (
    <div data-testid={testId} className="neo-mm-card">
      <div className="neo-mm-card-head">
        <h3 className="neo-mm-card-title">{title}</h3>
        {pill}
      </div>
      {content && <p className="neo-mm-card-content">{content}</p>}
      <p className="neo-mm-card-meta">{meta}</p>
      <div className="neo-mm-card-actions">
        {onEdit && (
          <button onClick={onEdit} className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm">
            {editLabel}
          </button>
        )}
        <button
          onClick={onDelete}
          className="neo-mm-btn neo-mm-btn-danger neo-mm-btn-sm"
        >
          {onDeleteLabel}
        </button>
      </div>
    </div>
  );
}

type ModalType = 'manual' | 'lesson' | 'preference' | 'weakness';

const MODAL_TYPES: Array<{ key: ModalType; label: string }> = [
  { key: 'manual', label: '手动记忆（跨会话笔记）' },
  { key: 'lesson', label: `经验 · ${KIND_LABELS.lesson}（为什么失败/被打断）` },
  { key: 'preference', label: `经验 · ${KIND_LABELS.preference}（用户/业务倾向）` },
  { key: 'weakness', label: `经验 · ${KIND_LABELS.weakness}（反复出现的缺陷）` },
];

function MemoryItemModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: MemoryEntry; // 有值=编辑手动条目（经验不可编辑）
  onCancel: () => void;
  onSubmit: (p: {
    modalType: ModalType;
    scope: MemoryScope;
    title: string;
    content: string;
    scopeKey: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [modalType, setModalType] = useState<ModalType>(initial ? 'manual' : 'manual');
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? 'user');
  const [scopeKey, setScopeKey] = useState('');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const isManual = modalType === 'manual';
  const canSubmit = isManual ? title.trim().length > 0 : content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setLocalError('');
    try {
      await onSubmit({
        modalType,
        scope,
        title: title.trim(),
        content: content.trim(),
        scopeKey: scopeKey.trim(),
      });
    } catch (err) {
      setLocalError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="memory-entry-modal" className="neo-mm-modal-mask">
      <div className="neo-mm-modal">
        <h2 className="neo-mm-modal-title">
          {initial
            ? t('neo.memory.modalTitleEdit', { defaultValue: '编辑记忆' })
            : t('neo.memory.modalTitleNew', { defaultValue: '新记忆' })}
        </h2>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.fieldType', { defaultValue: '类型' })}
          </span>
          <select
            data-testid="memory-modal-type"
            value={modalType}
            disabled={!!initial}
            onChange={(e) => setModalType(e.target.value as ModalType)}
            className="neo-mm-input"
          >
            {MODAL_TYPES.map((mt) => (
              <option key={mt.key} value={mt.key}>{mt.label}</option>
            ))}
          </select>
        </label>
        {isManual ? (
          <label className="neo-mm-field">
            <span className="neo-mm-field-label">
              {t('neo.memory.fieldScope', { defaultValue: '层级' })}
            </span>
            <select
              data-testid="memory-modal-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as MemoryScope)}
              className="neo-mm-input"
            >
              <option value="user">user（个人）</option>
              <option value="project">project（项目）</option>
              <option value="session">session（会话）</option>
            </select>
          </label>
        ) : (
          <label className="neo-mm-field">
            <span className="neo-mm-field-label">
              {t('neo.memory.fieldScopeKey', { defaultValue: '作用域（留空 = 通用）' })}
            </span>
            <input
              data-testid="memory-modal-scope-key"
              value={scopeKey}
              onChange={(e) => setScopeKey(e.target.value)}
              className="neo-mm-input"
              placeholder={t('neo.memory.fieldScopeKeyPh', {
                defaultValue: '如：web-search（技能名）；通用经验就留空',
              })}
            />
          </label>
        )}
        {isManual && (
          <label className="neo-mm-field">
            <span className="neo-mm-field-label">
              {t('neo.memory.fieldTitle', { defaultValue: '标题' })}
            </span>
            <input
              data-testid="memory-modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="neo-mm-input"
              placeholder={t('neo.memory.fieldTitlePh', { defaultValue: '如：用户偏好的输出格式' })}
            />
          </label>
        )}
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {isManual
              ? t('neo.memory.fieldContent', { defaultValue: '内容' })
              : t('neo.memory.fieldContentMax', { defaultValue: '内容（≤600 字，重复提交会加权已有条目）' })}
          </span>
          <textarea
            data-testid="memory-modal-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={isManual ? 5 : 4}
            maxLength={isManual ? undefined : 600}
            className="neo-mm-input"
            placeholder={isManual ? undefined : '如：长文翻译先分段再合，整段直译容易丢上下文'}
          />
        </label>

        {localError && <div role="alert" className="neo-mm-modal-error">{localError}</div>}

        <div className="neo-mm-modal-actions">
          <button onClick={onCancel} className="neo-mm-btn">
            {t('neo.memory.cancel', { defaultValue: '取消' })}
          </button>
          <button
            data-testid="memory-modal-submit"
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

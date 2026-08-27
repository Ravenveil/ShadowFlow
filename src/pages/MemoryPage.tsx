/**
 * MemoryPage — 河流记忆（River Memory）前端补齐，2026-08-19。
 *
 * 定位澄清：河流记忆是「记忆」不是「知识库」——
 *   - 记忆（本页）：跨会话的条目式笔记（user/project/session 三层 scope），
 *     背后是 Node 端 Story 16.1 的 /api/memory-entries（JSON 文件 CRUD）。
 *   - 知识库（/knowledge）：KnowledgePack 声明式知识源 + RAG 检索 + 引用出处，
 *     图谱可视化在 /knowledge/graph（数据来自 LightRAG GraphML）。
 *
 * 数据源：src/api/memoryEntries.ts（GET/POST/PATCH/DELETE /api/memory-entries）。
 * 视觉：与 KnowledgePage 同一套 Neo 作用域 token（./memory-neo.css）。
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
import { useI18n } from '../common/i18n';
import MemoryProfilePanel from './MemoryProfilePanel';
import './memory-neo.css';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type ScopeFilter = 'all' | MemoryScope;

const SCOPES: ScopeFilter[] = ['all', 'user', 'project', 'session'];

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

/**
 * 双形态（2026-08-19 导航架构统一批）：路由页 /memory 全页模式；NeoApp 中栏
 * `<MemoryPage embedded />` 内嵌变体（rail 常驻，紧凑头 + 100% 高度填充）。
 */
export default function MemoryPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [editing, setEditing] = useState<MemoryEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const data = scopeFilter === 'all'
        ? await listMemoryEntries()
        : await listMemoryEntries(scopeFilter);
      setEntries(data);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(`记忆加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [scopeFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMemoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setErrorMsg(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleSave = useCallback(
    async (payload: { scope: MemoryScope; title: string; content: string }) => {
      if (editing) {
        const updated = await updateMemoryEntry(editing.id, payload);
        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        setEditing(null);
      } else {
        const created = await createMemoryEntry(payload);
        setEntries((prev) => [created, ...prev]);
        setCreating(false);
      }
      setErrorMsg('');
    },
    [editing],
  );

  const scopeLabel = useMemo(
    () => ({
      all: t('neo.memory.scopeAll', { defaultValue: '全部' }),
      user: t('neo.memory.scopeUser', { defaultValue: '个人' }),
      project: t('neo.memory.scopeProject', { defaultValue: '项目' }),
      session: t('neo.memory.scopeSession', { defaultValue: '会话' }),
    }),
    [t],
  );

  return (
    <div data-testid="memory-page" className={`neo-mm${embedded ? ' neo-mm--inline' : ''}`}>
      <header className="neo-mm-header">
        <div>
          <p className="neo-mm-eyebrow">Memory / River Memory</p>
          <h1 className="neo-mm-title">
            {t('neo.memory.title', { defaultValue: '河流记忆' })}
          </h1>
          <p className="neo-mm-sub">
            {t('neo.memory.subtitle', {
              defaultValue: '跨会话沉淀的条目式记忆（个人 / 项目 / 会话三层），由 Agent 在对话中自动写入或手动摘录。',
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

      <div className="neo-mm-tabs" role="tablist" aria-label="scope filter">
        {SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scopeFilter === s}
            data-testid={`memory-scope-${s}`}
            onClick={() => setScopeFilter(s)}
            className={`neo-mm-tab${scopeFilter === s ? ' on' : ''}`}
          >
            {scopeLabel[s]}
          </button>
        ))}
      </div>

      <MemoryProfilePanel />

      {status === 'loading' && (
        <div className="neo-mm-loading">
          {t('neo.memory.loading', { defaultValue: '加载中…' })}
        </div>
      )}

      {status === 'success' && entries.length === 0 && (
        <div className="neo-mm-empty">
          {t('neo.memory.empty', {
            defaultValue: '还没有记忆条目。对话中 Agent 摘录的结论会沉淀到这里，也可以点右上角手动新增。',
          })}
        </div>
      )}

      {status === 'success' && entries.length > 0 && (
        <div className="neo-mm-list">
          {entries.map((entry) => (
            <div key={entry.id} data-testid={`memory-card-${entry.id}`} className="neo-mm-card">
              <div className="neo-mm-card-head">
                <h3 className="neo-mm-card-title">{entry.title}</h3>
                <span className={`neo-mm-scope-pill neo-mm-scope-pill--${entry.scope}`}>
                  {entry.scope}
                </span>
              </div>
              {entry.content && <p className="neo-mm-card-content">{entry.content}</p>}
              <p className="neo-mm-card-meta">
                created {fmtDate(entry.created_at)} · updated {fmtDate(entry.updated_at)}
              </p>
              <div className="neo-mm-card-actions">
                <button
                  onClick={() => setEditing(entry)}
                  className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
                >
                  {t('neo.memory.edit', { defaultValue: '编辑' })}
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
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
        <MemoryEntryModal
          title={t('neo.memory.modalTitleNew', { defaultValue: '新记忆' })}
          onCancel={() => setCreating(false)}
          onSubmit={handleSave}
        />
      )}
      {editing && (
        <MemoryEntryModal
          title={t('neo.memory.modalTitleEdit', { defaultValue: '编辑记忆' })}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
        />
      )}
    </div>
  );
}

function MemoryEntryModal({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: MemoryEntry;
  onCancel: () => void;
  onSubmit: (p: { scope: MemoryScope; title: string; content: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? 'user');
  const [entryTitle, setEntryTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSubmit = entryTitle.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setLocalError('');
    try {
      await onSubmit({ scope, title: entryTitle.trim(), content: content.trim() });
    } catch (err) {
      setLocalError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal data-testid="memory-entry-modal" className="neo-mm-modal-mask">
      <div className="neo-mm-modal">
        <h2 className="neo-mm-modal-title">{title}</h2>
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
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.fieldTitle', { defaultValue: '标题' })}
          </span>
          <input
            data-testid="memory-modal-title"
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            className="neo-mm-input"
            placeholder={t('neo.memory.fieldTitlePh', { defaultValue: '如：用户偏好的输出格式' })}
          />
        </label>
        <label className="neo-mm-field">
          <span className="neo-mm-field-label">
            {t('neo.memory.fieldContent', { defaultValue: '内容' })}
          </span>
          <textarea
            data-testid="memory-modal-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="neo-mm-input"
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

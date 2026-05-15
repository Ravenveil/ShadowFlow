/**
 * MemoryPage.tsx — Story 16.1 — River Memory settings panel
 *
 * Route: /memory
 * Style: inline styles, no Tailwind — mirrors ProjectsPage.tsx pattern.
 */
import { useEffect, useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import { useI18n } from '../common/i18n';
import {
  listMemoryEntries,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
  getMemorySettings,
  updateMemorySettings,
  type MemoryEntry,
  type MemoryScope,
} from '../api/memoryEntries';

// ── Relative time helper (no dayjs/date-fns) ──────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Scope badge ───────────────────────────────────────────────────────────────

const SCOPE_COLORS: Record<MemoryScope, { bg: string; border: string; text: string }> = {
  user:    { bg: 'rgba(37,99,235,.12)',  border: 'rgba(37,99,235,.22)',  text: '#2563EB' },
  project: { bg: 'rgba(5,150,105,.12)',  border: 'rgba(5,150,105,.22)',  text: '#059669' },
  session: { bg: 'rgba(168,85,247,.12)', border: 'rgba(168,85,247,.22)', text: '#A855F7' },
};

function ScopeTag({ scope, label }: { scope: MemoryScope; label: string }) {
  const c = SCOPE_COLORS[scope];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: MemoryEntry;
  scopeLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  error?: string;
}

function EntryCard({ entry, scopeLabel, onEdit, onDelete, error }: EntryCardProps) {
  const [hovered, setHovered] = useState(false);
  const preview = entry.content.length > 80 ? entry.content.slice(0, 80) + '…' : entry.content;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 14px',
        borderRadius: 8,
        border: `1px solid ${error ? '#ef4444' : 'var(--t-border)'}`,
        background: 'var(--t-panel)',
        marginBottom: 8,
        position: 'relative',
        transition: 'border-color .15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <ScopeTag scope={entry.scope} label={scopeLabel} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--t-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.title}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--t-fg-4)', flexShrink: 0 }}>
          {relativeTime(entry.updated_at)}
        </span>
      </div>

      {/* Content preview */}
      {preview && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--t-fg-3)',
            lineHeight: 1.55,
            paddingRight: hovered ? 56 : 0,
          }}
        >
          {preview}
        </p>
      )}

      {/* Error */}
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>{error}</p>
      )}

      {/* Hover action buttons */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'flex',
            gap: 4,
          }}
        >
          <button
            type="button"
            title="编辑"
            onClick={onEdit}
            style={actionBtnStyle}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            title="删除"
            onClick={onDelete}
            style={{ ...actionBtnStyle, color: '#ef4444' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 5,
  border: '1px solid var(--t-border)',
  background: 'var(--t-panel-2)',
  cursor: 'pointer',
  color: 'var(--t-fg-3)',
};

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial?: MemoryEntry;
  onSave: (data: Pick<MemoryEntry, 'scope' | 'title' | 'content'>) => Promise<void>;
  onClose: () => void;
  titleNew: string;
  titleEdit: string;
  labelScope: string;
  labelTitle: string;
  labelContent: string;
  labelSave: string;
  labelCancel: string;
}

function EntryModal({
  initial,
  onSave,
  onClose,
  titleNew,
  titleEdit,
  labelScope,
  labelTitle,
  labelContent,
  labelSave,
  labelCancel,
}: ModalProps) {
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? 'user');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr('标题不能为空'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave({ scope, title: title.trim(), content });
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700 }}>
          {initial ? titleEdit : titleNew}
        </h3>

        <form onSubmit={handleSubmit}>
          {/* Scope */}
          <label style={labelStyle}>{labelScope}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['user', 'project', 'session'] as MemoryScope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: `1px solid ${scope === s ? SCOPE_COLORS[s].border : 'var(--t-border)'}`,
                  background: scope === s ? SCOPE_COLORS[s].bg : 'transparent',
                  color: scope === s ? SCOPE_COLORS[s].text : 'var(--t-fg-3)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Title */}
          <label style={labelStyle}>{labelTitle}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus
            style={inputStyle}
            placeholder="Max 120 chars"
          />

          {/* Content */}
          <label style={labelStyle}>{labelContent}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={4000}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', height: 'auto', fontFamily: 'inherit' }}
            placeholder="Markdown supported · max 4000 chars"
          />

          {err && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 8px' }}>{err}</p>}

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>{labelCancel}</button>
            <button type="submit" disabled={saving} style={saveBtnStyle}>
              {saving ? '…' : labelSave}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t-fg-4)',
  marginBottom: 5,
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '7px 10px',
  marginBottom: 12,
  borderRadius: 7,
  border: '1px solid var(--t-border)',
  background: 'var(--t-bg)',
  color: 'var(--t-fg)',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 7,
  border: '1px solid var(--t-border)',
  background: 'transparent',
  color: 'var(--t-fg-3)',
  fontSize: 12.5,
  cursor: 'pointer',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '6px 18px',
  borderRadius: 7,
  border: 'none',
  background: 'var(--t-accent)',
  color: 'var(--t-accent-ink, #fff)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};

// ── Main page ─────────────────────────────────────────────────────────────────

type ScopeFilter = 'all' | MemoryScope;

interface CardError {
  id: string;
  message: string;
}

export default function MemoryPage() {
  const { t } = useI18n();

  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [enabled, setEnabled] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<MemoryEntry | undefined>(undefined);
  const [cardErrors, setCardErrors] = useState<CardError[]>([]);
  const errorTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const [items, settings] = await Promise.all([
          listMemoryEntries(),
          getMemorySettings(),
        ]);
        if (!cancelled) {
          setEntries(items);
          setEnabled(settings.enabled);
        }
      } catch {
        if (!cancelled) setLoadError('加载失败，请刷新重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setCardError(id: string, msg: string) {
    setCardErrors((prev) => {
      const next = prev.filter((e) => e.id !== id);
      return [...next, { id, message: msg }];
    });
    const existing = errorTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setCardErrors((prev) => prev.filter((e) => e.id !== id));
      errorTimers.current.delete(id);
    }, 1500);
    errorTimers.current.set(id, timer);
  }

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      await updateMemorySettings({ enabled: next });
    } catch {
      setEnabled(!next);
    }
  }

  async function handleSave(data: Pick<MemoryEntry, 'scope' | 'title' | 'content'>) {
    if (editTarget) {
      const updated = await updateMemoryEntry(editTarget.id, data);
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } else {
      const created = await createMemoryEntry(data);
      setEntries((prev) => [created, ...prev]);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMemoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (ex) {
      setCardError(id, (ex as Error).message);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.scope === filter);
  const counts: Record<ScopeFilter, number> = {
    all: entries.length,
    user: entries.filter((e) => e.scope === 'user').length,
    project: entries.filter((e) => e.scope === 'project').length,
    session: entries.filter((e) => e.scope === 'session').length,
  };

  const TABS: { key: ScopeFilter; label: string }[] = [
    { key: 'all',     label: t('memory.tabAll') },
    { key: 'user',    label: t('memory.tabUser') },
    { key: 'project', label: t('memory.tabProject') },
    { key: 'session', label: t('memory.tabSession') },
  ];

  const SCOPE_LABELS: Record<MemoryScope, string> = {
    user:    t('memory.scopeUser'),
    project: t('memory.scopeProject'),
    session: t('memory.scopeSession'),
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 28px 14px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Brain size={18} strokeWidth={1.75} style={{ color: 'var(--t-accent)' }} />
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t('memory.title')}</h1>

          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--t-fg-3)' }}>{t('memory.enabled')}</span>
            <button
              type="button"
              onClick={handleToggle}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: 'none',
                background: enabled ? 'var(--t-accent)' : 'var(--t-fg-5, #555)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background .2s',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: enabled ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left .2s',
                }}
              />
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-4)' }}>{t('memory.subtitle')}</p>
      </div>

      {/* Toolbar: tabs + new button */}
      <div
        style={{
          padding: '10px 28px',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: active ? '1px solid var(--t-accent)' : '1px solid transparent',
                background: active ? 'var(--t-accent-tint)' : 'transparent',
                color: active ? 'var(--t-accent-bright, var(--t-accent))' : 'var(--t-fg-3)',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {tab.label}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  padding: '1px 4px',
                  borderRadius: 3,
                  background: active ? 'var(--t-accent)' : 'var(--t-panel-2)',
                  color: active ? 'var(--t-accent-ink, #fff)' : 'var(--t-fg-4)',
                }}
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => { setEditTarget(undefined); setShowModal(true); }}
          style={{
            padding: '5px 12px',
            borderRadius: 7,
            border: '1px solid var(--t-accent)',
            background: 'var(--t-accent-tint)',
            color: 'var(--t-accent-bright, var(--t-accent))',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('memory.newBtn')}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px', position: 'relative' }}>
        {/* Disabled overlay */}
        {!enabled && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,.35)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 0,
              backdropFilter: 'blur(1px)',
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--t-fg-3)', fontWeight: 500 }}>
              {t('memory.disabledOverlay')}
            </span>
          </div>
        )}

        {loading && (
          <p style={{ color: 'var(--t-fg-4)', fontSize: 13 }}>加载中…</p>
        )}

        {!loading && loadError && (
          <p style={{ color: '#ef4444', fontSize: 13 }}>{loadError}</p>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 0',
              gap: 10,
            }}
          >
            <Brain size={36} strokeWidth={1.25} style={{ color: 'var(--t-fg-5, #555)' }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--t-fg-3)' }}>
              {t('memory.empty')}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-4)' }}>
              {t('memory.emptyDesc')}
            </p>
            <button
              type="button"
              onClick={() => { setEditTarget(undefined); setShowModal(true); }}
              style={{
                marginTop: 6,
                padding: '6px 16px',
                borderRadius: 7,
                border: '1px solid var(--t-border)',
                background: 'var(--t-panel)',
                color: 'var(--t-fg-2)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('memory.emptyCta')}
            </button>
          </div>
        )}

        {!loading && !loadError && filtered.map((entry) => {
          const cardErr = cardErrors.find((e) => e.id === entry.id);
          return (
            <EntryCard
              key={entry.id}
              entry={entry}
              scopeLabel={SCOPE_LABELS[entry.scope]}
              error={cardErr?.message}
              onEdit={() => { setEditTarget(entry); setShowModal(true); }}
              onDelete={() => handleDelete(entry.id)}
            />
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <EntryModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(undefined); }}
          titleNew={t('memory.modalTitleNew')}
          titleEdit={t('memory.modalTitleEdit')}
          labelScope={t('memory.fieldScope')}
          labelTitle={t('memory.fieldTitle')}
          labelContent={t('memory.fieldContent')}
          labelSave={t('memory.btnSave')}
          labelCancel={t('memory.btnCancel')}
        />
      )}
    </div>
  );
}

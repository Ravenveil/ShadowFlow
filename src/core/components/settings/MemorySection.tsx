/**
 * MemorySection — Settings: River Memory panel (Story 16.1)
 * Embedded inside SettingsModal, no page-level wrapper.
 */
import { useEffect, useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import { useI18n } from '../../../common/i18n';
import {
  listMemoryEntries,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
  getMemorySettings,
  updateMemorySettings,
  type MemoryEntry,
  type MemoryScope,
} from '../../../api/memoryEntries';

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 6px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry, scopeLabel, error, onEdit, onDelete,
}: {
  entry: MemoryEntry; scopeLabel: string; error?: string;
  onEdit: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const preview = entry.content.length > 80 ? entry.content.slice(0, 80) + '…' : entry.content;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 12px', borderRadius: 8, marginBottom: 6,
        border: `1px solid ${error ? '#ef4444' : 'var(--t-border)'}`,
        background: 'var(--t-bg)', position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ScopeTag scope={entry.scope} label={scopeLabel} />
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--t-fg-4)', flexShrink: 0 }}>
          {relativeTime(entry.updated_at)}
        </span>
      </div>
      {preview && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--t-fg-3)', lineHeight: 1.5, paddingRight: hovered ? 54 : 0 }}>
          {preview}
        </p>
      )}
      {error && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#ef4444' }}>{error}</p>}
      {hovered && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
          {[
            { title: '编辑', onClick: onEdit, icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', color: 'var(--t-fg-3)' },
            { title: '删除', onClick: onDelete, icon: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', color: '#ef4444' },
          ].map((btn) => (
            <button key={btn.title} type="button" title={btn.title} onClick={btn.onClick} style={{
              width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 5, border: '1px solid var(--t-border)', background: 'var(--t-panel)', cursor: 'pointer', color: btn.color,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {btn.icon.split(' ').map((d, i) => <path key={i} d={d} />)}
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function EntryModal({
  initial, onSave, onClose,
  labelScope, labelTitle, labelContent, labelSave, labelCancel,
}: {
  initial?: MemoryEntry;
  onSave: (d: Pick<MemoryEntry, 'scope' | 'title' | 'content'>) => Promise<void>;
  onClose: () => void;
  labelScope: string; labelTitle: string; labelContent: string;
  labelSave: string; labelCancel: string;
}) {
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? 'user');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr('标题不能为空'); return; }
    setSaving(true); setErr('');
    try { await onSave({ scope, title: title.trim(), content }); onClose(); }
    catch (ex) { setErr((ex as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--t-panel)', border: '1px solid var(--t-border)',
        borderRadius: 12, padding: 22,
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>
          {initial ? '编辑记忆' : '新记忆'}
        </h3>
        <form onSubmit={submit}>
          <label style={lbl}>{labelScope}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['user', 'project', 'session'] as MemoryScope[]).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
                border: `1px solid ${scope === s ? SCOPE_COLORS[s].border : 'var(--t-border)'}`,
                background: scope === s ? SCOPE_COLORS[s].bg : 'transparent',
                color: scope === s ? SCOPE_COLORS[s].text : 'var(--t-fg-3)',
              }}>{s}</button>
            ))}
          </div>
          <label style={lbl}>{labelTitle}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus style={inp} />
          <label style={lbl}>{labelContent}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} rows={4}
            style={{ ...inp, resize: 'vertical', height: 'auto', fontFamily: 'inherit' }} />
          {err && <p style={{ color: '#ef4444', fontSize: 11, margin: '2px 0 8px' }}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>{labelCancel}</button>
            <button type="submit" disabled={saving} style={saveBtn}>{saving ? '…' : labelSave}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--t-fg-4)', marginBottom: 4, letterSpacing: '0.04em' };
const inp: React.CSSProperties = { display: 'block', width: '100%', padding: '6px 9px', marginBottom: 10, borderRadius: 6, border: '1px solid var(--t-border)', background: 'var(--t-bg)', color: 'var(--t-fg)', fontSize: 12.5, boxSizing: 'border-box', outline: 'none' };
const cancelBtn: React.CSSProperties = { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--t-border)', background: 'transparent', color: 'var(--t-fg-3)', fontSize: 12, cursor: 'pointer' };
const saveBtn: React.CSSProperties = { padding: '5px 16px', borderRadius: 6, border: 'none', background: 'var(--t-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' };

// ── Section ───────────────────────────────────────────────────────────────────

type ScopeFilter = 'all' | MemoryScope;

export function MemorySection() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [enabled, setEnabled] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<MemoryEntry | undefined>();
  const [cardErrors, setCardErrors] = useState<{ id: string; message: string }[]>([]);
  const errorTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError('');
      try {
        const [items, settings] = await Promise.all([listMemoryEntries(), getMemorySettings()]);
        if (!cancelled) { setEntries(items); setEnabled(settings.enabled); }
      } catch { if (!cancelled) setLoadError('加载失败，请刷新重试'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  function setCardError(id: string, msg: string) {
    setCardErrors((p) => [...p.filter((e) => e.id !== id), { id, message: msg }]);
    const timer = setTimeout(() => { setCardErrors((p) => p.filter((e) => e.id !== id)); errorTimers.current.delete(id); }, 1500);
    const old = errorTimers.current.get(id); if (old) clearTimeout(old);
    errorTimers.current.set(id, timer);
  }

  async function handleToggle() {
    const next = !enabled; setEnabled(next);
    try { await updateMemorySettings({ enabled: next }); } catch { setEnabled(!next); }
  }

  async function handleSave(data: Pick<MemoryEntry, 'scope' | 'title' | 'content'>) {
    if (editTarget) {
      const updated = await updateMemoryEntry(editTarget.id, data);
      setEntries((p) => p.map((e) => (e.id === updated.id ? updated : e)));
    } else {
      const created = await createMemoryEntry(data);
      setEntries((p) => [created, ...p]);
    }
  }

  async function handleDelete(id: string) {
    try { await deleteMemoryEntry(id); setEntries((p) => p.filter((e) => e.id !== id)); }
    catch (ex) { setCardError(id, (ex as Error).message); }
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.scope === filter);
  const counts = {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t('memory.title')}</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--t-fg-3)' }}>{t('memory.enabled')}</span>
            <button type="button" onClick={handleToggle} style={{
              width: 34, height: 19, borderRadius: 10, border: 'none', padding: 0,
              background: enabled ? 'var(--t-accent)' : 'var(--t-fg-5, #555)',
              cursor: 'pointer', position: 'relative', transition: 'background .2s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: enabled ? 16 : 2,
                width: 15, height: 15, borderRadius: '50%', background: '#fff',
                transition: 'left .2s',
              }} />
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-4)' }}>{t('memory.subtitle')}</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        {TABS.map((tab) => {
          const on = filter === tab.key;
          return (
            <button key={tab.key} type="button" onClick={() => setFilter(tab.key)} style={{
              padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: on ? 600 : 400,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
              border: on ? '1px solid var(--t-accent)' : '1px solid transparent',
              background: on ? 'var(--t-accent-tint)' : 'transparent',
              color: on ? 'var(--t-accent-bright, var(--t-accent))' : 'var(--t-fg-3)',
            }}>
              {tab.label}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 4px', borderRadius: 3,
                background: on ? 'var(--t-accent)' : 'var(--t-panel-2)',
                color: on ? '#fff' : 'var(--t-fg-4)',
              }}>{counts[tab.key]}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => { setEditTarget(undefined); setShowModal(true); }} style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
          border: '1px solid var(--t-accent)', background: 'var(--t-accent-tint)',
          color: 'var(--t-accent-bright, var(--t-accent))', cursor: 'pointer',
        }}>{t('memory.newBtn')}</button>
      </div>

      {/* List area */}
      <div style={{ position: 'relative', minHeight: 80 }}>
        {!enabled && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)',
            zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, backdropFilter: 'blur(1px)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--t-fg-3)', fontWeight: 500 }}>
              {t('memory.disabledOverlay')}
            </span>
          </div>
        )}

        {loading && <p style={{ color: 'var(--t-fg-4)', fontSize: 12 }}>加载中…</p>}
        {!loading && loadError && <p style={{ color: '#ef4444', fontSize: 12 }}>{loadError}</p>}

        {!loading && !loadError && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-fg-4)' }}>
            <Brain size={28} strokeWidth={1.25} style={{ marginBottom: 8, opacity: 0.4 }} />
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--t-fg-3)' }}>{t('memory.empty')}</p>
            <p style={{ margin: '0 0 12px', fontSize: 11.5 }}>{t('memory.emptyDesc')}</p>
            <button type="button" onClick={() => { setEditTarget(undefined); setShowModal(true); }} style={{
              padding: '5px 14px', borderRadius: 6, border: '1px solid var(--t-border)',
              background: 'var(--t-panel)', color: 'var(--t-fg-2)', fontSize: 12, cursor: 'pointer',
            }}>{t('memory.emptyCta')}</button>
          </div>
        )}

        {!loading && !loadError && filtered.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            scopeLabel={SCOPE_LABELS[entry.scope]}
            error={cardErrors.find((e) => e.id === entry.id)?.message}
            onEdit={() => { setEditTarget(entry); setShowModal(true); }}
            onDelete={() => handleDelete(entry.id)}
          />
        ))}
      </div>

      {showModal && (
        <EntryModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(undefined); }}
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

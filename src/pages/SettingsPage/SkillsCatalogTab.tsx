/**
 * SkillsCatalogTab — Skills 管理面板 (Settings ▸ Integrations ▸ Skills)
 *
 * 1:1 对标 OpenDesign 的 Skills 设置面板，但完全采用 ShadowFlow 的设计 token
 * (`--t-*`) 与 `hf-*` class，视觉风格与其它 Settings 子页一致。
 *
 * 功能区:
 *   - 标题块 (hf-label + 大标题 + 副标题) + 右上「New skill」入口
 *   - 搜索 input (按 name/description 实时过滤)
 *   - filter pills: source(All/Built-in/User) + mode(All/blueprint/prototype/report)
 *   - 列表: 每行卡片含 名称 + mode/source badge + 描述 + enable 开关 + 删除(仅 user)
 *   - New skill inline 表单: 粘贴 URL / markdown → ingestSkill
 *   - 空态 / 加载态 / 错误态
 *
 * 后端契约 (冻结):
 *   listSkills() / setSkillEnabled(id, enabled) / deleteSkill(id)  ← src/api/skills.ts
 *   ingestSkill(source)                                            ← src/api/skillIngest.ts
 *
 * 禁用 emoji 图标 — 一律 lucide-react 单色线性图标。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Box,
  RefreshCw,
  X,
} from 'lucide-react';
import { useI18n } from '../../common/i18n';
import {
  listSkills,
  setSkillEnabled,
  deleteSkill,
  type SkillInfo,
  type SkillMode,
  type SkillKind,
} from '../../api/skills';
import { ingestSkill } from '../../api/skillIngest';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type SourceFilter = 'all' | 'builtin' | 'user';
type ModeFilter = 'all' | SkillMode;
type KindFilter = 'all' | SkillKind;
type DomainFilter = 'all' | string;

interface PillDef<T extends string> {
  value: T;
  label: string;
}

// 2026-06-03 — 分类主轴 kind → i18n key（docs §10.3）。
const KIND_LABEL_KEY: Record<SkillKind, string> = {
  workflow: 'skillsCatalog.kindWorkflow',
  capability: 'skillsCatalog.kindCapability',
  generator: 'skillsCatalog.kindGenerator',
};

// ---------------------------------------------------------------------------
// Filter pill — selected = accent-tint bg + accent text; idle = bg + border
// ---------------------------------------------------------------------------

function FilterPill<T extends string>({
  def,
  active,
  onSelect,
}: {
  def: PillDef<T>;
  active: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(def.value)}
      style={{
        padding: '4px 11px',
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
        background: active ? 'var(--t-accent-tint)' : 'var(--t-bg)',
        border: `1px solid ${active ? 'transparent' : 'var(--t-border)'}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 120ms ease-out, color 120ms ease-out',
        whiteSpace: 'nowrap',
      }}
    >
      {def.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mode / source badge
// ---------------------------------------------------------------------------

function ModeBadge({ mode, label }: { mode: SkillMode; label: string }) {
  return (
    <span
      className="hf-mono"
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 4,
        color: 'var(--t-fg-3)',
        background: 'var(--t-panel-2)',
        border: '1px solid var(--t-border)',
        flexShrink: 0,
      }}
      data-mode={mode}
    >
      {label}
    </span>
  );
}

function SourceBadge({ isUser, label }: { isUser: boolean; label: string }) {
  return (
    <span
      className="hf-mono"
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 4,
        color: isUser ? 'var(--t-accent)' : 'var(--t-fg-4)',
        background: isUser ? 'var(--t-accent-tint)' : 'var(--t-bg)',
        border: `1px solid ${isUser ? 'transparent' : 'var(--t-border)'}`,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// 2026-06-03 — 分类主轴 badge（docs §10.3）。每个 kind 一个稳定色，便于扫读。
const KIND_TINT: Record<SkillKind, { fg: string; bg: string }> = {
  workflow: { fg: 'var(--t-accent)', bg: 'var(--t-accent-tint)' },
  capability: { fg: 'var(--status-run, #60a5fa)', bg: 'rgba(96,165,250,.12)' },
  generator: { fg: 'var(--t-fg-3)', bg: 'var(--t-panel-2)' },
};

function KindBadge({ kind, label }: { kind: SkillKind; label: string }) {
  const tint = KIND_TINT[kind];
  return (
    <span
      className="hf-mono"
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 4,
        color: tint.fg,
        background: tint.bg,
        border: '1px solid transparent',
        flexShrink: 0,
      }}
      data-kind={kind}
    >
      {label}
    </span>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        color: 'var(--t-fg-4)',
        background: 'var(--t-bg)',
        border: '1px solid var(--t-border)',
        flexShrink: 0,
      }}
      data-domain={domain}
    >
      {domain}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skill row card
// ---------------------------------------------------------------------------

interface SkillRowProps {
  skill: SkillInfo;
  modeLabel: string;
  onToggle: (skill: SkillInfo) => void;
  onDelete: (skill: SkillInfo) => void;
}

function SkillRow({ skill, modeLabel, onToggle, onDelete }: SkillRowProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = skill.enabled !== false; // default to enabled when unknown
  const isUser = skill.source === 'user';

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  function handleDeleteClick() {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
    onDelete(skill);
  }

  return (
    <div
      className="hf-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        opacity: enabled ? 1 : 0.55,
        transition: 'opacity 120ms ease-out',
      }}
      data-testid={`skill-row-${skill.skill_id}`}
    >
      {/* Left: name + badges + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)' }}>
            {skill.name}
          </span>
          {skill.kind && <KindBadge kind={skill.kind} label={t(KIND_LABEL_KEY[skill.kind])} />}
          <ModeBadge mode={skill.mode} label={modeLabel} />
          <SourceBadge
            isUser={isUser}
            label={isUser ? t('skillsCatalog.sourceUser') : t('skillsCatalog.sourceBuiltin')}
          />
          {skill.domain && <DomainBadge domain={skill.domain} />}
        </div>
        {skill.description && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--t-fg-3)',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={skill.description}
          >
            {skill.description}
          </p>
        )}
      </div>

      {/* Right: enable toggle + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onToggle(skill)}
          title={enabled ? t('skillsCatalog.enabled') : t('skillsCatalog.disabled')}
          aria-pressed={enabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderRadius: 7,
            border: '1px solid var(--t-border)',
            background: 'var(--t-bg)',
            color: enabled ? 'var(--t-accent)' : 'var(--t-fg-4)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {enabled ? <ToggleRight size={16} strokeWidth={2} /> : <ToggleLeft size={16} strokeWidth={2} />}
          <span style={{ fontSize: 10.5 }}>
            {enabled ? t('skillsCatalog.enabled') : t('skillsCatalog.disabled')}
          </span>
        </button>

        {isUser && (
          <button
            type="button"
            onClick={handleDeleteClick}
            title={t('skillsCatalog.delete')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 7,
              border: `1px solid ${confirming ? 'var(--t-danger, #ef4444)' : 'var(--t-border)'}`,
              background: confirming ? 'rgba(239,68,68,.12)' : 'var(--t-bg)',
              color: confirming ? 'var(--t-danger, #ef4444)' : 'var(--t-fg-4)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 600,
              transition: 'background 120ms ease-out, color 120ms ease-out',
            }}
            data-testid={`skill-delete-${skill.skill_id}`}
          >
            <Trash2 size={14} strokeWidth={2} />
            {confirming && <span style={{ fontSize: 10.5 }}>{t('skillsCatalog.confirmDelete')}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillsCatalogTab
// ---------------------------------------------------------------------------

export function SkillsCatalogTab() {
  const { t } = useI18n();

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await listSkills();
      setSkills(list);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- mode label resolver -------------------------------------------------
  const modeLabel = useCallback(
    (mode: SkillMode): string => {
      switch (mode) {
        case 'blueprint':
          return t('skillsCatalog.modeBlueprint');
        case 'prototype':
          return t('skillsCatalog.modePrototype');
        case 'report':
          return t('skillsCatalog.modeReport');
        default:
          return mode;
      }
    },
    [t],
  );

  // --- toggle (optimistic, rollback on failure) ---------------------------
  const handleToggle = useCallback(
    async (skill: SkillInfo) => {
      const next = !(skill.enabled !== false);
      setSkills((prev) =>
        prev.map((s) => (s.skill_id === skill.skill_id ? { ...s, enabled: next } : s)),
      );
      try {
        await setSkillEnabled(skill.skill_id, next);
      } catch (e) {
        // rollback
        setSkills((prev) =>
          prev.map((s) => (s.skill_id === skill.skill_id ? { ...s, enabled: !next } : s)),
        );
        setNotice(
          t('skillsCatalog.toggleFailed', { msg: e instanceof Error ? e.message : String(e) }),
        );
      }
    },
    [t],
  );

  // --- delete --------------------------------------------------------------
  const handleDelete = useCallback(
    async (skill: SkillInfo) => {
      try {
        await deleteSkill(skill.skill_id);
        setSkills((prev) => prev.filter((s) => s.skill_id !== skill.skill_id));
      } catch (e) {
        setNotice(
          t('skillsCatalog.deleteFailed', { msg: e instanceof Error ? e.message : String(e) }),
        );
        // re-sync in case backend state diverged
        refresh();
      }
    },
    [t, refresh],
  );

  // --- import --------------------------------------------------------------
  const handleImport = useCallback(async () => {
    const source = importText.trim();
    setImportError(null);
    if (!source) {
      setImportError(t('skillsCatalog.importEmpty'));
      return;
    }
    setImporting(true);
    try {
      const summary = await ingestSkill(source);
      setShowImport(false);
      setImportText('');
      setNotice(t('skillsCatalog.importSuccess', { name: summary.name }));
      await refresh();
    } catch (e) {
      setImportError(
        t('skillsCatalog.importFailed', { msg: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      setImporting(false);
    }
  }, [importText, t, refresh]);

  // --- filtered list -------------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (sourceFilter !== 'all') {
        const src = s.source ?? 'builtin';
        if (src !== sourceFilter) return false;
      }
      if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
      if (kindFilter !== 'all' && (s.kind ?? 'generator') !== kindFilter) return false;
      if (domainFilter !== 'all' && (s.domain ?? '') !== domainFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [skills, query, sourceFilter, modeFilter, kindFilter, domainFilter]);

  const sourcePills: PillDef<SourceFilter>[] = [
    { value: 'all', label: t('skillsCatalog.filterAll') },
    { value: 'builtin', label: t('skillsCatalog.filterBuiltin') },
    { value: 'user', label: t('skillsCatalog.filterUser') },
  ];
  const modePills: PillDef<ModeFilter>[] = [
    { value: 'all', label: t('skillsCatalog.filterAll') },
    { value: 'blueprint', label: t('skillsCatalog.modeBlueprint') },
    { value: 'prototype', label: t('skillsCatalog.modePrototype') },
    { value: 'report', label: t('skillsCatalog.modeReport') },
  ];
  // 2026-06-03 — 分类主轴 kind（固定 3 类）+ 副轴 domain（从数据动态生成，
  // 对齐 OpenDesign 的 category pills 体验）。docs §10.3。
  const kindPills: PillDef<KindFilter>[] = [
    { value: 'all', label: t('skillsCatalog.filterAll') },
    { value: 'workflow', label: t('skillsCatalog.kindWorkflow') },
    { value: 'capability', label: t('skillsCatalog.kindCapability') },
    { value: 'generator', label: t('skillsCatalog.kindGenerator') },
  ];
  const domainValues = [
    ...new Set(skills.map((s) => s.domain).filter((d): d is string => !!d)),
  ].sort();
  const domainPills: PillDef<DomainFilter>[] = [
    { value: 'all', label: t('skillsCatalog.filterAll') },
    ...domainValues.map((d) => ({ value: d, label: d })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
            {t('skillsCatalog.label')}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              marginTop: 4,
              letterSpacing: '-.02em',
              color: 'var(--t-fg)',
            }}
          >
            {t('skillsCatalog.title')}
          </div>
          <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6, maxWidth: 560 }}>
            {t('skillsCatalog.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowImport((v) => !v);
            setImportError(null);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--t-accent)',
            color: 'var(--t-accent-ink, #fff)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12.5,
            fontWeight: 600,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          data-testid="skills-new-btn"
        >
          <Plus size={15} strokeWidth={2.25} />
          {t('skillsCatalog.newSkill')}
        </button>
      </div>

      {/* ── Notice toast (inline) ── */}
      {notice && (
        <div
          className="hf-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--t-fg-2)',
          }}
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="dismiss"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--t-fg-4)',
              cursor: 'pointer',
              display: 'inline-flex',
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── New skill inline form ── */}
      {showImport && (
        <div
          className="hf-card"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}
        >
          <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
            {t('skillsCatalog.newSkill')}
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={t('skillsCatalog.importPlaceholder')}
            rows={5}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: 8,
              border: '1px solid var(--t-border)',
              background: 'var(--t-bg)',
              color: 'var(--t-fg)',
              padding: '8px 10px',
              fontSize: 12.5,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
            data-testid="skills-import-textarea"
          />
          {importError && (
            <p style={{ fontSize: 12, color: 'var(--t-danger, #ef4444)' }}>{importError}</p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--t-accent)',
                color: 'var(--t-accent-ink, #fff)',
                cursor: importing ? 'default' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? t('skillsCatalog.importing') : t('skillsCatalog.import')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowImport(false);
                setImportError(null);
              }}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid var(--t-border)',
                background: 'transparent',
                color: 'var(--t-fg-3)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 12.5,
              }}
            >
              {t('skillsCatalog.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── Search + filter row ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            strokeWidth={2}
            color="var(--t-fg-4)"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('skillsCatalog.searchPlaceholder')}
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--t-border)',
              background: 'var(--t-bg)',
              color: 'var(--t-fg)',
              padding: '8px 12px 8px 32px',
              fontSize: 12.5,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            data-testid="skills-search"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="hf-label" style={{ marginRight: 2 }}>
              {t('skillsCatalog.filterSourceLabel')}
            </span>
            {sourcePills.map((p) => (
              <FilterPill
                key={p.value}
                def={p}
                active={sourceFilter === p.value}
                onSelect={setSourceFilter}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="hf-label" style={{ marginRight: 2 }}>
              {t('skillsCatalog.filterKindLabel')}
            </span>
            {kindPills.map((p) => (
              <FilterPill
                key={p.value}
                def={p}
                active={kindFilter === p.value}
                onSelect={setKindFilter}
              />
            ))}
          </div>
          {domainValues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="hf-label" style={{ marginRight: 2 }}>
                {t('skillsCatalog.filterDomainLabel')}
              </span>
              {domainPills.map((p) => (
                <FilterPill
                  key={p.value}
                  def={p}
                  active={domainFilter === p.value}
                  onSelect={setDomainFilter}
                />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="hf-label" style={{ marginRight: 2 }}>
              {t('skillsCatalog.filterModeLabel')}
            </span>
            {modePills.map((p) => (
              <FilterPill
                key={p.value}
                def={p}
                active={modeFilter === p.value}
                onSelect={setModeFilter}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── List / states ── */}
      {loading ? (
        <div
          className="hf-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '40px 16px',
            color: 'var(--t-fg-4)',
            fontSize: 12.5,
          }}
        >
          <RefreshCw size={16} strokeWidth={2} style={{ animation: 'sf-spin .8s linear infinite' }} />
          {t('skillsCatalog.loading')}
        </div>
      ) : loadError ? (
        <div
          className="hf-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '40px 16px',
          }}
        >
          <p style={{ fontSize: 12.5, color: 'var(--t-fg-3)' }}>{t('skillsCatalog.loadFailed')}</p>
          <button
            type="button"
            onClick={refresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--t-border)',
              background: 'var(--t-bg)',
              color: 'var(--t-fg-2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
            }}
          >
            <RefreshCw size={14} strokeWidth={2} />
            {t('skillsCatalog.retry')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="hf-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '48px 16px',
            color: 'var(--t-fg-4)',
          }}
        >
          <Box size={28} strokeWidth={1.25} color="var(--t-fg-4)" />
          <p style={{ fontSize: 12.5 }}>
            {skills.length === 0 ? t('skillsCatalog.empty') : t('skillsCatalog.emptyFiltered')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((s) => (
            <SkillRow
              key={s.skill_id}
              skill={s}
              modeLabel={modeLabel(s.mode)}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SkillsCatalogTab;

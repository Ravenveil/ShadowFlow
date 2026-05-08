// ============================================================================
// TemplatesPage — pick a seed team to open in the editor
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRESETS } from './templates/presets';
import { listUserTemplates, deleteUserTemplate, type UserTemplate } from './templates/userTemplates';
import { QUICK_DEMO_PROMPTS } from './core/constants/quickDemoPrompts';
import { TemplateCard as QuickDemoCard } from './core/components/templates/TemplateCard';
import { listTemplates, type TemplateListItem } from './api/templates';

type Lang = 'EN' | 'CN';

const V = {
  panel:      'var(--skin-panel)',
  bg:         'var(--bg)',
  elev1:      'var(--bg-elev-1)',
  elev2:      'var(--bg-elev-2)',
  border:     'var(--border)',
  borderSub:  'var(--border-subtle)',
  fg0:        'var(--fg-0)',
  fg1:        'var(--fg-1)',
  fg2:        'var(--fg-2)',
  fg3:        'var(--fg-3)',
  fg4:        'var(--fg-4)',
  fg5:        'var(--fg-5)',
  accent:     'var(--accent)',
  accentBr:   'var(--accent-bright)',
  accentTint: 'var(--accent-tint)',
  mono:       'var(--font-mono)',
  sans:       'var(--font-sans)',
};

const COPY = {
  EN: {
    title:    'Pick a template',
    grad:     'or start from scratch.',
    sub:      'Every template is a fully-wired agent graph with Policy Matrix preconfigured. Fork it, tweak it, or start from blank.',
    back:     '← back',
    sectionFeatured: 'Featured',
    sectionAll:      'Seed library',
    sectionMine:     'My templates',
    emptyMine:       'No custom templates yet. Edit a workflow and click Save to add one.',
    deleteBtn:       'Delete',
    confirmDelete:   (n: string) => `Delete "${n}"?`,
    remaining: (n: number) => `${n} templates`,
    forkOpen: '▶ Fork & open',
    blankOpen:'＋ Start blank',
    preview:  'Preview',
    agents:   'Agents',
    edges:    'Edges',
    services: 'Services',
    retry:    'Retry depth',
    featured: '★ FEATURED',
    bilingual:'中 bilingual',
    sectionBuilder:  'Builder Generated',
    emptyBuilder:    'No Builder-generated templates yet. Use the Agent Builder to publish your first Agent.',
    builderBadge:    'Builder',
    openInEditor:    'Open in editor',
  },
  CN: {
    title:    '选择模板',
    grad:     '或从零开始。',
    sub:      '每个模板都是已接线的 agent 工作流，Policy Matrix 也已预配。Fork 即用，微调即改，也可以空白起步。',
    back:     '← 返回',
    sectionFeatured: '精选模板',
    sectionAll:      '模板库',
    sectionMine:     '我的模板',
    emptyMine:       '还没有自定义模板。在编辑器里点"保存"把当前画布存成模板。',
    deleteBtn:       '删除',
    confirmDelete:   (n: string) => `确认删除"${n}"？`,
    remaining: (n: number) => `共 ${n} 个模板`,
    forkOpen: '▶ Fork 并打开',
    blankOpen:'＋ 空白画布',
    preview:  '预览',
    agents:   'Agents',
    edges:    'Edges',
    services: 'Services',
    retry:    'Retry depth',
    featured: '★ 精选',
    bilingual:'中英双语',
    sectionBuilder:  'Builder 生成',
    emptyBuilder:    '还没有 Builder 生成的模板。使用 Agent Builder 发布你的第一个 Agent。',
    builderBadge:    'Builder',
    openInEditor:    '在编辑器中打开',
  },
} as const;


interface TemplatesPageProps {
  onBack: () => void;
  onPick: (alias: string) => void;
  onQuickDemo: (alias: string) => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function TemplatesPage({ onBack, onPick, onQuickDemo, lang, onToggleLang }: TemplatesPageProps) {
  const t = COPY[lang];
  const allAliases = Object.keys(PRESETS);
  const allTemplates = allAliases.map(a => PRESETS[a]);

  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  useEffect(() => { setUserTpls(listUserTemplates()); }, []);
  const refreshUser = () => setUserTpls(listUserTemplates());
  const handleDelete = (tpl: UserTemplate) => {
    if (!window.confirm(t.confirmDelete(tpl.title))) return;
    deleteUserTemplate(tpl.alias);
    refreshUser();
  };

  // Builder-generated templates (Story 8.6 AC6)
  const [builderTpls, setBuilderTpls] = useState<TemplateListItem[]>([]);
  useEffect(() => {
    listTemplates()
      .then(items => setBuilderTpls(items.filter(it => it.builder_origin === 'builder')))
      .catch(() => { /* silent — server may not be running in local dev */ });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: V.bg, color: V.fg1 }}>
      {/* Top bar */}
      <div style={{ height: 56, background: V.panel, borderBottom: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16 }}>
        <button onClick={onBack}
          style={{ fontFamily: V.mono, fontSize: 12, color: V.fg3, background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg1; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg3; }}>
          {t.back}
        </button>
        <div style={{ width: 1, height: 20, background: V.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: V.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: V.sans, fontWeight: 900, fontSize: 14, color: 'var(--accent-ink)', letterSpacing: '-.03em' }}>S</div>
          <span style={{ fontFamily: V.sans, fontWeight: 700, fontSize: 14, letterSpacing: '-.02em' }}>ShadowFlow</span>
          <span style={{ color: V.fg5 }}>/</span>
          <span style={{ fontFamily: V.mono, fontSize: 12, color: V.fg2 }}>{lang === 'CN' ? '模板' : 'Templates'}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onToggleLang}
          style={{ fontFamily: V.mono, fontSize: 11, fontWeight: 600, color: V.fg2, background: V.elev1, border: `1px solid ${V.border}`, borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ padding: '2px 6px', borderRadius: 4, background: lang === 'EN' ? V.accentTint : 'transparent', color: lang === 'EN' ? V.accentBr : V.fg4 }}>EN</span>
          <span style={{ padding: '2px 6px', borderRadius: 4, background: lang === 'CN' ? V.accentTint : 'transparent', color: lang === 'CN' ? V.accentBr : V.fg4 }}>中</span>
        </button>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 40px 80px' }}>
        {/* Breadcrumb */}
        <nav style={{ fontFamily: V.mono, fontSize: 11, color: V.fg5, marginBottom: 24, display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: V.fg4, cursor: 'pointer', fontFamily: V.mono, fontSize: 11, padding: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg1; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg4; }}>
            Home
          </button>
          <span style={{ color: V.fg5 }}>&gt;</span>
          <span style={{ color: V.fg3 }}>Templates</span>
        </nav>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, marginBottom: 36 }}>
          <div>
            <h1 style={{ fontFamily: V.sans, fontSize: 56, fontWeight: 900, letterSpacing: '-.035em', lineHeight: 1, margin: '0 0 14px' }}>
              {t.title}{' '}
              <span style={{ background: `linear-gradient(90deg, ${V.accent}, ${V.accentBr})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {t.grad}
              </span>
            </h1>
            <p style={{ fontSize: 15, color: V.fg3, maxWidth: 700, lineHeight: 1.55, margin: 0 }}>
              {t.sub}
            </p>
          </div>
        </div>

        {/* 6 Template Quick Demo Gallery */}
        <style>{`
          .sf-tpl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          @media (max-width: 1024px) { .sf-tpl-grid { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 640px) { .sf-tpl-grid { grid-template-columns: 1fr; } }
        `}</style>
        <div className="sf-tpl-grid" style={{ marginBottom: 48 }}>
          {allTemplates.map(p => {
            const demo = QUICK_DEMO_PROMPTS[p.alias] ?? QUICK_DEMO_PROMPTS.blank;
            return (
              <QuickDemoCard
                key={p.alias}
                preset={p}
                demo={demo}
                lang={lang}
                onQuickDemo={() => p.alias === 'blank' ? onPick('blank') : onQuickDemo(p.alias)}
                onCustomEdit={() => onPick(p.alias)}
              />
            );
          })}
        </div>

        {/* Builder Generated templates (Story 8.6 AC6) */}
        {builderTpls.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <SectionHeader label={t.sectionBuilder} meta={`${builderTpls.length}`} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {builderTpls.map(tpl => (
                <BuilderTemplateCard
                  key={tpl.template_id}
                  tpl={tpl}
                  builderBadge={t.builderBadge}
                  openInEditorLabel={t.openInEditor}
                  onPick={() => onPick(tpl.template_id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* My templates */}
        <div style={{ marginBottom: 40 }}>
          <SectionHeader label={t.sectionMine} meta={userTpls.length ? `${userTpls.length}` : undefined} />
          {userTpls.length === 0 ? (
            <div style={{ padding: '24px 20px', border: `1px dashed ${V.border}`, borderRadius: 14, fontFamily: V.mono, fontSize: 12, color: V.fg5, textAlign: 'center' }}>
              {t.emptyMine}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {userTpls.map(tpl => (
                <UserTemplateCard key={tpl.alias} tpl={tpl} lang={lang} onPick={() => onPick(tpl.alias)} onDelete={() => handleDelete(tpl)} deleteLabel={t.deleteBtn} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ label, meta }: { label: string; meta?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
      <h3 style={{ fontFamily: V.sans, fontSize: 22, fontWeight: 800, letterSpacing: '-.015em', margin: 0, color: V.fg1 }}>
        {label}
      </h3>
      {meta && <span style={{ fontFamily: V.mono, fontSize: 12, color: V.fg5 }}>· {meta}</span>}
    </div>
  );
}


function UserTemplateCard({ tpl, lang, onPick, onDelete, deleteLabel }: { tpl: UserTemplate; lang: Lang; onPick: () => void; onDelete: () => void; deleteLabel: string }) {
  const [hov, setHov] = useState(false);
  const created = new Date(tpl.createdAt);
  const dateLabel = created.toLocaleDateString(lang === 'CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: V.panel,
        /* fixme: token — rgba(168,85,247,.4) is alpha 0.4, no matching tint token */
        border: `1px solid ${hov ? 'rgba(168,85,247,.4)' : V.border}`,
        borderRadius: 14, overflow: 'hidden',
        transition: 'all 180ms',
        display: 'flex', flexDirection: 'column',
      }}>
      <div onClick={onPick} style={{ cursor: 'pointer', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700, color: V.accentBr, letterSpacing: '.12em', textTransform: 'uppercase' }}>mine</span>
          <span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg5 }}>· {dateLabel}</span>
        </div>
        <h4 style={{ fontFamily: V.sans, fontSize: 17, fontWeight: 800, letterSpacing: '-.015em', margin: 0, color: V.fg1 }}>
          {tpl.title}
        </h4>
        {tpl.description && (
          <p style={{ fontSize: 12.5, color: V.fg3, lineHeight: 1.55, margin: 0, flex: 1 }}>
            {tpl.description}
          </p>
        )}
        <div style={{ paddingTop: 10, borderTop: `1px dashed ${V.border}`, display: 'flex', justifyContent: 'space-between', fontFamily: V.mono, fontSize: 10, color: V.fg4 }}>
          <span>{tpl.stats.agents} agents · {tpl.stats.edges} edges</span>
          <span style={{ color: V.accentBr }}>▶ Fork &amp; open</span>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${V.borderSub}`, padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onDelete}
          style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--status-reject)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg5; }}>
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}


// ── BuilderTemplateCard — Story 8.6 AC6 ──────────────────────────────────────

function BuilderTemplateCard({ tpl, builderBadge, openInEditorLabel, onPick }: {
  tpl: TemplateListItem;
  builderBadge: string;
  openInEditorLabel: string;
  onPick: () => void;
}) {
  const [hov, setHov] = useState(false);
  // Patch 19: use React Router navigate instead of <a href> hard navigation
  const navigate = useNavigate();

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      data-testid={`builder-template-card-${tpl.template_id}`}
      style={{
        background: V.panel,
        /* fixme: token — rgba(168,85,247,.4) is alpha 0.4, no matching tint token */
        border: `1px solid ${hov ? 'rgba(168,85,247,.4)' : V.border}`,
        borderRadius: 14, overflow: 'hidden',
        transition: 'all 180ms',
        display: 'flex', flexDirection: 'column',
      }}>
      <div onClick={onPick} style={{ cursor: 'pointer', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Builder badge — distinguishes from seed templates (AC6) */}
          <span
            data-testid={`builder-badge-${tpl.template_id}`}
            style={{
              fontFamily: V.mono, fontSize: 9.5, fontWeight: 700,
              color: 'var(--accent-ink)',
              background: V.accent,
              letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '1px 6px', borderRadius: 4,
            }}>
            {builderBadge}
          </span>
          <span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg5 }}>
            {tpl.template_id ? `${tpl.template_id.slice(0, 8)}…` : '—'}
          </span>
        </div>
        <h4 style={{ fontFamily: V.sans, fontSize: 17, fontWeight: 800, letterSpacing: '-.015em', margin: 0, color: V.fg1 }}>
          {tpl.name}
        </h4>
        {tpl.description && (
          <p style={{ fontSize: 12.5, color: V.fg3, lineHeight: 1.55, margin: 0, flex: 1 }}>
            {tpl.description}
          </p>
        )}
      </div>
      {tpl.workflow_id && (
        <div style={{ borderTop: `1px solid ${V.borderSub}`, padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => navigate(`/editor?workflowId=${tpl.workflow_id}`)}
            data-testid={`open-editor-btn-${tpl.template_id}`}
            style={{ fontFamily: V.mono, fontSize: 10, color: V.accentBr, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none'; }}>
            {openInEditorLabel}
          </button>
        </div>
      )}
    </div>
  );
}


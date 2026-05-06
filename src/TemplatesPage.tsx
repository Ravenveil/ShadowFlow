// ============================================================================
// TemplatesPage — pick a seed team to open in the editor
// ============================================================================

import { useEffect, useState } from 'react';
import { PRESETS, type TemplatePreset } from './templates/presets';
import { listUserTemplates, deleteUserTemplate, type UserTemplate } from './templates/userTemplates';

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
  },
} as const;

// Background accent colors for each template's preview ribbon
const RIBBON_COLORS: Record<string, string> = {
  academic_paper: '#A855F7',
  solo_company:   '#22D3EE',
  newsroom:       '#0EA5E9',
  modern_startup: '#10B981',
  blank:          '#71717A',
};

interface TemplatesPageProps {
  onBack: () => void;
  onPick: (alias: string) => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function TemplatesPage({ onBack, onPick, lang, onToggleLang }: TemplatesPageProps) {
  const t = COPY[lang];
  const allAliases = Object.keys(PRESETS);
  const featured = PRESETS.academic_paper;
  const rest = allAliases.filter(a => a !== 'academic_paper').map(a => PRESETS[a]);

  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  useEffect(() => { setUserTpls(listUserTemplates()); }, []);
  const refreshUser = () => setUserTpls(listUserTemplates());
  const handleDelete = (tpl: UserTemplate) => {
    if (!window.confirm(t.confirmDelete(tpl.title))) return;
    deleteUserTemplate(tpl.alias);
    refreshUser();
  };

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
          <button
            onClick={() => onPick('blank')}
            style={{ fontFamily: V.sans, fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)', background: V.accent, border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', flexShrink: 0, height: 40 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bright)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}>
            {t.blankOpen}
          </button>
        </div>

        {/* Featured */}
        <div style={{ marginBottom: 40 }}>
          <SectionHeader label={t.sectionFeatured} />
          <FeaturedCard preset={featured} lang={lang} copy={t} onPick={() => onPick(featured.alias)} />
        </div>

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

        {/* Grid of other templates */}
        <SectionHeader label={t.sectionAll} meta={t.remaining(rest.length)} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 14 }}>
          {rest.map(p => (
            <TemplateCard key={p.alias} preset={p} lang={lang} copy={t} onPick={() => onPick(p.alias)} />
          ))}
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

function FeaturedCard({ preset, lang, copy, onPick }: { preset: TemplatePreset; lang: Lang; copy: typeof COPY.EN; onPick: () => void }) {
  const [hov, setHov] = useState(false);
  const ribbon = RIBBON_COLORS[preset.alias] || V.accent;

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '400px 1fr',
        background: V.panel, border: `1px solid ${hov ? 'rgba(168,85,247,.4)' : V.border}`,
        borderRadius: 20, overflow: 'hidden', position: 'relative',
        transition: 'all 180ms', cursor: 'default',
      }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${ribbon}, rgba(168,85,247,.1))` }} />

      <div style={{ padding: '32px 32px', display: 'flex', flexDirection: 'column', gap: 16, borderRight: `1px solid ${V.border}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: V.accentTint, color: V.accentBr, border: `1px solid rgba(168,85,247,.4)` }}>{copy.featured}</span>
          <span style={{ fontFamily: V.mono, fontSize: 10, padding: '3px 8px', borderRadius: 6, background: V.elev2, color: V.fg3, border: `1px solid ${V.border}` }}>
            TPL · {preset.alias.toUpperCase()}
          </span>
          <span style={{ fontFamily: V.mono, fontSize: 10, padding: '3px 8px', borderRadius: 6, background: V.elev2, color: V.fg3, border: `1px solid ${V.border}` }}>{copy.bilingual}</span>
        </div>

        <h2 style={{ fontFamily: V.sans, fontSize: 36, fontWeight: 900, letterSpacing: '-.025em', lineHeight: 1.05, margin: '4px 0 0' }}>
          {preset.title[lang === 'CN' ? 'zh' : 'en']}
          <span style={{ color: V.fg5, fontWeight: 700, marginLeft: 10, fontSize: 24 }}>· {preset.cjk}</span>
        </h2>

        <p style={{ fontSize: 14, color: V.fg3, lineHeight: 1.6, margin: 0 }}>
          {preset.description[lang === 'CN' ? 'zh' : 'en']}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', padding: '14px 0', borderTop: `1px dashed ${V.border}`, borderBottom: `1px dashed ${V.border}` }}>
          <Stat k={copy.agents}   v={String(preset.stats.agents)} />
          <Stat k={copy.edges}    v={String(preset.stats.edges)} />
          <Stat k={copy.services} v={preset.stats.services} mono />
          <Stat k={copy.retry}    v={String(preset.stats.retryDepth)} mono />
        </div>

        <div style={{ fontFamily: V.mono, fontSize: 10.5, color: V.fg4, lineHeight: 1.6 }}>
          <div>by <span style={{ color: V.accentBr }}>@ravenveil</span> · seed · MIT</div>
          <div>cid://bafybei…55fbzdi</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button onClick={onPick}
            style={{ flex: 1.4, height: 40, fontFamily: V.sans, fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)', background: V.accent, border: 'none', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bright)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}>
            {copy.forkOpen}
          </button>
          <button
            style={{ flex: 1, height: 40, fontFamily: V.sans, fontSize: 13, fontWeight: 600, color: V.fg2, background: 'transparent', border: `1px solid ${V.border}`, borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = V.elev2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
            {copy.preview}
          </button>
        </div>
      </div>

      {/* Preview panel — shows node graph visually */}
      <PreviewGraph preset={preset} />
    </div>
  );
}

function Stat({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: V.fg4 }}>{k}</div>
      <div style={{ fontFamily: mono ? V.mono : V.sans, fontSize: mono ? 15 : 20, fontWeight: mono ? 700 : 800, letterSpacing: '-.015em', color: V.fg1, lineHeight: 1, marginTop: 4 }}>{v}</div>
    </div>
  );
}

function TemplateCard({ preset, lang, copy, onPick }: { preset: TemplatePreset; lang: Lang; copy: typeof COPY.EN; onPick: () => void }) {
  const [hov, setHov] = useState(false);
  const ribbon = RIBBON_COLORS[preset.alias] || V.accent;
  const isBlank = preset.alias === 'blank';

  return (
    <div
      onClick={onPick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: isBlank ? 'transparent' : V.panel,
        border: isBlank
          ? `1px dashed ${hov ? ribbon : V.borderSub}`
          : `1px solid ${hov ? 'rgba(168,85,247,.4)' : V.border}`,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        transition: 'all 180ms',
        display: 'flex', flexDirection: 'column',
      }}>
      {!isBlank && (
        <div style={{ height: 120, position: 'relative', overflow: 'hidden', background: V.bg, backgroundImage: 'radial-gradient(circle, var(--bg-elev-4) 1px, transparent 1px)', backgroundSize: '14px 14px', borderBottom: `1px solid ${V.border}` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: ribbon, opacity: .6 }} />
          <PreviewMini preset={preset} />
        </div>
      )}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700, color: V.accentBr, letterSpacing: '.12em', textTransform: 'uppercase' }}>
          {preset.alias}
        </div>
        <h4 style={{ fontFamily: V.sans, fontSize: 17, fontWeight: 800, letterSpacing: '-.015em', margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {preset.title[lang === 'CN' ? 'zh' : 'en']}
          <span style={{ color: V.fg5, fontSize: 13, fontWeight: 700 }}>· {preset.cjk}</span>
        </h4>
        <p style={{ fontSize: 12.5, color: V.fg3, lineHeight: 1.55, margin: 0, flex: 1 }}>
          {preset.description[lang === 'CN' ? 'zh' : 'en']}
        </p>
        <div style={{ paddingTop: 10, borderTop: `1px dashed ${V.border}`, display: 'flex', justifyContent: 'space-between', fontFamily: V.mono, fontSize: 10, color: V.fg4 }}>
          {isBlank ? (
            <span>{copy.blankOpen}</span>
          ) : (
            <>
              <span>{preset.stats.agents} agents · {preset.stats.edges} edges</span>
              <span style={{ color: V.accentBr }}>{copy.forkOpen}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple SVG preview — dots for nodes, lines for edges
function PreviewMini({ preset }: { preset: TemplatePreset }) {
  if (!preset.nodes.length) return null;

  // Normalize positions to fit 280×100 viewport
  const xs = preset.nodes.map(n => n.position.x);
  const ys = preset.nodes.map(n => n.position.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  const scale = (x: number, y: number) => {
    const sx = 20 + ((x - minX) / rangeX) * 240;
    const sy = 20 + ((y - minY) / rangeY) * 80;
    return { sx, sy };
  };

  const posMap = new Map<string, { sx: number; sy: number }>();
  preset.nodes.forEach(n => posMap.set(n.id, scale(n.position.x, n.position.y)));

  return (
    <svg width="100%" height="120" viewBox="0 0 280 120" style={{ position: 'absolute', inset: 0 }}>
      {/* edges */}
      {preset.edges.map((e, i) => {
        const a = posMap.get(e.source); const b = posMap.get(e.target);
        if (!a || !b) return null;
        const midX = (a.sx + b.sx) / 2;
        return (
          <path key={i}
            d={`M ${a.sx} ${a.sy} C ${midX} ${a.sy}, ${midX} ${b.sy}, ${b.sx} ${b.sy}`}
            stroke="rgba(168,85,247,.45)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        );
      })}
      {/* nodes */}
      {preset.nodes.map(n => {
        const p = posMap.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <circle cx={p.sx} cy={p.sy} r={6} fill="var(--bg-elev-3)" stroke="var(--accent)" strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
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

function PreviewGraph({ preset }: { preset: TemplatePreset }) {
  if (!preset.nodes.length) return <div style={{ minHeight: 440, background: V.bg, backgroundImage: 'radial-gradient(circle, var(--bg-elev-4) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />;

  const xs = preset.nodes.map(n => n.position.x);
  const ys = preset.nodes.map(n => n.position.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  const scale = (x: number, y: number) => ({
    sx: 80 + ((x - minX) / rangeX) * 600,
    sy: 60 + ((y - minY) / rangeY) * 300,
  });

  const posMap = new Map<string, { sx: number; sy: number }>();
  preset.nodes.forEach(n => posMap.set(n.id, scale(n.position.x, n.position.y)));

  return (
    <div style={{ position: 'relative', minHeight: 440, background: V.bg, backgroundImage: 'radial-gradient(circle, var(--bg-elev-4) 1px, transparent 1px)', backgroundSize: '18px 18px', overflow: 'hidden' }}>
      <svg width="100%" height="100%" viewBox="0 0 760 440" style={{ position: 'absolute', inset: 0 }}>
        {preset.edges.map((e, i) => {
          const a = posMap.get(e.source); const b = posMap.get(e.target);
          if (!a || !b) return null;
          const midX = (a.sx + b.sx) / 2;
          return (
            <path key={i}
              d={`M ${a.sx} ${a.sy} C ${midX} ${a.sy}, ${midX} ${b.sy}, ${b.sx} ${b.sy}`}
              stroke="rgba(168,85,247,.55)" strokeWidth={2} fill="none" strokeLinecap="round" />
          );
        })}
      </svg>
      {preset.nodes.map(n => {
        const p = posMap.get(n.id);
        if (!p) return null;
        return (
          <div key={n.id} style={{
            position: 'absolute', left: p.sx - 60, top: p.sy - 18,
            width: 120, padding: '8px 10px', borderRadius: 10,
            background: V.elev3 || 'var(--bg-elev-3)', border: `1px solid ${V.border}`,
            fontFamily: V.sans, fontSize: 12, fontWeight: 700, color: V.fg1,
            textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.4)',
          }}>
            {n.nodeType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
        );
      })}
    </div>
  );
}

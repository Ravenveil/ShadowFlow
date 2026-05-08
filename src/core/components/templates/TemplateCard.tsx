import { useState } from 'react';
import { Sparkles } from '../../../common/icons/iconRegistry';
import type { TemplatePreset } from '../../../templates/presets';
import type { TemplateDemo } from '../../constants/quickDemoPrompts';

const V = {
  panel: 'var(--t-panel)',
  bg: 'var(--t-bg)',
  elev2: 'var(--t-panel-2)',
  border: 'var(--t-border)',
  borderSub: 'var(--t-border)',
  fg1: 'var(--t-fg)',
  fg3: 'var(--t-fg-3)',
  fg4: 'var(--t-fg-4)',
  fg5: 'var(--t-fg-5)',
  accent: 'var(--t-accent)',
  accentBr: 'var(--t-accent-bright)',
  accentTint: 'var(--t-accent-tint)',
  mono: 'var(--font-mono)',
  sans: 'var(--font-sans)',
};

const RIBBON_COLORS: Record<string, string> = {
  academic_paper: '#A855F7',
  solo_company: '#22D3EE',
  newsroom: '#0EA5E9',
  modern_startup: '#10B981',
  ming_cabinet: '#F59E0B',
  blank: '#71717A',
};

interface TemplateCardProps {
  preset: TemplatePreset;
  demo: TemplateDemo;
  lang: 'EN' | 'CN';
  onQuickDemo: () => void;
  onCustomEdit: () => void;
}

export function TemplateCard({ preset, demo, lang, onQuickDemo, onCustomEdit }: TemplateCardProps) {
  const [hov, setHov] = useState(false);
  const ribbon = RIBBON_COLORS[preset.alias] || V.accent;
  const isBlank = preset.alias === 'blank';
  const zh = lang === 'CN';
  const painPoint = zh ? demo.painPoint.zh : demo.painPoint.en;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      role="article"
      aria-label={preset.title[zh ? 'zh' : 'en']}
      style={{
        background: isBlank ? 'transparent' : V.panel,
        border: isBlank
          ? `1px dashed ${hov ? ribbon : V.borderSub}`
          /* fixme: token — alpha 0.4 has no matching tint token */
          : `1px solid ${hov ? 'rgba(168,85,247,.4)' : V.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'all 180ms',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Preview area */}
      {!isBlank && (
        <div
          style={{
            height: 140,
            position: 'relative',
            overflow: 'hidden',
            background: V.bg,
            backgroundImage: 'radial-gradient(circle, var(--t-panel-3) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
            borderBottom: `1px solid ${V.border}`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: ribbon,
              opacity: 0.6,
            }}
          />
          <PreviewMini preset={preset} />
        </div>
      )}

      {/* Card body */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div
          style={{
            fontFamily: V.mono,
            fontSize: 9.5,
            fontWeight: 700,
            color: V.accentBr,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          {preset.alias.replace(/_/g, ' ')}
        </div>
        <h4
          style={{
            fontFamily: V.sans,
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: '-.015em',
            margin: 0,
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          {preset.title[zh ? 'zh' : 'en']}
          <span style={{ color: V.fg5, fontSize: 13, fontWeight: 700 }}>· {preset.cjk}</span>
        </h4>

        {/* Pain point */}
        <p
          style={{
            fontSize: 13,
            color: V.fg3,
            lineHeight: 1.55,
            margin: 0,
            flex: 1,
            fontStyle: 'italic',
          }}
        >
          {painPoint}
        </p>

        {/* Stats */}
        {!isBlank && (
          <div
            style={{
              fontFamily: V.mono,
              fontSize: 10,
              color: V.fg4,
              paddingTop: 8,
              borderTop: `1px dashed ${V.border}`,
            }}
          >
            {preset.stats.agents} agents · {preset.stats.edges} edges
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onQuickDemo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onQuickDemo();
            }}
            style={{
              flex: 1.4,
              height: 36,
              fontFamily: V.sans,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-ink)',
              background: V.accent,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-accent-bright)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-accent)';
            }}
          >
            {isBlank ? (
              zh ? '＋ 空白画布' : '＋ Start blank'
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} strokeWidth={2} /> Quick Demo
              </span>
            )}
          </button>
          {!isBlank && (
            <button
              onClick={onCustomEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) onCustomEdit();
              }}
              style={{
                flex: 1,
                height: 36,
                fontFamily: V.sans,
                fontSize: 12,
                fontWeight: 600,
                color: V.fg3,
                background: 'transparent',
                border: `1px solid ${V.border}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = V.elev2;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {zh ? '✎ 自定义编辑' : '✎ Custom Edit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewMini({ preset }: { preset: TemplatePreset }) {
  if (!preset.nodes.length) return null;

  const xs = preset.nodes.map((n) => n.position.x);
  const ys = preset.nodes.map((n) => n.position.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  const scale = (x: number, y: number) => ({
    sx: 20 + ((x - minX) / rangeX) * 240,
    sy: 20 + ((y - minY) / rangeY) * 100,
  });

  const posMap = new Map<string, { sx: number; sy: number }>();
  preset.nodes.forEach((n) => posMap.set(n.id, scale(n.position.x, n.position.y)));

  return (
    <svg
      width="100%"
      height="140"
      viewBox="0 0 280 140"
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      {preset.edges.map((e, i) => {
        const a = posMap.get(e.source);
        const b = posMap.get(e.target);
        if (!a || !b) return null;
        const midX = (a.sx + b.sx) / 2;
        return (
          <path
            key={i}
            d={`M ${a.sx} ${a.sy} C ${midX} ${a.sy}, ${midX} ${b.sy}, ${b.sx} ${b.sy}`}
            stroke="rgba(168,85,247,.45)"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      {preset.nodes.map((n) => {
        const p = posMap.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <circle
              cx={p.sx}
              cy={p.sy}
              r={6}
              fill="var(--t-panel-3)"
              stroke={n.overrideColor || 'var(--t-accent)'}
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

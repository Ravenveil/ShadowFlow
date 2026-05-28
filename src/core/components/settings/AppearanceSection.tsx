/**
 * AppearanceSection — Settings: Theme selector (redesigned)
 *
 * Three theme cards each rendering a miniature window preview in its own
 * literal colors, so users can see the exact palette before switching.
 * Selected card gets a purple accent ring + badge.
 */
import React, { useState } from 'react';
import { useTheme, type ThemePref } from '../../../components/hifi/useTheme';
import { useI18n } from '../../../common/i18n';
import {
  loadCustomTheme,
  setCustomColor,
  resetCustomTheme,
  getEffectiveColor,
  type CustomSlot,
} from '../../../components/hifi/customTheme';

export const APPEARANCE_I18N_KEYS = {
  header: 'appearance.header',
  subtitle: 'appearance.subtitle',
  modeLabel: 'appearance.modeLabel',
  themeDark: 'appearance.theme.dark',
  themeLight: 'appearance.theme.light',
  themeSystem: 'appearance.theme.system',
  selected: 'appearance.selected',
  note: 'appearance.note',
} as const;

interface Palette {
  bg: string; panel: string; sidebar: string; border: string;
  fg: string; fg2: string; fg4: string; accent: string; accentTint: string;
}

// Exact palette per theme — NOT var(--t-*) tokens on purpose.
const P: { dark: Palette; light: Palette } = {
  dark: {
    bg: '#111113',
    panel: '#18181B',
    sidebar: '#141416',
    border: '#2A2A2E',
    fg: '#FAFAFA',
    fg2: '#A1A1AA',
    fg4: '#52525B',
    accent: '#A855F7',
    accentTint: 'rgba(168,85,247,.18)',
  },
  light: {
    bg: '#F5F4EF',
    panel: '#FFFFFF',
    sidebar: '#ECECEA',
    border: '#E2E0D8',
    fg: '#18181B',
    fg2: '#52525B',
    fg4: '#A1A1AA',
    accent: '#A855F7',
    accentTint: 'rgba(168,85,247,.12)',
  },
} as const;

const ACCENT = '#A855F7';
const ACCENT_TINT = 'rgba(168,85,247,0.13)';

// ---------------------------------------------------------------------------
// Mini window preview — simulates a tiny ShadowFlow shell
// ---------------------------------------------------------------------------
function MiniPreview({ c, split }: { c: Palette; split?: boolean }) {
  // For the "system" card we show a 50/50 dark-left / light-right split
  const leftC  = split ? P.dark  : c;
  const rightC = split ? P.light : c;

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${c.border}`,
        display: 'flex',
        flexDirection: 'column',
        background: c.bg,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 18,
          background: c.panel,
          borderBottom: `1px solid ${c.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF5F57', opacity: 0.8 }} />
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FEBC2E', opacity: 0.8 }} />
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#28C840', opacity: 0.8 }} />
        <div style={{ flex: 1, margin: '0 6px', height: 6, borderRadius: 3, background: c.border }} />
      </div>

      {/* Body — sidebar + content, optionally split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left half */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div
            style={{
              width: 24,
              background: leftC.sidebar,
              borderRight: `1px solid ${leftC.border}`,
              padding: '6px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              flexShrink: 0,
            }}
          >
            {[1, 0.5, 0.5, 0.5].map((op, i) => (
              <div key={i} style={{ height: 4, borderRadius: 2, background: leftC.fg4, opacity: op }} />
            ))}
          </div>
          {/* Content */}
          <div
            style={{
              flex: 1,
              background: leftC.bg,
              padding: '7px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ height: 5, width: '70%', borderRadius: 2.5, background: leftC.fg2, opacity: 0.5 }} />
            <div style={{ height: 4, width: '90%', borderRadius: 2, background: leftC.fg4, opacity: 0.4 }} />
            <div style={{ height: 4, width: '80%', borderRadius: 2, background: leftC.fg4, opacity: 0.3 }} />
            <div style={{ height: 4, width: '60%', borderRadius: 2, background: leftC.fg4, opacity: 0.25 }} />
            <div
              style={{
                marginTop: 4,
                height: 14,
                width: '55%',
                borderRadius: 4,
                background: leftC.accent,
                opacity: 0.9,
              }}
            />
          </div>
        </div>

        {/* Right half (only for split/system) */}
        {split && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderLeft: `1px solid ${rightC.border}` }}>
            <div
              style={{
                width: 24,
                background: rightC.sidebar,
                borderRight: `1px solid ${rightC.border}`,
                padding: '6px 4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                flexShrink: 0,
              }}
            >
              {[1, 0.5, 0.5, 0.5].map((op, i) => (
                <div key={i} style={{ height: 4, borderRadius: 2, background: rightC.fg4, opacity: op }} />
              ))}
            </div>
            <div
              style={{
                flex: 1,
                background: rightC.bg,
                padding: '7px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ height: 5, width: '70%', borderRadius: 2.5, background: rightC.fg2, opacity: 0.5 }} />
              <div style={{ height: 4, width: '90%', borderRadius: 2, background: rightC.fg4, opacity: 0.4 }} />
              <div style={{ height: 4, width: '80%', borderRadius: 2, background: rightC.fg4, opacity: 0.3 }} />
              <div style={{ height: 4, width: '60%', borderRadius: 2, background: rightC.fg4, opacity: 0.25 }} />
              <div
                style={{
                  marginTop: 4,
                  height: 14,
                  width: '55%',
                  borderRadius: 4,
                  background: rightC.accent,
                  opacity: 0.9,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single theme card
// ---------------------------------------------------------------------------
interface ThemeCardProps {
  id: ThemePref;
  label: string;
  sublabel: string;
  selected: boolean;
  onClick: () => void;
}

function ThemeCard({ id, label, sublabel, selected, onClick }: ThemeCardProps) {
  const [hover, setHover] = React.useState(false);

  const isLight  = id === 'light';
  const isSystem = id === 'system';

  // Card shell uses current token system (adapts to active theme)
  const cardBg = selected
    ? 'var(--t-panel-2)'
    : hover
    ? 'var(--t-panel-2)'
    : 'var(--t-panel)';

  const previewC: Palette = isLight ? P.light : P.dark;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderRadius: 14,
        border: selected
          ? `1.5px solid ${ACCENT}`
          : `1px solid var(--t-border)`,
        background: cardBg,
        boxShadow: selected
          ? `0 0 0 3px ${ACCENT_TINT}`
          : hover
          ? '0 2px 8px rgba(0,0,0,.12)'
          : 'none',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'box-shadow 140ms ease, border-color 140ms ease, background 120ms ease',
      }}
    >
      {/* Selected badge */}
      {selected && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: ACCENT,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}

      {/* Mini preview window */}
      <MiniPreview c={previewC} split={isSystem} />

      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 }}>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selected ? ACCENT : 'var(--t-fg)',
              lineHeight: 1.2,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--t-fg-4)',
              fontFamily: 'var(--font-mono, monospace)',
              marginTop: 2,
            }}
          >
            {sublabel}
          </div>
        </div>

        {/* Radio indicator */}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: selected ? `5px solid ${ACCENT}` : '1.5px solid var(--t-border-2, var(--t-border))',
            background: selected ? '#fff' : 'transparent',
            flexShrink: 0,
            transition: 'border 140ms ease',
          }}
        />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { language } = useI18n();
  const isZh = language === 'zh';

  const tx = {
    header:      isZh ? '外观' : 'Appearance',
    subtitle:    isZh ? '选择界面颜色主题。' : 'Choose your interface color theme.',
    modeLabel:   isZh ? '颜色模式' : 'Color Mode',
    themeDark:   isZh ? '深色'   : 'Dark',
    themeLight:  isZh ? '浅色'   : 'Light',
    themeSystem: isZh ? '跟随系统' : 'System',
    customLabel: isZh ? '颜色定制' : 'Custom Colors',
    customHint:  isZh
      ? '调整以下颜色会立即生效并保存。覆盖当前主题对应的 CSS 变量；点重置回到当前模式默认。'
      : 'Edits apply instantly and persist. Overrides the current theme tokens; reset to fall back to mode defaults.',
    slotAccent:  isZh ? '强调色' : 'Accent',
    slotBg:      isZh ? '背景色' : 'Background',
    slotFg:      isZh ? '前景色' : 'Foreground',
    resetBtn:    isZh ? '重置默认' : 'Reset to defaults',
  };

  // ── 颜色定制 state ───────────────────────────────────────────────────────
  // Seed from localStorage (custom override) → fall back to active computed
  // CSS token → fall back to a sane hex literal so <input type="color"> never
  // receives an empty/invalid value. Reading getComputedStyle at mount-time
  // is fine for one-shot init; user edits drive subsequent state.
  const [accent, setAccent] = useState(
    () => loadCustomTheme().accent ?? getEffectiveColor('accent', '#A855F7'),
  );
  const [bg, setBg] = useState(
    () => loadCustomTheme().bg ?? getEffectiveColor('bg', '#0A0A0A'),
  );
  const [fg, setFg] = useState(
    () => loadCustomTheme().fg ?? getEffectiveColor('fg', '#FFFFFF'),
  );

  const slotState: Record<CustomSlot, [string, (v: string) => void, string]> = {
    accent: [accent, setAccent, tx.slotAccent],
    bg:     [bg,     setBg,     tx.slotBg],
    fg:     [fg,     setFg,     tx.slotFg],
  };

  function handleColorChange(slot: CustomSlot, value: string) {
    slotState[slot][1](value);
    setCustomColor(slot, value);
  }

  function handleReset() {
    resetCustomTheme();
    // Re-seed from now-effective defaults so the swatches reflect the active
    // mode's tokens (not the previously customized values).
    setAccent(getEffectiveColor('accent', '#A855F7'));
    setBg(getEffectiveColor('bg', '#0A0A0A'));
    setFg(getEffectiveColor('fg', '#FFFFFF'));
  }

  const options: Array<{ id: ThemePref; label: string; sublabel: string }> = [
    { id: 'dark',   label: tx.themeDark,   sublabel: 'dark'   },
    { id: 'light',  label: tx.themeLight,  sublabel: 'light'  },
    { id: 'system', label: tx.themeSystem, sublabel: 'auto'   },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-fg)', margin: 0 }}>
          {tx.header}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t-fg-4)' }}>
          {tx.subtitle}
        </p>
      </div>

      {/* Selector */}
      <div>
        <p
          style={{
            margin: '0 0 10px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-4)',
          }}
        >
          {tx.modeLabel}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {options.map(({ id, label, sublabel }) => (
            <ThemeCard
              key={id}
              id={id}
              label={label}
              sublabel={sublabel}
              selected={theme === id}
              onClick={() => void setTheme(id)}
            />
          ))}
        </div>
      </div>

      {/* 颜色定制 — 3 个 CSS var slot 的色板(强调色/背景/前景)+ 重置。 */}
      <div data-testid="appearance-custom-colors">
        <p
          style={{
            margin: '0 0 6px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-4)',
          }}
        >
          {tx.customLabel}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--t-fg-4)', lineHeight: 1.55 }}>
          {tx.customHint}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['accent', 'bg', 'fg'] as const).map((slot) => {
            const [value, , label] = slotState[slot];
            return (
              <div
                key={slot}
                data-testid={`color-row-${slot}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: '1px solid var(--t-border)',
                  borderRadius: 8,
                  background: 'var(--t-panel)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--t-fg)' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 11,
                      color: 'var(--t-fg-3)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {value.toUpperCase()}
                  </span>
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => handleColorChange(slot, e.target.value)}
                    aria-label={label}
                    data-testid={`color-input-${slot}`}
                    style={{
                      width: 44,
                      height: 28,
                      padding: 0,
                      border: '1px solid var(--t-border)',
                      borderRadius: 6,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleReset}
            data-testid="custom-colors-reset"
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              fontSize: 12,
              padding: '6px 12px',
              border: '1px solid var(--t-border)',
              borderRadius: 6,
              background: 'var(--t-panel)',
              color: 'var(--t-fg)',
              cursor: 'pointer',
            }}
          >
            {tx.resetBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

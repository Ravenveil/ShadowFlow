/**
 * AppearanceSection — Settings: Appearance (ZCode-style)
 *
 * Layout mirrors the ZCode (智谱) settings "外观" page: stacked module cards,
 * each with a module title + description, and setting rows where the label +
 * description sit on the left and the control (dropdown / slider / swatch)
 * sits on the right. Changing a value applies instantly (live preview) and
 * persists to localStorage + backend /api/settings/preferences (best-effort).
 *
 * Modules:
 *   界面设置 Interface  — theme dropdown (dark/light/paper/system) + zoom slider
 *   颜色定制 Custom     — accent / background / foreground color overrides
 */
import React, { useEffect, useState } from 'react';
import { useTheme, type ThemePref } from '../../../components/hifi/useTheme';
import { useI18n } from '../../../common/i18n';
import {
  loadCustomTheme,
  setCustomColor,
  resetCustomTheme,
  getEffectiveColor,
  type CustomSlot,
} from '../../../components/hifi/customTheme';
import {
  applyZoom,
  saveZoom,
  currentZoom,
  DEFAULT_ZOOM,
  ZOOM_MIN,
  ZOOM_MAX,
} from '../../../components/hifi/fontScale';

const ACCENT = '#1447E6';

// ---------------------------------------------------------------------------
// Layout primitives — module card + setting row (ZCode appearance page style)
// ---------------------------------------------------------------------------
function ModuleCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 12,
        background: 'var(--t-panel)',
        padding: '4px 0',
      }}
    >
      <div style={{ padding: '14px 18px 6px' }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg)', margin: 0 }}>
          {title}
        </h3>
        {desc && (
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--t-fg-4)', lineHeight: 1.5 }}>
            {desc}
          </p>
        )}
      </div>
      <div style={{ padding: '6px 0 10px' }}>{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  desc,
  htmlFor,
  children,
}: {
  label: string;
  desc?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '12px 18px',
        borderTop: '1px solid var(--t-border)',
        marginTop: 6,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg)', display: 'block' }}>
          {label}
        </label>
        {desc && (
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--t-fg-4)', lineHeight: 1.5 }}>
            {desc}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  // ── 颜色定制 state ───────────────────────────────────────────────────────
  // Seed from localStorage (custom override) → fall back to active computed
  // CSS token → fall back to a sane hex literal so <input type="color"> never
  // receives an empty/invalid value.
  const [accent, setAccent] = useState(
    () => loadCustomTheme().accent ?? getEffectiveColor('accent', '#1447E6'),
  );
  const [bg, setBg] = useState(
    () => loadCustomTheme().bg ?? getEffectiveColor('bg', '#0A0A0A'),
  );
  const [fg, setFg] = useState(
    () => loadCustomTheme().fg ?? getEffectiveColor('fg', '#FFFFFF'),
  );

  function handleColorChange(slot: CustomSlot, value: string) {
    if (slot === 'accent') setAccent(value);
    else if (slot === 'bg') setBg(value);
    else setFg(value);
    setCustomColor(slot, value);
  }

  function handleColorReset() {
    resetCustomTheme();
    // Re-seed from now-effective defaults so the swatches reflect the active
    // mode's tokens (not the previously customized values).
    setAccent(getEffectiveColor('accent', '#1447E6'));
    setBg(getEffectiveColor('bg', '#0A0A0A'));
    setFg(getEffectiveColor('fg', '#FFFFFF'));
  }

  // ── 界面缩放(2026-06-01 v2,zoom 方案;2026-08 ZCode 式行布局)─────────────
  const [zoom, setZoomState] = useState(() => currentZoom());

  // Follow zoom changes made elsewhere in this tab (bootstrap server sync)
  // or in other tabs (localStorage storage event) so the slider stays true.
  useEffect(() => {
    const onZoomEvent = (e: Event) => {
      const v = (e as CustomEvent<number>).detail;
      if (typeof v === 'number') setZoomState(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'sf-font-scale') return;
      if (e.newValue === null) { setZoomState(DEFAULT_ZOOM); return; }
      const n = parseFloat(e.newValue);
      if (!isNaN(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) setZoomState(n);
    };
    window.addEventListener('sf-zoom-change', onZoomEvent as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('sf-zoom-change', onZoomEvent as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function handleZoomChange(z: number) {
    setZoomState(z);
    applyZoom(z);                                  // 实时生效
    saveZoom(z === DEFAULT_ZOOM ? null : z);       // 等于默认则清存储；同步后端
  }
  function handleZoomReset() {
    setZoomState(DEFAULT_ZOOM);
    applyZoom(null);
    saveZoom(null);
  }

  const themeOptions: Array<{ id: ThemePref; label: string }> = [
    { id: 'dark',   label: t('appearance.theme.dark') },
    { id: 'light',  label: t('appearance.theme.light') },
    { id: 'paper',  label: t('appearance.theme.paper') },
    { id: 'system', label: t('appearance.theme.system') },
  ];

  const colorSlots: Array<{ slot: CustomSlot; value: string; label: string }> = [
    { slot: 'accent', value: accent, label: t('appearance.slotAccent') },
    { slot: 'bg',     value: bg,     label: t('appearance.slotBg') },
    { slot: 'fg',     value: fg,     label: t('appearance.slotFg') },
  ];

  const selectStyle: React.CSSProperties = {
    fontSize: 12.5,
    padding: '7px 10px',
    minWidth: 150,
    border: '1px solid var(--t-border)',
    borderRadius: 8,
    background: 'var(--t-panel-2, var(--t-panel))',
    color: 'var(--t-fg)',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-fg)', margin: 0 }}>
          {t('appearance.header')}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t-fg-4)' }}>
          {t('appearance.subtitle')}
        </p>
      </div>

      {/* ── 模块:界面设置(主题 + 缩放)────────────────────────────────── */}
      <ModuleCard title={t('appearance.interfaceModule')} desc={t('appearance.interfaceModuleDesc')}>
        <SettingRow
          label={t('appearance.themeLabel')}
          desc={t('appearance.themeDesc')}
          htmlFor="appearance-theme-select"
        >
          <select
            id="appearance-theme-select"
            value={theme}
            onChange={(e) => void setTheme(e.target.value as ThemePref)}
            data-testid="theme-select"
            style={selectStyle}
          >
            {themeOptions.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </SettingRow>

        <div data-testid="appearance-font-size">
          <SettingRow
            label={t('appearance.zoomLabel')}
            desc={t('appearance.zoomDesc')}
            htmlFor="appearance-zoom-slider"
          >
            <span style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>A</span>
            <input
              id="appearance-zoom-slider"
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.05}
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              aria-label={t('appearance.zoomLabel')}
              data-testid="font-size-slider"
              style={{ width: 160, accentColor: ACCENT, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 16, color: 'var(--t-fg-4)' }}>A</span>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--t-fg)',
                minWidth: 44,
                textAlign: 'right',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomReset}
              data-testid="font-size-reset"
              style={{
                fontSize: 12,
                padding: '5px 10px',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                background: 'var(--t-panel-2, var(--t-panel))',
                color: 'var(--t-fg)',
                cursor: 'pointer',
              }}
            >
              {t('appearance.zoomReset')}
            </button>
          </SettingRow>
        </div>
      </ModuleCard>

      {/* ── 模块:颜色定制(3 个 CSS var slot + 重置)────────────────────── */}
      <div data-testid="appearance-custom-colors">
        <ModuleCard title={t('appearance.customModule')} desc={t('appearance.customModuleDesc')}>
          {colorSlots.map(({ slot, value, label }) => (
            <div key={slot} data-testid={`color-row-${slot}`}>
              <SettingRow label={label} htmlFor={`color-input-${slot}`}>
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
                  id={`color-input-${slot}`}
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
              </SettingRow>
            </div>
          ))}
          <div style={{ padding: '8px 18px 4px' }}>
            <button
              type="button"
              onClick={handleColorReset}
              data-testid="custom-colors-reset"
              style={{
                fontSize: 12,
                padding: '6px 12px',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                background: 'var(--t-panel-2, var(--t-panel))',
                color: 'var(--t-fg)',
                cursor: 'pointer',
              }}
            >
              {t('appearance.resetBtn')}
            </button>
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}

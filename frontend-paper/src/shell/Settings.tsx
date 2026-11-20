/**
 * Settings — 设置弹窗。风格切换的唯一入口。
 *
 * 文案见 `content/app.ts` 的 SETTINGS；风格卡片文案见 `theme/ThemeProvider.tsx` 的 THEME_META。
 * 缩略图 `ThemePrev` 的色值故意写死在 settings.css 里 —— 它必须同时呈现三套主题，
 * 不能跟随当前主题。
 */
import { SETTINGS } from '../content/app';
import { THEME_META, THEME_ORDER } from '../content/theme';
import { useTheme, type ThemeName } from '../theme/ThemeProvider';
import { IconCheck } from './icons';

function ThemePrev({ t }: { t: ThemeName }) {
  return (
    <span className="tp" data-t={t}>
      <span className="tp-rail">
        <i />
        <i />
        <i />
      </span>
      <span className="tp-main">
        <i className="tp-line" />
        <i className="tp-line tp-line--short" />
        <i className="tp-bubble" />
        <i className="tp-bubble tp-bubble--sm" />
      </span>
      <span className="tp-panel">
        <i />
        <i />
      </span>
    </span>
  );
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  if (!open) return null;

  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings" role="dialog" aria-modal="true" aria-label={SETTINGS.title} onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <h2>{SETTINGS.title}</h2>
          <button className="settings-x" onClick={onClose} aria-label={SETTINGS.close}>
            ✕
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-sec">
            <div className="settings-sec-head">
              <h3>{SETTINGS.appearanceTitle}</h3>
              <p>{SETTINGS.appearanceNote}</p>
            </div>

            <div className="theme-grid">
              {THEME_ORDER.map((t) => (
                <button
                  key={t}
                  className="theme-card"
                  data-active={theme === t ? 'true' : undefined}
                  onClick={() => setTheme(t)}
                >
                  <ThemePrev t={t} />
                  <span className="theme-card-body">
                    <span className="theme-card-name">
                      {THEME_META[t].label}
                      {theme === t ? (
                        <i className="theme-card-check">
                          <IconCheck size={10} />
                        </i>
                      ) : null}
                    </span>
                    <span className="theme-card-blurb">{THEME_META[t].blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-sec">
            <div className="settings-sec-head">
              <h3>{SETTINGS.modelsTitle}</h3>
              <p>{SETTINGS.modelsNote}</p>
            </div>
            {SETTINGS.models.map((m) => (
              <div key={m.label} className="settings-row">
                <span>{m.label}</span>
                <span className="settings-value">{m.value}</span>
              </div>
            ))}
          </section>

          <section className="settings-sec">
            <div className="settings-sec-head">
              <h3>{SETTINGS.collabTitle}</h3>
              <p>{SETTINGS.collabNote}</p>
            </div>
            {SETTINGS.collab.map((c) => (
              <div key={c.label} className="settings-row">
                <span>{c.label}</span>
                <span className="sf-badge sf-badge--ok">{c.state}</span>
              </div>
            ))}
          </section>
        </div>

        <footer className="settings-foot">
          <span className="settings-hint">{SETTINGS.footHint}</span>
          <button className="sf-btn sf-btn--solid" onClick={onClose}>
            {SETTINGS.done}
          </button>
        </footer>
      </div>
    </div>
  );
}

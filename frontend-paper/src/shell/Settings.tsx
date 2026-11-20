import { useTheme, THEME_META, THEME_ORDER } from '../theme/ThemeProvider';
import { IconCheck } from './icons';

/** 风格预览缩略图：颜色写死，不跟随当前主题，才能同时看到三种观感。 */
function ThemePrev({ t }: { t: string }) {
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
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <h2>设置</h2>
          <button className="settings-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-sec">
            <div className="settings-sec-head">
              <h3>外观风格</h3>
              <p>切换后立即生效，并记住你的选择。</p>
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
              <h3>模型</h3>
              <p>默认模型（每个会话可单独覆盖）。</p>
            </div>
            <div className="settings-row">
              <span>默认对话模型</span>
              <span className="settings-value">Claude Sonnet 4.6</span>
            </div>
            <div className="settings-row">
              <span>写作/润色模型</span>
              <span className="settings-value">Claude Sonnet 4.6</span>
            </div>
          </section>

          <section className="settings-sec">
            <div className="settings-sec-head">
              <h3>协作偏好</h3>
              <p>决定主控怎么派活。</p>
            </div>
            <div className="settings-row">
              <span>群里默认只跟主控对话</span>
              <span className="sf-badge sf-badge--ok">已开启</span>
            </div>
            <div className="settings-row">
              <span>关键节点需人工确认</span>
              <span className="sf-badge sf-badge--ok">已开启</span>
            </div>
          </section>
        </div>

        <footer className="settings-foot">
          <span className="settings-hint">风格偏好保存在本地浏览器</span>
          <button className="sf-btn sf-btn--solid" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}

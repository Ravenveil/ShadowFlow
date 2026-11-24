/** 风格缩略图：三套主题同时呈现，所以色值写死在 styles/settings.css 的 .tp-* 段。 */
import type { ThemeName } from '../theme/ThemeProvider';

export function ThemePreview({ t }: { t: ThemeName }) {
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

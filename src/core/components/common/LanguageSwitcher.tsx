// ============================================================================
// LanguageSwitcher — 全局语言切换按钮（zh / en toggle）
// 使用项目现有的 useI18n hook，切换后整个 I18nProvider 树立即更新。
// ============================================================================

import { useI18n } from '../../../common/i18n';

interface LanguageSwitcherProps {
  /** 额外的 className，用于外层定位 */
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useI18n();

  const toggle = () => setLanguage(language === 'en' ? 'zh' : 'en');

  return (
    <button
      onClick={toggle}
      title={language === 'en' ? '切换到中文' : 'Switch to English'}
      aria-label={language === 'en' ? '切换到中文' : 'Switch to English'}
      className={className}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-elev-2)',
        color: 'var(--fg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.06em',
        cursor: 'pointer',
        transition: 'all .15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(168,85,247,.5)' /* fixme: token */;
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)';
      }}
    >
      {language === 'en' ? '中 / EN' : 'EN / 中'}
    </button>
  );
}

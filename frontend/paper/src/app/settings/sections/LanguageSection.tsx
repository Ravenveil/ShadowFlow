/**
 * 语言：两张可选卡（中文 / English），点了立即生效，不需要刷新。
 *
 * 最小 i18n 的范围只有「全局导航 + 设置页导航与分区标题 + 账号弹窗」，
 * 其余正文文案仍在 content/** 里，后续分批迁入；卡片下方写清覆盖范围。
 */
import { SETTINGS_COPY } from '@/shared/content/settings';
import { useI18n, type Lang } from '@/shared/i18n';
import { Tick } from '@/app/settings/primitives';

const C = SETTINGS_COPY.language;

const LANGS: { value: Lang; label: string }[] = [
  { value: 'zh', label: C.zh },
  { value: 'en', label: C.en },
];

export function LanguageSection() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="st-stack">
      <div className="st-lang-grid" role="radiogroup" aria-label={t('language.title', C.title)}>
        {LANGS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={lang === o.value}
            className="st-lang-card"
            data-active={lang === o.value ? 'true' : undefined}
            onClick={() => setLang(o.value)}
          >
            <span className="st-lang-name">
              {t(`language.${o.value}`, o.label)}
              {lang === o.value ? <Tick /> : null}
            </span>
            {lang === o.value ? (
              <span className="st-lang-cur">{t('language.current', C.current)}</span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="st-hint">{t('language.coverageNote', C.coverageNote)}</p>
    </div>
  );
}

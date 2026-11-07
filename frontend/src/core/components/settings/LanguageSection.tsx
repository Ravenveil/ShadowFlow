/**
 * LanguageSection — Settings: Language (ZCode-style module layout)
 *
 * Flag cards pick the UI language; choice applies instantly via i18next and
 * syncs to backend /api/settings/preferences (best-effort, cross-device).
 */
import { useI18n } from '../../../common/i18n';

const LANGUAGES: Array<{ id: 'en' | 'zh'; flag: string; name: string }> = [
  { id: 'en', flag: '🇺🇸', name: 'English' },
  { id: 'zh', flag: '🇨🇳', name: '中文' },
];

export function LanguageSection() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{t('languagePage.header')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">{t('languagePage.subtitle')}</p>
      </div>

      <section className="rounded-[12px] border border-sf-border bg-sf-elev1">
        <div className="px-[18px] pt-3.5 pb-1.5">
          <h3 className="text-[13.5px] font-bold text-sf-fg1">{t('languagePage.label')}</h3>
          <p className="mt-0.5 text-[11.5px] leading-normal text-sf-fg4">{t('languagePage.desc')}</p>
        </div>
        <div className="flex gap-3 px-[18px] pt-1 pb-4">
          {LANGUAGES.map(({ id, flag, name }) => {
            const selected = language === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLanguage(id)}
                data-testid={`language-card-${id}`}
                className={[
                  'flex flex-1 flex-col items-center gap-2.5 rounded-[12px] border py-5 transition-all',
                  selected
                    ? 'border-sf-accent bg-sf-accent-tint shadow-[0_0_0_1px_var(--t-accent)]'
                    : 'border-sf-border bg-sf-elev2 hover:border-sf-fg5',
                ].join(' ')}
              >
                <span className="text-[28px] leading-none">{flag}</span>
                <span
                  className={[
                    'text-[12px] font-medium',
                    selected ? 'text-sf-fg1' : 'text-sf-fg4',
                  ].join(' ')}
                >
                  {name}
                </span>
                {selected && (
                  <span className="font-mono text-[9px] text-sf-accent-bright">
                    {t('languagePage.active')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

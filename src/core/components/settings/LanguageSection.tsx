import React from 'react';
import { useI18n } from '../../../common/i18n/index';

const LANGUAGES: Array<{ id: 'en' | 'zh'; flag: string; name: string; native: string }> = [
  { id: 'en', flag: '🇺🇸', name: 'English', native: 'English' },
  { id: 'zh', flag: '🇨🇳', name: '中文', native: '中文' },
];

export function LanguageSection() {
  const { language, setLanguage } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{T('语言 / Language', 'Language / 语言')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">{T('选择界面显示语言', 'Choose the display language')}</p>
      </div>

      <div>
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          {T('显示语言', 'Display language')}
        </p>
        <div className="flex gap-3">
          {LANGUAGES.map(({ id, flag, name }) => {
            const selected = language === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLanguage(id)}
                className={[
                  'flex flex-1 flex-col items-center gap-2.5 rounded-[12px] border py-5 transition-all',
                  selected
                    ? 'border-sf-accent bg-sf-accent-tint shadow-[0_0_0_1px_#A855F7]'
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
                    {id === 'zh' ? '✓ 已选' : '✓ Active'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

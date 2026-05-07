import React from 'react';
import { useI18n } from '../../../common/i18n';

export function AboutSection() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const INFO_ROWS: Array<{ label: string; value: string }> = [
    { label: T('版本', 'Version'),    value: '1.0.0' },
    { label: T('运行时', 'Runtime'),  value: 'React 18 + FastAPI' },
    { label: T('协议', 'Protocol'),   value: 'ACP / MCP' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{T('关于', 'About')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">{T('应用信息与版本', 'Application info and version')}</p>
      </div>

      <div className="rounded-[12px] border border-sf-border bg-sf-elev2 p-6 flex flex-col items-center gap-2 text-center">
        <div className="text-[36px] leading-none">🌊</div>
        <h3 className="mt-2 text-[20px] font-bold text-sf-fg1">ShadowFlow</h3>
        <span className="rounded-[6px] bg-sf-elev3 px-2.5 py-1 font-mono text-[11px] text-sf-fg4">
          v1.0.0
        </span>
        <p className="mt-1 text-[12px] text-sf-fg4">
          {T(
            'Agent Team 的 VS Code · ACP 时代的工作流平台',
            'The VS Code for Agent Teams · A workflow platform for the ACP era',
          )}
        </p>
      </div>

      <div className="rounded-[10px] border border-sf-border bg-sf-elev2 overflow-hidden">
        {INFO_ROWS.map(({ label, value }, i) => (
          <div
            key={label}
            className={[
              'flex items-center justify-between px-4 py-3',
              i < INFO_ROWS.length - 1 ? 'border-b border-sf-border' : '',
            ].join(' ')}
          >
            <span className="text-[12px] text-sf-fg4">{label}</span>
            <span className="font-mono text-[12px] text-sf-fg2">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] border border-sf-border bg-sf-elev2 px-4 py-2.5 text-[12px] font-medium text-sf-fg3 hover:border-sf-fg5 hover:text-sf-fg1 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-[14px] w-[14px]">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          GitHub
        </a>
        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-[8px] border border-sf-border bg-sf-elev2 px-4 py-2.5 text-[12px] font-medium text-sf-fg3 hover:border-sf-fg5 hover:text-sf-fg1 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Docs
        </a>
      </div>

      <p className="text-center font-mono text-[10px] text-sf-fg6">
        {T('由 Claude Code 构建 · 由 Anthropic 提供支持', 'Built with Claude Code · Powered by Anthropic')}
      </p>
    </div>
  );
}

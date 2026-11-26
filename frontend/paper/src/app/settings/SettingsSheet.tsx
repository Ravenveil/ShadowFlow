/**
 * SettingsSheet — 两栏设置：左导航（分组）+ 右内容（分区）。
 *
 * 图标一律用 lucide-react（官方图标库），不再手绘 svg —— 线条粗细、圆角、
 * 视觉重量统一，和旧前端观感一致。
 *
 * 分区 id 来自 `content/settings.ts` 的 SETTINGS_NAV，组件通过一个 switch 映射，
 * 所以「加一个分区」= content 加一项 + 这里加一个 case，导航文案不写死在组件里。
 */
import { useEffect, type ReactNode } from 'react';
import { SETTINGS_COPY, SETTINGS_NAV } from '@/shared/content/settings';
import { useI18n } from '@/shared/i18n';
import {
  IconBell,
  IconBrain,
  IconClose,
  IconKey,
  IconLayers,
  IconPalette,
  IconPen,
  IconPlug,
  IconServer,
  IconShield,
  IconSliders,
  IconTerminal,
  IconUser,
} from '@/shared/ui/icons';
import type { AppSettings, CliProbe } from '@/shared/data/types';
import type { SshProbe } from '@/shared/data/source';
import { AppearanceSection } from '@/app/settings/sections/AppearanceSection';
import { CliSection } from '@/app/settings/sections/CliSection';
import { CollabSection } from '@/app/settings/sections/CollabSection';
import { ConnectorsSection } from '@/app/settings/sections/ConnectorsSection';
import { DataSection } from '@/app/settings/sections/DataSection';
import { LanguageSection } from '@/app/settings/sections/LanguageSection';
import { MemorySection } from '@/app/settings/sections/MemorySection';
import { ModelsSection } from '@/app/settings/sections/ModelsSection';
import { NotifySection } from '@/app/settings/sections/NotifySection';
import { ProfileSection } from '@/app/settings/sections/ProfileSection';
import { SkillsSection } from '@/app/settings/sections/SkillsSection';
import { SshSection } from '@/app/settings/sections/SshSection';
import { WritingSection } from '@/app/settings/sections/WritingSection';

export type SettingsSection = (typeof SETTINGS_NAV.groups)[number]['items'][number]['id'];

type IconCmp = (p: { size?: number }) => ReactNode;

const ICONS: Record<SettingsSection, IconCmp> = {
  profile: IconUser,
  appearance: IconPalette,
  language: IconSliders,
  writing: IconPen,
  models: IconKey,
  cli: IconTerminal,
  connectors: IconPlug,
  skills: IconLayers,
  ssh: IconServer,
  memory: IconBrain,
  collab: IconSliders,
  notify: IconBell,
  data: IconShield,
};

/** 右栏抬头：标题与说明按分区取，仍然全部来自 content。 */
const HEAD: Record<SettingsSection, { title: string; note?: string }> = {
  profile: SETTINGS_COPY.profile,
  appearance: SETTINGS_COPY.appearance,
  language: SETTINGS_COPY.language,
  writing: SETTINGS_COPY.writing,
  models: SETTINGS_COPY.models,
  cli: SETTINGS_COPY.cli,
  connectors: SETTINGS_COPY.connectors,
  skills: SETTINGS_COPY.skills,
  ssh: SETTINGS_COPY.ssh,
  memory: SETTINGS_COPY.memory,
  collab: SETTINGS_COPY.collab,
  notify: SETTINGS_COPY.notify,
  data: SETTINGS_COPY.data,
};

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  section: SettingsSection;
  onSection: (next: SettingsSection) => void;
  settings: AppSettings;
  saving: boolean;
  onPatch: (patch: Partial<AppSettings>) => void;
  onRescanCli: () => Promise<CliProbe[]>;
  onTestSsh: (id: string) => Promise<SshProbe>;
  onExport: () => void;
  onReset: () => Promise<void>;
  /** 退出登录成功：关闭设置并回落地页。 */
  onLoggedOut?: () => void;
}

export function SettingsSheet({
  open,
  onClose,
  section,
  onSection,
  settings,
  saving,
  onPatch,
  onRescanCli,
  onTestSsh,
  onExport,
  onReset,
  onLoggedOut,
}: SettingsSheetProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const head = HEAD[section];
  const HeadIcon = ICONS[section];

  return (
    <div className="settings-mask" onClick={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title', SETTINGS_NAV.title)}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="st-nav">
          <div className="st-nav-head">
            <b>{t('settings.title', SETTINGS_NAV.title)}</b>
          </div>

          <nav className="st-nav-body">
            {SETTINGS_NAV.groups.map((g) => (
              <div className="st-nav-group" key={g.group}>
                <span className="st-nav-group-title">{t(`settings.group.${g.id}`, g.group)}</span>
                {g.items.map((item) => {
                  const Icon = ICONS[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="st-nav-item"
                      data-active={section === item.id ? 'true' : undefined}
                      aria-current={section === item.id ? 'page' : undefined}
                      onClick={() => onSection(item.id)}
                    >
                      <Icon size={15} />
                      {t(`settings.nav.${item.id}`, item.label)}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <div className="st-main">
          <header className="st-head">
            <span className="st-head-ico">
              <HeadIcon size={16} />
            </span>
            <div className="st-head-text">
              <h2>{t(`settings.title.${section}`, head.title)}</h2>
              {'note' in head && head.note ? <p>{head.note}</p> : null}
            </div>
            <button
              className="st-x"
              onClick={onClose}
              aria-label={t('settings.close', SETTINGS_NAV.close)}
              title={t('settings.close', SETTINGS_NAV.close)}
            >
              <IconClose size={16} />
            </button>
          </header>

          <div className="st-body">
            {renderSection(section, {
              settings,
              onPatch,
              onRescanCli,
              onTestSsh,
              onExport,
              onReset,
              onLoggedOut,
            })}
          </div>

          <footer className="st-foot">
            {saving ? (
              <span className="st-save" data-busy="true">{t('settings.saving', SETTINGS_NAV.saving)}</span>
            ) : null}
            <button className="sf-btn sf-btn--solid" onClick={onClose}>
              {t('settings.done', SETTINGS_NAV.done)}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function renderSection(
  section: SettingsSection,
  p: {
    settings: AppSettings;
    onPatch: (patch: Partial<AppSettings>) => void;
    onRescanCli: () => Promise<CliProbe[]>;
    onTestSsh: (id: string) => Promise<SshProbe>;
    onExport: () => void;
    onReset: () => Promise<void>;
    onLoggedOut?: () => void;
  },
): ReactNode {
  switch (section) {
    case 'profile':
      return (
        <ProfileSection
          settings={p.settings}
          onPatch={p.onPatch}
          onLoggedOut={p.onLoggedOut}
        />
      );
    case 'appearance':
      return <AppearanceSection />;
    case 'language':
      return <LanguageSection />;
    case 'writing':
      return <WritingSection settings={p.settings} onPatch={p.onPatch} />;
    case 'models':
      return <ModelsSection settings={p.settings} onPatch={p.onPatch} />;
    case 'cli':
      return <CliSection clis={p.settings.clis} onRescan={p.onRescanCli} />;
    case 'connectors':
      return <ConnectorsSection settings={p.settings} onPatch={p.onPatch} />;
    case 'ssh':
      return <SshSection settings={p.settings} onPatch={p.onPatch} onTest={p.onTestSsh} />;
    case 'skills':
      return <SkillsSection />;
    case 'memory':
      return <MemorySection />;
    case 'collab':
      return <CollabSection settings={p.settings} onPatch={p.onPatch} />;
    case 'notify':
      return <NotifySection settings={p.settings} onPatch={p.onPatch} />;
    case 'data':
      return (
        <DataSection
          settings={p.settings}
          onPatch={p.onPatch}
          onExport={p.onExport}
          onReset={p.onReset}
        />
      );
  }
}

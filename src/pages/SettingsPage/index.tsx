/**
 * SettingsPage ‚Ä?Hi-Fi v2 redesign ¬∑ opendesign 1:1 migration
 *
 * Visual blueprint: `_handoff_tmp/shadowflow/project/hf-pages.jsx` ‚Ü?HfSettings
 * (lines 326-419). 2-column layout: 240px left rail of categories grouped by
 * section header (Ë¥¶Êà∑ / Â§ñËßÇ / ÈõÜÊàê / 0G / Êï∞ÊçÆ), right scrollable detail
 * pane that swaps based on the selected category.
 *
 * Tokens used (from `colors_and_type.css` + `hf-shared.jsx` HF_THEME_CSS):
 *   --t-bg / --t-panel / --t-fg / --t-fg-2..5 / --t-border / --t-accent /
 *   --t-accent-tint / --t-accent-ink     ‚Ä?all theme-aware (day + night).
 *
 * Concrete handoff references:
 *   ‚Ä?L339-356  ‚Ä?outer 2-col grid + 240px nav with `borderRight: 1px solid
 *                 var(--t-border)` and `background: var(--t-panel)`.
 *   ‚Ä?L341-344  ‚Ä?title block (`Settings` 16px/800 + `ËÆæÁΩÆ ¬∑ ‚å?,` meta).
 *   ‚Ä?L347      ‚Ä?group label (`hf-label`, padding `4px 12px 5px`).
 *   ‚Ä?L348-353  ‚Ä?nav item: 7px/12px padding, 6px radius, 12.5px font, weight
 *                 700 when active, 500 otherwise. Active = `--t-accent-tint`
 *                 background + 3px purple bar at `left:-8` (16px tall).
 *   ‚Ä?L357      ‚Ä?right pane padding `24px 32px`.
 *
 * Preservation rule (CLAUDE.md "Âè™ËÉΩÂä†Ôºå‰∏çËÉΩÂà?): all 12 existing settings
 * sub-components are kept as-is and routed under the 5 spec groups. We add
 * 4 placeholder entries (billing / shortcuts / on-chain / workspace) where
 * the spec asks for them ‚Ä?those render <ComingSoonSection/>. Default active
 * section is `wallet` to match the spec's centered Wallet content.
 *
 * Active selection persists to `window.location.hash` (e.g. `#wallet`) so
 * deep-linking + browser back/forward work. Falls back to in-memory state
 * if hash is absent.
 *
 * The HfLayout already wraps this route; we render only:
 *   HfTopBar (50px crumbs)  +  240px settings nav  +  scrollable right pane.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import { ToolProvidersTab } from './ToolProvidersTab';
import { LocalCLISection } from '../../core/components/settings/LocalCLISection';
import { ByokSection } from '../../core/components/settings/ByokSection';
import { ConnectorsSection } from '../../core/components/settings/ConnectorsSection';
import { AppearanceSection } from '../../core/components/settings/AppearanceSection';
import { LanguageSection } from '../../core/components/settings/LanguageSection';
import { McpIntegrationsSection } from '../../core/components/settings/McpIntegrationsSection';
import { AboutSection } from '../../core/components/settings/AboutSection';
import { PetSettings } from '../../core/components/pet/PetSettings';
import { NotificationsSection } from '../../core/components/settings/NotificationsSection';
import { AdvancedSection } from '../../core/components/settings/AdvancedSection';
import { MediaProvidersSection } from '../../core/components/settings/MediaProvidersSection';
import { WelcomeSection } from '../../core/components/settings/WelcomeSection';
import { HfTopBar, HfPill } from '../../components/hifi';
import { WalletSection } from './WalletSection';
import { GenerationSettings } from '../../components/GenerationSettings';
import { AcpAgentsPanel } from '../../components/AcpAgentsPanel';
import { MemorySection } from '../../core/components/settings/MemorySection';

// ---------------------------------------------------------------------------
// Section ids ‚Ä?12 existing + 4 placeholders + 1 wallet (= 17)
// ---------------------------------------------------------------------------

type SectionId =
  // Ë¥¶Êà∑
  | 'welcome'      // existing ‚Ä?used as Profile entry
  | 'about'        // existing ‚Ä?used as Account entry
  | 'billing'      // placeholder
  // Â§ñËßÇ
  | 'appearance'
  | 'shortcuts'    // placeholder
  | 'language'
  // ÈõÜÊàê
  | 'skill-studio-generation'  // ÁîüÊàêÂèÇÊï∞ ‚Ä?model / max_tokens / temperature / defaults
  | 'skill-studio-acp'         // ËøúÁ´Ø Agent ‚Ä?ACP/MCP remote agent discovery
  | 'local-cli'
  | 'byok'
  | 'tool-providers'
  | 'connectors'
  | 'mcp-integrations'
  // 0G
  | 'wallet'       // backed by /api/wallet/*
  | 'onchain'      // placeholder
  // ËÆ∞ÂøÜ
  | 'memory-river'
  // Êï∞ÊçÆ
  | 'notifications'
  | 'advanced'
  | 'media-providers'
  | 'pet'
  | 'workspace';   // placeholder

interface NavItem {
  id: SectionId;
  label: string;
  comingSoon?: boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// Static section IDs for hash routing (labels not needed here)
const STATIC_NAV_GROUPS: NavGroup[] = [
  {
    group: 'Account',
    items: [
      { id: 'welcome', label: 'Profile ¬∑ Quick Start' },
      { id: 'about',   label: 'Account ¬∑ About' },
      { id: 'billing', label: 'Billing', comingSoon: true },
    ],
  },
  {
    group: 'Appearance',
    items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'shortcuts',  label: 'Shortcuts', comingSoon: true },
      { id: 'language',   label: 'Language' },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { id: 'agent-backend',           label: 'Models & Providers' },
      { id: 'skill-studio-generation', label: 'Generation Settings' },
      { id: 'skill-studio-acp',        label: 'Remote Agents (ACP/MCP)' },
      { id: 'tool-providers',          label: 'Tool Providers' },
      { id: 'connectors',              label: 'Connectors' },
      { id: 'mcp-integrations',        label: 'MCP Integrations' },
    ],
  },
  {
    group: '0G',
    items: [
      { id: 'wallet',  label: 'Wallet' },
      { id: 'onchain', label: 'On-chain', comingSoon: true },
    ],
  },
  {
    group: 'Memory',
    items: [
      { id: 'memory-river', label: 'River Memory' },
    ],
  },
  {
    group: 'Data',
    items: [
      { id: 'notifications',   label: 'Notifications' },
      { id: 'advanced',        label: 'Privacy & Data ¬∑ Advanced' },
      { id: 'media-providers', label: 'Media Providers' },
      { id: 'pet',             label: 'Pet' },
      { id: 'workspace',       label: 'Workspace', comingSoon: true },
    ],
  },
];

const ALL_IDS = STATIC_NAV_GROUPS.flatMap((g) => g.items.map((it) => it.id));
const ID_SET = new Set<string>(ALL_IDS);

function buildNavGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      group: t('settings.groupAccount'),
      items: [
        { id: 'welcome', label: t('settings.navProfile') },
        { id: 'about',   label: t('settings.navAccount') },
        { id: 'billing', label: t('settings.navBilling'), comingSoon: true },
      ],
    },
    {
      group: t('settings.groupAppearance'),
      items: [
        { id: 'appearance', label: t('settings.navAppearance') },
        { id: 'shortcuts',  label: t('settings.navShortcuts'), comingSoon: true },
        { id: 'language',   label: t('settings.navLanguage') },
      ],
    },
    {
      group: t('settings.groupIntegrations'),
      items: [
        { id: 'agent-backend',           label: t('settings.navModels') },
        { id: 'skill-studio-generation', label: t('settings.navGeneration') },
        { id: 'skill-studio-acp',        label: t('settings.navRemoteAgents') },
        { id: 'tool-providers',          label: t('settings.navToolProviders') },
        { id: 'connectors',              label: t('settings.navConnectors') },
        { id: 'mcp-integrations',        label: t('settings.navMcp') },
      ],
    },
    {
      group: t('settings.group0G'),
      items: [
        { id: 'wallet',  label: t('settings.navWallet') },
        { id: 'onchain', label: t('settings.navOnchain'), comingSoon: true },
      ],
    },
    {
      group: t('settings.groupMemory'),
      items: [
        { id: 'memory-river', label: t('settings.navRiverMemory') },
      ],
    },
    {
      group: t('settings.groupData'),
      items: [
        { id: 'notifications',   label: t('settings.navNotifications') },
        { id: 'advanced',        label: t('settings.navPrivacy') },
        { id: 'media-providers', label: t('settings.navMedia') },
        { id: 'pet',             label: t('settings.navPet') },
        { id: 'workspace',       label: t('settings.navWorkspace'), comingSoon: true },
      ],
    },
  ];
}

const DEFAULT_SECTION: SectionId = 'wallet';

function readHashSection(): SectionId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (raw && ID_SET.has(raw)) return raw as SectionId;
  return null;
}

// ---------------------------------------------------------------------------
// Placeholder
// ---------------------------------------------------------------------------

function ComingSoonSection({ label }: { label: string }) {
  const { t } = useI18n();
  const blurb = t('settings.comingSoonBlurb');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="hf-label" style={{ color: 'var(--t-accent)' }}>
          {label.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginTop: 4,
            letterSpacing: '-.02em',
            color: 'var(--t-fg)',
          }}
        >
          {label}
        </div>
        <p style={{ fontSize: 13, color: 'var(--t-fg-3)', marginTop: 6 }}>
          {blurb}
        </p>
      </div>
      <div
        className="hf-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 16px',
          gap: 8,
        }}
      >
        <Construction size={32} strokeWidth={1.25} color="var(--t-fg-4)" />
        <HfPill>‚ó?coming soon</HfPill>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper ‚Ä?keeps existing Tailwind / `sf-*` token components
// embedded inside the new Hi-Fi v2 pane while the redesign rolls out across
// sub-sections incrementally.
// ---------------------------------------------------------------------------

function LegacySectionWrap({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 760 }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Nav button ‚Ä?hover state + active 3px purple bar (handoff hf-pages.jsx L350)
// ---------------------------------------------------------------------------

interface NavButtonProps {
  item: NavItem;
  active: boolean;
  onSelect: (id: SectionId) => void;
}

function NavButton({ item, active, onSelect }: NavButtonProps) {
  const [hover, setHover] = useState(false);

  // Background + label color logic mirrors hf-pages.jsx L349:
  // active  ‚Ü?tint background, accent-tinted label
  // hover   ‚Ü?subtle elevation (panel-2)
  // default ‚Ü?transparent / fg-2 label
  const bg = active
    ? 'var(--t-accent-tint)'
    : hover
      ? 'var(--t-panel-2)'
      : 'transparent';
  const labelColor = active ? 'var(--t-accent)' : 'var(--t-fg-2)';

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',     // L349 padding
        borderRadius: 6,         // L349 borderRadius
        marginBottom: 1,
        fontSize: 12.5,          // L349 fontSize
        fontWeight: active ? 700 : 500,  // L349 fontWeight
        color: labelColor,
        background: bg,
        cursor: 'pointer',
        border: 'none',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background 120ms ease-out, color 120ms ease-out',
      }}
    >
      {/* 3px purple active bar ‚Ä?handoff L350 (left:-8, w:3, h:16) */}
      {active && (
        <span
          style={{
            position: 'absolute',
            left: -8,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 16,
            background: 'var(--t-accent)',
            borderRadius: 2,
          }}
        />
      )}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.comingSoon && (
        <span
          className="hf-mono"
          style={{
            fontSize: 8.5,
            fontWeight: 600,
            color: 'var(--t-fg-5)',
            letterSpacing: '.08em',
            padding: '1px 5px',
            border: '1px solid var(--t-border)',
            borderRadius: 3,
            background: 'var(--t-bg)',
            flexShrink: 0,
          }}
        >
          SOON
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { t } = useI18n();
  const NAV_GROUPS = useMemo(() => buildNavGroups(t), [t]);

  const SECTION_LABEL = useMemo<Record<SectionId, string>>(
    () =>
      NAV_GROUPS.flatMap((g) => g.items).reduce<Record<SectionId, string>>(
        (acc, item) => {
          acc[item.id] = item.label;
          return acc;
        },
        {} as Record<SectionId, string>,
      ),
    [NAV_GROUPS],
  );

  // Default = Wallet (matches the centered Wallet content in hf-pages.jsx L338).
  // Persists via window.location.hash so refresh + deep links work.
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    return readHashSection() ?? DEFAULT_SECTION;
  });

  // Sync hash ‚Ü?state when user uses browser back/forward.
  useEffect(() => {
    function onHash() {
      const next = readHashSection();
      if (next && next !== activeSection) setActiveSection(next);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [activeSection]);

  // Sync state ‚Ü?hash (only when changed by user; avoids writing on initial
  // load if the hash already matches).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = window.location.hash.replace(/^#\/?/, '').trim();
    if (current !== activeSection) {
      // Use replaceState so it doesn't clutter history with every click.
      const newUrl = `${window.location.pathname}${window.location.search}#${activeSection}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [activeSection]);

  return (
    <>
      <HfTopBar />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '240px 1fr',  // L339 ‚Ä?240px nav + 1fr detail
          minHeight: 0,
        }}
      >
        {/* ‚îÄ‚îÄ 240px settings nav ‚îÄ‚îÄ (hf-pages.jsx L340) */}
        <aside
          style={{
            borderRight: '1px solid var(--t-border)',  // L340
            padding: '14px 8px',                       // L340
            overflow: 'auto',
            background: 'var(--t-panel)',              // L340
          }}
        >
          {/* Title block ‚Ä?handoff L341-344 */}
          <div style={{ padding: '4px 12px 12px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-fg)' }}>
              {t('settings.title')}
            </div>
            <div className="hf-meta">{t('settings.titleMeta')}</div>
          </div>

          {NAV_GROUPS.map((g) => (
            <div key={g.group} style={{ marginBottom: 10 }}>
              {/* Group label ‚Ä?handoff L347 */}
              <div className="hf-label" style={{ padding: '4px 12px 5px' }}>
                {g.group}
              </div>
              {g.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={activeSection === item.id}
                  onSelect={setActiveSection}
                />
              ))}
            </div>
          ))}
        </aside>

        {/* ‚îÄ‚îÄ Right content ‚îÄ‚îÄ (hf-pages.jsx L357 padding 24px 32px) */}
        <div
          style={{
            padding: '24px 32px',
            overflow: 'auto',
            background: 'var(--t-bg)',
          }}
        >
          {/* Ë¥¶Êà∑ */}
          {activeSection === 'welcome'   && <LegacySectionWrap><WelcomeSection /></LegacySectionWrap>}
          {activeSection === 'about'     && <LegacySectionWrap><AboutSection /></LegacySectionWrap>}
          {activeSection === 'billing'   && <ComingSoonSection label={SECTION_LABEL.billing} />}

          {/* Â§ñËßÇ */}
          {activeSection === 'appearance' && <LegacySectionWrap><AppearanceSection /></LegacySectionWrap>}
          {activeSection === 'shortcuts'  && <ComingSoonSection label={SECTION_LABEL.shortcuts} />}
          {activeSection === 'language'   && <LegacySectionWrap><LanguageSection /></LegacySectionWrap>}

          {/* ÈõÜÊàê */}
          {activeSection === 'agent-backend' && (
            <LegacySectionWrap>
              <AgentBackendSection />
            </LegacySectionWrap>
          )}
          {activeSection === 'skill-studio-generation' && (
            <LegacySectionWrap>
              <GenerationSettings />
            </LegacySectionWrap>
          )}
          {activeSection === 'skill-studio-acp' && (
            <LegacySectionWrap>
              <AcpAgentsPanel />
            </LegacySectionWrap>
          )}
          {activeSection === 'tool-providers'    && <LegacySectionWrap><ToolProvidersTab /></LegacySectionWrap>}
          {activeSection === 'connectors'        && <LegacySectionWrap><ConnectorsSection /></LegacySectionWrap>}
          {activeSection === 'mcp-integrations'  && <LegacySectionWrap><McpIntegrationsSection /></LegacySectionWrap>}

          {/* 0G */}
          {activeSection === 'wallet'  && <WalletSection />}
          {activeSection === 'onchain' && <ComingSoonSection label={SECTION_LABEL.onchain} />}

          {/* ËÆ∞ÂøÜ */}
          {activeSection === 'memory-river' && <LegacySectionWrap><MemorySection /></LegacySectionWrap>}

          {/* Êï∞ÊçÆ */}
          {activeSection === 'notifications'    && <LegacySectionWrap><NotificationsSection /></LegacySectionWrap>}
          {activeSection === 'advanced'         && <LegacySectionWrap><AdvancedSection /></LegacySectionWrap>}
          {activeSection === 'media-providers'  && <LegacySectionWrap><MediaProvidersSection /></LegacySectionWrap>}
          {activeSection === 'pet'              && <LegacySectionWrap><PetSettings /></LegacySectionWrap>}
          {activeSection === 'workspace'        && <ComingSoonSection label={SECTION_LABEL.workspace} />}
        </div>
      </div>
    </>
  );
}

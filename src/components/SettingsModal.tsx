/**
 * SettingsModal — full-size 2-column settings modal triggered by the composer
 * gear icon. Matches the platform.zip `run-session.html` design spec.
 *
 * Layout: 900 × min(88vh,720px) — 240px nav rail + scrollable content area.
 * Uses `position: fixed` backdrop so it covers the full viewport regardless of
 * where it is mounted in the tree.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiKeySettings } from './ApiKeySettings';
import { GenerationSettings } from './GenerationSettings';
import { AcpAgentsPanel } from './AcpAgentsPanel';
import { WelcomeSection } from '../core/components/settings/WelcomeSection';
import { AboutSection } from '../core/components/settings/AboutSection';
import { AppearanceSection } from '../core/components/settings/AppearanceSection';
import { ConnectorsSection } from '../core/components/settings/ConnectorsSection';
import { McpIntegrationsSection } from '../core/components/settings/McpIntegrationsSection';
import { LocalCLISection } from '../core/components/settings/LocalCLISection';
import { ByokSection } from '../core/components/settings/ByokSection';
import { ZerogStorageSection } from '../core/components/settings/ZerogStorageSection';
import { MemorySection } from '../core/components/settings/MemorySection';

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId =
  | 'welcome'
  | 'about'
  | 'billing'
  | 'appearance'
  | 'apikeys'
  | 'generation'
  | 'remoteagents'
  | 'localcli'
  | 'byok'
  | 'toolproviders'
  | 'connectors'
  | 'mcp'
  | 'zerog'
  | 'onchain'
  | 'memory';

interface NavItem { id: TabId; label: string; soon?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: '账户',
    items: [
      { id: 'welcome', label: '个人资料 · 快速上手' },
      { id: 'about',   label: '账户 · 关于' },
      { id: 'billing', label: '账单', soon: true },
    ],
  },
  {
    label: '外观',
    items: [
      { id: 'appearance', label: '外观' },
    ],
  },
  {
    label: '集成',
    items: [
      { id: 'localcli',     label: '本机 CLI' },
      { id: 'byok',         label: 'BYOK · API Key' },
      { id: 'apikeys',      label: 'Skill Studio API Key' },
      { id: 'generation',   label: '生成参数' },
      { id: 'remoteagents', label: '远端 Agent' },
      { id: 'toolproviders',label: '工具提供商', soon: true },
      { id: 'connectors',   label: '连接器' },
      { id: 'mcp',          label: 'MCP 集成' },
    ],
  },
  {
    label: '0G',
    items: [
      { id: 'zerog',   label: '钱包 · 0G Storage' },
      { id: 'onchain', label: '链上', soon: true },
    ],
  },
  {
    label: '记忆',
    items: [
      { id: 'memory', label: '河流记忆' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  initialTab?: TabId;
}

// ── Tab content ───────────────────────────────────────────────────────────────

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'welcome':      return <WelcomeSection />;
    case 'about':        return <AboutSection />;
    case 'billing':      return <ComingSoon label="账单" />;
    case 'appearance':   return <AppearanceSection />;
    case 'localcli':     return <LocalCLISection />;
    case 'byok':         return <ByokSection />;
    case 'apikeys':      return <ApiKeySettings />;
    case 'generation':   return <GenerationSettings />;
    case 'remoteagents': return <AcpAgentsPanel />;
    case 'toolproviders':return <ComingSoon label="工具提供商" />;
    case 'connectors':   return <ConnectorsSection />;
    case 'mcp':          return <McpIntegrationsSection />;
    case 'zerog':        return <ZerogStorageSection />;
    case 'onchain':      return <ComingSoon label="链上" />;
    case 'memory':       return <MemorySection />;
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--t-fg-4)',
        fontSize: 13,
        border: '1px dashed var(--t-border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--t-fg-3)' }}>
        {label}
      </div>
      <div>Coming soon</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsModal({ onClose, initialTab = 'apikeys' }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="rs-settings-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rs-settings-panel" role="dialog" aria-label="Settings">

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--t-fg)' }}>
            Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--t-border)',
              borderRadius: 7, cursor: 'pointer', color: 'var(--t-fg-4)', padding: 0,
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* 2-column body */}
        <div className="rs-modal-body">

          {/* Nav rail */}
          <nav className="rs-modal-nav" aria-label="Settings navigation">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="rs-nav-group">
                <span className="rs-nav-group-label">{group.label}</span>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rs-nav-item${activeTab === item.id ? ' on' : ''}`}
                    onClick={() => { if (!item.soon) setActiveTab(item.id); }}
                    disabled={item.soon}
                  >
                    {item.label}
                    {item.soon && <span className="rs-nav-badge">SOON</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content pane */}
          <div className="rs-modal-content">
            <TabContent tab={activeTab} />
          </div>
        </div>
      </div>
    </div>
  );
}

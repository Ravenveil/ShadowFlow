/**
 * WorkspacePage — FB-HiFi shell
 *
 * Full-height workspace with day/night toggle + 4 top tabs:
 * Agents · Teams · Chat · Templates
 *
 * Route: /workspace
 * Does NOT use AppLayout — it manages its own chrome (FBChrome)
 */

import { useState } from 'react';
import { Key, Stethoscope } from '../common/icons/iconRegistry';
import { FBChrome, type FBTabKey } from '../components/workspace/FBAtoms';
import { TabAgents } from '../components/workspace/TabAgents';
import { TabTeams } from '../components/workspace/TabTeams';
import { TabChat } from '../components/workspace/TabChat';
import { TabTemplates } from '../components/workspace/TabTemplates';
import { BackendDiagPanel } from '../components/workspace/BackendDiagPanel';
import { SecretsModal } from '../components/workspace/SecretsModal';
import '../components/workspace/fb-hifi.css';

export default function WorkspacePage() {
  const [tab, setTab] = useState<FBTabKey>('agents');
  const [theme, setTheme] = useState<'day' | 'night'>('night');
  const [diagOpen, setDiagOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);

  return (
    <div className={`fb-shell ${theme === 'day' ? 'fb-theme-day' : ''}`}>
      <FBChrome
        active={tab}
        theme={theme}
        onTabChange={setTab}
        onThemeToggle={() => setTheme(t => t === 'day' ? 'night' : 'day')}
        onNotification={() => setTab('chat')}
        onRun={() => setTab('chat')}
      />

      {/* API Keys 按钮 */}
      <button
        data-testid="open-secrets"
        onClick={() => setSecretsOpen(true)}
        style={{
          position: 'fixed', top: 14, right: 330, zIndex: 50,
          padding: '4px 10px', borderRadius: 6,
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
          color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Key size={12} strokeWidth={2} /> API Keys
      </button>

      {/* 临时连通诊断按钮（30 分钟测试，验证完后会替换为 SecretsModal 入口） */}
      <button
        data-testid="open-backend-diag"
        onClick={() => setDiagOpen(true)}
        style={{
          position: 'fixed', top: 14, right: 220, zIndex: 50,
          padding: '4px 10px', borderRadius: 6,
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
          color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Stethoscope size={12} strokeWidth={2} /> 测后端
      </button>
      {diagOpen && <BackendDiagPanel onClose={() => setDiagOpen(false)} />}
      {secretsOpen && <SecretsModal onClose={() => setSecretsOpen(false)} />}

      {/* ── Tab content pane ─────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
        background: 'var(--bg)',
      }}>
        {tab === 'agents'    && <TabAgents onNavigateToChat={() => setTab('chat')} onNavigateToTeams={() => setTab('teams')} />}
        {tab === 'teams'     && <TabTeams onNavigateToChat={() => setTab('chat')} />}
        {tab === 'chat'      && <TabChat />}
        {tab === 'templates' && <TabTemplates onNavigateToTeams={() => setTab('teams')} />}
      </div>
    </div>
  );
}

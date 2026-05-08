/**
 * RailBotPanel — Agents 管理面板（Rail "bot" tab）
 * 接 GET /api/agents · 真实 agent 列表 + pause/resume API
 */

import { useState, useEffect } from 'react';
import { FBAv } from '../FBAtoms';
import { CI } from './icons';
import { listAgents, pauseAgent, resumeAgent, type AgentRecord } from '../../../api/agents';

interface AgentStatus {
  id: string;
  glyph: string;
  name: string;
  role: string;
  color: string;
  status: 'run' | 'ok' | 'idle' | 'warn';
  model: string;
  lastAction: string;
  tokens: string;
}

// Theme-aware palette for hashed agent avatar colors. All tokens map to var(--t-*).
// 紫/青重复使用 --t-accent 与 --t-gated 是有意的，避免引入新的 CSS 变量。
const COLOR_PALETTE = [
  'var(--t-accent)',                          // 紫 (was #A855F7)
  'var(--t-warn)',                            // 黄 (was #F59E0B)
  'var(--t-gated, var(--t-accent))',          // 青 (was #22D3EE)
  'var(--t-err)',                             // 红 (was #EF4444)
  'var(--t-ok)',                              // 绿 (was #10B981)
  'var(--t-accent-bright)',                   // 蓝/亮紫 (was #3B82F6)
  'var(--t-accent)',                          // 紫 (was #8B5CF6)
  'var(--t-accent-bright)',                   // 粉/亮 (was #EC4899)
];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

function recordToStatus(r: AgentRecord): AgentStatus {
  const beStatus = r.status as string;
  const status: AgentStatus['status'] =
    beStatus === 'running' ? 'run' :
    beStatus === 'error' ? 'warn' :
    beStatus === 'paused' ? 'idle' :
    'ok';
  return {
    id: r.agent_id,
    glyph: (r.name || '?').slice(0, 1),
    name: r.name || r.agent_id,
    role: (r.source === 'catalog' ? 'CATALOG' : 'AGENT'),
    color: hashColor(r.agent_id),
    status,
    model: (r.blueprint?.model as string) || 'default',
    lastAction: r.soul?.slice(0, 36) || '—',
    tokens: '—',
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  run:  { label: '运行中', color: 'var(--status-run)' },
  ok:   { label: '就绪', color: 'var(--status-ok)' },
  idle: { label: '待命', color: 'var(--t-fg-4)' },
  warn: { label: '异常', color: 'var(--status-warn)' },
};

function AgentRow({ agent, onDM, onPause }: { agent: AgentStatus; onDM: (a: AgentStatus) => void; onPause: (a: AgentStatus) => void }) {
  const st = STATUS_LABELS[agent.status];
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8, background: 'var(--t-panel)',
      border: '1px solid var(--t-border)', display: 'flex', gap: 10, alignItems: 'flex-start',
      cursor: 'pointer', transition: 'border-color 120ms',
    }} onMouseEnter={e => (e.currentTarget.style.borderColor = agent.color)}
       onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}>
      <FBAv glyph={agent.glyph} color={agent.color} size={34} square status={agent.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 800,
            color: agent.color, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.05em',
            background: `color-mix(in oklab, ${agent.color} 15%, transparent)`,
          }}>{agent.role}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            color: st.color, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {agent.status === 'run' && <span style={{
              width: 6, height: 6, borderRadius: '50%', background: st.color,
              animation: 'fb-pulse 1.4s ease-in-out infinite',
            }} />}
            {st.label}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-3)', marginTop: 3 }}>
          {agent.lastAction}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)' }}>
            {agent.model}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>
            · {agent.tokens} tokens
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => onDM(agent)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 4,
            border: '1px solid var(--t-border)', background: 'var(--t-panel-2)',
            color: 'var(--t-fg-3)', cursor: 'pointer',
          }}>DM</button>
          {agent.status === 'run' && <button onClick={() => onPause(agent)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 4,
            border: '1px solid color-mix(in oklab, var(--status-warn) 40%, transparent)',
            background: 'color-mix(in oklab, var(--status-warn) 8%, transparent)',
            color: 'var(--status-warn)', cursor: 'pointer',
          }}>暂停</button>}
        </div>
      </div>
    </div>
  );
}

export function RailBotPanel() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const running = agents.filter(a => a.status === 'run').length;

  useEffect(() => {
    let alive = true;
    listAgents()
      .then(data => {
        if (!alive) return;
        setAgents(data.map(recordToStatus));
        setLoadState('ok');
      })
      .catch(e => {
        if (!alive) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setLoadState('error');
      });
    return () => { alive = false; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleDM = (a: AgentStatus) => {
    showToast(`已为 ${a.name} 打开 DM 通道（chat-edit endpoint）`);
  };

  const handlePause = async (a: AgentStatus) => {
    const wasRunning = a.status === 'run';
    setAgents(prev => prev.map(x => x.id === a.id
      ? { ...x, status: wasRunning ? 'idle' : 'run', lastAction: wasRunning ? '已暂停' : '已恢复' }
      : x));
    try {
      if (wasRunning) await pauseAgent(a.id);
      else await resumeAgent(a.id);
      showToast(wasRunning ? `${a.name} 已暂停` : `${a.name} 已恢复`);
    } catch (e) {
      // Revert on failure
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, status: a.status, lastAction: a.lastAction } : x));
      showToast(`操作失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', minHeight: 0, position: 'relative' }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--skin-panel)', flexShrink: 0,
      }}>
        <span style={{ width: 18, height: 18, display: 'flex', color: 'var(--t-accent-bright)' }}>{CI.bot}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Agents</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
          {loadState === 'ok' ? `${agents.length} 人 · ${running} 运行中` : (loadState === 'loading' ? '加载中…' : '加载失败')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)',
          padding: '3px 8px', borderRadius: 4, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
        }}>
          GET /api/agents
        </span>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loadState === 'loading' && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)', textAlign: 'center', padding: 20 }}>加载 agents…</div>}
        {loadState === 'error' && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-reject)', padding: 14 }}>✗ {errorMsg}</div>}
        {loadState === 'ok' && agents.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)', textAlign: 'center', padding: 20 }}>
            暂无 agent — 在 Agents tab 创建第一个
          </div>
        )}
        {agents.map(agent => (
          <AgentRow key={agent.id} agent={agent} onDM={handleDM} onPause={handlePause} />
        ))}
      </div>

      {toast && (
        <div style={{
          position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 14px', borderRadius: 8, background: 'var(--t-accent)', color: 'white',
          fontSize: 11.5, fontWeight: 600, boxShadow: 'var(--shadow-pop)', zIndex: 20,
        }}>{toast}</div>
      )}
    </div>
  );
}

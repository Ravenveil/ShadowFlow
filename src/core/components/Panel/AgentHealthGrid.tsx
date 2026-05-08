/**
 * AgentHealthGrid — Story 4.7.
 * Minimal 2×3 grid of agent cards with status dot + sparkline.
 */
import { AgentHealth } from '../../stores/useOpsStore';

const STATUS_COLOR: Record<AgentHealth['status'], string> = {
  online:   'var(--t-ok)',
  degraded: 'var(--t-warn)',
  offline:  'var(--t-err)',
};

const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function sparkline(trend: number[]): string {
  if (!trend.length) return '';
  const max = Math.max(...trend, 1);
  return trend.map((v) => SPARK_BLOCKS[Math.min(SPARK_BLOCKS.length - 1, Math.floor((v / max) * (SPARK_BLOCKS.length - 1)))]).join('');
}

function AgentCard({ agent }: { agent: AgentHealth }): JSX.Element {
  const color = STATUS_COLOR[agent.status];
  return (
    <div
      data-testid={`agent-card-${agent.agent_id}`}
      data-status={agent.status}
      style={{
        width: 210,
        height: 110,
        padding: 10,
        borderRadius: 10,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</span>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t-fg-4)', textTransform: 'uppercase' }}>
        {agent.kind.toUpperCase()} · {agent.model || '—'}
      </div>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: agent.status === 'offline' ? color : 'var(--t-fg-3)' }}>
        queue {agent.queue_depth} &nbsp;·&nbsp; p95 {Math.round(agent.p95_ms)}ms
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--t-fg-3)' }}>
        {sparkline(agent.trend_14pt ?? [])}
      </div>
    </div>
  );
}

export function AgentHealthGrid({ agents }: { agents: AgentHealth[] }): JSX.Element {
  const online = agents.filter((a) => a.status === 'online').length;
  const degraded = agents.filter((a) => a.status === 'degraded').length;
  const offline = agents.filter((a) => a.status === 'offline').length;

  const shown = agents.slice(0, 6);
  return (
    <div data-testid="agent-health-grid" style={{ width: 700, padding: 12, background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)' }}>Agent Health</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t-fg-4)' }}>
          {agents.length} registered · {online} online · {degraded} degraded · {offline} offline
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {shown.map((a) => <AgentCard key={a.agent_id} agent={a} />)}
      </div>
      {agents.length > 6 && (
        <div style={{ fontSize: 11, marginTop: 8, color: 'var(--t-accent)' }}>
          View all {agents.length} agents →
        </div>
      )}
    </div>
  );
}

export default AgentHealthGrid;

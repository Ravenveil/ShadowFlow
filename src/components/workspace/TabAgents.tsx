/**
 * FB-HiFi · Agents tab — 接 listAgents() / quickCreateAgent() 真后端
 *
 * Milestone 1 完成：硬编码 AGENTS_DATA 已删除，列表从 GET /api/agents 拉。
 * 「+ 新建 Agent」走 POST /api/agents。
 */

import { useEffect, useState } from 'react';
import { Armchair } from '../../common/icons/iconRegistry';
import { FBAv, FBPill, FBIcons } from './FBAtoms';
import {
  listAgents,
  quickCreateAgent,
  deleteAgent,
  AgentApiError,
  type AgentRecord,
} from '../../api/agents';
import { AgentEditChat } from './AgentEditChat';

type AgentStatus = 'run' | 'ok' | 'warn' | 'idle' | 'wait';

const DOT_CLASS: Record<AgentStatus, string> = {
  run: 'fb-dot-run', ok: 'fb-dot-ok', warn: 'fb-dot-warn', idle: 'fb-dot-idle', wait: 'fb-dot-idle',
};

/* ── 后端 AgentRecord → UI 显示模型 mapper ──────────────────────────── */
const COLOR_PALETTE = ['var(--t-accent)', '#F59E0B', '#22D3EE', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

interface DisplayAgent {
  agent_id: string;
  g: string;
  name: string;
  role: string;
  model: string;
  color: string;
  soul: string;
  desc: string;
  skills: string[];
  tools: { n: string; ok: boolean }[];
  status: AgentStatus;
  level: string;
  unread: number;
  last: string;
  cost: string;
  tokens: string;
  history: { t: string; m: string }[];
  teams: { n: string; role: string; live: boolean }[];
}

function mapBackendToDisplay(r: AgentRecord): DisplayAgent {
  const bp = (r.blueprint ?? {}) as Record<string, unknown>;
  const cap = (bp.capabilities ?? {}) as Record<string, unknown>;
  const ident = (bp.identity ?? {}) as Record<string, unknown>;
  const tools = Array.isArray(cap.tools) ? (cap.tools as string[]) : [];
  const skills = Array.isArray(cap.skills) ? (cap.skills as string[]) : [];
  const role = typeof ident.role === 'string' ? ident.role : 'Agent';
  const model = typeof cap.model === 'string' ? cap.model : 'default';

  const status: AgentStatus =
    r.status === 'running' ? 'run' :
    r.status === 'error'   ? 'warn' : 'idle';

  return {
    agent_id: r.agent_id,
    g: r.name.charAt(0),
    name: r.name,
    role,
    model,
    color: hashColor(r.name),
    soul: r.soul,
    desc: r.soul.length > 110 ? r.soul.slice(0, 110) + '…' : r.soul,
    skills,
    tools: tools.map(n => ({ n, ok: true })),
    status,
    level: 'L1 · auto', // 等后端 schema 扩展后再读真值
    unread: 0,
    last: 'idle',
    cost: '—',
    tokens: '—',
    history: [],
    teams: [],
  };
}

/* ── Quick Hire Modal ───────────────────────────────────────────────── */
function QuickHireModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: AgentRecord) => void }) {
  const [name, setName] = useState('');
  const [soul, setSoul] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && soul.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const record = await quickCreateAgent({ name: name.trim(), soul: soul.trim() });
      onCreated(record);
    } catch (e) {
      const msg = e instanceof AgentApiError
        ? `${e.code} (HTTP ${e.status})`
        : e instanceof Error ? e.message : String(e);
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="quick-hire-modal" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: 'var(--skin-panel)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: 'var(--shadow-pop)', padding: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>+ 新建 Agent</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>Quick Hire · Story 12.1</span>
          <span style={{ flex: 1 }} />
          <button className="fb-btn fb-btn-icon" onClick={onClose}>×</button>
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-2)', marginBottom: 5 }}>名字</div>
          <input
            data-testid="qh-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：论文复现助手"
            disabled={submitting}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--fg-1)', fontSize: 13,
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg-2)', marginBottom: 5 }}>角色描述（Soul）</div>
          <textarea
            data-testid="qh-soul"
            value={soul}
            onChange={e => setSoul(e.target.value)}
            placeholder="描述这个 Agent 的职责和行事风格，例：你是一名严谨的科研助理，擅长复现 arXiv 论文中的实验..."
            disabled={submitting}
            rows={5}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--fg-1)', fontSize: 12.5, lineHeight: 1.55,
              fontFamily: 'var(--font-sans)', outline: 'none', resize: 'vertical',
            }}
          />
        </label>

        {error && (
          <div data-testid="qh-error" style={{
            padding: '8px 10px', borderRadius: 6, marginBottom: 12,
            background: 'var(--status-reject-tint)', border: '1px solid color-mix(in oklab, var(--status-reject) 35%, transparent)',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-reject)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-5)' }}>
            高级（工具权限 / 层级）后端会填默认值
          </span>
          <span style={{ flex: 1 }} />
          <button className="fb-btn fb-btn-ghost fb-btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button
            data-testid="qh-submit"
            className="fb-btn fb-btn-primary fb-btn-sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.4 }}
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 主组件 ─────────────────────────────────────────────────────────── */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; agents: DisplayAgent[]; raw: AgentRecord[] }
  | { kind: 'error'; msg: string };

interface TabAgentsProps {
  onNavigateToChat?: () => void;
  onNavigateToTeams?: () => void;
}

export function TabAgents({ onNavigateToChat, onNavigateToTeams }: TabAgentsProps = {}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [hireOpen, setHireOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    setState({ kind: 'loading' });
    try {
      const raw = await listAgents();
      const agents = raw.map(mapBackendToDisplay);
      setState({ kind: 'ok', agents, raw });
      setSelectedIdx(0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ kind: 'error', msg });
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreated = async (record: AgentRecord) => {
    setHireOpen(false);
    await refresh();
    if (state.kind === 'ok') {
      const idx = state.agents.findIndex(a => a.agent_id === record.agent_id);
      if (idx >= 0) setSelectedIdx(idx);
    }
  };

  const handleDelete = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确认删除此 Agent？')) return;
    setDeletingId(agentId);
    try {
      await deleteAgent(agentId);
      if (state.kind === 'ok') {
        const newAgents = state.agents.filter(a => a.agent_id !== agentId);
        const newRaw = state.raw.filter(r => r.agent_id !== agentId);
        setState({ kind: 'ok', agents: newAgents, raw: newRaw });
        setSelectedIdx(prev => Math.min(prev, Math.max(0, newAgents.length - 1)));
      }
    } catch (err) {
      const msg = err instanceof AgentApiError ? `${err.code} (HTTP ${err.status})` : err instanceof Error ? err.message : String(err);
      alert(`删除失败：${msg}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        加载 Agents 中…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--status-reject)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <div data-testid="agents-error">加载失败：{state.msg}</div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>检查 Python 后端 (uvicorn shadowflow.server:app) 是否在 :8000</div>
        <button className="fb-btn fb-btn-ghost fb-btn-sm" onClick={refresh}>重试</button>
      </div>
    );
  }

  const agents = state.agents;
  const filtered = agents.filter(a =>
    a.name.includes(search) || a.role.toLowerCase().includes(search.toLowerCase()) || a.model.includes(search)
  );
  const cur: DisplayAgent | undefined = agents[selectedIdx];

  return (
    <>
      {hireOpen && <QuickHireModal onClose={() => setHireOpen(false)} onCreated={handleCreated} />}

      {/* ── Left: agent list ───────────────────────────────────── */}
      <div style={{
        width: 300, borderRight: '1px solid var(--border)',
        background: 'var(--bg-elev-1)', display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fb-label">Agents</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>· {agents.length}</span>
          <button data-testid="open-hire" className="fb-btn fb-btn-icon" onClick={() => setHireOpen(true)} style={{ marginLeft: 'auto', width: 24, height: 24 }} title="新建 Agent">
            <span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.plus}</span>
          </button>
        </div>

        <div style={{ padding: '0 14px 8px' }}>
          <div className={`fb-input ${search ? 'focused' : ''}`}>
            <span className="x-icon" style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.search}</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="按角色 / 模型筛选"
              style={{ background: 'transparent', border: 0, outline: 0, color: 'var(--fg-1)', fontSize: 12, flex: 1, fontFamily: 'var(--font-sans)' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '2px 8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((a) => {
            const realIdx = agents.indexOf(a);
            return (
              <div key={a.agent_id} onClick={() => setSelectedIdx(realIdx)} className={`fb-row ${realIdx === selectedIdx ? 'active' : ''}`} style={{
                borderLeft: realIdx === selectedIdx ? '2px solid var(--accent)' : '2px solid transparent',
                paddingLeft: 10,
              }}>
                <FBAv glyph={a.g} color={a.color} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: realIdx === selectedIdx ? 700 : 600, color: 'var(--fg-1)' }}>{a.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>· {a.role}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                    {a.model}
                  </div>
                </div>
                <button
                  title="删除 Agent"
                  disabled={deletingId === a.agent_id}
                  onClick={e => handleDelete(a.agent_id, e)}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--status-reject)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, opacity: deletingId === a.agent_id ? 0.4 : 0,
                    transition: 'opacity 120ms',
                    flexShrink: 0,
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--status-reject-tint)'; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >×</button>
                <span className={`fb-dot ${DOT_CLASS[a.status]}`} />
              </div>
            );
          })}
          {filtered.length === 0 && agents.length > 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              没有匹配的 Agent
            </div>
          )}
          {agents.length === 0 && (
            <div data-testid="agents-empty" style={{
              margin: '20px 4px', padding: '16px 12px', textAlign: 'center',
              border: '1px dashed var(--border)', borderRadius: 8,
              color: 'var(--fg-4)', fontSize: 12, lineHeight: 1.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: 'var(--fg-3)' }}>
                <Armchair size={20} strokeWidth={2} />
              </div>
              还没有 Agent。<br />
              点右上 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>+</span> 招一个。
            </div>
          )}
          <div
            onClick={() => setHireOpen(true)}
            style={{
              margin: '6px 4px 0', padding: '10px', textAlign: 'center',
              border: '1px dashed var(--border)', borderRadius: 8,
              color: 'var(--fg-4)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'background 120ms',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            + 新建 Agent
          </div>
        </div>
      </div>

      {/* ── Center: profile + chat ─────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--bg)', minWidth: 0, minHeight: 0,
      }}>
        {!cur && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            选一个 Agent 看详情，或点 + 新建
          </div>
        )}
        {cur && (
          <>
            {/* Scrollable detail area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <FBAv glyph={cur.g} color={cur.color} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.015em' }}>{cur.name}</span>
                    <FBPill color="var(--accent-bright)">{cur.role.toUpperCase()}</FBPill>
                    <FBPill color="var(--fg-4)" dim>{cur.level}</FBPill>
                    <span className={`fb-dot ${DOT_CLASS[cur.status]}`} style={{ marginLeft: 4 }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', marginTop: 4, letterSpacing: '0.02em' }}>
                    {cur.model} · agent_id={cur.agent_id}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, maxWidth: 680 }}>
                    {cur.desc}
                  </div>
                </div>
                <button className="fb-btn fb-btn-ghost" style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={onNavigateToChat}>
                  <span style={{ color: 'var(--fg-3)', width: 14, height: 14, display: 'flex' }}>{FBIcons.chat}</span>
                  DM
                </button>
                <button className="fb-btn fb-btn-primary" style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={onNavigateToTeams}>
                  添加到 Team
                  <span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.arrow}</span>
                </button>
              </div>

              {/* Soul Prompt */}
              <div className="fb-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="fb-label">灵魂 Prompt · system</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>来自 backend.soul</span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--fg-2)',
                  padding: '10px 12px', background: 'var(--bg-elev-2)', borderRadius: 8, border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {cur.soul}
                </div>
              </div>

              {/* Skills + Tools */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="fb-card" style={{ padding: 12 }}>
                  <div className="fb-label" style={{ marginBottom: 8 }}>技能</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cur.skills.length === 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-5)' }}>—</span>}
                    {cur.skills.map(s => (
                      <span key={s} className="fb-pill" style={{ color: 'var(--fg-2)', background: 'var(--bg-elev-2)', borderColor: 'var(--border)' }}>{s}</span>
                    ))}
                  </div>
                </div>
                <div className="fb-card" style={{ padding: 12 }}>
                  <div className="fb-label" style={{ marginBottom: 8 }}>工具权限 · {cur.level.split(' ')[0]}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cur.tools.length === 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-5)' }}>—</span>}
                    {cur.tools.map(t => (
                      <span key={t.n} className="fb-pill" style={{
                        color: t.ok ? 'var(--status-ok)' : 'var(--fg-5)',
                        background: t.ok ? 'var(--status-ok-tint)' : 'var(--bg-elev-2)',
                        borderColor: t.ok ? 'color-mix(in oklab, var(--status-ok) 30%, transparent)' : 'var(--border)',
                      }}>
                        {t.ok ? '✓' : '✗'} {t.n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Chat-driven editing area — pinned at bottom */}
            <div style={{ padding: '8px 20px 12px', flexShrink: 0 }}>
              <AgentEditChat agentId={cur.agent_id} onAgentUpdated={refresh} />
            </div>
          </>
        )}
      </div>

      {/* ── Right: history & teams ─────────────────────────────── */}
      <div style={{
        width: 300, borderLeft: '1px solid var(--border)',
        background: 'var(--bg-elev-1)', display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fb-label">In teams</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
            · {cur?.teams.filter(t => t.live).length ?? 0} active
          </span>
        </div>
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!cur || cur.teams.length === 0 ? (
            <div style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-5)', textAlign: 'center' }}>
              暂未加入任何 Team
            </div>
          ) : cur.teams.map((t, i) => (
            <div key={i} className="fb-row">
              <span style={{
                width: 30, height: 30, borderRadius: 8, background: 'var(--bg-elev-3)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)',
              }}>×5</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{t.n}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>{t.role}</div>
              </div>
              {t.live && <span className="fb-pill-live">LIVE</span>}
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="fb-label">最近运行</span>
        </div>
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!cur || cur.history.length === 0 ? (
            <div style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-5)', textAlign: 'center' }}>
              暂无运行记录
            </div>
          ) : cur.history.map((h, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 6,
            }}>
              <span className="fb-dot fb-dot-ok" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.m}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-5)' }}>{h.t}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
        }}>
          <span className="fb-dot fb-dot-ok" />
          tokens 30d · <span style={{ color: 'var(--fg-2)' }}>{cur?.tokens ?? '—'}</span> · cost <span style={{ color: 'var(--fg-2)' }}>{cur?.cost ?? '—'}</span>
        </div>
      </div>
    </>
  );
}

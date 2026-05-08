/**
 * FB-HiFi · Teams tab — list rail + DAG canvas + inspector
 * M2: 接真实后端 listTeams() / createTeam()
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Command, Hand, LayoutGrid, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import { FBAv, FBPill, FBIcons } from './FBAtoms';
import {
  listTeams, createTeam, deleteTeam, getTeamWorkflow, getTeamPolicy,
  type TeamRecord, type TeamWorkflow, type TeamPolicyMatrix,
} from '../../api/teams';
import { listAgents, type AgentRecord } from '../../api/agents';
import { TeamEditChat } from './TeamEditChat';

interface TeamView {
  team_id: string;
  name: string;
  description: string;
  agent_ids: string[];
  run: boolean;
  status: string;
  policy: string;
}

function toTeamView(t: TeamRecord): TeamView {
  return {
    team_id: t.team_id,
    name: t.name,
    description: t.description,
    agent_ids: t.agent_ids,
    run: false,
    status: t.description || '待命',
    policy: 'L1-auto',
  };
}

type LoadState = 'loading' | 'ok' | 'error';

interface CreateTeamForm {
  name: string;
  desc: string;
  agents: string;
}

interface TabTeamsProps {
  onNavigateToChat?: () => void;
}

// ── Canvas layout types ──────────────────────────────────────────
interface CanvasNode {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  status: 'ok' | 'running' | 'pending';
  statusText: string;
  agentId?: string;
}

interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
  variant: 'ok' | 'running' | 'default';
  dashed?: boolean;
  label?: string;
}

function buildCanvasLayout(
  dagData: TeamWorkflow | null,
  agentIds: string[],
  allAgents: AgentRecord[],
): { canvasNodes: CanvasNode[]; canvasEdges: CanvasEdge[] } {
  // Use real workflow data when available
  if (dagData && dagData.nodes.length > 0) {
    const canvasNodes: CanvasNode[] = dagData.nodes.map((n, i) => ({
      id: n.id,
      label: n.data.name,
      sublabel: '',
      x: n.position.x ?? (200 + i * 200),
      y: n.position.y ?? 240,
      status: 'pending' as const,
      statusText: 'pending',
      agentId: (n.data as { agentId?: string }).agentId,
    }));
    const canvasEdges: CanvasEdge[] = dagData.edges.map(e => ({
      id: e.id,
      fromId: e.source,
      toId: e.target,
      variant: 'default' as const,
      label: e.label,
    }));
    return { canvasNodes, canvasEdges };
  }

  // Auto-layout from agent_ids when no workflow is configured
  if (agentIds.length === 0) return { canvasNodes: [], canvasEdges: [] };

  const Y = 240;
  const n = agentIds.length;
  // Adaptive spacing: fit up to 5 agents within ~600px, max 190px apart
  const spacing = n <= 1 ? 200 : Math.min(190, Math.floor(540 / n));
  const totalWidth = (n - 1) * spacing + 150;
  const startX = Math.max(40, Math.floor((620 - totalWidth) / 2));

  const canvasNodes: CanvasNode[] = agentIds.map((agentId, i) => {
    const agent = allAgents.find(a => a.agent_id === agentId);
    return {
      id: agentId,
      label: agent?.name ?? `Agent ${i + 1}`,
      sublabel: (agent?.soul ?? agentId).slice(0, 26),
      x: startX + i * spacing,
      y: Y,
      status: 'pending' as const,
      statusText: '就绪',
      agentId,
    };
  });

  const canvasEdges: CanvasEdge[] = canvasNodes.slice(1).map((node, i) => ({
    id: `auto-${i}`,
    fromId: canvasNodes[i].id,
    toId: node.id,
    variant: 'default' as const,
  }));

  return { canvasNodes, canvasEdges };
}

export function TabTeams({ onNavigateToChat }: TabTeamsProps = {}) {
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateTeamForm>({ name: '', desc: '', agents: '' });
  const [submitting, setSubmitting] = useState(false);
  const [matrixView, setMatrixView] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dagEditorOpen, setDagEditorOpen] = useState(false);
  const [dagData, setDagData] = useState<TeamWorkflow | null>(null);
  const [dagLoading, setDagLoading] = useState(false);
  const [policyData, setPolicyData] = useState<TeamPolicyMatrix | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  const fetchTeams = async () => {
    setLoadState('loading');
    try {
      const data = await listTeams();
      setTeams(data.map(toTeamView));
      setLoadState('ok');
      setSelectedIdx(0);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setLoadState('error');
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  // Load agents once for name resolution and inspector
  useEffect(() => {
    listAgents().then(setAgents).catch(() => {});
  }, []);

  const cur = teams[selectedIdx] ?? null;

  // Auto-load workflow whenever the selected team changes
  useEffect(() => {
    if (!cur) { setDagData(null); return; }
    setDagLoading(true);
    setSelectedNodeId(null);
    getTeamWorkflow(cur.team_id)
      .then(setDagData)
      .catch(() => setDagData({ nodes: [], edges: [] }))
      .finally(() => setDagLoading(false));
  }, [cur?.team_id]);

  useEffect(() => {
    if (!matrixView || !cur) return;
    setPolicyLoading(true);
    getTeamPolicy(cur.team_id)
      .then(setPolicyData)
      .catch(() => setPolicyData({}))
      .finally(() => setPolicyLoading(false));
  }, [matrixView, cur?.team_id]);

  const handleCreateTeam = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    setCreateError('');
    try {
      const agentIds = form.agents.split(',').map(s => s.trim()).filter(Boolean);
      await createTeam({ name: form.name.trim(), description: form.desc.trim(), agent_ids: agentIds });
      setModalOpen(false);
      setForm({ name: '', desc: '', agents: '' });
      await fetchTeams();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败，请检查参数后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确认删除此 Team？')) return;
    setDeletingTeamId(teamId);
    try {
      await deleteTeam(teamId);
      setTeams(prev => {
        const newTeams = prev.filter(t => t.team_id !== teamId);
        setSelectedIdx(idx => Math.min(idx, Math.max(0, newTeams.length - 1)));
        return newTeams;
      });
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingTeamId(null);
    }
  };

  // Canvas layout computed from real data or auto-generated from agent_ids
  const { canvasNodes, canvasEdges } = useMemo(
    () => buildCanvasLayout(dagData, cur?.agent_ids ?? [], agents),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur?.team_id, dagData, agents],
  );

  const canvasNodeMap = useMemo(
    () => new Map(canvasNodes.map((n: CanvasNode) => [n.id, n])),
    [canvasNodes],
  );

  // Default selection: last node (the "active" one), or explicit click
  const selectedNode = (selectedNodeId ? canvasNodeMap.get(selectedNodeId) : null)
    ?? canvasNodes[canvasNodes.length - 1]
    ?? null;
  const selectedAgent = selectedNode?.agentId
    ? agents.find(a => a.agent_id === selectedNode.agentId) ?? null
    : null;

  return (
    <>
      {/* ── Left: team list ────────────────────────────────────── */}
      <div style={{
        width: 280, borderRight: '1px solid var(--t-border)',
        background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fb-label">Teams</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
            · {loadState === 'ok' ? teams.length : '…'}
          </span>
          <button
            className="fb-btn fb-btn-icon"
            data-testid="open-create-team"
            style={{ marginLeft: 'auto', width: 24, height: 24 }}
            onClick={() => setModalOpen(true)}
          >
            <span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.plus}</span>
          </button>
        </div>

        {loadState === 'loading' && (
          <div style={{ padding: '24px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)', textAlign: 'center' }}>
            加载 Teams 中…
          </div>
        )}

        {loadState === 'error' && (
          <div
            data-testid="teams-error"
            style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-reject)' }}
          >
            ✗ 加载失败: {errorMsg}
          </div>
        )}

        {loadState === 'ok' && teams.length === 0 && (
          <div
            data-testid="teams-empty"
            style={{ padding: '24px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)', textAlign: 'center' }}
          >
            还没有 Team — 点 + 创建
          </div>
        )}

        {loadState === 'ok' && teams.length > 0 && (
          <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
            {teams.map((t, i) => (
              <div
                key={t.team_id}
                onClick={() => setSelectedIdx(i)}
                className={`fb-row ${i === selectedIdx ? 'active' : ''}`}
                style={{
                  borderLeft: i === selectedIdx ? '2px solid var(--t-accent)' : '2px solid transparent',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  {t.run && <span className="fb-dot fb-dot-run" />}
                  <span style={{ fontSize: 13, fontWeight: i === selectedIdx ? 700 : 600, color: 'var(--t-fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </span>
                  <span style={{
                    minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
                    background: t.run ? 'var(--t-accent)' : 'var(--t-panel-3)',
                    color: t.run ? 'var(--skin-accent-ink)' : 'var(--t-fg-3)',
                    border: t.run ? 'none' : '1px solid var(--t-border)',
                    fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {t.agent_ids.length}
                  </span>
                  <button
                    title="删除 Team"
                    disabled={deletingTeamId === t.team_id}
                    onClick={e => handleDeleteTeam(t.team_id, e)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: 'transparent', color: 'var(--status-reject)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, opacity: deletingTeamId === t.team_id ? 0.4 : 0,
                      transition: 'opacity 120ms',
                      flexShrink: 0,
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--status-reject-tint)'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >×</button>
                </div>

                {/* Member avatar chips */}
                {t.agent_ids.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', paddingLeft: 0 }}>
                    {t.agent_ids.slice(0, 5).map(id => {
                      const agent = agents.find(a => a.agent_id === id);
                      const initial = (agent?.name ?? id)[0]?.toUpperCase() ?? '?';
                      return (
                        <span
                          key={id}
                          title={agent?.name ?? id}
                          style={{
                            width: 18, height: 18, borderRadius: '50%',
                            background: 'var(--t-panel-3)', border: '1px solid var(--t-border)',
                            fontSize: 8, fontWeight: 700, color: 'var(--t-fg-3)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-mono)', flexShrink: 0,
                          }}
                        >{initial}</span>
                      );
                    })}
                    {t.agent_ids.length > 5 && (
                      <span style={{ fontSize: 9, color: 'var(--t-fg-5)', alignSelf: 'center', fontFamily: 'var(--font-mono)' }}>
                        +{t.agent_ids.length - 5}
                      </span>
                    )}
                  </div>
                )}

                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%',
                }}>
                  {t.status}
                </div>
              </div>
            ))}
          </div>
        )}

        {loadState !== 'ok' && <div style={{ flex: 1 }} />}

        <div style={{
          padding: '12px 14px', borderTop: '1px solid var(--t-border)',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', lineHeight: 1.6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Policy Matrix</span>
            <span style={{ color: 'var(--t-accent-bright)' }}>L2-strict</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>retry_gate</span>
            <span style={{ color: 'var(--t-fg-2)' }}>3</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>checkpoint</span>
            <span style={{ color: 'var(--status-ok)' }}>auto</span>
          </div>
        </div>
      </div>

      {/* ── Center: DAG canvas ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Canvas header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--t-border)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--skin-panel)', flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {cur ? cur.name : '—'}
              </span>
              {cur?.run && <span className="fb-pill-live">RUNNING · #042</span>}
              {cur && !cur.run && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 4, border: '1px solid var(--t-border)',
                  color: 'var(--t-fg-4)', background: 'var(--t-panel-2)',
                }}>{cur.status}</span>
              )}
              {cur && <FBPill color="var(--t-fg-4)" dim>POLICY · {cur.policy}</FBPill>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 3, letterSpacing: '0.02em' }}>
              {cur
                ? (() => {
                    const memberNames = cur.agent_ids
                      .slice(0, 3)
                      .map(id => agents.find(a => a.agent_id === id)?.name ?? id.slice(-4))
                      .join(' · ');
                    const extra = cur.agent_ids.length > 3 ? ` +${cur.agent_ids.length - 3}` : '';
                    return `${cur.agent_ids.length} agents${memberNames ? ` · ${memberNames}${extra}` : ''}`;
                  })()
                : '—'
              }
              {dagData && dagData.nodes.length > 0 ? ' · configured workflow' : ' · auto-layout'}
            </div>
          </div>
          <button className="fb-btn fb-btn-ghost fb-btn-sm" style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setDagEditorOpen(true)}>
            <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.dag}</span> 编辑 DAG
          </button>
          <button
            className="fb-btn fb-btn-ghost fb-btn-sm"
            onClick={() => setMatrixView(v => !v)}
            style={{
              background: matrixView ? 'var(--t-accent-tint)' : undefined,
              color: matrixView ? 'var(--t-accent-bright)' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <LayoutGrid size={13} strokeWidth={2} aria-hidden /> Matrix
          </button>
          <button className="fb-btn fb-btn-primary fb-btn-sm" style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={onNavigateToChat}>
            进群聊 <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.arrow}</span>
          </button>
        </div>

        {/* Dot grid canvas */}
        <div className="fb-canvas" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Lane labels — always present as phase hints */}
          <div style={{ position: 'absolute', left: 24, top: 18, display: 'flex', flexDirection: 'column', gap: 78 }}>
            {(['PLAN', 'RESEARCH', 'DRAFT', 'REVIEW', 'PUBLISH'] as const).map((l, i) => (
              <div key={l} className="fb-lane-hdr" style={{ minWidth: 118 }}>
                {l}
                <span className="hint">{['gate', 'parallel', 'retry 3', 'approval', 'final'][i]}</span>
              </div>
            ))}
          </div>

          {/* SVG edges — dynamic */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <marker id="dag-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--t-fg-5)" />
              </marker>
              <marker id="dag-ar-run" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--t-accent)" />
              </marker>
              <marker id="dag-ar-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--status-ok)" />
              </marker>
            </defs>
            {canvasEdges.map((edge: CanvasEdge) => {
              const from = canvasNodeMap.get(edge.fromId);
              const to = canvasNodeMap.get(edge.toId);
              if (!from || !to) return null;
              // Connect right-center of source to left-center of target
              const sx = from.x + 150, sy = from.y + 32;
              const tx = to.x, ty = to.y + 32;
              const mx = (sx + tx) / 2;
              const color = edge.variant === 'ok'
                ? 'var(--status-ok)'
                : edge.variant === 'running'
                ? 'var(--t-accent)'
                : 'var(--t-fg-5)';
              const markerId = edge.variant === 'ok' ? '#dag-ar-ok'
                : edge.variant === 'running' ? '#dag-ar-run' : '#dag-ar';
              return (
                <path
                  key={edge.id}
                  d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                  stroke={color}
                  strokeWidth={edge.variant === 'running' ? 1.6 : 1.2}
                  fill="none"
                  strokeDasharray={edge.dashed ? '6 5' : undefined}
                  style={edge.dashed ? { animation: 'fb-dash 0.8s linear infinite' } : undefined}
                  markerEnd={`url(${markerId})`}
                />
              );
            })}
          </svg>

          {/* Nodes — dynamic */}
          {canvasNodes.map((node: CanvasNode) => {
            const isSelected = selectedNodeId
              ? node.id === selectedNodeId
              : node.id === canvasNodes[canvasNodes.length - 1]?.id;
            const statusClass = node.status === 'ok' ? 'ok'
              : node.status === 'running' ? 'run' : '';
            return (
              <div
                key={node.id}
                className={`fb-node ${statusClass} ${isSelected ? 'selected' : ''}`.trim()}
                style={{ left: node.x, top: node.y, width: 150, minHeight: 64, padding: '8px 10px', cursor: 'pointer' }}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <div className="n-t">{node.label}</div>
                <div className="n-m" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.sublabel}
                </div>
                <div className="n-s" style={{
                  color: node.status === 'ok' ? 'var(--status-ok)'
                    : node.status === 'running' ? 'var(--t-accent)'
                    : 'var(--t-fg-4)',
                }}>
                  <span className={`fb-dot fb-dot-${node.status === 'ok' ? 'ok' : node.status === 'running' ? 'run' : 'idle'}`} />
                  {node.statusText}
                </div>
              </div>
            );
          })}

          {/* Loading overlay */}
          {dagLoading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.08)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)' }}>加载工作流…</span>
            </div>
          )}

          {/* Empty state: team exists but no agents */}
          {!dagLoading && cur && canvasNodes.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 13, color: 'var(--t-fg-3)', fontWeight: 600 }}>此 Team 暂无成员</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-5)',
                textAlign: 'center', maxWidth: 240, lineHeight: 1.7,
              }}>
                前往 Agents 标签招募成员<br />成员加入后工作流将自动出现
              </div>
              <button
                className="fb-btn fb-btn-ghost fb-btn-sm"
                style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                onClick={() => setDagEditorOpen(true)}
              >
                配置工作流 →
              </button>
            </div>
          )}

          {/* Canvas toolbar */}
          <div style={{
            position: 'absolute', left: 18, bottom: 14,
            display: 'flex', gap: 4, padding: 4,
            background: 'var(--skin-panel)', border: '1px solid var(--t-border)', borderRadius: 8,
          }}>
            {[
              { key: 'select', icon: <MousePointer2 size={14} strokeWidth={2} aria-hidden />, title: '选择模式' },
              { key: 'pan',    icon: <Hand           size={14} strokeWidth={2} aria-hidden />, title: '平移模式' },
              { key: 'zoom-in',  icon: <ZoomIn  size={14} strokeWidth={2} aria-hidden />, title: '放大' },
              { key: 'zoom-out', icon: <ZoomOut size={14} strokeWidth={2} aria-hidden />, title: '缩小' },
              { key: 'command',  icon: <Command size={14} strokeWidth={2} aria-hidden />, title: '命令' },
            ].map(({ key, icon, title }) => (
              <button key={key} title={title} aria-label={title} style={{
                width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--t-fg-3)',
                background: 'transparent',
              }}>{icon}</button>
            ))}
            <span style={{ padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', alignSelf: 'center' }}>100%</span>
          </div>
        </div>

        {/* Chat-driven editing */}
        {cur && (
          <div style={{ flexShrink: 0, padding: '6px 12px 8px' }}>
            <TeamEditChat teamId={cur.team_id} onTeamUpdated={fetchTeams} />
          </div>
        )}
      </div>

      {!inspectorOpen && (
        <button
          onClick={() => setInspectorOpen(true)}
          title="展开 Inspector"
          style={{
            position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 56, borderRadius: '8px 0 0 8px',
            background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRight: 'none',
            color: 'var(--t-fg-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, zIndex: 10,
          }}
        >‹</button>
      )}

      {/* ── Right: inspector — dynamic based on selected node ──── */}
      {inspectorOpen && (
        <div style={{
          width: 320, borderLeft: '1px solid var(--t-border)',
          background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="fb-label">Inspector</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
              · {selectedNode?.label ?? '—'}
            </span>
            <button
              className="fb-btn fb-btn-icon"
              style={{ marginLeft: 'auto', width: 24, height: 24 }}
              onClick={() => setInspectorOpen(false)}
              title="关闭 Inspector"
            >
              <span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.x}</span>
            </button>
          </div>

          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
            {selectedNode ? (
              <>
                {/* Agent identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FBAv
                    glyph={selectedAgent?.name?.[0] ?? selectedNode.label[0] ?? '?'}
                    color="#EF4444"
                    size={36}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {selectedNode.label}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
                      {selectedAgent
                        ? selectedAgent.soul.slice(0, 40)
                        : selectedNode.sublabel || '—'
                      }
                    </div>
                  </div>
                  <FBPill color={
                    selectedNode.status === 'running' ? 'var(--t-accent-bright)'
                    : selectedNode.status === 'ok' ? 'var(--status-ok)'
                    : 'var(--t-fg-4)'
                  }>
                    {selectedNode.status === 'running' ? 'RUN'
                      : selectedNode.status === 'ok' ? 'OK'
                      : '待命'}
                  </FBPill>
                </div>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { k: 'tokens',  v: cur?.run ? '1.2k' : '—',    d: cur?.run ? 'in 0.4 / out 0.8' : '暂无运行记录' },
                    { k: 'latency', v: cur?.run ? '87ms' : '—',    d: cur?.run ? 'p95 142ms' : '暂无运行记录' },
                    { k: 'retries', v: cur?.run ? '2/3' : '—',     d: cur?.run ? 'gap detected' : '暂无运行记录' },
                    { k: 'cost',    v: cur?.run ? '$0.018' : '—',  d: cur?.run ? 'cumulative' : '暂无运行记录' },
                  ].map((s) => (
                    <div key={s.k} style={{
                      padding: '10px 12px', background: 'var(--t-panel-2)',
                      border: '1px solid var(--t-border)', borderLeft: '2px solid var(--t-accent)', borderRadius: 8,
                    }}>
                      <div className="fb-label" style={{ fontSize: 9 }}>{s.k}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--t-fg)', marginTop: 2 }}>{s.v}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 1 }}>{s.d}</div>
                    </div>
                  ))}
                </div>

                {/* Policy Matrix */}
                <div className="fb-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="fb-label">Policy Matrix · 入边</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-accent-bright)' }}>
                      {cur?.policy ?? 'L2-strict'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {canvasEdges
                      .filter((e: CanvasEdge) => e.toId === selectedNode.id)
                      .slice(0, 3)
                      .map((e: CanvasEdge, i: number) => {
                        const srcNode = canvasNodeMap.get(e.fromId);
                        return (
                          <React.Fragment key={i}>
                            <span style={{ color: 'var(--t-fg-2)' }}>from {srcNode?.label ?? e.fromId.slice(-6)}</span>
                            <span style={{ color: 'var(--status-ok)' }}>auto</span>
                            <span style={{ color: 'var(--t-fg-4)' }}>pass</span>
                          </React.Fragment>
                        );
                      })
                    }
                    {canvasEdges.filter((e: CanvasEdge) => e.toId === selectedNode.id).length === 0 && (
                      <span style={{ color: 'var(--t-fg-5)', gridColumn: '1 / -1', fontSize: 10 }}>
                        无入边 (起始节点)
                      </span>
                    )}
                  </div>
                </div>

                {/* Activity */}
                <div>
                  <div className="fb-label" style={{ margin: '4px 4px 8px' }}>活动流</div>
                  {cur?.run ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        { t: '09:18', m: '阿批 → REJECT · "missing baseline"', c: 'var(--status-reject)' },
                        { t: '09:18', m: 'rollback to draft v2 · ckpt.saved',   c: 'var(--t-fg-3)' },
                        { t: '09:18', m: 'retry r2/3 · running...',              c: 'var(--t-accent)' },
                      ].map((h, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px',
                          background: 'var(--t-panel-2)', borderLeft: `2px solid ${h.c}`, borderRadius: 4,
                        }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-5)' }}>{h.t}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-2)', flex: 1 }}>{h.m}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: '12px 10px', background: 'var(--t-panel-2)',
                      borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--t-fg-5)', textAlign: 'center', lineHeight: 1.7,
                    }}>
                      暂无运行记录<br />启动 Team 后将在此显示事件
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-5)',
              }}>
                点击 canvas 中的节点查看详情
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DAG editor modal ──────────────────────────────────── */}
      {dagEditorOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setDagEditorOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ width: 640, background: 'var(--skin-panel)', border: '1px solid var(--t-border)', borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>编辑 DAG · {cur?.name ?? '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
                GET /api/teams/{cur?.team_id ?? '—'}/workflow
              </span>
            </div>
            <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 8, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', lineHeight: 1.7, marginBottom: 14, maxHeight: 320, overflow: 'auto' }}>
              {dagLoading && <div>加载中…</div>}
              {!dagLoading && dagData && (
                <>
                  <div style={{ color: 'var(--t-fg-2)', marginBottom: 6 }}>
                    {dagData.nodes.length} nodes · {dagData.edges.length} edges
                  </div>
                  {dagData.nodes.length === 0 && dagData.edges.length === 0 && (
                    <div style={{ color: 'var(--t-fg-5)', fontStyle: 'italic' }}>
                      该 Team 暂无 workflow 配置 · PUT /api/teams/{cur?.team_id}/workflow 上传节点 + 连线
                    </div>
                  )}
                  {dagData.nodes.map(n => (
                    <div key={n.id}>· <span style={{ color: 'var(--t-accent-bright)' }}>{n.data.name}</span> ({n.type}) @ ({n.position.x},{n.position.y})</div>
                  ))}
                  {dagData.edges.length > 0 && <div style={{ marginTop: 6, color: 'var(--t-fg-4)' }}>—— edges ——</div>}
                  {dagData.edges.map(e => (
                    <div key={e.id}>{e.source} → {e.target}{e.data?.mode ? ` [${e.data.mode}]` : ''}{e.label ? ` "${e.label}"` : ''}</div>
                  ))}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="fb-btn fb-btn-ghost" onClick={() => cur && window.open(`/editor/${cur.team_id}`, '_blank')} style={{ fontSize: 11 }}>
                在画布编辑器中打开 ↗
              </button>
              <button className="fb-btn fb-btn-primary" onClick={() => setDagEditorOpen(false)} style={{ fontSize: 11 }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Matrix overlay ──────────────────────────────────── */}
      {matrixView && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMatrixView(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 195, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ width: 560, background: 'var(--skin-panel)', border: '1px solid var(--t-border)', borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Policy Matrix · {cur?.name ?? '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
                GET /api/teams/{cur?.team_id}/policy
              </span>
              <span style={{ flex: 1 }} />
              <span onClick={() => setMatrixView(false)} style={{ cursor: 'pointer', color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>ESC</span>
            </div>
            <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 8, padding: 14, maxHeight: 320, overflow: 'auto' }}>
              {policyLoading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)' }}>加载中…</div>}
              {!policyLoading && policyData && (() => {
                const rowKeys = Object.keys(policyData);
                if (rowKeys.length === 0) {
                  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-5)', fontStyle: 'italic' }}>
                    该 Team 暂无 policy 配置 · PUT /api/teams/{cur?.team_id}/policy 上传 sender×receiver 矩阵
                  </div>;
                }
                const colKeys = Array.from(new Set(rowKeys.flatMap(r => Object.keys(policyData[r]))));
                const cellColor: Record<string, string> = { permit: 'var(--status-ok)', deny: 'var(--status-reject)', warn: 'var(--status-warn)' };
                return (
                  <table style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr><th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t-fg-4)' }}>sender ↘ receiver</th>
                        {colKeys.map(c => <th key={c} style={{ padding: '4px 8px', color: 'var(--t-fg-4)' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rowKeys.map(r => (
                        <tr key={r}>
                          <td style={{ padding: '4px 8px', color: 'var(--t-fg-2)', fontWeight: 600 }}>{r}</td>
                          {colKeys.map(c => {
                            const v = policyData[r]?.[c];
                            return <td key={c} style={{ padding: '4px 8px', textAlign: 'center', color: v ? cellColor[v] : 'var(--t-fg-5)' }}>{v ?? '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Team Modal ──────────────────────────────────── */}
      {modalOpen && (
        <div
          data-testid="create-team-modal"
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div style={{
            width: 420, background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
            borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>创建 Team</span>
              <button className="fb-btn fb-btn-icon" onClick={() => setModalOpen(false)} aria-label="关闭">×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', display: 'block', marginBottom: 4 }}>
                  Team name
                </label>
                <input
                  data-testid="ct-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. 论文深读小队"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '7px 10px', borderRadius: 6,
                    background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
                    color: 'var(--t-fg)', fontFamily: 'var(--font-mono)', fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', display: 'block', marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  data-testid="ct-desc"
                  value={form.desc}
                  onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  placeholder="可选描述"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '7px 10px', borderRadius: 6,
                    background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
                    color: 'var(--t-fg)', fontFamily: 'var(--font-mono)', fontSize: 12,
                    outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', display: 'block', marginBottom: 4 }}>
                  Agent IDs（逗号分隔）
                </label>
                <input
                  data-testid="ct-agents"
                  value={form.agents}
                  onChange={e => setForm(f => ({ ...f, agents: e.target.value }))}
                  placeholder="agent-001, agent-002"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '7px 10px', borderRadius: 6,
                    background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
                    color: 'var(--t-fg)', fontFamily: 'var(--font-mono)', fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {createError && (
              <div style={{
                marginTop: 10, padding: '7px 10px', borderRadius: 6,
                background: 'rgba(239,68,68,0.08)', border: '1px solid var(--status-reject)',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-reject)',
              }}>
                ✗ {createError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button className="fb-btn fb-btn-ghost fb-btn-sm" onClick={() => setModalOpen(false)}>取消</button>
              <button
                data-testid="ct-submit"
                className="fb-btn fb-btn-primary fb-btn-sm"
                onClick={handleCreateTeam}
                disabled={submitting || !form.name.trim()}
              >
                {submitting ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

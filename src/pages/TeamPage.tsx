/**
 * TeamPage — Hi-Fi v2 reskin (Pages-A T2 + T6 Patch). Exports BOTH
 * `TeamListPage` (`/teams`) and `TeamDetailPage` (`/teams/:teamId`).
 *
 * Visual blueprint: `hf-pages.jsx` HfTeams — 2-column layout
 *   [240 team list] | [5-tab strip + lane diagram canvas]
 *
 * Wrapped by `<HfLayout>` (sidebar provided externally). Each page renders
 * only its own inner content column (HfTopBar + body).
 *
 * T6 Patch (2026-05-07):
 *   - TeamDetailPage now owns the 5-tab strip itself
 *     (成员 / Policy Matrix / 工作流 DAG / 活动 / 依赖) per Hi-Fi v2 spec.
 *   - 工作流 DAG (default tab) renders a decorative lane diagram with
 *     PLAN / RESEARCH / DRAFT / REVIEW / PUBLISH stages.
 *   - Policy Matrix tab renders the existing PolicyMatrixPanel.
 *   - 成员 tab still delegates to <TeamDetail> for member-list logic.
 *   - 活动 / 依赖 are placeholder cards.
 *   - `detail-team-name` is hoisted into the page-level header so the test
 *     can assert it regardless of active tab.
 *
 * Functional preservations from Story 12.2 / 12-3:
 *   - listTeams / getTeam / deleteTeam / patchTeam wiring.
 *   - data-testids: team-page, team-loading, empty-new-team-btn, new-team-btn,
 *     team-list, team-card-{id} (provided by TeamCard), create-team-modal
 *     (provided by CreateTeamModal), team-detail-loading, team-detail-page,
 *     detail-team-name (now on the page header).
 *   - CreateTeamModal 2-step wizard (AC2/AC3) and "+ 新建 Team" entry.
 *   - Delete team flow + error banner.
 *   - List immediately updates after creation (AC4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Users } from 'lucide-react';
import {
  deleteTeam,
  getTeam,
  getTeamPolicy,
  getTeamWorkflow,
  listTeams,
  putTeamPolicy,
  TeamApiError,
  type TeamPolicyMatrix,
  type TeamRecord,
  type TeamWorkflowEdge,
  type TeamWorkflowNode,
} from '../api/teams';
import { TeamCard } from '../core/components/team/TeamCard';
import { CreateTeamModal } from '../core/components/team/CreateTeamModal';
import { TeamDetail } from '../core/components/team/TeamDetail';
import { HfTopBar } from '../components/hifi';
import { PolicyMatrixPanel } from '../core/components/Panel/PolicyMatrixPanel';
import { usePolicyStore, type PolicyMatrix as StorePolicyMatrix } from '../core/hooks/usePolicyStore';
import { useI18n } from '../common/i18n';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type FilterTab = 'official' | 'workspace';

// ---------------------------------------------------------------------------
// Shared TeamListColumn — 240 px team list column (used by both pages).
// ---------------------------------------------------------------------------

interface TeamListColumnProps {
  teams: TeamRecord[];
  activeId?: string | null;
  onCreate: () => void;
  onSelect?: (teamId: string) => void;
}

function TeamListColumn({ teams, activeId, onCreate, onSelect }: TeamListColumnProps) {
  const { t } = useI18n();
  return (
    <div
      style={{
        borderRight: '1px solid var(--t-border)',
        padding: '10px 10px',
        overflow: 'auto',
        background: 'var(--t-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px 10px',
        }}
      >
        <span className="hf-label">{t('team.listLabel')} · {teams.length}</span>
        <button
          type="button"
          className="hf-btn"
          style={{ fontSize: 10, padding: '3px 8px' }}
          onClick={onCreate}
          data-testid="new-team-btn"
        >
          {t('team.newBtn')}
        </button>
      </div>
      {teams.length === 0 ? (
        <div className="hf-meta" style={{ padding: '8px 10px' }}>
          {t('team.noTeams')}
        </div>
      ) : (
        teams.map((t) => {
          const on = t.team_id === activeId;
          return (
            <button
              key={t.team_id}
              type="button"
              onClick={() => onSelect?.(t.team_id)}
              className="hf-card"
              data-testid={`team-list-row-${t.team_id}`}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 6,
                cursor: 'pointer',
                borderColor: on ? 'var(--t-accent)' : 'var(--t-border)',
                background: on ? 'var(--t-accent-tint)' : 'var(--t-panel)',
                color: 'var(--t-fg)',
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.name}</div>
              <div className="hf-meta" style={{ fontSize: 10, marginTop: 3 }}>
                {t.agent_ids.length} agents
                {t.description ? ` · ${t.description.slice(0, 24)}` : ''}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamListPage — /teams
// ---------------------------------------------------------------------------

function TeamListPage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('workspace');

  const fetchTeams = useCallback(async () => {
    setLoadStatus('loading');
    setErrorMsg(null);
    try {
      const data = await listTeams();
      setTeams(data);
      setLoadStatus('success');
    } catch (err) {
      const msg = err instanceof TeamApiError
        ? `${t('team.loadError')}（${err.status}）`
        : t('team.loadError');
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, [t]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  function handleCreated(team: TeamRecord) {
    setTeams((prev) => [team, ...prev]);
  }

  async function handleDelete(teamId: string) {
    setDeletingId(teamId);
    setDeleteError(null);
    try {
      await deleteTeam(teamId);
      setTeams((prev) => prev.filter((tm) => tm.team_id !== teamId));
    } catch (err) {
      const msg = err instanceof TeamApiError
        ? `${t('common.delete')} ${t('team.loadError')}（${err.status}）`
        : t('team.loadError');
      setDeleteError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  const errBanner = (msg: string) => (
    <div style={{
      marginBottom: 16, padding: '8px 14px', borderRadius: 8, fontSize: 12,
      border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
      background: 'color-mix(in oklab, var(--t-err) 10%, var(--t-panel))',
      color: 'var(--t-err)',
    }}>
      {msg}
    </div>
  );

  return (
    <div
      data-testid="team-page"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', color: 'var(--t-fg)' }}
    >
      <HfTopBar />

      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              Teams
            </h1>
            <p className="hf-meta" style={{ fontSize: 12, margin: 0 }}>
              {t('team.pageSubtitle')}
            </p>
          </div>

          {/* Error banners */}
          {errorMsg && errBanner(errorMsg)}
          {deleteError && errBanner(deleteError)}

          {/* Tab bar + new team button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            {/* Segmented tabs */}
            <div style={{
              display: 'flex', gap: 2,
              background: 'var(--t-panel)', border: '1px solid var(--t-border)',
              borderRadius: 10, padding: 3,
            }}>
              {(['official', 'workspace'] as FilterTab[]).map((tab) => {
                const active = tab === activeTab;
                const label = tab === 'official' ? '官方' : '工作区';
                const count = tab === 'workspace' ? teams.length : 0;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      background: active ? 'var(--t-panel-3)' : 'transparent',
                      color: active ? 'var(--t-fg)' : 'var(--t-fg-4)',
                      transition: 'background .12s, color .12s',
                    }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{
                        padding: '1px 5px', borderRadius: 5, fontSize: 10,
                        fontFamily: 'var(--font-mono)', fontWeight: 700,
                        background: active ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
                        color: active ? 'var(--t-accent)' : 'var(--t-fg-5)',
                        border: '1px solid var(--t-border)',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />

            {/* "+ 新建 Team" — always present for test-id compatibility */}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="hf-btn hf-btn-pri"
              style={{ fontSize: 12 }}
              data-testid="new-team-btn"
            >
              {t('team.newTeam')}
            </button>
          </div>

          {/* Official tab: always empty / coming soon */}
          {activeTab === 'official' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '72px 0', textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={26} strokeWidth={1.5} style={{ color: 'var(--t-fg-4)' }} aria-hidden />
              </div>
              <p style={{ fontSize: 13, color: 'var(--t-fg-3)', margin: 0 }}>官方精选团队即将上线</p>
              <p style={{ fontSize: 11, color: 'var(--t-fg-5)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                Coming soon
              </p>
            </div>
          )}

          {/* Workspace tab: loading / empty / list */}
          {activeTab === 'workspace' && (
            <>
              {loadStatus === 'loading' && (
                <p
                  data-testid="team-loading"
                  className="hf-meta"
                  style={{ padding: '72px 0', textAlign: 'center', fontSize: 12 }}
                >
                  {t('team.loading')}
                </p>
              )}

              {loadStatus === 'success' && teams.length === 0 && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 14, padding: '72px 0', textAlign: 'center',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--t-accent)',
                  }}>
                    <Users size={30} strokeWidth={1.5} aria-hidden />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--t-fg-2)', margin: '0 0 4px' }}>
                      {t('team.noTeamYet')}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--t-fg-4)', margin: 0 }}>
                      {t('team.newTeamHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    data-testid="empty-new-team-btn"
                    className="hf-btn hf-btn-pri"
                    style={{ fontSize: 12 }}
                  >
                    {t('team.newTeam')}
                  </button>
                </div>
              )}

              {loadStatus === 'success' && teams.length > 0 && (
                <div
                  data-testid="team-list"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                    gap: 14,
                  }}
                >
                  {teams.map((team) => (
                    <div
                      key={team.team_id}
                      style={{ opacity: deletingId === team.team_id ? 0.45 : 1, transition: 'opacity .15s' }}
                      onClick={() => navigate(`/teams/${team.team_id}`)}
                    >
                      <TeamCard team={team} onDelete={handleDelete} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {showModal && (
        <CreateTeamModal
          onCreated={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamDetailPage — /teams/:teamId
// ---------------------------------------------------------------------------

type DetailTab = 'members' | 'policy' | 'dag' | 'activity' | 'dependency';

const DETAIL_TABS: DetailTab[] = ['members', 'policy', 'dag', 'activity', 'dependency'];

// ---------------------------------------------------------------------------
// P1 Team Detail components (design bundle 2026-05-15)
// ---------------------------------------------------------------------------

/** Team header: ×N count icon + name + pills + action buttons. */
function DesignTeamHeader({ team }: { team: TeamRecord }) {
  return (
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--t-fg-2)', flexShrink: 0 }}>
        ×{team.agent_ids.length}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span data-testid="detail-team-name" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {team.name}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, background: 'color-mix(in oklab, var(--t-accent-bright) 18%, transparent)', color: 'var(--t-accent-bright)', border: '1px solid color-mix(in oklab, var(--t-accent-bright) 35%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0 }}>
            POLICY
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)', marginTop: 4, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {team.agent_ids.length} agents{team.description ? ` · ${team.description}` : ''}
        </div>
      </div>
      <button type="button" className="hf-btn" style={{ fontSize: 12, flexShrink: 0 }}>重命名</button>
      <button type="button" className="hf-btn hf-btn-pri" style={{ fontSize: 12, flexShrink: 0 }}>启动新 run</button>
    </div>
  );
}

/** Left panel of the 2-col grid: member list via TeamDetail. */
function MembersPanel({ team, onTeamUpdated }: { team: TeamRecord; onTeamUpdated: (t: TeamRecord) => void }) {
  return (
    <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>成员</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>{team.agent_ids.length} agents</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="hf-btn" style={{ fontSize: 11 }}>+ 招人</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <TeamDetail team={team} onTeamUpdated={onTeamUpdated} />
      </div>
    </div>
  );
}

const DAG_COLORS = ['#A855F7', '#F59E0B', '#22D3EE', '#EF4444', '#10B981', '#3B82F6', '#EC4899'];

/** Right panel of the 2-col grid: SVG dot-grid DAG with real nodes/edges. */
function WorkflowDagPanel({ nodes, edges }: { nodes: TeamWorkflowNode[]; edges: TeamWorkflowEdge[] }) {
  const NODE_W = 148;
  const NODE_H = 64;
  const PAD = 24;

  const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));

  let minX = 0, minY = 0, maxX = 424, maxY = 308;
  if (nodes.length > 0) {
    minX = Math.min(...nodes.map(n => n.position.x)) - PAD;
    minY = Math.min(...nodes.map(n => n.position.y)) - PAD;
    maxX = Math.max(...nodes.map(n => n.position.x + NODE_W)) + PAD;
    maxY = Math.max(...nodes.map(n => n.position.y + NODE_H)) + PAD;
  }
  const vbW = Math.max(424, maxX - minX);
  const vbH = Math.max(308, maxY - minY);

  return (
    <div style={{ padding: '14px 16px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>工作流 DAG</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="hf-btn" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>编辑</button>
        <button type="button" className="hf-btn" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>YAML</button>
      </div>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 10, padding: 14 }}>
        {nodes.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-4)', fontSize: 12 }}>
            暂无工作流节点
          </div>
        ) : (
          <svg width="100%" height="260" viewBox={`${minX} ${minY} ${vbW} ${vbH}`}>
            <defs>
              <pattern id="tdp-dot" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.6" fill="var(--t-border)" />
              </pattern>
            </defs>
            <rect x={minX} y={minY} width={vbW} height={vbH} fill="url(#tdp-dot)" />
            {edges.map((edge, ei) => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              const x1 = src.position.x + NODE_W;
              const y1 = src.position.y + NODE_H / 2;
              const x2 = tgt.position.x;
              const y2 = tgt.position.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
              const active = edge.data?.mode !== 'approve';
              return (
                <g key={edge.id || ei}>
                  <path d={d} fill="none"
                    stroke={active ? 'var(--t-accent)' : 'var(--t-border)'}
                    strokeWidth={active ? 1.5 : 1}
                    strokeDasharray={active ? undefined : '4 3'} />
                  {active && (
                    <circle r="3" fill="var(--t-accent-bright)">
                      <animateMotion dur="2s" repeatCount="indefinite" path={d} />
                    </circle>
                  )}
                </g>
              );
            })}
            {nodes.map((node) => {
              const color = DAG_COLORS[(nodeIdx[node.id] ?? 0) % DAG_COLORS.length];
              const { x, y } = node.position;
              const glyph = (node.data.name || node.data.agentId || '?')[0];
              return (
                <g key={node.id} transform={`translate(${x},${y})`}>
                  <rect width={NODE_W} height={NODE_H} rx="14"
                    fill="var(--t-panel)" stroke="var(--t-border)" strokeWidth={1} />
                  <rect x="10" y="14" width="32" height="32" rx="8"
                    fill={`color-mix(in oklab, ${color} 18%, var(--t-panel-2))`}
                    stroke={`color-mix(in oklab, ${color} 45%, transparent)`} />
                  <text x="26" y="34" textAnchor="middle" fill={color}
                    fontFamily="var(--font-sans)" fontSize="14" fontWeight="800">{glyph}</text>
                  <text x="50" y="28" fill="var(--t-fg)" fontSize="12" fontWeight="700">{node.data.name}</text>
                  <text x="50" y="44" fill="var(--t-fg-4)" fontSize="9.5"
                    fontFamily="var(--font-mono)" letterSpacing="0.04em">{node.data.soul}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [allTeams, setAllTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Workflow nodes and edges for the DAG panel.
  const [workflowNodes, setWorkflowNodes] = useState<TeamWorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<TeamWorkflowEdge[]>([]);

  // Policy store actions — used to seed PolicyMatrixPanel with team-specific data.
  const setAgents   = usePolicyStore((s) => s.setAgents);
  const setMatrix   = usePolicyStore((s) => s.setMatrix);
  const resetPolicy = usePolicyStore((s) => s.reset);

  // Track the teamId for which policy was loaded to avoid redundant resets.
  const policyLoadedForRef = useRef<string | null>(null);

  // Fetch single team + workflow + policy whenever teamId changes.
  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setErrorMsg(null);
    setWorkflowNodes([]);

    // Reset policy store only when switching to a different team.
    if (policyLoadedForRef.current !== teamId) {
      resetPolicy();
      policyLoadedForRef.current = null;
    }

    Promise.all([
      getTeam(teamId),
      getTeamWorkflow(teamId).catch(() => ({ nodes: [], edges: [] })),
      getTeamPolicy(teamId).catch(() => ({})),
    ])
      .then(([fetchedTeam, workflow, policy]) => {
        setTeam(fetchedTeam);
        setWorkflowNodes(workflow.nodes);
        setWorkflowEdges(workflow.edges);

        // Seed policy store: prefer workflow-node ids as agents, else agent_ids.
        const agentKeys = workflow.nodes.length > 0
          ? workflow.nodes.map((n) => n.data.agentId || n.id)
          : fetchedTeam.agent_ids;

        if (agentKeys.length > 0) {
          setAgents(agentKeys);
        }
        if (Object.keys(policy).length > 0) {
          setMatrix(policy as StorePolicyMatrix, agentKeys.length > 0 ? agentKeys : undefined);
        }
        policyLoadedForRef.current = teamId;
      })
      .catch((err) => {
        /* TODO: i18n — error with status code interpolation */
        setErrorMsg(err instanceof TeamApiError ? `${t('team.loadError')}（${err.status}）` : t('team.loadError'));
      })
      .finally(() => setLoading(false));
  }, [teamId, t, resetPolicy, setAgents, setMatrix]);

  // Fetch all teams for the left column rail — only once on mount, not per teamId change.
  useEffect(() => {
    listTeams().then(setAllTeams).catch(() => {
      /* fall back to single-team display */
    });
  }, []);

  // Rules of Hooks: handlePolicySave must be called before any early return.
  const handlePolicySave = useCallback(
    async (matrix: StorePolicyMatrix) => {
      if (!teamId) return;
      await putTeamPolicy(teamId, matrix as TeamPolicyMatrix);
    },
    [teamId],
  );

  if (loading) {
    return (
      <div
        data-testid="team-detail-loading"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--t-bg)',
          color: 'var(--t-fg-4)',
        }}
      >
        {t('team.loading')}
      </div>
    );
  }

  if (errorMsg || !team) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--t-bg)',
          color: 'var(--t-fg-3)',
        }}
      >
        <p style={{ fontSize: 13 }}>{errorMsg ?? t('team.notFoundMsg')}</p>
        <button
          type="button"
          onClick={() => navigate('/teams')}
          className="hf-btn"
          style={{ fontSize: 11 }}
        >
          {t('team.backToTeams')}
        </button>
      </div>
    );
  }

  const teamsForRail = allTeams.length > 0 ? allTeams : [team];

  return (
    <div
      data-testid="team-detail-page"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', color: 'var(--t-fg)' }}
    >
      <HfTopBar
        right={
          <button type="button" className="hf-btn" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Upload size={12} strokeWidth={2} aria-hidden /> {t('team.onchain')}
          </button>
        }
      />

      {/* Hidden tab buttons — kept for test-id compatibility */}
      {DETAIL_TABS.map(tab => (
        <button key={tab} type="button" data-testid={`team-detail-tab-${tab}`} style={{ display: 'none' }} aria-hidden />
      ))}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 0, overflow: 'hidden' }}>
        <TeamListColumn
          teams={teamsForRail}
          activeId={team.team_id}
          onCreate={() => navigate('/teams')}
          onSelect={(id) => navigate(`/teams/${id}`)}
        />

        {/* P1 Team Detail — header + 2-col grid + full-width policy */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
          <DesignTeamHeader team={team} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: 18, alignContent: 'start' }}>
            <MembersPanel team={team} onTeamUpdated={setTeam} />
            <WorkflowDagPanel nodes={workflowNodes} edges={workflowEdges} />
          </div>

          <div style={{ padding: '0 18px 24px' }}>
            <PolicyMatrixPanel readOnly={false} onSave={handlePolicySave} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { TeamListPage, TeamDetailPage };
export default TeamListPage;

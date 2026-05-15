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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Hand, MousePointer2, Play, Upload, Users, ZoomIn } from 'lucide-react';
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
  type TeamWorkflowNode,
} from '../api/teams';
import { TeamCard } from '../core/components/team/TeamCard';
import { CreateTeamModal } from '../core/components/team/CreateTeamModal';
import { TeamDetail } from '../core/components/team/TeamDetail';
import { HfAvatar, HfTopBar } from '../components/hifi';
import { PolicyMatrixPanel } from '../core/components/Panel/PolicyMatrixPanel';
import { usePolicyStore, type PolicyMatrix as StorePolicyMatrix } from '../core/hooks/usePolicyStore';
import { useI18n } from '../common/i18n';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

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

  const fetchTeams = useCallback(async () => {
    setLoadStatus('loading');
    setErrorMsg(null);
    try {
      const data = await listTeams();
      setTeams(data);
      setLoadStatus('success');
    } catch (err) {
      /* TODO: i18n — error messages with status code interpolation */
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
      /* TODO: i18n — delete error messages with status code interpolation */
      const msg = err instanceof TeamApiError
        ? `${t('common.delete')} ${t('team.loadError')}（${err.status}）`
        : t('team.loadError');
      setDeleteError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      data-testid="team-page"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
      }}
    >
      <HfTopBar />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.015em' }}>Teams</span>
            <span className="hf-meta" style={{ fontSize: 12 }}>{t('team.pageSubtitle')}</span>
          </div>

          {/* Error banners */}
          {errorMsg && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
                background: 'color-mix(in oklab, var(--t-err) 10%, var(--t-panel))',
                color: 'var(--t-err)',
                fontSize: 12,
              }}
            >
              {errorMsg}
            </div>
          )}
          {deleteError && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid color-mix(in oklab, var(--t-err) 35%, transparent)',
                background: 'color-mix(in oklab, var(--t-err) 10%, var(--t-panel))',
                color: 'var(--t-err)',
                fontSize: 12,
              }}
            >
              {deleteError}
            </div>
          )}

          {/* Header bar — primary "+ 新建 Team" lives here too so the test
              that looks for `new-team-btn` finds it. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 18,
              marginBottom: 14,
            }}
          >
            <span className="hf-label">{t('team.workspaceLabel')} · {teams.length}</span>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="hf-btn"
              style={{ fontSize: 11 }}
              data-testid="new-team-btn"
            >
              {t('team.newTeam')}
            </button>
          </div>

          {loadStatus === 'loading' && (
            <p
              data-testid="team-loading"
              className="hf-meta"
              style={{ padding: '60px 0', textAlign: 'center', fontSize: 12 }}
            >
              {t('team.loading')}
            </p>
          )}

          {loadStatus === 'success' && teams.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                padding: '60px 0',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  border: '1px solid var(--t-border)',
                  background: 'var(--t-panel)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--t-accent)',
                }}
              >
                <Users size={32} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <p style={{ fontSize: 13, color: 'var(--t-fg-2)', margin: 0 }}>
                  {t('team.noTeamYet')}
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: 'var(--t-fg-4)',
                  }}
                >
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {teams.map((team) => (
                <div
                  key={team.team_id}
                  style={{
                    opacity: deletingId === team.team_id ? 0.5 : 1,
                    transition: 'opacity .15s',
                  }}
                  onClick={() => navigate(`/teams/${team.team_id}`)}
                >
                  <TeamCard team={team} onDelete={handleDelete} />
                </div>
              ))}
            </div>
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

interface LaneAvatar {
  g: string;
  n: string;
  c: string;
  sel?: boolean;
}
interface LaneData {
  n: string;
  a: LaneAvatar[];
}

/** Avatar colour palette for dynamically derived lanes. */
const LANE_COLORS = [
  'var(--t-accent)',
  'var(--t-run)',
  'var(--t-warn)',
  'var(--t-ok)',
  'var(--t-err)',
];

/**
 * Derive LaneData[] from a list of WorkflowNodes (when workflow exists),
 * or fall back to one-agent-per-lane from agent_ids.
 */
function deriveLanes(
  agentIds: string[],
  workflowNodes: TeamWorkflowNode[],
): LaneData[] {
  // If we have real workflow nodes with agent data, group by position (x-axis).
  if (workflowNodes.length > 0) {
    // Sort nodes left-to-right (by x position) and create one lane per node.
    const sorted = [...workflowNodes].sort((a, b) => a.position.x - b.position.x);
    return sorted.map((node, idx) => {
      const label = node.data.name || `Agent-${node.id.slice(0, 6)}`;
      const glyph = label.slice(0, 1);
      return {
        n: label.toUpperCase().slice(0, 10),
        a: [{
          g: glyph,
          n: label,
          c: LANE_COLORS[idx % LANE_COLORS.length],
        }],
      };
    });
  }

  // Fallback: one lane per agent_id.
  if (agentIds.length === 0) return [];
  return agentIds.map((id, idx) => ({
    n: `AGENT-${idx + 1}`,
    a: [{
      g: (idx + 1).toString(),
      n: `Agent-${id.slice(0, 6)}`,
      c: LANE_COLORS[idx % LANE_COLORS.length],
    }],
  }));
}

function LaneDiagram({ lanes }: { lanes: LaneData[] }) {
  return (
    <div
      className="hf-dotgrid"
      style={{
        flex: 1,
        padding: 18,
        overflow: 'auto',
        position: 'relative',
        minHeight: 360,
      }}
    >
      {lanes.map((lane) => (
        <div
          key={lane.n}
          style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}
        >
          <div
            style={{
              minWidth: 120,
              padding: '8px 12px',
              borderLeft: '3px solid var(--t-accent)',
              background: 'var(--t-panel)',
              border: '1px solid var(--t-border)',
              borderRadius: 6,
            }}
          >
            <div
              className="hf-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.12em',
                color: 'var(--t-fg-2)',
              }}
            >
              {lane.n}
            </div>
            <div className="hf-meta" style={{ fontSize: 9, marginTop: 2 }}>
              parallel · retry 3
            </div>
          </div>
          {lane.a.map((a, j, arr) => (
            <Fragment key={`${lane.n}-${a.n}`}>
              <div
                className="hf-card"
                style={{
                  width: 160,
                  padding: 10,
                  borderColor: a.sel ? 'var(--t-accent)' : 'var(--t-border)',
                  boxShadow: a.sel
                    ? '0 0 0 1px var(--t-accent), 0 0 16px -2px color-mix(in oklab, var(--t-accent) 40%, transparent)'
                    : 'none',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <HfAvatar
                  glyph={a.g}
                  color={a.c}
                  size={28}
                  status={lane.n === 'RESEARCH' ? 'run' : undefined}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.n}</div>
                  <div className="hf-meta" style={{ fontSize: 9, marginTop: 2 }}>
                    sonnet · L2
                  </div>
                </div>
              </div>
              {j < arr.length - 1 && (
                <span style={{ color: 'var(--t-fg-5)' }}>→</span>
              )}
            </Fragment>
          ))}
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          right: 18,
          display: 'flex',
          gap: 6,
        }}
      >
        <span className="hf-chip" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MousePointer2 size={11} strokeWidth={2} aria-hidden /> select
        </span>
        <span className="hf-chip" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Hand size={11} strokeWidth={2} aria-hidden /> pan
        </span>
        <span className="hf-chip" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ZoomIn size={11} strokeWidth={2} aria-hidden /> zoom
        </span>
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
  // Default tab matches Hi-Fi v2 spec — DAG is highlighted there.
  const [activeTab, setActiveTab] = useState<DetailTab>('dag');

  // Workflow nodes for the DAG lane diagram.
  const [workflowNodes, setWorkflowNodes] = useState<TeamWorkflowNode[]>([]);

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

  // 2026-05-11 bug fix — Rules of Hooks: 必须在所有早返 (loading / errorMsg)
  // 之前调用。原代码把 useMemo + useCallback 放在 if(loading) return 之后，
  // 第一次 render (loading=true) 时跳过 hook，第二次 (loading=false) 时执行，
  // hook count 不一致 → "Rendered more hooks than during the previous render"。
  // 两 hook 已是 null-safe (team?.agent_ids ?? [] / if(!teamId) return)，
  // 上提到此处不影响行为。
  const derivedLanes = useMemo(
    () => deriveLanes(team?.agent_ids ?? [], workflowNodes),
    [team?.agent_ids, workflowNodes],
  );
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
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
      }}
    >
      <HfTopBar
        right={
          <>
            <button
              type="button"
              className="hf-btn"
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Upload size={12} strokeWidth={2} aria-hidden /> {t('team.onchain')}
            </button>
            <button
              type="button"
              className="hf-btn hf-btn-pri"
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Play size={12} strokeWidth={2} aria-hidden /> {t('team.run')}
            </button>
          </>
        }
      />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          minHeight: 0,
        }}
      >
        <TeamListColumn
          teams={teamsForRail}
          activeId={team.team_id}
          onCreate={() => navigate('/teams')}
          onSelect={(id) => navigate(`/teams/${id}`)}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {/* Page header: back button + team name (always visible so the
              `detail-team-name` testid is independent of active tab). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 22px 6px',
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/teams')}
              className="hf-btn"
              style={{ fontSize: 11 }}
            >
              {t('team.backToTeams')}
            </button>
            <div style={{ minWidth: 0 }}>
              <h2
                data-testid="detail-team-name"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--t-fg)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {team.name}
              </h2>
              {team.description && (
                <p
                  className="hf-meta"
                  style={{ fontSize: 11, marginTop: 2, color: 'var(--t-fg-4)' }}
                >
                  {team.description}
                </p>
              )}
            </div>
          </div>

          {/* 5-tab strip — Hi-Fi v2 spec exact metrics. */}
          <div
            style={{
              display: 'flex',
              gap: 18,
              padding: '10px 22px 0',
              borderBottom: '1px solid var(--t-border)',
              background: 'var(--t-bg)',
            }}
          >
            {DETAIL_TABS.map((tab) => {
              const on = activeTab === tab;
              const tabLabel: Record<DetailTab, string> = {
                members: t('team.tabMembers'),
                policy: t('team.tabPolicyMatrix'),
                dag: t('team.tabWorkflowDAG'),
                activity: t('team.tabActivity'),
                dependency: t('team.tabDependency'),
              };
              return (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  data-testid={`team-detail-tab-${tab}`}
                  style={{
                    padding: '8px 2px',
                    fontSize: 12.5,
                    fontWeight: on ? 700 : 500,
                    color: on ? 'var(--t-accent)' : 'var(--t-fg-3)',
                    borderBottom: on
                      ? '2px solid var(--t-accent)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                    marginBottom: -1,
                    background: 'transparent',
                    border: 'none',
                    borderBottomStyle: 'solid',
                    borderBottomWidth: 2,
                    borderBottomColor: on ? 'var(--t-accent)' : 'transparent',
                  }}
                >
                  {tabLabel[tab]}
                </button>
              );
            })}
          </div>

          {/* Tab body */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
            }}
          >
            {activeTab === 'dag' && (
              derivedLanes.length > 0
                ? <LaneDiagram lanes={derivedLanes} />
                : (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--t-fg-4)',
                      fontSize: 12,
                      padding: 24,
                    }}
                  >
                    {t('team.noAgentsInDag')}
                  </div>
                )
            )}

            {activeTab === 'members' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <TeamDetail team={team} onTeamUpdated={setTeam} />
              </div>
            )}

            {activeTab === 'policy' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                {/* PolicyMatrixPanel is seeded with team-specific agents + policy
                    via usePolicyStore (setAgents / setMatrix) in the fetch effect
                    above. onSave persists the matrix to /api/teams/:teamId/policy. */}
                <PolicyMatrixPanel
                  readOnly={false}
                  onSave={handlePolicySave}
                />
              </div>
            )}

            {activeTab === 'activity' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <div className="hf-card" style={{ padding: 24 }}>
                  {t('team.comingSoon')}
                </div>
              </div>
            )}

            {activeTab === 'dependency' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <div className="hf-card" style={{ padding: 24 }}>
                  {t('team.comingSoon')}
                </div>
              </div>
            )}
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

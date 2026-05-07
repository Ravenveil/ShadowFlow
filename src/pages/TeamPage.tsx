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
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  deleteTeam,
  getTeam,
  listTeams,
  TeamApiError,
  type TeamRecord,
} from '../api/teams';
import { TeamCard } from '../core/components/team/TeamCard';
import { CreateTeamModal } from '../core/components/team/CreateTeamModal';
import { TeamDetail } from '../core/components/team/TeamDetail';
import { HfAvatar, HfTopBar } from '../components/hifi';
import { PolicyMatrixPanel } from '../core/components/Panel/PolicyMatrixPanel';

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
        <span className="hf-label">团队列表 · {teams.length}</span>
        <button
          type="button"
          className="hf-btn"
          style={{ fontSize: 10, padding: '3px 8px' }}
          onClick={onCreate}
          data-testid="new-team-btn"
        >
          + 新建
        </button>
      </div>
      {teams.length === 0 ? (
        <div className="hf-meta" style={{ padding: '8px 10px' }}>
          暂无团队
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
      const msg = err instanceof TeamApiError
        ? `加载失败（${err.status}）`
        : '加载失败，请刷新重试';
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, []);

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
      setTeams((prev) => prev.filter((t) => t.team_id !== teamId));
    } catch (err) {
      const msg = err instanceof TeamApiError
        ? `删除失败（${err.status}）`
        : '删除失败，请重试';
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
      <HfTopBar
        right={
          <button
            type="button"
            className="hf-btn hf-btn-pri"
            style={{ fontSize: 11 }}
            onClick={() => setShowModal(true)}
          >
            + 新建 Team
          </button>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>Teams</span>
            <span className="hf-meta">把 Agent 组织成团队，共同完成复杂任务</span>
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
            <span className="hf-label">官方 · 工作区</span>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="hf-btn"
              style={{ fontSize: 11 }}
              data-testid="new-team-btn"
            >
              + 新建 Team
            </button>
          </div>

          {loadStatus === 'loading' && (
            <p
              data-testid="team-loading"
              className="hf-meta"
              style={{ padding: '60px 0', textAlign: 'center', fontSize: 12 }}
            >
              加载中…
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
                  fontSize: 24,
                  color: 'var(--t-accent)',
                }}
              >
                ⊞
              </div>
              <div>
                <p style={{ fontSize: 13, color: 'var(--t-fg-2)', margin: 0 }}>
                  还没有 Team。
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: 'var(--t-fg-4)',
                  }}
                >
                  点击「+ 新建 Team」，把 Agent 组织起来。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                data-testid="empty-new-team-btn"
                className="hf-btn hf-btn-pri"
                style={{ fontSize: 12 }}
              >
                + 新建 Team
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

type DetailTab = '成员' | 'Policy Matrix' | '工作流 DAG' | '活动' | '依赖';

const DETAIL_TABS: DetailTab[] = ['成员', 'Policy Matrix', '工作流 DAG', '活动', '依赖'];

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

// Decorative placeholder lanes from Hi-Fi v2 spec. Real DAG hookup is a
// follow-up — when team.workflow exists we'd derive lanes from it.
const PLACEHOLDER_LANES: LaneData[] = [
  { n: 'PLAN',     a: [{ g: '查', n: 'researcher',     c: 'var(--t-run)' }] },
  { n: 'RESEARCH', a: [
      { g: '读', n: 'reader', c: 'var(--t-accent)' },
      { g: '查', n: 'cite',   c: 'var(--t-run)' },
    ] },
  { n: 'DRAFT',    a: [{ g: '写', n: 'section_writer', c: 'var(--t-accent)', sel: true }] },
  { n: 'REVIEW',   a: [
      { g: '审', n: 'advisor', c: 'var(--t-warn)' },
      { g: '阿', n: 'critic',  c: 'var(--t-warn)' },
    ] },
  { n: 'PUBLISH',  a: [{ g: '发', n: 'publisher', c: 'var(--t-ok)' }] },
];

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
        <span className="hf-chip" style={{ fontSize: 10 }}>⊟ select</span>
        <span className="hf-chip" style={{ fontSize: 10 }}>⊞ pan</span>
        <span className="hf-chip" style={{ fontSize: 10 }}>⊕ zoom</span>
      </div>
    </div>
  );
}

function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [allTeams, setAllTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Default tab matches Hi-Fi v2 spec — `工作流 DAG` is highlighted there.
  const [activeTab, setActiveTab] = useState<DetailTab>('工作流 DAG');

  // Fetch single team
  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setErrorMsg(null);
    getTeam(teamId)
      .then(setTeam)
      .catch((err) => {
        setErrorMsg(err instanceof TeamApiError ? `错误（${err.status}）` : '加载失败');
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  // Fetch all teams for the left column rail
  useEffect(() => {
    listTeams().then(setAllTeams).catch(() => {
      /* fall back to single-team display */
    });
  }, [teamId]);

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
        加载中…
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
        <p style={{ fontSize: 13 }}>{errorMsg ?? 'Team 未找到'}</p>
        <button
          type="button"
          onClick={() => navigate('/teams')}
          className="hf-btn"
          style={{ fontSize: 11 }}
        >
          ← 返回 Teams
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
            <button type="button" className="hf-btn" style={{ fontSize: 11 }}>
              ↗ 上链
            </button>
            <button type="button" className="hf-btn hf-btn-pri" style={{ fontSize: 11 }}>
              ▶ Run
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
              ← 返回 Teams
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
            {DETAIL_TABS.map((t) => {
              const on = activeTab === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setActiveTab(t)}
                  data-testid={`team-detail-tab-${t}`}
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
                  {t}
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
            {activeTab === '工作流 DAG' && <LaneDiagram lanes={PLACEHOLDER_LANES} />}

            {activeTab === '成员' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <TeamDetail team={team} onTeamUpdated={setTeam} />
              </div>
            )}

            {activeTab === 'Policy Matrix' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <PolicyMatrixPanel readOnly={false} />
              </div>
            )}

            {activeTab === '活动' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <div className="hf-card" style={{ padding: 24 }}>
                  暂未实现 · Coming soon
                </div>
              </div>
            )}

            {activeTab === '依赖' && (
              <div style={{ padding: '14px 22px 24px', minWidth: 0 }}>
                <div className="hf-card" style={{ padding: 24 }}>
                  暂未实现 · Coming soon
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

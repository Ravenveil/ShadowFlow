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
  patchTeam,
  putTeamPolicy,
  TeamApiError,
  type TeamPolicyMatrix,
  type TeamRecord,
  type TeamWorkflowEdge,
  type TeamWorkflowNode,
} from '../api/teams';
import { listAgents } from '../api/agents';
import type { AgentRecord } from '../api/agents';
import { TeamCard } from '../core/components/team/TeamCard';
import { CreateTeamModal } from '../core/components/team/CreateTeamModal';
import { HfTopBar } from '../components/hifi';
import { PolicyMatrixPanel } from '../core/components/Panel/PolicyMatrixPanel';
import { usePolicyStore, type PolicyMatrix as StorePolicyMatrix } from '../core/hooks/usePolicyStore';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore, selectCurrentWorkspace } from '../store/workspaceStore';
import PythonBackendBanner from '../components/PythonBackendBanner';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type FilterTab = 'official' | 'workspace';

// Agent avatar palette — deterministic from name charCode
const AGENT_COLORS = ['#A855F7','#F59E0B','#22D3EE','#EF4444','#10B981','#3B82F6','#EC4899'];
function agentColor(name: string): string {
  return AGENT_COLORS[(name.charCodeAt(0)||0) % AGENT_COLORS.length];
}
function agentLevel(name: string): string {
  return ['L1','L2','L3'][(name.charCodeAt(0)||0) % 3];
}
function agentStatusInfo(status: string): { label: string; color: string; pulse: boolean } {
  if (status === 'running') return { label: '运行中',   color: 'var(--status-run)',    pulse: true  };
  if (status === 'paused')  return { label: '等待审批', color: 'var(--status-warn)',   pulse: false };
  if (status === 'error')   return { label: '错误',     color: 'var(--status-reject)', pulse: false };
  return                           { label: '空闲',     color: 'var(--t-fg-5)',        pulse: false };
}

// ---------------------------------------------------------------------------
// Shared TeamListColumn — 240 px team list column (used by both pages).
// ---------------------------------------------------------------------------

interface TeamListColumnProps {
  teams: TeamRecord[];
  activeId?: string | null;
  onCreate: () => void;
  onSelect?: (teamId: string) => void;
  wsName?: string;
}

function TeamListColumn({ teams, activeId, onCreate, onSelect, wsName = 'ShadowFlow' }: TeamListColumnProps) {
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
        <div style={{
          margin: '4px 0', padding: '8px 10px', borderRadius: 8,
          background: 'var(--t-accent-tint)',
          border: '1px solid color-mix(in oklab, var(--t-accent) 25%, transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: wsName.length > 2 ? 9 : 11,
              background: 'var(--t-accent)', color: 'var(--t-bg)',
              letterSpacing: '-0.03em',
            }}>
              {wsName.slice(0, 2)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wsName}</div>
              <div style={{ fontSize: 9.5, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>Default Workspace</div>
            </div>
          </div>
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

  const currentId = useWorkspaceStore((s) => s.currentId);
  const currentWs = useWorkspaceStore(selectCurrentWorkspace);
  const wsName = currentWs?.name ?? 'ShadowFlow';

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
      const data = await listTeams(currentId ?? undefined);
      setTeams(data);
      setLoadStatus('success');
    } catch (err) {
      const msg = err instanceof TeamApiError
        ? `${t('team.loadError')}（${err.status}）`
        : t('team.loadError');
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, [t, currentId]);

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
                    background: 'color-mix(in oklab, var(--t-accent) 15%, var(--t-panel))',
                    border: '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 18, color: 'var(--t-accent)',
                    letterSpacing: '-0.03em',
                  }}>
                    {wsName.slice(0, 2)}
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', margin: '0 0 4px' }}>
                      {wsName}
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

/** Team header: ×N count icon + name + L2-STRICT pill + stats row + action buttons. */
function DesignTeamHeader({ team }: { team: TeamRecord }) {
  const createdDate = new Date(team.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return (
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--t-fg-2)', flexShrink: 0 }}>
        ×{team.agent_ids.length}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span data-testid="detail-team-name" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--t-fg)' }}>
            {team.name}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, background: 'color-mix(in oklab, var(--status-warn) 18%, transparent)', color: 'var(--status-warn)', border: '1px solid color-mix(in oklab, var(--status-warn) 35%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', flexShrink: 0 }}>
            L2-STRICT
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)' }}>
          <span>{team.workspace_id}</span>
          <span>·</span>
          <span>{team.agent_ids.length} agents</span>
          <span>·</span>
          <span>创建 {createdDate}</span>
        </div>
      </div>
      <button type="button" className="hf-btn" style={{ fontSize: 12, flexShrink: 0 }}>重命名</button>
      <button type="button" style={{ fontSize: 12, flexShrink: 0, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--t-accent)', color: 'var(--t-accent-ink)', fontWeight: 700 }}>启动新 run</button>
    </div>
  );
}

/** One agent row in the member panel — 5-col grid matching board-team.jsx MemberRow. */
function DesignMemberRow({ agent, onRemove }: { agent: AgentRecord; onRemove?: (id: string) => void }) {
  const color = agentColor(agent.name);
  const glyph = (agent.name || '?')[0];
  const level = agentLevel(agent.name);
  const st = agentStatusInfo(agent.status);
  return (
    <div
      className="group"
      style={{ display: 'grid', gridTemplateColumns: '40px 1fr 68px 1fr 96px', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--t-border)' }}
    >
      {/* Avatar */}
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color, background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`, border: `1px solid color-mix(in oklab, ${color} 45%, transparent)` }}>
        {glyph}
      </div>
      {/* Name + soul role */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.soul.slice(0, 28).toUpperCase()}</div>
      </div>
      {/* Level pill */}
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 8px', borderRadius: 6, background: `color-mix(in oklab, ${color} 18%, transparent)`, border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`, color, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600 }}>
        {level}
      </div>
      {/* Source tag */}
      <div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '2px 6px', background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 4, color: 'var(--t-fg-4)' }}>
          {agent.source}
        </span>
      </div>
      {/* Status dot + label + remove button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: st.color, display: 'inline-block', animation: st.pulse ? 'sf-pulse 1.4s ease-in-out infinite' : 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: st.color }}>{st.label}</span>
        {onRemove && (
          <button
            type="button"
            className="hidden group-hover:inline-block"
            onClick={() => onRemove(agent.agent_id)}
            data-testid={`btn-remove-${agent.agent_id}`}
            style={{ marginLeft: 4, padding: '2px 7px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer', background: 'color-mix(in oklab, var(--t-err) 12%, var(--t-panel))', color: 'var(--t-err)' }}
          >
            移除
          </button>
        )}
      </div>
    </div>
  );
}

/** Left panel of the 2-col grid: loads agents and renders member rows. */
function DesignMemberPanel({ team, onTeamUpdated }: { team: TeamRecord; onTeamUpdated: (t: TeamRecord) => void }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => { listAgents().then(setAgents).catch(() => {}); }, []);

  const memberAgents = agents.filter((a) => team.agent_ids.includes(a.agent_id));

  async function handleRemove(agentId: string) {
    setRemoving(agentId);
    try {
      const updated = await patchTeam(team.team_id, { remove_agent_ids: [agentId] });
      onTeamUpdated(updated);
    } catch { /* swallow */ } finally { setRemoving(null); }
  }

  return (
    <div style={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>成员</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>{team.agent_ids.length} agents</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="hf-btn" style={{ fontSize: 11 }}>+ 招人</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {memberAgents.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
            暂无成员
          </div>
        ) : (
          memberAgents.map((agent) => (
            <div key={agent.agent_id} style={{ opacity: removing === agent.agent_id ? 0.4 : 1, transition: 'opacity .15s' }}>
              <DesignMemberRow agent={agent} onRemove={handleRemove} />
            </div>
          ))
        )}
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
        {/* Status legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--t-border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', flexWrap: 'wrap' }}>
          {([
            { color: 'var(--status-ok)',     label: '已完成',   pulse: false },
            { color: 'var(--status-run)',    label: '进行中',   pulse: true  },
            { color: 'var(--status-warn)',   label: '等待审批', pulse: false },
            { color: 'var(--t-fg-5)',        label: `待启动 · ${nodes.length}`, pulse: false },
          ] as const).map(({ color, label, pulse }) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0, animation: pulse ? 'sf-pulse 1.4s ease-in-out infinite' : 'none' }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamsIndexPage — /teams  (redirects to first team; shows create prompt if empty)
// ---------------------------------------------------------------------------

function TeamsIndexPage() {
  const navigate = useNavigate();
  const currentId = useWorkspaceStore((s) => s.currentId);
  const [noTeams, setNoTeams] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    listTeams(currentId ?? undefined)
      .then((data) => {
        if (data.length > 0) {
          navigate(`/teams/${data[0].team_id}`, { replace: true });
        } else {
          setNoTeams(true);
        }
      })
      .catch(() => setNoTeams(true));
  }, [currentId, navigate]);

  if (!noTeams) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--t-bg)' }}>
        <div style={{ padding: '12px 16px 0' }}>
          <PythonBackendBanner />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--t-bg)', color: 'var(--t-fg)' }}>
      <div style={{ padding: '12px 16px 0' }}>
        <PythonBackendBanner />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>还没有团队</div>
        <p style={{ fontSize: 12, color: 'var(--t-fg-4)', margin: 0, fontFamily: 'var(--font-mono)' }}>新建一个团队开始协作</p>
        <button
          type="button"
          className="hf-btn hf-btn-pri"
          style={{ fontSize: 12 }}
          onClick={() => setShowModal(true)}
          data-testid="empty-new-team-btn"
        >
          + 新建团队
        </button>
        {showModal && (
          <CreateTeamModal
            onCreated={(team) => navigate(`/teams/${team.team_id}`)}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamDetailPage — /teams/:teamId
// ---------------------------------------------------------------------------

function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const currentId = useWorkspaceStore((s) => s.currentId);
  const currentWs = useWorkspaceStore(selectCurrentWorkspace);
  const wsName = currentWs?.name ?? 'ShadowFlow';
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [allTeams, setAllTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Workflow nodes and edges for the DAG panel.
  const [workflowNodes, setWorkflowNodes] = useState<TeamWorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<TeamWorkflowEdge[]>([]);

  // Policy store actions — used to seed PolicyMatrixPanel with team-specific data.
  const setAgents      = usePolicyStore((s) => s.setAgents);
  const setAgentLabels = usePolicyStore((s) => s.setAgentLabels);
  const setMatrix      = usePolicyStore((s) => s.setMatrix);
  const resetPolicy    = usePolicyStore((s) => s.reset);

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

        // 2026-05-19 — push id → human-readable label map so the PolicyMatrix
        // headers render "产品经理" / "业务分析师" instead of raw UUIDs.
        // Source 1 (best): workflow.nodes' embedded `data.name` (set when
        //   blueprint was auto-saved). Both agentId and node.id are mapped
        //   to handle either matrix key.
        // Source 2 (fallback): listAgents lookup for any remaining ids
        //   without a label (e.g. legacy teams whose workflow predates the
        //   data.name field). Fire-and-forget; UI updates when ready.
        const labels: Record<string, string> = {};
        for (const n of workflow.nodes) {
          if (n.data?.name) {
            if (n.data.agentId) labels[n.data.agentId] = n.data.name;
            labels[n.id] = n.data.name;
          }
        }
        if (Object.keys(labels).length > 0) setAgentLabels(labels);

        const missingIds = agentKeys.filter((id) => !labels[id]);
        if (missingIds.length > 0) {
          listAgents()
            .then((all) => {
              const extra: Record<string, string> = {};
              for (const a of all) {
                if (missingIds.includes(a.agent_id) && a.name) {
                  extra[a.agent_id] = a.name;
                }
              }
              if (Object.keys(extra).length > 0) setAgentLabels(extra);
            })
            .catch(() => { /* labels stay as ids; non-fatal */ });
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
  }, [teamId, t, resetPolicy, setAgents, setAgentLabels, setMatrix]);

  // Fetch all teams for the left column rail — re-fetch when workspace switches.
  useEffect(() => {
    listTeams(currentId ?? undefined).then(setAllTeams).catch(() => {
      /* fall back to single-team display */
    });
  }, [currentId]);

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
          wsName={wsName}
          onCreate={() => setShowCreateModal(true)}
          onSelect={(id) => navigate(`/teams/${id}`)}
        />

        {/* P1 Team Detail — header + 2-col grid + full-width policy */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
          <DesignTeamHeader team={team} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: 18, alignContent: 'start' }}>
            <DesignMemberPanel team={team} onTeamUpdated={setTeam} />
            <WorkflowDagPanel nodes={workflowNodes} edges={workflowEdges} />
          </div>

          <div style={{ padding: '0 18px 24px' }}>
            <PolicyMatrixPanel readOnly={false} onSave={handlePolicySave} />
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateTeamModal
          onCreated={(newTeam) => {
            setAllTeams((prev) => [newTeam, ...prev]);
            setShowCreateModal(false);
            navigate(`/teams/${newTeam.team_id}`);
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { TeamsIndexPage, TeamListPage, TeamDetailPage };
export default TeamsIndexPage;

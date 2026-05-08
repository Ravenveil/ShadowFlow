/**
 * TeamDetail — Story 12.2 AC5 + Story 12-3 (3-tab: 成员 / 工作流 / 权责)
 *
 * 显示 Team 成员列表（AgentCard 缩略形式）。
 * 支持"添加成员"和"移除成员"操作。
 * 每个成员卡片点击可跳转到对应 Agent 详情页。
 */
import { ReactFlowProvider } from 'reactflow';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAgents } from '../../../api/agents';
import { patchTeam } from '../../../api/teams';
import type { AgentRecord } from '../../../api/agents';
import type { TeamRecord } from '../../../api/teams';
import { TeamWorkflowEditor } from './TeamWorkflowEditor';
import { TeamPolicyPanel } from './TeamPolicyPanel';

type TabType = 'members' | 'workflow' | 'policy';

interface TeamDetailProps {
  team: TeamRecord;
  onTeamUpdated: (team: TeamRecord) => void;
}

export function TeamDetail({ team, onTeamUpdated }: TeamDetailProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('members');
  const [allAgents, setAllAgents] = useState<AgentRecord[]>([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedAddIds, setSelectedAddIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await listAgents();
      setAllAgents(data);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const memberAgents = allAgents.filter((a) => team.agent_ids.includes(a.agent_id));
  const nonMemberAgents = allAgents.filter((a) => !team.agent_ids.includes(a.agent_id));

  async function handleRemoveMember(agentId: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchTeam(team.team_id, { remove_agent_ids: [agentId] });
      onTeamUpdated(updated);
    } catch {
      setSaveError('移除失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMembers() {
    if (selectedAddIds.size === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchTeam(team.team_id, {
        add_agent_ids: Array.from(selectedAddIds),
      });
      onTeamUpdated(updated);
      setShowAddPanel(false);
      setSelectedAddIds(new Set());
    } catch {
      setSaveError('添加失败，请重试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="team-detail">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white/90" data-testid="detail-team-name">
            {team.name}
          </h2>
          {team.description && (
            <p className="mt-0.5 text-[12px] text-white/50">{team.description}</p>
          )}
        </div>
        {activeTab === 'members' && (
          <button
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="rounded border border-shadowflow-border px-3 py-1.5 text-[12px] text-white/60 hover:text-white/90"
            data-testid="btn-add-member"
          >
            + 添加成员
          </button>
        )}
      </div>

      {/* Tab 栏 */}
      <div className="flex gap-1 border-b border-shadowflow-border mb-4">
        {(['members', 'workflow', 'policy'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[12px] font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-white/70 text-white/90'
                : 'text-white/40 hover:text-white/60'
            }`}
            data-testid={`tab-${tab}`}
          >
            {tab === 'members' ? '成员' : tab === 'workflow' ? '工作流' : '权责'}
          </button>
        ))}
      </div>

      {saveError && (
        <p className="text-[11px] text-red-400" data-testid="detail-error">
          {saveError}
        </p>
      )}

      {/* Tab 内容 */}
      {activeTab === 'members' && (
        <>
          {/* Add members panel */}
          {showAddPanel && (
            <div className="rounded border border-shadowflow-border bg-white/[0.02] p-4">
              <p className="mb-2 text-[11px] text-white/50">选择要添加的 Agent：</p>
              {nonMemberAgents.length === 0 ? (
                <p className="text-[11px] text-white/30">没有可添加的 Agent。</p>
              ) : (
                <div className="flex flex-col gap-1.5" data-testid="add-member-list">
                  {nonMemberAgents.map((agent) => {
                    const selected = selectedAddIds.has(agent.agent_id);
                    return (
                      <label
                        key={agent.agent_id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-white/5"
                        data-testid={`add-agent-option-${agent.agent_id}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setSelectedAddIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(agent.agent_id)) next.delete(agent.agent_id);
                              else next.add(agent.agent_id);
                              return next;
                            });
                          }}
                          className="accent-white"
                        />
                        <span className="text-white/80">{agent.name}</span>
                        <span className="text-white/30">—</span>
                        <span className="truncate text-white/40">
                          {agent.soul.length > 40 ? agent.soul.slice(0, 40) + '…' : agent.soul}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleAddMembers}
                  disabled={selectedAddIds.size === 0 || saving}
                  className="rounded border border-white/20 bg-white/5 px-3 py-1 text-[12px] text-white/70 hover:bg-white/10 disabled:opacity-40"
                  data-testid="btn-confirm-add"
                >
                  确认添加 {selectedAddIds.size > 0 ? `(${selectedAddIds.size})` : ''}
                </button>
                <button
                  onClick={() => { setShowAddPanel(false); setSelectedAddIds(new Set()); }}
                  className="rounded border border-shadowflow-border px-3 py-1 text-[12px] text-white/40 hover:text-white/70"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Member list */}
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
              成员 · {team.agent_ids.length}
            </p>
            {team.agent_ids.length === 0 ? (
              <p className="text-[12px] text-white/30" data-testid="no-members-hint">
                还没有成员，点击"添加成员"。
              </p>
            ) : (
              <div className="flex flex-col gap-2" data-testid="member-list">
                {team.agent_ids.map((agentId) => {
                  const agent = allAgents.find((a) => a.agent_id === agentId);
                  return (
                    <div
                      key={agentId}
                      className="group flex items-center justify-between rounded border border-shadowflow-border bg-shadowflow-surface px-3 py-2.5"
                      data-testid={`member-card-${agentId}`}
                    >
                      <button
                        onClick={() => navigate(`/builder?agent_id=${agentId}`)}
                        className="flex items-center gap-2 text-left"
                        aria-label={`查看 Agent ${agent?.name ?? agentId}`}
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px]">
                          {agent ? agent.name.charAt(0).toUpperCase() : '?'}
                        </span>
                        <div>
                          <p className="text-[13px] font-medium text-white/90">
                            {agent?.name ?? agentId}
                          </p>
                          {agent && (
                            <p className="text-[11px] text-white/40">
                              {agent.soul.length > 40 ? agent.soul.slice(0, 40) + '…' : agent.soul}
                            </p>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleRemoveMember(agentId)}
                        disabled={saving}
                        className="hidden text-[11px] text-white/30 hover:text-red-400 group-hover:block"
                        aria-label={`移除 ${agent?.name ?? agentId}`}
                        data-testid={`btn-remove-${agentId}`}
                      >
                        移除
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'workflow' && (
        <ReactFlowProvider>
          <TeamWorkflowEditor
            team={team}
            agents={memberAgents}
          />
        </ReactFlowProvider>
      )}

      {activeTab === 'policy' && (
        <TeamPolicyPanel
          team={team}
          memberAgents={memberAgents}
        />
      )}
    </div>
  );
}

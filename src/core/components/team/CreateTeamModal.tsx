/**
 * CreateTeamModal — Story 12.2 AC2, AC3, AC4
 *
 * 2-step wizard:
 *   Step 1: Team 名字 + 描述
 *   Step 2: 从 Agent 列表选择成员（至少 1 个）
 */
import { useCallback, useEffect, useState } from 'react';
import { listAgents } from '../../../api/agents';
import { createTeam } from '../../../api/teams';
import type { AgentRecord } from '../../../api/agents';
import type { TeamRecord } from '../../../api/teams';

interface CreateTeamModalProps {
  onCreated: (team: TeamRecord) => void;
  onClose: () => void;
}

export function CreateTeamModal({ onCreated, onClose }: CreateTeamModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Step 2 state
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const data = await listAgents();
      setAgents(data);
    } catch {
      // non-fatal — user sees empty list
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2) fetchAgents();
  }, [step, fetchAgents]);

  function handleNextStep() {
    if (!name.trim()) {
      setNameError('Team 名字不能为空');
      return;
    }
    setNameError(null);
    setStep(2);
  }

  function toggleAgent(agentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  async function handleSubmit() {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const team = await createTeam({
        name: name.trim(),
        description: description.trim(),
        agent_ids: Array.from(selectedIds),
      });
      onCreated(team);
      onClose();
    } catch {
      setSubmitError('创建失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="create-team-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-sf border border-shadowflow-border bg-shadowflow-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-shadowflow-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              Step {step} / 2
            </p>
            <h2 className="text-base font-semibold text-white/90">
              {step === 1 ? '新建 Team' : '选择成员'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80"
            aria-label="关闭"
            data-testid="modal-close-btn"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
                  Team 名字 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(null); }}
                  placeholder="例：论文实验室"
                  maxLength={120}
                  data-testid="field-team-name"
                  className="w-full rounded border border-shadowflow-border bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                />
                {nameError && (
                  <p className="mt-1 text-[11px] text-red-400" data-testid="name-error">
                    {nameError}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
                  描述（可选）
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例：负责论文全流程：复现 + 写作 + 校正"
                  rows={3}
                  maxLength={500}
                  data-testid="field-team-description"
                  className="w-full resize-none rounded border border-shadowflow-border bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-[12px] text-white/50">
                选择至少 1 个 Agent 加入 Team。已选：{selectedIds.size}
              </p>
              {agentsLoading ? (
                <p className="py-6 text-center text-[12px] text-white/40">加载中…</p>
              ) : agents.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-white/40" data-testid="no-agents-hint">
                  暂无 Agent — 请先在 Agent 页创建。
                </p>
              ) : (
                <div
                  className="flex max-h-64 flex-col gap-2 overflow-y-auto"
                  data-testid="agent-selection-list"
                >
                  {agents.map((agent) => {
                    const selected = selectedIds.has(agent.agent_id);
                    return (
                      <label
                        key={agent.agent_id}
                        className={[
                          'flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 transition-colors',
                          selected
                            ? 'border-white/30 bg-white/10'
                            : 'border-shadowflow-border bg-transparent hover:bg-white/[0.03]',
                        ].join(' ')}
                        data-testid={`agent-option-${agent.agent_id}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAgent(agent.agent_id)}
                          className="h-3.5 w-3.5 accent-white"
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-medium text-white/90">{agent.name}</span>
                          <span className="text-[11px] text-white/40">
                            {agent.soul.length > 50 ? agent.soul.slice(0, 50) + '…' : agent.soul}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Selected members sidebar hint */}
              {selectedIds.size > 0 && (
                <div className="mt-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                    已选成员
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {agents
                      .filter((a) => selectedIds.has(a.agent_id))
                      .map((a) => (
                        <span
                          key={a.agent_id}
                          className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/70"
                        >
                          {a.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {submitError && (
                <p className="mt-3 text-[11px] text-red-400" data-testid="submit-error">
                  {submitError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-shadowflow-border px-6 py-4">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="rounded border border-shadowflow-border px-4 py-1.5 text-sm text-white/60 hover:text-white/90"
              data-testid="btn-back"
            >
              返回
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded border border-shadowflow-border px-4 py-1.5 text-sm text-white/60 hover:text-white/90"
            data-testid="btn-cancel"
          >
            取消
          </button>
          {step === 1 ? (
            <button
              onClick={handleNextStep}
              disabled={!name.trim()}
              data-testid="btn-next-step"
              className="rounded border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={selectedIds.size === 0 || submitting}
              data-testid="btn-create-team"
              className="rounded border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? '创建中…' : '创建 Team'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

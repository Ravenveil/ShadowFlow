/**
 * CreateAgentModal — Story 12.1 AC1/AC2/AC4/AC6
 *
 * Two-tab modal:
 *   「自建」 — Name + Soul quick form (default)
 *   「从 Catalog 安装」 — placeholder pointing to Story 12.5
 *
 * On submit: POST /api/agents, calls onCreated with the new agent record.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickCreateAgent, AgentApiError } from '../../../api/agents';
import type { AgentRecord } from '../../../api/agents';
import { createWorkspace } from '../../../api/workspaces';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { CatalogInstallTab } from './CatalogInstallTab';

type Tab = 'quick' | 'catalog';

/**
 * 2026-05-31 — 新 agent 的归属选择。existing=放进某个已有工作区(下拉选具体哪个,
 * 默认当前);new=新建一个工作区(= 组建一个新团队空间)再把 agent 放进去。
 *
 * 显式询问、不静默落 `default`:此前由 agent/run-session 创建的 agent 因 caller 没传
 * workspace_id 而落到 "default" 工作区、在用户工作区里「创建了却找不到」(根因见
 * 后端 agents.py POST 默认 workspace_id="default")。强制在创建口选工作区杜绝孤儿。
 */
type WsChoice = 'existing' | 'new';

interface CreateAgentModalProps {
  onCreated: (agent: AgentRecord) => void;
  onClose: () => void;
  /** Called after a catalog pack is successfully installed. Parent should re-fetch agent list. */
  onCatalogInstalled?: () => void;
}

export function CreateAgentModal({ onCreated, onClose, onCatalogInstalled }: CreateAgentModalProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('quick');
  const [name, setName] = useState('');
  const [soul, setSoul] = useState('');
  // 工作区归属:放进某个已有工作区(选具体哪个)/ 新建工作区。
  const [wsChoice, setWsChoice] = useState<WsChoice>('existing');
  const [targetWsId, setTargetWsId] = useState<string>('');
  const [newWsName, setNewWsName] = useState('');
  const currentId = useWorkspaceStore((s) => s.currentId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  // Ensure the workspace list is loaded (the select needs it) and default the
  // selected target to the current workspace.
  useEffect(() => {
    if (workspaces.length === 0) void fetchWorkspaces();
  }, [workspaces.length, fetchWorkspaces]);
  useEffect(() => {
    if (!targetWsId && currentId) setTargetWsId(currentId);
  }, [currentId, targetWsId]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameValid = name.trim().length > 0;
  const soulValid = soul.trim().length > 0;
  const canSubmit = nameValid && soulValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // 归属工作区:新建则先 POST 创建 workspace、切过去、用其 id;否则用下拉选中的
      // 已有工作区(兜底当前)。绝不静默落 "default"。
      let wsId: string | undefined;
      if (wsChoice === 'new') {
        const wsName = newWsName.trim();
        if (!wsName) {
          setError('请填写新工作区名称');
          setSubmitting(false);
          return;
        }
        const ws = await createWorkspace({ name: wsName });
        wsId = ws.workspace_id;
        switchTo(ws.workspace_id);
        void fetchWorkspaces();
      } else {
        wsId = targetWsId || currentId || undefined;
        if (!wsId) {
          setError('请选择一个工作区');
          setSubmitting(false);
          return;
        }
      }
      const agent = await quickCreateAgent({ name: name.trim(), soul: soul.trim(), workspace_id: wsId });
      onCreated(agent);
      onClose();
    } catch (err) {
      if (err instanceof AgentApiError) {
        setError(`创建失败（${err.status}）：${err.code}`);
      } else {
        setError('网络异常，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleAdvancedCreate() {
    // 2026-05-20 — /builder 已下架，"高级创建"统一回到 /start
    // 让用户通过 Skill Pack 起一个含目标 Agent 的完整团队流。
    onClose();
    navigate('/start');
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="新建 Agent"
    >
      <div className="relative w-full max-w-lg rounded-sf border border-shadowflow-border bg-shadowflow-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white/90">新建 Agent</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-white/40 hover:text-white/70"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mt-4 flex gap-1 rounded-lg bg-white/5 p-1">
          {([['quick', '自建'], ['catalog', '从 Catalog 安装']] as [Tab, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setTab(value); setError(null); }}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                tab === value
                  ? 'bg-white/10 text-white/90'
                  : 'text-white/40 hover:text-white/60'
              }`}
              data-testid={`tab-${value}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Quick Hire */}
        {tab === 'quick' && (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-white/60" htmlFor="agent-name">
                名字 <span className="text-red-400">*</span>
              </label>
              <input
                id="agent-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：论文复现助手"
                maxLength={100}
                required
                className="rounded border border-shadowflow-border bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/25 outline-none focus:border-white/30 focus:ring-0"
                data-testid="agent-name-input"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-white/60" htmlFor="agent-soul">
                角色描述（Soul）<span className="text-red-400">*</span>
              </label>
              <textarea
                id="agent-soul"
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                placeholder="描述这个 Agent 的职责和行事风格，例：你是一名严谨的科研助理，擅长复现 arXiv 论文中的实验..."
                rows={4}
                maxLength={2000}
                required
                className="resize-none rounded border border-shadowflow-border bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/25 outline-none focus:border-white/30"
                data-testid="agent-soul-input"
              />
            </div>

            {/* 2026-05-31 — 工作区归属选择(加入默认 / 新建) */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-white/60">放到哪个工作区？</label>
              <div className="flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-start gap-2 rounded border border-shadowflow-border bg-white/[0.02] px-3 py-2 text-sm hover:bg-white/5">
                  <input
                    type="radio"
                    name="ws-choice"
                    checked={wsChoice === 'existing'}
                    onChange={() => setWsChoice('existing')}
                    className="mt-0.5"
                    data-testid="ws-choice-existing"
                  />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="text-white/90">放进已有工作区</span>
                    {wsChoice === 'existing' && (
                      <select
                        value={targetWsId}
                        onChange={(e) => setTargetWsId(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border border-shadowflow-border bg-white/5 px-2.5 py-1.5 text-sm text-white/90 outline-none focus:border-white/30"
                        data-testid="ws-existing-select"
                      >
                        {workspaces.length === 0 && (
                          <option value="">（加载中…）</option>
                        )}
                        {workspaces.map((w) => (
                          <option key={w.workspace_id} value={w.workspace_id}>
                            {w.name}
                            {w.workspace_id === currentId ? '（当前）' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-shadowflow-border bg-white/[0.02] px-3 py-2 text-sm hover:bg-white/5">
                  <input
                    type="radio"
                    name="ws-choice"
                    checked={wsChoice === 'new'}
                    onChange={() => setWsChoice('new')}
                    className="mt-0.5"
                    data-testid="ws-choice-new"
                  />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="text-white/90">新建一个工作区</span>
                    {wsChoice === 'new' && (
                      <input
                        type="text"
                        value={newWsName}
                        onChange={(e) => setNewWsName(e.target.value)}
                        placeholder="新工作区名称，例：开发团队"
                        maxLength={40}
                        className="rounded border border-shadowflow-border bg-white/5 px-2.5 py-1.5 text-sm text-white/90 placeholder-white/25 outline-none focus:border-white/30"
                        data-testid="ws-new-name-input"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </span>
                </label>
              </div>
            </div>

            {/* Advanced settings (collapsed by default) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60"
              >
                <span>{showAdvanced ? '▲' : '▼'}</span>
                <span>高级配置</span>
              </button>
              {showAdvanced && (
                <div className="mt-2 rounded border border-shadowflow-border bg-white/[0.02] px-4 py-3 text-xs text-white/50">
                  工具权限、层级配置等高级选项请使用
                  <button
                    type="button"
                    onClick={handleAdvancedCreate}
                    className="ml-1 text-blue-400 underline hover:text-blue-300"
                  >
                    Builder 完整流程
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAdvancedCreate}
                className="text-xs text-white/40 hover:text-white/60"
              >
                高级创建 →
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-shadowflow-border px-4 py-2 text-sm text-white/60 hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="create-agent-submit"
                >
                  {submitting ? '创建中…' : '创建'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab: Catalog Install */}
        {tab === 'catalog' && (
          <div className="mt-5">
            <CatalogInstallTab
              onInstalled={(_agentId, packName) => {
                console.info(`[Catalog] Installed pack: ${packName}`);
                onCatalogInstalled?.();  // trigger parent re-fetch so new agent appears
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateAgentModal;

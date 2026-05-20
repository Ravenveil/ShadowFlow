/**
 * CreateAgentModal — Story 12.1 AC1/AC2/AC4/AC6
 *
 * Two-tab modal:
 *   「自建」 — Name + Soul quick form (default)
 *   「从 Catalog 安装」 — placeholder pointing to Story 12.5
 *
 * On submit: POST /api/agents, calls onCreated with the new agent record.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickCreateAgent, AgentApiError } from '../../../api/agents';
import type { AgentRecord } from '../../../api/agents';
import { CatalogInstallTab } from './CatalogInstallTab';

type Tab = 'quick' | 'catalog';

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
      const agent = await quickCreateAgent({ name: name.trim(), soul: soul.trim() });
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

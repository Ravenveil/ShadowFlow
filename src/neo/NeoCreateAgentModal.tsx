/**
 * NeoCreateAgentModal — Neo 化「新建 Agent」模态（W2-F A14/B27）。
 *
 * ClawsGO a_002 形态简化版：遮罩 + 白卡 r16，标题 / 名称输入 / 取消 + 创建
 * 主钮（创建中 Loader2 + 禁用态）。帧里的 2×2 营销特性网格不做。
 *
 * 提交走真实 POST /api/agents（quickCreateAgent，src/api/agents.ts）：
 * 后端 QuickCreateRequest 契约要求 name + soul（min_length=1），soul 即
 * persona —— 模态只有名称输入，故 soul 暂传同名（用户后续可在 Agent
 * 详情里补 persona）；不发明契约外字段。成功 → onCreated（父级刷新列表
 * 并选中新 agent）；失败 → 模态内红条展示真实错误，不吞不假成功。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AgentApiError, quickCreateAgent } from '../api/agents';
import { useI18n } from '../common/i18n';

export interface NeoCreateAgentModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (agent: { agent_id: string; name: string }) => void;
}

/** 从 AgentApiError 的 detail 里提取后端真实 message，拿不到就退回 err.message。 */
function errorMessageOf(err: unknown): string {
  if (err instanceof AgentApiError) {
    const d = err.detail;
    if (d && typeof d === 'object') {
      const inner = (d as Record<string, unknown>).error;
      if (inner && typeof inner === 'object') {
        const msg = (inner as Record<string, unknown>).message;
        if (typeof msg === 'string' && msg) return msg;
      }
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function NeoCreateAgentModal({ workspaceId, onClose, onCreated }: NeoCreateAgentModalProps) {
  const { t, language } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc 关闭（创建中禁用，避免请求悬在空中时用户误以为已取消）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function handleCreate() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    try {
      const agent = await quickCreateAgent({
        name: n,
        soul: n,
        workspace_id: workspaceId ?? undefined,
      });
      onCreated({ agent_id: agent.agent_id, name: agent.name || n });
    } catch (err) {
      setError(errorMessageOf(err));
      setBusy(false);
    }
  }

  return (
    <div
      className="neo-modal-mask"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="neo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('neo.newAgent.title', {
          defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent',
        })}
        onClick={(e) => e.stopPropagation()}
        data-testid="neo-create-agent-modal"
      >
        <h2 className="neo-modal-title">
          {t('neo.newAgent.title', { defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent' })}
        </h2>
        <label className="neo-modal-label" htmlFor="neo-new-agent-name">
          {t('neo.newAgent.nameLabel', { defaultValue: language === 'zh' ? '名称' : 'Name' })}
        </label>
        <input
          id="neo-new-agent-name"
          className="neo-modal-input"
          value={name}
          autoFocus
          maxLength={100}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
          placeholder={t('neo.newAgent.namePlaceholder', {
            defaultValue: language === 'zh' ? '我的 Agent' : 'My Agent',
          })}
        />
        {error && (
          <div className="neo-modal-error" role="alert" data-testid="neo-create-agent-error">
            {error}
          </div>
        )}
        <div className="neo-modal-actions">
          <button
            type="button"
            className="neo-modal-cancel"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.cancel', { defaultValue: language === 'zh' ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            className="neo-btn-primary"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || busy}
            data-testid="neo-create-agent-submit"
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
            {busy
              ? t('neo.newAgent.creating', { defaultValue: language === 'zh' ? '创建中…' : 'Creating…' })
              : t('neo.newAgent.create', { defaultValue: language === 'zh' ? '创建' : 'Create' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoCreateAgentModal;

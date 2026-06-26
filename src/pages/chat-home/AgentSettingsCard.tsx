// src/pages/chat-home/AgentSettingsCard.tsx
// 2026-06-24 — 从 PersonalRightPane 抽出，让「人设/详情」可在中栏 DM 头部点开复用
// （对齐 ClawsGO：右栏纯工作台、人设=agent 详情留在会话头部）。
import { useState, type ReactNode } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import { patchAgent, type AgentRecord } from '../../api/agents';

/** 设定卡里的分段标题。 */
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-fg-5)', marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * 设定卡 — 该 agent 的「人设/详情」（对标 Cherry Studio 助手面板）：
 *   头像 + 名字 + 模型徽章 · 系统 Prompt 全文 · 工具/知识库 chips。
 * 模型/工具藏在 agent.blueprint（QuickCreateRequest.model/tools 落库处）。
 *
 * `onAgentUpdated` — soul 保存成功后回调父组件刷新 selected agent state。
 */
export function AgentSettingsCard({
  agent,
  onAgentUpdated,
}: {
  agent: AgentRecord;
  onAgentUpdated?: (updated: AgentRecord) => void;
}) {
  const bp = (agent.blueprint ?? {}) as Record<string, unknown>;
  const model = typeof bp.model === 'string' && bp.model.trim() ? bp.model.trim() : null;
  const tools = Array.isArray(bp.tools)
    ? (bp.tools as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const soul = (agent.soul ?? '').trim();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    setDraft(soul);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchAgent(agent.agent_id, { soul: draft });
      setEditing(false);
      onAgentUpdated?.(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 头部：头像 + 名字 + 模型徽章 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
        <HfAvatar glyph={Array.from(agent.name)[0] ?? '?'} color={agent.avatar_color ?? 'var(--t-accent)'} size={72} />
        <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</div>
        {model && (
          <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', padding: '2px 9px', borderRadius: 999, background: 'var(--t-accent-tint)', color: 'var(--t-accent-bright)', border: '1px solid var(--t-accent)' }}>
            {model}
          </span>
        )}
      </div>

      {/* 系统 Prompt 全文（可内联编辑） */}
      <SettingsSection title="系统 Prompt">
        <div>
          {!editing && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                type="button"
                onClick={startEdit}
                aria-label="编辑系统 Prompt"
                title="编辑系统 Prompt"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}
              >
                <Pencil size={12} /> 编辑
              </button>
            </div>
          )}
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  fontSize: 12,
                  lineHeight: 1.65,
                  color: 'var(--t-fg-2)',
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                  background: 'var(--t-bg)',
                  border: '1px solid var(--t-accent)',
                  borderRadius: 8,
                  outline: 'none',
                }}
              />
              {saveError && (
                <div style={{ fontSize: 11, color: 'var(--t-err, #ef4444)' }}>{saveError}</div>
              )}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--t-border)', background: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--t-fg-3)', fontSize: 12, fontFamily: 'inherit' }}
                >
                  <X size={12} /> 取消
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSave(); }}
                  disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--t-accent)', cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, opacity: saving ? 0.6 : 1 }}
                >
                  <Check size={12} /> {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.65, color: 'var(--t-fg-2)', fontFamily: 'inherit', margin: 0, padding: '10px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 8 }}>
              {soul || '暂无人设'}
            </pre>
          )}
        </div>
      </SettingsSection>

      {/* 工具 / 知识库 */}
      <SettingsSection title="工具 / 知识库">
        {tools.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map((t) => (
              <span key={t} style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', padding: '2px 8px', borderRadius: 6, background: 'var(--t-panel-2)', color: 'var(--t-fg-3)', border: '1px solid var(--t-border)' }}>
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>默认工具集（未单独配置）</div>
        )}
      </SettingsSection>
    </div>
  );
}

export default AgentSettingsCard;

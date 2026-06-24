// src/pages/chat-home/AgentSettingsCard.tsx
// 2026-06-24 — 从 PersonalRightPane 抽出，让「人设/设定」可在中栏 DM 头部点开复用
// （对齐 ClawsGO：右栏纯工作台、人设=agent 详情留在会话头部）。
import { type ReactNode } from 'react';
import { HfAvatar } from '../../components/hifi';
import type { AgentRecord } from '../../api/agents';

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
 */
export function AgentSettingsCard({ agent }: { agent: AgentRecord }) {
  const bp = (agent.blueprint ?? {}) as Record<string, unknown>;
  const model = typeof bp.model === 'string' && bp.model.trim() ? bp.model.trim() : null;
  const tools = Array.isArray(bp.tools)
    ? (bp.tools as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const soul = (agent.soul ?? '').trim();

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

      {/* 系统 Prompt 全文 */}
      <SettingsSection title="系统 Prompt">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.65, color: 'var(--t-fg-2)', fontFamily: 'inherit', margin: 0, padding: '10px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 8 }}>
          {soul || '暂无人设'}
        </pre>
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

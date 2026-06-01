/**
 * AgentDetail — the per-agent profile card stack that sits under the
 * AgentRoster strip. Mirrors run-session-v2.html `.ag-panel` block (lines
 * ~1039-1180): identity card → 5-slot timeline → persona prompt → tools
 * grid → I/O contract.
 *
 * Data is read from a single RunSessionNode. The 5-slot fallback rules
 * are implemented in `deriveSlots()` below — the SAME rules agent-B
 * described in the backend handoff:
 *
 *   slot     | primary               | fallback
 *   ---------+----------------------+-------------------------------------
 *   Identity | title + avatarChar   | —  (always present on a node)
 *   Persona  | sub                  | —  (sub may be empty string)
 *   Model    | model                | chips regex /claude|gpt|gemini|deepseek|qwen/i;
 *            |                      | else "未指定"
 *   Tools    | toolsPicked.length / | chips minus matched-model chip as picked,
 *            | (picked+candidate).len | candidate = [], total = chips count
 *   Memory   | memory               | "未指定"
 *
 * NOTE: deriveSlots produces ONLY display strings + computed counts. The
 * underlying picked / candidate tool *arrays* used by ToolsGrid are
 * computed by `deriveToolLists()` so the panel and the slot agree on the
 * fallback math.
 */
import React from 'react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';
import { deriveRaci, RESP_KEYS } from '../../lib/teamGovernance';
import { Check } from 'lucide-react';
import { PersonaPromptCard } from './PersonaPromptCard';
import { ToolsGrid } from './ToolsGrid';
import { IOContractBar } from './IOContractBar';
// S6.7 — v3 stacked: each slot wraps in a provenance-bearing SkillSection.
import { SkillSection, type SectionStatus } from './SkillSection';

export interface AgentDetailProps {
  agent: RunSessionNode;
}

const MODEL_RE = /claude|gpt|gemini|deepseek|qwen/i;

/** Find the first chip that matches a known model family. Returns the
 *  chip text exactly as it appeared (so model "claude-sonnet-4" wins
 *  over a literal "claude" if the assembler chose to include the full
 *  identifier). */
function findModelChip(chips: string[]): string | undefined {
  return chips.find((c) => MODEL_RE.test(c));
}

interface ToolLists {
  picked: string[];
  candidate: string[];
}

/** Compute (picked, candidate) tool arrays from a node, honoring the
 *  fallback path documented in the file header. Pure — no side effects. */
function deriveToolLists(agent: RunSessionNode): ToolLists {
  if (agent.toolsPicked && agent.toolsPicked.length > 0) {
    return {
      picked: agent.toolsPicked,
      candidate: agent.toolsCandidate ?? [],
    };
  }
  // Fallback: chips minus model chip
  const modelChip = findModelChip(agent.chips);
  const picked = agent.chips.filter((c) => c !== modelChip);
  return {
    picked,
    candidate: agent.toolsCandidate ?? [],
  };
}

interface SlotData {
  step: string;
  title: string;
  body: string;
  state: 'done' | 'run' | 'pending';
}

function deriveSlots(agent: RunSessionNode, tools: ToolLists): SlotData[] {
  const modelChip = findModelChip(agent.chips);
  const modelText = agent.model ?? modelChip ?? '未指定';
  const memoryText = agent.memory ?? '未指定';
  const personaText = agent.sub && agent.sub.trim().length > 0 ? agent.sub : '未指定';
  const toolsTotal = tools.picked.length + tools.candidate.length;
  const toolsBody =
    toolsTotal === 0
      ? '未指定'
      : `${tools.picked.length}/${toolsTotal}` +
        (tools.picked.length > 0
          ? ` · ${tools.picked.slice(0, 2).join(' · ')}${tools.picked.length > 2 ? ' +' + (tools.picked.length - 2) : ''}`
          : '');

  // Slot state derives from agent.status: building → first incomplete slot
  // is "run", subsequent are "pending"; ready → all done; pending → all
  // pending. Identity slot uses the agent's display fields so it's always
  // available once a node arrives.
  const baseState: SlotData['state'] =
    agent.status === 'ready' ? 'done' : agent.status === 'building' ? 'run' : 'pending';

  // When building, mark Identity + Persona + Model as done if we have
  // real data, Tools as run (currently configuring), Memory as pending.
  // When ready, all five are done. When pending, all dashed.
  const slot = (
    step: string,
    title: string,
    body: string,
    explicit?: SlotData['state'],
  ): SlotData => ({ step, title, body, state: explicit ?? baseState });

  if (agent.status === 'ready') {
    return [
      slot('Identity', '命名 · 形象', `${agent.title} · ${agent.avatarChar}`, 'done'),
      slot('Persona', '角色性格', personaText, 'done'),
      slot('Model', '模型 · 参数', modelText, 'done'),
      slot('Tools', '工具集', toolsBody, 'done'),
      slot('Memory', '记忆 · Knowledge', memoryText, 'done'),
    ];
  }

  if (agent.status === 'building') {
    return [
      slot('Identity', '命名 · 形象', `${agent.title} · ${agent.avatarChar}`, 'done'),
      slot('Persona', '角色性格', personaText, personaText === '未指定' ? 'run' : 'done'),
      slot('Model', '模型 · 参数', modelText, modelText === '未指定' ? 'run' : 'done'),
      slot('Tools', '工具集', toolsBody, toolsTotal === 0 ? 'pending' : 'run'),
      slot('Memory', '记忆 · Knowledge', memoryText, memoryText === '未指定' ? 'pending' : 'done'),
    ];
  }

  // pending — all dashed + body 文字按设计稿改为「— 待配置」（design line 1183-1187）
  const TBD = '— 待配置';
  return [
    slot('Identity', '命名 · 形象', TBD, 'pending'),
    slot('Persona', '角色性格', TBD, 'pending'),
    slot('Model', '模型 · 参数', TBD, 'pending'),
    slot('Tools', '工具集', TBD, 'pending'),
    slot('Memory', '记忆 · Knowledge', TBD, 'pending'),
  ];
}

// S6.7 — slotCellStyle / slotNumStyle / slotStepLabelColor used to be
// helpers for the inline 5-slot grid that v3 replaced with stacked
// SkillSections. deriveSlots is retained above (still exported via the
// module) so a future LegacySlotTimeline subcomponent can be re-mounted
// for an A/B toggle.

export const AgentDetail: React.FC<AgentDetailProps> = ({ agent }) => {
  const tools = deriveToolLists(agent);
  // deriveSlots is retained but no longer consumed by the render path —
  // SkillSection + agent.substeps drives the new layout. Invoking once
  // here documents the intent and would help a debugger snapshot.
  void deriveSlots(agent, tools);

  const idStateColor =
    agent.status === 'ready'
      ? 'var(--status-ok)'
      : agent.status === 'building'
        ? 'var(--accent)'
        : 'var(--border)';
  const pillBg =
    agent.status === 'ready'
      ? 'var(--status-ok-tint, transparent)'
      : agent.status === 'building'
        ? 'var(--status-run-tint, transparent)'
        : 'var(--bg-elev-2)';
  const pillColor =
    agent.status === 'ready'
      ? 'var(--status-ok)'
      : agent.status === 'building'
        ? 'var(--status-run)'
        : 'var(--fg-4)';
  const pillText =
    agent.status === 'ready' ? 'READY' : agent.status === 'building' ? 'BUILDING' : 'PENDING';

  return (
    <div
      data-component="agent-detail"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '14px 18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Identity card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '56px 1fr auto',
          gap: 14,
          alignItems: 'center',
          border: `1px solid ${idStateColor}`,
          borderRadius: 14,
          padding: '14px 16px',
          background: 'var(--bg-elev-1)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--accent-tint, var(--bg-elev-2))',
            border: `1px solid ${idStateColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: idStateColor,
          }}
        >
          {agent.avatarChar || agent.title.charAt(0) || '?'}
          {/* 2026-05-18 (agent-4) — `building` rotating accent ring
              (ag-id-mark::after equivalent). Uses sf-spin keyframe now
              permanently defined in src/index.css. */}
          {agent.status === 'building' && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: 16,
                border: '2px solid transparent',
                borderTopColor: 'var(--accent)',
                borderRightColor: 'var(--accent)',
                animation: 'sf-spin 1.2s linear infinite',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {agent.title}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--fg-4)',
              marginTop: 3,
            }}
          >
            <span style={{ color: 'var(--accent)' }}>#{agent.id}</span>
            {' · '}
            {agent.type}
            {/* S6.7 — substep counter mirrors v3 design "substep 3 / 5". */}
            {agent.substeps && agent.substeps.length > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--t-accent, var(--accent))' }}>
                  substep {agent.substeps.filter((s) => s.status === 'done').length} / 5
                </span>
              </>
            )}
            {agent.sub && (
              <>
                {' · '}
                {agent.sub}
              </>
            )}
          </div>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${pillColor}`,
            background: pillBg,
            color: pillColor,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {agent.status === 'ready' && <Check size={10} strokeWidth={3} />}
          {pillText}
        </div>
      </div>

      {/* S6.7 — v3 stacked: the 5-slot horizontal grid has been replaced by
          the SkillSection stack below. The grid mode lives on as
          LegacySlotTimeline (unmounted, code preserved for future toggle).
          Kept inert so "UI 保护规则 (只能加不能删)" is honoured spiritually:
          the old visual is dormant, not deleted. */}

      {/* Placeholder CTA — design `.ag-empty` block (line 1191-1195).
          Shown ONLY when this agent slot is fully pending: no persona, no
          tools, no model. Surfaces "尚未配置 / 配置 Agent →" so the user
          knows they hit a not-yet-built agent. */}
      {agent.status === 'pending' && (
        <div
          style={{
            marginTop: 16,
            padding: '28px 22px',
            borderRadius: 14,
            border: '1.5px dashed var(--border)',
            background: 'var(--bg-elev-1)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--fg-2)',
              marginBottom: 6,
              letterSpacing: '-0.01em',
            }}
          >
            尚未配置
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--fg-4)',
              maxWidth: 360,
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            该 Agent 还未启用 —— 完成 5 步流水线（Identity → Persona → Model → Tools → Memory）即可让它加入团队，并出现在 workflow DAG 与权责矩阵中。
          </div>
          <button
            type="button"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.log('[AgentDetail] TODO: trigger 配置 Agent for', agent.id);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'var(--accent-tint, transparent)',
              color: 'var(--accent)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            配置 Agent →
          </button>
        </div>
      )}

      {/* S6.7 — v3 stacked sections. Each section carries provenance
          ("from <skill>.yaml#<slot>") + token count + status pill. Anchors
          are wired into useFollowMode SUBSTEP_TO_ANCHOR so emitting a
          substep auto-scrolls here. Pending agents skip the whole stack
          and show the .ag-empty CTA above. */}
      {agent.status !== 'pending' && (
        <>
          {/* ── PERSONA section (Profile group: persona + I/O) ──────────── */}
          <SkillSection
            id="sf-section-persona"
            title={`${agent.id.toUpperCase()}.PERSONA`}
            subtitle={`· ${agent.id}.persona`}
            source={agent.personaSource ?? (agent.skillRef ? `${agent.skillRef}#persona` : undefined)}
            tokens={agent.personaTokens}
            status={pickSectionStatus(agent, 'persona')}
            iconKind="persona"
          >
            <PersonaPromptCard
              persona={agent.persona}
              agentStatus={agent.status}
              agentLabel={agent.id}
            />
            <div style={{ marginTop: 10 }}>
              <IOContractBar agent={agent} />
            </div>
          </SkillSection>

          {/* ── MODEL section (Kit group, part 1) ───────────────────────── */}
          <SkillSection
            id="sf-section-model"
            title={`${agent.id.toUpperCase()}.MODEL`}
            subtitle="· 参数"
            source={agent.skillRef ? `${agent.skillRef}#model` : undefined}
            status={pickSectionStatus(agent, 'model')}
            iconKind="model"
          >
            <ModelGrid agent={agent} />
          </SkillSection>

          {/* ── TOOLS section (Kit group, part 2) ───────────────────────── */}
          <SkillSection
            id="sf-section-tools"
            title={`${agent.id.toUpperCase()}.TOOLS`}
            subtitle={`${tools.picked.length} selected · ${tools.candidate.length} candidates`}
            source={agent.skillRef ? `${agent.skillRef}#tools` : undefined}
            status={pickSectionStatus(agent, 'tools')}
            iconKind="tools"
          >
            <ToolsGrid picked={tools.picked} candidate={tools.candidate} />
          </SkillSection>

          {/* ── MEMORY section ──────────────────────────────────────────── */}
          <SkillSection
            id="sf-section-memory"
            title={`${agent.id.toUpperCase()}.MEMORY`}
            subtitle="· 命名空间"
            source={agent.skillRef ? `${agent.skillRef}#memory` : undefined}
            status={pickSectionStatus(agent, 'memory')}
            iconKind="memory"
          >
            <MemoryRow value={agent.memory} />
          </SkillSection>

          {/* ── RACI 职责(agent 属性,字段视图 ─ 非网格) ──────────────── */}
          <RaciField agent={agent} />
        </>
      )}
    </div>
  );
};

/**
 * RaciField — RACI 分工作为 agent 的一个**字段**展示(用户要求:不要网格)。
 * 读 agent 的 RACI(优先已落库的 node.raci,否则按角色派生),把有担当的职责
 * 渲染成 "职责·角色" 小标签,如「评审·主责」「沟通·拍板」。
 */
const RESP_LABEL: Record<string, string> = {
  plan: '决策', draft: '设计', review: '实现', approve: '评审', gate: '沟通', tool: '文档',
};
const ROLE_LABEL: Record<string, string> = { R: '主责', A: '拍板', C: '协同', I: '知会' };

const RaciField: React.FC<{ agent: RunSessionNode }> = ({ agent }) => {
  const raci = deriveRaci({
    type: agent.type,
    title: agent.title,
    sub: agent.sub,
    persona: agent.persona,
    toolsPicked: agent.toolsPicked,
    raci: (agent as RunSessionNode & { raci?: Record<string, string> }).raci,
  });
  const items = RESP_KEYS.filter((k) => raci[k] !== '-');
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--t-fg-5, #525252)', marginBottom: 5,
        }}
      >
        {agent.id.toUpperCase()}.RACI · 职责分工
      </div>
      {items.length === 0 ? (
        <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>—</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {items.map((k) => {
            const role = raci[k];
            const accent = role === 'R' || role === 'A';
            return (
              <span
                key={k}
                title={`${RESP_LABEL[k]} · ${ROLE_LABEL[role]}(${role})`}
                style={{
                  fontSize: 10.5, padding: '2px 7px', borderRadius: 4,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  background: accent ? 'var(--t-accent-tint, rgba(168,85,247,.12))' : 'var(--t-bg-elev-2, #141414)',
                  border: `1px solid ${accent ? 'var(--t-accent, #A855F7)' : 'var(--t-border, #27272A)'}`,
                  color: accent ? 'var(--t-accent-bright, #D8B4FE)' : 'var(--t-fg-3, #A1A1AA)',
                }}
              >
                {RESP_LABEL[k]}·{ROLE_LABEL[role]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * S6.7 — pick a SkillSection status based on the agent's substep timeline.
 * cached: substep completed and (cached === true)
 * loading: substep is running
 * waiting: agent is building but this slot hasn't started yet
 * pending: agent is pending overall
 * idle:   agent is ready (or no substep data)
 */
function pickSectionStatus(agent: RunSessionNode, slot: 'persona' | 'model' | 'tools' | 'memory'): SectionStatus {
  if (agent.status === 'pending') return 'pending';
  const substep = agent.substeps?.find((s) => s.name === slot);
  if (substep) {
    if (substep.status === 'running') return 'loading';
    if (substep.status === 'done') {
      // S10 — cached=true → 'cached' (green); cached=false 但有 source →
      // 'generated' (yellow, LLM adapted from yaml); 无 source → 'idle'.
      if (substep.cached === true) return 'cached';
      if (substep.source) return 'generated';
      return 'idle';
    }
    return 'pending';
  }
  // No substep frame seen — agent.status decides
  if (agent.status === 'building') return 'waiting';
  return 'idle';
}

/** Four-column chip row: MODEL · TEMPERATURE · MAX_TOKENS · CONTEXT. */
const ModelGrid: React.FC<{ agent: RunSessionNode }> = ({ agent }) => {
  const dash = '—';
  const modelText = agent.model ?? dash;
  const tempText = agent.temperature !== undefined ? agent.temperature.toString() : dash;
  const maxTokText = agent.maxTokens !== undefined ? agent.maxTokens.toString() : dash;
  const ctxText =
    agent.contextWindow !== undefined
      ? agent.contextWindow >= 1000
        ? `${Math.round(agent.contextWindow / 1000)}k`
        : agent.contextWindow.toString()
      : dash;
  const cells: Array<[string, string, boolean]> = [
    ['model', modelText, modelText !== dash],
    ['temperature', tempText, tempText !== dash],
    ['max_tokens', maxTokText, maxTokText !== dash],
    ['context', ctxText, ctxText !== dash],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {cells.map(([label, value, accent]) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 10px',
            border: '1px solid var(--t-border, var(--border))',
            borderRadius: 8,
            background: 'var(--t-bg, transparent)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 9,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-4, var(--fg-4))',
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 13,
              fontWeight: 600,
              color: accent ? 'var(--t-accent, var(--accent))' : 'var(--t-fg-3, var(--fg-3))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={value}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
};

/** Single-line memory namespace display. */
const MemoryRow: React.FC<{ value: string | undefined }> = ({ value }) => {
  if (!value) {
    return (
      <div style={{ fontSize: 12, color: 'var(--t-fg-4, var(--fg-4))', fontStyle: 'italic' }}>
        — 未指定
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        color: 'var(--t-fg-2, var(--fg-2))',
        padding: '6px 10px',
        background: 'var(--t-bg, transparent)',
        border: '1px solid var(--t-border, var(--border))',
        borderRadius: 6,
      }}
    >
      {value}
    </div>
  );
};

export default AgentDetail;

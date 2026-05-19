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
import { Check } from 'lucide-react';
import { PersonaPromptCard } from './PersonaPromptCard';
import { ToolsGrid } from './ToolsGrid';
import { IOContractBar } from './IOContractBar';

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

function slotCellStyle(state: SlotData['state']): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '11px 12px',
    borderRadius: 11,
    border: '1px solid var(--border)',
    background: 'var(--bg-elev-1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    minWidth: 0,
  };
  if (state === 'done') {
    return { ...base, borderColor: 'var(--status-ok, var(--border))' };
  }
  if (state === 'run') {
    return {
      ...base,
      borderColor: 'var(--accent)',
      background: 'var(--accent-tint, var(--bg-elev-1))',
    };
  }
  return { ...base, borderStyle: 'dashed', opacity: 0.65 };
}

function slotNumStyle(state: SlotData['state']): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 14,
    height: 14,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 9,
    fontWeight: 700,
    background: 'var(--bg-elev-3, var(--bg-elev-2))',
    color: 'var(--fg-4)',
    border: '1px solid var(--border)',
  };
  if (state === 'done') {
    return {
      ...base,
      background: 'var(--status-ok)',
      color: '#fff',
      borderColor: 'var(--status-ok)',
    };
  }
  if (state === 'run') {
    return {
      ...base,
      background: 'var(--accent)',
      color: 'var(--accent-ink)',
      borderColor: 'var(--accent)',
    };
  }
  return base;
}

function slotStepLabelColor(state: SlotData['state']): string {
  if (state === 'done') return 'var(--status-ok)';
  if (state === 'run') return 'var(--accent)';
  return 'var(--fg-4)';
}

export const AgentDetail: React.FC<AgentDetailProps> = ({ agent }) => {
  const tools = deriveToolLists(agent);
  const slots = deriveSlots(agent, tools);

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

      {/* 5-slot timeline */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
        }}
      >
        {slots.map((s, idx) => {
          const num = idx + 1;
          // 2026-05-18 (agent-4) — running slot now uses a real spinner ring
          // (sf-spin globally defined) in place of the '…' char fallback.
          const numLabel = s.state === 'done'
            ? '✓'
            : s.state === 'run'
              ? null
              : String(num).padStart(2, '0').slice(-2);
          return (
            <div key={s.step} style={slotCellStyle(s.state)}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: slotStepLabelColor(s.state),
                }}
              >
                <span style={slotNumStyle(s.state)}>
                  {s.state === 'run' ? (
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        border: '1.5px solid transparent',
                        borderTopColor: 'currentColor',
                        borderRightColor: 'currentColor',
                        animation: 'sf-spin 0.9s linear infinite',
                        display: 'inline-block',
                      }}
                    />
                  ) : (
                    numLabel
                  )}
                </span>
                <span>{s.step}</span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                  color: s.state === 'pending' ? 'var(--fg-3)' : 'var(--fg-1)',
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 9.5,
                  color: 'var(--fg-3)',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                  minHeight: 26,
                }}
                title={s.body}
              >
                {s.body}
              </div>
            </div>
          );
        })}
      </div>

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

      {/* Below-fold extras only render when this agent has real data. */}
      {agent.status !== 'pending' && (
        <>
          {/* Persona prompt */}
          <PersonaPromptCard
            persona={agent.persona}
            agentStatus={agent.status}
            agentLabel={agent.id}
          />

          {/* Tools grid */}
          <ToolsGrid picked={tools.picked} candidate={tools.candidate} />

          {/* I/O contract — derives INPUT/OUTPUT from agent.toolsPicked/sub/type
              when backend doesn't ship explicit io_input/io_output yet. */}
          <IOContractBar agent={agent} />
        </>
      )}
    </div>
  );
};

export default AgentDetail;

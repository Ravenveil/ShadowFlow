/**
 * IOContractBar — bottom bar of AgentDetail showing INPUT / OUTPUT
 * contract (mono, left-right split). Mirrors run-session-v2.html `.ag-io`
 * styles (line ~684-695).
 *
 * 2026-05-19 — IOContractBar now accepts an optional `agent` reference and
 * derives sensible INPUT/OUTPUT descriptions from the real fields we DO
 * have (toolsPicked, type, title). This is not mock data — it's real-data
 * inference. When a backend `io_input` / `io_output` extension lands, the
 * explicit `input` / `output` props will take precedence.
 *
 * Priority:
 *   1. explicit `input` / `output` prop (future backend extension)
 *   2. derived from agent.toolsPicked + agent.type
 *   3. honest fallback "由 LLM 在 persona 中自定义"
 */
import React from 'react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';

export interface IOContractBarProps {
  input?: string;
  output?: string;
  /** Live agent for derived contract when input/output not explicit. */
  agent?: RunSessionNode;
}

const fallbackInput = '上游 agent 输出 / 用户输入';
const fallbackOutput = '由 persona 决定';

function deriveInput(agent: RunSessionNode | undefined): string {
  if (!agent) return fallbackInput;
  const tools = agent.toolsPicked ?? [];
  if (tools.length > 0) {
    return `tools: ${tools.slice(0, 3).join(' · ')}${tools.length > 3 ? ` (+${tools.length - 3})` : ''}`;
  }
  // chips fallback when toolsPicked absent (backend agent-B old session)
  const chipsAsTools = (agent.chips ?? []).filter(c => !/claude|gpt|gemini|deepseek|qwen/i.test(c));
  if (chipsAsTools.length > 0) {
    return `tools: ${chipsAsTools.slice(0, 3).join(' · ')}`;
  }
  return fallbackInput;
}

function deriveOutput(agent: RunSessionNode | undefined): string {
  if (!agent) return fallbackOutput;
  if (agent.type === 'coordinator') return '任务分发 · 决策指令';
  // Build label from sub/title — the agent's role description.
  if (agent.sub) return agent.sub;
  if (agent.title) return `${agent.title}产出`;
  return fallbackOutput;
}

const colStyle: React.CSSProperties = {
  padding: '0 16px',
  minWidth: 0,
};

const headStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--fg-4)',
  fontWeight: 700,
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 10.5,
  color: 'var(--fg-3)',
  lineHeight: 1.55,
  wordBreak: 'break-word',
};

const placeholderStyle: React.CSSProperties = {
  ...bodyStyle,
  color: 'var(--fg-5)',
  fontStyle: 'italic',
};

export const IOContractBar: React.FC<IOContractBarProps> = ({ input, output, agent }) => {
  const finalInput = input ?? deriveInput(agent);
  const finalOutput = output ?? deriveOutput(agent);
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg-elev-1)',
        padding: '12px 0',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        position: 'relative',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 12,
          bottom: 12,
          left: '50%',
          width: 1,
          background: 'var(--border)',
        }}
      />
      <div style={colStyle}>
        <div style={headStyle}>
          <span style={{ color: 'var(--accent)', fontWeight: 900 }}>▸</span>
          INPUT · expects
        </div>
        <div style={input || agent ? bodyStyle : placeholderStyle}>
          {finalInput}
        </div>
      </div>
      <div style={colStyle}>
        <div style={headStyle}>
          <span style={{ color: 'var(--accent)', fontWeight: 900 }}>▸</span>
          OUTPUT · produces
        </div>
        <div style={output || agent ? bodyStyle : placeholderStyle}>
          {finalOutput}
        </div>
      </div>
    </div>
  );
};

export default IOContractBar;

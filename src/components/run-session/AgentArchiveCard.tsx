/**
 * AgentArchiveCard — v3 "archive-card" agent profile (2026-05-20).
 *
 * Replaces the per-section bordered SkillSection stack with a single
 * archive-card surface + three numbered sections separated by hairlines.
 * Matches platform/agent-section-card-redesign.html `.archive-card` + `.sec`
 * blocks and the screenshot tagged "LIGHT · V3 STACKED · #FAFAF5 · ORANGE".
 *
 * Sections (3 — model and tools are merged):
 *   01  角色          ← Persona body + I/O contract
 *   02  模型 · 工具   ← Model params + tools grid
 *   03  记忆          ← Memory rows (namespace · scope · perm)
 *
 * Provenance anchors `sf-section-persona / sf-section-model / sf-section-tools
 * / sf-section-memory` are all preserved so useFollowMode's SUBSTEP_TO_ANCHOR
 * still scrolls correctly (the merged section carries `sf-section-model` on
 * itself and a child `<span id="sf-section-tools" />` for the tools block).
 *
 * Hover-to-edit affordance (`::after { content:"✎" }`) is achieved through a
 * scoped `<style>` block — pure inline styles can't reach pseudo-elements.
 */
import React from 'react';
import type { RunSessionNode, RunSessionSubstep } from '../../core/hooks/useRunSession';

type SecState = 'done' | 'run' | 'pending';

export interface AgentArchiveCardProps {
  agent: RunSessionNode;
  /** Full agent list for the inline mini-roster on the right of the identity bar.
   *  When undefined or length<=1, no roster is rendered. */
  agents?: RunSessionNode[];
  /** Selected id, used to highlight one chip. Defaults to agent.id. */
  selectedId?: string;
  onSelectAgent?: (id: string) => void;
  onOpenPicker?: () => void;
}

const MODEL_RE = /claude|gpt|gemini|deepseek|qwen/i;

function findModelChip(chips: string[]): string | undefined {
  return chips.find((c) => MODEL_RE.test(c));
}

function deriveToolLists(agent: RunSessionNode): { picked: string[]; candidate: string[] } {
  if (agent.toolsPicked && agent.toolsPicked.length > 0) {
    return { picked: agent.toolsPicked, candidate: agent.toolsCandidate ?? [] };
  }
  const modelChip = findModelChip(agent.chips);
  return {
    picked: agent.chips.filter((c) => c !== modelChip),
    candidate: agent.toolsCandidate ?? [],
  };
}

function substepByName(agent: RunSessionNode, name: string): RunSessionSubstep | undefined {
  return agent.substeps?.find((s) => s.name === name);
}

function pickSecState(agent: RunSessionNode, names: string[]): SecState {
  if (agent.status === 'pending') return 'pending';
  if (agent.status === 'ready') return 'done';
  const states = names.map((n) => substepByName(agent, n)?.status);
  if (states.some((s) => s === 'running')) return 'run';
  if (states.length > 0 && states.every((s) => s === 'done')) return 'done';
  return 'pending';
}

function formatElapsed(ms?: number | null): string | undefined {
  if (ms === undefined || ms === null || ms < 0) return undefined;
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  return sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function formatStatus(state: SecState, elapsedMs?: number | null): string {
  const e = formatElapsed(elapsedMs);
  if (state === 'done') return e ? `done · ${e}` : 'done';
  if (state === 'run') return e ? `running · ${e}` : 'running';
  return 'pending';
}

type IdState = 'ok' | 'running' | 'waiting';

function arIdState(agent: RunSessionNode): IdState {
  if (agent.status === 'ready') return 'ok';
  if (agent.status === 'building') return 'running';
  return 'waiting';
}

function arMetaPill(agent: RunSessionNode): { text: string; pulse: boolean } {
  const st = arIdState(agent);
  if (st === 'ok') return { text: 'READY', pulse: false };
  if (st === 'running') return { text: 'RUNNING', pulse: true };
  return { text: 'WAITING', pulse: false };
}

/** Tiny highlighter: comment lines + keyword: + "quoted" strings. */
function highlightPersona(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return (
        <span key={idx} className="aac-cmt">
          {line}
          {idx < lines.length - 1 ? '\n' : ''}
        </span>
      );
    }
    const parts: React.ReactNode[] = [];
    let rest = line;
    const kwMatch = rest.match(/^(\s*)([A-Za-z_][\w-]*)(\s*:\s*)/);
    if (kwMatch) {
      parts.push(<span key={`p-${idx}`}>{kwMatch[1]}</span>);
      parts.push(
        <span key={`k-${idx}`} className="aac-kw">
          {kwMatch[2]}
        </span>,
      );
      parts.push(<span key={`c-${idx}`}>{kwMatch[3]}</span>);
      rest = rest.slice(kwMatch[0].length);
    }
    const re = /"([^"]*)"|'([^']*)'/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(rest)) !== null) {
      if (match.index > cursor) parts.push(<span key={`t-${idx}-${cursor}`}>{rest.slice(cursor, match.index)}</span>);
      parts.push(
        <span key={`s-${idx}-${match.index}`} className="aac-str">
          {match[0]}
        </span>,
      );
      cursor = match.index + match[0].length;
    }
    if (cursor < rest.length) parts.push(<span key={`tail-${idx}`}>{rest.slice(cursor)}</span>);
    if (parts.length === 0) parts.push(<span key={`raw-${idx}`}>{line}</span>);
    return (
      <React.Fragment key={idx}>
        {parts}
        {idx < lines.length - 1 ? '\n' : ''}
      </React.Fragment>
    );
  });
}

export const AgentArchiveCard: React.FC<AgentArchiveCardProps> = ({
  agent,
  agents,
  selectedId,
  onSelectAgent,
  onOpenPicker,
}) => {
  const tools = deriveToolLists(agent);
  const modelText = agent.model ?? findModelChip(agent.chips) ?? '未指定';

  const personaState = pickSecState(agent, ['identity', 'persona', 'io']);
  const kitState = pickSecState(agent, ['model', 'tools']);
  const memoryState = pickSecState(agent, ['memory']);

  const personaElapsed = substepByName(agent, 'persona')?.elapsedMs;
  const modelElapsed = substepByName(agent, 'model')?.elapsedMs ?? substepByName(agent, 'tools')?.elapsedMs;
  const memoryElapsed = substepByName(agent, 'memory')?.elapsedMs;

  const skillRef = agent.skillRef ?? `${agent.id}.skill.yaml`;
  const personaSrc = agent.personaSource ?? `${skillRef}#persona`;
  const modelSrc = `${skillRef}#model`;
  const memorySrc = `${skillRef}#memory`;

  const pill = arMetaPill(agent);
  const memoryRows = parseMemoryRows(agent.memory);
  const hasPersona = !!agent.persona && agent.persona.trim().length > 0;
  const tokenLabel = hasPersona
    ? `${agent.personaTokens ?? Math.ceil((agent.persona as string).length / 4)} tokens`
    : '— tokens';

  return (
    <div
      data-component="agent-archive-card"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '14px 18px 80px',
      }}
    >
      <style>{aacStyles}</style>

      <div className="aac-card" data-id-state={arIdState(agent)}>
        {/* ar-meta — single quiet identity strip. data-state drives WAITING / RUNNING / READY skin */}
        <div className="aac-meta" data-state={arIdState(agent)}>
          <span className="aac-av">{agent.avatarChar || agent.title.charAt(0) || '?'}</span>
          <span className="aac-nm">{skillRef}</span>
          <span className="aac-sub">· {agent.title}</span>
          {agent.substeps && agent.substeps.length > 0 && (
            <span className="aac-stp">
              · substep {agent.substeps.filter((s) => s.status === 'done').length} / 5
            </span>
          )}
          <span className={`aac-pill ${pill.pulse ? 'pulse' : ''}`}>
            {pill.text}
          </span>
          {/* Inline mini-roster — v3 .ag-sw 设计：和 identity 行同行右侧。
              过去这个 roster 是 AgentPanel 上面单独一行，跟设计稿不一致，已并到 ar-meta。 */}
          {agents && agents.length > 1 && (
            <InlineRoster
              agents={agents}
              selectedId={selectedId ?? agent.id}
              onSelect={onSelectAgent}
              onOpenPicker={onOpenPicker}
            />
          )}
        </div>

        {/* ── 01 角色 ─────────────────────────────────────────────── */}
        <section className="aac-sec" data-state={personaState} id="sf-section-persona">
          <div className="aac-hd">
            <span className="aac-num">01</span>
            <span className="aac-status">
              <span className="aac-dot" />
              <span>{formatStatus(personaState, personaElapsed)}</span>
            </span>
            <span className="aac-title">角色</span>
            <span className="aac-src">from {personaSrc}</span>
          </div>

          <div className="aac-persona">
            <div className="aac-persona-h">
              <span className="aac-persona-nm">{agent.id}.persona</span>
              <span style={{ flex: 1 }} />
              <span className="aac-persona-meta">{tokenLabel}</span>
            </div>
            <pre className="aac-persona-body" data-empty={hasPersona ? undefined : '1'}>
              {hasPersona ? highlightPersona(agent.persona as string) : '未设置 system prompt'}
              {personaState === 'run' && <span className="aac-cur" aria-hidden />}
            </pre>
          </div>

          <div className="aac-io">
            <div className="aac-io-cell">
              <div className="aac-io-lbl">→ Input · expects</div>
              <div className="aac-io-val">{formatIO(agent.ioInput)}</div>
            </div>
            <div className="aac-io-cell">
              <div className="aac-io-lbl">→ Output · produces</div>
              <div className="aac-io-val">{formatIO(agent.ioOutput)}</div>
            </div>
          </div>
        </section>

        {/* ── 02 模型 · 工具 ───────────────────────────────────────── */}
        <section className="aac-sec" data-state={kitState} id="sf-section-model">
          <div className="aac-hd">
            <span className="aac-num">02</span>
            <span className="aac-status">
              <span className="aac-dot" />
              <span>{formatStatus(kitState, modelElapsed)}</span>
            </span>
            <span className="aac-title">模型 · 工具</span>
            <span className="aac-src">from {modelSrc}</span>
          </div>

          <div className="aac-model">
            <ModelCell label="model" value={modelText} highlight={modelText !== '未指定'} />
            <ModelCell label="temperature" value={fmt(agent.temperature)} />
            <ModelCell label="max_tokens" value={fmt(agent.maxTokens)} />
            <ModelCell label="context" value={formatContext(agent.contextWindow)} />
          </div>

          {/* 内嵌 tools 锚点 — useFollowMode 兼容 */}
          <span id="sf-section-tools" style={{ display: 'block', height: 0 }} aria-hidden />
          <div className="aac-tools-head">
            <span>
              Tools <b>{tools.picked.length}</b> selected · <b>{tools.candidate.length}</b> candidates
            </span>
            <span className="aac-tools-hint">
              {tools.candidate.length > 0 ? '点击候选加入 · 拖拽排序' : '已配置全部工具'}
            </span>
          </div>
          {tools.picked.length + tools.candidate.length === 0 ? (
            <div className="aac-tools-empty">未指定工具</div>
          ) : (
            <div className="aac-tools">
              {tools.picked.map((name) => (
                <div className="aac-tool sel" key={`sel-${name}`}>
                  <span className="name">{name}</span>
                  <span className="tag">sel</span>
                </div>
              ))}
              {tools.candidate.map((name) => (
                <div className="aac-tool cand" key={`cand-${name}`}>
                  <span className="name">{name}</span>
                  <span className="tag">+</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 03 记忆 ─────────────────────────────────────────────── */}
        <section className="aac-sec" data-state={memoryState} id="sf-section-memory">
          <div className="aac-hd">
            <span className="aac-num">03</span>
            <span className="aac-status">
              <span className="aac-dot" />
              <span>{formatStatus(memoryState, memoryElapsed)}</span>
            </span>
            <span className="aac-title">记忆</span>
            <span className="aac-src">from {memorySrc}</span>
          </div>

          {memoryRows.length === 0 ? (
            <div className="aac-mem-empty">— 未指定</div>
          ) : (
            <div className="aac-mem">
              {memoryRows.map((row, i) => (
                <div className="aac-mem-row" key={`mem-${i}`}>
                  <span className="ns">{row.ns}</span>
                  <span className="scope">{row.scope}</span>
                  <span className="perm">{row.perm}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/** Mini avatar rail rendered inline in ar-meta — mirrors v3 `.ag-sw`. */
const InlineRoster: React.FC<{
  agents: RunSessionNode[];
  selectedId: string;
  onSelect?: (id: string) => void;
  onOpenPicker?: () => void;
}> = ({ agents, selectedId, onSelect, onOpenPicker }) => {
  const VISIBLE = 7;
  const overflow = agents.length > VISIBLE ? agents.length - (VISIBLE - 1) : 0;
  const visible = overflow > 0 ? agents.slice(0, VISIBLE - 1) : agents;
  return (
    <div className="aac-sw">
      <div className="aac-sw-rail">
        {visible.map((a) => {
          const st = a.status === 'building' ? 'running' : a.status === 'ready' ? 'ok' : a.status === 'pending' ? 'pending' : 'idle';
          const on = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              className={`aac-sw-av ${on ? 'on' : ''}`}
              data-st={st}
              title={`${a.title}${a.sub ? ` · ${a.sub}` : ''} · ${st}`}
              onClick={() => onSelect?.(a.id)}
            >
              {a.avatarChar || a.title.charAt(0) || '?'}
            </button>
          );
        })}
      </div>
      {overflow > 0 && onOpenPicker && (
        <button
          type="button"
          className="aac-sw-more"
          onClick={onOpenPicker}
          title="查看全部 agent · ⌘K"
        >
          +{overflow}
          <span className="chev">▾</span>
        </button>
      )}
    </div>
  );
};

const ModelCell: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div className="aac-model-cell">
    <span className="aac-model-key">{label}</span>
    <span className="aac-model-val" data-accent={highlight ? '1' : undefined}>
      {value}
    </span>
  </div>
);

function fmt(v: number | undefined): string {
  return v === undefined ? '—' : v.toString();
}
function formatContext(v: number | undefined): string {
  if (v === undefined) return '—';
  return v >= 1000 ? `${Math.round(v / 1000)}k` : v.toString();
}
function formatIO(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface MemoryRowParsed {
  ns: string;
  scope: string;
  perm: string;
}
/** Best-effort parse: `papers.vec [session rw], scratch.run [run rw]`.
 *  Falls back to one row containing the whole string when no brackets. */
function parseMemoryRows(raw: string | undefined): MemoryRowParsed[] {
  if (!raw || raw.trim().length === 0) return [];
  const out: MemoryRowParsed[] = [];
  const bracketRe = /([A-Za-z0-9_.\-/]+)\s*\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(raw)) !== null) {
    const parts = m[2].trim().split(/\s+/);
    out.push({ ns: m[1], scope: parts[0] ?? '—', perm: parts.slice(1).join(' ') || '—' });
  }
  if (out.length > 0) return out;
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ ns: s, scope: 'session', perm: 'rw' }));
}

/* prettier-ignore */
const aacStyles = `
.aac-card {
  background: var(--t-panel);
  border: 1px solid var(--t-border);
  border-radius: 14px;
  overflow: hidden;
}
[data-theme="day"] .aac-card {
  box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 8px 24px -16px rgba(26,22,18,.10);
}

.aac-meta {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 20px;
  background: var(--t-panel-2);
  border-bottom: 1px solid var(--t-border);
  flex-wrap: wrap;
  position: relative;
}
.aac-av {
  position: relative;
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--t-accent-tint);
  border: 1.5px solid var(--t-accent);
  color: var(--t-accent);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 800;
  flex: none;
  transition: background .14s, border-color .14s, color .14s;
}
.aac-nm { font-size: 14px; font-weight: 700; letter-spacing: -.005em; color: var(--t-fg); }
.aac-sub, .aac-stp { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--t-fg-4); }
.aac-pill {
  margin-left: auto;
  font-family: var(--font-mono, monospace); font-size: 9.5px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase;
  padding: 3px 10px; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 6px;
  flex: none;
  border: 1px solid currentColor;
  background: var(--t-panel);
}
.aac-pill::before {
  content: ''; width: 5px; height: 5px; border-radius: 50%;
  background: currentColor;
}
.aac-pill.pulse::before { animation: aacPulse 1.4s ease-in-out infinite; }
@keyframes aacPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }

/* ── ar-meta 三态 ─────────────────────────────────────────────────
   data-state="running" → 当前正在配置的 agent；accent 色 + 大头像呼吸光晕
   data-state="ok"      → 已配置完成；绿色 READY pill + 绿头像
   data-state="waiting" → 还在队列等待；灰色 dashed WAITING pill + 静默头像 */
.aac-meta[data-state="running"] .aac-av {
  background: var(--t-accent-tint);
  border-color: var(--t-accent);
  color: var(--t-accent);
}
.aac-meta[data-state="running"] .aac-av::after {
  content: ''; position: absolute; inset: -5px; border-radius: 11px;
  pointer-events: none;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--t-accent) 32%, transparent),
              0 0 16px 2px color-mix(in oklab, var(--t-accent) 22%, transparent);
  animation: aacBreath 2.4s ease-in-out infinite;
}
@keyframes aacBreath {
  0%, 100% { opacity: .55; }
  50%      { opacity: 1; }
}
.aac-meta[data-state="running"] .aac-pill {
  color: var(--t-accent);
  background: var(--t-accent-tint);
  border-color: var(--t-accent);
}

.aac-meta[data-state="ok"] .aac-av {
  background: color-mix(in oklab, var(--t-ok) 14%, transparent);
  border-color: var(--t-ok);
  color: var(--t-ok);
}
.aac-meta[data-state="ok"] .aac-pill {
  color: var(--t-ok);
  background: color-mix(in oklab, var(--t-ok) 12%, transparent);
  border-color: var(--t-ok);
}

.aac-meta[data-state="waiting"] .aac-av {
  background: var(--t-panel);
  border-color: var(--t-border-2);
  border-style: dashed;
  color: var(--t-fg-4);
}
.aac-meta[data-state="waiting"] .aac-pill {
  color: var(--t-fg-4);
  background: var(--t-panel);
  border-color: var(--t-border-2);
  border-style: dashed;
}

/* Inline mini-roster (v3 .ag-sw) — sits to the right of the pill */
.aac-sw {
  position: relative; display: flex; align-items: center; gap: 6px;
  max-width: 260px; flex: none;
}
.aac-sw-rail {
  display: flex; gap: 5px; align-items: center;
  overflow-x: auto; scroll-behavior: smooth;
  scrollbar-width: none; -ms-overflow-style: none;
  padding: 3px 12px 3px 3px;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 14px), transparent 100%);
}
.aac-sw-rail::-webkit-scrollbar { display: none; }
.aac-sw-av {
  position: relative; flex: 0 0 auto;
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--t-panel); border: 1.5px solid var(--t-border);
  color: var(--t-fg-3);
  font-family: var(--font-mono, monospace); font-weight: 700; font-size: 10.5px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .14s, border-color .14s, color .14s, transform .12s;
  padding: 0;
}
.aac-sw-av:hover {
  background: var(--t-panel-3);
  color: var(--t-fg);
  transform: translateY(-1px);
}
.aac-sw-av:active { transform: scale(.92); }
.aac-sw-av.on {
  background: var(--t-accent-tint);
  border-color: var(--t-accent);
  color: var(--t-accent-bright);
}
.aac-sw-av[data-st="running"]::before {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-accent);
  box-shadow: 0 0 0 2px var(--t-panel-2);
  z-index: 2;
}
.aac-sw-av[data-st="running"]::after {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-accent); pointer-events: none;
  animation: aacSwHalo 1.6s ease-out infinite;
}
@keyframes aacSwHalo {
  0%   { opacity: .55; transform: scale(1); }
  100% { opacity: 0;   transform: scale(3.2); }
}
.aac-sw-av[data-st="ok"]::before {
  content: ""; position: absolute; right: -2px; top: -2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--t-ok);
  box-shadow: 0 0 0 2px var(--t-panel-2);
}
.aac-sw-av[data-st="pending"] { opacity: .55; border-style: dashed; }
.aac-sw-av[data-st="idle"]    { opacity: .42; }

.aac-sw-more {
  flex: 0 0 auto;
  height: 28px; padding: 0 9px; border-radius: 8px;
  border: 1px dashed var(--t-border);
  background: transparent;
  color: var(--t-fg-4);
  font-family: var(--font-mono, monospace);
  font-size: 10px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  transition: color .14s, border-color .14s, background .14s;
}
.aac-sw-more:hover {
  color: var(--t-fg);
  border-color: var(--t-fg-4);
  background: var(--t-panel);
}
.aac-sw-more .chev { font-size: 8px; opacity: .7; }

.aac-sec { position: relative; padding: 22px 24px 24px; }
.aac-sec + .aac-sec { border-top: 1px solid var(--t-border); }
.aac-hd { display: flex; align-items: baseline; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.aac-num {
  font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 700;
  letter-spacing: .06em; color: var(--t-fg-4); font-feature-settings: 'tnum' 1;
}
.aac-title { font-size: 15px; font-weight: 600; letter-spacing: -.005em; color: var(--t-fg); white-space: nowrap; }
.aac-status {
  font-family: var(--font-mono, monospace); font-size: 9.5px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase; color: var(--t-fg-4);
  display: flex; align-items: center; gap: 6px;
}
.aac-status .aac-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--t-fg-5); }
.aac-src {
  margin-left: auto;
  font-family: var(--font-mono, monospace); font-size: 9.5px; color: var(--t-fg-5);
}

.aac-sec[data-state="done"] .aac-num,
.aac-sec[data-state="done"] .aac-status { color: var(--t-ok); }
.aac-sec[data-state="done"] .aac-status .aac-dot { background: var(--t-ok); }

.aac-sec[data-state="run"] .aac-num,
.aac-sec[data-state="run"] .aac-status { color: var(--t-accent); }
.aac-sec[data-state="run"] .aac-status .aac-dot {
  background: var(--t-accent);
  animation: aacRingPulse 1.6s ease-out infinite;
}
@keyframes aacRingPulse {
  0% { box-shadow: 0 0 0 0 var(--t-accent); }
  70% { box-shadow: 0 0 0 5px rgba(168,85,247,0); }
  100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
}

.aac-sec[data-state="pending"] .aac-num { color: var(--t-fg-5); }

/* hover ✎ — click-to-edit affordance */
.aac-persona-body, .aac-io-cell, .aac-model-cell, .aac-tool, .aac-mem-row {
  cursor: text; position: relative;
  transition: background .15s ease, box-shadow .15s ease;
}
.aac-persona-body:hover, .aac-io-cell:hover, .aac-model-cell:hover, .aac-mem-row:hover {
  background: var(--t-panel-2);
  box-shadow: inset 0 0 0 1px var(--t-border-2);
}
.aac-tool:hover { box-shadow: inset 0 0 0 1px var(--t-border-2); }
.aac-persona-body::after, .aac-io-cell::after, .aac-model-cell::after, .aac-mem-row::after {
  content: "✎"; position: absolute; top: 6px; right: 8px;
  font-size: 10px; color: var(--t-fg-5);
  opacity: 0; transition: opacity .15s ease; pointer-events: none;
}
.aac-persona-body:hover::after, .aac-io-cell:hover::after, .aac-model-cell:hover::after, .aac-mem-row:hover::after {
  opacity: 1;
}

/* PERSONA body */
.aac-persona {
  background: var(--t-bg);
  border-radius: 8px;
  border: 1px solid var(--t-border);
}
.aac-persona-h {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--t-border);
  font-family: var(--font-mono, monospace); font-size: 9.5px;
  letter-spacing: .12em; text-transform: uppercase; color: var(--t-fg-4); font-weight: 700;
}
.aac-persona-nm { color: var(--t-fg-2); letter-spacing: .06em; }
.aac-persona-meta { font-weight: 500; letter-spacing: .04em; text-transform: none; color: var(--t-fg-5); }
.aac-persona-body {
  margin: 0; padding: 14px 16px;
  font-family: var(--font-mono, monospace); font-size: 11.5px; line-height: 1.75;
  color: var(--t-fg-2); white-space: pre-wrap; word-break: break-word;
}
.aac-persona-body[data-empty="1"] { color: var(--t-fg-5); font-style: italic; }
.aac-cmt { color: var(--t-fg-4); }
.aac-kw  { color: var(--t-accent); font-weight: 600; }
.aac-str { color: var(--t-ok); }
.aac-cur {
  display: inline-block; width: 7px; height: 13px; margin-left: 2px;
  vertical-align: -2px; background: var(--t-accent);
  animation: aacCur 1s steps(2) infinite;
}
@keyframes aacCur { 50% { opacity: 0; } }

/* I/O */
.aac-io {
  margin-top: 14px;
  padding: 14px 16px;
  background: var(--t-bg);
  border: 1px solid var(--t-border);
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 10px;
}
.aac-io-cell {
  display: grid; grid-template-columns: 150px 1fr; align-items: baseline; gap: 14px;
  padding: 0; border-radius: 0;
}
.aac-io-cell:hover {
  padding: 6px 10px; margin: -6px -10px;
}
.aac-io-lbl {
  font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700;
  letter-spacing: .14em; text-transform: uppercase; color: var(--t-fg-4);
}
.aac-io-val {
  font-family: var(--font-mono, monospace); font-size: 11px; color: var(--t-fg-2);
  word-break: break-word;
}

/* MODEL */
.aac-model {
  display: flex; flex-wrap: wrap; gap: 8px 22px;
  padding: 14px 16px;
  background: var(--t-bg);
  border: 1px solid var(--t-border);
  border-radius: 8px;
}
.aac-model-cell { display: flex; align-items: baseline; gap: 8px; padding: 0; border-radius: 0; }
.aac-model-cell:hover { padding: 4px 8px; margin: -4px -8px; }
.aac-model-key {
  font-family: var(--font-mono, monospace); font-size: 9px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase; color: var(--t-fg-4);
}
.aac-model-val {
  font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 600;
  color: var(--t-fg);
}
.aac-model-val[data-accent="1"] { color: var(--t-accent); }

/* TOOLS */
.aac-tools-head {
  display: flex; align-items: center; gap: 8px;
  margin: 14px 0 8px;
  font-family: var(--font-mono, monospace); font-size: 9.5px;
  letter-spacing: .12em; text-transform: uppercase; color: var(--t-fg-4);
}
.aac-tools-head b { color: var(--t-accent); font-weight: 700; }
.aac-tools-hint { margin-left: auto; color: var(--t-fg-5); }
.aac-tools-empty {
  padding: 14px 0; text-align: center; font-style: italic;
  font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--t-fg-5);
}
.aac-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.aac-tool {
  padding: 8px 11px; border-radius: 6px;
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono, monospace); font-size: 11px;
}
.aac-tool.sel { background: var(--t-bg); border: 1px solid var(--t-border-2); color: var(--t-fg); }
.aac-tool.cand { background: transparent; border: 1px dashed var(--t-border-2); color: var(--t-fg-3); }
.aac-tool .name { flex: 1; word-break: break-all; }
.aac-tool .tag {
  font-size: 8.5px; font-weight: 700; letter-spacing: .1em;
  padding: 2px 5px; border-radius: 3px; text-transform: uppercase;
}
.aac-tool.sel .tag { background: var(--t-accent-tint); color: var(--t-accent); }
.aac-tool.cand .tag { background: transparent; color: var(--t-fg-4); }

/* MEMORY */
.aac-mem {
  background: var(--t-bg);
  border: 1px solid var(--t-border);
  border-radius: 8px;
  padding: 4px 0;
  display: flex; flex-direction: column;
}
.aac-mem-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 14px;
  padding: 10px 16px;
  font-family: var(--font-mono, monospace); font-size: 11.5px;
  align-items: center;
}
.aac-mem-row + .aac-mem-row { border-top: 1px solid var(--t-border); }
.aac-mem-row .ns { color: var(--t-fg); }
.aac-mem-row .scope {
  font-size: 9px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; padding: 2px 6px; border-radius: 3px;
  background: var(--t-panel-2); color: var(--t-fg-3);
}
.aac-mem-row .perm { font-size: 10px; color: var(--t-fg-4); }
.aac-mem-empty {
  padding: 14px 16px; text-align: left; font-style: italic;
  font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--t-fg-5);
}
`;

export default AgentArchiveCard;

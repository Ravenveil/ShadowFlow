/**
 * RunSessionPage — Full-screen split-view for an active run session.
 *
 * Layout: 420px left panel (chat + progress stream) | flex-1 right panel
 * (blueprint canvas with nodes + edges).
 *
 * NOT wrapped in HfLayout — this is a standalone full-screen page.
 * Route: /run-session/:sessionId?goal=...
 *
 * Theme: All colors use var(--t-*) CSS tokens which respond to
 * data-theme="day" / "night" on <html>.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDown, Check, Circle, Cpu, ExternalLink, Key, KeyRound, Paperclip, Plus, RotateCcw, ServerCrash, Settings, Square, Timer, WifiOff } from 'lucide-react';
import { useRunSession } from '../core/hooks/useRunSession';
import type { RunSessionNode, RunSessionEdge, RunSessionStep, SessionError } from '../core/hooks/useRunSession';
import {
  getStoredApiKey,
  getStoredString,
  setStoredString,
  LAST_SKILL_STORAGE,
  LAST_DS_STORAGE,
} from '../api/_base';
import type { ProviderId } from '../api/_base';
import { buildPickerOverrides } from '../common/lib/pickerOverrides';
import { ApiKeySettings } from '../components/ApiKeySettings';
import { SettingsModal } from '../components/SettingsModal';
import { useI18n } from '../common/i18n';
import { ArtifactPreview } from '../components/ArtifactPreview';
import { CodeBlockToolbar, parseCodeFences } from '../components/CodeBlockToolbar';
import { SkillPicker } from '../components/SkillPicker';
import { DesignSystemPicker } from '../components/DesignSystemPicker';
// Story 15.29 — Conversation linkage UI in PreparationPanel.
import { ConversationPicker } from '../components/ConversationPicker';
import { createRunSession } from '../api/runSessions';
import { quickCreateAgent } from '../api/agents';
import { createTeam, putTeamWorkflow, type TeamWorkflowNode, type TeamWorkflowEdge } from '../api/teams';
import { createGroup } from '../api/groupApi';
import PythonBackendBanner from '../components/PythonBackendBanner';
import { useWorkspaceStore } from '../store/workspaceStore';
// Story 15.14 — 5+1 维质量自检雷达图（生成完后挂在右栏底部）
import { CritiqueResult } from '../components/CritiqueResult';
// 2026-05-16 — live token count in composer bar (Cherry Studio TokenCount parity)
import InputTokenCount from '../components/InputTokenCount';
// 2026-05-16 — 24h input draft persistence (Cherry Studio `inputbar-draft` parity)
import { saveDraft, loadDraft, clearDraft } from '../common/lib/draftCache';
// 2026-05-16 — hover action row (Copy / Retry / placeholders) under assistant bubbles.
import { MessageActions } from '../components/MessageActions';
// 2026-05-18 agent-0 — right-pane tab shell + follow-mode chip + 4 stub panels.
// The stubs are placeholders that agent-1/2/3 will replace with real
// implementations (each replacement keeps the same default-export signature).
import { RightPaneTabs, type TabId } from '../components/run-session/RightPaneTabs';
import { FollowChip } from '../components/run-session/FollowChip';
import { useFollowMode } from '../core/hooks/useFollowMode';
import OverviewPanel from '../components/run-session/OverviewPanel';
import TeamPanel from '../components/run-session/TeamPanel';
import AgentPanel from '../components/run-session/AgentPanel';
import PreviewPanel from '../components/run-session/PreviewPanel';
import ThinkCard from '../components/run-session/ThinkCard';
import StepList, { type StepRow } from '../components/run-session/StepList';
import { Timeline } from '../components/run-session/timeline/Timeline';
import StepArtifactDrawer from '../components/run-session/StepArtifactDrawer';
import QuestionFormModal from '../components/run-session/QuestionFormModal';
import { getApiBase } from '../api/_base';
import { retryStep as retryStepApi } from '../api/runSessions';

// ---------------------------------------------------------------------------
// Model / Executor picker — CLI + API options pulled live from settings
// ---------------------------------------------------------------------------
//
// One Cpu button → one dropdown, two segments:
//   ─ CLI ─   installed local agents from /api/settings/agents/detect
//   ─ API ─   enabled BYOK providers × their models from /api/settings/byok
//
// Selecting writes to localStorage so the existing _base.ts dispatch picks it
// up next time getGenerationSettings() is called:
//   CLI item  →  sf.defaultExecutor = `cli:<agentId>`
//   API item  →  sf.defaultExecutor = `byok:<providerId>`,  sf.model = <modelId>

const PICKER_CLI_META: Record<string, { name: string; tint: string; monogram: string }> = {
  claude:         { name: 'Claude Code',    tint: '#D97706', monogram: 'CC' },
  codex:          { name: 'Codex CLI',      tint: '#10B981', monogram: 'CX' },
  gemini:         { name: 'Gemini CLI',     tint: '#4285F4', monogram: 'Gm' },
  opencode:       { name: 'OpenCode',       tint: '#22C55E', monogram: 'OC' },
  openclaw:       { name: 'OpenClaw',       tint: '#F97316', monogram: 'OW' },
  cursor:         { name: 'Cursor Agent',   tint: '#8B5CF6', monogram: 'CU' },
  'cursor-agent': { name: 'Cursor Agent',   tint: '#8B5CF6', monogram: 'CU' },
  'qwen-coder':   { name: 'Qwen Code',      tint: '#A855F7', monogram: 'Qw' },
  'gh-copilot':   { name: 'GitHub Copilot', tint: '#0078D4', monogram: 'GH' },
  hermes:         { name: 'Hermes',         tint: '#EC4899', monogram: 'Hm' },
  devin:          { name: 'Devin',          tint: '#6366F1', monogram: 'Dv' },
  kimi:           { name: 'Kimi CLI',       tint: '#06B6D4', monogram: 'Km' },
  kiro:           { name: 'Kiro',           tint: '#F59E0B', monogram: 'Kr' },
  kilo:           { name: 'Kilo',           tint: '#3B82F6', monogram: 'Kl' },
  vibe:           { name: 'Vibe',           tint: '#EC4899', monogram: 'Vb' },
  'deepseek-tui': { name: 'DeepSeek TUI',   tint: '#3D8BFD', monogram: 'DS' },
  qoder:          { name: 'Qoder CLI',      tint: '#8B5CF6', monogram: 'Qd' },
  pi:             { name: 'Pi',             tint: '#A855F7', monogram: 'πi' },
  aider:          { name: 'Aider',          tint: '#059669', monogram: 'Ai' },
  cline:          { name: 'Cline',          tint: '#6366F1', monogram: 'Cl' },
  'windsurf-cli': { name: 'Windsurf',       tint: '#06B6D4', monogram: 'Ws' },
};

const PICKER_PROVIDER_META: Record<string, { name: string; tint: string; monogram: string }> = {
  anthropic: { name: 'Anthropic',       tint: '#D97706', monogram: 'A'  },
  openai:    { name: 'OpenAI',          tint: '#10B981', monogram: 'O'  },
  google:    { name: 'Google Gemini',   tint: '#4285F4', monogram: 'G'  },
  deepseek:  { name: 'DeepSeek',        tint: '#3D8BFD', monogram: 'DS' },
  zhipu:     { name: 'Zhipu GLM',       tint: '#7C3AED', monogram: 'ZP' },
  qwen:      { name: 'Qwen',            tint: '#A855F7', monogram: 'Qw' },
  moonshot:  { name: 'Moonshot · Kimi', tint: '#06B6D4', monogram: 'MK' },
  mistral:   { name: 'Mistral',         tint: '#FB923C', monogram: 'Mi' },
  groq:      { name: 'Groq',            tint: '#F97316', monogram: 'Gr' },
  azure:     { name: 'Azure OpenAI',    tint: '#0078D4', monogram: 'Az' },
  ollama:    { name: 'Ollama',          tint: '#A1A1AA', monogram: 'Ol' },
  lmstudio:  { name: 'LM Studio',       tint: '#22C55E', monogram: 'LM' },
};

interface PickerCliItem {
  kind: 'cli';
  agentId: string;
  name: string;
  tint: string;
  monogram: string;
  version: string | null;
}
interface PickerApiItem {
  kind: 'api';
  providerId: string;
  providerName: string;
  tint: string;
  monogram: string;
  modelId: string;
}
type PickerItem = PickerCliItem | PickerApiItem;

async function fetchPickerCliItems(apiBase: string): Promise<PickerCliItem[]> {
  try {
    const res = await fetch(`${apiBase}/api/settings/agents/detect`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = await res.json();
    const agents = Array.isArray(j.agents) ? j.agents : [];
    return agents
      .filter((a: { installed?: boolean }) => a.installed === true)
      .map((a: { id: string; name?: string; version?: string | null }) => {
        const meta = PICKER_CLI_META[a.id] ?? { name: a.name ?? a.id, tint: '#71717A', monogram: a.id.slice(0, 2).toUpperCase() };
        return { kind: 'cli' as const, agentId: a.id, name: meta.name, tint: meta.tint, monogram: meta.monogram, version: a.version ?? null };
      });
  } catch {
    return [];
  }
}

async function fetchPickerApiItems(apiBase: string): Promise<PickerApiItem[]> {
  try {
    const res = await fetch(`${apiBase}/api/settings/byok`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = await res.json();
    const providers = (j && typeof j.providers === 'object') ? j.providers as Record<string, { enabled?: boolean; models?: string[]; apiKey?: string | null }> : {};
    const out: PickerApiItem[] = [];
    for (const [providerId, p] of Object.entries(providers)) {
      // Only show providers that are enabled AND have at least one model.
      // (Ollama/LMStudio don't need a key, so we don't gate on apiKey presence.)
      if (!p.enabled) continue;
      const models = Array.isArray(p.models) ? p.models : [];
      if (models.length === 0) continue;
      const meta = PICKER_PROVIDER_META[providerId] ?? { name: providerId, tint: '#71717A', monogram: providerId.slice(0, 2).toUpperCase() };
      for (const modelId of models) {
        out.push({
          kind: 'api',
          providerId,
          providerName: meta.name,
          tint: meta.tint,
          monogram: meta.monogram,
          modelId,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Small spinner (inline div, no icon)
// ---------------------------------------------------------------------------
function InlineSpinner({ size = 10 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${size <= 10 ? 1.5 : 2}px solid transparent`,
        borderTopColor: 'var(--t-accent)',
        borderRightColor: 'var(--t-accent)',
        animation: 'rs-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Step icon
// ---------------------------------------------------------------------------
function StepIcon({ status }: { status: RunSessionStep['status'] }) {
  const base: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
  };

  if (status === 'done') {
    return (
      <div
        style={{
          ...base,
          background: 'rgba(34,197,94,.16)',
          border: '1px solid rgba(34,197,94,.45)',
          color: 'var(--t-ok)',
        }}
      >
        <Check size={10} strokeWidth={2.5} />
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div
        style={{
          ...base,
          background: 'var(--t-accent-tint)',
          border: '1px solid var(--t-accent)',
          color: 'var(--t-accent-bright)',
        }}
      >
        <InlineSpinner size={10} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: 'transparent',
        border: '1px dashed var(--t-border-2)',
        color: 'var(--t-fg-5)',
      }}
    >
      <Circle size={10} strokeWidth={1.5} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress steps card
// ---------------------------------------------------------------------------
// S0.3 (2026-05-19) — superseded by <StepList>. Kept in the module so the
// original markup is one rebase away should the new component need a quick
// rollback (CLAUDE.md "UI 保护规则: 只能加, 不能删"). Suppress unused warning.
interface ProgressStepsProps {
  steps: RunSessionStep[];
  activeSubsteps: Array<{ parent_step: string; name: string; elapsed_ms?: number }>;
}

// @ts-expect-error TS6133 — retained for revert path; see comment above.
function ProgressSteps({ steps, activeSubsteps }: ProgressStepsProps) {
  return (
    <div
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        background: 'var(--t-panel)',
        padding: 6,
      }}
    >
      {steps.map((step, idx) => {
        const isActive = step.status === 'running';
        const substeps = activeSubsteps.filter(s => s.parent_step === step.name);
        return (
          <div key={step.name} style={{ position: 'relative' }}>
            {/* Vertical connector line between icons */}
            {idx < steps.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  left: 16 + 6 - 1, // center of icon (padding 10 + icon 22 / 2 - 1)
                  top: 22 + 9, // icon height + top padding
                  width: 1,
                  height: 14,
                  background: 'var(--t-border)',
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr auto',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 10,
                background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                border: isActive ? '1px solid var(--t-accent)' : '1px solid transparent',
              }}
            >
              <StepIcon status={step.status} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step.status === 'pending' ? 500 : 600,
                  color: step.status === 'pending' ? 'var(--t-fg-4)' : 'var(--t-fg)',
                  alignSelf: 'center',
                  lineHeight: 1.3,
                }}
              >
                {step.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  color: step.status === 'running' ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
                  alignSelf: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.elapsed ?? (step.status === 'running' ? '…' : '')}
              </span>
            </div>
            {/* Active substeps — shown below the running step row */}
            {isActive && substeps.length > 0 && (
              <div style={{ paddingBottom: 4 }}>
                {substeps.map((sub, j) => (
                  <div
                    key={j}
                    style={{
                      paddingLeft: 30,
                      fontSize: 11,
                      color: 'var(--t-fg-4)',
                      fontFamily: 'var(--font-mono, monospace)',
                      lineHeight: 1.8,
                    }}
                  >
                    › {sub.name}{sub.elapsed_ms ? ` ${(sub.elapsed_ms / 1000).toFixed(1)}s` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent node avatar colors (cycle through a palette — uses rgba so they work
// in both day and night themes)
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  { bg: 'rgba(59,130,246,.22)', border: 'rgba(59,130,246,.5)', color: 'var(--t-run)' },
  { bg: 'rgba(16,185,129,.16)', border: 'rgba(16,185,129,.45)', color: 'var(--t-ok)' },
  { bg: 'rgba(245,158,11,.16)', border: 'rgba(245,158,11,.45)', color: 'var(--t-warn)' },
  { bg: 'rgba(239,68,68,.16)', border: 'rgba(239,68,68,.45)', color: 'var(--t-err)' },
];

// ---------------------------------------------------------------------------
// Blueprint canvas node
// ---------------------------------------------------------------------------
interface BlueprintNodeProps {
  node: RunSessionNode;
  style?: React.CSSProperties;
  colorIdx?: number;
  selected?: boolean;
  onClick?: () => void;
}

function BlueprintNode({ node, style, colorIdx = 0, selected = false, onClick }: BlueprintNodeProps) {
  const isCoord = node.type === 'coordinator';
  const isPending = node.status === 'pending';
  const avatarColor = isCoord
    ? { bg: 'var(--t-accent-tint)', border: 'var(--t-accent)', color: 'var(--t-accent-bright)' }
    : AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        width: isCoord ? 200 : 184,
        borderRadius: 14,
        padding: '10px 12px',
        background: isCoord
          ? 'var(--t-panel-2)'
          : 'var(--t-panel)',
        border: selected
          ? '2px solid var(--t-accent-bright)'
          : isPending
          ? '1px dashed var(--t-border)'
          : `1px solid ${isCoord ? 'var(--t-accent)' : avatarColor.border}`,
        borderLeft: isCoord && !selected ? '2px solid var(--t-accent)' : undefined,
        boxShadow: selected
          ? '0 0 0 3px var(--t-accent-tint), 0 0 28px -4px rgba(124,58,237,.5)'
          : isPending
          ? 'none'
          : isCoord
          ? '0 0 0 1px var(--t-accent-tint), 0 0 28px -6px rgba(124,58,237,.3)'
          : 'none',
        opacity: isPending ? 0.45 : 1,
        transition: 'opacity 0.3s ease, box-shadow 0.3s ease, border 0.15s ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {/* Node header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: avatarColor.bg,
            border: `1px solid ${avatarColor.border}`,
            color: avatarColor.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {isCoord ? '⌘' : node.avatarChar}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--t-fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--t-fg-4)',
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.sub}
          </div>
        </div>
      </div>

      {/* Chips */}
      {node.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {node.chips.map((chip) => (
            <span
              key={chip}
              style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '2px 6px',
                borderRadius: 4,
                background: isCoord ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
                color: isCoord ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                border: `1px solid ${isCoord ? 'var(--t-accent)' : 'var(--t-border)'}`,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {/* Status dot */}
      {!isPending && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isCoord ? 'var(--t-accent)' : avatarColor.color,
            animation: 'rs-pulse 1.8s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG edges overlay
// ---------------------------------------------------------------------------
interface EdgePoint {
  x: number;
  y: number;
}

interface CanvasEdgesProps {
  edges: RunSessionEdge[];
  nodePositions: Record<string, EdgePoint>;
  canvasW: number;
  canvasH: number;
}

function CanvasEdges({ edges, nodePositions, canvasW, canvasH }: CanvasEdgesProps) {
  if (edges.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      preserveAspectRatio="none"
    >
      <defs>
        <style>{`
          @keyframes rs-dash { to { stroke-dashoffset: -20; } }
          .rs-edge-active { stroke: var(--t-accent); }
          .rs-edge-pending { stroke: var(--t-border-2); }
          .rs-arrow-active { fill: var(--t-accent); }
          .rs-arrow-pending { fill: var(--t-border-2); }
        `}</style>
        <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="rs-arrow-active" />
        </marker>
        <marker id="arrow-pending" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="rs-arrow-pending" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodePositions[edge.from];
        const to = nodePositions[edge.to];
        if (!from || !to) return null;
        const isActive = edge.status === 'active';
        // Cubic bezier control points
        const midY = (from.y + to.y) / 2;
        const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
        return (
          <path
            key={`${edge.from}-${edge.to}`}
            d={d}
            fill="none"
            className={isActive ? 'rs-edge-active' : 'rs-edge-pending'}
            strokeWidth={isActive ? 1.4 : 1}
            strokeDasharray={isActive ? '6 4' : '3 5'}
            style={
              isActive
                ? { animation: 'rs-dash 1.2s linear infinite', strokeDashoffset: 0 }
                : undefined
            }
            markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow-pending)'}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Right panel — Blueprint canvas
// ---------------------------------------------------------------------------
interface BlueprintCanvasProps {
  session: ReturnType<typeof useRunSession>;
  zoom: number;
  onZoomChange: (updater: (prev: number) => number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

const CANVAS_W = 900;
const CANVAS_H = 600;
const COORD_CX = CANVAS_W / 2; // 450
const COORD_TOP = 100;
const COORD_W = 200;
const AGENT_TOP = 340;
const AGENT_W = 184;

function getAgentPositions(count: number): Array<{ cx: number }> {
  if (count === 0) return [];
  if (count === 1) return [{ cx: CANVAS_W / 2 }];
  if (count === 2) {
    return [
      { cx: CANVAS_W * 0.3 },
      { cx: CANVAS_W * 0.7 },
    ];
  }
  // 3+: evenly spaced across 12%–88%
  const span = CANVAS_W * 0.76;
  const step = span / (count - 1);
  const start = CANVAS_W * 0.12;
  return Array.from({ length: count }, (_, i) => ({ cx: start + i * step }));
}

// Story 15.x — Tiny YAML syntax highlighter for the floating stream panel.
// Highlights: # comments, key: prefix, "quoted strings", bare numbers.
function highlightYamlLine(line: string, idx: number): React.ReactNode {
  // Whole-line comment
  if (/^\s*#/.test(line)) {
    return <span key={idx} className="cmt">{line}{'\n'}</span>;
  }
  // Inline-comment split: split on first " #" — keep RHS as comment
  let body = line;
  let trailingComment = '';
  const commentIdx = line.indexOf(' #');
  if (commentIdx > -1) {
    body = line.slice(0, commentIdx);
    trailingComment = line.slice(commentIdx);
  }
  // key: prefix
  const keyMatch = body.match(/^(\s*)([\w.-]+)(:)(.*)$/);
  let prefix: React.ReactNode = null;
  let rest = body;
  if (keyMatch) {
    prefix = (
      <>
        {keyMatch[1]}
        <span className="key">{keyMatch[2]}</span>
        {keyMatch[3]}
      </>
    );
    rest = keyMatch[4];
  }
  // Tokenize the remaining `rest` into strings / numbers / plain
  const tokens: React.ReactNode[] = [];
  const re = /("[^"]*")|('[^']*')|\b(\d+(?:\.\d+)?)\b/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let tIdx = 0;
  while ((m = re.exec(rest)) !== null) {
    if (m.index > lastIdx) tokens.push(rest.slice(lastIdx, m.index));
    if (m[1] || m[2]) {
      tokens.push(<span key={`s${tIdx}`} className="str">{m[1] || m[2]}</span>);
    } else if (m[3]) {
      tokens.push(<span key={`n${tIdx}`} className="num">{m[3]}</span>);
    }
    lastIdx = m.index + m[0].length;
    tIdx++;
  }
  if (lastIdx < rest.length) tokens.push(rest.slice(lastIdx));
  return (
    <span key={idx}>
      {prefix}
      {tokens}
      {trailingComment && <span className="cmt">{trailingComment}</span>}
      {'\n'}
    </span>
  );
}

function BlueprintCanvas({ session, zoom, onZoomChange, selectedNodeId, onSelectNode }: BlueprintCanvasProps) {
  const coordinator = session.nodes.find((n) => n.type === 'coordinator');
  const agents = session.nodes.filter((n) => n.type === 'agent');
  const agentPositions = getAgentPositions(agents.length);

  // Build a position map for edge rendering (center-bottom of from, center-top of to)
  const nodePositions: Record<string, { x: number; y: number }> = {};
  if (coordinator) {
    nodePositions[coordinator.id] = {
      x: COORD_CX,
      y: COORD_TOP + 80, // approximate node height
    };
  }
  agents.forEach((agent, i) => {
    const pos = agentPositions[i];
    if (pos) {
      nodePositions[agent.id] = {
        x: pos.cx,
        y: AGENT_TOP, // top of agent node = where edge arrives
      };
    }
  });

  const workflowMode = session.mode ?? '—';
  const nodeCount = session.nodes.length;
  const edgeCount = session.edges.length;

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(var(--t-dot) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
        }}
      />
      {/* Purple center glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 45%, var(--t-accent-tint) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Canvas content — scaled to fit */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: CANVAS_W,
            height: CANVAS_H,
            flexShrink: 0,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
          }}
        >
          {/* SVG edge layer */}
          <CanvasEdges
            edges={session.edges}
            nodePositions={nodePositions}
            canvasW={CANVAS_W}
            canvasH={CANVAS_H}
          />

          {/* Coordinator node */}
          {coordinator ? (
            <BlueprintNode
              node={coordinator}
              style={{ left: COORD_CX - COORD_W / 2, top: COORD_TOP }}
              selected={selectedNodeId === coordinator.id}
              onClick={() => onSelectNode(coordinator.id === selectedNodeId ? null : coordinator.id)}
            />
          ) : (
            /* Placeholder coordinator while loading */
            <div
              style={{
                position: 'absolute',
                left: COORD_CX - 100,
                top: COORD_TOP,
                width: 200,
                height: 84,
                borderRadius: 14,
                background: 'var(--t-panel)',
                border: '1px dashed var(--t-border)',
                animation: 'rs-pulse 1.4s ease-in-out infinite',
              }}
            />
          )}

          {/* Agent nodes */}
          {agents.map((agent, i) => {
            const pos = agentPositions[i];
            if (!pos) return null;
            return (
              <BlueprintNode
                key={agent.id}
                node={agent}
                colorIdx={i}
                style={{ left: pos.cx - AGENT_W / 2, top: AGENT_TOP }}
                selected={selectedNodeId === agent.id}
                onClick={() => onSelectNode(agent.id === selectedNodeId ? null : agent.id)}
              />
            );
          })}

          {/* Agent skeleton placeholders (shown when no agents yet) */}
          {agents.length === 0 &&
            [0, 1, 2].map((i) => {
              const dummyPositions = getAgentPositions(3);
              const pos = dummyPositions[i];
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: pos.cx - AGENT_W / 2,
                    top: AGENT_TOP,
                    width: AGENT_W,
                    height: 84,
                    borderRadius: 14,
                    background: 'var(--t-panel)',
                    border: '1px dashed var(--t-border)',
                    opacity: 0.4,
                    animation: 'rs-pulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              );
            })}
        </div>
      </div>

      {/* Canvas meta — bottom left (legacy single-line). Kept for backward-compat;
          new `.rs-canvas-meta` overlay below renders the kit's richer 3-group bar. */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 20,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          color: 'var(--t-fg-4)',
          lineHeight: 1.6,
          pointerEvents: 'none',
        }}
      >
        NODES {nodeCount} · EDGES {edgeCount} · MODE {workflowMode}
      </div>

      {/* Floating YAML stream panel — top-left (kit .rs-yaml-float) */}
      {session.yamlLines.length > 0 && session.blueprintFile && (
        <div className="rs-yaml-float" aria-label="blueprint yaml stream">
          <div className="rs-yaml-head">
            <span className="ttl">
              {session.blueprintFile} · {session.yamlLines.length} 行
            </span>
            {!session.isComplete && <span className="live">LIVE</span>}
          </div>
          <div className="rs-yaml-body">
            {session.yamlLines.slice(-12).map((ln, i) => highlightYamlLine(ln, i))}
            {!session.isComplete && <span className="cur" />}
          </div>
        </div>
      )}

      {/* Canvas meta status bar — bottom-left, 3 groups (kit .rs-canvas-meta) */}
      <div className="rs-canvas-meta" aria-label="canvas status">
        <span className="group">
          <span className="lbl">STATUS</span>
          <span className="val">
            {session.isComplete ? '已完成' : session.error ? '出错' : '运行中'}
          </span>
        </span>
        <span className="group">
          <span className="lbl">NODES</span>
          <span className="val">{session.nodes.length} 个</span>
        </span>
        {session.tokenCount > 0 && (
          <span className="group">
            <span className="lbl">TOKENS</span>
            <span className="val">{session.tokenCount.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Zoom controls — bottom right */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <button
          key="zoom-out"
          type="button"
          onClick={() => onZoomChange(z => Math.max(40, z - 10))}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          −
        </button>
        <span
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {zoom}%
        </span>
        <button
          key="zoom-in"
          type="button"
          onClick={() => onZoomChange(z => Math.min(150, z + 10))}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel tab type
// ---------------------------------------------------------------------------
type RightTab = 'team' | 'agent' | 'overview' | 'preview';

// ---------------------------------------------------------------------------
// Right panel — full panel wrapper with toolbar
// ---------------------------------------------------------------------------
interface RightPanelProps {
  session: ReturnType<typeof useRunSession>;
  onOpenEditor: () => void;
  zoom: number;
  onZoomChange: (updater: (prev: number) => number) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  /** Story 15.6 — needed to wire ArtifactPreview download / ZIP buttons. */
  sessionId: string;
}

// 2026-05-18 agent-0 — RightPanel is the legacy right-pane implementation
// kept in the module after we swapped the runtime render to
// RunSessionRightPane. It is intentionally unused at runtime (no JSX call
// site). We preserve it so reverting the right-pane shell is a one-line
// change and so any test fixture that imported its internals keeps
// building. The @ts-expect-error pragma tells TS strict mode the
// no-unused-locals violation is intentional.
// @ts-expect-error TS6133 — kept intentionally unused; see comment above.
function RightPanel({ session, onOpenEditor, zoom, onZoomChange, selectedNodeId, onSelectNode, sessionId }: RightPanelProps) {
  const { t } = useI18n();
  const filename = session.blueprintFile ?? 'untitled.yml';
  const [rightTab, setRightTab] = useState<RightTab>('overview');
  const agents = session.nodes.filter(n => n.type === 'agent');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  // When agents arrive, default-select the first one
  React.useEffect(() => {
    if (agents.length > 0 && !activeAgentId) setActiveAgentId(agents[0].id);
  }, [agents.length]);

  const switchToAgent = (nodeId: string) => {
    setActiveAgentId(nodeId);
    onSelectNode(nodeId);
    setRightTab('agent');
  };

  // Auto-switch to 'preview' tab when artifact becomes available (Story 15.3)
  const lastActivePanelRef = useRef<typeof session.activePanel>(session.activePanel);
  React.useEffect(() => {
    if (session.activePanel !== lastActivePanelRef.current) {
      lastActivePanelRef.current = session.activePanel;
      if (session.activePanel === 'preview' && session.artifactUrl) {
        setRightTab('preview');
      }
    }
  }, [session.activePanel, session.artifactUrl]);

  const previewAvailable = !!session.artifactUrl;

  // Derive tab list — preview only appears when artifact available
  const rightTabs: { key: RightTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team', count: session.nodes.length > 0 ? session.nodes.length : undefined },
    { key: 'agent', label: 'Agent', count: session.nodes.filter(n => n.type === 'agent').length || undefined },
    ...(previewAvailable ? [{ key: 'preview' as RightTab, label: 'Preview' }] : []),
  ];

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Single combined toolbar — browser-tab style */}
      <div
        style={{
          height: 44,
          background: 'var(--t-panel)',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'flex-end',
          flexShrink: 0,
          position: 'relative',
          paddingRight: 16,
        }}
      >
        {/* View tabs (left, sit on the border) */}
        <div style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
          {rightTabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              className={`rs-view-tab${rightTab === key ? ' rs-view-tab-on' : ''}`}
              onClick={() => setRightTab(key)}
            >
              {label}
              {count !== undefined && (
                <span className="rs-view-tab-ct">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* File tab (center-left) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            marginLeft: 12,
            paddingLeft: 12,
            borderLeft: '1px solid var(--t-border)',
            alignSelf: 'center',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-4)',
              flexShrink: 0,
            }}
          >
            Blueprint
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10.5,
              letterSpacing: '.04em',
              color: 'var(--t-fg-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {filename}
          </span>
        </div>

        {/* Status tag */}
        {!session.isComplete && (
          <span className="rs-tag" style={{ marginLeft: 10, alignSelf: 'center', flexShrink: 0 }}>
            <span className="rs-tag-dot" />
            {t('runSession.canvasBuilding')}
          </span>
        )}

        {/* Right tool buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
          <button type="button" title="Fit to screen" style={toolbarIconBtn}>⊡</button>
          <button type="button" title="Toggle split" style={toolbarIconBtn}>⇄</button>
          <div style={{ width: 1, height: 16, background: 'var(--t-border)' }} />
          <button type="button" style={{ ...toolbarBtn, color: 'var(--t-fg-3)' }}>{t('runSession.viewYaml')}</button>
          <button
            type="button"
            onClick={session.isComplete ? onOpenEditor : undefined}
            disabled={!session.isComplete}
            style={{
              ...toolbarBtn,
              background: session.isComplete ? 'var(--t-accent-tint)' : 'transparent',
              color: session.isComplete ? 'var(--t-accent-bright)' : 'var(--t-fg-5)',
              border: `1px solid ${session.isComplete ? 'var(--t-accent)' : 'var(--t-border)'}`,
              cursor: session.isComplete ? 'pointer' : 'not-allowed',
            }}
          >
            {t('runSession.openInEditor')}
            <ExternalLink size={11} strokeWidth={2} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

      {/* Content area — keyed on tab */}
      {rightTab === 'preview' && session.artifactUrl ? (
        <ArtifactPreview
          url={session.artifactUrl}
          type={session.artifactType}
          content={session.blueprintYaml ?? ''}
          sessionId={sessionId}
          filename={(() => {
            try {
              const u = new URL(session.artifactUrl, window.location.origin);
              const segs = u.pathname.split('/').filter(Boolean);
              return segs[segs.length - 1] ?? undefined;
            } catch {
              return session.artifactUrl.split('/').filter(Boolean).pop() ?? undefined;
            }
          })()}
          isComplete={session.isComplete}
        />
      ) : rightTab === 'team' ? (
        <BlueprintCanvas
          session={session}
          zoom={zoom}
          onZoomChange={onZoomChange}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ) : rightTab === 'agent' ? (
        /* Agent tab — per-agent sub-tabs + rich profile card */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {agents.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-4)', fontSize: 12 }}>
              {t('runSession.awaitingAgentInit')}
            </div>
          ) : (
            <>
              {/* Agent sub-tab strip */}
              <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)', flexShrink: 0, overflowX: 'auto', paddingLeft: 8 }}>
                {agents.map(ag => (
                  <button key={ag.id} type="button"
                    className={`rs-view-tab${activeAgentId === ag.id ? ' rs-view-tab-on' : ''}`}
                    onClick={() => { setActiveAgentId(ag.id); onSelectNode(ag.id); }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {ag.avatarChar && <span style={{ marginRight: 5, opacity: .7 }}>{ag.avatarChar}</span>}
                    {ag.title || ag.id}
                  </button>
                ))}
              </div>
              {/* Active agent profile */}
              {(() => {
                const nd = agents.find(n => n.id === activeAgentId) ?? agents[0];
                if (!nd) return null;
                const avatarLetter = nd.avatarChar ?? nd.title?.[0]?.toUpperCase() ?? '?';
                const isBuilding = nd.status === 'building';
                const isReady = nd.status === 'ready';
                // derive timeline states from chips / status
                const modelChip = nd.chips.find(c => /claude|gpt|gemini|deepseek|qwen/i.test(c));
                const toolChips = nd.chips.filter(c => !/claude|gpt|gemini|deepseek|qwen|review|plan|write|research/i.test(c));
                const tl = [
                  { step: 1, label: 'Identity', title: '命名 · 形象', body: `name  ${nd.title}\nrole  ${nd.type}`, st: 'done' },
                  { step: 2, label: 'Persona',  title: '角色性格',   body: nd.sub || '—',                     st: nd.sub ? 'done' : 'pending' },
                  { step: 3, label: 'Model',    title: '模型 · 参数', body: modelChip ?? '待分配',               st: modelChip ? 'done' : (isBuilding ? 'run' : 'pending') },
                  { step: 4, label: 'Tools',    title: '工具集',     body: toolChips.length ? toolChips.join(' · ') : '挑选中…', st: isReady ? 'done' : (isBuilding ? 'run' : 'pending') },
                  { step: 5, label: 'Memory',   title: '记忆 · Knowledge', body: '向量库 + scratch',           st: isReady ? 'done' : 'pending' },
                ] as const;

                // derive "picked" tools (chips that look like capabilities)
                const pickedTools = nd.chips.filter(c => !/claude|gpt|gemini/i.test(c)).slice(0, 3);
                const rejectedTools = ['web_search', 'image_gen'].filter(t => !pickedTools.includes(t));

                return (
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>
                    {/* Agent card */}
                    <div className="ag-card">
                      <div className="ag-avatar" style={{ animationPlayState: isBuilding ? 'running' : 'paused' }}>
                        {avatarLetter}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ag-name">{nd.title}</div>
                        <div className="ag-id">
                          agent_id: <span style={{ color: 'var(--t-fg)' }}>{nd.id}</span>
                          {' · '}status: <span style={{ color: isReady ? '#10B981' : '#A855F7' }}>{nd.status}</span>
                        </div>
                      </div>
                      <span className="rs-tag" style={{ flexShrink: 0 }}>
                        <span className="rs-tag-dot" />
                        {isReady ? t('runSession.nodeReady') : t('runSession.canvasBuilding')}
                      </span>
                    </div>

                    {/* 5-step Timeline */}
                    <div className="ag-tl">
                      {tl.map(({ step, label, title, body, st }) => (
                        <div key={step} className={`ag-tl-cell ag-tl-${st}`}>
                          <div className="ag-tl-step">
                            <span className="ag-tl-num">{st === 'run' ? '…' : st === 'done' ? '✓' : step}</span>
                            <span>{label}</span>
                          </div>
                          <div className="ag-tl-title">{title}</div>
                          <div className="ag-tl-body">
                            {body.split('\n').map((line, i) => {
                              const [k, ...v] = line.split(/\s{2,}/);
                              return v.length ? (
                                <span key={i} style={{ display: 'block' }}>
                                  <span style={{ color: 'var(--t-accent-bright)', fontWeight: 600 }}>{k}</span>
                                  {'  '}{v.join('  ')}
                                </span>
                              ) : <span key={i} style={{ display: 'block' }}>{line}</span>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* System Prompt */}
                    <div className="ag-prompt">
                      <div className="ag-prompt-h">
                        <span>System Prompt</span>
                        <span style={{ opacity: .6, fontWeight: 400, letterSpacing: '.04em', textTransform: 'none' }}>writing · — / — tokens</span>
                      </div>
                      <pre className="ag-prompt-pre">{`role:  ${nd.type === 'coordinator' ? 'Coordinator' : 'Agent'} · ${nd.title}\ntask:  ${nd.sub || '—'}\ntools: ${nd.chips.join(' · ') || '—'}`}</pre>
                    </div>

                    {/* Tool Decision Log */}
                    {pickedTools.length > 0 && (
                      <div className="ag-tool-log">
                        <div className="ag-tool-log-h">Tool Decision Log
                          <span style={{ marginLeft: 'auto', opacity: .6 }}>候选 {pickedTools.length + rejectedTools.length} · 选定 {pickedTools.length}</span>
                        </div>
                        <div className="ag-tool-grid">
                          <div className="ag-tool-col">
                            <div className="ag-tool-col-h">PICKED <span style={{ marginLeft: 'auto' }}>{pickedTools.length}</span></div>
                            {pickedTools.map(t => (
                              <div key={t} className="ag-tool-row ag-tool-picked">
                                <span className="ag-tool-ic" style={{ background: '#10B981', color: '#0A0A0A' }}>✓</span>
                                <span className="ag-tool-nm">{t}</span>
                              </div>
                            ))}
                          </div>
                          <div className="ag-tool-col" style={{ borderLeft: '1px solid var(--t-border)' }}>
                            <div className="ag-tool-col-h">REJECTED <span style={{ marginLeft: 'auto' }}>{rejectedTools.length}</span></div>
                            {rejectedTools.map(t => (
                              <div key={t} className="ag-tool-row ag-tool-rejected">
                                <span className="ag-tool-ic" style={{ color: 'var(--t-fg-4)' }}>✗</span>
                                <span className="ag-tool-nm" style={{ opacity: .5 }}>{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live stream bar */}
                    {isBuilding && (
                      <div className="ag-stream">
                        <span className="ag-stream-lbl">LIVE</span>
                        <span style={{ color: 'var(--t-accent-bright)' }}>{nd.sub || '处理中…'}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : (
        /* Overview tab — redesigned "Review run session" panel */
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px 22px 32px' }}>

            <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px', color: 'var(--t-fg)' }}>
              Review run session
            </h1>

            {/* Status card */}
            <section style={{ border: '1px solid var(--t-border)', borderRadius: 10, padding: '13px 15px', marginTop: 14, background: 'var(--t-panel)' }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--t-fg-2)', margin: '0 0 11px' }}>
                Your AI team has produced a draft section. Approve to commit to the canvas, or send back for revision. Decisions are routed by the Policy Matrix.
              </p>
              <div style={{ display: 'flex', gap: 14, marginBottom: 11 }}>
                {[
                  { label: 'Live', on: true },
                  { label: 'On-chain', on: true },
                  { label: 'Auto-approve', on: false },
                ].map(({ label, on }) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, cursor: 'pointer', color: 'var(--t-fg-3)' }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', border: `1px solid ${on ? '#10B981' : 'var(--t-border)'}`, background: on ? '#10B981' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: on ? '#0A0A0A' : 'var(--t-fg-4)', flexShrink: 0 }}>{on ? '✓' : '○'}</span>
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-3)' }}>Open this run</span>
                <button
                  type="button"
                  onClick={session.isComplete ? onOpenEditor : undefined}
                  style={{ padding: '5px 11px', border: '1px solid var(--t-border)', borderRadius: 7, fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, cursor: 'pointer', background: 'transparent', color: 'var(--t-fg-3)' }}
                >
                  ↗ Open in Editor
                </button>
              </div>
            </section>

            {/* Callout — retry budget / warning */}
            {!session.isComplete && session.nodes.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid rgba(245,158,11,.28)', borderRadius: 10, marginTop: 10, background: 'rgba(245,158,11,.05)' }}>
                <span style={{ fontSize: 13, flexShrink: 0, color: '#F59E0B' }}>⚠</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)' }}>Retry budget low</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, marginTop: 2, lineHeight: 1.4, color: 'var(--t-fg-3)' }}>Reader is on round 2 of 3 — one more rejection will roll back to Draft.</div>
                </div>
                <button type="button" style={{ padding: '4px 10px', border: '1px solid rgba(245,158,11,.32)', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: '#F59E0B', flexShrink: 0 }}>↻ Adjust</button>
              </div>
            )}

            {/* Team section */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', flex: 1, color: 'var(--t-fg-3)' }}>Team</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)', color: 'var(--t-fg-4)' }}>{session.nodes.length || 4}</span>
                <span style={{ fontSize: 11, opacity: .45, color: 'var(--t-fg-4)' }}>›</span>
              </div>
              <div style={{ border: '1px solid var(--t-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--t-panel)' }}>
                {[
                  { name: 'workflow-dag', meta: `canvas · ${session.nodes.length || 0} nodes`, status: 'run' as const },
                  { name: 'policy-matrix', meta: '5 × 5', status: 'ok' as const },
                  { name: 'handoffs', meta: `${session.edges.length || 0} edges`, status: 'ok' as const },
                  { name: 'activity-log', meta: `${session.steps.length} events`, status: 'run' as const },
                ].map(row => (
                  <button key={row.name} type="button" className="rs-ov-row" onClick={() => setRightTab('team')}>
                    <span style={{ fontSize: 11, opacity: .38, flexShrink: 0, color: 'var(--t-fg-4)' }}>›</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--t-fg-4)' }}>{row.meta}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 4, background: row.status === 'run' ? '#A855F7' : '#10B981', boxShadow: row.status === 'run' ? '0 0 5px rgba(168,85,247,.5)' : 'none' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Agents section */}
            {session.nodes.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', flex: 1, color: 'var(--t-fg-3)' }}>Agents</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)', color: 'var(--t-fg-4)' }}>{session.nodes.filter(n => n.type === 'agent').length}</span>
                  <span style={{ fontSize: 11, opacity: .45, color: 'var(--t-fg-4)' }}>›</span>
                </div>
                <div style={{ border: '1px solid var(--t-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--t-panel)' }}>
                  {session.nodes.map(node => (
                    <button key={node.id} type="button" className="rs-ov-row" onClick={() => switchToAgent(node.id)}>
                      <span style={{ fontSize: 11, opacity: .38, flexShrink: 0, color: 'var(--t-fg-4)' }}>›</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title || node.id}</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--t-fg-4)' }}>{node.sub || 'idle'}</span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 4, background: node.status === 'ready' ? '#10B981' : node.status === 'building' ? '#A855F7' : 'var(--t-fg-5)' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blueprint file ref */}
            {session.blueprintFile && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--t-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--t-fg-4)', marginBottom: 6 }}>Blueprint</div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--t-accent-bright)' }}>{session.blueprintFile}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Story 15.14 — 5+1 维质量自检结果（生成完成 + critique 完成后才出现）
          2026-05-11 Story 15.30 follow-up: 当 critique 因为无 BYOK key 跳过
          (NO_API_KEY) 时，CritiqueResult 返回 null — 同时 gate 外层 wrapper
          以免显示一条空的 borderTop+background 横条。 */}
      {session.critiqueResult && session.critiqueResult.error_code !== 'CRITIQUE_NO_API_KEY' && (
        <div
          data-testid="critique-result-mount"
          style={{
            borderTop: '1px solid var(--t-border)',
            background: 'var(--t-panel)',
            flexShrink: 0,
          }}
        >
          <CritiqueResult result={session.critiqueResult} />
        </div>
      )}
    </section>
  );
}

const toolbarIconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--t-fg-4)',
  fontSize: 14,
  width: 28,
  height: 28,
  borderRadius: 5,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const toolbarBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  transition: 'background 120ms ease, color 120ms ease',
};

// ---------------------------------------------------------------------------
// Error banner — classified by ErrorCode with a tailored CTA per bucket.
// ---------------------------------------------------------------------------
//
// Replaces the legacy "uniform red strip + regex sniff for API key" banner.
// Each bucket renders the same shell (color-coded border + lucide icon +
// title + message) and a single primary CTA tuned to the failure mode:
//
//   auth             → KeyRound      "配置 API Key"  → setShowKeyEditor(true)
//   rate_limit       → Timer         "稍后重试"      → 30s countdown then "重发"
//   context_too_long → Plus          "新建会话"      → onNewSession()
//   network          → WifiOff       "重发"          → onResend()
//   server / unknown → ServerCrash   "重发"          → onResend()
//
// Color tokens follow the spec: `auth/rate_limit` warm (--t-warn); the rest
// red (--t-err). 5x retry stacking is collapsed into the `occurrences`
// counter on SessionError (see useRunSession.ERROR reducer).

interface ErrorBannerProps {
  error: SessionError;
  resending: boolean;
  onResend: () => void;
  onConfigureKey: () => void;
  onNewSession: () => void;
}

function ErrorBanner({ error, resending, onResend, onConfigureKey, onNewSession }: ErrorBannerProps) {
  const { t } = useI18n();
  // 30s rate-limit countdown. Restarts when a NEW rate_limit error arrives
  // (occurrences increment) so back-to-back 429s reset the timer instead of
  // letting the user spam-click while still throttled.
  const [cooldown, setCooldown] = useState<number>(error.code === 'rate_limit' ? 30 : 0);
  useEffect(() => {
    if (error.code !== 'rate_limit') {
      setCooldown(0);
      return;
    }
    setCooldown(30);
    const handle = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, [error.code, error.occurrences]);

  // 'auth' and 'rate_limit' are recoverable user-actionable conditions —
  // warm yellow. The rest are red.
  const isWarn = error.code === 'auth' || error.code === 'rate_limit';
  const tone = isWarn ? 'var(--t-warn)' : 'var(--t-err)';
  const bg = isWarn ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)';
  const border = isWarn ? 'rgba(245,158,11,.35)' : 'rgba(239,68,68,.3)';

  // Per-bucket metadata. `defaultHint` is rendered when SessionError.hint is
  // empty; the server may override by passing a `hint` field on the error
  // event.
  const meta: Record<SessionError['code'], { title: string; defaultHint?: string; Icon: typeof AlertTriangle }> = {
    auth: {
      title: '认证失败',
      defaultHint: 'API Key 无效或已过期。请在设置中重新填入。',
      Icon: KeyRound,
    },
    rate_limit: {
      title: '速率限制',
      defaultHint: '请求过于频繁，已达 provider 限额。',
      Icon: Timer,
    },
    context_too_long: {
      title: '上下文超长',
      defaultHint: '当前会话累计上下文超过模型上限，新建会话以重置。',
      Icon: AlertTriangle,
    },
    network: {
      title: '网络异常',
      defaultHint: '无法连接到服务，请检查网络后重试。',
      Icon: WifiOff,
    },
    server: {
      title: '服务暂时不可用',
      defaultHint: '上游服务报错，请稍后重试。',
      Icon: ServerCrash,
    },
    unknown: {
      title: '运行失败',
      Icon: AlertTriangle,
    },
  };

  const { title, defaultHint, Icon } = meta[error.code];

  // Repeated retry suffix: "（已重试 N 次）" once occurrences > 1. The
  // banner replaces (rather than stacks) so the screen stays calm even
  // when a 429 storm happens.
  const occSuffix = error.occurrences > 1 ? `（已重试 ${error.occurrences} 次）` : '';
  const hint = error.hint ?? defaultHint;

  // Primary CTA — one per bucket. We keep "重发" as a secondary action on
  // auth so users can manually retry after fixing the cause.
  const primary = (() => {
    switch (error.code) {
      case 'auth':
        return { Icon: KeyRound, label: '配置 API Key', onClick: onConfigureKey, disabled: false };
      case 'rate_limit':
        return {
          Icon: cooldown > 0 ? Timer : RotateCcw,
          label: cooldown > 0 ? `稍后重试 (${cooldown}s)` : '重发',
          onClick: onResend,
          disabled: cooldown > 0 || resending,
        };
      case 'context_too_long':
        return { Icon: Plus, label: '新建会话', onClick: onNewSession, disabled: false };
      case 'network':
      case 'server':
      case 'unknown':
      default:
        return { Icon: RotateCcw, label: '重发', onClick: onResend, disabled: resending };
    }
  })();

  // For warn-tone buckets we still offer "重发" as a secondary text button.
  const showSecondaryResend = error.code === 'auth';

  return (
    <div
      data-testid="rs-error-banner"
      data-error-code={error.code}
      role="alert"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        color: tone,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <Icon size={14} strokeWidth={2} aria-hidden style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          {title}
          {occSuffix && (
            <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>{occSuffix}</span>
          )}
        </div>
        <div style={{ color: 'var(--t-fg-3)', wordBreak: 'break-word' }}>{error.message}</div>
        {hint && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--t-fg-4)' }}>{hint}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            data-testid="rs-error-banner-cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              background: tone,
              border: `1px solid ${tone}`,
              color: '#fff',
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: primary.disabled ? 'not-allowed' : 'pointer',
              opacity: primary.disabled ? 0.6 : 1,
            }}
          >
            <primary.Icon size={11} strokeWidth={2} aria-hidden />
            {primary.label}
          </button>
          {showSecondaryResend && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              data-testid="rs-error-banner-resend"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-3)',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: resending ? 'wait' : 'pointer',
                opacity: resending ? 0.6 : 1,
              }}
            >
              <RotateCcw size={11} strokeWidth={2} aria-hidden />
              {t('common.resend')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel
// ---------------------------------------------------------------------------
interface LeftPanelProps {
  sessionId: string;
  goal: string;
  skillUrl?: string;
  session: ReturnType<typeof useRunSession>;
  collapsed: boolean;
  onCollapse: () => void;
}

function LeftPanel({ sessionId, goal, skillUrl, session, collapsed, onCollapse }: LeftPanelProps) {
  const { t } = useI18n();
  // 2026-05-11 Story 15.30 follow-up: handleSend 现在派生新 run session 后需要
  // navigate 到新 URL，让 useRunSession hook 自动 teardown + 重订阅新 SSE 流。
  const navigate = useNavigate();
  // 2026-05-16 — Draft persistence. Scope by sessionId; fall back to
  // ?conversation_id= (multi-turn continuation) then a 'global' bucket so
  // the prep page also benefits during back-nav. Empty / refresh / accidental
  // session switch no longer wipes whatever the user just typed.
  const [searchParamsForDraft] = useSearchParams();
  const draftKey = sessionId || searchParamsForDraft.get('conversation_id') || 'global';
  const [message, setMessage] = useState<string>(() => loadDraft(draftKey));
  // Story 15.7: re-render whenever the stored API key changes (save / clear).
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const agentCount = session.nodes.filter((n) => n.type === 'agent').length;
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  // S2.4 + S4.3 — step artifact drawer state. `drawerStep === null` keeps the
  // drawer closed; clicking "查看产出" in <StepList> sets it to the step
  // index. Toast strings live alongside so the retry handler can surface
  // 404 (endpoint missing) feedback without throwing.
  const [drawerStep, setDrawerStep] = useState<number | null>(null);
  const [retryToast, setRetryToast] = useState<string | null>(null);
  // S6.10-C — Timeline left-pane feature flag. Default on (matches v8 design).
  // Set `sf.legacyLeftPane=1` in localStorage to fall back to the pre-S6.10
  // StepList + goal-bubble stack. Checker (#38) verifies incremental emit
  // behavior under the default-on path.
  const useTimeline = (() => {
    try {
      return localStorage.getItem('sf.legacyLeftPane') !== '1';
    } catch {
      return true;
    }
  })();
  // 2026-05-18 (agent-4) — thinkExpanded / thinkTitleHover moved into the
  // ThinkCard component itself. We keep the duration tracker here because
  // it depends on session-level state (chatReply / isComplete) that the
  // card shouldn't observe directly.
  const thinkStartRef = useRef<number | null>(null);
  const [thinkDurationMs, setThinkDurationMs] = useState<number | null>(null);
  const thinkStreaming = Boolean(
    session.thinkingMessage && session.chatReply.length === 0 && !session.isComplete,
  );
  useEffect(() => {
    if (session.thinkingMessage && thinkStartRef.current === null) {
      thinkStartRef.current = Date.now();
      setThinkDurationMs(null);
    }
    // End condition: chatReply started or thinkingMessage cleared
    if (thinkStartRef.current !== null && !thinkStreaming && thinkDurationMs === null) {
      setThinkDurationMs(Date.now() - thinkStartRef.current);
    }
  }, [session.thinkingMessage, session.chatReply, session.isComplete, thinkStreaming, thinkDurationMs]);
  // Tick at 5Hz so the live elapsed-ms display refreshes while streaming.
  const [thinkTick, setThinkTick] = useState(0);
  useEffect(() => {
    if (!thinkStreaming) return;
    const id = window.setInterval(() => setThinkTick(t => t + 1), 200);
    return () => window.clearInterval(id);
  }, [thinkStreaming]);
  void thinkTick;
  const liveThinkMs =
    thinkStreaming && thinkStartRef.current !== null ? Date.now() - thinkStartRef.current : null;
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('sf.model') ?? 'claude-sonnet-4-6',
  );
  const [selectedExecutor, setSelectedExecutor] = useState<string>(
    () => localStorage.getItem('sf.defaultExecutor') ?? '',
  );

  // 2026-05-16 — Debounced draft autosave (300ms). Empty `message` clears the
  // entry inside saveDraft, so the localStorage row goes away cleanly when
  // the user wipes the box without sending.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      saveDraft(draftKey, message);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draftKey, message]);

  // sessionStorage cache so the picker is instant across page navigations
  // within a session — agents/detect spawns up to 16 CLI subprocesses each
  // with a 3s timeout, which can take 10-15s on a cold open. We prefill
  // from cache, render immediately, then silently refresh in the background.
  const PICKER_CACHE_KEY = 'sf.modelPicker.cache.v1';
  const PICKER_CACHE_TTL_MS = 60_000;
  function loadCachedPicker(): { cli: PickerCliItem[]; api: PickerApiItem[]; ts: number } | null {
    try {
      const raw = sessionStorage.getItem(PICKER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > PICKER_CACHE_TTL_MS) return null;
      return parsed;
    } catch { return null; }
  }
  function saveCachedPicker(cli: PickerCliItem[], api: PickerApiItem[]) {
    try {
      sessionStorage.setItem(PICKER_CACHE_KEY, JSON.stringify({ cli, api, ts: Date.now() }));
    } catch {/* sessionStorage may be full or disabled */}
  }

  const [pickerCliItems, setPickerCliItems] = useState<PickerCliItem[]>(
    () => loadCachedPicker()?.cli ?? [],
  );
  const [pickerApiItems, setPickerApiItems] = useState<PickerApiItem[]>(
    () => loadCachedPicker()?.api ?? [],
  );
  const [pickerLoading, setPickerLoading] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  // Prewarm on mount — start the agents/detect + /byok requests immediately
  // so by the time the user clicks the model icon, results are already in.
  // Only shows the spinner if we have nothing cached.
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE ?? '';
    const hasCached = pickerCliItems.length > 0 || pickerApiItems.length > 0;
    if (!hasCached) setPickerLoading(true);
    Promise.all([fetchPickerCliItems(apiBase), fetchPickerApiItems(apiBase)])
      .then(([cli, api]) => {
        setPickerCliItems(cli);
        setPickerApiItems(api);
        saveCachedPicker(cli, api);
      })
      .finally(() => setPickerLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-refresh silently when picker opens (catches newly-installed CLIs /
  // newly-added BYOK keys without blocking UI on the data we already have).
  useEffect(() => {
    if (!showModelPicker) return;
    const apiBase = import.meta.env.VITE_API_BASE ?? '';
    const hasData = pickerCliItems.length > 0 || pickerApiItems.length > 0;
    if (!hasData) setPickerLoading(true);
    Promise.all([fetchPickerCliItems(apiBase), fetchPickerApiItems(apiBase)])
      .then(([cli, api]) => {
        setPickerCliItems(cli);
        setPickerApiItems(api);
        saveCachedPicker(cli, api);
      })
      .finally(() => setPickerLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModelPicker]);

  // 2026-05-11 Layer 1 — Claude Code-style chat fallback.
  // Requires actual chatReply text AND no error. The 5x-retry path stuffs
  // repeated "Failed to authenticate..." into chatReply via daemon text
  // events, so a bare chatReply check still triggers single-page mode.
  // session.error gating keeps the canvas open whenever the run failed
  // (2026-05-16 hardening — second pass after first fix proved insufficient).
  const isChatMode =
    session.chatReply.trim().length > 0 &&
    session.steps.length === 0 &&
    session.nodes.length === 0 &&
    !session.blueprintFile &&
    !session.error &&
    !session.chatReply.includes('<sf:') &&
    (session.outputType == null || session.outputType === 'chat');

  // Close model picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (modelBtnRef.current && !modelBtnRef.current.closest('[data-model-picker]')?.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelPicker]);

  // 2026-05-16 Scroll anchoring + Jump-to-latest pill.
  // When the user scrolls up from the bottom of the stream area we mark
  // `userScrolledAway` so the auto-scroll effect below stops fighting them.
  // Once they get back within 10px of the bottom we re-arm auto-scroll.
  const streamRef = useRef<HTMLDivElement | null>(null);
  const [userScrolledAway, setUserScrolledAway] = useState(false);
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const update = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 100) {
        setUserScrolledAway((prev) => (prev ? prev : true));
      } else if (distanceFromBottom < 10) {
        setUserScrolledAway((prev) => (prev ? false : prev));
      }
    };
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', update, { passive: true });
    el.addEventListener('touchstart', update, { passive: true });
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', update);
      el.removeEventListener('touchstart', update);
    };
  }, []);

  // Auto-scroll to bottom on new stream content — but only when the user
  // hasn't scrolled away. Triggered by any of the things that drive the
  // visible stream area (chatReply, steps, nodes, yaml lines, thinking).
  useEffect(() => {
    if (userScrolledAway) return;
    const el = streamRef.current;
    if (!el) return;
    // Use rAF so the scroll happens after React commits the new content.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [
    userScrolledAway,
    session.chatReply,
    session.steps.length,
    session.nodes.length,
    session.yamlLines.length,
    session.thinkingMessage,
    session.tokenCount,
  ]);

  const jumpToLatest = () => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUserScrolledAway(false);
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text && attachedFiles.length === 0) return;

    // 读取文本类附件内容，拼成 fenced code block 放在消息最前面
    let fullContent = text;
    if (attachedFiles.length > 0) {
      const blocks: string[] = [];
      for (const file of attachedFiles) {
        const isText =
          file.type.startsWith('text/') ||
          /\.(txt|md|json|yaml|yml|ts|tsx|js|jsx|py|go|rs|sh|bash|css|html|xml|csv|toml|env)$/i.test(file.name);
        if (isText && file.size <= 100 * 1024) {
          const content = await file.text();
          const ext = file.name.split('.').pop() ?? '';
          blocks.push(`\`\`\`${ext} title="${file.name}"\n${content}\n\`\`\``);
        } else {
          blocks.push(`[附件: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`);
        }
      }
      fullContent = blocks.join('\n\n') + (text ? '\n\n' + text : '');
    }

    setMessage('');
    setAttachedFiles([]);
    try {
      const overrides = buildPickerOverrides(selectedExecutor, selectedModel);
      const resp = await fetch(`/api/run-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent, ...overrides }),
      });
      if (!resp.ok) {
        console.warn(`[run-session] follow-up POST failed: HTTP ${resp.status}`);
        setMessage(text);
        return;
      }
      // 2026-05-16 — Send succeeded: drop the 24h draft so a refresh on
      // the new run-session URL doesn't repopulate the box with what we
      // just sent. Debounce can't race because we cleared the message
      // before the await above.
      clearDraft(draftKey);
      const data = (await resp.json()) as { session_id?: string };
      if (data.session_id) {
        const params = new URLSearchParams({ goal: fullContent.slice(0, 200) });
        navigate(`/run-session/${data.session_id}?${params.toString()}`);
      }
    } catch (err) {
      console.warn('[run-session] follow-up POST error:', err);
      setMessage(text);
    }
  };

  // 2026-05-16: Resend the user's last goal as a fresh follow-up turn.
  // Reuses POST /messages; daemon forks a new run session and the URL change
  // triggers SSE re-subscribe. The follow-up inherits source settings, so we
  // must explicitly forward the user's CURRENT picker (model/provider/key)
  // — otherwise a 401 on the original credential will repeat forever.
  const [resending, setResending] = useState(false);
  const handleResend = async (text: string) => {
    const content = text.trim();
    if (!content || resending) return;
    setResending(true);
    try {
      const overrides = buildPickerOverrides(selectedExecutor, selectedModel);

      const resp = await fetch(`/api/run-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...overrides }),
      });
      if (!resp.ok) {
        console.warn(`[run-session] resend POST failed: HTTP ${resp.status}`);
        return;
      }
      const data = (await resp.json()) as { session_id?: string };
      if (data.session_id) {
        const params = new URLSearchParams({ goal: content.slice(0, 200) });
        navigate(`/run-session/${data.session_id}?${params.toString()}`);
      }
    } catch (err) {
      console.warn('[run-session] resend error:', err);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-panel)',
        borderRight: isChatMode ? 'none' : '1px solid var(--t-border)',
        width: isChatMode ? '100%' : 420,
        maxWidth: isChatMode ? 680 : 420,
        margin: isChatMode ? '0 auto' : 0,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--t-border)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {/* Mark — rounded square with S-curve SVG + spinning conic border */}
        <div
          className="rs-mark"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(168,85,247,.28), rgba(168,85,247,.08))',
            border: '1px solid rgba(168,85,247,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--t-accent-bright)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M13.5 4C7 4 5.5 8 10 10C14.5 12 13 16 6.5 16" opacity=".22" transform="translate(2 1.5)" />
            <path d="M13.5 4C7 4 5.5 8 10 10C14.5 12 13 16 6.5 16" transform="translate(2 1.5)" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--t-fg)',
              lineHeight: 1.2,
            }}
          >
            Run Session
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-4)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            run_{sessionId} · {session.isComplete ? '已完成' : '构建中'}
          </div>
          {skillUrl && (
            <a
              href={skillUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={skillUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                marginTop: 2,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                color: 'var(--t-accent)',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                opacity: 0.8,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.8'; (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
            >
              <ExternalLink size={8} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
              {skillUrl.replace('https://raw.githubusercontent.com/', 'gh/')}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse left panel"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-4)',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Stream area — wrapped in a relative container so the
          jump-to-latest pill can float at the bottom-right without
          scrolling away with the content. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      <div
        ref={streamRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Story 15.7 — BYOK banner: shown when no Anthropic key is configured.
            2026-05-11 bug fix — only show when the user is going to use the
            direct Anthropic SDK path (`anthropic-direct`). When they pick a
            local CLI (`cli:*`) the child binary handles its own auth (e.g.
            `claude login`), so the banner is misleading and would block users
            who legitimately don't have an Anthropic API key. */}
        {!apiKey && !showKeyEditor && (() => {
          try {
            // 2026-05-11 Story 15.30 (OpenDesign 模式): 默认 'cli:auto' — banner
            // 仅当用户显式选了 anthropic-direct 时才提醒 BYOK。cli:auto 路径无
            // CLI 时走 anthropic-direct fallback 时，server 端会 emit NO_API_KEY
            // error 事件，前端通过 onServerError 单独 handle（不再用 banner）。
            const ex = localStorage.getItem('sf.defaultExecutor') || 'cli:auto';
            return ex === 'anthropic-direct';
          } catch {
            return true;
          }
        })() && (
          <div
            data-testid="byok-banner"
            style={{
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.35)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--t-warn, #f59e0b)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Key size={14} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ flex: 1, lineHeight: 1.5 }}>
              {t('skillStudio.byok.bannerNeed')}
              <button
                type="button"
                onClick={() => setShowKeyEditor(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 4,
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                {t('skillStudio.byok.bannerCta')}
              </button>
            </span>
          </div>
        )}

        {/* Inline ApiKey editor — when user clicks "立即配置" or while no key + editor open. */}
        {(!apiKey && showKeyEditor) || (apiKey && showKeyEditor) ? (
          <ApiKeySettings
            compact
            onChange={(next) => {
              setApiKey(next);
              if (next) setShowKeyEditor(false);
            }}
          />
        ) : null}

        {/* Error banner — classified by ErrorCode, routes to the right CTA.
            AC3 / 2026-05-16: legacy regex sniff replaced by ErrorBanner which
            forks on session.error.code (server-classified + client fallback).
            New session navigates to /start so the user can pick a fresh skill /
            conversation rather than reusing the failed one. */}
        {session.error && (
          <ErrorBanner
            error={session.error}
            resending={resending}
            onResend={() => handleResend(goal)}
            onConfigureKey={() => setShowKeyEditor(true)}
            onNewSession={() => navigate('/start')}
          />
        )}

        {/* Retrying indicator */}
        {session.retrying && (
          <div
            style={{
              color: 'var(--t-fg-4)',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {t('runSession.reconnecting')} {session.retryAttempt}
          </div>
        )}

        {/* S6.10-C — new Timeline (Trae-style incremental message stream).
            Renders by default; legacy block below is kept as opt-in fallback
            via localStorage `sf.legacyLeftPane=1`. */}
        {useTimeline && (
          <Timeline messages={session.messages} />
        )}

        {/* ─── Legacy left-pane stack (pre-S6.10) ─────────────────────────
            Wrapped in `!useTimeline` so the new Timeline owns the visual
            during incremental rollout. Toggle back via localStorage. */}
        {!useTimeline && (
          <>
        {/* User goal bubble — hover reveals "重发" action. When the session
            ended in error (e.g. claude exit 1 / 403), the resend button is
            always visible so users don't need to discover it via hover. */}
        {goal && (
          <div
            className="group"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
            }}
          >
            <div
              style={{
                maxWidth: 340,
                padding: '10px 14px',
                borderRadius: '14px 14px 4px 14px',
                background: 'var(--t-accent-tint)',
                border: '1px solid var(--t-accent)',
                color: 'var(--t-accent-bright)',
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              {goal}
            </div>
            <button
              type="button"
              onClick={() => handleResend(goal)}
              disabled={resending}
              title={t('runSession.restartWithSameGoal')}
              data-testid="rs-resend-goal"
              className={session.error ? '' : 'sf-resend-hover'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-4)',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: resending ? 'wait' : 'pointer',
                opacity: session.error ? 1 : 0,
                transition: 'opacity .15s, color .15s, border-color .15s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = 'var(--t-fg)';
                el.style.borderColor = 'var(--t-border-2)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = 'var(--t-fg-4)';
                el.style.borderColor = 'var(--t-border)';
              }}
            >
              <RotateCcw size={11} strokeWidth={2} aria-hidden />
              {resending ? '重发中…' : '重发'}
            </button>
          </div>
        )}

        {/* 2026-05-11 kit alignment — system-divider: transitional system event
            marker inside chat stream. Skipped in chat mode (chat bubbles ARE
            the visual). Shown when:
              • stream has nothing yet and run isn't done  → WAITING FOR LLM
              • run completed without error                → DONE  */}
        {!isChatMode &&
          session.steps.length === 0 &&
          session.nodes.length === 0 &&
          !session.chatReply &&
          !session.isComplete &&
          !session.error && (
            <div className="system-divider">WAITING FOR LLM</div>
          )}
        {!isChatMode && session.isComplete && session.error == null && (
          <div className="system-divider">DONE</div>
        )}

        {/* Assistant chat bubble — Claude Code-style plain reply. Renders
            incrementally as `text` SSE events arrive. Shown for both chat
            mode (no canvas) and the "LLM is thinking out loud before tags"
            transient window.
            2026-05-11 bug fix: `chatReply` 偶尔只累积 server text delta 里
            的换行/空白（Claude 在结构化 <sf:*> 标签之间或正式内容前的换行
            铺垫），truthy 但视觉是空白竖条。trim 后非空才渲染气泡。*/}
        {session.chatReply && session.chatReply.trim().length > 0 && (
          <div
            className="group"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 0,
            }}
          >
            <div
              style={{
                maxWidth: 420,
                padding: '10px 14px',
                // 2026-05-11 kit alignment: assistant bubble has sharp
                // TOP-LEFT corner (speaker comes from upper-left). CSS
                // shorthand is top-left top-right bottom-right bottom-left.
                borderRadius: '4px 14px 14px 14px',
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-2)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {/* Render fenced ```code``` segments through the unified
                  CodeBlockToolbar (Story: code-block toolbar). Plain-text
                  runs preserve the existing pre-wrap whitespace. The fence
                  parser is streaming-safe: an unterminated ``` opens a
                  code segment with whatever text has arrived so far. */}
              {parseCodeFences(session.chatReply).map((seg, i) =>
                seg.kind === 'code' ? (
                  <div key={i} style={{ margin: '6px 0' }}>
                    <CodeBlockToolbar code={seg.value} lang={seg.lang} />
                  </div>
                ) : (
                  <span key={i}>{seg.value}</span>
                )
              )}
              {!session.isComplete && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 14,
                    marginLeft: 2,
                    background: 'var(--t-fg-4)',
                    verticalAlign: 'text-bottom',
                    animation: 'sf-blink 1s steps(2) infinite',
                  }}
                />
              )}
            </div>
            {/* Hover-revealed action row — Copy / (Retry) / placeholders.
                Retry handler intentionally omitted here; a downstream task
                will wire it to handleResend once the contract stabilizes. */}
            <MessageActions text={session.chatReply} align="left" />
          </div>
        )}

        {/* Canvas-mode-only chrome: mode divider + step list. Hidden in chat
            mode so trivial inputs ("hi") render only the chat bubble. */}
        {!isChatMode && session.mode && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-4)',
              padding: '4px 0',
            }}
          >
            已识别 · {session.mode} 模式{agentCount > 0 ? ` · ${agentCount} 个 Agent` : ''}
          </div>
        )}

        {/* Progress steps — only after SSE delivers the first <sf:step>.
            2026-05-11 UX fix: previously 6 zh-CN placeholders rendered before
            any work began, leaking implementation detail.
            Layer 1: also suppressed in chat mode (no `<sf:step>` will ever
            arrive when LLM is plain-text-replying). */}
        {!isChatMode && session.steps.length > 0 ? (
          // S0.3 — StepList component replaces inline ProgressSteps render.
          // The ProgressSteps function (defined above) is kept in the module
          // for back-compat / quick revert. Rows now expose "查看产出" +
          // "重跑" inline actions wired to drawerStep + retryStepApi.
          // (activeSubsteps render is dropped here; the substep rows lived
          // inside ProgressSteps as nested children — when those land in the
          // new design they should be added as a `substeps` prop to StepRow.)
          <StepList
            steps={session.steps.map<StepRow>((s, i) => {
              // Parse "12.3s" / "234ms" back into raw ms when possible. The
              // reducer formats elapsed_ms into a display string before we
              // see it; StepList prefers raw ms so formatting stays uniform.
              let elapsedMs: number | null = null;
              if (s.elapsed) {
                const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/i.exec(s.elapsed.trim());
                if (m) {
                  const v = parseFloat(m[1]);
                  const unit = (m[2] ?? 's').toLowerCase();
                  elapsedMs = unit === 'ms' ? v : unit === 'm' ? v * 60_000 : v * 1000;
                }
              }
              // S6.8 — flatten agent substeps under the "配置 Agent 角色"
              // parent step. Same-substep running+done pair collapses to a
              // single row (the reducer merges them in place by name).
              //
              // S0 (2026-05-20) — 前端不再为缺 substep 的 node 补 pending placeholder。
              // 后端不 emit = 前端不显示。缺帧 = 后端 bug，暴露不掩盖。设计稿
              // docs/design/skill-team-conversion-design-v1.md §4.5 + S7.4.5
              // "前端不要 mock，必须是后端真实 SSE 传入"。
              let substeps: StepRow['substeps'] = undefined;
              if (s.name === '配置 Agent 角色') {
                substeps = [];
                for (const node of session.nodes) {
                  if (!node.substeps || node.substeps.length === 0) continue;
                  for (const sub of node.substeps) {
                    // Merge identity + persona into one label per v3 screenshot.
                    const labelSlot = sub.name === 'identity' ? 'identity + persona' : sub.name;
                    substeps.push({
                      label: `${node.title} · ${labelSlot}`,
                      status: sub.status === 'failed' ? 'failed' : sub.status,
                      elapsedMs: sub.elapsedMs,
                    });
                  }
                }
              }
              return {
                index: i,
                name: s.name,
                status: s.status,
                elapsedMs,
                hasArtifact: session.stepArtifacts?.[i] != null,
                substeps,
              };
            })}
            onStepView={(idx) => setDrawerStep(idx)}
            onStepRetry={async (idx) => {
              const accepted = await retryStepApi(sessionId, idx);
              setRetryToast(accepted ? '重跑请求已发送' : '该端点尚未实现');
              setTimeout(() => setRetryToast(null), 2400);
              return accepted;
            }}
          />
        ) : (!isChatMode && !session.isComplete && !session.error) && (
          <div
            style={{
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              background: 'var(--t-panel)',
              padding: '14px 16px',
              fontSize: 12,
              color: 'var(--t-fg-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <InlineSpinner size={10} />
            <span>{t('runSession.awaitingLLM')}</span>
          </div>
        )}

        {/* Rationale cards */}
        {session.rationaleCards.map((card, i) => (
          <div
            key={i}
            style={{
              background: 'var(--t-accent-tint)',
              border: '1px solid rgba(168,85,247,.2)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-accent-bright)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginBottom: 4,
              }}
            >
              {card.title}
              {card.duration_ms ? ` · ${(card.duration_ms / 1000).toFixed(1)}s` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {/* Rationale bodies sometimes embed ```yaml or ```ts snippets
                  (DAG fragments, policy snippets). Route fences through the
                  unified CodeBlockToolbar so users get copy/wrap/lines/fold;
                  plain prose paragraphs render as before. */}
              {parseCodeFences(card.body).map((seg, k) =>
                seg.kind === 'code' ? (
                  <div key={k} style={{ margin: '6px 0' }}>
                    <CodeBlockToolbar code={seg.value} lang={seg.lang} />
                  </div>
                ) : (
                  <span key={k}>{seg.value}</span>
                )
              )}
            </div>
          </div>
        ))}

        {/* YAML real-time stream — now wrapped in CodeBlockToolbar to expose
            copy / wrap / line-numbers / fold while preserving the original
            "blueprint.yaml · N 行" caption above. */}
        {session.yamlLines.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--t-fg-4)',
                marginBottom: 4,
              }}
            >
              blueprint.yaml · {session.yamlLines.length} 行
            </div>
            <CodeBlockToolbar
              code={session.yamlLines.join('\n')}
              lang="yaml"
              showLineNumbers
              maxBodyHeight={160}
            />
          </div>
        )}

        {/* Thinking card — 2026-05-18 (agent-4) extracted from inline render
            into <ThinkCard> component (设计点 6). Mid-state spinner, folded
            preview, and expanded reasoning view all live there. */}
        <ThinkCard
          thinkingMessage={session.thinkingMessage}
          thinkingStream={session.thinkingStream}
          isStreaming={thinkStreaming}
          liveThinkMs={liveThinkMs}
          thinkDurationMs={thinkDurationMs}
          tokenCount={session.tokenCount}
          // S3.3 — persist folded/expanded per (sessionId, step). Uses a
          // synthetic "main" stepKey because there is currently only one
          // ThinkCard per run; if multiple cards land later (e.g. per-step
          // reasoning), pass each card's step name as stepKey.
          sessionId={sessionId}
          stepKey="main"
        />

        {/* Token counter divider */}
        {session.tokenCount > 0 && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-4)',
              padding: '4px 0',
            }}
          >
            {session.isComplete ? '已完成' : '流式中'} · 已写入 {session.tokenCount.toLocaleString()} tokens
          </div>
        )}
          </>
        )}
      </div>

      {/* Jump-to-latest pill — appears when the user has scrolled away
          from the bottom of the stream. Clicking it scrolls back and
          re-arms the auto-scroll. */}
      {userScrolledAway && (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Jump to latest"
          title="Jump to latest"
          className="sf-pulse"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 14,
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            color: 'var(--t-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,.22), 0 1px 3px rgba(0,0,0,.18)',
            zIndex: 5,
          }}
        >
          <ArrowDown size={16} strokeWidth={2.2} aria-hidden />
        </button>
      )}
      </div>

      {/* Footer — Composer */}
      <div
        style={{
          borderTop: '1px solid var(--t-border)',
          padding: '14px 16px',
          flexShrink: 0,
          background: 'var(--t-panel)',
          position: 'relative',
        }}
      >
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}
        {/* Inner bordered container */}
        <div
          style={{
            border: '1px solid var(--t-border)',
            borderRadius: 16,
            padding: '10px 12px 8px',
            background: 'var(--t-panel)',
          }}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setAttachedFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {attachedFiles.map((f, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 6px', border: '1px solid var(--t-border)', borderRadius: 999, fontSize: 11, color: 'var(--t-fg-3)', background: 'var(--t-bg)' }}>
                  <Paperclip size={10} strokeWidth={1.8} />
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--t-fg-4)', lineHeight: 1, marginLeft: 2 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {/* 2026-05-11 Story 15.30 follow-up: 移除 isComplete 禁用 — Story 15.29
              multi-turn 上线后，session.isComplete=true 正是发后续 message 的
              黄金时机（handleSend 派生新 run session + 透传 conversation_id 让
              prompt-assembly 自动注入历史）。原逻辑误把"主流程完成"当"对话结束"。*/}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              session.isComplete
                ? `继续对话 · 接着问 · ${kbdSendCmd()} 发送`
                : `补充指令 · 或保持沉默让 AI 完成 · ${kbdSendCmd()} 发送`
            }
            style={{
              width: '100%',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--t-fg)',
              fontSize: 13,
              lineHeight: 1.55,
              resize: 'none',
              minHeight: 44,
              maxHeight: 160,
              fontFamily: 'inherit',
              cursor: 'text',
            }}
          />
          {/* composer-bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            {/* Left — icon buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Settings — toggles inline popup */}
              <button
                type="button"
                title={t('runSession.sessionSettings')}
                onClick={() => setShowSettings(v => !v)}
                style={{
                  width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: showSettings ? 'var(--t-accent-tint)' : 'transparent',
                  border: showSettings ? '1px solid var(--t-accent)' : '0',
                  borderRadius: 7, cursor: 'pointer',
                  color: showSettings ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
                  transition: 'background .12s, color .12s',
                }}
              >
                <Settings size={14} strokeWidth={1.8} />
              </button>
              {/* Attach */}
              <button
                type="button"
                title={t('common.attachments')}
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: attachedFiles.length > 0 ? 'var(--t-accent-tint)' : 'transparent', border: 0, borderRadius: 7, cursor: 'pointer', color: attachedFiles.length > 0 ? 'var(--t-accent-bright)' : 'var(--t-fg-4)' }}
              >
                <Paperclip size={14} strokeWidth={1.8} />
              </button>
              {/* Model picker — click to open inline switcher */}
              <div style={{ position: 'relative' }} data-model-picker>
                {(() => {
                  let label = '选择模型';
                  let tooltip = '选择模型';
                  if (selectedExecutor.startsWith('cli:')) {
                    const id = selectedExecutor.slice(4);
                    const name = PICKER_CLI_META[id]?.name ?? id;
                    label = name;
                    tooltip = `CLI · ${name}`;
                  } else if (selectedExecutor.startsWith('byok:')) {
                    const pid = selectedExecutor.slice(5);
                    const provName = PICKER_PROVIDER_META[pid]?.name ?? pid;
                    label = selectedModel || provName;
                    tooltip = `API · ${provName} / ${selectedModel}`;
                  } else if (selectedModel) {
                    label = selectedModel;
                    tooltip = `模型: ${selectedModel}`;
                  }
                  return (
                    <button
                      ref={modelBtnRef}
                      type="button"
                      title={tooltip}
                      className="cmp-btn"
                      onClick={() => setShowModelPicker(v => !v)}
                      style={{
                        ...(showModelPicker ? {
                          background: 'var(--t-accent-tint)',
                          borderColor: 'var(--t-accent)',
                          color: 'var(--t-accent-bright)',
                        } : {}),
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        paddingLeft: 8,
                        paddingRight: 10,
                        width: 'auto',
                        maxWidth: 200,
                      }}
                    >
                      <Cpu size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {label}
                      </span>
                    </button>
                  );
                })()}
                {showModelPicker && (() => {
                  const renderItem = (it: PickerItem) => {
                    const active = it.kind === 'cli'
                      ? selectedExecutor === `cli:${it.agentId}`
                      : selectedExecutor === `byok:${it.providerId}` && selectedModel === it.modelId;
                    const key = it.kind === 'cli' ? `cli:${it.agentId}` : `byok:${it.providerId}:${it.modelId}`;
                    const title = it.kind === 'cli' ? it.name : it.modelId;
                    const sub = it.kind === 'cli'
                      ? (it.version ? it.version : 'CLI · installed')
                      : it.providerName;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={it.kind === 'cli' ? `${title} · ${sub}` : `${title} — ${sub}`}
                        onClick={() => {
                          if (it.kind === 'cli') {
                            const ex = `cli:${it.agentId}`;
                            localStorage.setItem('sf.defaultExecutor', ex);
                            setSelectedExecutor(ex);
                          } else {
                            const ex = `byok:${it.providerId}`;
                            localStorage.setItem('sf.defaultExecutor', ex);
                            localStorage.setItem('sf.model', it.modelId);
                            setSelectedExecutor(ex);
                            setSelectedModel(it.modelId);
                          }
                          setShowModelPicker(false);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 12px', border: 0, cursor: 'pointer',
                          background: active ? 'var(--t-accent-tint)' : 'transparent',
                          textAlign: 'left', transition: 'background .1s',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--t-hover, var(--t-panel))'; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          background: `color-mix(in oklab, ${it.tint} 14%, var(--t-panel))`,
                          border: `1px solid color-mix(in oklab, ${it.tint} ${active ? 60 : 30}%, transparent)`,
                          color: it.tint,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 8.5,
                          letterSpacing: '-0.04em', userSelect: 'none',
                        }}>{it.monogram}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500,
                            color: active ? 'var(--t-accent-bright)' : 'var(--t-fg)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{title}</span>
                          <span style={{
                            display: 'block',
                            fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5,
                            color: 'var(--t-fg-4)', marginTop: 1,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{sub}</span>
                        </span>
                        {active && (
                          <Check size={12} strokeWidth={2.5} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  };
                  const sectionLabel = (text: string) => (
                    <div style={{
                      padding: '8px 12px 4px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                      color: 'var(--t-fg-4)', fontWeight: 600,
                    }}>{text}</div>
                  );
                  const emptyHint = (text: string, target: string) => (
                    <button
                      type="button"
                      onClick={() => { navigate(target); setShowModelPicker(false); }}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '6px 12px 9px',
                        background: 'transparent', border: 0, cursor: 'pointer',
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5,
                        color: 'var(--t-fg-4)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-accent-bright)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-fg-4)'; }}
                    >
                      <span>{text}</span>
                      <ExternalLink size={10} strokeWidth={1.8} />
                    </button>
                  );
                  return (
                    <div style={{
                      position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                      width: 260, maxHeight: 460, zIndex: 200,
                      background: 'var(--t-panel)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.04)',
                      padding: '4px 0',
                      overflowY: 'auto',
                    }}>
                      {/* CLI section */}
                      {sectionLabel('CLI')}
                      {pickerLoading && pickerCliItems.length === 0 ? (
                        <div style={{ padding: '4px 12px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-4)' }}>{t('common.detecting')}</div>
                      ) : pickerCliItems.length === 0
                        ? emptyHint('未检测到已安装的 CLI · 去设置', '/settings#local-cli')
                        : pickerCliItems.map(renderItem)
                      }
                      {/* Divider between sections */}
                      <div style={{
                        margin: '4px 0',
                        borderTop: '1px solid var(--t-border)',
                      }} />
                      {/* API section */}
                      {sectionLabel('API')}
                      {pickerLoading && pickerApiItems.length === 0 ? (
                        <div style={{ padding: '4px 12px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-4)' }}>{t('common.loading')}</div>
                      ) : pickerApiItems.length === 0
                        ? emptyHint('未配置 API Key · 去设置 BYOK', '/settings#byok')
                        : pickerApiItems.map(renderItem)
                      }
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Right — live token estimate + send / stop. While
                session.isStreaming is true (SSE live + not yet complete) we
                swap the send button for a Stop button so the user can cancel
                a wrong / runaway run. Stop uses red-500 hue (NOT --t-accent)
                so it reads as "cancel" rather than "primary action". */}
            {/* 2026-05-11 Story 15.30 follow-up: send 按钮仅依赖 input 非空 — 不
                看 session.isComplete (multi-turn 后续轮次允许发送)。*/}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <InputTokenCount text={message} attachedFiles={attachedFiles} />
              {session.isStreaming ? (
                <button
                  type="button"
                  title={t('runSession.stopGeneration')}
                  onClick={() => session.abort()}
                  style={{
                    width: 32, height: 28,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.55)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: 'rgb(248, 113, 113)',
                    transition: 'background .12s, border-color .12s',
                  }}
                >
                  <Square size={12} strokeWidth={2.5} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!message.trim() && attachedFiles.length === 0}
                  style={{
                    width: 32, height: 28,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--t-accent)', border: '1px solid var(--t-accent)', borderRadius: 8,
                    cursor: (!message.trim() && attachedFiles.length === 0) ? 'not-allowed' : 'pointer',
                    color: 'var(--t-accent-ink)',
                    opacity: (!message.trim() && attachedFiles.length === 0) ? 0.4 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2026-05-11 kit alignment: composer-hint mono row below the bordered
            input. Discloses keyboard shortcuts (⌘↵ send / Esc cancel / 📎). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 4px 0',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: 'var(--t-fg-5)',
            letterSpacing: '.04em',
          }}
        >
          <kbd style={kbdStyle}>{kbdSendCmd()}</kbd>
          <span>{t('common.send')}</span>
          <span style={{ opacity: 0.4, padding: '0 2px' }}>·</span>
          <kbd style={kbdStyle}>Esc</kbd>
          <span>{t('common.cancel')}</span>
          <span style={{ opacity: 0.4, padding: '0 2px' }}>·</span>
          <kbd style={kbdStyle}>📎</kbd>
          <span>{t('common.attachments')}</span>
        </div>
      </div>
    </aside>
    {/* S2.4 — slide-out drawer rendered as a sibling so it can overlay the
        full viewport regardless of the LeftPanel column width. */}
    <StepArtifactDrawer
      sessionId={sessionId}
      step={drawerStep}
      stepName={drawerStep != null ? session.steps[drawerStep]?.name : undefined}
      cached={drawerStep != null ? session.stepArtifacts?.[drawerStep] ?? null : null}
      onClose={() => setDrawerStep(null)}
    />
    {/* S12 — `<sf:question-form>` modal. Pops up when LLM needs clarification.
        Submitting POSTs answers as JSON content to /messages → new run-session
        inheriting the conversation_id (existing follow-up flow). */}
    {session.pendingQuestionForm && (
      <QuestionFormModal
        open={true}
        formId={session.pendingQuestionForm.id}
        title={session.pendingQuestionForm.title}
        body={session.pendingQuestionForm.body}
        onCancel={() => session.dispatchClearQuestionForm?.()}
        onSubmit={async (jsonContent) => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const overrides = buildPickerOverrides(
              localStorage.getItem('sf.defaultExecutor') ?? '',
              localStorage.getItem('sf.model') ?? '',
            );
            const resp = await fetch(`${getApiBase()}/api/run-sessions/${sessionId}/messages`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ content: jsonContent, ...overrides }),
            });
            if (resp.ok) {
              const data = (await resp.json()) as { session_id: string };
              session.dispatchClearQuestionForm?.();
              navigate(`/run-session/${data.session_id}`);
            } else {
              setRetryToast('提交失败：' + resp.status);
              setTimeout(() => setRetryToast(null), 2400);
            }
          } catch (err) {
            setRetryToast('网络错误：' + (err as Error).message);
            setTimeout(() => setRetryToast(null), 2400);
          }
        }}
      />
    )}
    {/* S4.3 — transient toast for retry-step accept / not-implemented. */}
    {retryToast && (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          padding: '8px 14px',
          borderRadius: 8,
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          color: 'var(--t-fg)',
          fontSize: 12.5,
          boxShadow: '0 8px 24px rgba(0,0,0,.24)',
          animation: 'rs-fade-in 140ms ease',
        }}
      >
        {retryToast}
      </div>
    )}
    </>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 4px',
  border: '1px solid var(--t-border)',
  background: 'var(--t-panel)',
  borderRadius: 3,
  fontSize: 9.5,
  fontFamily: 'var(--font-mono, monospace)',
  color: 'var(--t-fg-4)',
  lineHeight: 1,
};

// Mac uses ⌘↵, Windows/Linux use Ctrl+↵. Mirror useRunSession's platform-aware
// shortcut display from the StartPage so the hint matches what the keyDown
// handler actually accepts.
function kbdSendCmd(): string {
  if (typeof navigator === 'undefined') return '⌘↵';
  return navigator.platform.toLowerCase().includes('mac') ? '⌘↵' : 'Ctrl+↵';
}

// ---------------------------------------------------------------------------
// Keyframe injection (once, client-side)
// ---------------------------------------------------------------------------
const KEYFRAMES = `
@keyframes rs-spin { to { transform: rotate(360deg); } }
@keyframes rs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes rs-dash { to { stroke-dashoffset: -20; } }
@keyframes rs-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
/* spinning conic-gradient border overlay for the S mark */
.rs-mark::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9px;
  background: conic-gradient(from 0deg, rgba(168,85,247,.7) 0%, transparent 30%);
  z-index: -1;
  animation: rs-spin 2.4s linear infinite;
}
/* right-panel browser-style view tabs */
.rs-view-tab {
  height: 36px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: -1px;
  border-radius: 8px 8px 0 0;
  background: transparent;
  border: 0;
  color: var(--t-fg-4);
  font-family: inherit;
  transition: color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.rs-view-tab:hover:not(.rs-view-tab-on) { color: var(--t-fg); }
.rs-view-tab-on {
  color: var(--t-fg);
  background: var(--t-bg);
  box-shadow: inset 1px 0 0 0 var(--t-border), inset -1px 0 0 0 var(--t-border), inset 0 1px 0 0 var(--t-border);
}
.rs-view-tab-ct {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 700;
  height: 16px;
  min-width: 16px;
  padding: 0 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,.06);
  color: var(--t-fg-4);
}
.rs-view-tab-on .rs-view-tab-ct {
  background: rgba(168,85,247,.18);
  color: var(--t-accent-bright);
}
/* status tag */
.rs-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(168,85,247,.14);
  border: 1px solid rgba(168,85,247,.4);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--t-accent-bright);
}
.rs-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--t-accent);
  animation: rs-pulse 1.4s ease-in-out infinite;
}
/* overview panel rows */
.rs-ov-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  background: transparent;
  border: none;
  border-top: 1px solid var(--t-border);
  color: var(--t-fg);
  font-family: inherit;
  transition: background 0.1s;
}
.rs-ov-row:first-child { border-top: none; }
.rs-ov-row:hover { background: rgba(255,255,255,.03); }

/* ── Agent profile card ─────────────────────────────── */
.ag-card {
  padding: 18px 20px;
  border: 1px solid rgba(168,85,247,.45);
  border-left: 2px solid #A855F7;
  border-radius: 16px;
  background: var(--t-panel);
  box-shadow: 0 0 0 1px rgba(168,85,247,.15), 0 0 28px -8px rgba(168,85,247,.25);
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
.ag-avatar {
  width: 64px; height: 64px;
  border-radius: 14px;
  background: rgba(168,85,247,.18);
  border: 1px solid rgba(168,85,247,.5);
  color: #EDE9FE;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 800; letter-spacing: -.02em;
  position: relative; flex-shrink: 0;
}
.ag-avatar::after {
  content: ""; position: absolute; inset: -4px;
  border-radius: 18px;
  border: 1px solid transparent;
  border-top-color: rgba(196,181,253,.55);
  animation: rs-spin 2s linear infinite;
}
.ag-name { font-size: 18px; font-weight: 700; letter-spacing: -.01em; color: var(--t-fg); }
.ag-id { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--t-fg-4); margin-top: 4px; letter-spacing: .04em; }

/* ── Timeline (5-col grid) ──────────────────────────── */
.ag-tl {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.ag-tl-cell {
  padding: 12px 13px;
  min-height: 108px;
  border: 1px solid var(--t-border);
  border-radius: 12px;
  background: var(--t-panel);
  display: flex; flex-direction: column; gap: 7px;
}
.ag-tl-pending { border-style: dashed; opacity: .6; }
.ag-tl-run { border-color: rgba(168,85,247,.45); background: rgba(168,85,247,.04); }
.ag-tl-done { border-color: rgba(16,185,129,.35); }
.ag-tl-step {
  font-family: var(--font-mono, monospace);
  font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  display: flex; align-items: center; gap: 5px; color: var(--t-fg-4);
}
.ag-tl-num {
  width: 15px; height: 15px; border-radius: 50%;
  border: 1px solid var(--t-border);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 8.5px;
}
.ag-tl-done .ag-tl-num { background: #10B981; border-color: #10B981; color: #0A0A0A; }
.ag-tl-run .ag-tl-num { background: rgba(168,85,247,.18); border-color: #A855F7; color: #C4B5FD; }
.ag-tl-title { font-size: 12px; font-weight: 600; color: var(--t-fg); letter-spacing: -.005em; }
.ag-tl-body { font-family: var(--font-mono, monospace); font-size: 10px; line-height: 1.55; color: var(--t-fg-3); flex: 1; }

/* ── System Prompt ──────────────────────────────────── */
.ag-prompt {
  border: 1px solid var(--t-border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  background: var(--t-bg);
}
.ag-prompt-h {
  display: flex; justify-content: space-between;
  padding: 7px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  border-bottom: 1px solid var(--t-border);
  color: var(--t-fg-4);
  background: var(--t-panel);
}
.ag-prompt-pre {
  margin: 0; padding: 10px 14px;
  font-family: var(--font-mono, monospace);
  font-size: 11px; line-height: 1.65;
  color: var(--t-fg-3); white-space: pre-wrap;
}

/* ── Tool Decision Log ──────────────────────────────── */
.ag-tool-log {
  border: 1px solid var(--t-border);
  border-radius: 10px; overflow: hidden;
  background: var(--t-panel);
  margin-bottom: 14px;
}
.ag-tool-log-h {
  display: flex; align-items: center;
  padding: 7px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: var(--t-fg-4);
  border-bottom: 1px solid var(--t-border);
  background: var(--t-panel);
}
.ag-tool-grid { display: grid; grid-template-columns: 1fr 1fr; }
.ag-tool-col { padding: 10px 12px; }
.ag-tool-col-h {
  display: flex; align-items: center; gap: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--t-fg-4); padding-bottom: 8px; margin-bottom: 4px;
  border-bottom: 1px solid var(--t-border);
}
.ag-tool-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 6px; border-radius: 6px;
  margin-bottom: 3px; font-size: 10.5px;
}
.ag-tool-ic {
  width: 14px; height: 14px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; flex-shrink: 0;
}
.ag-tool-nm { font-family: var(--font-mono, monospace); font-size: 10.5px; font-weight: 500; color: var(--t-fg); }

/* ── Live stream bar ────────────────────────────────── */
.ag-stream {
  padding: 9px 14px;
  border: 1px solid var(--t-border);
  border-radius: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--t-panel);
  display: flex; align-items: center; gap: 10px;
  color: var(--t-fg-3);
}
.ag-stream-lbl {
  font-size: 9px; font-weight: 700; letter-spacing: .14em;
  color: var(--t-fg-5);
}
`;

function InjectKeyframes() {
  return (
    <style
      // biome-ignore lint/security/noDangerouslySetInnerHtml: animation keyframes only
      dangerouslySetInnerHTML={{ __html: KEYFRAMES }}
    />
  );
}

// ---------------------------------------------------------------------------
// Preparation panel — Story 15.4 (rendered when no :sessionId in URL)
// ---------------------------------------------------------------------------
function PreparationPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Story 15.9 — restore last user choice from localStorage. SettingsPage's
  // GenerationSettings panel writes the same keys, so a default chosen there
  // surfaces here on the next visit. Hardcoded fallback preserves the prior
  // out-of-the-box behavior when no preference exists.
  const [skillId, setSkillId] = useState<string>(
    () => getStoredString(LAST_SKILL_STORAGE) ?? 'agent-team-blueprint',
  );
  // Story 15.5 — Design System selection. Default to 'tailwind' so the
  // web-prototype path is opinionated out of the box; the picker auto-hides
  // for skills with no compatible DS, and stale ids gracefully degrade to
  // 'none' on the server. Story 15.9: restore from localStorage when present.
  const [dsId, setDsId] = useState<string>(() => {
    const stored = getStoredString(LAST_DS_STORAGE);
    if (stored !== null) return stored;
    return 'tailwind';
  });
  const [goal, setGoal] = useState<string>(searchParams.get('goal') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Story 15.29 — selected Conversation. URL `?conversation_id=` takes priority
  // (so a "back to prep" round-trip auto-selects the previous conversation),
  // otherwise undefined → "Untitled / start fresh" → server auto-creates a new
  // anonymous conversation under the 'default' project.
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    () => searchParams.get('conversation_id') ?? undefined,
  );

  const canSubmit = goal.trim().length > 0 && !submitting;

  // Skills that have any compatible (non-'none') DS. Mirrors the registry on
  // the server — we keep the list short and explicit to avoid a second fetch.
  const skillSupportsDS = skillId === 'web-prototype';

  async function handleStart() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Story 15.9 — persist user's current selections so the next visit
      // restores them (also feeds the SettingsPage GenerationSettings panel).
      const effectiveDs = skillSupportsDS ? dsId : '';
      setStoredString(LAST_SKILL_STORAGE, skillId);
      setStoredString(LAST_DS_STORAGE, effectiveDs);

      // createRunSession() merges localStorage generation settings
      // (max_tokens / temperature) into the body automatically, so the user's
      // SettingsPage edits take effect on every run without any extra plumbing.
      const resp = await createRunSession({
        goal: goal.trim(),
        skill_name: skillId,
        // Only send DS when the skill actually supports one beyond 'none' —
        // avoids leaking stale state from a previous skill selection.
        design_system_id: skillSupportsDS ? dsId : undefined,
        // Story 15.29 — link to selected conversation; server auto-creates an
        // anonymous one when undefined and echoes the id back so we can
        // forward it through the URL so a future "back to prep" round-trip
        // auto-selects the same Conversation (AC8 step 3).
        conversation_id: selectedConversationId,
        // Forward the user's model-picker selection — without these the
        // server falls back to executor='cli:auto' (= claude) even when the
        // user picked a BYOK provider like glm-5.1.
        executor: localStorage.getItem('sf.defaultExecutor') || undefined,
        model: localStorage.getItem('sf.model') || undefined,
        // Derive `provider` from executor=byok:<provider> so the server
        // pulls the right BYOK key from byok-config.json. Without this,
        // server defaults validated_provider='anthropic' and grabs the
        // wrong (or missing) key.
        provider: (() => {
          const ex = localStorage.getItem('sf.defaultExecutor') || '';
          // Server validates the id against PROVIDER_IDS and returns 400 on
          // unknown values; safe to widen the type here.
          return ex.startsWith('byok:') ? (ex.slice(5) as ProviderId) : undefined;
        })(),
      });
      const cid = resp.conversation_id ?? selectedConversationId;
      const qs = new URLSearchParams();
      qs.set('goal', goal.trim());
      if (cid) qs.set('conversation_id', cid);
      navigate(`/run-session/${resp.session_id}?${qs.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            {t('runSession.startNewSession')}
          </h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13, color: 'var(--t-fg-3)' }}>
            {t('runSession.startHint')}
          </p>
        </div>

        {/* Story 15.29 — Conversation picker. Shown at the top so users see
            it before drilling into Skill / DS choices. */}
        <ConversationPicker
          projectId="default"
          selectedId={selectedConversationId}
          onChange={setSelectedConversationId}
          disabled={submitting}
        />

        <div>
          <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 12px', fontWeight: 500 }}>
            {t('runSession.pickSkill')}
          </h3>
          <SkillPicker value={skillId} onChange={setSkillId} />
        </div>

        {/* Story 15.5 — Design System picker (only for skills with compatible DS). */}
        {skillSupportsDS && (
          <div data-testid="design-system-section">
            <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 8px', fontWeight: 500 }}>
              {t('runSession.designSystemOptional')}
            </h3>
            <DesignSystemPicker value={dsId} onChange={setDsId} skillId={skillId} />
          </div>
        )}

        <div>
          <h3 style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: '0 0 8px', fontWeight: 500 }}>
            {t('runSession.describeGoal')}
          </h3>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={t('runSession.goalPlaceholder')}
            data-testid="run-session-goal"
            style={{
              width: '100%',
              minHeight: 96,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              padding: 12,
              color: 'var(--t-fg)',
              fontSize: 13,
              lineHeight: 1.55,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: '#fca5a5',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleStart}
            data-testid="run-session-start"
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid rgba(124,58,237,0.45)',
              background: canSubmit ? '#7c3aed' : 'rgba(124,58,237,0.25)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            {submitting ? '启动中…' : '开始执行 →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RunSessionPage — root (Story 15.4 split: prep vs live)
// ---------------------------------------------------------------------------
export default function RunSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [searchParams] = useSearchParams();
  const goal = searchParams.get('goal') ?? '';
  const skillUrl = searchParams.get('skill_url') ?? '';
  const navigate = useNavigate();

  // Story 15.4: no :sessionId → preparation phase. Hooks below depend on a
  // sessionId so we bail out before mounting the live view (per rules of hooks).
  if (!sessionId) {
    return (
      <>
        <InjectKeyframes />
        <PreparationPanel />
      </>
    );
  }

  return (
    <RunSessionLiveView
      sessionId={sessionId}
      goal={goal}
      skillUrl={skillUrl}
      onNavigate={navigate}
    />
  );
}

// ---------------------------------------------------------------------------
// 2026-05-18 agent-0 — RunSessionRightPane
// ---------------------------------------------------------------------------
//
// Thin shell that composes:
//   - useFollowMode → tab routing based on the live step stream
//   - FollowChip    → "实时跟随" / "返回跟随" toggle
//   - RightPaneTabs → 4 tab buttons + content area
//   - Four panel stubs (Overview / Team / Agent / Preview) — agent-1/2/3
//     will replace the stubs with real implementations.
//   - Bottom dock with a single primary "去聊天 →" CTA per design spec.
//
// Important: this component does NOT mock data. The stubs render text
// placeholders; the real session data is consumed inside each stub's
// replacement via useRunSession() when those land.
interface RunSessionRightPaneProps {
  session: ReturnType<typeof useRunSession>;
  sessionId: string;
  onNavigate: ReturnType<typeof useNavigate>;
  /** Chat group id created when the blueprint run completed. When present
   *  the "去聊天" CTA navigates to /chat/<id>; otherwise it falls back to
   *  /chat with a console placeholder. */
  chatGroupId: string | null;
}

function RunSessionRightPane({ session, sessionId, onNavigate, chatGroupId }: RunSessionRightPaneProps) {
  const { t } = useI18n();
  const {
    activeTab,
    setActiveTab,
    followMode,
    toggleFollow,
    followedTab,
    currentStepLabel,
    currentAnchor,
  } = useFollowMode({
    steps: session.steps,
    activeSubsteps: session.activeSubsteps,
    nodes: session.nodes,
    // S6.6 — feed the v3 stacked substep into the follow hook so AgentDetail
    // can scroll its matching SkillSection into view as substeps stream.
    activeAgentSubstep: session.activeAgentSubstep,
  });

  // S6.6 — anchor-scroll effect. When useFollowMode picks an anchor (e.g.
  // sf-section-model on a model substep), scroll it into view. Smooth
  // scroll keeps the user's mental focus continuous. Only fires while the
  // user is on the Agent tab; jumping while they manually browse Overview
  // would be jarring.
  React.useEffect(() => {
    if (!currentAnchor) return;
    if (activeTab !== 'agent') return;
    const el = document.getElementById(currentAnchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentAnchor, activeTab]);

  // Task spec Item 8 — Header content for the right-pane toolbar:
  // run id (truncated mono) + status pill (构建中 / 已完成 / 出错).
  const runTitle = `run_${sessionId.slice(0, 8)}`;
  const runStatus: 'building' | 'done' | 'error' =
    session.error != null ? 'error' : session.isComplete ? 'done' : 'building';

  // Tab click → lock follow mode (matches design-spec behavior). Internal
  // auto-follow effect in useFollowMode keeps the default unlocked path.
  const handleTabChange = (next: TabId) => setActiveTab(next, { lock: true });

  // "去聊天 →" — jump to this run's chat conversation. When the run
  // completed and auto-persist successfully created a chat group, we
  // navigate straight to /chat/<groupId>. Otherwise fall back to /chat
  // and log a TODO so the missing wiring is easy to find.
  const handleGoToChat = () => {
    if (chatGroupId) {
      onNavigate(`/chat/${chatGroupId}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[RunSessionRightPane] TODO: chat group not yet linked for this run — falling back to /chat');
    onNavigate('/chat');
  };

  const panels: Record<TabId, React.ReactNode> = {
    overview: (
      <OverviewPanel
        session={session}
        onSelectAgent={() => setActiveTab('agent', { lock: true })}
        onOpenEditor={() => onNavigate(`/editor?session=${sessionId}`)}
      />
    ),
    team: <TeamPanel session={session} />,
    agent: <AgentPanel session={session} />,
    preview: (
      <PreviewPanel
        session={session}
        onOpenEditor={() => onNavigate(`/editor?session=${sessionId}`)}
      />
    ),
  };

  return (
    <section
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <RightPaneTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        followChip={
          <FollowChip
            mode={followMode}
            currentStepLabel={currentStepLabel}
            onToggle={toggleFollow}
          />
        }
        followedTab={followedTab}
        panels={panels}
        runTitle={runTitle}
        runStatus={runStatus}
        tabCounts={{
          team: session.nodes.length,
          agent: session.nodes.length,
        }}
        blueprintFilename={session.blueprintFile}
      />

      {/* Right-bottom dock — single primary CTA. Anchored absolute so the
          stub panels (and their eventual replacements) keep their natural
          height and the dock floats above them. */}
      <div
        style={{
          position: 'absolute',
          right: 20,
          bottom: 20,
          zIndex: 5,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={handleGoToChat}
          data-testid="run-session-go-to-chat"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--t-accent)',
            color: 'var(--t-accent-ink, #fff)',
            border: 'none',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,.22)',
            fontFamily: 'inherit',
          }}
        >
          {t('projects.artifactsEmptyCta')}
        </button>
      </div>
    </section>
  );
}

interface RunSessionLiveViewProps {
  sessionId: string;
  goal: string;
  skillUrl?: string;
  onNavigate: ReturnType<typeof useNavigate>;
}

function RunSessionLiveView({ sessionId, goal, skillUrl, onNavigate }: RunSessionLiveViewProps) {
  const { t } = useI18n();
  const session = useRunSession(sessionId);
  const [collapsed, setCollapsed] = useState(false);
  // 2026-05-18 agent-0 — zoom + selectedNodeId state kept for the legacy
  // RightPanel implementation (still in file for now) so future refactors
  // that re-introduce the canvas don't need to re-add state plumbing.
  // The new RunSessionRightPane does not read these.
  const [zoom, _setZoom] = useState(82);
  const [selectedNodeId, _setSelectedNodeId] = useState<string | null>(null);
  void zoom; void selectedNodeId;
  const [savedTeamId, setSavedTeamId] = useState<string | null>(null);
  const [savedGroupId, setSavedGroupId] = useState<string | null>(null);
  // Auto-save state machine — replaces the old one-shot `savedRef`. The
  // boolean ref couldn't distinguish "saved" from "failed", so a Python
  // backend coming back up couldn't retry. Now `failed` is recoverable:
  // user clicks the chip's 重新保存 button → setSaveState('idle') → effect
  // fires again. `inFlightRef` prevents the effect from double-firing while
  // an async run is mid-flight.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'failed'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  // Read currentWorkspaceId so persisted agents/teams/groups belong to the
  // user's currently selected workspace — otherwise they'd land in the
  // default bucket and `/teams` (which filters by workspace) would still
  // show "还没有团队" even though save succeeded.
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentId);

  // Auto-persist team + agents + chat group when blueprint run completes.
  // Reruns when saveState flips back to 'idle' (i.e. user pressed retry).
  //
  // 2026-05-19 — trigger criterion broadened. Previously: `isComplete &&
  // nodes.length > 0`. But the reducer sets `isComplete=true` ONLY on the
  // server's COMPLETE event; if the run errors mid-stream (e.g. critique
  // pass throws, SSE drops after blueprint), `isComplete` stays false
  // forever and auto-save never fires — even though all 6 agents and the
  // YAML blueprint were already streamed and persisted server-side.
  //
  // New criterion: persist whenever the blueprint is "settled" — either
  // the stream completed normally OR errored after we already have agents.
  // The blueprint data lives client-side in `session.nodes` regardless of
  // whether the trailing critique pass succeeded.
  const blueprintSettled =
    session.nodes.length > 0 && (session.isComplete || session.error != null);
  useEffect(() => {
    if (!blueprintSettled) return;
    if (saveState === 'saving' || saveState === 'ok') return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const agentNodes = session.nodes.filter((n) => n.type === 'agent');

    // 2026-05-19 — team name comes from the LLM-generated blueprint YAML
    // header (e.g. `name: "BMAD 全流程团队"`), NOT from the coordinator
    // agent's title. Before this fix the team was named after the
    // coordinator agent ("产品经理") which is nonsensical — that's a member
    // name, not a team name. The LLM is asked to think about and write
    // a team name in the YAML; we should honor it.
    //
    // Fallback chain:
    //   1. `name:` field at the top of blueprintYaml (LLM's choice)
    //   2. The user's goal text, trimmed (only if it's not a raw skill
    //      reference like "Skill: ...")
    //   3. Generic "AI 团队 · YYYY-MM-DD" so it's always something
    //      meaningful that the user can rename later
    function extractYamlTeamName(yaml: string | null): string | null {
      if (!yaml) return null;
      // Match leading `name:` line, tolerating optional quotes and trailing comments.
      const m = yaml.match(/^\s*name\s*:\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/m);
      const name = m ? m[1].trim() : '';
      return name || null;
    }
    const yamlTeamName = extractYamlTeamName(session.blueprintYaml);
    const trimmedGoal = goal.trim();
    const goalLooksLikeSkillRef =
      /^(skill\s*:|\/?\.?claude\/skills\/|skill_)/i.test(trimmedGoal);
    const fallbackName =
      yamlTeamName ??
      (trimmedGoal && !goalLooksLikeSkillRef ? trimmedGoal.slice(0, 40) : null) ??
      `AI 团队 · ${new Date().toISOString().slice(0, 10)}`;
    const teamName = fallbackName;
    const wsId = currentWorkspaceId ?? undefined;

    setSaveState('saving');
    setSaveError(null);

    (async () => {
      try {
        const created = await Promise.all(
          agentNodes.map((n) =>
            quickCreateAgent({
              name: n.title,
              soul: n.sub || n.title,
              workspace_id: wsId,
            }),
          ),
        );
        const agentIds = created.map((a) => a.agent_id);
        const team = await createTeam({
          name: teamName,
          description: goal,
          agent_ids: agentIds,
          workspace_id: wsId,
        });
        setSavedTeamId(team.team_id);

        // 2026-05-19 — persist the blueprint DAG as the team's workflow so
        // /teams/:id renders nodes + edges instead of "暂无工作流节点". Build
        // a session-node-id → real-agent-id map, then translate blueprint
        // nodes/edges into TeamWorkflow shape. Failure here doesn't fail the
        // whole save — the team itself is already persisted.
        try {
          const nodeIdToAgentId = new Map<string, string>();
          agentNodes.forEach((n, i) => {
            const aid = created[i]?.agent_id;
            if (aid) nodeIdToAgentId.set(n.id, aid);
          });

          // Simple column-based seed layout — mirrors BlueprintCanvas so the
          // /teams/:id DAG opens with a reasonable initial arrangement. Real
          // editor positions take over once the user drags.
          const NODE_W = 168;
          const NODE_H = 78;
          const COL_GAP = 96;
          const ROW_GAP = 28;
          const incoming: Record<string, number> = {};
          session.nodes.forEach(n => { incoming[n.id] = 0; });
          session.edges.forEach(e => {
            if (incoming[e.to] != null) incoming[e.to]++;
          });
          // BFS to assign columns (longest path from root).
          const col = new Map<string, number>();
          const queue: string[] = [];
          session.nodes.forEach(n => {
            if ((incoming[n.id] ?? 0) === 0) { col.set(n.id, 0); queue.push(n.id); }
          });
          let guard = session.nodes.length * 4 + 8;
          while (queue.length && guard-- > 0) {
            const id = queue.shift()!;
            const c = col.get(id) ?? 0;
            session.edges.forEach(e => {
              if (e.from === id) {
                const prev = col.get(e.to);
                if (prev === undefined || prev < c + 1) {
                  col.set(e.to, c + 1);
                  queue.push(e.to);
                }
              }
            });
          }
          // Bucket by column to compute row index.
          const rowCounter: Record<number, number> = {};
          const positions = new Map<string, { x: number; y: number }>();
          session.nodes.forEach(n => {
            const c = col.get(n.id) ?? 0;
            const r = rowCounter[c] ?? 0;
            rowCounter[c] = r + 1;
            positions.set(n.id, {
              x: c * (NODE_W + COL_GAP),
              y: r * (NODE_H + ROW_GAP),
            });
          });

          const workflowNodes: TeamWorkflowNode[] = session.nodes.map(n => {
            const aid = nodeIdToAgentId.get(n.id) ?? '';
            return {
              id: n.id,
              type: 'agentTask',
              position: positions.get(n.id) ?? { x: 0, y: 0 },
              data: {
                agentId: aid,
                name: n.title,
                soul: n.sub || n.title,
              },
            };
          });

          const workflowEdges: TeamWorkflowEdge[] = session.edges.map((e, i) => ({
            id: `edge-${i}-${e.from}-${e.to}`,
            source: e.from,
            target: e.to,
            data: { mode: 'direct' },
          }));

          await putTeamWorkflow(team.team_id, {
            nodes: workflowNodes,
            edges: workflowEdges,
          });
        } catch (wfErr) {
          // Don't fail the whole save on workflow persistence error. Team
          // record itself is already in place; user can manually rebuild
          // the DAG in the editor.
          console.warn('[RunSession] putTeamWorkflow failed:', wfErr);
        }

        try {
          const grp = await createGroup({
            templateId: '',
            groupTemplateId: '',
            name: teamName,
            agentIds,
            memberEmails: [],
            policyMatrix: {},
            workspaceId: wsId,
            teamId: team.team_id,
          });
          if (grp?.groupId) setSavedGroupId(grp.groupId);
        } catch {
          // groups endpoint may not be available yet (Python may not have
          // groups storage wired); chat navigation falls back to /teams.
          // Don't fail the whole save just because group creation failed.
        }
        setSaveState('ok');
      } catch (e: unknown) {
        // Translate known error codes to friendly Chinese messages so the
        // status chip can show something actionable instead of raw stack.
        const code = (e as { code?: string })?.code ?? '';
        let msg = e instanceof Error ? e.message : String(e);
        if (code === 'PYTHON_BACKEND_UNAVAILABLE') {
          msg = 'Python 后端未启动 — Team 无法持久化';
        } else if (code.startsWith('HTTP_')) {
          msg = `服务器返回 ${code.replace('HTTP_', '')} — ${msg}`;
        }
        console.warn('[RunSession] auto-save failed:', e);
        setSaveError(msg);
        setSaveState('failed');
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [blueprintSettled, saveState, currentWorkspaceId, goal]);

  // 2026-05-11 Layer 1 — chat-mode detection (mirrors LeftPanel).
  // session.error gates chat mode so retry-error text accumulated in
  // chatReply cannot collapse the canvas (2026-05-16 second-pass fix).
  // 2026-05-16 third-pass: also bail out if the stream is clearly emitting
  // <sf:*> structured tags or outputType already classifies as non-chat —
  // otherwise early raw-tag text collapses the canvas mid-build.
  const isChatMode =
    session.chatReply.trim().length > 0 &&
    session.steps.length === 0 &&
    session.nodes.length === 0 &&
    !session.blueprintFile &&
    !session.error &&
    !session.chatReply.includes('<sf:') &&
    (session.outputType == null || session.outputType === 'chat');

  // 2026-05-18 agent-0 — handleOpenEditor previously wired the "在 Editor
  // 中打开" button in the legacy RightPanel toolbar. The new toolbar has
  // a single "去聊天 →" dock instead. Kept so re-introducing an Editor
  // entry point is a one-line revert away.
  // @ts-expect-error TS6133 — kept intentionally unused; see comment above.
  function _handleOpenEditor() {
    if (session.redirectUrl) {
      onNavigate(session.redirectUrl);
    } else {
      onNavigate('/editor');
    }
  }

  // Auto-save status chip — sits inline at the top of the page so the user
  // always knows whether the team was persisted. Failure state surfaces a
  // retry button that flips saveState back to 'idle' to re-run the effect.
  const autoSaveChip =
    saveState === 'idle' ? null : (
      <div
        data-testid={`run-session-save-${saveState}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 11.5,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          letterSpacing: '0.02em',
          background:
            saveState === 'failed'
              ? 'rgba(220, 38, 38, 0.10)'
              : saveState === 'ok'
                ? 'rgba(52, 211, 153, 0.10)'
                : 'var(--t-bg-elev-2, #141414)',
          border: `1px solid ${
            saveState === 'failed'
              ? 'rgba(220, 38, 38, 0.35)'
              : saveState === 'ok'
                ? 'rgba(52, 211, 153, 0.35)'
                : 'var(--t-border, #27272A)'
          }`,
          color:
            saveState === 'failed'
              ? '#ef4444'
              : saveState === 'ok'
                ? '#34d399'
                : 'var(--t-fg-3, #A1A1AA)',
        }}
      >
        {saveState === 'saving' && (
          <>
            <span
              aria-hidden
              className="sf-pulse"
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-fg-4)' }}
            />
            <span>{t('runSession.persisting')}</span>
          </>
        )}
        {saveState === 'ok' && (
          <>
            <Check size={12} strokeWidth={2.4} />
            <span>{t('runSession.teamSaved')}</span>
          </>
        )}
        {saveState === 'failed' && (
          <>
            <AlertTriangle size={12} strokeWidth={2.2} />
            <span>{t('runSession.persistFailed')}{saveError ? ` · ${saveError}` : ''}</span>
            <button
              type="button"
              onClick={() => setSaveState('idle')}
              data-testid="run-session-save-retry"
              style={{
                marginLeft: 6,
                padding: '1px 8px',
                borderRadius: 4,
                background: 'var(--t-bg-elev-2)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-1)',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {t('runSession.resave')}
            </button>
          </>
        )}
      </div>
    );

  return (
    <>
      <InjectKeyframes />
      <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <PythonBackendBanner />
        {autoSaveChip && <div>{autoSaveChip}</div>}
      </div>
      {savedTeamId && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderLeft: '3px solid var(--t-ok)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08)',
            padding: '10px 12px 10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 240,
            maxWidth: 320,
            animation: 'rs-toast-in .18s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} strokeWidth={2.2} color="var(--t-ok)" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)' }}>Team saved</span>
            <button
              type="button"
              onClick={() => setSavedTeamId(null)}
              title={t('common.close')}
              style={{ marginLeft: 'auto', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, borderRadius: 5, color: 'var(--t-fg-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onNavigate(savedTeamId ? `/teams/${savedTeamId}` : '/teams')}
              style={{ background: 'var(--t-ok)', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}
            >{t('runSession.viewTeam')}</button>
            <button
              type="button"
              onClick={() => onNavigate(savedGroupId ? `/chat/${savedGroupId}` : '/chat')}
              style={{ background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 6, color: 'var(--t-fg)', padding: '4px 10px', cursor: 'pointer', fontSize: 11.5 }}
            >{t('runSession.gotoChat')}</button>
            <button
              type="button"
              onClick={() => onNavigate('/agents')}
              style={{ background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 6, color: 'var(--t-fg)', padding: '4px 10px', cursor: 'pointer', fontSize: 11.5 }}
            >{t('runSession.gotoAgents')}</button>
          </div>
        </div>
      )}
      <div
        style={{
          display: 'grid',
          // 2026-05-11 Layer 1: chat mode collapses the right canvas panel
          // (nothing to draw when LLM is plain-text-replying).
          gridTemplateColumns: isChatMode
            ? '1fr'
            : (collapsed ? '44px 1fr' : '420px 1fr'),
          height: '100vh',
          background: 'var(--t-bg)',
          color: 'var(--t-fg)',
          fontFamily: 'inherit',
          overflow: 'hidden',
          transition: 'grid-template-columns 0.2s ease',
        }}
      >
        <LeftPanel
          sessionId={sessionId}
          goal={goal}
          skillUrl={skillUrl}
          session={session}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((v) => !v)}
        />
        {!isChatMode && (
          // 2026-05-18 agent-0 — new right pane shell. Replaces <RightPanel>
          // which is kept in the module for now (unused) so other stories /
          // tests that import internal helpers (toolbarBtn, etc.) keep
          // building. agent-1/2/3 will fill the four stub panels.
          <RunSessionRightPane
            session={session}
            sessionId={sessionId}
            onNavigate={onNavigate}
            chatGroupId={savedGroupId}
          />
        )}
      </div>
    </>
  );
}

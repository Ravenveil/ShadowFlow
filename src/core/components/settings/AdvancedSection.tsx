/**
 * AdvancedSection — Settings: Per-Agent Advanced Configuration
 *
 * Stores per-agent model preferences and CLI env-var overrides in
 * localStorage key `sf.agentConfig`.  No API calls are made.
 *
 * State shape:
 *   AgentAdvancedConfig {
 *     agentModels: Record<agentId, { model?, reasoning? }>
 *     agentCliEnv:  Record<agentId, Record<envKey, string>>
 *   }
 */
import React, { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
}

type AgentCliEnv = Record<string, string>;

interface AgentAdvancedConfig {
  agentModels: Record<string, AgentModelPrefs>;
  agentCliEnv: Record<string, AgentCliEnv>;
}

const DEFAULT_CONFIG: AgentAdvancedConfig = {
  agentModels: {},
  agentCliEnv: {},
};

// ── Static data ──────────────────────────────────────────────────────────────

const AGENTS_WITH_CONFIG = [
  { id: 'claude',   name: 'Claude Code' },
  { id: 'codex',    name: 'Codex CLI' },
  { id: 'gemini',   name: 'Gemini CLI' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'hermes',   name: 'Hermes' },
];

const MODEL_OPTIONS: Record<string, string[]> = {
  claude:   ['default', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  codex:    ['default', 'o4-mini', 'o3'],
  gemini:   ['default', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  opencode: ['default'],
  hermes:   ['default'],
};

const KNOWN_ENV_KEYS: Record<string, string[]> = {
  claude:   ['CLAUDE_CONFIG_DIR', 'ANTHROPIC_BASE_URL'],
  codex:    ['CODEX_HOME', 'OPENAI_BASE_URL'],
  gemini:   ['GEMINI_CLI_TRUST_WORKSPACE'],
  opencode: ['OPENAI_BASE_URL'],
  hermes:   ['HERMES_HOME'],
};

// ── localStorage helpers ─────────────────────────────────────────────────────

function loadConfig(): AgentAdvancedConfig {
  try {
    const raw = localStorage.getItem('sf.agentConfig');
    if (!raw) return { ...DEFAULT_CONFIG, agentModels: {}, agentCliEnv: {} };
    const parsed = JSON.parse(raw) as Partial<AgentAdvancedConfig>;
    return {
      agentModels: parsed.agentModels ?? {},
      agentCliEnv: parsed.agentCliEnv ?? {},
    };
  } catch {
    return { ...DEFAULT_CONFIG, agentModels: {}, agentCliEnv: {} };
  }
}

function saveAgentConfig(
  agentId: string,
  model: string,
  envVars: Record<string, string>,
): void {
  const cfg = loadConfig();

  if (model && model !== 'default') {
    cfg.agentModels[agentId] = { model };
  } else {
    delete cfg.agentModels[agentId];
  }

  if (Object.keys(envVars).some((k) => envVars[k])) {
    cfg.agentCliEnv[agentId] = Object.fromEntries(
      Object.entries(envVars).filter(([, v]) => v.trim()),
    );
  } else {
    delete cfg.agentCliEnv[agentId];
  }

  try {
    localStorage.setItem('sf.agentConfig', JSON.stringify(cfg));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

// ── Chevron icon ─────────────────────────────────────────────────────────────

function IconChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        'h-4 w-4 text-sf-fg4 transition-transform duration-200',
        expanded ? 'rotate-180' : '',
      ].join(' ')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Per-agent accordion panel ────────────────────────────────────────────────

function AgentPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [model, setModel] = useState<string>(() => {
    const cfg = loadConfig();
    return cfg.agentModels[agentId]?.model ?? 'default';
  });
  const [envVars, setEnvVars] = useState<Record<string, string>>(() => {
    const cfg = loadConfig();
    const saved = cfg.agentCliEnv[agentId] ?? {};
    const keys = KNOWN_ENV_KEYS[agentId] ?? [];
    const init: Record<string, string> = {};
    for (const k of keys) init[k] = saved[k] ?? '';
    return init;
  });
  const [saved, setSaved] = useState(false);

  const modelOpts = MODEL_OPTIONS[agentId] ?? ['default'];
  const showModelSelector = modelOpts.length > 1;
  const envKeys = KNOWN_ENV_KEYS[agentId] ?? [];

  const inputCls =
    'w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] ' +
    'text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors';

  function handleEnvChange(key: string, value: string) {
    setEnvVars((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    saveAgentConfig(agentId, model, envVars);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
      {/* Model selector */}
      {showModelSelector && (
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            模型偏好
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputCls + ' cursor-pointer'}
          >
            {modelOpts.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'default' ? '默认（由 CLI 决定）' : opt}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Env var inputs */}
      {envKeys.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            环境变量
          </p>
          {envKeys.map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-sf-fg5">{key}</label>
              <input
                type="text"
                value={envVars[key] ?? ''}
                onChange={(e) => handleEnvChange(key, e.target.value)}
                placeholder={`${key}=…`}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      )}

      {/* Save row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-sf-accent-dim transition-colors"
        >
          保存
        </button>
        {saved && (
          <span className="font-mono text-[11px] text-sf-ok transition-opacity">
            ✓ 已保存
          </span>
        )}
      </div>
    </div>
  );
}

// ── Global maxTokens block ───────────────────────────────────────────────────

const MAX_TOKENS_KEY = 'sf.maxTokens';
const MAX_TOKENS_DEFAULT = 8192;
const MAX_TOKENS_MIN = 1024;
const MAX_TOKENS_MAX = 32768;
const MAX_TOKENS_STEP = 512;

function clampTokens(v: number): number {
  return Math.min(MAX_TOKENS_MAX, Math.max(MAX_TOKENS_MIN, v));
}

function MaxTokensBlock() {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(MAX_TOKENS_KEY);
      if (!raw) return MAX_TOKENS_DEFAULT;
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? MAX_TOKENS_DEFAULT : clampTokens(parsed);
    } catch {
      return MAX_TOKENS_DEFAULT;
    }
  });

  const inputCls =
    'rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] ' +
    'text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors ' +
    'w-[120px] text-right tabular-nums';

  function handleBlur() {
    const clamped = clampTokens(value);
    setValue(clamped);
    try {
      localStorage.setItem(MAX_TOKENS_KEY, String(clamped));
    } catch {
      // quota exceeded or private mode — silently ignore
    }
  }

  return (
    <div className="rounded-[12px] border border-sf-border bg-sf-panel p-4 flex flex-col gap-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
        Output Tokens
      </p>
      <p className="text-[12px] text-sf-fg3">单次推理最大输出 Token 数</p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={MAX_TOKENS_MIN}
          max={MAX_TOKENS_MAX}
          step={MAX_TOKENS_STEP}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value, 10) || MAX_TOKENS_MIN)}
          onBlur={handleBlur}
          className={inputCls}
        />
        <span className="text-[12px] text-sf-fg4">个 token</span>
      </div>
      <p className="font-mono text-[10px] text-sf-fg5">
        范围 {MAX_TOKENS_MIN.toLocaleString()}–{MAX_TOKENS_MAX.toLocaleString()}，默认 {MAX_TOKENS_DEFAULT.toLocaleString()}
      </p>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function AdvancedSection() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleAgent(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">高级配置</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          每个 Agent 的模型偏好和环境变量覆盖。
        </p>
      </div>

      {/* Global maxTokens */}
      <MaxTokensBlock />

      {/* Accordion list */}
      <div className="flex flex-col gap-2">
        {AGENTS_WITH_CONFIG.map(({ id, name }) => {
          const expanded = expandedId === id;
          return (
            <div
              key={id}
              className="rounded-[12px] border border-sf-border bg-sf-panel overflow-hidden transition-all"
            >
              {/* Header (always visible) */}
              <button
                type="button"
                onClick={() => toggleAgent(id)}
                className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-sf-elev2 transition-colors"
              >
                <span className="text-[13px] font-semibold text-sf-fg1">{name}</span>
                <IconChevron expanded={expanded} />
              </button>

              {/* Expandable content */}
              {expanded && (
                <div className="border-t border-sf-border bg-sf-elev1">
                  <AgentPanel agentId={id} agentName={name} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="font-mono text-[9px] text-sf-fg6">
        配置仅存储在本地浏览器（localStorage），不会上传至服务器。
      </p>
    </div>
  );
}

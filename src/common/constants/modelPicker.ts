/**
 * modelPicker — 模型/执行器选择器的共享常量、类型、数据加载（无 React）。
 *
 * 2026-05-29 — 从 RunSessionPage.tsx 内联代码（行 84-187）提炼，供
 * `<ModelPicker>` 组件复用到 run-session / chat / StartPage 三处。纯数据/IO 与
 * UI 分离，避免组件间循环依赖；与已独立的 `src/common/lib/pickerOverrides.ts` 同层。
 *
 * 选中落库约定（由组件的 onChange 调用方负责，本模块不写 localStorage）：
 *   CLI item → sf.defaultExecutor = `cli:<agentId>`
 *   API item → sf.defaultExecutor = `byok:<providerId>` + sf.model = <modelId>
 */

export const PICKER_CLI_META: Record<string, { name: string; tint: string; monogram: string }> = {
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

export const PICKER_PROVIDER_META: Record<string, { name: string; tint: string; monogram: string }> = {
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

export interface PickerCliItem {
  kind: 'cli';
  agentId: string;
  name: string;
  tint: string;
  monogram: string;
  version: string | null;
}
export interface PickerApiItem {
  kind: 'api';
  providerId: string;
  providerName: string;
  tint: string;
  monogram: string;
  modelId: string;
}
export type PickerItem = PickerCliItem | PickerApiItem;

/** picker 当前选择（executor + model 字符串对）。 */
export interface ModelPickerValue {
  executor: string;
  model: string;
}

export async function fetchPickerCliItems(apiBase: string): Promise<PickerCliItem[]> {
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

export async function fetchPickerApiItems(apiBase: string): Promise<PickerApiItem[]> {
  try {
    const res = await fetch(`${apiBase}/api/settings/byok`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = await res.json();
    const providers = (j && typeof j.providers === 'object') ? j.providers as Record<string, { enabled?: boolean; models?: string[]; apiKey?: string | null }> : {};
    const out: PickerApiItem[] = [];
    for (const [providerId, p] of Object.entries(providers)) {
      if (!p.enabled) continue;
      const models = Array.isArray(p.models) ? p.models : [];
      if (models.length === 0) continue;
      const meta = PICKER_PROVIDER_META[providerId] ?? { name: providerId, tint: '#71717A', monogram: providerId.slice(0, 2).toUpperCase() };
      for (const modelId of models) {
        out.push({ kind: 'api', providerId, providerName: meta.name, tint: meta.tint, monogram: meta.monogram, modelId });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** 触发按钮的显示文案 + tooltip（从 executor/model 推导）。 */
export function pickerLabel(executor: string, model: string): { label: string; tooltip: string } {
  if (executor.startsWith('cli:')) {
    const id = executor.slice(4);
    const name = PICKER_CLI_META[id]?.name ?? id;
    return { label: name, tooltip: `CLI · ${name}` };
  }
  if (executor.startsWith('byok:')) {
    const pid = executor.slice(5);
    const provName = PICKER_PROVIDER_META[pid]?.name ?? pid;
    return { label: model || provName, tooltip: `API · ${provName} / ${model}` };
  }
  if (model) return { label: model, tooltip: `模型: ${model}` };
  return { label: '选择模型', tooltip: '选择模型' };
}

/** sessionStorage 缓存键 + TTL（picker 数据跨页导航即时呈现）。 */
export const PICKER_CACHE_KEY = 'sf.modelPicker.cache.v1';
export const PICKER_CACHE_TTL_MS = 60_000;

export function loadCachedPicker(): { cli: PickerCliItem[]; api: PickerApiItem[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(PICKER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > PICKER_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedPicker(cli: PickerCliItem[], api: PickerApiItem[]): void {
  try {
    sessionStorage.setItem(PICKER_CACHE_KEY, JSON.stringify({ cli, api, ts: Date.now() }));
  } catch {
    /* sessionStorage may be full or disabled */
  }
}

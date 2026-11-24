/**
 * useComposerResources — 输入区所需资源（模型 / 知识包）统一取数。
 *
 * 数据全部来自后端，组件不写死任何模型名或知识包：
 *   - CLI 执行器：GET /api/settings/agents/detect
 *   - BYOK 供应商：GET /api/settings/byok
 *   - 知识包：GET /api/memory-bank/packs
 * 取数失败只降级为空列表，不阻塞输入框。
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../chat-api";
import { COMMANDS } from "../content/composer";
import type { ComposerModel } from "./ModelPicker";
import type { ComposerKnowledgePack } from "./KnowledgePicker";

type CliAgent = { id: string; name?: string; version?: string | null; installed?: boolean };
type ByokProvider = { enabled?: boolean; apiKey?: string; models?: string[]; syncedModels?: string[] };
type ByokStore = { providers?: Record<string, ByokProvider>; defaultModel?: string | null };
type PackRow = {
  pack_id?: string;
  name?: string;
  description?: string;
  stats?: { sources?: number };
};

const CLI_LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  qwen: "Qwen CLI",
  iflow: "iFlow CLI",
};

const BYOK_LABEL: Record<string, string> = {
  mimo: "Xiaomi MiMo",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  zhipu: "Zhipu GLM",
  qwen: "Qwen · Alibaba",
  moonshot: "Moonshot · Kimi",
  mistral: "Mistral",
  groq: "Groq",
  azure: "Azure OpenAI",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

export interface ComposerResources {
  models: ComposerModel[];
  knowledge: ComposerKnowledgePack[];
  /** 后端默认模型 id（若有）。 */
  defaultModel: string;
  commands: typeof COMMANDS;
}

export function useComposerResources(): ComposerResources {
  const [cli, setCli] = useState<CliAgent[]>([]);
  const [byok, setByok] = useState<ByokStore>({});
  const [packs, setPacks] = useState<PackRow[]>([]);

  useEffect(() => {
    apiFetch<{ data?: CliAgent[]; agents?: CliAgent[] }>("/api/settings/agents/detect")
      .then((j) => setCli((j?.data ?? j?.agents ?? []).filter((a) => a.installed !== false)))
      .catch(() => setCli([]));
    apiFetch<{ data?: ByokStore } | ByokStore>("/api/settings/byok")
      .then((j) => setByok(("data" in j && j.data ? j.data : j) as ByokStore))
      .catch(() => setByok({}));
    apiFetch<{ data?: { packs?: PackRow[] }; packs?: PackRow[] }>("/api/memory-bank/packs")
      .then((j) => {
        const inner = ("data" in j ? j.data : undefined)?.packs;
        const flat = ("packs" in j ? j.packs : undefined) ?? [];
        setPacks(inner ?? flat);
      })
      .catch(() => setPacks([]));
  }, []);

  const models = useMemo(() => {
    const out: ComposerModel[] = [];
    for (const item of cli) {
      out.push({
        id: `cli:${item.id}`,
        label: CLI_LABEL[item.id] ?? item.name ?? item.id,
        group: "CLI",
        note: item.version ?? undefined,
      });
    }
    for (const [id, p] of Object.entries(byok.providers ?? {})) {
      if (!p.enabled || !p.apiKey) continue;
      const model = p.models?.[0] ?? p.syncedModels?.[0] ?? "";
      out.push({
        id: `byok:${id}`,
        label: BYOK_LABEL[id] ?? id,
        group: "API",
        note: model || undefined,
      });
    }
    return out;
  }, [cli, byok]);

  const knowledge = useMemo(
    () =>
      packs.map<ComposerKnowledgePack>((p) => ({
        id: p.pack_id ?? p.name ?? "",
        name: p.name ?? p.pack_id ?? "未命名知识包",
        desc: p.description,
        docs: p.stats?.sources ?? 0,
      })),
    [packs],
  );

  return {
    models,
    knowledge,
    defaultModel: byok.defaultModel ?? "",
    commands: COMMANDS,
  };
}

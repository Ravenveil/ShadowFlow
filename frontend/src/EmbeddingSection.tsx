/**
 * EmbeddingSection.tsx — 设置 → 向量模型（Embedding）。
 *
 * 配置知识库（多模态记忆库）文档向量化所用的 embedding 模型。
 * 后端契约：backend/node routes/system/settings.ts
 *   GET  /api/settings/embedding          → 配置（key 脱敏）
 *   PUT  /api/settings/embedding          → 局部合并保存
 *   GET  /api/settings/embedding/reveal   → 明文 key（眼睛按钮）
 *   POST /api/settings/embedding/check    → 连通测试（可带草稿值）
 *
 * 默认 qwen（DashScope OpenAI 兼容端点，text-embedding-v4）；API Key 永不
 * 内置，必须由用户填写。配置写入 .shadowflow/embedding-config.json，Python
 * MemoryBank（SettingsBackedEmbedder）热加载——保存即生效，无需重启。
 */
import { FormEvent, useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, PlugZap, Save } from "lucide-react";

interface EmbeddingView {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  apiKeyMasked: string | null;
}

interface CheckResult {
  overall: "ok" | "failed";
  dims?: number;
  latencyMs?: number;
  error?: string;
}

const PROVIDER_BASES: Record<string, string> = {
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  mimo: "https://api.xiaomimimo.com/v1",
  deepseek: "https://api.deepseek.com",
  custom: "",
};

const PROVIDER_LABELS: Record<string, string> = {
  qwen: "Qwen · 阿里通义",
  openai: "OpenAI",
  zhipu: "智谱 GLM",
  mimo: "Xiaomi MiMo",
  deepseek: "DeepSeek",
  custom: "自定义（OpenAI 兼容）",
};

const PROVIDER_MODEL_HINTS: Record<string, string> = {
  qwen: "text-embedding-v4 / text-embedding-v3",
  openai: "text-embedding-3-small / text-embedding-3-large",
  zhipu: "embedding-3",
  mimo: "以服务商文档为准",
  deepseek: "以服务商文档为准",
  custom: "以服务商文档为准",
};

async function embedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export default function EmbeddingSection() {
  const [loaded, setLoaded] = useState<EmbeddingView | null>(null);
  const [live, setLive] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("qwen");
  const [model, setModel] = useState("text-embedding-v4");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_BASES.qwen);
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    embedFetch<EmbeddingView>("/api/settings/embedding")
      .then((cfg) => {
        setLoaded(cfg);
        setEnabled(cfg.enabled);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setBaseUrl(cfg.baseUrl);
      })
      .catch(() => {
        setLive(false);
      });
  }, []);

  const pickProvider = (next: string) => {
    setProvider(next);
    const base = PROVIDER_BASES[next];
    if (base !== undefined && base !== "") setBaseUrl(base);
  };

  const save = async () => {
    if (busy) return;
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { enabled, provider, model: model.trim(), baseUrl: baseUrl.trim() };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const cfg = await embedFetch<EmbeddingView>("/api/settings/embedding", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setLoaded(cfg);
      setApiKey("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    if (busy) return;
    setBusy("check");
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { model: model.trim(), baseUrl: baseUrl.trim() };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await embedFetch<CheckResult>("/api/settings/embedding/check", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (err) {
      setResult({ overall: "failed", error: err instanceof Error ? err.message : "测试失败" });
    } finally {
      setBusy(null);
    }
  };

  const keyPlaceholder = loaded?.hasKey ? loaded.apiKeyMasked ?? "已保存密钥" : "sk-…（必填，不做内置）";

  return (
    <div className="sf-embed">
      {!live && <p className="sf-live-tag">配置加载失败 · 请刷新后重试</p>}
      <p className="sf-embed-intro">
        知识库（记忆库）用这里配置的 embedding 模型向量化文档，检索升级为 BM25 + 向量混合（hybrid）。
        未配置或关闭时自动退回关键词检索。保存即时生效，无需重启。
      </p>

      <label className="sf-embed-switch">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e: FormEvent<HTMLInputElement>) => setEnabled(e.currentTarget.checked)}
        />
        <span>
          <strong>启用向量检索</strong>
          <small>关闭后知识库仅使用关键词检索（BM25）</small>
        </span>
      </label>

      <div className="sf-embed-grid">
        <label className="sf-embed-field">
          服务商
          <select value={provider} onChange={(e: FormEvent<HTMLSelectElement>) => pickProvider(e.currentTarget.value)}>
            {Object.keys(PROVIDER_LABELS).map((pid) => (
              <option key={pid} value={pid}>
                {PROVIDER_LABELS[pid]}
              </option>
            ))}
          </select>
        </label>
        <label className="sf-embed-field">
          模型
          <input
            value={model}
            onChange={(e: FormEvent<HTMLInputElement>) => setModel(e.currentTarget.value)}
            placeholder={PROVIDER_MODEL_HINTS[provider] ?? "模型 ID"}
          />
          <small>默认 qwen 向量模型（{PROVIDER_MODEL_HINTS[provider] ?? ""}）</small>
        </label>
        <label className="sf-embed-field sf-embed-field--wide">
          Base URL（OpenAI 兼容）
          <input
            value={baseUrl}
            onChange={(e: FormEvent<HTMLInputElement>) => setBaseUrl(e.currentTarget.value)}
            placeholder="https://…/v1"
          />
        </label>
        <label className="sf-embed-field sf-embed-field--wide">
          API Key
          <span className="sf-embed-key">
            <input
              type={reveal ? "text" : "password"}
              value={apiKey}
              onChange={(e: FormEvent<HTMLInputElement>) => setApiKey(e.currentTarget.value)}
              placeholder={keyPlaceholder}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setReveal(!reveal)}
              aria-label={reveal ? "隐藏密钥" : "显示密钥"}
              title={reveal ? "隐藏密钥" : "显示密钥"}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </span>
          <small>密钥仅保存在本机 .shadowflow 配置中；留空则保持原密钥不变</small>
        </label>
      </div>

      <div className="sf-embed-actions">
        <button className="sf-embed-primary" onClick={save} disabled={busy !== null}>
          {busy === "save" ? <Loader2 size={14} className="sf-spin" /> : <Save size={14} />}
          保存配置
          {saved && <Check size={14} />}
        </button>
        <button className="sf-embed-ghost" onClick={check} disabled={busy !== null}>
          {busy === "check" ? <Loader2 size={14} className="sf-spin" /> : <PlugZap size={14} />}
          连通测试
        </button>
      </div>

      {result && (
        <p className={`sf-embed-result ${result.overall}`}>
          {result.overall === "ok"
            ? `✅ 连接成功 · 向量维度 ${result.dims ?? "?"} · 延迟 ${result.latencyMs ?? "?"}ms`
            : `❌ 连接失败 · ${result.error ?? "未知错误"}`}
        </p>
      )}
      {error && <p className="sf-auth-error">{error}</p>}
    </div>
  );
}

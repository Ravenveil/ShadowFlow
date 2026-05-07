/**
 * ToolProvidersTab — Story 8.4b (AC2, AC5)
 *
 * Settings tab for MCP Provider registration:
 *   - List existing providers with status & masked credentials
 *   - Register form: name, transport_type, command/server_url, env key-value pairs
 *   - Delete a provider
 *   - Re-test connection
 *
 * Credentials are shown as *** (never plain-text from backend).
 */
import { useEffect, useState } from 'react';
import type { McpProvider, RegisterProviderPayload } from '../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

async function apiFetchProviders(): Promise<McpProvider[]> {
  const res = await fetch(`${API_BASE_URL}/tools/providers`);
  if (!res.ok) return [];
  const j = await res.json();
  return j.data?.providers ?? [];
}

async function apiRegister(payload: RegisterProviderPayload): Promise<{ ok: boolean; error?: string; provider?: McpProvider }> {
  const res = await fetch(`${API_BASE_URL}/tools/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!res.ok) {
    const errMsg = typeof j?.detail === 'object' ? j.detail.message : (j?.detail ?? 'Registration failed');
    return { ok: false, error: errMsg };
  }
  return { ok: true, provider: j.data?.provider };
}

async function apiDelete(providerId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/tools/providers/${providerId}`, { method: 'DELETE' });
  return res.ok;
}

async function apiTest(providerId: string): Promise<{ ok: boolean; message: string; tool_count: number }> {
  const res = await fetch(`${API_BASE_URL}/tools/providers/${providerId}/test`, { method: 'POST' });
  const j = await res.json();
  if (!res.ok) {
    const errMsg = typeof j?.detail === 'object' ? j.detail.message : (j?.detail ?? 'Test failed');
    return { ok: false, message: errMsg, tool_count: 0 };
  }
  return { ok: true, message: j.data?.message ?? 'Connected', tool_count: j.data?.tool_count ?? 0 };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: McpProvider['status'] }) {
  const cls =
    status === 'connected'
      ? 'bg-sf-ok/15 text-sf-ok'
      : status === 'error'
        ? 'bg-sf-reject/15 text-sf-reject'
        : 'bg-sf-elev3 text-sf-fg4';
  return (
    <span className={`rounded-[5px] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Register form
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  transport_type: 'stdio' | 'http' | 'sse';
  command: string; // space-separated
  server_url: string;
  envPairs: Array<{ key: string; value: string }>;
  description: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    transport_type: 'stdio',
    command: '',
    server_url: '',
    envPairs: [{ key: '', value: '' }],
    description: '',
  };
}

interface RegisterFormProps {
  onSuccess: (provider: McpProvider) => void;
  onCancel: () => void;
}

function RegisterForm({ onSuccess, onCancel }: RegisterFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function updateEnvPair(idx: number, field: 'key' | 'value', val: string) {
    setForm((prev) => {
      const pairs = [...prev.envPairs];
      pairs[idx] = { ...pairs[idx], [field]: val };
      return { ...prev, envPairs: pairs };
    });
  }

  function addEnvPair() {
    setForm((prev) => ({ ...prev, envPairs: [...prev.envPairs, { key: '', value: '' }] }));
  }

  function removeEnvPair(idx: number) {
    setForm((prev) => ({ ...prev, envPairs: prev.envPairs.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const env: Record<string, string> = {};
    for (const { key, value } of form.envPairs) {
      if (key.trim()) env[key.trim()] = value;
    }

    const payload: RegisterProviderPayload = {
      name: form.name.trim(),
      transport_type: form.transport_type,
      env,
      description: form.description.trim(),
      ...(form.transport_type === 'stdio'
        ? { command: form.command.trim().split(/\s+/).filter(Boolean) }
        : { server_url: form.server_url.trim() }),
    };

    const result = await apiRegister(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Registration failed');
      return;
    }
    if (result.provider) onSuccess(result.provider);
  }

  const inputCls =
    'w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-2.5 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none';
  const labelCls = 'mb-1 block font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-sf-fg4';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2">
          <label className={labelCls}>Provider 名称</label>
          <input
            className={inputCls}
            placeholder="e.g. 小红书搜索"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </div>

        {/* Transport */}
        <div>
          <label className={labelCls}>Transport</label>
          <select
            className={inputCls}
            value={form.transport_type}
            onChange={(e) => setField('transport_type', e.target.value as FormState['transport_type'])}
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </select>
        </div>

        {/* Command / URL */}
        {form.transport_type === 'stdio' ? (
          <div className="col-span-2">
            <label className={labelCls}>Command（空格分隔）</label>
            <input
              className={inputCls}
              placeholder="e.g. npx xhs-mcp-server"
              value={form.command}
              onChange={(e) => setField('command', e.target.value)}
            />
          </div>
        ) : (
          <div className="col-span-2">
            <label className={labelCls}>Server URL</label>
            <input
              className={inputCls}
              placeholder="https://api.example.com/mcp"
              value={form.server_url}
              onChange={(e) => setField('server_url', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Env key-value pairs */}
      <div>
        <label className={labelCls}>凭证（env）— 值将加密存储，显示为 ***</label>
        <div className="flex flex-col gap-1.5">
          {form.envPairs.map((pair, idx) => (
            <div key={idx} className="flex gap-1.5">
              <input
                className={`${inputCls} flex-1`}
                placeholder="KEY"
                value={pair.key}
                onChange={(e) => updateEnvPair(idx, 'key', e.target.value)}
              />
              <input
                className={`${inputCls} flex-1`}
                placeholder="value"
                type="password"
                value={pair.value}
                onChange={(e) => updateEnvPair(idx, 'value', e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeEnvPair(idx)}
                className="px-2 text-[12px] text-sf-fg5 hover:text-sf-reject"
                aria-label="Remove env pair"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addEnvPair}
            className="self-start font-mono text-[10px] text-sf-fg5 hover:text-sf-accent-bright"
          >
            ＋ Add key
          </button>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>描述（可选）</label>
        <input
          className={inputCls}
          placeholder="简要说明该 Provider 的用途"
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-[7px] bg-sf-reject/10 px-3 py-2 font-mono text-[11px] text-sf-reject">
          ✕ {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? '连接验证中…' : '注册并连接'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[8px] border border-sf-border px-4 py-2 text-[12px] text-sf-fg3"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Provider card
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  onDelete,
  onTest,
}: {
  provider: McpProvider;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    await onTest(provider.provider_id);
    setTesting(false);
  }

  const hasEnv = Object.keys(provider.env_masked).length > 0;

  return (
    <div
      className="rounded-[10px] border border-sf-border bg-sf-panel p-4"
      data-testid={`provider-card-${provider.provider_id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sf-fg1 text-[13px]">{provider.name}</span>
            <StatusBadge status={provider.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[10px] text-sf-fg5">
              {provider.transport_type}
              {provider.transport_type === 'stdio' && provider.command.length > 0
                ? ` · ${provider.command.join(' ')}`
                : provider.server_url
                  ? ` · ${provider.server_url}`
                  : ''}
            </span>
          </div>
          {provider.description && (
            <p className="mt-1 text-[11px] text-sf-fg4">{provider.description}</p>
          )}
          {hasEnv && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.keys(provider.env_masked).map((k) => (
                <span
                  key={k}
                  className="rounded-[4px] bg-sf-elev2 px-1.5 py-0.5 font-mono text-[9px] text-sf-fg4"
                >
                  {k}=***
                </span>
              ))}
            </div>
          )}
          {provider.last_test_result && (
            <p
              className={`mt-2 font-mono text-[10px] ${provider.last_test_result.success ? 'text-sf-ok' : 'text-sf-reject'}`}
            >
              {provider.last_test_result.success ? '✓' : '✕'} {provider.last_test_result.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-[7px] border border-sf-border px-2.5 py-1.5 font-mono text-[10px] text-sf-fg3 hover:text-sf-fg1 disabled:opacity-50"
          >
            {testing ? '…' : 'Test'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(provider.provider_id)}
            className="rounded-[7px] border border-sf-border px-2.5 py-1.5 font-mono text-[10px] text-sf-fg4 hover:border-sf-reject hover:text-sf-reject"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolProvidersTab
// ---------------------------------------------------------------------------

export function ToolProvidersTab() {
  const [providers, setProviders] = useState<McpProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function loadProviders() {
    const list = await apiFetchProviders();
    setProviders(list);
    setLoading(false);
  }

  useEffect(() => { loadProviders(); }, []);

  async function handleTest(providerId: string) {
    await apiTest(providerId);
    await loadProviders();
  }

  async function handleDelete(providerId: string) {
    const ok = await apiDelete(providerId);
    if (ok) {
      setProviders((prev) => prev.filter((p) => p.provider_id !== providerId));
    } else {
      // Deletion failed — keep the provider in the list and reload to ensure sync
      await loadProviders();
    }
  }

  function handleRegisterSuccess(newProvider: McpProvider) {
    setProviders((prev) => [...prev, newProvider]);
    setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="tool-providers-tab">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-sf-fg1">MCP Tool Providers</h2>
          <p className="mt-1 text-[12px] text-sf-fg4">
            注册一次，全平台 Agent 共用。凭证加密存储，永不明文传输。
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-[8px] bg-sf-accent px-3 py-2 text-[12px] font-semibold text-white"
            data-testid="register-provider-btn"
          >
            ＋ 注册 Provider
          </button>
        )}
      </div>

      {/* Register form */}
      {showForm && (
        <div className="rounded-[12px] border border-sf-accent/30 bg-sf-panel p-5">
          <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-sf-accent-bright">
            注册新 MCP Provider
          </h3>
          <RegisterForm onSuccess={handleRegisterSuccess} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <p className="py-8 text-center font-mono text-[11px] text-sf-fg5">Loading…</p>
      ) : providers.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-sf-border p-8 text-center">
          <p className="font-mono text-[11px] text-sf-fg5">尚未注册任何 Provider</p>
          <p className="mt-1 text-[12px] text-sf-fg4">点击"注册 Provider"接入小红书搜索、GitHub API 等 MCP 工具。</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.map((p) => (
            <ProviderCard
              key={p.provider_id}
              provider={p}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

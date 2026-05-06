import { useState, useEffect } from 'react';
import type { WorkflowNode } from '../../../common/types';

const PROVIDERS = ['claude', 'openai', 'gemini', 'ollama', 'zerog'] as const;
type Provider = (typeof PROVIDERS)[number];

interface ProviderPanelProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
}

export function ProviderPanel({ node, onUpdate }: ProviderPanelProps) {
  const cfg = (node.data.config ?? {}) as Record<string, unknown>;
  const [provider, setProvider] = useState<Provider>((cfg.provider as Provider) ?? 'claude');
  const [fallbackChain, setFallbackChain] = useState<Provider[]>(
    (cfg.fallback_chain as Provider[]) ?? [],
  );
  const [timeout, setTimeout_] = useState<number>((cfg.timeout_seconds as number) ?? 30);

  useEffect(() => {
    setProvider((cfg.provider as Provider) ?? 'claude');
    setFallbackChain((cfg.fallback_chain as Provider[]) ?? []);
    setTimeout_((cfg.timeout_seconds as number) ?? 30);
  }, [node.id]);

  function pushUpdate(p: Provider, fc: Provider[], t: number) {
    onUpdate(node.id, {
      config: { ...cfg, provider: p, fallback_chain: fc, timeout_seconds: t },
    });
  }

  function toggleFallback(p: Provider) {
    const next = fallbackChain.includes(p)
      ? fallbackChain.filter((x) => x !== p)
      : [...fallbackChain, p];
    setFallbackChain(next);
    pushUpdate(provider, next, timeout);
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--fg-4)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
  };
  const select: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--bg-elev-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-1)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    boxSizing: 'border-box',
  };
  const checkRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--fg-2)',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 12 }}>
        Provider
      </div>

      {/* Primary provider */}
      <div style={{ marginBottom: 12 }}>
        <label style={label}>主 Provider</label>
        <select
          value={provider}
          style={select}
          onChange={(e) => {
            const p = e.target.value as Provider;
            setProvider(p);
            pushUpdate(p, fallbackChain, timeout);
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Fallback chain */}
      <div style={{ marginBottom: 12 }}>
        <label style={label}>Fallback 链（按选中顺序）</label>
        {PROVIDERS.filter((p) => p !== provider).map((p) => (
          <label key={p} style={checkRow}>
            <input
              type="checkbox"
              checked={fallbackChain.includes(p)}
              onChange={() => toggleFallback(p)}
              style={{ accentColor: 'var(--accent)' }}
            />
            {p}
            {fallbackChain.includes(p) && (
              <span style={{ color: 'var(--fg-5)', fontSize: 10 }}>
                #{fallbackChain.indexOf(p) + 1}
              </span>
            )}
          </label>
        ))}
      </div>

      {/* Timeout */}
      <div>
        <label style={label}>超时 (秒)</label>
        <input
          type="number"
          min={5}
          max={300}
          value={timeout}
          style={select}
          onChange={(e) => {
            const t = Math.max(5, Number(e.target.value));
            setTimeout_(t);
            pushUpdate(provider, fallbackChain, t);
          }}
        />
      </div>
    </div>
  );
}

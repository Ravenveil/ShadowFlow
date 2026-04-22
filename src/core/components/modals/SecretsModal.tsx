import { useState } from 'react';
import { useSecretsStore, type ProviderSecrets } from '../../hooks/useSecretsStore';

const PROVIDERS: { key: keyof ProviderSecrets; label: string; placeholder: string }[] = [
  { key: 'anthropic', label: 'Claude (Anthropic)', placeholder: 'sk-ant-...' },
  { key: 'openai',    label: 'OpenAI',             placeholder: 'sk-...' },
  { key: 'gemini',    label: 'Gemini (Google)',     placeholder: 'AIza...' },
  { key: 'zerog',     label: '0G Compute',          placeholder: '0x...' },
];

interface SecretsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SecretsModal({ open, onClose }: SecretsModalProps) {
  const { secrets, setSecret, clearSecret } = useSecretsStore();
  const [draft, setDraft] = useState<Partial<ProviderSecrets>>({});

  if (!open) return null;

  function handleSave() {
    Object.entries(draft).forEach(([k, v]) => {
      const key = k as keyof ProviderSecrets;
      if (v) setSecret(key, v);
      else clearSecret(key);
    });
    setDraft({});
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--bg-elev-3)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-1)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    boxSizing: 'border-box',
    marginTop: 4,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 32px', width: 420, boxShadow: '0 24px 64px rgba(0,0,0,.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--fg-0)', letterSpacing: '-.02em' }}>
          API 密钥 (BYOK)
        </h2>
        {/* D6: BYOK plaintext localStorage warning banner */}
        <div style={{ margin: '0 0 20px', padding: '8px 12px', background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)', borderRadius: 8, fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
          ⚠ 密钥仅存本机浏览器 localStorage，不经过服务器。<br />
          <span style={{ color: 'var(--fg-5)' }}>请勿在公共设备使用 · 清除浏览器数据时密钥将丢失</span>
        </div>

        {PROVIDERS.map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {label}
              {secrets[key] && (
                <span style={{ color: 'var(--status-approve)', marginLeft: 6, fontSize: 9 }}>✓ 已保存</span>
              )}
            </label>
            <input
              type="password"
              placeholder={secrets[key] ? '（已保存，留空不变）' : placeholder}
              value={draft[key] ?? ''}
              style={inputStyle}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              autoComplete="off"
            />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--bg-elev-3)', border: '1px solid var(--border)', color: 'var(--fg-2)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

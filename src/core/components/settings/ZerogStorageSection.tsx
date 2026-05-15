/**
 * ZerogStorageSection — Settings: 0G Storage Private Key
 *
 * Lets users save their 0G Storage wallet private key (AES-GCM encrypted,
 * passphrase-protected) so the EditorPage "Publish 0G" button can sign
 * uploads without asking for a raw key every time.
 *
 * Store: useZerogSecretsStore (src/core/hooks/useZerogSecretsStore.ts)
 *   putPrivateKey(pk, passphrase)  — encrypt + persist to localStorage
 *   clear()                        — wipe the encrypted blob
 *   hasEncryptedBlob               — true if a key is already saved
 */
import { useState } from 'react';
import { useZerogSecretsStore } from '../../hooks/useZerogSecretsStore';

const ROW: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 18,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t-fg-3)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--t-input-bg, var(--t-panel))',
  border: '1px solid var(--t-border)',
  borderRadius: 7,
  padding: '8px 10px',
  fontSize: 12.5,
  color: 'var(--t-fg)',
  outline: 'none',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
};

const HINT: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--t-fg-4)',
  lineHeight: 1.5,
};

export function ZerogStorageSection() {
  const hasEncryptedBlob = useZerogSecretsStore((s) => s.hasEncryptedBlob);
  const putPrivateKey    = useZerogSecretsStore((s) => s.putPrivateKey);
  const clearKey         = useZerogSecretsStore((s) => s.clear);

  const [pk, setPk]               = useState('');
  const [passphrase, setPass]     = useState('');
  const [confirmPass, setConfirm] = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  async function handleSave() {
    setError(null);
    if (!pk.trim()) { setError('Private key cannot be empty.'); return; }
    if (!pk.trim().match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      setError('Invalid private key — must be 32 bytes hex (64 chars, with or without 0x prefix).');
      return;
    }
    if (!passphrase) { setError('Passphrase cannot be empty.'); return; }
    if (passphrase !== confirmPass) { setError('Passphrases do not match.'); return; }

    setSaving(true);
    try {
      await putPrivateKey(pk.trim(), passphrase);
      setPk('');
      setPass('');
      setConfirm('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    if (!window.confirm('Remove the saved 0G Storage key? You will need to re-enter it before the next upload.')) return;
    clearKey();
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg)', marginBottom: 6 }}>
          0G Storage — Wallet Key
        </div>
        <div style={HINT}>
          Your private key is encrypted with your passphrase (AES-GCM + PBKDF2) and stored only
          in your browser's localStorage. It never leaves your device. You will be asked for your
          passphrase each time you publish a workflow trajectory to 0G Storage.
        </div>
      </div>

      {/* Status badge */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: hasEncryptedBlob ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.1)',
            color: hasEncryptedBlob ? '#34d399' : 'var(--t-fg-4)',
            border: `1px solid ${hasEncryptedBlob ? 'rgba(52,211,153,0.3)' : 'var(--t-border)'}`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          {hasEncryptedBlob ? 'Key saved (encrypted)' : 'No key saved'}
        </div>
        {hasEncryptedBlob && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              fontSize: 11,
              color: 'var(--t-fg-4)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Remove key
          </button>
        )}
      </div>

      {/* Form */}
      <div style={ROW}>
        <label style={LABEL}>Private Key (hex)</label>
        <input
          type="password"
          placeholder="0x… or 64-char hex"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          style={INPUT}
          autoComplete="off"
          spellCheck={false}
        />
        <div style={HINT}>
          Your 0G-compatible EVM wallet private key. Get testnet A0GI from the{' '}
          <a href="https://faucet.0g.ai" target="_blank" rel="noreferrer" style={{ color: 'var(--t-accent)' }}>
            0G faucet
          </a>.
        </div>
      </div>

      <div style={ROW}>
        <label style={LABEL}>Encryption Passphrase</label>
        <input
          type="password"
          placeholder="Choose a strong passphrase"
          value={passphrase}
          onChange={(e) => setPass(e.target.value)}
          style={INPUT}
          autoComplete="new-password"
        />
      </div>

      <div style={ROW}>
        <label style={LABEL}>Confirm Passphrase</label>
        <input
          type="password"
          placeholder="Re-enter passphrase"
          value={confirmPass}
          onChange={(e) => setConfirm(e.target.value)}
          style={INPUT}
          autoComplete="new-password"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 11.5, color: '#f87171', marginBottom: 12 }}>{error}</div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '8px 18px',
          borderRadius: 7,
          background: saved ? 'rgba(52,211,153,0.15)' : 'var(--t-accent)',
          color: saved ? '#34d399' : '#fff',
          border: saved ? '1px solid rgba(52,211,153,0.3)' : 'none',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : hasEncryptedBlob ? 'Update Key' : 'Save Key'}
      </button>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Sparkles } from '../../../common/icons/iconRegistry';
import { useSecretsStore } from '../../hooks/useSecretsStore';

const DEMO_KEY = import.meta.env.VITE_DEMO_LLM_KEY || '';

interface QuickDemoBYOKModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickDemoBYOKModal({ open, onClose }: QuickDemoBYOKModalProps) {
  const { setSecret } = useSecretsStore();
  const [key, setKey] = useState('');

  useEffect(() => {
    if (open) setKey('');
  }, [open]);

  if (!open) return null;

  function handleUseDemoKey() {
    if (DEMO_KEY) {
      setSecret('anthropic', DEMO_KEY);
    }
    onClose();
  }

  function handleSaveKey() {
    if (key.trim()) {
      setSecret('anthropic', key.trim());
    }
    onClose();
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="byok-modal-title"
        style={{
          background: 'var(--bg-elev-2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '28px 32px',
          width: 440,
          boxShadow: '0 24px 64px rgba(0,0,0,.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="byok-modal-title"
          style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 800,
            color: 'var(--fg-0)',
            letterSpacing: '-.02em',
          }}
        >
          自带 Key 上路
        </h2>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 13,
            color: 'var(--fg-3)',
            lineHeight: 1.6,
          }}
        >
          ShadowFlow 不存你的 key，仅在本地 localStorage；评委 demo 可用我们 pre-baked 的临时
          key。
        </p>

        {DEMO_KEY && (
          <button
            onClick={handleUseDemoKey}
            style={{
              width: '100%',
              height: 42,
              marginBottom: 16,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--accent-ink)',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-bright)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)';
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} strokeWidth={2} /> 用演示 Key（rate-limited，不可商用）
            </span>
          </button>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            color: 'var(--fg-5)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          或手动填入
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--fg-4)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            marginBottom: 4,
          }}
        >
          Claude (Anthropic) API Key
        </label>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg-elev-3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--fg-1)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            boxSizing: 'border-box',
            marginBottom: 20,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && key.trim()) handleSaveKey();
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              background: 'var(--bg-elev-3)',
              border: '1px solid var(--border)',
              color: 'var(--fg-2)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            跳过
          </button>
          {key.trim() && (
            <button
              onClick={handleSaveKey}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                background: 'var(--accent)',
                border: 'none',
                color: 'var(--accent-ink)',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              保存并继续
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CreateAgentModal — branded "create your digital partner" onboarding ceremony.
 *
 * Visual target = clawsgo's 「你的常驻数字伙伴」first-run modal: a short headline,
 * four capability tiles (独立环境 / 长期记忆 / 私有知识库 / 全知全能) with line icons,
 * an agent-name input, and a primary "创建 Agent" CTA. Calm, polished, animated
 * entrance (reuses the global sf-modal-* keyframes from index.css).
 *
 * Presentational + callback only — no backend invented here. The parent owns the
 * create flow via onCreate(name); the modal just validates a non-empty name and
 * surfaces a busy state while the promise (if returned) settles.
 *
 * Style convention matches the repo: heavy inline styles + CSS vars
 * (--t-fg / --t-accent / --t-panel / --t-panel-2 / --t-border / --t-accent-tint …)
 * and the sf-* animation classes.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Brain,
  Library,
  Sparkles,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react';

export interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  /** Parent owns the real create flow. Returning a promise drives the busy
   *  state; throwing surfaces the inline error bar. */
  onCreate: (name: string) => Promise<void> | void;
  /** Optional pre-fill (e.g. resuming a draft). */
  defaultName?: string;
}

interface Capability {
  icon: ReactNode;
  title: string;
  desc: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: <Box size={18} strokeWidth={1.8} />,
    title: '独立环境',
    desc: '专属沙箱，文件 / 终端 / 浏览器随取随用',
  },
  {
    icon: <Brain size={18} strokeWidth={1.8} />,
    title: '长期记忆',
    desc: '跨会话记住偏好与上下文，越用越懂你',
  },
  {
    icon: <Library size={18} strokeWidth={1.8} />,
    title: '私有知识库',
    desc: '接入你的文档与数据，回答有据可依',
  },
  {
    icon: <Sparkles size={18} strokeWidth={1.8} />,
    title: '全知全能',
    desc: '调研 / 编码 / 写作 / 分析，一个伙伴全包',
  },
];

export function CreateAgentModal({
  open,
  onClose,
  onCreate,
  defaultName = '',
}: CreateAgentModalProps) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset + focus on each open.
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setError(null);
      setBusy(false);
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open, defaultName]);

  // Esc to close (when not busy).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请先给你的 Agent 起个名字');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="创建你的数字伙伴"
      data-testid="create-agent-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'color-mix(in oklab, var(--t-bg) 55%, rgba(0,0,0,.55))',
        backdropFilter: 'blur(6px)',
        animation: 'sf-modal-backdrop-in 160ms ease',
      }}
    >
      <div
        className="hf-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          padding: '28px 28px 24px',
          borderRadius: 16,
          background: 'var(--t-panel)',
          border: '1px solid color-mix(in oklab, var(--t-accent) 24%, var(--t-border))',
          boxShadow:
            '0 24px 64px -24px color-mix(in oklab, var(--t-accent) 40%, transparent), 0 8px 24px -12px rgba(0,0,0,.4)',
          animation: 'sf-modal-card-in 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* Decorative accent glow behind the header */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            height: 160,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse, color-mix(in oklab, var(--t-accent) 22%, transparent) 0%, transparent 65%)',
            filter: 'blur(34px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Close */}
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="关闭"
          data-testid="create-agent-close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--t-fg-4)',
            cursor: busy ? 'not-allowed' : 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--t-panel-2)';
            e.currentTarget.style.color = 'var(--t-fg-2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--t-fg-4)';
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>

        {/* Header */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 22 }}>
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 12px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--t-accent-tint)',
              color: 'var(--t-accent)',
              boxShadow:
                '0 8px 22px -10px color-mix(in oklab, var(--t-accent) 60%, transparent)',
            }}
          >
            <Sparkles size={24} strokeWidth={1.8} />
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-.02em',
              fontFamily: 'var(--font-display, inherit)',
              color: 'var(--t-fg)',
            }}
          >
            你的常驻数字伙伴
          </h2>
          <p
            style={{
              margin: '6px auto 0',
              maxWidth: 360,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--t-fg-3)',
            }}
          >
            创建一个属于你的 Agent，它有独立环境、长期记忆，能持续为你工作。
          </p>
        </div>

        {/* Capability tiles */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 22,
          }}
        >
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 12px',
                borderRadius: 11,
                background: 'var(--t-panel-2)',
                border: '1px solid var(--t-border)',
                transition: 'border-color 140ms ease, transform 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor =
                  'color-mix(in oklab, var(--t-accent) 40%, var(--t-border))';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--t-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 9,
                  background: 'var(--t-accent-tint)',
                  color: 'var(--t-accent)',
                }}
              >
                {c.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)' }}>
                  {c.title}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--t-fg-4)',
                  }}
                >
                  {c.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Name input */}
        <div style={{ position: 'relative', zIndex: 1, marginBottom: 14 }}>
          <label
            htmlFor="create-agent-name"
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-4)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            给它起个名字
          </label>
          <input
            id="create-agent-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="例如：研究助理 Nova"
            maxLength={40}
            data-testid="create-agent-name-input"
            disabled={busy}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: 42,
              padding: '0 14px',
              borderRadius: 10,
              background: 'var(--t-bg-elev-2, var(--t-panel-2))',
              border: '1px solid var(--t-border)',
              color: 'var(--t-fg)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 140ms ease, box-shadow 140ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--t-accent)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--t-accent-tint)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--t-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            data-testid="create-agent-error"
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--t-danger-tint, rgba(220, 53, 69, .12))',
              border: '1px solid var(--t-danger, #dc3545)',
              color: 'var(--t-danger-fg, #dc3545)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy}
          data-testid="create-agent-submit"
          className="hf-btn hf-btn-pri"
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 800,
            borderRadius: 11,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.8 : 1,
            boxShadow:
              '0 10px 26px -8px color-mix(in oklab, var(--t-accent) 55%, transparent)',
          }}
        >
          {busy ? (
            <>
              <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
              创建中…
            </>
          ) : (
            <>
              创建 Agent
              <ArrowRight size={16} strokeWidth={2.4} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default CreateAgentModal;

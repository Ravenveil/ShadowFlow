/**
 * MediaProvidersSection — Settings: Media Generation Provider API Key Management
 *
 * Supports image, video, and audio generation providers:
 *   GET    /api/settings/media               → { providers, keys: Record<id, string|null> }
 *   PUT    /api/settings/media               → { providerId, apiKey } → { ok: true }
 *   DELETE /api/settings/media/{provider_id} → { ok: true }
 *
 * Falls back gracefully to localStorage 'sf.mediaKeys' if API is unavailable.
 */
import React, { useEffect, useState } from 'react';
import { Icon } from '../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface MediaProvider {
  id: string;
  name: string;
  hint: string;
  category: 'image' | 'video' | 'audio';
  docsUrl: string;
}

const MEDIA_PROVIDERS: MediaProvider[] = [
  // Image
  { id: 'openai-image', name: 'OpenAI Image',  hint: 'DALL-E 3 / gpt-image-2',  category: 'image', docsUrl: 'https://platform.openai.com/docs/guides/images' },
  { id: 'stability',    name: 'Stability AI',  hint: 'Stable Diffusion XL',     category: 'image', docsUrl: 'https://platform.stability.ai/' },
  { id: 'fal',          name: 'Fal.ai',        hint: 'Fast diffusion models',   category: 'image', docsUrl: 'https://fal.ai/' },
  { id: 'replicate',    name: 'Replicate',     hint: 'Open model hosting',      category: 'image', docsUrl: 'https://replicate.com/' },
  { id: 'xai',          name: 'xAI / Grok',   hint: 'Aurora image model',      category: 'image', docsUrl: 'https://x.ai/' },
  // Video
  { id: 'kling',        name: 'Kling',         hint: 'Video generation',        category: 'video', docsUrl: 'https://kling.ai/' },
  { id: 'minimax',      name: 'MiniMax Video', hint: 'Video + speech',          category: 'video', docsUrl: 'https://www.minimaxi.com/' },
  // Audio
  { id: 'elevenlabs',   name: 'ElevenLabs',   hint: 'Voice cloning & TTS',     category: 'audio', docsUrl: 'https://elevenlabs.io/' },
  { id: 'suno',         name: 'Suno',          hint: 'AI music generation',     category: 'audio', docsUrl: 'https://suno.com/' },
];

const CATEGORY_META = {
  image: { label: '图片生成', emoji: '🖼' },
  video: { label: '视频生成', emoji: '🎬' },
  audio: { label: '音频生成', emoji: '🎵' },
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';
const LS_KEY = 'sf.mediaKeys';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  maskedKey,
  onSave,
  onClear,
}: {
  provider: MediaProvider;
  maskedKey: string | null;
  onSave: (key: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<SaveState>('idle');

  async function handleSave() {
    if (!input.trim()) return;
    setState('saving');
    try {
      await onSave(input.trim());
      setInput('');
      setState('saved');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  async function handleClear() {
    try {
      await onClear();
    } catch {
      // Best-effort; parent already handles state update
    }
  }

  const inputCls =
    'w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors';

  return (
    <div className="rounded-[12px] border border-sf-border bg-sf-panel p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-sf-fg1">{provider.name}</p>
          <p className="text-[11px] text-sf-fg4">{provider.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {maskedKey && (
            <span className="rounded-[5px] bg-sf-ok/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-sf-ok">
              Connected
            </span>
          )}
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-sf-accent-bright hover:underline"
          >
            Docs ↗
          </a>
        </div>
      </div>

      {/* Key + input area */}
      <div className="mt-3 flex flex-col gap-2">
        {/* Existing key row */}
        {maskedKey && (
          <div className="flex items-center gap-2 rounded-[7px] bg-sf-elev3 px-3 py-1.5">
            <span className="font-mono text-[10px] text-sf-fg4">Key：</span>
            <span className="font-mono text-[10px] text-sf-fg2">
              {maskedKey.startsWith('*') ? maskedKey : `••••${maskedKey}`}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto rounded-[5px] border border-sf-border px-2 py-0.5 font-mono text-[9px] text-sf-fg4 hover:border-sf-reject hover:text-sf-reject transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Input + Save row */}
        <div className="flex gap-2">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Paste API key"
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!input.trim() || state === 'saving'}
            className="flex-shrink-0 rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
          >
            {state === 'saving' ? '…' : 'Save'}
          </button>
        </div>

        {/* Feedback messages */}
        {state === 'saved' && (
          <p className="font-mono text-[11px] text-sf-ok">✓ Saved</p>
        )}
        {state === 'error' && (
          <p className="font-mono text-[11px] text-sf-reject">✕ Failed</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function MediaProvidersSection() {
  const [keys, setKeys] = useState<Record<string, string | null>>({});

  // Load keys on mount — try API first, fall back to localStorage
  useEffect(() => {
    fetch(`${API_BASE}/api/settings/media`, { signal: AbortSignal.timeout(3000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { keys?: Record<string, string | null> }) =>
        setKeys(data.keys ?? {}),
      )
      .catch(() => {
        try {
          const stored = localStorage.getItem(LS_KEY);
          if (stored) setKeys(JSON.parse(stored));
        } catch {
          // ignore parse errors
        }
      });
  }, []);

  async function handleSave(providerId: string, apiKey: string) {
    try {
      const res = await fetch(`${API_BASE}/api/settings/media`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('not ok');
    } catch {
      // localStorage fallback — store only last 4 chars
      try {
        const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
        stored[providerId] = apiKey.slice(-4);
        localStorage.setItem(LS_KEY, JSON.stringify(stored));
      } catch {
        // ignore
      }
    }
    setKeys((prev) => ({ ...prev, [providerId]: apiKey.slice(-4) }));
  }

  async function handleClear(providerId: string) {
    try {
      await fetch(`${API_BASE}/api/settings/media/${providerId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // ignore — still update local state
    }
    // Remove from localStorage too
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
      delete stored[providerId];
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
    } catch {
      // ignore
    }
    setKeys((prev) => ({ ...prev, [providerId]: null }));
  }

  const categories: Array<'image' | 'video' | 'audio'> = ['image', 'video', 'audio'];

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">媒体提供商</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          配置图片、视频、音频生成服务的 API Key。
        </p>
      </div>

      {/* Category groups */}
      {categories.map((cat) => {
        const providers = MEDIA_PROVIDERS.filter((p) => p.category === cat);
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat} className="flex flex-col gap-3">
            {/* Category header */}
            <div className="flex items-center gap-2">
              <span className="text-sf-fg2"><Icon token={meta.emoji} size={16} /></span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
                {meta.label}
              </span>
              <div className="flex-1 border-t border-sf-border" />
            </div>

            {/* Provider cards */}
            {providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                maskedKey={keys[p.id] ?? null}
                onSave={(key) => handleSave(p.id, key)}
                onClear={() => handleClear(p.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

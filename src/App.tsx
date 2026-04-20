// ============================================================================
// ShadowFlow Landing Page (Story 0.1 stub)
// ----------------------------------------------------------------------------
// The full editor (Canvas / Panel / Toolbar / RiverInspector / DamTimeline)
// currently does not build because many imports in App.tsx pointed at a
// non-existent `src/components/*` tree — the real components live under
// `src/core/components/*`. Rewiring those imports is a separate refactor
// (tracked as a follow-up story, NOT part of Story 0.1 scope).
//
// Story 0.1 AC1 only requires that `docker compose up` yields a working
// Landing Page at :3000 and that `/docs` works at :8000. This stub satisfies
// that contract with zero dependency on the broken module tree.
//
// Story 0.1 AC2 requires a non-blocking "please set an API key" prompt when
// neither the server nor localStorage has a key. That logic is inlined below
// as `MissingKeyBanner` — pure React + Tailwind, no extra libraries.
// ============================================================================

import { useEffect, useState } from 'react';

const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE ?? 'http://localhost:8000';

const LOCALSTORAGE_KEYS = [
  'SHADOWFLOW_ANTHROPIC_API_KEY',
  'SHADOWFLOW_OPENAI_API_KEY',
  'SHADOWFLOW_GEMINI_API_KEY',
];

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'visible'; missing: string[] };

function MissingKeyBanner(): JSX.Element | null {
  const [state, setState] = useState<BannerState>({ kind: 'hidden' });

  useEffect(() => {
    let cancelled = false;

    const hasLocalKey = LOCALSTORAGE_KEYS.some((k) => {
      try {
        return Boolean(window.localStorage.getItem(k));
      } catch {
        return false;
      }
    });
    if (hasLocalKey) return;

    fetch(`${API_BASE}/`)
      .then((res) => res.json().then((body) => ({ res, body })))
      .then(({ body }) => {
        if (cancelled) return;
        const missing: string[] = Array.isArray(body?.missing_keys)
          ? body.missing_keys
          : [];
        if (missing.length > 0) {
          setState({ kind: 'visible', missing });
        }
      })
      .catch(() => {
        if (cancelled) return;
        // API unreachable — still prompt the user so the UX degrades gracefully.
        setState({ kind: 'visible', missing: ['(API unreachable)'] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'hidden') return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm flex items-center justify-between">
      <span>
        ⚠️ 未检测到 API key — 请在浏览器 <code className="font-mono">localStorage</code>{' '}
        设置{' '}
        <code className="font-mono">SHADOWFLOW_ANTHROPIC_API_KEY</code> /{' '}
        <code className="font-mono">OPENAI</code> /{' '}
        <code className="font-mono">GEMINI</code>{' '}
        其一,再刷新页面即可启用 BYOK 模式。(缺: {state.missing.join(', ')})
      </span>
      <button
        type="button"
        onClick={() => setState({ kind: 'hidden' })}
        className="ml-4 px-2 py-1 rounded hover:bg-amber-100"
        aria-label="关闭提示"
      >
        ✕
      </button>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      <MissingKeyBanner />

      <header className="px-8 py-5 border-b border-slate-200 bg-white">
        <h1 className="text-2xl font-semibold">ShadowFlow</h1>
        <p className="text-sm text-slate-500">
          Multi-agent workflow orchestration · MVP (Story 0.1)
        </p>
      </header>

      <main className="flex-1 overflow-auto px-8 py-10">
        <section className="max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-medium">一键启动已就绪</h2>
            <p className="text-sm text-slate-600 mt-1">
              下列服务已由 <code className="font-mono">docker compose up</code> 拉起,
              此页面是占位 Landing Page,完整编辑器(Canvas / Panel / RiverInspector)将在后续 Story 接入。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              className="block p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <div className="text-sm font-medium">FastAPI Swagger UI</div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {API_BASE}/docs
              </div>
            </a>
            <a
              href={`${API_BASE}/`}
              target="_blank"
              rel="noreferrer"
              className="block p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <div className="text-sm font-medium">Runtime status JSON</div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {API_BASE}/
              </div>
            </a>
          </div>

          <div className="text-xs text-slate-400 pt-6 border-t border-slate-100">
            <p>
              Story 0.1 · Developer Foundation & One-Click Start · BYOK(API key
              仅存于浏览器 localStorage)
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * PetSettings — Settings panel section for managing your pet companion.
 *
 * Drop this inside SettingsPage. Shows current pet preview, name, and controls:
 *   - "更换宠物" button → opens PetPickerModal
 *   - Toggle to show/hide PetRail (persisted via usePetStore / localStorage)
 */

import React, { useEffect, useRef, useState } from 'react';
import PetSpriteFace from './PetSpriteFace';

/** Inline paw-print icon — avoids lucide-react peer dependency */
const IconPaw: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="4" r="2" />
    <circle cx="18" cy="8" r="2" />
    <circle cx="20" cy="16" r="2" />
    <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
  </svg>
);
import { PetPickerModal } from './PetPickerModal';
import { usePetStore } from './usePetStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

interface PetInfo {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
}

interface ApiResponse {
  pets: PetInfo[];
}

// ── Custom pet creation ──────────────────────────────────────────────────────

interface CustomPetDraft {
  name: string;
  glyph: string;
  accent: string;
  greeting: string;
}

const CUSTOM_PET_KEY = 'sf.customPet';
const ACCENT_SWATCHES = [
  '#c96442', '#2348b8', '#1f7a3a', '#6c3aa6',
  '#d97a26', '#9c2a25', '#74716b', '#A855F7',
];
const DEFAULT_DRAFT: CustomPetDraft = {
  name: 'Buddy',
  glyph: '🦄',
  accent: '#A855F7',
  greeting: '',
};

function loadCustomPetDraft(): CustomPetDraft {
  try {
    const raw = localStorage.getItem(CUSTOM_PET_KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    return { ...DEFAULT_DRAFT, ...(JSON.parse(raw) as Partial<CustomPetDraft>) };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

function CustomPetForm({ onApply }: { onApply: () => void }) {
  const { setSelectedPet } = usePetStore();
  const [draft, setDraft] = useState<CustomPetDraft>(loadCustomPetDraft);
  const [saved, setSaved] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  function update(partial: Partial<CustomPetDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function handleSave() {
    try {
      localStorage.setItem(CUSTOM_PET_KEY, JSON.stringify(draft));
    } catch { /* ignore */ }
    setSelectedPet('custom');
    setSaved(true);
    onApply();
    setTimeout(() => setSaved(false), 2000);
  }

  const accentBg = draft.accent + '33'; // ~20% opacity hex

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          名称
        </label>
        <input
          type="text"
          maxLength={32}
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Buddy"
          className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
        />
      </div>

      {/* Glyph */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          图标
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            maxLength={4}
            value={draft.glyph}
            onChange={(e) => update({ glyph: e.target.value.slice(0, 4) })}
            placeholder="🦄"
            className="w-[72px] rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[16px] text-center text-sf-fg1 focus:border-sf-accent focus:outline-none transition-colors"
          />
          <span className="text-[11px] text-sf-fg5">输入 1 个 emoji 或字符</span>
        </div>
      </div>

      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          问候语
        </label>
        <input
          type="text"
          maxLength={120}
          value={draft.greeting}
          onChange={(e) => update({ greeting: e.target.value })}
          placeholder="你好！我在这里～"
          className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none transition-colors"
        />
      </div>

      {/* Accent color */}
      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          主色调
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => update({ accent: color })}
              style={{ backgroundColor: color }}
              className={[
                'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                draft.accent === color ? 'border-sf-fg1 scale-110' : 'border-transparent',
              ].join(' ')}
            />
          ))}
          {/* Native color picker */}
          <button
            type="button"
            title="自定义颜色"
            onClick={() => colorInputRef.current?.click()}
            style={{ backgroundColor: draft.accent }}
            className="relative h-6 w-6 rounded-full border-2 border-sf-border hover:scale-110 transition-transform overflow-hidden"
          >
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80 drop-shadow">
              +
            </span>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            value={draft.accent}
            onChange={(e) => update({ accent: e.target.value })}
            className="sr-only"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 rounded-[10px] bg-sf-elev2 px-4 py-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-[28px] leading-none"
          style={{ backgroundColor: accentBg }}
        >
          {draft.glyph || '🦄'}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-sf-fg1">{draft.name || 'Buddy'}</p>
          {draft.greeting && (
            <p className="text-[11px] text-sf-fg4 mt-0.5">"{draft.greeting}"</p>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-sf-accent-dim transition-colors"
        >
          保存自定义宠物
        </button>
        {saved && (
          <span className="font-mono text-[11px] text-sf-ok">✓ 已应用</span>
        )}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export const PetSettings: React.FC = () => {
  const { selectedPetId, petVisible, setPetVisible } = usePetStore();
  const [pet, setPet] = useState<PetInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ wrote: number; failed: number; total: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncUpstreamErrors, setSyncUpstreamErrors] = useState<string[]>([]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    setSyncUpstreamErrors([]);
    try {
      const res = await fetch(`${API_BASE}/api/settings/pets/sync?limit=24`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        // 2026-05-11 bug fix: 503 from Node→Python proxy shows real backend
        // status; surface it instead of generic "network failure".
        let bodyText = '';
        try {
          const errBody = await res.json();
          bodyText = errBody?.error?.hint ?? errBody?.error?.message ?? errBody?.detail ?? '';
        } catch {
          /* not JSON */
        }
        if (res.status === 503) {
          setSyncError(
            `后端服务不可达（HTTP 503）${bodyText ? ' — ' + bodyText : ''}`,
          );
        } else {
          setSyncError(`同步失败（HTTP ${res.status}）${bodyText ? ' — ' + bodyText : ''}`);
        }
        return;
      }
      const data = await res.json();
      setSyncResult({
        wrote: data.wrote ?? 0,
        failed: data.failed ?? 0,
        total: data.total ?? 0,
      });
      // 2026-05-11 bug fix: Python pet sync returns errors[] when upstream
      // community APIs (Supabase / j20.nz) are down. UI must surface those —
      // previously hidden, user saw "network failure" with no actionable hint.
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setSyncUpstreamErrors(data.errors);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncError(`同步失败：${msg}`);
    } finally {
      setSyncing(false);
    }
  }

  // Fetch current pet details
  useEffect(() => {
    if (!selectedPetId) {
      setPet(null);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    fetch(`${API_BASE}/api/settings/pets`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ApiResponse) => {
        if (!cancelled) {
          const found = (data.pets ?? []).find((p) => p.id === selectedPetId) ?? null;
          setPet(found);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [selectedPetId]);

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-1">
        <IconPaw size={18} className="text-purple-400" />
        <h3 className="text-gray-100 font-semibold text-sm">宠物伴侣</h3>
      </div>
      <p className="text-gray-400 text-xs mb-5">
        领养一只小伙伴，让它在你的工作区里陪你。
      </p>

      {/* Current pet preview */}
      <div className="flex items-center gap-4 mb-5">
        {selectedPetId && pet ? (
          <>
            <PetSpriteFace
              spritesheetUrl={pet.spritesheetUrl}
              size={120}
              rowId="idle"
              className="rounded-lg bg-gray-900 p-1"
            />
            <div>
              <p className="text-gray-100 font-medium">{pet.displayName}</p>
              {pet.description && (
                <p className="text-gray-400 text-xs mt-0.5 max-w-[220px] leading-relaxed">
                  {pet.description}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <div className="w-[120px] h-[120px] rounded-lg bg-gray-900 border border-dashed border-gray-700 flex items-center justify-center">
              <IconPaw size={28} className="text-gray-700" />
            </div>
            <span>
              {loadError ? '加载失败，请检查网络' : '还没有选择宠物'}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowPicker(true)}
          className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
        >
          {selectedPetId ? '更换宠物' : '领养宠物'}
        </button>

        {/* Visibility toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-gray-400 text-sm">在工作区显示</span>
          <button
            role="switch"
            aria-checked={petVisible}
            onClick={() => setPetVisible(!petVisible)}
            className={`relative inline-flex w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              petVisible ? 'bg-purple-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                petVisible ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Custom pet creation (collapsible) */}
      <div className="mt-4 rounded-[12px] border border-sf-border bg-sf-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setCustomExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-sf-elev2 transition-colors"
        >
          <span className="text-[13px] font-semibold text-sf-fg1">自定义宠物</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={[
              'h-4 w-4 text-sf-fg4 transition-transform duration-200',
              customExpanded ? 'rotate-180' : '',
            ].join(' ')}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {customExpanded && (
          <div className="border-t border-sf-border bg-sf-elev1 px-4 pb-4">
            <CustomPetForm onApply={() => setCustomExpanded(false)} />
          </div>
        )}
      </div>

      {showPicker && (
        <PetPickerModal onClose={() => setShowPicker(false)} />
      )}

      {/* Community sync */}
      <div className="border-t border-sf-border pt-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          社区宠物库
        </p>
        <p className="mt-1 text-[11px] text-sf-fg4">
          从 Codex Pet Share 和 j20 Hatchery 下载社区制作的宠物精灵。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40 hover:bg-sf-accent-dim transition-colors"
          >
            {syncing ? '同步中…' : '同步社区宠物'}
          </button>
          {syncResult && syncResult.wrote > 0 && (
            <span className="font-mono text-[11px] text-sf-ok">
              ✓ 新增 {syncResult.wrote} 只{syncResult.failed > 0 ? `，失败 ${syncResult.failed}` : ''}
            </span>
          )}
          {syncResult && syncResult.total === 0 && syncUpstreamErrors.length === 0 && (
            <span className="font-mono text-[11px] text-sf-fg4">
              社区暂无新宠物
            </span>
          )}
          {syncError && (
            <span className="font-mono text-[11px] text-sf-reject">{syncError}</span>
          )}
        </div>
        {/* 2026-05-11 bug fix: surface upstream community API failures
            (Supabase / j20.nz) so user sees the actual cause rather than
            generic "network failure". */}
        {syncUpstreamErrors.length > 0 && (
          <div
            className="mt-2 rounded-md border border-sf-border bg-sf-elev1 p-3 text-[11px]"
            role="alert"
          >
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-sf-fg4">
              社区源不可用（{syncUpstreamErrors.length} 个）
            </div>
            <ul className="space-y-1 text-sf-fg3">
              {syncUpstreamErrors.map((err, i) => (
                <li key={i} className="break-all">
                  <span className="font-mono text-sf-reject">•</span> {err}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-sf-fg4">
              这是社区 pet share API（Supabase / j20.nz）的问题，跟你的网络无关。可稍后重试或使用「自定义宠物」上传自己的精灵图。
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PetSettings;

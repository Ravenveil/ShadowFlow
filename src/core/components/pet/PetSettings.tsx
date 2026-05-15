/**
 * PetSettings — Settings panel section for managing your pet companion.
 *
 * Drop this inside SettingsPage. Shows current pet preview, name, and controls:
 *   - "更换宠物" button → opens PetPickerModal
 *   - Toggle to show/hide PetRail (persisted via usePetStore / localStorage)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import PetSpriteFace from './PetSpriteFace';
import { getBuiltinPet, isBuiltinPet, BUILTIN_PETS } from './builtinPets';

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

// ── Pet browser helpers ─────────────────────────────────────────────────────

const IconBrowserStar: React.FC<{ filled?: boolean }> = ({ filled }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconBrowserRefresh: React.FC<{ spinning?: boolean }> = ({ spinning }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'animate-spin' : ''}>
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const LS_FAV = 'sf.favoritePets';
function loadFavs(): string[] {
  try { const r = localStorage.getItem(LS_FAV); return Array.isArray(JSON.parse(r ?? '[]')) ? JSON.parse(r!) : []; } catch { return []; }
}
function saveFavs(ids: string[]) { try { localStorage.setItem(LS_FAV, JSON.stringify(ids)); } catch { /* ignore */ } }

interface CommunityPet { id: string; displayName: string; description: string; spritesheetUrl: string; author: string; tags: string[]; }

// ── Inline pet browser (embedded in settings page) ──────────────────────────

type BrowserTab = 'builtin' | 'community' | 'favorites';

function PetInlineBrowser() {
  const { selectedPetId, setSelectedPet } = usePetStore();
  const [tab, setTab] = useState<BrowserTab>('builtin');
  const [favs, setFavs] = useState<string[]>(loadFavs);

  // Community
  const [communityPets, setCommunityPets] = useState<CommunityPet[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);

  function toggleFav(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      saveFavs(next);
      return next;
    });
  }

  const fetchCommunity = useCallback(() => {
    setCommunityLoading(true);
    setCommunityError(null);
    fetch(`${API_BASE}/api/settings/pets`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: { pets: CommunityPet[] }) => { setCommunityPets(d.pets ?? []); setCommunityLoading(false); })
      .catch((err: unknown) => { setCommunityError(err instanceof Error ? err.message : '无法连接后端'); setCommunityLoading(false); });
  }, []);

  useEffect(() => {
    if (tab === 'community') fetchCommunity();
  }, [tab, fetchCommunity]);

  const TAB_LABELS: Record<BrowserTab, string> = {
    builtin: '内置',
    community: '社区',
    favorites: `收藏${favs.length > 0 ? ` (${favs.length})` : ''}`,
  };

  return (
    <div className="mt-5 rounded-[12px] border border-sf-border bg-sf-panel p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">浏览宠物</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5">
        {(['builtin', 'community', 'favorites'] as BrowserTab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'px-3 py-1 rounded-full text-[11px] font-medium transition-colors',
              tab === t ? 'bg-sf-accent text-white' : 'bg-sf-elev2 text-sf-fg4 hover:text-sf-fg1',
            ].join(' ')}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── 内置 tab ── */}
      {tab === 'builtin' && (
        <div className="grid grid-cols-4 gap-2">
          {BUILTIN_PETS.map(pet => {
            const isSelected = selectedPetId === pet.id;
            const isFav = favs.includes(pet.id);
            return (
              <div
                key={pet.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPet(pet.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedPet(pet.id); }}
                className={[
                  'relative flex flex-col items-center gap-1.5 p-2.5 rounded-[10px] border cursor-pointer transition-all',
                  isSelected ? 'border-sf-accent bg-sf-accent-tint' : 'border-sf-border bg-sf-elev2 hover:border-sf-fg5',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={e => toggleFav(e, pet.id)}
                  className={`absolute top-1 right-1 transition-colors ${isFav ? 'text-yellow-400' : 'text-sf-fg6 hover:text-yellow-400'}`}
                >
                  <IconBrowserStar filled={isFav} />
                </button>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[10px] text-[28px] leading-none"
                  style={{ backgroundColor: pet.accent + '22' }}
                >
                  {pet.glyph}
                </div>
                <span className={`text-[11px] text-center truncate w-full font-medium ${isSelected ? 'text-sf-accent-bright' : 'text-sf-fg2'}`}>
                  {pet.displayName}
                </span>
                {isSelected && (
                  <span className="text-[9px] font-bold text-sf-accent">✓ 使用中</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 社区 tab ── */}
      {tab === 'community' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-sf-fg5">来自 ~/.codex/pets 本地目录</p>
            <button
              type="button"
              onClick={fetchCommunity}
              disabled={communityLoading}
              className="flex items-center gap-1 rounded-[7px] border border-sf-border px-2 py-1 text-[10px] text-sf-fg4 hover:text-sf-fg1 hover:border-sf-fg5 disabled:opacity-40 transition-colors"
            >
              <IconBrowserRefresh spinning={communityLoading} />
              {communityLoading ? '扫描…' : '刷新'}
            </button>
          </div>
          {communityLoading && <div className="py-8 text-center text-sf-fg5 text-[12px]">正在扫描宠物目录…</div>}
          {!communityLoading && communityError && (
            <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
              <p className="font-semibold">无法读取宠物目录</p>
              <p className="text-red-400/70 mt-0.5">{communityError}</p>
            </div>
          )}
          {!communityLoading && !communityError && communityPets.length === 0 && (
            <div className="py-8 text-center text-sf-fg5 text-[12px]">
              <p>本地暂无社区宠物</p>
              <p className="text-[10px] text-sf-fg6 mt-1">在 Open Design 中下载宠物包后会显示在这里</p>
            </div>
          )}
          {!communityLoading && !communityError && communityPets.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {communityPets.map(pet => {
                const isSelected = selectedPetId === pet.id;
                const isFav = favs.includes(pet.id);
                return (
                  <div
                    key={pet.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPet(pet.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedPet(pet.id); }}
                    className={[
                      'relative flex flex-col items-center gap-1.5 p-2.5 rounded-[10px] border cursor-pointer transition-all',
                      isSelected ? 'border-sf-accent bg-sf-accent-tint' : 'border-sf-border bg-sf-elev2 hover:border-sf-fg5',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={e => toggleFav(e, pet.id)}
                      className={`absolute top-1 right-1 transition-colors ${isFav ? 'text-yellow-400' : 'text-sf-fg6 hover:text-yellow-400'}`}
                    >
                      <IconBrowserStar filled={isFav} />
                    </button>
                    <PetSpriteFace spritesheetUrl={pet.spritesheetUrl} size={48} rowId="idle" />
                    <span className={`text-[11px] text-center truncate w-full font-medium ${isSelected ? 'text-sf-accent-bright' : 'text-sf-fg2'}`}>
                      {pet.displayName}
                    </span>
                    {isSelected && (
                      <span className="text-[9px] font-bold text-sf-accent">✓ 使用中</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 收藏 tab ── */}
      {tab === 'favorites' && (
        <div>
          {favs.length === 0 ? (
            <div className="py-8 text-center text-sf-fg5 text-[12px]">
              <p>还没有收藏</p>
              <p className="text-[10px] text-sf-fg6 mt-1">在内置或社区 tab 点击 ★ 收藏</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {favs.map(id => {
                const builtin = BUILTIN_PETS.find(p => p.id === id);
                const isSelected = selectedPetId === id;
                return (
                  <div
                    key={id}
                    className={[
                      'flex items-center gap-3 p-2.5 rounded-[9px] border cursor-pointer transition-all',
                      isSelected ? 'border-sf-accent bg-sf-accent-tint' : 'border-sf-border bg-sf-elev2 hover:border-sf-fg5',
                    ].join(' ')}
                    onClick={() => setSelectedPet(id)}
                  >
                    {builtin ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[20px]" style={{ backgroundColor: builtin.accent + '22' }}>
                        {builtin.glyph}
                      </div>
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-[8px] bg-sf-elev3 flex items-center justify-center text-sf-fg5 text-[11px]">?</div>
                    )}
                    <span className={`flex-1 text-[12px] font-medium ${isSelected ? 'text-sf-accent-bright' : 'text-sf-fg2'}`}>
                      {builtin?.displayName ?? id}
                    </span>
                    {isSelected && <span className="text-[10px] font-bold text-sf-accent">✓ 使用中</span>}
                    <button
                      type="button"
                      onClick={e => toggleFav(e, id)}
                      className="text-yellow-400 hover:text-sf-fg5 transition-colors"
                    >
                      <IconBrowserStar filled />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  // Derive built-in pet display from local constants — no API call needed
  const builtinPet = selectedPetId && isBuiltinPet(selectedPetId) ? getBuiltinPet(selectedPetId) : null;

  // Fetch API-based pet details (community or custom spritesheet)
  useEffect(() => {
    if (!selectedPetId || isBuiltinPet(selectedPetId) || selectedPetId === 'custom') {
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
    <section className="rounded-[12px] border border-sf-border bg-sf-panel p-5">
      {/* Section heading */}
      <div className="flex items-center gap-2 mb-1">
        <IconPaw size={18} className="text-sf-accent" />
        <h3 className="text-sf-fg1 font-semibold text-sm">宠物伴侣</h3>
      </div>
      <p className="text-sf-fg4 text-xs mb-5">
        领养一只小伙伴，让它在你的工作区里陪你。
      </p>

      {/* Current pet preview */}
      <div className="flex items-center gap-4 mb-5">
        {builtinPet ? (
          <>
            <div
              className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-xl text-[64px] leading-none"
              style={{ backgroundColor: builtinPet.accent + '22' }}
            >
              {builtinPet.glyph}
            </div>
            <div>
              <p className="text-sf-fg1 font-medium">{builtinPet.displayName}</p>
              <p className="text-sf-fg4 text-xs mt-0.5 max-w-[220px] leading-relaxed">{builtinPet.description}</p>
            </div>
          </>
        ) : selectedPetId === 'custom' ? (
          (() => {
            let customData: { name?: string; glyph?: string; accent?: string } = {};
            try { customData = JSON.parse(localStorage.getItem('sf.customPet') ?? '{}'); } catch { /* ignore */ }
            return (
              <>
                <div
                  className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-xl text-[64px] leading-none"
                  style={{ backgroundColor: (customData.accent ?? '#A855F7') + '22' }}
                >
                  {customData.glyph || '🦄'}
                </div>
                <div>
                  <p className="text-sf-fg1 font-medium">{customData.name || 'Buddy'}</p>
                  <p className="text-sf-fg4 text-xs mt-0.5">自定义宠物</p>
                </div>
              </>
            );
          })()
        ) : selectedPetId && pet ? (
          <>
            <PetSpriteFace
              spritesheetUrl={pet.spritesheetUrl}
              size={120}
              rowId="idle"
              className="rounded-lg bg-sf-elev0 p-1"
            />
            <div>
              <p className="text-sf-fg1 font-medium">{pet.displayName}</p>
              {pet.description && (
                <p className="text-sf-fg4 text-xs mt-0.5 max-w-[220px] leading-relaxed">
                  {pet.description}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sf-fg5 text-sm">
            <div className="w-[120px] h-[120px] rounded-lg bg-sf-elev0 border border-dashed border-sf-border flex items-center justify-center">
              <IconPaw size={28} className="text-sf-fg5" />
            </div>
            <span>{loadError ? '加载失败' : '还没有选择宠物'}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowPicker(true)}
          className="px-4 py-2 rounded-lg bg-sf-accent hover:bg-sf-accent-dim text-white text-sm font-medium transition-colors"
        >
          {selectedPetId ? '更换宠物' : '领养宠物'}
        </button>

        {/* Visibility toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sf-fg4 text-sm">在工作区显示</span>
          <button
            role="switch"
            aria-checked={petVisible}
            onClick={() => setPetVisible(!petVisible)}
            className={`relative inline-flex w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-accent ${
              petVisible ? 'bg-sf-accent' : 'bg-sf-elev2'
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

      {/* Inline pet browser */}
      <PetInlineBrowser />

      {/* Custom pet creation (collapsible) */}
      <div
        className="mt-4 rounded-[12px] overflow-hidden"
        style={{ border: '1px solid var(--t-border)', background: 'var(--t-panel-2)' }}
      >
        <button
          type="button"
          onClick={() => setCustomExpanded((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg)' }}>自定义宠物</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              width: 16, height: 16, color: 'var(--t-fg-4)',
              transform: customExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 200ms',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {customExpanded && (
          <div
            className="px-4 pb-4"
            style={{ borderTop: '1px solid var(--t-border)', background: 'var(--t-panel-3)' }}
          >
            <CustomPetForm onApply={() => setCustomExpanded(false)} />
          </div>
        )}
      </div>

      {showPicker && (
        <PetPickerModal onClose={() => setShowPicker(false)} />
      )}

    </section>
  );
};

export default PetSettings;

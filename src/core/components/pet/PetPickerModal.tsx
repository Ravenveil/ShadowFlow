/**
 * PetPickerModal — 四 tab 宠物选择器。
 *
 * 收藏 tab：LocalStorage 持久化，支持拖拽排序。
 * 内置 tab：前端常量 BUILTIN_PETS，无需 API，零延迟。
 * 社区 tab：GET /api/settings/pets（读取本地 ~/.codex/pets 目录），
 *           与 Open Design 使用同一个本地目录，无需外部 API。
 * 自定义 tab：当前用户已保存的自定义宠物（localStorage）。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { usePetStore } from './usePetStore';
import { BUILTIN_PETS, type BuiltinPet } from './builtinPets';

const IconX: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconRefresh: React.FC<{ size?: number; spinning?: boolean }> = ({ size = 14, spinning }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'animate-spin' : ''}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconStar: React.FC<{ filled?: boolean; size?: number }> = ({ filled, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const IconGrip: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
    <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
  </svg>
);

import PetSpriteFace from './PetSpriteFace';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

// ── Favorites persistence ─────────────────────────────────────────────────

const LS_FAVORITES = 'sf.favoritePets';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(LS_FAVORITES);
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed as string[] : [];
  } catch { return []; }
}

function saveFavorites(ids: string[]): void {
  try { localStorage.setItem(LS_FAVORITES, JSON.stringify(ids)); } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────

interface CommunityPet {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
  bundled: boolean;
  author: string;
  tags: string[];
}

type Tab = 'favorites' | 'builtin' | 'community' | 'custom';

const CUSTOM_PET_KEY = 'sf.customPet';

interface CustomPetData {
  name: string;
  glyph: string;
  accent: string;
  greeting?: string;
}

function loadCustomPet(): CustomPetData | null {
  try {
    const raw = localStorage.getItem(CUSTOM_PET_KEY);
    return raw ? (JSON.parse(raw) as CustomPetData) : null;
  } catch {
    return null;
  }
}

// ── Builtin pet card (emoji-based, no spritesheet) ────────────────────────

function BuiltinCard({
  pet,
  selected,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: {
  pet: BuiltinPet;
  selected: boolean;
  onSelect: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const bg = pet.accent + '22'; // ~13% opacity
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      className={[
        'relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer',
        selected
          ? 'bg-purple-900/40 border-purple-500'
          : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750',
      ].join(' ')}
      title={pet.description}
    >
      {/* Star button */}
      <button
        type="button"
        onClick={onToggleFavorite}
        className={`absolute top-1 right-1 transition-colors ${isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
        title={isFavorite ? '取消收藏' : '收藏'}
      >
        <IconStar filled={isFavorite} size={12} />
      </button>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-xl text-[32px] leading-none"
        style={{ backgroundColor: bg }}
      >
        {pet.glyph}
      </div>
      <span className={`text-xs text-center truncate w-full ${selected ? 'text-purple-300' : 'text-gray-300'}`}>
        {pet.displayName}
      </span>
      <span className="text-[10px] text-gray-500">内置</span>
    </div>
  );
}

// ── Community pet card (spritesheet-based, from ~/.codex/pets) ─────────────

function CommunityCard({
  pet,
  selected,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: {
  pet: CommunityPet;
  selected: boolean;
  onSelect: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      className={[
        'relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer',
        selected
          ? 'bg-purple-900/40 border-purple-500'
          : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750',
      ].join(' ')}
      title={pet.description || pet.displayName}
    >
      {/* Star button */}
      <button
        type="button"
        onClick={onToggleFavorite}
        className={`absolute top-1 right-1 transition-colors ${isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
        title={isFavorite ? '取消收藏' : '收藏'}
      >
        <IconStar filled={isFavorite} size={12} />
      </button>
      <PetSpriteFace spritesheetUrl={pet.spritesheetUrl} size={56} rowId="idle" />
      <span className={`text-xs text-center truncate w-full ${selected ? 'text-purple-300' : 'text-gray-300'}`}>
        {pet.displayName}
      </span>
      {pet.author && (
        <span className="text-[10px] text-gray-600 truncate w-full text-center">by {pet.author}</span>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export const PetPickerModal: React.FC<Props> = ({ onClose }) => {
  const { selectedPetId, setSelectedPet } = usePetStore();
  const [tab, setTab] = useState<Tab>('builtin');

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Community pets (from ~/.codex/pets via backend)
  const [communityPets, setCommunityPets] = useState<CommunityPet[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityRootDir, setCommunityRootDir] = useState<string>('');

  // Remote sync state (Supabase / j20.nz)
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ wrote: number; failed: number } | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);

  // Custom pet
  const customPet = loadCustomPet();

  // ── Favorites helpers ──────────────────────────────────────────────────

  function toggleFavorite(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      saveFavorites(next);
      return next;
    });
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) { setDragOverId(null); return; }
    setFavorites(prev => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(sourceId);
      const toIdx = arr.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, sourceId);
      saveFavorites(arr);
      return arr;
    });
    setDragOverId(null);
  }

  function handleDragEnd() { setDragOverId(null); }

  // ── Community fetch / sync ─────────────────────────────────────────────

  const fetchCommunity = useCallback(() => {
    setCommunityLoading(true);
    setCommunityError(null);
    fetch(`${API_BASE}/api/settings/pets`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ pets: CommunityPet[]; rootDir?: string }>;
      })
      .then((data) => {
        setCommunityPets(data.pets ?? []);
        setCommunityRootDir(data.rootDir ?? '');
        setCommunityLoading(false);
      })
      .catch((err: unknown) => {
        setCommunityError(err instanceof Error ? err.message : '无法连接后端');
        setCommunityLoading(false);
      });
  }, []);

  const handleRemoteSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncErrors([]);
    try {
      const res = await fetch(`${API_BASE}/api/settings/pets/sync?limit=24`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json() as { wrote?: number; failed?: number; errors?: string[] };
      setSyncResult({ wrote: data.wrote ?? 0, failed: data.failed ?? 0 });
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setSyncErrors(data.errors);
      }
      fetchCommunity();
    } catch (e) {
      setSyncErrors([e instanceof Error ? e.message : '同步失败']);
    } finally {
      setSyncing(false);
    }
  }, [fetchCommunity]);

  useEffect(() => {
    if (tab === 'community') fetchCommunity();
  }, [tab, fetchCommunity]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedPet(id);
      onClose();
    },
    [setSelectedPet, onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const TAB_LABELS: Record<Tab, string> = {
    favorites: `收藏${favorites.length > 0 ? ` (${favorites.length})` : ''}`,
    builtin: '内置',
    community: '社区',
    custom: '自定义',
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 rounded-xl p-6 w-[680px] max-h-[80vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-gray-100 text-lg font-semibold">选择你的宠物</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100 transition-colors p-1 rounded" aria-label="关闭">
            <IconX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-shrink-0">
          {(['favorites', 'builtin', 'community', 'custom'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── 收藏 tab ── */}
          {tab === 'favorites' && (
            <div>
              {favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                  <IconStar size={32} />
                  <p className="text-sm">还没有收藏</p>
                  <p className="text-xs text-gray-600">在「内置」或「社区」tab 点击 ★ 收藏宠物</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-gray-600 text-xs mb-3">拖拽左侧图标可调整顺序</p>
                  {favorites.map(id => {
                    const builtin = BUILTIN_PETS.find(p => p.id === id);
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={e => handleDragStart(e, id)}
                        onDragOver={e => handleDragOver(e, id)}
                        onDrop={e => handleDrop(e, id)}
                        onDragEnd={handleDragEnd}
                        className={[
                          'flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-all',
                          selectedPetId === id ? 'bg-purple-900/40 border-purple-500' : 'bg-gray-800 border-gray-700',
                          dragOverId === id ? 'border-purple-400 bg-purple-900/30' : '',
                        ].join(' ')}
                      >
                        {/* Drag handle */}
                        <span className="text-gray-600 hover:text-gray-400 flex-shrink-0">
                          <IconGrip size={14} />
                        </span>

                        {/* Pet avatar */}
                        {builtin ? (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[22px] leading-none"
                            style={{ backgroundColor: builtin.accent + '22' }}
                          >
                            {builtin.glyph}
                          </div>
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs">
                            ?
                          </div>
                        )}

                        {/* Name */}
                        <span className="flex-1 text-sm text-gray-200">
                          {builtin?.displayName ?? id}
                        </span>

                        {/* Select button */}
                        <button
                          type="button"
                          onClick={() => handleSelect(id)}
                          className={`text-[11px] px-3 py-1 rounded-md font-medium transition-colors ${
                            selectedPetId === id
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {selectedPetId === id ? '使用中' : '选用'}
                        </button>

                        {/* Unfavorite button */}
                        <button
                          type="button"
                          onClick={e => toggleFavorite(e, id)}
                          className="text-yellow-400 hover:text-gray-500 transition-colors"
                          title="取消收藏"
                        >
                          <IconStar filled size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 内置 tab ── */}
          {tab === 'builtin' && (
            <div>
              <p className="text-gray-500 text-xs mb-3">预设内置宠物 — 精选同伴，选一个领养。</p>
              <div className="grid grid-cols-4 gap-3">
                {BUILTIN_PETS.map((pet) => (
                  <BuiltinCard
                    key={pet.id}
                    pet={pet}
                    selected={selectedPetId === pet.id}
                    isFavorite={favorites.includes(pet.id)}
                    onToggleFavorite={e => toggleFavorite(e, pet.id)}
                    onSelect={() => handleSelect(pet.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── 社区 tab ── */}
          {tab === 'community' && (
            <div>
              {/* Toolbar: 本地扫描路径 + 刷新 + 下载社区宠物 */}
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="min-w-0">
                  <p className="text-gray-400 text-xs">
                    本地宠物目录
                    {communityRootDir && (
                      <span className="text-gray-600 ml-1 font-mono text-[10px] break-all">({communityRootDir})</span>
                    )}
                  </p>
                  <p className="text-gray-600 text-[10px] mt-0.5">
                    Open Design 下载的宠物也会在这里显示。
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={fetchCommunity}
                    disabled={communityLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
                  >
                    <IconRefresh size={12} spinning={communityLoading} />
                    {communityLoading ? '扫描…' : '刷新'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRemoteSync(); }}
                    disabled={syncing}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-700/60 bg-purple-900/20 px-2.5 py-1.5 text-[11px] text-purple-300 hover:bg-purple-900/40 hover:border-purple-500 disabled:opacity-40 transition-colors"
                  >
                    <IconRefresh size={12} spinning={syncing} />
                    {syncing ? '下载中…' : '下载社区宠物'}
                  </button>
                </div>
              </div>

              {/* Sync result */}
              {syncResult && (
                <div className="mb-3 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-[11px] text-green-400">
                  {syncResult.wrote > 0
                    ? `✓ 新增 ${syncResult.wrote} 只宠物${syncResult.failed > 0 ? `，${syncResult.failed} 只失败` : ''}`
                    : '无新宠物（已是最新）'}
                </div>
              )}
              {syncErrors.length > 0 && (
                <div className="mb-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-[10px] text-yellow-400/80">
                  <p className="font-semibold mb-1">社区源部分不可用（不影响本地已有宠物）：</p>
                  {syncErrors.map((e, i) => <p key={i} className="break-all">• {e}</p>)}
                </div>
              )}

              {communityLoading && (
                <div className="text-center py-12 text-gray-400 text-sm">正在扫描本地宠物目录…</div>
              )}

              {!communityLoading && communityError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  <p className="font-semibold mb-1">无法读取宠物目录</p>
                  <p className="text-red-400/70">{communityError}</p>
                  <p className="mt-2 text-gray-500">请确认 ShadowFlow 后端正在运行（端口 8000）。</p>
                </div>
              )}

              {!communityLoading && !communityError && communityPets.length === 0 && (
                <div className="text-center py-12 text-gray-500 text-sm">
                  <p>本地暂无宠物</p>
                  <p className="text-xs mt-1 text-gray-600">
                    在 Open Design 中下载社区宠物后，这里就会显示。
                  </p>
                </div>
              )}

              {!communityLoading && !communityError && communityPets.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {communityPets.map((pet) => (
                    <CommunityCard
                      key={pet.id}
                      pet={pet}
                      selected={selectedPetId === pet.id}
                      isFavorite={favorites.includes(pet.id)}
                      onToggleFavorite={e => toggleFavorite(e, pet.id)}
                      onSelect={() => handleSelect(pet.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 自定义 tab ── */}
          {tab === 'custom' && (
            <div>
              {customPet ? (
                <div className="grid grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelect('custom')}
                    className={[
                      'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                      selectedPetId === 'custom'
                        ? 'bg-purple-900/40 border-purple-500'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500',
                    ].join(' ')}
                  >
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-xl text-[32px] leading-none"
                      style={{ backgroundColor: (customPet.accent ?? '#A855F7') + '22' }}
                    >
                      {customPet.glyph || '🦄'}
                    </div>
                    <span className={`text-xs text-center truncate w-full ${selectedPetId === 'custom' ? 'text-purple-300' : 'text-gray-300'}`}>
                      {customPet.name || 'Buddy'}
                    </span>
                    <span className="text-[10px] text-gray-500">自定义</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 text-sm">
                  <p>还没有自定义宠物</p>
                  <p className="text-xs mt-1 text-gray-600">在「自定义宠物」面板里创建一个吧。</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PetPickerModal;

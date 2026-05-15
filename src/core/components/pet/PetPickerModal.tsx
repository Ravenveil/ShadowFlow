/**
 * PetPickerModal — 三 tab 宠物选择器。
 *
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

import PetSpriteFace from './PetSpriteFace';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

interface CommunityPet {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
  bundled: boolean;
  author: string;
  tags: string[];
}

type Tab = 'builtin' | 'community' | 'custom';

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
}: {
  pet: BuiltinPet;
  selected: boolean;
  onSelect: () => void;
}) {
  const bg = pet.accent + '22'; // ~13% opacity
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
        selected
          ? 'bg-purple-900/40 border-purple-500'
          : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750',
      ].join(' ')}
      title={pet.description}
    >
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
    </button>
  );
}

// ── Community pet card (spritesheet-based, from ~/.codex/pets) ─────────────

function CommunityCard({
  pet,
  selected,
  onSelect,
}: {
  pet: CommunityPet;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
        selected
          ? 'bg-purple-900/40 border-purple-500'
          : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750',
      ].join(' ')}
      title={pet.description || pet.displayName}
    >
      <PetSpriteFace spritesheetUrl={pet.spritesheetUrl} size={56} rowId="idle" />
      <span className={`text-xs text-center truncate w-full ${selected ? 'text-purple-300' : 'text-gray-300'}`}>
        {pet.displayName}
      </span>
      {pet.author && (
        <span className="text-[10px] text-gray-600 truncate w-full text-center">by {pet.author}</span>
      )}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export const PetPickerModal: React.FC<Props> = ({ onClose }) => {
  const { selectedPetId, setSelectedPet } = usePetStore();
  const [tab, setTab] = useState<Tab>('builtin');

  // Community pets (from ~/.codex/pets via backend)
  const [communityPets, setCommunityPets] = useState<CommunityPet[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityRootDir, setCommunityRootDir] = useState<string>('');

  // Custom pet
  const customPet = loadCustomPet();

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

  // Fetch when switching to community tab
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
          {(['builtin', 'community', 'custom'] as Tab[]).map((t) => (
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
                    onSelect={() => handleSelect(pet.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── 社区 tab ── */}
          {tab === 'community' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-gray-400 text-xs">
                    读取本地 hatch-pet 宠物包
                    {communityRootDir && (
                      <span className="text-gray-600 ml-1 font-mono text-[10px]">({communityRootDir})</span>
                    )}
                  </p>
                  <p className="text-gray-600 text-[10px] mt-0.5">
                    在 Open Design 下载的社区宠物也会在这里显示。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchCommunity}
                  disabled={communityLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 transition-colors"
                >
                  <IconRefresh size={12} spinning={communityLoading} />
                  {communityLoading ? '扫描中…' : '刷新'}
                </button>
              </div>

              {communityLoading && (
                <div className="text-center py-12 text-gray-400 text-sm">正在扫描本地宠物目录…</div>
              )}

              {!communityLoading && communityError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  <p className="font-semibold mb-1">无法读取宠物目录</p>
                  <p className="text-red-400/70">{communityError}</p>
                  <p className="mt-2 text-gray-500">
                    请确认 ShadowFlow 后端正在运行（端口 8000）。
                  </p>
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

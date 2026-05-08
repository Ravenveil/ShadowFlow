/**
 * PetPickerModal — Browseable grid of available pets.
 *
 * Fetches GET /api/settings/pets, displays cards in a 4-col grid.
 * "内置" tab shows bundled pets; "全部" tab shows everything.
 * Clicking a card writes the pet id to usePetStore.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { usePetStore } from './usePetStore';

/** Inline close icon — avoids lucide-react peer dependency */
const IconX: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
import PetSpriteFace from './PetSpriteFace';

interface PetInfo {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
  bundled: boolean;
  author: string;
  tags: string[];
}

interface ApiResponse {
  pets: PetInfo[];
  rootDir: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

type Tab = 'bundled' | 'all';

interface Props {
  onClose: () => void;
}

export const PetPickerModal: React.FC<Props> = ({ onClose }) => {
  const { selectedPetId, setSelectedPet } = usePetStore();
  const [pets, setPets] = useState<PetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('bundled');

  // Fetch pets list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/settings/pets`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setPets(data.pets ?? []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法加载宠物列表');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const visiblePets = tab === 'bundled' ? pets.filter((p) => p.bundled) : pets;

  const handleSelect = useCallback((id: string) => {
    setSelectedPet(id);
    onClose();
  }, [setSelectedPet, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 rounded-xl p-6 w-[640px] max-h-[80vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-100 text-lg font-semibold">选择你的宠物</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 transition-colors p-1 rounded"
            aria-label="关闭"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['bundled', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {t === 'bundled' ? '内置' : '全部'}
            </button>
          ))}
        </div>

        {/* Body */}
        {loading && (
          <div className="text-center py-12 text-gray-400">加载中…</div>
        )}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-gray-500 text-xs mt-1">无法加载宠物列表，请稍后重试。</p>
          </div>
        )}

        {!loading && !error && visiblePets.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            {tab === 'bundled' ? '暂无内置宠物' : '还没有宠物，快去获取一只吧！'}
          </div>
        )}

        {!loading && !error && visiblePets.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {visiblePets.map((pet) => {
              const isSelected = pet.id === selectedPetId;
              return (
                <button
                  key={pet.id}
                  onClick={() => handleSelect(pet.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-purple-900/40 border-purple-500'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750'
                  }`}
                  title={pet.description || pet.displayName}
                >
                  <PetSpriteFace
                    spritesheetUrl={pet.spritesheetUrl}
                    size={56}
                    rowId="idle"
                  />
                  <span className={`text-xs text-center truncate w-full ${
                    isSelected ? 'text-purple-300' : 'text-gray-300'
                  }`}>
                    {pet.displayName}
                  </span>
                  {pet.bundled && (
                    <span className="text-[10px] text-gray-500">内置</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PetPickerModal;

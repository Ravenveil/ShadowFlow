/**
 * PetRail — Fixed right-bottom floating pet widget.
 *
 * - Displays the currently selected pet (PetSpriteFace, size=80).
 * - Hover shows pet name tooltip.
 * - Single-click cycles animation: idle → waving → idle.
 * - Double-click opens PetPickerModal.
 * - Hidden when petVisible is false or no pet is selected.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import PetSpriteFace from './PetSpriteFace';
import { PetPickerModal } from './PetPickerModal';
import { usePetStore } from './usePetStore';

interface PetInfo {
  id: string;
  displayName: string;
  spritesheetUrl: string;
}

interface ApiResponse {
  pets: PetInfo[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

const ANIMATION_CYCLE = ['idle', 'waving'] as const;
type AnimRow = (typeof ANIMATION_CYCLE)[number];

export const PetRail: React.FC = () => {
  const { selectedPetId, petVisible } = usePetStore();
  const [pet, setPet] = useState<PetInfo | null>(null);
  const [rowId, setRowId] = useState<AnimRow>('idle');
  const [showModal, setShowModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Fetch pet info whenever selectedPetId changes
  useEffect(() => {
    if (!selectedPetId) {
      setPet(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/settings/pets`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ApiResponse) => {
        if (!cancelled) {
          const found = (data.pets ?? []).find((p) => p.id === selectedPetId) ?? null;
          setPet(found);
        }
      })
      .catch(() => {
        // Silently ignore: no pet displayed on fetch failure
        if (!cancelled) setPet(null);
      });
    return () => { cancelled = true; };
  }, [selectedPetId]);

  // Return to idle after waving animation finishes (~2.7 s at 4 frames × 6fps)
  const waveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    setRowId((prev) => {
      if (prev === 'idle') {
        // Clear any existing timer
        if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
        // Return to idle after 4 frames at 6fps ≈ 667ms, with a small buffer
        waveTimerRef.current = setTimeout(() => setRowId('idle'), 900);
        return 'waving';
      }
      return 'idle';
    });
  }, []);

  useEffect(() => () => {
    if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
    setRowId('idle');
    setShowModal(true);
  }, []);

  if (!petVisible || !pet) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-1 select-none">
        {/* Tooltip */}
        {showTooltip && (
          <div
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-lg pointer-events-none"
          >
            {pet.displayName}
          </div>
        )}

        {/* Pet sprite button */}
        <button
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="group relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg transition-transform hover:scale-110 active:scale-95"
          aria-label={`宠物：${pet.displayName}，点击互动，双击更换`}
          title={`${pet.displayName} — 点击互动 · 双击更换`}
        >
          <PetSpriteFace
            spritesheetUrl={pet.spritesheetUrl}
            size={80}
            rowId={rowId}
          />
        </button>
      </div>

      {showModal && (
        <PetPickerModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

export default PetRail;

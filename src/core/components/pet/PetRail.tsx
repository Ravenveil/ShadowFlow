/**
 * PetRail — Draggable floating pet widget.
 *
 * - 左键单击：播放动画（idle → waving → idle）
 * - 左键拖拽：拖到屏幕任意位置（pointer events）
 * - 双击：打开 PetPickerModal
 * - 位置持久化到 localStorage 'sf.petPos'
 * - 隐藏条件：petVisible=false 或未选择宠物
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import PetSpriteFace from './PetSpriteFace';
import { getBuiltinPet, isBuiltinPet } from './builtinPets';
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
const LS_POS = 'sf.petPos';
const PET_SIZE = 80; // px, 宠物按钮的尺寸

const ANIMATION_CYCLE = ['idle', 'waving'] as const;
type AnimRow = (typeof ANIMATION_CYCLE)[number];

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    return null;
  } catch { return null; }
}

function savePos(pos: { x: number; y: number }): void {
  try { localStorage.setItem(LS_POS, JSON.stringify(pos)); } catch {}
}

function defaultPos(): { x: number; y: number } {
  return {
    x: window.innerWidth - PET_SIZE - 24,
    y: window.innerHeight - PET_SIZE - 24,
  };
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - PET_SIZE;
  const maxY = window.innerHeight - PET_SIZE;
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

export const PetRail: React.FC = () => {
  const { selectedPetId, petVisible } = usePetStore();
  const [pet, setPet] = useState<PetInfo | null>(null);
  const [rowId, setRowId] = useState<AnimRow>('idle');
  const [showModal, setShowModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Position state
  const [pos, setPos] = useState<{ x: number; y: number }>(() => loadPos() ?? defaultPos());

  // Drag state — use refs to avoid stale closures in pointer events
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false); // distinguish click vs drag
  const containerRef = useRef<HTMLDivElement>(null);

  const builtinPet = selectedPetId && isBuiltinPet(selectedPetId) ? getBuiltinPet(selectedPetId) : null;

  // Fetch pet info whenever selectedPetId changes (skip for built-in pets)
  useEffect(() => {
    if (!selectedPetId || isBuiltinPet(selectedPetId)) {
      setPet(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/settings/pets`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then((data: ApiResponse) => {
        if (!cancelled) {
          const found = (data.pets ?? []).find(p => p.id === selectedPetId) ?? null;
          setPet(found);
        }
      })
      .catch(() => { if (!cancelled) setPet(null); });
    return () => { cancelled = true; };
  }, [selectedPetId]);

  // Window resize: clamp position to keep pet on screen
  useEffect(() => {
    function onResize() {
      setPos(prev => {
        const clamped = clampPos(prev.x, prev.y);
        savePos(clamped);
        return clamped;
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Wave animation timer
  const waveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pointer drag handlers ──────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // left button only
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    hasMoved.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    hasMoved.current = true;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    const clamped = clampPos(newX, newY);
    setPos(clamped);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;
    // Save final position
    setPos(prev => {
      savePos(prev);
      return prev;
    });
  }, []);

  // ── Click / double-click ────────────────────────────────────────────────────

  const handleClick = useCallback(() => {
    if (hasMoved.current) return; // was a drag, not a click
    setRowId(prev => {
      if (prev === 'idle') {
        if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
        waveTimerRef.current = setTimeout(() => setRowId('idle'), 900);
        return 'waving';
      }
      return 'idle';
    });
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (hasMoved.current) return;
    e.stopPropagation();
    if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
    setRowId('idle');
    setShowModal(true);
  }, []);

  useEffect(() => () => {
    if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
  }, []);

  if (!petVisible || (!pet && !builtinPet)) return null;

  const petName = builtinPet?.displayName ?? pet?.displayName ?? '宠物';

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 50,
          userSelect: 'none',
          cursor: isDragging.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex flex-col items-center gap-1 select-none"
      >
        {/* Tooltip above pet */}
        {showTooltip && (
          <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-lg pointer-events-none">
            {petName}
          </div>
        )}

        {/* Pet button */}
        <button
          type="button"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="group relative outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg transition-transform hover:scale-110 active:scale-95"
          aria-label={`宠物：${petName}，点击互动，双击更换，拖拽移动`}
          title={`${petName} — 点击互动 · 双击更换 · 拖拽移动`}
          style={{ cursor: 'inherit' }}
        >
          {builtinPet ? (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-[44px] leading-none"
              style={{ backgroundColor: builtinPet.accent + '22' }}
            >
              {builtinPet.glyph}
            </div>
          ) : pet ? (
            <PetSpriteFace spritesheetUrl={pet.spritesheetUrl} size={80} rowId={rowId} />
          ) : null}
        </button>
      </div>

      {showModal && (
        <PetPickerModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

export default PetRail;

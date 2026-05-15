/**
 * PetRail — Draggable floating pet widget with edge-docking / peek mode.
 *
 * 左键单击：播放动画（idle → waving → idle）
 * 左键拖拽：拖到屏幕任意位置
 * 拖到左/右边缘 (< DOCK_SNAP px)：自动吸附，宠物大部分藏入屏幕外，只露出一小块
 * 鼠标悬停吸附宠物：滑出全身
 * 鼠标离开：缩回
 * 双击吸附宠物：解除吸附，回到浮动模式
 * 双击浮动宠物：打开 PetPickerModal
 * 位置/吸附状态持久化到 localStorage
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
const LS_POS   = 'sf.petPos';
const LS_DOCK  = 'sf.petDock';
const PET_SIZE  = 80;   // px
const PEEK_PX   = 26;   // px visible when docked
const DOCK_SNAP = 52;   // px from edge: if drag released within this, snap to dock

type DockSide = 'left' | 'right' | null;

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

function loadDock(): DockSide {
  const v = localStorage.getItem(LS_DOCK);
  return (v === 'left' || v === 'right') ? v : null;
}

function saveDock(side: DockSide): void {
  try {
    if (side) localStorage.setItem(LS_DOCK, side);
    else localStorage.removeItem(LS_DOCK);
  } catch {}
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

/** Small chevron tab visible at the docked edge */
function DockTab({ side, accent }: { side: 'left' | 'right'; accent: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [side === 'right' ? 'left' : 'right']: 0,
        width: PEEK_PX,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: side === 'right' ? '6px 0 0 6px' : '0 6px 6px 0',
        background: accent + '33',
        pointerEvents: 'none',
      }}
    >
      <svg
        width="8"
        height="14"
        viewBox="0 0 8 14"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.8 }}
      >
        {side === 'right'
          ? <polyline points="6 1 2 7 6 13" />
          : <polyline points="2 1 6 7 2 13" />}
      </svg>
    </div>
  );
}

export const PetRail: React.FC = () => {
  const { selectedPetId, petVisible } = usePetStore();
  const [pet, setPet] = useState<PetInfo | null>(null);
  const [rowId, setRowId] = useState<AnimRow>('idle');
  const [showModal, setShowModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Position
  const [pos, setPos] = useState<{ x: number; y: number }>(() => loadPos() ?? defaultPos());

  // Dock state
  const [dockedSide, setDockedSide] = useState<DockSide>(loadDock);
  const [expanded, setExpanded] = useState(false);

  // Drag state refs (avoid stale closures)
  const isDragging   = useRef(false);
  const dragOffset   = useRef({ x: 0, y: 0 });
  const hasMoved     = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const builtinPet = selectedPetId && isBuiltinPet(selectedPetId) ? getBuiltinPet(selectedPetId) : null;
  const accentColor = builtinPet?.accent ?? '#A855F7';

  // Fetch community pet info
  useEffect(() => {
    if (!selectedPetId || isBuiltinPet(selectedPetId)) { setPet(null); return; }
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

  // Clamp on resize
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

  // Wave timer
  const waveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (waveTimerRef.current) clearTimeout(waveTimerRef.current); }, []);

  // ── Pointer drag ──────────────────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    hasMoved.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
    // Expand while dragging so user can see full pet
    setExpanded(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    hasMoved.current = true;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    setPos(clampPos(newX, newY));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;

    setPos(prev => {
      const clamped = clampPos(prev.x, prev.y);

      // Snap to dock?
      const nearLeft  = clamped.x < DOCK_SNAP;
      const nearRight = clamped.x > window.innerWidth - PET_SIZE - DOCK_SNAP;

      if (nearLeft) {
        const docked = { x: 0, y: clamped.y };
        savePos(docked);
        setDockedSide('left');
        saveDock('left');
        setExpanded(false);
        return docked;
      }
      if (nearRight) {
        const docked = { x: window.innerWidth - PET_SIZE, y: clamped.y };
        savePos(docked);
        setDockedSide('right');
        saveDock('right');
        setExpanded(false);
        return docked;
      }

      // Undock if dragged away
      setDockedSide(null);
      saveDock(null);
      setExpanded(false);
      savePos(clamped);
      return clamped;
    });
  }, []);

  // ── Click / double-click ──────────────────────────────────────────────────

  const handleClick = useCallback(() => {
    if (hasMoved.current) return;
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

    if (dockedSide) {
      // Undock on double-click
      setDockedSide(null);
      saveDock(null);
      setExpanded(false);
      // Move slightly away from edge so it's free-floating
      setPos(prev => {
        const freed = clampPos(
          dockedSide === 'right' ? window.innerWidth - PET_SIZE - 32 : 32,
          prev.y,
        );
        savePos(freed);
        return freed;
      });
    } else {
      setShowModal(true);
    }
  }, [dockedSide]);

  // Hover expand/collapse (only when docked)
  const handleMouseEnter = useCallback(() => {
    setShowTooltip(true);
    if (dockedSide) setExpanded(true);
  }, [dockedSide]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
    if (dockedSide && !isDragging.current) setExpanded(false);
  }, [dockedSide]);

  if (!petVisible || (!pet && !builtinPet)) return null;

  const petName = builtinPet?.displayName ?? pet?.displayName ?? '宠物';

  // Slide offset: hide PET_SIZE - PEEK_PX pixels into the screen edge
  const slideX = dockedSide && !expanded && !isDragging.current
    ? (dockedSide === 'right' ? PET_SIZE - PEEK_PX : -(PET_SIZE - PEEK_PX))
    : 0;

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
          transform: `translateX(${slideX}px)`,
          transition: isDragging.current ? 'none' : 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex flex-col items-center gap-1 select-none"
      >
        {/* Tooltip — only shown when expanded or not docked */}
        {showTooltip && (!dockedSide || expanded) && (
          <div
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-lg pointer-events-none"
            style={{ position: 'relative', zIndex: 1 }}
          >
            {dockedSide
              ? `${petName} · 双击解除吸附`
              : `${petName}`}
          </div>
        )}

        {/* Pet button — wrapped in relative container for the dock tab */}
        <div style={{ position: 'relative' }}>
          {/* Dock tab (visible edge indicator) */}
          {dockedSide && !expanded && (
            <DockTab side={dockedSide} accent={accentColor} />
          )}

          <button
            type="button"
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className="group relative outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg transition-transform hover:scale-110 active:scale-95"
            aria-label={
              dockedSide
                ? `宠物：${petName}，悬停展开，双击解除吸附`
                : `宠物：${petName}，点击互动，双击更换，拖拽移动`
            }
            title={
              dockedSide
                ? `${petName} — 悬停展开 · 双击解除吸附 · 拖拽移动`
                : `${petName} — 点击互动 · 双击更换 · 拖到边缘吸附`
            }
            style={{ cursor: 'inherit' }}
          >
            {builtinPet ? (
              <div className="flex h-20 w-20 items-center justify-center text-[44px] leading-none">
                {builtinPet.glyph}
              </div>
            ) : pet ? (
              <PetSpriteFace spritesheetUrl={pet.spritesheetUrl} size={80} rowId={rowId} />
            ) : null}
          </button>
        </div>
      </div>

      {showModal && (
        <PetPickerModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
};

export default PetRail;

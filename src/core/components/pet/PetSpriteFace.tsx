/**
 * PetSpriteFace — Renders a single animated frame from a Codex Atlas sprite sheet.
 *
 * Uses CSS background-position math to pick the correct cell, and a JS setInterval
 * to advance frames at the row's native fps.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  CODEX_ATLAS_COLS,
  CODEX_ATLAS_ROWS,
  CODEX_ATLAS_ROWS_DEF,
} from './codexAtlas';

interface Props {
  /** URL of the spritesheet image */
  spritesheetUrl: string;
  /** Display size in px (rendered as a square). Default: 64 */
  size?: number;
  /** Animation row id (e.g. 'idle', 'waving'). Defaults to 'idle'. */
  rowId?: string;
  className?: string;
}

const IDLE_DEF = CODEX_ATLAS_ROWS_DEF[0]; // always index 0, id 'idle'

export const PetSpriteFace: React.FC<Props> = ({
  spritesheetUrl,
  size = 64,
  rowId = 'idle',
  className = '',
}) => {
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Resolve the row definition; fall back to idle if unknown
  const def = CODEX_ATLAS_ROWS_DEF.find((r) => r.id === rowId) ?? IDLE_DEF;

  // Advance frames via setInterval
  useEffect(() => {
    setFrame(0);
    if (def.frames <= 1) return;

    const intervalMs = Math.max(16, Math.round(1000 / def.fps));
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % def.frames);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [def.id, def.index, def.frames, def.fps]);

  // Preload image to track loaded state
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    setLoaded(false);
    const img = new Image();
    img.src = spritesheetUrl;
    img.onload  = () => setLoaded(true);
    img.onerror = () => setLoaded(false); // stay in skeleton
    imgRef.current = img;
    return () => {
      img.onload  = null;
      img.onerror = null;
    };
  }, [spritesheetUrl]);

  // CSS background-position math
  // backgroundSize: cols×100% wide, rows×100% tall → each cell fills the container
  // X%: frame / (cols-1) * 100  — distributes frame across columns
  // Y%: rowIndex / (rows-1) * 100 — distributes row across rows
  const cols = CODEX_ATLAS_COLS;
  const rows = CODEX_ATLAS_ROWS;
  const xPct = cols > 1 ? (frame / (cols - 1)) * 100 : 0;
  const yPct = rows > 1 ? (def.index / (rows - 1)) * 100 : 0;

  if (!loaded) {
    return (
      <span
        className={`inline-block bg-gray-700 animate-pulse rounded ${className}`}
        style={{ width: size, height: size }}
        aria-label="Loading pet sprite…"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`Pet animation: ${def.id}`}
      className={`inline-block ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${spritesheetUrl})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        imageRendering: 'pixelated',
        flexShrink: 0,
      }}
    />
  );
};

export default PetSpriteFace;

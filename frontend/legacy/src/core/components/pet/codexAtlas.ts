/**
 * Codex Atlas — sprite sheet constants & row definitions.
 * Ported from Open Design pet system.
 *
 * A single spritesheet.webp is 1536×1872 px (8 cols × 9 rows, 72 frames total).
 * Each cell is 192×208 px.
 */

export const CODEX_ATLAS_COLS = 8;
export const CODEX_ATLAS_ROWS = 9;
export const CODEX_CELL_WIDTH = 192;
export const CODEX_CELL_HEIGHT = 208;

export interface CodexAtlasRowDef {
  /** Row index in the sprite sheet (0-based) */
  index: number;
  /** Stable identifier used as rowId in components */
  id: string;
  /** Number of frames in this row */
  frames: number;
  /** Playback speed in frames per second */
  fps: number;
}

export const CODEX_ATLAS_ROWS_DEF: CodexAtlasRowDef[] = [
  { index: 0, id: 'idle',          frames: 6, fps: 6 },
  { index: 1, id: 'running-right', frames: 8, fps: 8 },
  { index: 2, id: 'running-left',  frames: 8, fps: 8 },
  { index: 3, id: 'waving',        frames: 4, fps: 6 },
  { index: 4, id: 'jumping',       frames: 5, fps: 7 },
  { index: 5, id: 'failed',        frames: 8, fps: 7 },
  { index: 6, id: 'waiting',       frames: 6, fps: 6 },
  { index: 7, id: 'running',       frames: 6, fps: 8 },
  { index: 8, id: 'review',        frames: 6, fps: 6 },
];

/**
 * Heuristic check: does this image look like a Codex Atlas?
 * Accepts ±6% tolerance on both axes.
 */
export function looksLikeCodexAtlas(width: number, height: number): boolean {
  const expectedWidth  = CODEX_ATLAS_COLS * CODEX_CELL_WIDTH;   // 1536
  const expectedHeight = CODEX_ATLAS_ROWS * CODEX_CELL_HEIGHT;  // 1872

  const tolerance = 0.06;
  const widthOk  = Math.abs(width  - expectedWidth)  / expectedWidth  <= tolerance;
  const heightOk = Math.abs(height - expectedHeight) / expectedHeight <= tolerance;

  return widthOk && heightOk;
}

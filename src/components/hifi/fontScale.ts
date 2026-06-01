/**
 * fontScale — 用户可调的全局字号(2026-06-01)。
 *
 * 设计原则(对齐用户「直接改字体大小,不缩放、不碰布局」):
 *   - 只改 <html> 的 font-size(基准 px)。index.css 的 sf-body / 大量 rem? 实际
 *     全 app 正文继承 body 的 px;调基准让"继承字号"的文本整体变大,布局不缩放、
 *     不裁切(与失败的 zoom 方案相反)。
 *   - 写死 px 的内联文本不会跟,但正文阅读区(消息/段落/列表)多数继承 → 体感即变。
 *
 * 存储:localStorage `sf-font-scale` = 基准 px 字符串(默认 14,与 index.css 一致)。
 * 应用:setRootFontSize 写 documentElement.style.fontSize。useTheme 启动时调一次,
 * AppearanceSection 改动时调。CSS 的 body{font-size:14px} 是兜底默认;一旦用户设过,
 * inline style 覆盖它。
 */

const STORAGE_KEY = 'sf-font-scale';

/** index.css 的 body 默认值;无存储时用它(不写 inline,保持与 CSS 一致)。
 *  字号自由调整(滑块 12–18px),无预设档。 */
export const DEFAULT_FONT_PX = 14;
export const FONT_PX_MIN = 12;
export const FONT_PX_MAX = 18;

/** 读用户存的基准 px;无/非法 → null(表示用 CSS 默认,不覆盖)。 */
export function loadFontPx(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= FONT_PX_MIN && n <= FONT_PX_MAX) return n;
  } catch {
    /* ignore */
  }
  return null;
}

/** 存基准 px(夹取范围)。传 null/默认值则清除存储,回到 CSS 默认。 */
export function saveFontPx(px: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (px === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      const clamped = Math.max(FONT_PX_MIN, Math.min(FONT_PX_MAX, px));
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  } catch {
    /* ignore */
  }
}

/** 把基准 px 写到 <html>(覆盖 CSS body 默认)。传 null → 清 inline,回 CSS 默认。 */
export function applyFontPx(px: number | null): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (px === null) {
    el.style.removeProperty('font-size');
  } else {
    const clamped = Math.max(FONT_PX_MIN, Math.min(FONT_PX_MAX, px));
    el.style.fontSize = `${clamped}px`;
  }
}

/** 启动时调:把存储的字号应用上(无存储则不动,用 CSS 默认)。 */
export function initFontScale(): void {
  const px = loadFontPx();
  if (px !== null) applyFontPx(px);
}

/** 当前生效基准 px(存储值 或 CSS 默认)。供 UI 高亮当前档。 */
export function currentFontPx(): number {
  return loadFontPx() ?? DEFAULT_FONT_PX;
}

/**
 * fontScale — 用户可调的全局界面缩放(2026-06-01,v2 改 zoom 方案)。
 *
 * 为什么是 zoom 不是改字号:全 app 字号 100% 用 px(156 文件、0 rem),改 <html>/<body>
 * 基准对 px 绝对单位完全无效(实测「滑块拖了没变化」)。唯一能让全部 px 文字等比变大的
 * 是 CSS `zoom` —— 它在渲染层缩放,无视 px/rem。代价是定高全屏壳(height:100vh +
 * overflow:hidden)在 zoom 后内容超物理视口被裁;用 `.zoom-shell` 工具类
 * (height: calc(100vh / var(--app-zoom)))统一抵消,见 index.css。
 *
 * 实现:写 documentElement 的 `--app-zoom`(CSS 变量)+ html{zoom:var(--app-zoom)}。
 * 存储:localStorage `sf-font-scale` = zoom 系数(默认 1.0)。滑块范围 0.85–1.4。
 */

const STORAGE_KEY = 'sf-font-scale';

/** 默认缩放(1.0 = 原始大小,不放大)。无存储时用它。 */
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_MIN = 0.85;
export const ZOOM_MAX = 1.4;

/** 读用户存的 zoom;无/非法 → null(表示用默认 1.0,不写 inline)。 */
export function loadZoom(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n;
  } catch {
    /* ignore */
  }
  return null;
}

/** 存 zoom(夹取范围)。传 null/默认值则清存储,回默认 1.0。 */
export function saveZoom(z: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (z === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  } catch {
    /* ignore */
  }
}

/**
 * 把 zoom 写到 <html> 的 --app-zoom CSS 变量。index.css 里 html{zoom:var(--app-zoom)}
 * 据此整体缩放;.zoom-shell 据此抵消 100vh。传 null → 设回 1.0(默认)。
 */
export function applyZoom(z: number | null): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const v = z === null ? DEFAULT_ZOOM : Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  el.style.setProperty('--app-zoom', String(v));
}

/** 启动时调:把存储的 zoom 应用上(无存储则设默认 1.0)。 */
export function initFontScale(): void {
  applyZoom(loadZoom());
}

/** 当前生效 zoom(存储值 或 默认 1.0)。供 UI 高亮当前值。 */
export function currentZoom(): number {
  return loadZoom() ?? DEFAULT_ZOOM;
}

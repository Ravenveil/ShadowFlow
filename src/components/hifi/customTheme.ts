/**
 * customTheme — user-adjustable theme colors (accent / bg / fg).
 *
 * 用户在 设置 → 外观 → 颜色定制 里选的颜色，按 slot 写入 localStorage，并以
 * inline style 设到 documentElement 上。inline style 在 CSS 级联中**优先级
 * 高于** :root / [data-theme="day"|"night"] 选择器里定义的同名 var，所以：
 *   - 自定义色立即生效（不需要等任何 class 切换）；
 *   - dark ↔ light 切换不会冲掉自定义色（用户跨模式想保留就保留）；
 *   - 清掉某个 slot 时，移除 inline style → 自动回落到当前模式的默认 token。
 *
 * Phase 1 只暴露 3 个最高频的 slot：accent / bg / fg。字体、对比度、光标、动效、
 * diff 标记等是 reference 图里有但不在本次范围的扩展位，类型 + 范式相同，后续
 * 加 slot 只需扩 SLOTS 表 + 在 AppearanceSection 里多一行 ColorRow。
 */

export type CustomSlot = 'accent' | 'bg' | 'fg';

/** Per-slot localStorage key. */
const KEYS: Record<CustomSlot, string> = {
  accent: 'sf.customTheme.accent',
  bg: 'sf.customTheme.bg',
  fg: 'sf.customTheme.fg',
};

/** Per-slot CSS custom-property name to override on documentElement. */
const VARS: Record<CustomSlot, string> = {
  accent: '--t-accent',
  bg: '--t-bg',
  fg: '--t-fg',
};

export type CustomTheme = Partial<Record<CustomSlot, string>>;

export const CUSTOM_SLOTS: readonly CustomSlot[] = ['accent', 'bg', 'fg'];

/** Map slot → CSS var name (exported for the UI's computed-style seed lookup). */
export const CUSTOM_SLOT_VARS: Record<CustomSlot, string> = VARS;

/** Read all custom slots from localStorage. Returns {} when unset. */
export function loadCustomTheme(): CustomTheme {
  if (typeof window === 'undefined') return {};
  const out: CustomTheme = {};
  for (const slot of CUSTOM_SLOTS) {
    try {
      const v = window.localStorage.getItem(KEYS[slot]);
      if (v) out[slot] = v;
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * Apply (or clear) each slot as an inline style on documentElement.
 * Missing slots in `theme` cause the inline style to be removed → fall back
 * to the active mode's CSS-defined default token.
 */
export function applyCustomTheme(theme: CustomTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const slot of CUSTOM_SLOTS) {
    const v = theme[slot];
    if (v) root.style.setProperty(VARS[slot], v);
    else root.style.removeProperty(VARS[slot]);
  }
}

/**
 * Set or clear a single slot. Persists to localStorage and applies the
 * full theme (so other slots' inline styles remain intact). Pass null to
 * clear that one slot.
 */
export function setCustomColor(slot: CustomSlot, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(KEYS[slot], value);
    else window.localStorage.removeItem(KEYS[slot]);
  } catch {
    /* ignore */
  }
  applyCustomTheme(loadCustomTheme());
}

/** Wipe all custom slots — UI returns to active mode's default tokens. */
export function resetCustomTheme(): void {
  if (typeof window === 'undefined') return;
  for (const slot of CUSTOM_SLOTS) {
    try {
      window.localStorage.removeItem(KEYS[slot]);
    } catch {
      /* ignore */
    }
  }
  applyCustomTheme({});
}

/**
 * Read the *currently effective* color for a slot. Used by the picker to
 * seed its initial swatch from the active CSS token when nothing is
 * customized yet. Returns `fallback` when the computed style isn't a
 * 6-hex value (the `<input type="color">` element requires #RRGGBB).
 */
export function getEffectiveColor(slot: CustomSlot, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(VARS[slot])
    .trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

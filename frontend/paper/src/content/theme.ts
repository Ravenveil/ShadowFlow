/**
 * theme.ts — 三套风格的**展示文案**（设置面板的卡片）。
 *
 * 与 `theme/tokens.css` 的分工：色值在 CSS，文案在这里。
 * 加第四套风格 = tokens.css 加一段 `[data-theme='x']` + 这里加一条 + ThemeName 加一个字面量。
 */
import type { ThemeName } from '../theme/ThemeProvider';

export const THEME_META: Record<ThemeName, { label: string; hint: string; blurb: string }> = {
  ink: { label: '墨橙', hint: '品牌营销风', blurb: '米白纸感 · 橙色强调 · 硬边卡片' },
  clean: { label: '净白', hint: '极简工作台', blurb: '纯白留白 · 紫色强调 · 圆角柔和' },
  night: { label: '夜间', hint: '深色护眼', blurb: '深墨背景 · 橙光点缀 · 长时间写作' },
};

/** 设置面板里的排列顺序。 */
export const THEME_ORDER: ThemeName[] = ['ink', 'clean', 'night'];

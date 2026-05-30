/**
 * agentAvatar — 全局统一的「乘务员/agent 头像」配色与首字逻辑。
 *
 * 单一事实来源：DM 列表（InboxPanelFB）、群设置成员网格（GroupSettingsModalFB）
 * 以及任何展示 agent 头像的地方都必须从这里取色，保证**同一个 agent（按 agent_id
 * 取色）在全 app 任意位置永远是同一个浅墨兰迪色**。
 *
 * 设计：浅色底（14~16% 色 + skin-panel）+ 描边（35~38%）+ 深字色 —— 不用饱和实色块。
 */

export interface AvatarPalette {
  bg: string;
  border: string;
  fg: string;
}

/** 浅墨兰迪 7 色环。新增/调整颜色只改这里，全 app 同步。 */
export const AGENT_PALETTE: AvatarPalette[] = [
  // 橙
  { bg: 'color-mix(in oklab, #F59E0B 16%, var(--skin-panel))', border: 'color-mix(in oklab, #F59E0B 38%, transparent)', fg: '#B45309' },
  // 紫
  { bg: 'color-mix(in oklab, #A855F7 14%, var(--skin-panel))', border: 'color-mix(in oklab, #A855F7 35%, transparent)', fg: '#7C3AED' },
  // 红
  { bg: 'color-mix(in oklab, #EF4444 14%, var(--skin-panel))', border: 'color-mix(in oklab, #EF4444 35%, transparent)', fg: '#B91C1C' },
  // 青蓝
  { bg: 'color-mix(in oklab, #0891B2 14%, var(--skin-panel))', border: 'color-mix(in oklab, #0891B2 35%, transparent)', fg: '#0891B2' },
  // 浅青
  { bg: 'color-mix(in oklab, #22D3EE 14%, var(--skin-panel))', border: 'color-mix(in oklab, #22D3EE 35%, transparent)', fg: '#0891B2' },
  // 绿
  { bg: 'color-mix(in oklab, #10B981 14%, var(--skin-panel))', border: 'color-mix(in oklab, #10B981 35%, transparent)', fg: '#059669' },
  // 灰
  { bg: 'color-mix(in oklab, #71717A 14%, var(--skin-panel))', border: 'color-mix(in oklab, #71717A 35%, transparent)', fg: '#52525B' },
];

/** 置顶/强调（群组本体而非 agent）用 accent 皮肤色。 */
export const ACCENT_PALETTE: AvatarPalette = {
  bg: 'var(--accent-tint)',
  border: 'color-mix(in oklab, var(--accent) 35%, transparent)',
  fg: 'var(--accent-bright)',
};

/** 稳定 hash：同一 key 永远落在同一个调色板索引上。 */
export function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/**
 * 取某个 agent/会话的稳定配色。
 * @param key 稳定标识——agent 必须传 agent_id，保证跨页面一致。
 */
export function paletteFor(key: string): AvatarPalette {
  return AGENT_PALETTE[hashIndex(key || '?', AGENT_PALETTE.length)];
}

/** 取名字首字：中文取首字，英文取首字母大写。 */
export function initialOf(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

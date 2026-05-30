/**
 * agentAvatar — 全局统一的「乘务员/agent 头像」配色与首字逻辑。
 *
 * 单一事实来源：DM 列表（InboxPanelFB）、群设置成员网格（GroupSettingsModalFB）、
 * 聊天气泡（ChatFeedFB）、Thread 抽屉（ThreadDrawerFB）等任何展示 agent 头像的地方
 * 都必须从这里取色，保证**同一个 agent 在全 app 任意位置永远是同一个浅墨兰迪色**。
 *
 * 取色 key：用 agent 的「显示名」。后端聊天消息（Message）只带 sender_name，不带
 * agent_id，所以显示名是唯一全 app 都拿得到的稳定标识 —— 全部统一按它取色。
 *
 * 设计：浅色底（14~16% 色 + skin-panel）+ 描边（35~38%）+ 深字色 —— 不用饱和实色块。
 */

export interface AvatarPalette {
  /** 原色（饱和 hue）——用于左边线、AGENT pill 等强调元素。 */
  accent: string;
  /** 头像淡底（14~16% 色 + skin-panel）。 */
  bg: string;
  /** 头像描边（35~38%）。 */
  border: string;
  /** 头像深字色。 */
  fg: string;
}

/** 浅墨兰迪 7 色环。新增/调整颜色只改这里，全 app 同步。 */
export const AGENT_PALETTE: AvatarPalette[] = [
  // 橙
  { accent: '#F59E0B', bg: 'color-mix(in oklab, #F59E0B 16%, var(--skin-panel))', border: 'color-mix(in oklab, #F59E0B 38%, transparent)', fg: '#B45309' },
  // 紫
  { accent: '#A855F7', bg: 'color-mix(in oklab, #A855F7 14%, var(--skin-panel))', border: 'color-mix(in oklab, #A855F7 35%, transparent)', fg: '#7C3AED' },
  // 红
  { accent: '#EF4444', bg: 'color-mix(in oklab, #EF4444 14%, var(--skin-panel))', border: 'color-mix(in oklab, #EF4444 35%, transparent)', fg: '#B91C1C' },
  // 青蓝
  { accent: '#0891B2', bg: 'color-mix(in oklab, #0891B2 14%, var(--skin-panel))', border: 'color-mix(in oklab, #0891B2 35%, transparent)', fg: '#0891B2' },
  // 浅青
  { accent: '#22D3EE', bg: 'color-mix(in oklab, #22D3EE 14%, var(--skin-panel))', border: 'color-mix(in oklab, #22D3EE 35%, transparent)', fg: '#0891B2' },
  // 绿
  { accent: '#10B981', bg: 'color-mix(in oklab, #10B981 14%, var(--skin-panel))', border: 'color-mix(in oklab, #10B981 35%, transparent)', fg: '#059669' },
  // 灰
  { accent: '#71717A', bg: 'color-mix(in oklab, #71717A 14%, var(--skin-panel))', border: 'color-mix(in oklab, #71717A 35%, transparent)', fg: '#52525B' },
];

/** 置顶/强调（群组本体而非 agent）用 accent 皮肤色。 */
export const ACCENT_PALETTE: AvatarPalette = {
  accent: 'var(--accent)',
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
 * 由任意 CSS 颜色合成一套浅墨兰迪头像配色（淡底 + 描边 + 字色）。
 * 让用户在 7 个预设之外可选「任意颜色」（取色器 / hex 输入）。
 */
export function paletteFromColor(color: string): AvatarPalette {
  return {
    accent: color,
    bg: `color-mix(in oklab, ${color} 15%, var(--skin-panel))`,
    border: `color-mix(in oklab, ${color} 38%, transparent)`,
    // 字色用原色压暗一档，保证在淡底上可读
    fg: `color-mix(in oklab, ${color} 78%, #000)`,
  };
}

// ── 用户手选颜色覆盖（Quick Hire「换头像色」）──────────────────────────────────
// 用户显式给某个 agent 选了色 → 记 name→任意 CSS 颜色串，全 app 的 paletteFor
// 优先用它，不再按名字 hash。存 localStorage，刷新后仍生效。后端 Message 不带
// agent_id，故按「显示名」存。
const OVERRIDE_KEY = 'sf.agentAvatarColors';

function loadOverrides(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OVERRIDE_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== 'object') return {};
    // 兼容旧版（存的是数字索引）：迁移为颜色串。
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = v;
      else if (typeof v === 'number') out[k] = AGENT_PALETTE[((v % AGENT_PALETTE.length) + AGENT_PALETTE.length) % AGENT_PALETTE.length].accent;
    }
    return out;
  } catch {
    return {};
  }
}

let _overrides: Record<string, string> = loadOverrides();

/** 取某 agent 的手选色（CSS 颜色串）；无则 null。 */
export function getAgentColorOverride(name: string): string | null {
  const v = _overrides[(name ?? '').trim()];
  return typeof v === 'string' && v ? v : null;
}

/** 设/清某 agent 的手选色（传 null 清除，回到按名字 hash）。 */
export function setAgentColorOverride(name: string, color: string | null): void {
  const k = (name ?? '').trim();
  if (!k) return;
  if (color == null || color === '') delete _overrides[k];
  else _overrides[k] = color;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OVERRIDE_KEY, JSON.stringify(_overrides));
  } catch {
    /* 隐私模式等写失败：保留内存态即可 */
  }
}

/**
 * 取某个 agent/会话的稳定配色。
 * @param key 稳定标识——agent 一律传「显示名」，保证跨页面同 agent 同色。
 *            若该名字有用户手选色（override），优先用之。
 */
export function paletteFor(key: string): AvatarPalette {
  const ov = getAgentColorOverride(key);
  if (ov) return paletteFromColor(ov);
  return AGENT_PALETTE[hashIndex(key || '?', AGENT_PALETTE.length)];
}

/** 取名字首字：中文取首字，英文取首字母大写。 */
export function initialOf(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

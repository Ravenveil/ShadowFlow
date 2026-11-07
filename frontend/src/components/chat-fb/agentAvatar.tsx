import { useId, useMemo, type CSSProperties } from 'react';

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

// ── Agent 头像色注册表（真源 = 后端 avatar_color 字段）──────────────────────────
// 后端每个 agent 存了 avatar_color。但聊天/DM 的消息（Message）只带 sender_name，
// 拿不到 agent_id/avatar_color，所以前端维护一份 name→color 索引：listAgents() 拉
// 到 agents 列表后 registerAgentColors() 灌进来，paletteFor(name) 据此取色，于是
// 全 app 同名 agent 永远同色。localStorage 只作「首屏缓存」——刷新后在 fetch 回来
// 前也能显示正确色；fetch 回来后以后端为准刷新。
const REGISTRY_KEY = 'sf.agentAvatarColors';

function loadRegistry(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(REGISTRY_KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== 'object') return {};
    // 兼容旧版（曾存数字索引）：迁移为颜色串。
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

let _colorByName: Record<string, string> = loadRegistry();
// U0 绑角色（2026-06-23）— agent_id → color 注册表。消息上线了 agent_id 后，
// 取色优先按 agent_id（确定性、不撞名），回退按显示名。仅内存（agent_id 不入
// localStorage 首屏缓存；listAgents() 回来即重灌，开销可忽略）。
let _colorById: Record<string, string> = {};

function persistRegistry(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(REGISTRY_KEY, JSON.stringify(_colorByName));
  } catch {
    /* 隐私模式等写失败：保留内存态即可 */
  }
}

/** 取某 agent 的注册色（CSS 颜色串）；无则 null。 */
export function getAgentColor(name: string): string | null {
  const v = _colorByName[(name ?? '').trim()];
  return typeof v === 'string' && v ? v : null;
}

/** 注册/清除单个 agent 的色（传 null 清除，回到按名字 hash）。乐观更新用。 */
export function registerAgentColor(name: string, color: string | null): void {
  const k = (name ?? '').trim();
  if (!k) return;
  if (color == null || color === '') delete _colorByName[k];
  else _colorByName[k] = color;
  persistRegistry();
}

/**
 * 用后端 agents 列表批量同步注册表（listAgents() 每次都会调）。
 * 有 avatar_color → 记；无 → 删（让后端清除颜色也能传导到前端）。
 */
export function registerAgentColors(
  list: Array<{ name?: string | null; avatar_color?: string | null; agent_id?: string | null }>,
): void {
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const a of list) {
    const k = (a?.name ?? '').trim();
    const c = a?.avatar_color;
    // U0 — 同步 agent_id → color（仅内存，不持久化）。
    const id = (a?.agent_id ?? '').trim();
    if (id) {
      if (typeof c === 'string' && c) _colorById[id] = c;
      else delete _colorById[id];
    }
    if (!k) continue;
    if (typeof c === 'string' && c) {
      if (_colorByName[k] !== c) { _colorByName[k] = c; changed = true; }
    } else if (k in _colorByName) {
      delete _colorByName[k]; changed = true;
    }
  }
  if (changed) persistRegistry();
}

/**
 * 取某个 agent/会话的稳定配色。
 * @param key 稳定标识——agent 一律传「显示名」，保证跨页面同 agent 同色。
 *            若该名字注册过颜色（后端 avatar_color），优先用之，否则按名字 hash。
 */
export function paletteFor(key: string): AvatarPalette {
  const c = getAgentColor(key);
  if (c) return paletteFromColor(c);
  return AGENT_PALETTE[hashIndex(key || '?', AGENT_PALETTE.length)];
}

/**
 * U0 绑角色（2026-06-23）— 优先按 agent_id 取色（确定性、不撞名），回退到显示名。
 * 消息上线 agent_id 后，渲染器（ChatFeedFB/Timeline 气泡头像）应改用本函数：
 * paletteForAgent(msg.agent_id, msg.sender_name)。agent_id 缺省时与 paletteFor 等价。
 */
export function paletteForAgent(agentId: string | undefined | null, name: string): AvatarPalette {
  const id = (agentId ?? '').trim();
  if (id) {
    const c = _colorById[id];
    if (typeof c === 'string' && c) return paletteFromColor(c);
  }
  return paletteFor(name);
}

/** 取名字首字：中文取首字，英文取首字母大写。 */
export function initialOf(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

// ── 生成式 SVG 头像（boring-avatars「marble」风格 · 零网络 · 纯本地确定性生成）──────
//
// 设计目标（2026-06-27 头像系统 R1）：
//   每个 agent 一张「独一无二、与深色主题协调」的渐变纹样头像。种子 = agent_id（缺省
//   显示名），同一 agent 跨页面永远同一张图；基色优先取后端 avatar_color（与全 app 取
//   色注册表同源），缺色时由种子哈希推出一个稳定 hue。首字（initialOf）叠加其上做身份
//   锚点，无名/无种子时兜底「?」。纯 SVG，无外部请求、无 canvas、无图片资源。

/** FNV-1a 32-bit 哈希 → 无符号整数种子。 */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — 由整数种子产出确定性 [0,1) 伪随机序列。 */
function mulberry32(a: number): () => number {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 解析 #rgb / #rrggbb → 主色调 hue（0–360）；灰色或非 hex（如 var(--x)）返回 null。 */
function parseHexHue(color: string | null | undefined): number | null {
  if (!color) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null; // 灰 → 无有意义 hue，回退种子
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

interface MarbleBlob {
  color: string;
  tx: number;
  ty: number;
  scale: number;
  rotate: number;
  rx: number;
  ry: number;
}
interface MarbleSpec {
  bgFrom: string;
  bgTo: string;
  blobs: MarbleBlob[];
}

const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(1)}, ${s}%, ${l}%)`;

/**
 * 由「种子 + 基色」生成确定性 marble 纹样规格（背景渐变 + 3 团柔光色块）。
 * 基色提供锚点 hue，三团色块在锚点附近扇形展开（类比色 + 一点撞色），饱和/明度落在
 * 适配深色主题的中高调区间，不刺眼也不糊成一团。
 */
function buildMarble(seed: string, baseColor?: string | null): MarbleSpec {
  const rnd = mulberry32(hashSeed(seed || '?'));
  const anchor = parseHexHue(baseColor) ?? Math.floor(rnd() * 360);
  const spread = 24 + rnd() * 34; // 24–58°
  const hues = [
    anchor,
    (anchor + spread) % 360,
    (anchor - spread * 0.65 + 360) % 360,
  ];
  const blobs: MarbleBlob[] = hues.map((h) => ({
    color: hsl(h, 56 + Math.floor(rnd() * 18), 50 + Math.floor(rnd() * 14)),
    tx: (rnd() * 2 - 1) * 20,
    ty: (rnd() * 2 - 1) * 20,
    scale: 1.0 + rnd() * 0.8,
    rotate: rnd() * 360,
    rx: 22 + rnd() * 10,
    ry: 22 + rnd() * 10,
  }));
  return {
    bgFrom: hsl(hues[2], 48, 26),
    bgTo: hsl(hues[0], 56, 38),
    blobs,
  };
}

export interface AgentAvatarProps {
  /** 稳定种子：优先 agent_id（确定性、不撞名），渲染纹样用。缺省回退到 name。 */
  seed?: string | null;
  /** 显示名：取首字叠加做身份锚点；也作 seed 兜底。 */
  name?: string | null;
  /** 渐变基色（后端 avatar_color / 调色板 accent）。hex 时作锚点 hue，否则由种子推 hue。 */
  color?: string | null;
  /** 像素边长（默认 32）。 */
  size?: number;
  /** 在线/运行状态点（复用 --t-ok/run/warn/err 与 hf-pulse）。 */
  status?: 'ok' | 'run' | 'warn' | 'err';
  /** 是否叠加首字（默认 true）。false → 纯生成式纹样。 */
  showInitial?: boolean;
  /** 圆形（true）/ 圆角方块（默认 false）。 */
  round?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * AgentAvatar — 生成式 SVG 头像。纯展示、确定性、零网络。
 * 全 app 的 agent 头像统一改用本组件即可获得「独一无二的渐变身份图 + 首字锚点」。
 */
export function AgentAvatar({
  seed,
  name,
  color,
  size = 32,
  status,
  showInitial = true,
  round = false,
  title,
  className,
  style,
}: AgentAvatarProps) {
  // useId 保证多实例 mask/filter id 唯一（同种子也不撞），去掉 ':' 以便 url(#id) 安全引用。
  const uid = useId().replace(/:/g, '');
  const effSeed = (seed && seed.trim()) || (name && name.trim()) || '?';
  const spec = useMemo(() => buildMarble(effSeed, color), [effSeed, color]);
  const glyph = showInitial ? initialOf((name ?? seed ?? '?') || '?') : '';
  const corner = round ? 40 : 22; // viewBox(80) 下的圆角
  const clipId = `sfav-c-${uid}`;
  const blurId = `sfav-b-${uid}`;
  const gradId = `sfav-g-${uid}`;
  const sheenId = `sfav-s-${uid}`;

  const dot: CSSProperties | undefined = status
    ? {
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: Math.max(8, size * 0.28),
        height: Math.max(8, size * 0.28),
        borderRadius: '50%',
        background: `var(--t-${status})`,
        border: '2px solid var(--t-panel)',
        animation: status === 'run' ? 'hf-pulse 1.4s ease-in-out infinite' : 'none',
      }
    : undefined;

  return (
    <span
      className={className}
      title={title}
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0, ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        className="sf-avatar"
        role="img"
        aria-label={name ?? 'avatar'}
        style={{ display: 'block' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width="80" height="80" rx={corner} ry={corner} />
          </clipPath>
          <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={spec.bgFrom} />
            <stop offset="100%" stopColor={spec.bgTo} />
          </linearGradient>
          {/* 顶光：左上一抹高光 + 底部暗角，给纹样深色主题下的体积感。 */}
          <radialGradient id={sheenId} cx="32%" cy="26%" r="80%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="46%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
          </radialGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="80" height="80" fill={`url(#${gradId})`} />
          <g filter={`url(#${blurId})`}>
            {spec.blobs.map((b, i) => (
              <ellipse
                key={i}
                cx="40"
                cy="40"
                rx={b.rx}
                ry={b.ry}
                fill={b.color}
                opacity={0.92}
                transform={`translate(${b.tx.toFixed(2)} ${b.ty.toFixed(2)}) rotate(${b.rotate.toFixed(1)} 40 40) scale(${b.scale.toFixed(3)})`}
              />
            ))}
          </g>
          <rect width="80" height="80" fill={`url(#${sheenId})`} />
          {/* 内描边：深色主题下给头像一圈微光勾边，避免与面板「糊」在一起。 */}
          <rect
            x="0.75"
            y="0.75"
            width="78.5"
            height="78.5"
            rx={corner - 0.75}
            ry={corner - 0.75}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1.5"
          />
        </g>
        {glyph && (
          <text
            x="40"
            y="41"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="33"
            fontWeight={700}
            fill="#fff"
            stroke="rgba(0,0,0,0.22)"
            strokeWidth="0.7"
            style={{ paintOrder: 'stroke', letterSpacing: '-0.02em', fontFamily: 'inherit', userSelect: 'none' }}
          >
            {glyph}
          </text>
        )}
      </svg>
      {dot && <span style={dot} />}
    </span>
  );
}

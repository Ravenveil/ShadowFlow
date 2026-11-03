/**
 * config/clawhub.ts — ClawHub 前端配置中心（2026-06）
 *
 * 唯一事实源约定：
 *  - DiceBear 风格清单（12 套按需引入，tree-shaking 只打包这些；新增风格 =
 *    加一个命名 import + 一条 map 项）
 *  - Claw 品牌图标映射（Claw 本体用各自品牌色字母标，不与 Agent 头像混用）
 *  - 分类常量
 *  - hashSeed（FNV-1a）：Agent 未配 avatar_seed 时的默认种子
 *
 * 注意：后端事实源仍是 server/src/cli-registry.ts + GET /api/cli/detect；
 * 本文件只负责前端展示层的风格/图标/分类映射。
 */
import { createAvatar, type Style as DicebearStyleModule } from '@dicebear/core';
import {
  adventurer,
  adventurerNeutral,
  avataaars,
  avataaarsNeutral,
  bigEars,
  bigEarsNeutral,
  bigSmile,
  bottts,
  botttsNeutral,
  croodles,
  croodlesNeutral,
  dylan,
  funEmoji,
  glass,
  identicon,
  initials,
  lorelei,
  loreleiNeutral,
  micah,
  miniavs,
  notionists,
  notionistsNeutral,
  openPeeps,
  personas,
  pixelArt,
  pixelArtNeutral,
  rings,
  shapes,
  thumbs,
  toonHead,
} from '@dicebear/collection';

/**
 * DiceBear 风格注册表（id 即 @dicebear/collection 命名导出的 kebab-case id）。
 * 2026-10-30 应用户要求从 12 套精选扩到包内全部 31 套（v9 collection 包
 * 的全部人物/头像类风格；icons 不适合做头像未收录）。
 */
export const DICEBEAR_STYLES = [
  { id: 'adventurer', label: '冒险家' },
  { id: 'adventurer-neutral', label: '冒险家·素色' },
  { id: 'avataaars', label: 'Avataaars' },
  { id: 'avataaars-neutral', label: 'Avataaars·素色' },
  { id: 'big-ears', label: '大耳朵' },
  { id: 'big-ears-neutral', label: '大耳朵·素色' },
  { id: 'big-smile', label: '大笑脸' },
  { id: 'bottts', label: '机器人' },
  { id: 'bottts-neutral', label: '中性机器人（默认）' },
  { id: 'croodles', label: '涂鸦' },
  { id: 'croodles-neutral', label: '涂鸦·素色' },
  { id: 'dylan', label: 'Dylan' },
  { id: 'fun-emoji', label: '趣萌' },
  { id: 'glass', label: '玻璃' },
  { id: 'identicon', label: '像素图腾' },
  { id: 'initials', label: '首字母' },
  { id: 'lorelei', label: 'Lorelei' },
  { id: 'lorelei-neutral', label: 'Lorelei·素色' },
  { id: 'micah', label: 'Micah' },
  { id: 'miniavs', label: '迷你' },
  { id: 'notionists', label: 'Notion 风' },
  { id: 'notionists-neutral', label: 'Notion 风·素色' },
  { id: 'open-peeps', label: '开放小人' },
  { id: 'personas', label: 'Personas' },
  { id: 'pixel-art', label: '像素' },
  { id: 'pixel-art-neutral', label: '像素·素色' },
  { id: 'rings', label: '圆环' },
  { id: 'shapes', label: '几何' },
  { id: 'thumbs', label: '点赞拇指' },
  { id: 'toon-head', label: '卡通头' },
] as const;

export type DicebearStyleId = (typeof DICEBEAR_STYLES)[number]['id'];

/** 默认风格兜底（PRD §6.2）。 */
export const DEFAULT_AVATAR_STYLE: DicebearStyleId = 'bottts-neutral';

/** styleId → @dicebear/collection 风格对象。新增风格 = 加一行 import + 一条项。 */
const STYLE_REGISTRY: Record<DicebearStyleId, DicebearStyleModule<Record<string, unknown>> | DicebearStyleModule<never>> = {
  adventurer,
  'adventurer-neutral': adventurerNeutral,
  avataaars,
  'avataaars-neutral': avataaarsNeutral,
  'big-ears': bigEars,
  'big-ears-neutral': bigEarsNeutral,
  'big-smile': bigSmile,
  bottts,
  'bottts-neutral': botttsNeutral,
  croodles,
  'croodles-neutral': croodlesNeutral,
  dylan,
  'fun-emoji': funEmoji,
  glass,
  identicon,
  initials,
  lorelei,
  'lorelei-neutral': loreleiNeutral,
  micah,
  miniavs,
  notionists,
  'notionists-neutral': notionistsNeutral,
  'open-peeps': openPeeps,
  personas,
  'pixel-art': pixelArt,
  'pixel-art-neutral': pixelArtNeutral,
  rings,
  shapes,
  thumbs,
  'toon-head': toonHead,
};

/** 风格 id 合法性（后端只校验格式，真实风格存在性由前端把关）。 */
export function isKnownStyle(styleId: string | null | undefined): boolean {
  return !!styleId && styleId in STYLE_REGISTRY;
}

/** 规范化风格 id：未知/空 → 默认风格。 */
export function normalizeStyle(styleId: string | null | undefined): DicebearStyleId {
  return isKnownStyle(styleId) ? (styleId as DicebearStyleId) : DEFAULT_AVATAR_STYLE;
}

/**
 * FNV-1a 32-bit hash → hex（8 字符）。
 * Agent 未配置 avatar_seed 时按 name hash 生成稳定种子（同名同头像）。
 */
export function hashSeed(name: string): string {
  const key = name || '?';
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 转无符号再 pad 成 8 位 hex
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 随机种子（骰子按钮用）：可读时间戳+随机段。 */
export function randomSeed(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ---------------------------------------------------------------------------
// 提示词生成头像（2026-11-04 os-unified：Grok Bot「描述→生成→保存」流程）
// ---------------------------------------------------------------------------

/** 提示词关键词 → DiceBear 风格启发式表（首个命中优先；中文/英文双词表）。 */
const PROMPT_STYLE_HINTS: ReadonlyArray<{ words: readonly string[]; style: DicebearStyleId }> = [
  { words: ['机器人', '机甲', 'robot', 'mech', 'bot', 'android'], style: 'bottts' },
  { words: ['猫', '狗', '宠物', '猫娘', 'cat', 'dog', 'pet', 'kitty'], style: 'fun-emoji' },
  { words: ['像素', '复古', '游戏', 'pixel', 'retro', '8bit'], style: 'pixel-art' },
  { words: ['冒险', '骑士', '勇者', 'adventure', 'knight', 'hero'], style: 'adventurer' },
  { words: ['画家', '艺术家', '设计师', 'artist', 'designer', 'painter'], style: 'open-peeps' },
  { words: ['程序员', '工程师', '码农', 'coder', 'engineer', 'developer'], style: 'bottts-neutral' },
  { words: ['学者', '教授', '博士', '学者风', 'professor', 'scholar', 'phd'], style: 'notionists' },
  { words: ['可爱', '萌', '卡通', 'cute', 'kawaii', 'cartoon'], style: 'big-smile' },
  { words: ['人像', '写实', '真人', 'portrait', 'realistic', 'photo'], style: 'lorelei' },
  { words: ['抽象', '几何', '图腾', 'abstract', 'geometry', 'totem'], style: 'identicon' },
  { words: ['玻璃', '透明', '光效', 'glass', 'crystal', 'glow'], style: 'glass' },
  { words: ['涂鸦', '手绘', '涂鸦风', 'doodle', 'sketch', 'hand-drawn'], style: 'croodles' },
];

export interface GeneratedAvatarCandidate {
  style: DicebearStyleId;
  seed: string;
}

/**
 * 提示词 → 头像候选（本地确定性生成，离线可用）：
 *  - 风格：提示词关键词启发式命中优先，未命中按提示词 hash 从精选风格池选；
 *  - 种子：提示词全文 hash + 变体序号扰动（同提示词每档稳定不同脸）。
 * variantIndex 0..3 → 同一提示词 4 个稳定候选；将来接云端绘图 API 时
 * 只需替换本函数实现，调用方（AvatarStylePicker）协议不变。
 */
export function avatarFromPrompt(prompt: string, variantIndex = 0): GeneratedAvatarCandidate {
  const text = (prompt ?? '').trim();
  const lowered = text.toLowerCase();
  // 关键词命中风格（取第一个命中的提示表项）
  let style: DicebearStyleId | null = null;
  for (const hint of PROMPT_STYLE_HINTS) {
    if (hint.words.some((w) => lowered.includes(w))) {
      style = hint.style;
      break;
    }
  }
  // 未命中 → 提示词 hash 从精选风格池稳定挑选（同人同提示词永远同风格）
  if (!style) {
    const pool: DicebearStyleId[] = [
      'bottts-neutral',
      'adventurer',
      'fun-emoji',
      'lorelei-neutral',
      'pixel-art-neutral',
      'croodles-neutral',
      'notionists-neutral',
      'open-peeps',
    ];
    style = pool[Math.abs(hashSeed(text || 'avatar').charCodeAt(0) * 31 + variantIndex) % pool.length];
  }
  // 种子 = 提示词 hash + 变体盐（4 档候选同一提示词稳定不同）
  const seed = `${hashSeed(text || 'avatar')}-${variantIndex.toString(36)}`;
  return { style, seed };
}

/**
 * 本地生成 DiceBear 头像 SVG 字符串（离线可用，不走公网 API）。
 * @param style  风格 id（normalizeStyle 兜底默认）
 * @param seed   种子（缺省 'shadowflow'）
 */
export function renderAvatarSvg(style: string | null | undefined, seed: string | null | undefined): string {
  const styleId = normalizeStyle(style);
  const avatar = createAvatar(
    STYLE_REGISTRY[styleId] as DicebearStyleModule<Record<string, unknown>>,
    {
      seed: seed && seed.trim().length > 0 ? seed : hashSeed('shadowflow'),
      // 头像统一浅底 + 圆角（背景色交给容器 CSS 控制；radius 全圆由容器裁切）
      backgroundColor: ['e5e7eb'],
      radius: 50,
    },
  );
  return avatar.toString();
}

/** @dicebear/core 的 Style 类型再导出（供消费方类型标注）。 */
export type { DicebearStyleModule };

// ---------------------------------------------------------------------------
// Claw 品牌图标映射（Claw 本体展示；与 Agent 头像体系分离）
// ---------------------------------------------------------------------------

export interface ClawBrandMeta {
  /** 单字母 monogram（目录卡片色块内）。 */
  monogram: string;
  /** 品牌色（CSS color）。 */
  tint: string;
}

/** 已知 Claw 的品牌元数据；未收录的 Claw 回落中性灰 + 首字母大写。 */
const CLAW_BRAND: Record<string, ClawBrandMeta> = {
  openclaw: { monogram: 'O', tint: '#F59E0B' },
  hermes: { monogram: 'H', tint: '#A855F7' },
  autoresearchclaw: { monogram: 'A', tint: '#0891B2' },
};

/** 解析 Claw 展示元数据（未收录回落：首字母大写 + 中性灰）。 */
export function resolveClawMeta(clawId: string): ClawBrandMeta {
  const known = CLAW_BRAND[clawId];
  if (known) return known;
  const first = Array.from(clawId || '?')[0]?.toUpperCase() ?? '?';
  return { monogram: first, tint: '#71717A' };
}

// ---------------------------------------------------------------------------
// 分类常量（与 server cli-registry category 值对齐）
// ---------------------------------------------------------------------------

export const CLAW_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'assistant', label: '助手' },
  { id: 'research', label: '研究' },
  { id: 'coding', label: '编码' },
  { id: 'other', label: '其他' },
];

/** category id → 中文标签（未知回落原值）。 */
export function clawCategoryLabel(category: string | null | undefined): string {
  if (!category) return '其他';
  return CLAW_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

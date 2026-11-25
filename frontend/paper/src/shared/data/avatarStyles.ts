/**
 * avatarStyles.ts — 灵魂配置页的 DiceBear 风格表与本地 SVG 渲染。
 *
 * 从 legacy/config/clawhub.ts 精简而来：paper 只需要「风格下拉 + 实时预览」
 * 这一能力，不需要提示词生图（那属于 ClawHub）。风格 id 是 DiceBear 官方
 * 标识符（数据，非界面文案），渲染全部本地完成、零网络请求。
 */
import { createAvatar, type Style as DicebearStyleModule } from '@dicebear/core';
import {
  adventurer,
  adventurerNeutral,
  avataaars,
  bottts,
  botttsNeutral,
  croodles,
  funEmoji,
  identicon,
  initials,
  lorelei,
  micah,
  miniavs,
  notionists,
  openPeeps,
  personas,
  pixelArt,
  shapes,
  thumbs,
} from '@dicebear/collection';

/** 风格注册表：id → DiceBear 风格模块。新增风格 = 加一行 import + 一条项。 */
const REGISTRY: Record<string, DicebearStyleModule<Record<string, unknown>>> = {
  adventurer,
  'adventurer-neutral': adventurerNeutral,
  avataaars,
  bottts,
  'bottts-neutral': botttsNeutral,
  croodles,
  'fun-emoji': funEmoji,
  identicon,
  initials,
  lorelei,
  micah,
  miniavs,
  notionists,
  'open-peeps': openPeeps,
  personas,
  'pixel-art': pixelArt,
  shapes,
  thumbs,
};

/** 下拉里展示的风格 id（稳定顺序，第一个为默认）。 */
export const AVATAR_STYLES = Object.keys(REGISTRY);
/** 全站统一 micah 人脸风（2026-11-25 用户定版：不要 bottts 机器人风）。 */
export const DEFAULT_AVATAR_STYLE = 'micah';

export function normalizeStyle(style: string | null | undefined): string {
  return style && style in REGISTRY ? style : DEFAULT_AVATAR_STYLE;
}

/** 本地生成头像 SVG（seed 空则用 name 直作种子，与全站约定一致）。 */
export function renderAvatarSvg(
  style: string | null | undefined,
  seed: string | null | undefined,
  name: string,
): string {
  const mod = REGISTRY[normalizeStyle(style)];
  const value = seed && seed.trim() ? seed : name;
  try {
    return createAvatar(mod, { seed: value }).toString();
  } catch {
    return '';
  }
}

/** 随机种子（「换一个」按钮用）。 */
export function randomSeed(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * 知识包的取形与取数。
 *
 * 第二栏（选哪个包）和正文（看这个包）都要用同一把 key 和同一份列表：
 * 在这里收敛，别各写一份 —— 后端哪天换个字段名，两边就会各错一半。
 */
import { createListStore } from '@/shared/data/listStore';
import { getPacks, type KnowledgePack } from '@/shared/data/http/generic';

/** 主键可能叫 pack_id，也可能只有 id / name。 */
export function packKey(pack: KnowledgePack): string {
  return pack.pack_id ?? pack.id ?? pack.name ?? pack.title ?? '';
}

/** 显示名（列表行与正文标题用同一个）。 */
export function packTitle(pack: KnowledgePack): string {
  return pack.name ?? pack.title ?? pack.pack_id ?? pack.id ?? '';
}

/** 已就绪的包才吸得进上下文，其余是还在切块/嵌入。 */
export function packReady(pack: KnowledgePack): boolean {
  return pack.status === 'ready' || pack.status === 'active';
}

export const packsStore = createListStore<KnowledgePack>(getPacks);

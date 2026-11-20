/**
 * clean-theme-switch.js — 就地删掉导航里的「墨橙 / 净白 / 夜间」风格切换胶囊。
 *
 * 为什么需要它：Figma MCP（Starter 计划）配额被封时改不了稿；而这个胶囊
 * 是早期从浏览器抓取落地页时一起抓进来的图层，本地代码早已删除，稿子里还留着。
 *
 * 做法（对抓取图层也安全）：
 *   1. 全页找 text 恰好是「墨橙」「净白」「夜间」的文本节点；
 *   2. 从每个命中往上最多 5 层，找第一个「这三个文本都在其子树里」的祖先
 *      —— 那就是胶囊容器；
 *   3. 只在容器宽 < 520、高 < 90 时才删（防止误删整条导航）；
 *   4. 删完报告删了几个、在哪个父层下。
 *
 * 用法：
 *   Figma 桌面版 → Plugins → Development → Import plugin from manifest…
 *   → 选同目录的 manifest-clean.json → 运行。当前页面即可。
 */
const LABELS = ['墨橙', '净白', '夜间'];
const MAX_UP = 5;
const MAX_W = 520;
const MAX_H = 90;

function collectText(node, out = []) {
  if (node.type === 'TEXT') out.push(node);
  if ('children' in node) for (const c of node.children) collectText(c, out);
  return out;
}

/** 子树里出现的文本集合（只看 TEXT 层）。 */
function textsUnder(node) {
  const set = new Set();
  for (const t of collectText(node)) set.add(String(t.characters).trim());
  return set;
}

function findContainer(textNode) {
  let p = textNode.parent;
  for (let i = 0; i < MAX_UP && p && p.type !== 'PAGE'; i += 1) {
    const set = textsUnder(p);
    if (LABELS.every((w) => set.has(w))) return p;
    p = p.parent;
  }
  return null;
}

const page = figma.currentPage;
const hits = collectText(page).filter((t) => LABELS.includes(String(t.characters).trim()));

if (!hits.length) {
  figma.closePlugin('没找到「墨橙 / 净白 / 夜间」文本 —— 这页是干净的');
} else {
  const targets = new Map();
  for (const t of hits) {
    const box = findContainer(t);
    if (box) targets.set(box.id, box);
  }

  const removed = [];
  const skipped = [];

  for (const box of targets.values()) {
    const { width, height } = box;
    if (width <= MAX_W && height <= MAX_H) {
      const parentName = box.parent && box.parent.name ? box.parent.name : '?';
      removed.push(`${box.name || box.type} (${Math.round(width)}×${Math.round(height)}) in 「${parentName}」`);
      box.remove();
    } else {
      skipped.push(`${box.name || box.type} (${Math.round(width)}×${Math.round(height)}) —— 太大，疑似整条导航，没删`);
    }
  }

  const lines = [];
  if (removed.length) lines.push(`已删 ${removed.length} 处切换器：\n· ${removed.join('\n· ')}`);
  if (skipped.length) lines.push(`跳过 ${skipped.length} 处：\n· ${skipped.join('\n· ')}`);
  if (!removed.length && !skipped.length) lines.push('找到文本但没定位到容器（可能被拆成了多层），请手动删。');
  figma.closePlugin(lines.join('\n\n'));
}

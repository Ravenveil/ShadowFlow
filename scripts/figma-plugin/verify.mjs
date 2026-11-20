/**
 * verify.mjs — 用 mock 的 figma API 跑一遍 code.js，离线验证插件不会在 Figma 里炸。
 *
 * 为什么需要：Figma 插件只能在其沙箱里跑，本机没有 Figma 就无法端到端测试。
 * 这里实现 code.js 用到的 API 子集（createFrame/createText/createRectangle/
 * createEllipse/createPage/createPaintStyle/createTextStyle/loadFontAsync/
 * notify/closePlugin/viewport），跑完后校验：
 *   1. 不抛异常；
 *   2. 主界面帧右三栏（左栏 180 / 中栏 440 / 右栏剩余）；
 *   3. 生成了 Paint/Text 样式（token 化没漏）；
 *   4. 文案里出现「主控」「工作空间」等关键串（说明内容真画了）。
 *
 * Run: node scripts/figma-plugin/verify.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let nodeSeq = 0;
const allNodes = [];

function makeNode(type, extra = {}) {
  const node = {
    id: `${type}:${++nodeSeq}`,
    type,
    name: '',
    children: [],
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: 'INSIDE',
    cornerRadius: 0,
    layoutMode: 'NONE',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutAlign: 'INHERIT',
    layoutGrow: 0,
    clipsContent: false,
    characters: '',
    fontSize: 0,
    fontName: { family: 'Inter', style: 'Regular' },
    textAutoResize: 'NONE',
    lineHeight: 0,
    resize(w, h) {
      this.width = w;
      this.height = h;
    },
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
      return child;
    },
    remove() {},
    ...extra,
  };
  allNodes.push(node);
  return node;
}

const createdStyles = { paint: [], text: [] };

const figma = {
  createFrame: () => makeNode('FRAME'),
  createRectangle: () => makeNode('RECTANGLE'),
  createEllipse: () => makeNode('ELLIPSE'),
  createText: () => makeNode('TEXT'),
  createPage: () => makeNode('PAGE'),
  createPaintStyle: () => {
    const s = { name: '', paints: [] };
    createdStyles.paint.push(s);
    return s;
  },
  createTextStyle: () => {
    const s = { name: '', fontSize: 0, fontName: null };
    createdStyles.text.push(s);
    return s;
  },
  // 只认 Inter，用来顺带走一遍字体回退链（Windows 上并没有 Inter 之外的中文字体名）
  loadFontAsync: async ({ family, style }) => {
    if (family === 'Inter') return;
    throw new Error(`font not available: ${family} ${style}`);
  },
  setCurrentPageAsync: async (p) => {
    figma.currentPage = p;
  },
  currentPage: null,
  notify: (msg, opts) => {
    figma._notify = { msg, opts };
  },
  closePlugin: () => {
    figma._closed = true;
  },
  viewport: { scrollAndZoomIntoView: () => {} },
};

const code = fs.readFileSync(path.join(here, 'code.js'), 'utf8');
const ctx = vm.createContext({ figma, console, setTimeout, clearTimeout });

async function run() {
  await vm.runInContext(code, ctx);
  // code.js 的 main() 是 async 且自带 .catch，给它一拍完成
  await new Promise((r) => setTimeout(r, 30));

  const fail = [];
  const ok = (label, cond, detail) => {
    if (cond) console.log(`  PASS  ${label}`);
    else {
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
      fail.push(label);
    }
  };

  if (figma._notify?.opts?.error) throw new Error(`插件内部报错：${figma._notify.msg}`);

  const screen = allNodes.find((n) => n.type === 'FRAME' && n.name.startsWith('工作台 / 主界面'));
  ok('生成主界面帧', Boolean(screen));
  if (!screen) throw new Error('没有主界面帧，后续断言无法继续');

  ok('主界面 1440×900', screen.width === 1440 && screen.height === 900, `${screen.width}×${screen.height}`);
  ok('三栏就位', screen.children.length === 3, `实际 ${screen.children.length} 栏`);

  const [rail, chat, host] = screen.children;
  ok('左栏 180 宽', rail.width === 180, String(rail.width));
  ok('中栏 440 宽', chat.width === 440, String(chat.width));
  ok('右栏吃掉剩余宽度', host.width === 1440 - 180 - 440, String(host.width));

  const texts = allNodes.filter((n) => n.type === 'TEXT').map((n) => n.characters);
  const joined = texts.join('\n');
  ['主控', '工作空间', '文献侦察', 'ablation_table.xlsx', '跟主控说这件事要怎么做…'].forEach((needle) => {
    ok(`文案含「${needle}」`, joined.includes(needle));
  });

  ok('Paint 样式已建（10 条）', createdStyles.paint.length === 10, String(createdStyles.paint.length));
  ok('Text 样式已建（5 条）', createdStyles.text.length === 5, String(createdStyles.text.length));
  ok('插件正常收尾', figma._closed === true);

  console.log(`\n节点总数 ${allNodes.length}（frame ${allNodes.filter((n) => n.type === 'FRAME').length} / text ${texts.length}）`);
  if (fail.length) {
    console.error(`\nFAILED: ${fail.length} 项`);
    process.exit(1);
  }
  console.log('\nALL PASS');
}

run().catch((e) => {
  console.error('VERIFY ERROR:', e.message);
  process.exit(1);
});

/**
 * verify-workshop.mjs — 用 mock 的 figma API 离线跑一遍 workshop.js。
 *
 * Figma 插件只能在它自己的沙箱里运行，本机没有 Figma 时无法端到端。这里实现
 * workshop.js 用到的 API 子集，跑完后校验结构，保证用户导入插件后不会一点就炸。
 *
 * Run: node scripts/figma-plugin/verify-workshop.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let seq = 0;
const all = [];

function makeNode(type) {
  const n = {
    id: `${type}:${++seq}`,
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
    cornerRadius: 0,
    dashPattern: [],
    layoutMode: 'NONE',
    layoutSizingHorizontal: 'FIXED',
    layoutSizingVertical: 'FIXED',
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
    layoutPositioning: 'AUTO',
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
    remove() {
      this.removed = true;
    },
  };
  all.push(n);
  return n;
}

const page = makeNode('PAGE');
page.selection = [];

const figma = {
  createFrame: () => makeNode('FRAME'),
  createText: () => makeNode('TEXT'),
  createRectangle: () => makeNode('RECTANGLE'),
  createLine: () => makeNode('LINE'),
  loadFontAsync: async ({ family }) => {
    if (family === 'Inter') return;
    throw new Error(`font not available: ${family}`);
  },
  currentPage: page,
  viewport: { scrollAndZoomIntoView: () => {} },
  notify: (msg, opts) => {
    figma._notify = { msg, opts };
  },
  closePlugin: () => {
    figma._closed = true;
  },
};

const code = fs.readFileSync(path.join(here, 'workshop.js'), 'utf8');
const ctx = vm.createContext({ figma, console, setTimeout, clearTimeout });

const fail = [];
const ok = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    fail.push(label);
  }
};

async function run() {
  await vm.runInContext(code, ctx);
  await new Promise((r) => setTimeout(r, 60));

  if (figma._notify?.opts?.error) throw new Error(`插件内部报错：${figma._notify.msg}`);

  const roots = page.children.filter((n) => n.type === 'FRAME');
  const shots = roots.filter((n) => n.name.includes('四栏工作台'));
  const closeup = roots.filter((n) => n.name.includes('编队面板特写'));

  ok('生成三套工作台', shots.length === 3, `实际 ${shots.length}`);
  ok('生成一张编队特写', closeup.length === 1, `实际 ${closeup.length}`);

  for (const s of shots) {
    ok(`${s.name} 尺寸 1440×900`, s.width === 1440 && s.height === 900, `${s.width}×${s.height}`);
    const names = s.children.map((c) => c.name);
    ok(`${s.name} 四栏就位`, names.length >= 4, names.join(' | '));
    ok(
      `${s.name} 含 Rail/List/Chat/Panel`,
      ['Rail · 全局导航', 'List · 会话列表', 'Chat · 对话区', 'Panel · 执行详情'].every((k) =>
        names.includes(k),
      ),
      names.join(' | '),
    );
  }

  if (closeup.length) {
    const c = closeup[0];
    ok('特写 340×900', c.width === 340 && c.height === 900, `${c.width}×${c.height}`);
    const secs = all.filter((n) => n.name.startsWith('sec · '));
    ok('特写三节齐', secs.length === 3, String(secs.length));
  }

  const texts = all.filter((n) => n.type === 'TEXT').map((n) => n.characters);
  const joined = texts.join('\n');
  ['DeepSeek', '查看编队', '策略举证', '1 道审批门', 'Enter 发送'].forEach((needle) =>
    ok(`文案含「${needle}」`, joined.includes(needle)),
  );

  const dagNodes = all.filter((n) => n.name.startsWith('node · '));
  ok('DAG 六节点', dagNodes.length === 6, String(dagNodes.length));

  const tabs = all.filter((n) => n.name.startsWith('tab · '));
  ok('tab 三枚 ×（3 套 + 特写）', tabs.length === 12, String(tabs.length));

  ok('插件正常收尾', figma._closed === true);

  console.log(
    `\n节点总数 ${all.length}（frame ${all.filter((n) => n.type === 'FRAME').length} / text ${texts.length}）`,
  );
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

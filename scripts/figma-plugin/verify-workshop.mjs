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
  const settings = roots.filter((n) => n.name.includes('设置 / '));
  const landing = roots.filter((n) => n.name.includes('落地页'));
  const dagBoard = roots.filter((n) => n.name.includes('DAG 结合版'));

  ok('生成三套工作台', shots.length === 3, `实际 ${shots.length}`);
  ok('生成一张编队特写', closeup.length === 1, `实际 ${closeup.length}`);
  ok('生成一张设置面板', settings.length === 1, `实际 ${settings.length}`);
  ok('生成一张落地页', landing.length === 1, `实际 ${landing.length}`);
  ok('生成一张 DAG 结合版画板', dagBoard.length === 1, `实际 ${dagBoard.length}`);
  if (dagBoard.length) {
    const db = dagBoard[0];
    ok('DAG 画板 1440×1080', db.width === 1440 && db.height === 1080, `${db.width}×${db.height}`);
    const body = db.children.find((c) => c.name === 'body');
    const viewNames = body ? body.children.map((c) => c.name) : [];
    ok('DAG 三视图同源（主视图+侧栏）', viewNames.includes('DAG主视图') && viewNames.includes('侧栏'), viewNames.join(' | '));
  }
  if (landing.length) {
    const lp = landing[0];
    ok('落地页 1440 宽', lp.width === 1440, `${lp.width}`);
    const lpNames = lp.children.map((c) => c.name);
    ['lp-nav', 'lp-hero', 'lp-pain', 'lp-workflow', 'lp-agents', 'lp-know', 'lp-slogan', 'lp-cases', 'lp-faq', 'lp-pricing', 'lp-footer'].forEach((k) =>
      ok(`落地页含 ${k}`, lpNames.includes(k), lpNames.join(' | ')),
    );
  }
  if (settings.length) {
    const st = settings[0];
    ok('设置 940×672', st.width === 940 && st.height === 672, `${st.width}×${st.height}`);
    const names = st.children.map((c) => c.name);
    ok('设置左导航 + 右内容', names.includes('Settings · Nav') && names.includes('Settings · Main'), names.join(' | '));
  }

  const ceoAvatars = all.filter((n) => n.name === '主控头像 · CEO');
  ok(
    '三套工作台会话顶栏均有主控头像（CEO 脸）',
    ceoAvatars.length === 3,
    `实际 ${ceoAvatars.length}`,
  );

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
  ['DeepSeek', '查看编队', '策略举证', '1 道审批门', 'Enter 发送', '界面密度', '数据与隐私'].forEach((needle) =>
    ok(`文案含「${needle}」`, joined.includes(needle)),
  );
  ['论文团队。', '为一人工信 / 科研团队打造', 'RESEARCH SCENARIOS', 'CLOSED-LOOP WORKFLOW', 'AGENT CLUSTER', 'HUMAN IN THE LOOP', 'YOUR LAB. YOUR METHOD. YOUR AI TEAM.', '工作室版', '常见问题'].forEach((needle) =>
    ok(`落地页文案含「${needle}」`, joined.includes(needle)),
  );
  ['DAG · 协作编排与执行追踪', '编排 DAG', '最长路径分层', '协作策略矩阵', '执行时间线', '人工审批门', '迭代环', '直接交接', '审批门'].forEach((needle) =>
    ok(`DAG 文案含「${needle}」`, joined.includes(needle)),
  );
  const dagLayerNodes = all.filter((n) => n.name.startsWith('DAG节点 / '));
  ok('DAG 画板 8 个编排节点', dagLayerNodes.length === 8, String(dagLayerNodes.length));
  const edgeHs = all.filter((n) => n.name === 'edge-h');
  const edgeVs = all.filter((n) => n.name === 'edge-v');
  ok('DAG 正交连线（水平+竖直）', edgeHs.length >= 5 && edgeVs.length >= 2, `h=${edgeHs.length} v=${edgeVs.length}`);
  const dashes = all.filter((n) => Array.isArray(n.dashPattern) && n.dashPattern.length > 0);
  ok('DAG 审批/策略虚线', dashes.length >= 2, String(dashes.length));

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

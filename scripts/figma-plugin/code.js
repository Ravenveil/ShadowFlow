/**
 * ShadowFlow 论文平台 · 代码导出到 Figma（2026-11-20）
 *
 * 为什么是插件而不是 MCP：
 *   Figma 官方 MCP 是单向的（Figma → 代码）。没有任何 API 能把代码写进 .fig
 *   文件——Figma REST 对文档内容是只读的，写节点只能通过 Figma 插件运行时。
 *   所以这里生成一个本地插件：在 Figma 里 Run 一次，界面就以可编辑图层
 *   （frame + text + 命名层 + Paint/Text Style）落到新页面。
 *
 * 设计源是真实代码，不是凭想象画的：
 *   左栏宽 180（NeoApp RAIL_DEFAULT_WIDTH）
 *   聊天列 440（neo.css .neo-main--run 的 flex-basis）
 *   颜色全取 index.css 的 day 主题令牌：
 *     --t-bg #F3F3F3 / --t-panel #FFFFFF / --t-panel-2 #FAFAFA
 *     --t-panel-3 #F5F5F5 / --t-fg #0A0A0A / --t-border #ECECEA
 *     --t-accent #171717 / --t-ok #30C093 / --t-link #0F766E
 *   文案取自 NeoRail / NeoChat / NeoHost 的现有字符串。
 *
 * 用法：
 *   Figma 桌面版 → 菜单 Plugins → Development → Import plugin from manifest…
 *   → 选本目录的 manifest.json → 再 Plugins → Development → 运行本插件。
 *   会新建一页「ShadowFlow · 论文平台（代码导出）」，内含 1440×900 主界面帧。
 *
 * 边界（诚实说明）：
 *   - 图标是占位方块（代码里用 lucide-react，插件内没有图标资源）；
 *   - 只画主界面一屏，不含设置/知识库/定时任务等子页；
 *   - 之后改视觉请直接在 Figma 改，再把结论回写到 neo.css 的令牌，不要双向同步。
 */

/* ── 设计令牌（与 index.css day 主题同值） ───────────────────────────────── */

var C = {
  bg: '#F3F3F3',
  panel: '#FFFFFF',
  panel2: '#FAFAFA',
  panel3: '#F5F5F5',
  fg: '#0A0A0A',
  muted: '#6B6B70',
  border: '#ECECEA',
  accent: '#171717',
  accentInk: '#FAFAFA',
  ok: '#30C093',
  link: '#0F766E',
};

var RAIL_W = 180;
var CHAT_W = 440;
var SCREEN_W = 1440;
var SCREEN_H = 900;

/* ── 工具 ─────────────────────────────────────────────────────────────────── */

function rgb(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function solid(hex) {
  return [{ type: 'SOLID', color: rgb(hex) }];
}

var FONT = { regular: null, bold: null };

/** 字体链：优先系统中文字体，退到 Inter（缺字会显示豆腐块，但不阻断）。 */
async function loadFonts() {
  var families = ['Microsoft YaHei', 'Noto Sans SC', 'PingFang SC', 'Source Han Sans SC', 'Inter'];
  var styles = ['Regular', 'Bold'];
  for (var i = 0; i < families.length; i++) {
    var fam = families[i];
    try {
      await figma.loadFontAsync({ family: fam, style: styles[0] });
      var boldStyle = styles[1];
      try {
        await figma.loadFontAsync({ family: fam, style: boldStyle });
      } catch (e) {
        boldStyle = styles[0]; // 无 Bold 就用 Regular 顶替
      }
      FONT.regular = { family: fam, style: styles[0] };
      FONT.bold = { family: fam, style: boldStyle };
      return fam;
    } catch (e2) {
      /* 试下一个 family */
    }
  }
  throw new Error('没有可用字体：请先安装 Inter 或任意中文字体');
}

function rect(name, w, h, color, radius) {
  var r = figma.createRectangle();
  r.name = name;
  r.resize(w, h);
  r.fills = solid(color);
  if (radius) r.cornerRadius = radius;
  return r;
}

/** 占位图标槽：真实产品用 lucide 图标，这里只标出位置与尺寸。 */
function iconSlot(size) {
  var r = figma.createRectangle();
  r.name = '图标占位';
  r.resize(size, size);
  r.cornerRadius = 4;
  r.fills = [{ type: 'SOLID', color: rgb(C.muted), opacity: 0.22 }];
  return r;
}

function text(name, chars, size, color, weight) {
  var t = figma.createText();
  t.name = name;
  t.fontName = weight === 'bold' ? FONT.bold : FONT.regular;
  t.characters = chars;
  t.fontSize = size;
  t.fills = solid(color);
  t.textAutoResize = 'HEIGHT';
  t.lineHeight = { unit: 'PIXELS', value: Math.round(size * 1.55) };
  return t;
}

function row(name, gap) {
  var f = figma.createFrame();
  f.name = name;
  f.layoutMode = 'HORIZONTAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.counterAxisAlignItems = 'CENTER';
  f.itemSpacing = gap || 8;
  f.fills = [];
  return f;
}

function col(name, gap) {
  var f = figma.createFrame();
  f.name = name;
  f.layoutMode = 'VERTICAL';
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = gap || 0;
  f.fills = [];
  return f;
}

function fill(frame, color, radius) {
  frame.fills = solid(color);
  if (radius) frame.cornerRadius = radius;
  return frame;
}

function pad(frame, top, right, bottom, left) {
  frame.paddingTop = top;
  frame.paddingRight = right;
  frame.paddingBottom = bottom;
  frame.paddingLeft = left;
  return frame;
}

/* ── 样式表（让设计稿可换色/换字号，而不是一堆硬编码填充） ───────────────── */

function makePaintStyles() {
  var map = {
    'ShadowFlow/底色/rail': C.bg,
    'ShadowFlow/底色/内容': C.panel,
    'ShadowFlow/底色/次级': C.panel2,
    'ShadowFlow/底色/气泡': C.panel3,
    'ShadowFlow/文字/主': C.fg,
    'ShadowFlow/文字/次': C.muted,
    'ShadowFlow/线/分隔': C.border,
    'ShadowFlow/主色/强调': C.accent,
    'ShadowFlow/状态/完成': C.ok,
    'ShadowFlow/文字/链接': C.link,
  };
  Object.keys(map).forEach(function (name) {
    var s = figma.createPaintStyle();
    s.name = name;
    s.paints = solid(map[name]);
  });
}

function makeTextStyles() {
  var defs = [
    ['ShadowFlow/正文/13', 13, 'regular'],
    ['ShadowFlow/正文/13 粗', 13, 'bold'],
    ['ShadowFlow/次要/12', 12, 'regular'],
    ['ShadowFlow/标题/15', 15, 'bold'],
    ['ShadowFlow/大标题/20', 20, 'bold'],
  ];
  defs.forEach(function (d) {
    var s = figma.createTextStyle();
    s.name = d[0];
    s.fontName = d[2] === 'bold' ? FONT.bold : FONT.regular;
    s.fontSize = d[1];
  });
}

/* ── 组件 ─────────────────────────────────────────────────────────────────── */

/** 左栏一行：图标槽 + 名称（+ 可选计数）。 */
function navRow(label, active, count) {
  var r = row('导航行 / ' + label, 8);
  r.paddingTop = 7;
  r.paddingBottom = 7;
  r.paddingLeft = 8;
  r.paddingRight = 8;
  r.cornerRadius = 8;
  r.fills = active ? solid(C.panel3) : [];
  r.appendChild(iconSlot(15));
  var t = text('名称', label, 13, active ? C.fg : C.fg, active ? 'bold' : 'regular');
  t.layoutGrow = 1;
  r.appendChild(t);
  if (count) r.appendChild(text('计数', String(count), 12, C.muted));
  return r;
}

/** 会话行：状态点 + 标题 + 时间。 */
function conversationRow(title, subtitle, active) {
  var r = row('会话 / ' + title, 8);
  r.paddingTop = 7;
  r.paddingBottom = 7;
  r.paddingLeft = 8;
  r.paddingRight = 8;
  r.cornerRadius = 8;
  r.fills = active ? solid(C.panel3) : [];

  var dot = figma.createEllipse();
  dot.name = '状态点';
  dot.resize(6, 6);
  dot.fills = solid(active ? C.accent : C.muted);
  r.appendChild(dot);

  var stack = col('文本', 2);
  stack.layoutGrow = 1;
  stack.appendChild(text('标题', title, 13, C.fg));
  if (subtitle) stack.appendChild(text('副标题', subtitle, 11, C.muted));
  r.appendChild(stack);
  return r;
}

/**
 * 聊天气泡：主控（左）与用户（右）。
 *
 * 对齐方式用「外层满宽 row + primaryAxisAlignItems MIN/MAX」实现，而不是给
 * 气泡设 layoutAlign——后者会被父级 counterAxisAlignItems 覆盖，两边互相打架。
 */
function bubble(role, name, body) {
  var outer = figma.createFrame();
  outer.name = '消息行 / ' + role;
  outer.layoutMode = 'HORIZONTAL';
  outer.primaryAxisSizingMode = 'FIXED';
  outer.counterAxisSizingMode = 'AUTO';
  outer.primaryAxisAlignItems = role === 'lead' ? 'MIN' : 'MAX';
  outer.counterAxisAlignItems = 'MIN';
  outer.layoutAlign = 'STRETCH';
  outer.fills = [];

  var wrap = col('消息 / ' + role, 4);
  wrap.counterAxisSizingMode = 'AUTO';

  var meta = row('署名', 6);
  if (role === 'lead') {
    var av = figma.createEllipse();
    av.name = '主控头像';
    av.resize(20, 20);
    av.fills = solid(C.accent);
    meta.appendChild(av);
  }
  meta.appendChild(text('署名文本', name, 12, role === 'lead' ? C.fg : C.muted, 'bold'));
  wrap.appendChild(meta);

  var b = figma.createFrame();
  b.name = '气泡体';
  b.layoutMode = 'VERTICAL';
  b.primaryAxisSizingMode = 'AUTO';
  b.counterAxisSizingMode = 'FIXED';
  b.resize(Math.round(CHAT_W * 0.78), 10);
  b.paddingTop = 10;
  b.paddingBottom = 10;
  b.paddingLeft = 12;
  b.paddingRight = 12;
  b.cornerRadius = 12;
  b.fills = solid(role === 'lead' ? C.panel3 : C.panel);
  if (role !== 'lead') {
    b.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
    b.strokeWeight = 1;
  }
  var t = text('正文', body, 13, C.fg);
  t.layoutAlign = 'STRETCH';
  b.appendChild(t);
  wrap.appendChild(b);

  outer.appendChild(wrap);
  return outer;
}

/** 角色 chip：主控带的角色（仅展示，点开是派活对象）。 */
function roleChip(label, on) {
  var c = row('角色 / ' + label, 6);
  c.paddingTop = 3;
  c.paddingBottom = 3;
  c.paddingLeft = 8;
  c.paddingRight = 8;
  c.cornerRadius = 999;
  c.fills = solid(on ? C.panel3 : C.panel2);
  c.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  c.strokeWeight = 1;
  c.appendChild(text('角色名', label, 11, on ? C.fg : C.muted));
  return c;
}

/* ── 三栏 ─────────────────────────────────────────────────────────────────── */

function buildRail() {
  var rail = figma.createFrame();
  rail.name = '左栏 / 导航（180）';
  rail.resize(RAIL_W, SCREEN_H);
  rail.layoutMode = 'VERTICAL';
  rail.primaryAxisSizingMode = 'FIXED';
  rail.counterAxisSizingMode = 'FIXED';
  rail.itemSpacing = 2;
  rail.paddingTop = 12;
  rail.paddingBottom = 12;
  rail.paddingLeft = 10;
  rail.paddingRight = 10;
  rail.fills = solid(C.bg);

  // 品牌
  var brand = row('品牌', 8);
  brand.paddingBottom = 10;
  var logo = figma.createRectangle();
  logo.name = 'Logo';
  logo.resize(22, 22);
  logo.cornerRadius = 6;
  logo.fills = solid(C.accent);
  brand.appendChild(logo);
  brand.appendChild(text('产品名', 'ShadowFlow', 14, C.fg, 'bold'));
  rail.appendChild(brand);

  // 一级导航
  rail.appendChild(navRow('知识库', false));
  rail.appendChild(navRow('定时任务', false));
  rail.appendChild(navRow('搜索', false));

  // 列表区：项目分组
  var section = col('列表区', 4);
  section.layoutAlign = 'STRETCH';
  section.paddingTop = 14;

  var label = row('分组标题 / 博士论文', 6);
  label.paddingBottom = 4;
  label.appendChild(iconSlot(12));
  var lt = text('分组名', '博士论文', 12, C.muted, 'bold');
  lt.layoutGrow = 1;
  label.appendChild(lt);
  section.appendChild(label);

  section.appendChild(conversationRow('第 3 章实验', '主控 · 12 分钟前', true));
  section.appendChild(conversationRow('文献综述', '主控 · 昨天', false));
  section.appendChild(conversationRow('投会议', '主控 · 11-18', false));

  var group2 = row('分组标题 / 团队', 6);
  group2.paddingTop = 10;
  group2.paddingBottom = 4;
  group2.appendChild(iconSlot(12));
  var g2 = text('分组名', '论文团队', 12, C.muted, 'bold');
  g2.layoutGrow = 1;
  group2.appendChild(g2);
  section.appendChild(group2);

  section.appendChild(conversationRow('组会汇报', '6 个角色 · 今天', false));
  rail.appendChild(section);

  // 底部：设置 + 账号
  var foot = col('底部', 6);
  foot.layoutAlign = 'STRETCH';
  foot.appendChild(navRow('设置', false));

  var me = row('账号', 8);
  me.paddingTop = 8;
  me.paddingLeft = 8;
  var avatar = figma.createEllipse();
  avatar.name = '头像';
  avatar.resize(24, 24);
  avatar.fills = solid(C.panel3);
  avatar.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  me.appendChild(avatar);
  var meStack = col('账号文本', 1);
  meStack.layoutGrow = 1;
  meStack.appendChild(text('姓名', '王佳音', 12, C.fg));
  meStack.appendChild(text('角色', '论文平台 · 本地', 10, C.muted));
  me.appendChild(meStack);
  foot.appendChild(me);
  rail.appendChild(foot);

  return rail;
}

function buildChat() {
  var chat = figma.createFrame();
  chat.name = '中栏 / 对话（440）';
  chat.resize(CHAT_W, SCREEN_H);
  chat.layoutMode = 'VERTICAL';
  chat.primaryAxisSizingMode = 'FIXED';
  chat.counterAxisSizingMode = 'FIXED';
  chat.fills = solid(C.panel);
  chat.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  chat.strokeWeight = 1;
  chat.strokeAlign = 'INSIDE';

  // 头部：主控 + 角色
  var head = col('头部', 8);
  head.layoutAlign = 'STRETCH';
  pad(head, 12, 14, 10, 14);
  head.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  head.strokeWeight = 1;
  head.strokeAlign = 'INSIDE';

  var titleRow = row('标题行', 8);
  var av = figma.createEllipse();
  av.name = '主控头像';
  av.resize(26, 26);
  av.fills = solid(C.accent);
  titleRow.appendChild(av);
  var titleStack = col('标题文本', 1);
  titleStack.layoutGrow = 1;
  titleStack.appendChild(text('名称', '主控', 15, C.fg, 'bold'));
  titleStack.appendChild(text('说明', '接需求 · 拆任务 · 派给角色', 11, C.muted));
  titleRow.appendChild(titleStack);
  titleRow.appendChild(roleChip('执行详情', false));
  head.appendChild(titleRow);

  var chips = row('角色名册', 6);
  chips.appendChild(roleChip('文献侦察', false));
  chips.appendChild(roleChip('方法设计', false));
  chips.appendChild(roleChip('实验执行', false));
  chips.appendChild(roleChip('写作主笔', false));
  head.appendChild(chips);
  chat.appendChild(head);

  // 消息流
  var thread = col('消息流', 14);
  thread.layoutAlign = 'STRETCH';
  thread.layoutGrow = 1;
  pad(thread, 16, 14, 16, 14);
  thread.counterAxisAlignItems = 'MIN';

  thread.appendChild(
    bubble(
      'lead',
      '主控',
      '这章实验要补两组消融。我先拆成三件事：文献侦察核一下基线论文的引用，方法设计确认对照组设置，实验执行跑 A/B 两版并出图。',
    ),
  );
  thread.appendChild(bubble('user', '我', '对照组就用去年那篇的设定，别自己改。'));
  thread.appendChild(
    bubble(
      'lead',
      '主控',
      '收到，按原文设定。已派活：文献侦察 @ 核对引用，实验执行 @ 按原设定跑，出图后我汇总成表。',
    ),
  );
  chat.appendChild(thread);

  // 输入区
  var composer = col('输入区', 8);
  composer.layoutAlign = 'STRETCH';
  pad(composer, 10, 14, 14, 14);
  composer.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  composer.strokeWeight = 1;
  composer.strokeAlign = 'INSIDE';

  var box = figma.createFrame();
  box.name = '输入框';
  box.layoutMode = 'HORIZONTAL';
  box.counterAxisSizingMode = 'AUTO';
  box.primaryAxisSizingMode = 'FIXED';
  box.resize(CHAT_W - 28, 40);
  box.counterAxisAlignItems = 'CENTER';
  box.paddingLeft = 12;
  box.paddingRight = 8;
  box.itemSpacing = 8;
  box.cornerRadius = 12;
  box.fills = solid(C.panel2);
  box.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  box.strokeWeight = 1;
  var ph = text('占位', '跟主控说这件事要怎么做…', 13, C.muted);
  ph.layoutGrow = 1;
  box.appendChild(ph);
  var send = figma.createFrame();
  send.name = '发送';
  send.resize(28, 28);
  send.cornerRadius = 8;
  send.fills = solid(C.accent);
  box.appendChild(send);
  composer.appendChild(box);
  composer.appendChild(text('提示', '⌘K 搜索 · @ 派活给角色', 11, C.muted));
  chat.appendChild(composer);

  return chat;
}

function buildHost() {
  var host = figma.createFrame();
  host.name = '右栏 / 工作空间（保留区）';
  host.layoutMode = 'VERTICAL';
  host.primaryAxisSizingMode = 'FIXED';
  host.counterAxisSizingMode = 'FIXED';
  host.resize(SCREEN_W - RAIL_W - CHAT_W, SCREEN_H);
  host.fills = solid(C.bg);
  host.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  host.strokeWeight = 1;
  host.strokeAlign = 'INSIDE';

  // 头部 + tab
  var head = col('头部', 10);
  head.layoutAlign = 'STRETCH';
  pad(head, 10, 12, 10, 12);
  head.appendChild(text('标题', '工作空间', 12, C.fg, 'bold'));

  var tabs = row('Tab 栏', 4);
  ['工作空间', '灵魂', '编队'].forEach(function (name, i) {
    var t = row('Tab / ' + name, 4);
    t.paddingTop = 4;
    t.paddingBottom = 4;
    t.paddingLeft = 8;
    t.paddingRight = 8;
    t.cornerRadius = 6;
    t.fills = i === 0 ? solid(C.panel) : [];
    t.appendChild(text('Tab 文本', name, 12, i === 0 ? C.fg : C.muted, i === 0 ? 'bold' : 'regular'));
    tabs.appendChild(t);
  });
  head.appendChild(tabs);
  host.appendChild(head);

  // 工具栏：路径
  var toolbar = row('工具栏', 8);
  toolbar.layoutAlign = 'STRETCH';
  pad(toolbar, 8, 12, 8, 12);
  var pathText = text('路径', '论文/第3章/artifacts', 11, C.muted);
  pathText.layoutGrow = 1;
  toolbar.appendChild(pathText);
  host.appendChild(toolbar);

  // 文件树
  var tree = col('文件树', 2);
  tree.layoutAlign = 'STRETCH';
  pad(tree, 4, 10, 10, 10);

  var files = [
    ['目录', 'artifacts'],
    ['文件', 'ablation_table.xlsx'],
    ['文件', 'fig_loss_curve.png'],
    ['文件', 'draft_ch3.md'],
    ['文件', 'refs.bib'],
  ];
  files.forEach(function (f) {
    var r = row('树行 / ' + f[1], 8);
    r.paddingTop = 5;
    r.paddingBottom = 5;
    r.paddingLeft = 6;
    r.paddingRight = 6;
    r.cornerRadius = 6;
    r.fills = f[1] === 'ablation_table.xlsx' ? solid(C.panel) : [];
    r.appendChild(iconSlot(12));
    var t = text('文件名', f[1], 12, C.fg);
    t.layoutGrow = 1;
    r.appendChild(t);
    tree.appendChild(r);
  });
  host.appendChild(tree);

  // 预览区
  var preview = figma.createFrame();
  preview.name = '预览 / 表格';
  preview.layoutMode = 'VERTICAL';
  preview.layoutAlign = 'STRETCH';
  preview.layoutGrow = 1;
  preview.cornerRadius = 10;
  preview.fills = solid(C.panel);
  preview.strokes = [{ type: 'SOLID', color: rgb(C.border) }];
  preview.strokeWeight = 1;
  pad(preview, 12, 12, 12, 12);
  preview.itemSpacing = 8;
  preview.appendChild(text('预览标题', 'ablation_table.xlsx', 12, C.fg, 'bold'));

  // 表头 + 三行（示意，真实内容由 SheetJS 解析后渲染）
  function tableRow(cells, header) {
    var r = row('表行', 0);
    r.layoutAlign = 'STRETCH';
    r.strokes = header ? [] : [{ type: 'SOLID', color: rgb(C.border) }];
    r.strokeWeight = 1;
    cells.forEach(function (c, i) {
      var cell = text('单元格', c, 11, header ? C.fg : C.fg, header ? 'bold' : 'regular');
      cell.layoutGrow = 1;
      r.appendChild(cell);
      if (i < cells.length - 1) {
        var sep = rect('列线', 1, 16, C.border, 0);
        r.appendChild(sep);
      }
    });
    return r;
  }
  preview.appendChild(tableRow(['Setting', 'Acc', 'Δ'], true));
  preview.appendChild(tableRow(['full', '78.4', '—'], false));
  preview.appendChild(tableRow(['w/o retrieval', '71.2', '-7.2'], false));
  preview.appendChild(tableRow(['w/o rerank', '74.9', '-3.5'], false));

  var wrap = figma.createFrame();
  wrap.name = '预览容器';
  wrap.layoutMode = 'VERTICAL';
  wrap.layoutAlign = 'STRETCH';
  wrap.layoutGrow = 1;
  wrap.itemSpacing = 0;
  wrap.paddingRight = 12;
  wrap.paddingLeft = 12;
  wrap.paddingBottom = 12;
  wrap.fills = [];
  wrap.appendChild(preview);
  host.appendChild(wrap);

  return host;
}

/* ── 主流程 ───────────────────────────────────────────────────────────────── */

async function main() {
  await loadFonts();
  makePaintStyles();
  makeTextStyles();

  var page = figma.createPage();
  page.name = 'ShadowFlow · 论文平台（代码导出）';
  // manifest 声明了 documentAccess: dynamic-page —— 这种模式下不能直接赋值
  // currentPage，必须走 setCurrentPageAsync，否则切页会被拒。
  if (typeof figma.setCurrentPageAsync === 'function') {
    await figma.setCurrentPageAsync(page);
  } else {
    figma.currentPage = page;
  }

  var screen = figma.createFrame();
  screen.name = '工作台 / 主界面 1440×900';
  screen.resize(SCREEN_W, SCREEN_H);
  screen.layoutMode = 'HORIZONTAL';
  screen.primaryAxisSizingMode = 'FIXED';
  screen.counterAxisSizingMode = 'FIXED';
  screen.itemSpacing = 0;
  screen.fills = solid(C.panel);
  screen.clipsContent = true;

  screen.appendChild(buildRail());
  screen.appendChild(buildChat());
  screen.appendChild(buildHost());

  screen.x = 0;
  screen.y = 0;
  figma.viewport.scrollAndZoomIntoView([screen]);

  figma.notify('已生成：工作台主界面（左栏 180 / 中栏 440 / 右栏保留）');
  figma.closePlugin();
}

main().catch(function (e) {
  figma.notify('生成失败：' + (e && e.message ? e.message : String(e)), { error: true, timeout: 8000 });
  figma.closePlugin();
});

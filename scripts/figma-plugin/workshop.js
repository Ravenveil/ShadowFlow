// ============================================================
// ShadowFlow 论文平台 · 四栏工作台 + 编队面板特写
// 离线 Figma 插件：不消耗 MCP 配额，按前端源码生成原生 auto-layout 图层
//
// 用法：
//   1. Figma 桌面版 → Plugins → Development → Import plugin from manifest…
//      选 scripts/figma-plugin/manifest-workshop.json
//   2. 打开「wjy7770302's team library」(U1cazeAqzrmMolbYqm6Ar9)
//   3. Plugins → Development → 运行 ShadowFlow · 生成四栏工作台
//
// 生成内容（同名旧 frame 会先删掉，避免重复堆叠）：
//   论文平台 · 四栏工作台 / 墨橙 / 净白 / 夜间   —— 1440×900
//   论文平台 · 编队面板特写                      —— 340×900
// ============================================================

const F = { reg: 'Regular', med: 'Medium', semi: 'Semi Bold', bold: 'Bold' };

const THEMES = [
  {
    key: 'ink',
    name: '论文平台 · 四栏工作台 / 墨橙',
    c: {
      bg: '#F6F3EC', elev: '#FFFFFF', sunken: '#EDE9DF', ink: '#14131A',
      ink2: '#3D3B45', ink3: '#7A7683', line: '#DDD8CB', line2: '#C9C2B1',
      accent: '#FF5E3A', accentSoft: '#FFEBE4', ok: '#2F8F5B',
      warn: '#D98324', danger: '#D6455E', deep: '#17162D',
    },
  },
  {
    key: 'clean',
    name: '论文平台 · 四栏工作台 / 净白',
    c: {
      bg: '#FFFFFF', elev: '#FFFFFF', sunken: '#F7F7F8', ink: '#1F2023',
      ink2: '#5A5D63', ink3: '#9A9DA3', line: '#ECEDEF', line2: '#DCDDE1',
      accent: '#6C5CE7', accentSoft: '#EFEDFD', ok: '#16A06A',
      warn: '#D98324', danger: '#E05252', deep: '#16161A',
    },
  },
  {
    key: 'night',
    name: '论文平台 · 四栏工作台 / 夜间',
    c: {
      bg: '#0F0F14', elev: '#17171E', sunken: '#1B1B23', ink: '#ECECF1',
      ink2: '#B5B6C1', ink3: '#7E7F8C', line: '#25252E', line2: '#32323C',
      accent: '#FF6B4A', accentSoft: '#2A1A16', ok: '#40C68C',
      warn: '#E6A04A', danger: '#F0727F', deep: '#08080C',
    },
  },
];

const RAIL = 208;
const LIST = 272;
const PANEL = 340;
const CHAT = 1440 - RAIL - LIST - PANEL;

function rgb(h) {
  const s = h.replace('#', '');
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255,
  };
}
function solid(h, opacity) {
  const f = { type: 'SOLID', color: rgb(h) };
  if (opacity !== undefined) f.opacity = opacity;
  return [f];
}
function box(name, w, h, color, opt) {
  const o = opt || {};
  const n = figma.createFrame();
  n.name = name;
  n.resize(w, h);
  n.fills = color ? solid(color) : [];
  if (o.radius !== undefined) n.cornerRadius = o.radius;
  if (o.stroke) {
    n.strokes = solid(o.stroke);
    n.strokeWeight = o.strokeWeight || 1;
  }
  n.clipsContent = !!o.clip;
  return n;
}
function autolayout(n, dir, gap, pad, align) {
  n.layoutMode = dir;
  n.itemSpacing = gap === undefined ? 0 : gap;
  const p = pad || [0, 0, 0, 0];
  n.paddingTop = p[0];
  n.paddingRight = p[1];
  n.paddingBottom = p[2];
  n.paddingLeft = p[3];
  n.primaryAxisSizingMode = 'FIXED';
  n.counterAxisSizingMode = 'FIXED';
  if (align) n.counterAxisAlignItems = align;
  return n;
}
function txt(str, size, color, weight, opt) {
  const o = opt || {};
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: weight || F.reg };
  t.characters = str;
  t.fontSize = size;
  t.fills = solid(color);
  if (o.lineHeight) t.lineHeight = { value: o.lineHeight, unit: 'PIXELS' };
  if (o.width) {
    t.textAutoResize = 'HEIGHT';
    t.resize(o.width, t.height);
  } else {
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
  }
  return t;
}
function row(name, w, h, color, gap, pad, opt) {
  const n = box(name, w, h, color, opt);
  autolayout(n, 'HORIZONTAL', gap, pad, 'CENTER');
  return n;
}
function col(name, w, h, color, gap, pad, opt) {
  const n = box(name, w, h, color, opt);
  autolayout(n, 'VERTICAL', gap, pad, 'MIN');
  return n;
}
/** 高度由内容决定（输入框这类必须自适应）。 */
function autoH(n) {
  n.primaryAxisSizingMode = 'AUTO';
  return n;
}
function avatar(size, color) {
  return box('Avatar', size, size, color, { radius: size / 2 });
}
function dotBar(w, h, color, radius) {
  return box('bar', w, h, color, { radius: radius === undefined ? 2 : radius });
}
function spacer() {
  const s = box('spacer', 1, 1, null);
  s.layoutGrow = 1;
  return s;
}
/** 空心图标位（线框方块），设计稿里代替具体 svg。 */
function iconBox(size, color, radius) {
  return box('ico', size, size, null, { radius: radius === undefined ? 3 : radius, stroke: color });
}

// ============ 通用段落 ============

function buildRail(C, root) {
  const rail = col('Rail · 全局导航', RAIL, 900, C.bg, 0, [0, 0, 0, 0]);
  rail.strokes = solid(C.line);
  rail.strokeWeight = 1;
  root.appendChild(rail);

  const brand = row('Brand', RAIL, 56, null, 8, [0, 16, 0, 16]);
  const mark = col('logo-mark', 14, 18, null, 2, [0, 0, 0, 0]);
  mark.appendChild(dotBar(4, 9, C.accent, 1));
  mark.appendChild(dotBar(4, 14, C.accent, 1));
  mark.appendChild(dotBar(4, 11, C.accent, 1));
  brand.appendChild(mark);
  brand.appendChild(txt('ShadowFlow', 15, C.ink, F.bold));
  rail.appendChild(brand);

  function navItem(label, active, badge) {
    const it = row('Nav · ' + label, RAIL - 16, 32, active ? C.elev : null, 9, [0, 10, 0, 10], {
      radius: 3,
    });
    if (active) {
      it.strokes = solid(C.line2);
      it.strokeWeight = 1;
    }
    it.appendChild(iconBox(15, active ? C.accent : C.ink3, 3));
    it.appendChild(txt(label, 13, active ? C.ink : C.ink2, active ? F.semi : F.reg));
    it.appendChild(spacer());
    if (badge) it.appendChild(txt(badge, 10, C.ink3, F.med));
    return it;
  }

  const navWrap = col('Nav', RAIL - 16, 200, null, 1, [0, 0, 0, 0]);
  navWrap.x = 8;
  navWrap.y = 58;
  navWrap.appendChild(navItem('对话', true));
  navWrap.appendChild(navItem('Agent 团队', false, '4'));
  navWrap.appendChild(navItem('知识库', false));
  navWrap.appendChild(navItem('数据看板', false));
  rail.appendChild(navWrap);

  const navWrap2 = col('Nav · 工作空间', RAIL - 16, 76, null, 1, [0, 0, 0, 0]);
  navWrap2.x = 8;
  navWrap2.y = 264;
  navWrap2.appendChild(txt('工作空间', 10, C.ink3, F.med));
  navWrap2.appendChild(navItem('项目', false));
  navWrap2.appendChild(navItem('定时任务', false));
  rail.appendChild(navWrap2);

  const foot = row('Rail · 设置', RAIL, 44, null, 8, [0, 16, 0, 16]);
  foot.x = 0;
  foot.y = 856;
  foot.appendChild(iconBox(15, C.ink3, 3));
  foot.appendChild(txt('设置', 12.5, C.ink2, F.reg));
  rail.appendChild(foot);
}

function buildList(C, root) {
  const list = col('List · 会话列表', LIST, 900, C.bg, 0, [0, 0, 0, 0]);
  list.strokes = solid(C.line);
  list.strokeWeight = 1;
  list.x = RAIL;
  root.appendChild(list);

  const head = row('List · Head', LIST, 56, null, 8, [0, 14, 0, 14]);
  head.appendChild(txt('←', 14, C.ink3, F.med));
  head.appendChild(txt('主控', 14, C.ink, F.bold));
  head.appendChild(spacer());
  head.appendChild(iconBox(14, C.ink3, 7));
  list.appendChild(head);

  const newBtn = row('Button · 新建', LIST - 28, 34, C.accent, 6, [0, 12, 0, 12], { radius: 3 });
  newBtn.appendChild(txt('+', 14, C.elev, F.bold));
  newBtn.appendChild(txt('新建', 12.5, C.elev, F.semi));
  const newWrap = col('new-wrap', LIST - 28, 42, null, 0, [0, 0, 8, 0]);
  newWrap.x = 14;
  newWrap.appendChild(newBtn);
  list.appendChild(newWrap);

  const search = row('Search', LIST - 28, 32, C.elev, 8, [0, 10, 0, 10], {
    radius: 3,
    stroke: C.line,
  });
  search.appendChild(iconBox(13, C.ink3, 6));
  search.appendChild(txt('搜索对话、项目或 Agent', 11.5, C.ink3, F.reg));
  search.appendChild(spacer());
  search.appendChild(txt('⌘K', 9.5, C.ink3, F.med));
  const searchWrap = col('search-wrap', LIST - 28, 40, null, 0, [0, 0, 8, 0]);
  searchWrap.x = 14;
  searchWrap.appendChild(search);
  list.appendChild(searchWrap);

  function sessCard(title, sub, time, active) {
    const c = col('Sess · ' + title, LIST - 28, 58, active ? C.elev : null, 3, [9, 10, 9, 10], {
      radius: 3,
      stroke: active ? C.line2 : null,
    });
    const top = row('top', LIST - 48, 20, null, 7, [0, 0, 0, 0]);
    top.appendChild(avatar(22, active ? C.accent : C.ink3));
    top.appendChild(txt(title, 12.5, C.ink, F.semi));
    top.appendChild(spacer());
    if (active) top.appendChild(box('live', 6, 6, C.ok, { radius: 3 }));
    c.appendChild(top);
    const meta = row('meta', LIST - 48, 14, null, 6, [0, 0, 0, 0]);
    meta.appendChild(txt(sub, 10, C.ink3, F.reg));
    meta.appendChild(spacer());
    meta.appendChild(txt(time, 9.5, C.ink3, F.med));
    c.appendChild(meta);
    return c;
  }

  const sess = col('Sessions', LIST - 28, 250, null, 2, [0, 0, 0, 0]);
  sess.x = 14;
  sess.appendChild(sessCard('主控', '全部调度 · 任务拆解与决策', '59 分钟前', true));
  sess.appendChild(sessCard('论文平台 · 综述写作组', '5 位成员 · 主控调度', '12 分钟前', false));
  sess.appendChild(sessCard('投稿战情室', '3 位成员 · 投稿流程', '昨天', false));
  sess.appendChild(sessCard('文献综述 · LLM Agent', '项目会话 · 已归档', '2 天前', false));
  list.appendChild(sess);

  const proj = col('项目与 AGENT', LIST - 28, 180, null, 2, [0, 0, 0, 0]);
  proj.x = 14;
  proj.appendChild(txt('项目与 AGENT', 10, C.ink3, F.med));
  ['▸ 实验设计与消融', '▸ 图表与配图', '▸ 投稿材料'].forEach(function (l) {
    const r = row('proj', LIST - 28, 28, null, 8, [0, 8, 0, 8]);
    r.appendChild(txt(l, 11.5, C.ink2, F.reg));
    proj.appendChild(r);
  });
  list.appendChild(proj);
  return list;
}

/** 输入区：照 frontend-paper 的新 Composer 画（工具条 7 个位 + hint 行）。 */
function buildComposer(C, width) {
  const outer = col('Composer', width, 0, null, 6, [0, 26, 14, 26]);
  autoH(outer);
  outer.counterAxisAlignItems = 'MIN';

  const cbox = col('composer-box', width - 52, 0, C.elev, 8, [10, 10, 8, 10], {
    radius: 3,
    stroke: C.line2,
  });
  autoH(cbox);
  cbox.layoutAlign = 'STRETCH';

  cbox.appendChild(
    txt('在群里发消息，主控会接住并派给角色 · @ 可直接点某位角色', 13, C.ink3, F.reg, {
      width: width - 74,
    }),
  );

  const bar = row('cbar', width - 74, 26, null, 4, [0, 0, 0, 0]);
  bar.layoutAlign = 'STRETCH';

  // 📎 附件
  bar.appendChild(iconBox(26, C.line, 3));
  // 知识包（未选时只有图标，所以是个方形 chip）
  bar.appendChild(iconBox(26, C.line, 3));
  // 模型 chip：图标 + 名称 + ⌄
  const mChip = row('model', 0, 26, C.sunken, 5, [0, 8, 0, 8], { radius: 13 });
  mChip.layoutSizingHorizontal = 'HUG';
  mChip.appendChild(box('dot', 10, 10, C.accent, { radius: 3 }));
  mChip.appendChild(txt('DeepSeek', 11.5, C.ink2, F.med));
  mChip.appendChild(txt('⌄', 10, C.ink3, F.med));
  bar.appendChild(mChip);
  // / 与 @
  bar.appendChild(iconBox(26, C.line, 3));
  const at = row('at', 26, 26, null, 0, [0, 0, 0, 0], { radius: 3 });
  at.appendChild(txt('@', 13, C.ink3, F.med));
  bar.appendChild(at);
  bar.appendChild(spacer());
  // 快捷键
  bar.appendChild(iconBox(26, C.line, 3));
  // 发送
  const send = row('send', 30, 30, C.accent, 0, [0, 0, 0, 0], { radius: 15 });
  send.appendChild(txt('↑', 13, C.elev, F.bold));
  bar.appendChild(send);
  cbox.appendChild(bar);
  outer.appendChild(cbox);

  const hint = row('hint', width - 52, 16, null, 8, [0, 2, 0, 2]);
  hint.layoutAlign = 'STRETCH';
  hint.appendChild(txt('Enter 发送 · Shift + Enter 换行', 9.5, C.ink3, F.reg));
  hint.appendChild(spacer());
  hint.appendChild(txt('@ 提及 · / 命令', 9.5, C.ink3, F.reg));
  outer.appendChild(hint);
  return outer;
}

function buildChat(C, root) {
  const chat = col('Chat · 对话区', CHAT, 900, C.bg, 0, [0, 0, 0, 0]);
  chat.x = RAIL + LIST;
  root.appendChild(chat);

  const head = row('Chat · Head', CHAT, 56, null, 10, [0, 18, 0, 18]);
  head.strokes = solid(C.line);
  head.strokeWeight = 1;
  head.appendChild(txt('主控', 15, C.ink, F.bold));
  head.appendChild(txt('接需求、拆任务、派活、汇总产出', 11, C.ink3, F.reg));
  head.appendChild(spacer());
  head.appendChild(box('stack', 46, 20, null, { radius: 10, stroke: C.line }));
  head.appendChild(txt('5 位', 11, C.ink2, F.semi));
  head.appendChild(iconBox(16, C.ink3, 3));
  chat.appendChild(head);

  const thread = col('Thread', CHAT, 660, null, 18, [22, 26, 0, 26]);
  const msgHead = row('msg · 主控', CHAT - 52, 22, null, 8, [0, 0, 0, 0]);
  msgHead.appendChild(avatar(24, C.accent));
  msgHead.appendChild(txt('主控', 12.5, C.ink, F.bold));
  msgHead.appendChild(txt('17:03', 10, C.ink3, F.med));
  thread.appendChild(msgHead);
  thread.appendChild(
    txt(
      '明白。我按「先定骨架、再填内容、最后过审」三段来推。先让 PI 把论证主线拉出来，再分给主笔和两位审查。这一轮我盯闭环，你不用逐个 @ 人。',
      13,
      C.ink2,
      F.reg,
      { lineHeight: 22, width: CHAT - 90 },
    ),
  );

  const runCard = col('Run · 论文写作流水线', CHAT - 52, 108, C.elev, 0, [0, 0, 0, 0], {
    radius: 3,
    stroke: C.line,
  });
  const runHead = row('run-head', CHAT - 52, 40, null, 8, [0, 11, 0, 11]);
  runHead.appendChild(box('ico', 20, 20, C.sunken, { radius: 2 }));
  runHead.appendChild(txt('论文写作流水线', 12.5, C.ink, F.semi));
  runHead.appendChild(txt('运行 4m 15s · 6 个步骤', 10.5, C.ink3, F.reg));
  runHead.appendChild(spacer());
  runHead.appendChild(txt('›', 12, C.ink3, F.med));
  runCard.appendChild(runHead);
  const chips = row('chips', CHAT - 74, 28, null, 5, [0, 11, 0, 11]);
  ['PI · 已完成', '章节主笔 · 已完成', '引用审查 · 进行中', '+2'].forEach(function (l, i) {
    const ch = row('chip', 0, 21, i === 2 ? C.accentSoft : C.sunken, 4, [0, 8, 0, 8], {
      radius: 10,
    });
    ch.layoutSizingHorizontal = 'HUG';
    ch.appendChild(box('dot', 8, 8, i === 2 ? C.accent : C.ok, { radius: 4 }));
    ch.appendChild(txt(l, 10.5, i === 2 ? C.accent : C.ink2, F.med));
    chips.appendChild(ch);
  });
  runCard.appendChild(chips);
  runCard.appendChild(box('pad', 10, 8, null));
  thread.appendChild(runCard);

  const team = col('Team · 3 位团队成员', CHAT - 52, 150, C.elev, 0, [0, 0, 0, 0], {
    radius: 3,
    stroke: C.line,
  });
  const teamHead = row('team-head', CHAT - 52, 36, null, 9, [0, 11, 0, 11]);
  teamHead.appendChild(avatar(18, C.accent));
  teamHead.appendChild(avatar(18, C.ink3));
  teamHead.appendChild(avatar(18, C.ok));
  teamHead.appendChild(txt('3 位团队成员', 12, C.ink2, F.semi));
  teamHead.appendChild(txt('2/3', 10, C.ink3, F.med));
  teamHead.appendChild(spacer());
  teamHead.appendChild(txt('⌄', 12, C.ink3, F.med));
  team.appendChild(teamHead);

  function teamRow(role, name, note, st, stColor) {
    const r = row('team-row', CHAT - 64, 34, null, 7, [0, 6, 0, 6]);
    r.appendChild(avatar(24, stColor));
    r.appendChild(txt(role, 12, C.ink, F.semi));
    r.appendChild(txt(name, 11.5, C.ink3, F.reg));
    r.appendChild(spacer());
    r.appendChild(txt(note, 10.5, C.ink3, F.reg, { width: 96 }));
    r.appendChild(
      box('mark', 13, 13, st === '已完成' ? C.ok : null, {
        radius: 7,
        stroke: st === '已完成' ? null : C.accent,
      }),
    );
    r.appendChild(txt(st, 10.5, st === '进行中' ? C.accent : C.ink3, F.med, { width: 40 }));
    r.appendChild(txt('›', 11, C.ink3, F.med));
    return r;
  }
  const teamBody = col('team-body', CHAT - 64, 108, null, 1, [0, 6, 0, 6]);
  teamBody.appendChild(teamRow('章节主笔', '程不宕', '4 节已交', '已完成', C.accent));
  teamBody.appendChild(teamRow('引用审查', '闻引', '38/52 条', '进行中', C.ink3));
  teamBody.appendChild(teamRow('方法复核', 'test-fix-worker', '口径已对齐', '已完成', C.ok));
  team.appendChild(teamBody);
  thread.appendChild(team);

  chat.appendChild(thread);
  chat.appendChild(buildComposer(C, CHAT));
  return chat;
}

/** 右栏「执行」tab：3 个 tab（执行 / 编队 / 产物）+ 6 步 + 用量。 */
function buildPanel(C, root) {
  const panel = col('Panel · 执行详情', PANEL, 900, C.bg, 0, [0, 0, 0, 0]);
  panel.strokes = solid(C.line);
  panel.strokeWeight = 1;
  panel.x = 1440 - PANEL;
  root.appendChild(panel);

  const head = row('Panel · Head', PANEL, 52, null, 8, [0, 16, 0, 16]);
  head.appendChild(txt('执行详情', 13, C.ink, F.bold));
  head.appendChild(spacer());
  head.appendChild(txt('✕', 12, C.ink3, F.med));
  panel.appendChild(head);

  const body = col('Panel · Body', PANEL, 848, null, 0, [0, 16, 0, 16]);
  panel.appendChild(body);

  const runBox = col('ACTIVE RUN', PANEL - 32, 118, C.elev, 8, [14, 14, 14, 14], {
    radius: 3,
    stroke: C.line2,
  });
  const rbTop = row('rb-top', PANEL - 60, 20, null, 6, [0, 0, 0, 0]);
  rbTop.appendChild(box('bolt', 18, 18, C.accent, { radius: 2 }));
  rbTop.appendChild(txt('ACTIVE RUN', 9, C.accent, F.semi));
  rbTop.appendChild(spacer());
  rbTop.appendChild(txt('69%', 11, C.accent, F.bold));
  runBox.appendChild(rbTop);
  runBox.appendChild(txt('LLM Agent 角色分工综述', 16, C.ink, F.bold));
  const meta = row('rb-meta', PANEL - 60, 16, null, 8, [0, 0, 0, 0]);
  meta.appendChild(txt('耗时 12m 40s', 9.5, C.ink3, F.reg));
  meta.appendChild(txt('3 / 6 Agent 已响应', 9.5, C.ink3, F.reg));
  runBox.appendChild(meta);
  const bar = row('rb-bar', PANEL - 60, 5, C.sunken, 0, [0, 0, 0, 0], { radius: 3 });
  bar.appendChild(box('filled', (PANEL - 60) * 0.69, 5, C.accent, { radius: 3 }));
  runBox.appendChild(bar);
  body.appendChild(runBox);

  const tabs = row('Panel · Tabs', PANEL - 32, 30, null, 5, [0, 0, 0, 0]);
  ['执行', '编队', '产物'].forEach(function (l, i) {
    const t = row('tab · ' + l, 0, 27, i === 0 ? C.ink : null, 0, [0, 12, 0, 12], {
      radius: 13,
      stroke: i === 0 ? null : C.line,
    });
    t.layoutSizingHorizontal = 'HUG';
    t.appendChild(txt(l, 11.5, i === 0 ? C.bg : C.ink2, i === 0 ? F.semi : F.reg));
    tabs.appendChild(t);
  });
  body.appendChild(tabs);

  const stepsHead = row('Steps · Head', PANEL - 32, 24, null, 6, [6, 0, 0, 0]);
  stepsHead.appendChild(txt('步骤 · 6', 11.5, C.ink2, F.semi));
  stepsHead.appendChild(spacer());
  stepsHead.appendChild(txt('查看编队', 10, C.accent, F.med));
  body.appendChild(stepsHead);

  function stepRow(n, name, agent, st, color) {
    const r = row('step', PANEL - 32, 52, C.elev, 8, [9, 10, 9, 10], {
      radius: 3,
      stroke: C.line,
    });
    r.appendChild(box('n', 18, 18, st === '进行中' ? C.accent : C.sunken, { radius: 9 }));
    const b = col('body', PANEL - 130, 32, null, 2, [0, 0, 0, 0]);
    b.appendChild(txt(name, 11, C.ink, F.semi, { width: PANEL - 130 }));
    const m = row('meta', PANEL - 130, 13, null, 5, [0, 0, 0, 0]);
    m.appendChild(avatar(12, color));
    m.appendChild(txt(agent, 9.5, C.ink3, F.reg));
    b.appendChild(m);
    r.appendChild(b);
    r.appendChild(spacer());
    r.appendChild(txt(st, 9.5, st === '进行中' ? C.accent : C.ok, F.med, { width: 40 }));
    return r;
  }
  const steps = col('Steps', PANEL - 32, 348, null, 5, [10, 0, 0, 0]);
  steps.appendChild(stepRow(1, '核准综述范围与目标会议', '主控', '已完成', C.accent));
  steps.appendChild(stepRow(2, '拉出论证主线与章节边界', 'PI', '已完成', C.accent));
  steps.appendChild(stepRow(3, '并行撰写 4 个 section', '章节主笔', '已完成', C.ink3));
  steps.appendChild(stepRow(4, '引用完整性与证据链核查', '引用审查', '进行中', C.ink3));
  steps.appendChild(stepRow(5, '方法与统计口径复核', '方法复核', '等待中', C.ink3));
  steps.appendChild(stepRow(6, '统一文风并合并成稿', '润色编辑', '等待中', C.ink3));
  body.appendChild(steps);

  const usage = col('Usage', PANEL - 32, 84, C.elev, 6, [12, 12, 12, 12], {
    radius: 3,
    stroke: C.line,
  });
  const uTop = row('u-top', PANEL - 56, 16, null, 6, [0, 0, 0, 0]);
  uTop.appendChild(txt('用量', 11, C.ink2, F.semi));
  uTop.appendChild(spacer());
  uTop.appendChild(txt('本会话', 9.5, C.ink3, F.reg));
  usage.appendChild(uTop);
  usage.appendChild(txt('上下文 62%', 14, C.ink, F.bold));
  usage.appendChild(txt('158k / 256k tokens', 10, C.ink3, F.reg));
  const uBar = row('u-bar', PANEL - 56, 5, C.sunken, 0, [0, 0, 0, 0], { radius: 3 });
  uBar.appendChild(box('f', (PANEL - 56) * 0.62, 5, C.accent, { radius: 3 }));
  usage.appendChild(uBar);
  body.appendChild(usage);
  return panel;
}

// ============ 编队面板特写（成员网格 + DAG + 策略举证） ============

const ROSTER = [
  ['主控', '主控'],
  ['PI', 'PI'],
  ['程不宕', '主笔'],
  ['闻引', '引用'],
  ['test-fix-worker', '复核'],
  ['顾清', '润色'],
];

const DAG_NODES = [
  { label: '拆解选题', role: '定论点边界', x: 84, y: 0, w: 140, h: 44, st: 'done' },
  { label: '章节骨架', role: '字数配比', x: 84, y: 66, w: 140, h: 44, st: 'done' },
  { label: '并行撰写', role: '4 个 section', x: 84, y: 132, w: 140, h: 44, st: 'done' },
  { label: '引用核查', role: '证据链 38/52', x: 16, y: 206, w: 132, h: 44, st: 'running' },
  { label: '方法复核', role: '统计口径', x: 160, y: 206, w: 132, h: 44, st: 'wait' },
  { label: '合并成稿', role: '统一文风', x: 84, y: 280, w: 140, h: 44, st: 'wait' },
];

/** 正交折线：先竖后横再竖（Figma 里比旋转线稳）。交接方式用颜色区分。 */
function edge(parent, x1, y1, x2, y2, color) {
  const seg = (x, y, w, h) => {
    const r = box('edge', w, h, color);
    r.x = x;
    r.y = y;
    parent.appendChild(r);
  };
  if (x1 === x2) {
    seg(x1 - 1, Math.min(y1, y2), 2, Math.abs(y2 - y1));
    return;
  }
  const midY = y1 + (y2 - y1) / 2;
  seg(x1 - 1, Math.min(y1, midY), 2, Math.abs(midY - y1));
  seg(Math.min(x1, x2), midY - 1, Math.abs(x2 - x1), 2);
  seg(x2 - 1, midY, 2, Math.abs(y2 - midY));
}

function buildTeamPanel(C, root, x, y) {
  const panel = col('Panel · 编队（特写）', PANEL, 900, C.bg, 0, [0, 0, 0, 0]);
  panel.strokes = solid(C.line);
  panel.strokeWeight = 1;
  panel.x = x;
  panel.y = y;
  root.appendChild(panel);

  const head = row('Panel · Head', PANEL, 52, null, 8, [0, 16, 0, 16]);
  head.appendChild(txt('执行详情', 13, C.ink, F.bold));
  head.appendChild(spacer());
  head.appendChild(txt('✕', 12, C.ink3, F.med));
  panel.appendChild(head);

  const tabsWrap = col('tabs-wrap', PANEL, 36, null, 0, [0, 16, 6, 16]);
  const tabs = row('Panel · Tabs', PANEL - 32, 30, null, 5, [0, 0, 0, 0]);
  ['执行', '编队', '产物'].forEach(function (l, i) {
    const t = row('tab · ' + l, 0, 27, i === 1 ? C.ink : null, 0, [0, 12, 0, 12], {
      radius: 13,
      stroke: i === 1 ? null : C.line,
    });
    t.layoutSizingHorizontal = 'HUG';
    t.appendChild(txt(l, 11.5, i === 1 ? C.bg : C.ink2, i === 1 ? F.semi : F.reg));
    tabs.appendChild(t);
  });
  tabsWrap.appendChild(tabs);
  panel.appendChild(tabsWrap);

  const body = col('Panel · Body', PANEL, 0, null, 0, [10, 16, 0, 16]);
  autoH(body);
  panel.appendChild(body);

  // ── 成员网格 ──
  const secHead = (title, meta) => {
    const h = row('sec-head', PANEL - 32, 22, null, 6, [0, 0, 6, 0]);
    h.appendChild(txt(title, 11.5, C.ink2, F.semi));
    h.appendChild(spacer());
    if (meta) h.appendChild(txt(meta, 10, C.ink3, F.reg));
    return h;
  };
  const rosterSec = col('sec · 成员', PANEL - 32, 0, null, 0, [0, 0, 12, 0]);
  autoH(rosterSec);
  rosterSec.appendChild(secHead('成员 · 6', '编队 · 主控派活'));
  const grid = row('roster-grid', PANEL - 32, 62, null, 0, [2, 0, 0, 0]);
  grid.counterAxisAlignItems = 'MIN';
  ROSTER.forEach(function (m) {
    const cell = col('cell · ' + m[1], (PANEL - 32) / 6, 58, null, 5, [0, 0, 0, 0]);
    cell.counterAxisAlignItems = 'CENTER';
    const face = box('face', 34, 34, null, { radius: 17 });
    face.appendChild(avatar(34, m[0] === '主控' ? C.accent : C.ink3));
    cell.appendChild(face);
    cell.appendChild(txt(m[1], 10.5, C.ink2, F.reg));
    grid.appendChild(cell);
  });
  rosterSec.appendChild(grid);
  body.appendChild(rosterSec);

  // ── DAG ──
  const dagSec = col('sec · 工作流', PANEL - 32, 0, null, 4, [0, 0, 14, 0]);
  autoH(dagSec);
  dagSec.appendChild(secHead('工作流', '6 节点 · 6 边'));
  const canvas = box('dag', 308, 348, null, { radius: 3 });
  canvas.clipsContent = false;
  // 连线先画，节点压在上面
  edge(canvas, 154, 44, 154, 66, C.ink3);
  edge(canvas, 154, 110, 154, 132, C.ink3);
  edge(canvas, 154, 176, 82, 206, C.ink3);
  edge(canvas, 154, 176, 226, 206, C.ink3);
  edge(canvas, 82, 250, 154, 280, C.warn);
  edge(canvas, 226, 250, 154, 280, C.accent);
  DAG_NODES.forEach(function (n) {
    const node = col('node · ' + n.label, n.w, n.h, C.elev, 3, [7, 10, 7, 10], {
      radius: 3,
      stroke: n.st === 'running' ? C.accent : C.line2,
    });
    node.x = n.x;
    node.y = n.y;
    node.appendChild(txt(n.label, 11.5, C.ink, F.semi));
    node.appendChild(txt(n.role, 9.5, n.st === 'running' ? C.accent : C.ink3, F.reg));
    canvas.appendChild(node);
  });
  dagSec.appendChild(canvas);
  const note = row('approve-note', 308, 30, C.accentSoft, 6, [0, 10, 0, 10], { radius: 3 });
  note.appendChild(box('dot', 12, 12, C.accent, { radius: 6 }));
  note.appendChild(txt('1 道审批门', 10.5, C.accent, F.semi));
  note.appendChild(txt('「合并成稿」前需要你确认', 9.5, C.ink3, F.reg));
  dagSec.appendChild(note);
  body.appendChild(dagSec);

  // ── 策略举证矩阵 ──
  const polSec = col('sec · 策略举证', PANEL - 32, 0, null, 4, [0, 0, 0, 0]);
  autoH(polSec);
  polSec.appendChild(secHead('策略举证', '6 × 6 · 点格子切换'));
  const matrix = row('matrix', PANEL - 32, 132, null, 0, [2, 0, 0, 0]);
  matrix.counterAxisAlignItems = 'MIN';
  const SHORT = ['主控', 'PI', '主笔', '引用', '复核', '润色'];
  const cellW = 18;
  const headCol = col('row-heads', 46, 130, null, 2, [0, 0, 0, 0]);
  headCol.appendChild(box('sp', 46, 12, null));
  SHORT.forEach(function (s) {
    headCol.appendChild(txt(s, 9, C.ink3, F.reg));
  });
  matrix.appendChild(headCol);
  // 预置限制：几处 warn / deny，其余 permit（空格）
  const LIMITS = {
    '2-3': 'deny',
    '2-4': 'warn',
    '3-1': 'warn',
    '4-5': 'deny',
    '5-2': 'warn',
  };
  SHORT.forEach(function (_, r) {
    const colBox = col('mcol', cellW, 130, null, 2, [0, 0, 0, 0]);
    colBox.counterAxisAlignItems = 'CENTER';
    colBox.appendChild(box('sp', cellW, 12, null));
    SHORT.forEach(function (_, c) {
      const state = LIMITS[r + '-' + c];
      const cell = box(
        'cell',
        cellW,
        18,
        state === 'deny' ? C.danger : state === 'warn' ? C.warn : null,
        { radius: 3, stroke: state ? null : C.line },
      );
      colBox.appendChild(cell);
    });
    matrix.appendChild(colBox);
  });
  polSec.appendChild(matrix);

  const legend = row('legend', PANEL - 32, 16, null, 8, [0, 0, 0, 0]);
  [['允许', C.line], ['需复核', C.warn], ['禁止', C.danger]].forEach(function (p) {
    const it = row('lg', 0, 14, null, 4, [0, 0, 0, 0]);
    it.layoutSizingHorizontal = 'HUG';
    it.appendChild(box('d', 8, 8, p[1], { radius: 2 }));
    it.appendChild(txt(p[0], 9.5, C.ink3, F.reg));
    legend.appendChild(it);
  });
  polSec.appendChild(legend);
  body.appendChild(polSec);

  return panel;
}

// ============ 运行 ============

(async function main() {
  try {
    await figma.loadFontAsync({ family: 'Inter', style: F.reg });
    await figma.loadFontAsync({ family: 'Inter', style: F.med });
    await figma.loadFontAsync({ family: 'Inter', style: F.semi });
    await figma.loadFontAsync({ family: 'Inter', style: F.bold });

    const made = [];
    for (let i = 0; i < THEMES.length; i += 1) {
      const t = THEMES[i];
      const C = t.c;
      const old = figma.currentPage.children.find(function (n) {
        return n.name === t.name;
      });
      if (old) old.remove();

      const root = box(t.name, 1440, 900, C.bg, { clip: true });
      figma.currentPage.appendChild(root);
      root.x = i * 1520;
      root.y = 1400;
      buildRail(C, root);
      buildList(C, root);
      buildChat(C, root);
      buildPanel(C, root);
      made.push(root);
    }

    // 编队面板特写（墨橙）
    const C0 = THEMES[0].c;
    const oldT = figma.currentPage.children.find(function (n) {
      return n.name === '论文平台 · 编队面板特写 / 墨橙';
    });
    if (oldT) oldT.remove();
    const holder = box('论文平台 · 编队面板特写 / 墨橙', PANEL, 900, C0.bg);
    figma.currentPage.appendChild(holder);
    holder.x = THEMES.length * 1520;
    holder.y = 1400;
    buildTeamPanel(C0, holder, 0, 0);

    figma.currentPage.selection = made;
    figma.viewport.scrollAndZoomIntoView(made);
    figma.notify('已生成 3 套工作台 + 1 张编队特写', { timeout: 6000 });
    figma.closePlugin();
  } catch (err) {
    figma.notify('生成失败：' + (err && err.message ? err.message : String(err)), {
      error: true,
      timeout: 12000,
    });
    figma.closePlugin();
  }
})();

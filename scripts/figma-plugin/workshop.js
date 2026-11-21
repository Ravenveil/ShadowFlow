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


// ============ 设置面板（两栏） ============

const SET_NAV = [
  ['账户', ['个人资料', '外观']],
  ['写作', ['写作规范', '模型与密钥', '本地 CLI']],
  ['集成', ['连接器', '远程执行', '知识与记忆']],
  ['偏好', ['协作', '通知', '数据与隐私']],
];

/** 三套风格缩略图的配色（与 settings.css 的 .tp-* 同源）。 */
const TP = {
  墨橙: { bg: '#F6F3EC', rail: '#EDE9DF', bar: '#14131A', bubble: '#FF5E3A' },
  净白: { bg: '#FFFFFF', rail: '#F7F7F8', bar: '#1F2023', bubble: '#DDD6FB' },
  夜间: { bg: '#0F0F14', rail: '#1B1B23', bar: '#ECECF1', bubble: '#FF6B4A' },
};

function themePreview(name) {
  const c = TP[name];
  const p = row('预览 · ' + name, 208, 54, c.bg, 0, [0, 0, 0, 0], { radius: 4, stroke: '#00000014' });
  const rail = col('p-rail', 46, 54, c.rail, 4, [8, 6, 8, 6]);
  [1, 0.55, 0.55].forEach(function (o) {
    const b = box('b', 34, 3, c.bar, { radius: 1 });
    b.fills = solid(c.bar, o);
    rail.appendChild(b);
  });
  const main = col('p-main', 108, 54, null, 4, [8, 7, 8, 7]);
  main.appendChild(box('l', 92, 3, c.bar, { radius: 1 }));
  main.appendChild(box('l', 58, 3, c.bar, { radius: 1 }));
  main.appendChild(spacer());
  main.appendChild(box('bubble', 92, 9, c.bubble, { radius: 2 }));
  main.appendChild(box('bubble', 50, 9, c.bubble, { radius: 2 }));
  const panel = col('p-panel', 54, 54, c.bg, 4, [9, 6, 9, 6], { stroke: '#00000010' });
  panel.appendChild(box('l', 40, 3, c.bar, { radius: 1 }));
  panel.appendChild(box('l', 40, 3, c.bar, { radius: 1 }));
  p.appendChild(rail);
  p.appendChild(main);
  p.appendChild(panel);
  return p;
}

function buildSettings(C, root) {
  // 左导航
  const nav = col('Settings · Nav', 204, 672, C.sunken, 0, [0, 0, 0, 0]);
  nav.strokes = solid(C.line);
  nav.strokeWeight = 1;
  nav.x = 0;
  nav.y = 0;
  root.appendChild(nav);

  const nh = col('nav-head', 204, 74, null, 3, [20, 18, 12, 18]);
  nh.appendChild(txt('设置', 15.5, C.ink, F.semi));
  nh.appendChild(txt('偏好保存在本机，换设备不会同步', 10, C.ink3, F.reg, { width: 166 }));
  nav.appendChild(nh);

  const list = col('nav-list', 204, 0, null, 3, [0, 8, 12, 8]);
  autoH(list);
  SET_NAV.forEach(function (g) {
    const gl = row('grp · ' + g[0], 188, 22, null, 0, [8, 10, 0, 10]);
    gl.appendChild(txt(g[0], 9.5, C.ink3, F.reg));
    list.appendChild(gl);
    g[1].forEach(function (label) {
      const active = label === '外观';
      const it = row(
        'nav · ' + label,
        188,
        32,
        active ? C.elev : null,
        9,
        [0, 10, 0, 10],
        active ? { radius: 7, stroke: C.line2 } : undefined,
      );
      it.appendChild(iconBox(13, active ? C.accent : C.ink3, 2));
      it.appendChild(txt(label, 12.5, active ? C.ink : C.ink2, active ? F.semi : F.reg));
      list.appendChild(it);
    });
  });
  nav.appendChild(list);

  // 右内容
  const main = col('Settings · Main', 736, 672, C.elev, 0, [0, 0, 0, 0]);
  main.x = 204;
  main.y = 0;
  root.appendChild(main);

  const head = row('st-head', 736, 62, null, 11, [16, 22, 14, 22]);
  const ico = row('head-ico', 30, 30, C.accentSoft, 0, [0, 0, 0, 0], { radius: 8 });
  ico.primaryAxisAlignItems = 'CENTER';
  ico.appendChild(iconBox(14, C.accent, 2));
  head.appendChild(ico);
  const htxt = col('head-text', 0, 0, null, 2, [0, 0, 0, 0]);
  htxt.layoutSizingHorizontal = 'HUG';
  htxt.appendChild(txt('外观', 15, C.ink, F.semi));
  htxt.appendChild(txt('切换立即生效，并记住在这台设备上。', 11, C.ink3, F.reg));
  head.appendChild(htxt);
  head.appendChild(spacer());
  head.appendChild(iconBox(15, C.ink3, 3));
  main.appendChild(head);
  main.appendChild(box('hr', 736, 1, C.line));

  const body = col('st-body', 736, 0, null, 0, [18, 22, 0, 22]);
  autoH(body);
  main.appendChild(body);

  body.appendChild(txt('界面风格', 10, C.ink3, F.reg));

  const cards = row('theme-cards', 692, 0, null, 10, [8, 0, 2, 0]);
  autoH(cards);
  ['墨橙', '净白', '夜间'].forEach(function (name) {
    const on = name === '墨橙';
    const card = col('style-card · ' + name, 224, 0, C.bg, 7, [8, 8, 8, 8], {
      radius: 8,
      stroke: on ? C.accent : C.line,
    });
    autoH(card);
    card.appendChild(themePreview(name));
    const line = row('name', 208, 16, null, 5, [0, 2, 0, 2]);
    line.appendChild(txt(name, 12, C.ink, F.semi));
    if (on) line.appendChild(box('dot', 13, 13, C.accent, { radius: 7 }));
    card.appendChild(line);
    card.appendChild(
      txt(
        name === '墨橙' ? '米白纸感 · 橙色强调 · 硬边卡片' : name === '净白' ? '纯白留白 · 紫色强调 · 圆角柔和' : '深墨背景 · 橙光点缀 · 长时间写作',
        10,
        C.ink3,
        F.reg,
        { width: 208 },
      ),
    );
    cards.appendChild(card);
  });
  body.appendChild(cards);

  // 界面密度
  const dens = row('row · 界面密度', 692, 46, null, 0, [12, 0, 12, 0]);
  const dt = col('d-t', 0, 0, null, 2, [0, 0, 0, 0]);
  dt.layoutSizingHorizontal = 'HUG';
  dt.appendChild(txt('界面密度', 13, C.ink, F.reg));
  dt.appendChild(txt('只影响行距与卡片内边距，不动字号。', 11, C.ink3, F.reg));
  dens.appendChild(dt);
  dens.appendChild(spacer());
  const seg = row('seg', 150, 27, C.sunken, 2, [2, 2, 2, 2], { radius: 14, stroke: C.line });
  ['紧凑', '标准', '宽松'].forEach(function (l) {
    const on = l === '标准';
    const it = row('seg · ' + l, 47, 23, on ? C.ink : null, 0, [0, 0, 0, 0], { radius: 12 });
    it.primaryAxisAlignItems = 'CENTER';
    it.appendChild(txt(l, 11.5, on ? C.bg : C.ink2, F.reg));
    seg.appendChild(it);
  });
  dens.appendChild(seg);
  body.appendChild(dens);
  body.appendChild(box('hr', 692, 1, C.line));

  // 界面动画
  const mot = row('row · 界面动画', 692, 46, null, 0, [12, 0, 12, 0]);
  const mt = col('m-t', 0, 0, null, 2, [0, 0, 0, 0]);
  mt.layoutSizingHorizontal = 'HUG';
  mt.appendChild(txt('界面动画', 13, C.ink, F.reg));
  mt.appendChild(txt('关掉后弹出、滚动、状态切换都直接到位。', 11, C.ink3, F.reg));
  mot.appendChild(mt);
  mot.appendChild(spacer());
  const sw = row('switch', 34, 19, C.accent, 0, [0, 0, 0, 0], { radius: 10 });
  sw.primaryAxisAlignItems = 'MAX';
  sw.appendChild(box('knob', 13, 13, C.bg, { radius: 7 }));
  mot.appendChild(sw);
  body.appendChild(mot);

  main.appendChild(spacer());
  main.appendChild(box('hr', 736, 1, C.line));
  const foot = row('st-foot', 736, 52, C.sunken, 12, [11, 22, 11, 22]);
  foot.appendChild(txt('已保存', 10.5, C.ink3, F.reg));
  foot.appendChild(spacer());
  const done = row('done', 74, 30, C.ink, 0, [0, 0, 0, 0], { radius: 7 });
  done.primaryAxisAlignItems = 'CENTER';
  done.appendChild(txt('完成', 11.5, C.bg, F.semi));
  foot.appendChild(done);
  main.appendChild(foot);

  return root;
}

// ============ 落地页设计稿（结构对齐 shadow-merge，文案=论文平台） ============
// 全部节点用 lp- 前缀，避免和工作台/tab/DAG 的断言计数互相干扰。

function lpBtn(label, kind, C) {
  const solidBtn = kind === 'solid';
  const b = row('lp-btn · ' + label, 138, 42, solidBtn ? C.accent : null, 0, [0, 0, 0, 0], {
    radius: 8,
    stroke: solidBtn ? null : C.line2,
    strokeWeight: 1,
  });
  b.primaryAxisAlignItems = 'CENTER';
  b.appendChild(txt(label, 13, solidBtn ? C.bg : C.ink, F.semi));
  return b;
}

function lpSectionHead(C, kicker, titleLines, side) {
  const head = col('lp-head', 1200, 150, null, 12, [0, 0, 0, 0]);
  head.appendChild(txt(kicker, 12, C.accent, F.bold));
  titleLines.forEach((line) => head.appendChild(txt(line, 34, C.ink, F.bold)));
  if (side) {
    const s = txt(side, 14, C.ink2, F.reg, { width: 720 });
    s.opacity = 0.9;
    head.appendChild(s);
  }
  return head;
}

function buildLanding(C) {
  const LIGHT = '#F6F3EC';
  const root = col('论文平台 · 落地页 / 墨橙', 1440, 5400, C.bg, 0, [0, 0, 0, 0], { clip: true });

  // ── 顶部导航 ──
  const nav = row('lp-nav', 1440, 76, C.elev, 0, [0, 120, 0, 120]);
  nav.strokes = solid(C.line);
  nav.strokeWeight = 1;
  nav.appendChild(box('lp-logo', 26, 26, C.accent, { radius: 7 }));
  nav.appendChild(txt('ShadowFlow', 17, C.ink, F.bold));
  nav.appendChild(spacer());
  ['研究场景', '闭环链路', 'Agent 团队', '知识沉淀', '案例演示', '常见问题'].forEach((l) =>
    nav.appendChild(txt(l, 12.5, C.ink2, F.med)),
  );
  nav.appendChild(spacer());
  nav.appendChild(lpBtn('联系我们', 'outline', C));
  nav.appendChild(lpBtn('进入工作台', 'solid', C));
  root.appendChild(nav);

  // ── Hero ──
  const hero = row('lp-hero', 1440, 600, C.bg, 40, [70, 120, 60, 120]);
  const heroCopy = col('lp-hero-copy', 560, 460, null, 16, [0, 0, 0, 0]);
  const pill = row('lp-pill', 210, 30, C.accentSoft, 0, [0, 14, 0, 14], { radius: 15 });
  pill.appendChild(txt('为一人工信 / 科研团队打造', 11, C.accent, F.semi));
  heroCopy.appendChild(pill);
  heroCopy.appendChild(txt('一个人，', 50, C.ink, F.bold, { lineHeight: 60 }));
  heroCopy.appendChild(txt('也能带出一支', 50, C.ink, F.bold, { lineHeight: 60 }));
  heroCopy.appendChild(txt('论文团队。', 50, C.accent, F.bold, { lineHeight: 60 }));
  heroCopy.appendChild(txt('从选题到投稿，让 AI 角色按你的方法协同推进。你负责判断与把关，ShadowFlow 负责把每一环都闭合。', 15, C.ink2, F.reg, { width: 520 }));
  const heroBtns = row('lp-hero-btns', 440, 44, null, 12, [0, 0, 0, 0]);
  heroBtns.appendChild(lpBtn('进入工作台', 'solid', C));
  heroBtns.appendChild(lpBtn('联系我们', 'outline', C));
  heroBtns.appendChild(txt('看看如何工作 →', 13, C.ink2, F.med));
  heroCopy.appendChild(heroBtns);
  const ticks = row('lp-ticks', 460, 24, null, 18, [0, 0, 0, 0]);
  ['无需信用卡', '15 分钟完成配置', '关键节点人工可控'].forEach((t) => ticks.appendChild(txt('✓ ' + t, 11.5, C.ink3, F.reg)));
  heroCopy.appendChild(ticks);
  hero.appendChild(heroCopy);

  const win = col('lp-product-window', 560, 470, C.elev, 14, [18, 18, 18, 18], { radius: 14, stroke: C.line, strokeWeight: 1 });
  const winTop = row('lp-win-top', 524, 34, null, 10, [0, 0, 0, 0]);
  [C.danger, C.warn, C.ok].forEach((c) => winTop.appendChild(avatar(9, c)));
  winTop.appendChild(txt('shadowflow.ai / 项目执行中心', 12, C.ink3, F.med));
  win.appendChild(winTop);
  win.appendChild(txt('LLM Agent 角色分工综述', 22, C.ink, F.bold));
  const statRow = row('lp-stats', 524, 66, C.sunken, 0, [10, 18, 10, 18], { radius: 10 });
  [['12', '任务总数'], ['08', '已完成'], ['03', '执行中']].forEach(([k, v]) => {
    const cell = col('lp-stat', 150, 46, null, 4, [0, 0, 0, 0]);
    cell.appendChild(txt(k, 24, C.accent, F.bold));
    cell.appendChild(txt(v, 11, C.ink3, F.reg));
    statRow.appendChild(cell);
  });
  win.appendChild(statRow);
  const flow = col('lp-flow', 524, 190, null, 10, [12, 14, 12, 14], { radius: 10, stroke: C.line, strokeWeight: 1 });
  flow.appendChild(row('lp-flow-head', 496, 22, null, 8, [0, 0, 0, 0], {}));
  flow.children[0].appendChild(txt('工作流', 13, C.ink, F.semi));
  flow.children[0].appendChild(spacer());
  flow.children[0].appendChild(txt('实时更新 ●', 11, C.ok, F.med));
  [['01', '文献调研', '已完成', C.ok], ['02', '方法设计', '进行中', C.accent], ['03', '章节撰写', '执行中', '#8e6cff']].forEach(([n, t, s, col]) => {
    const r = row('lp-flow-row', 496, 34, C.sunken, 12, [0, 12, 0, 12], { radius: 8 });
    r.appendChild(avatar(20, col));
    r.appendChild(txt(n, 11, C.ink3, F.med));
    r.appendChild(txt(t, 13, C.ink, F.semi));
    r.appendChild(spacer());
    r.appendChild(txt(s, 11, col, F.med));
    flow.appendChild(r);
  });
  win.appendChild(flow);
  const floatCard = row('lp-float', 300, 40, C.elev, 10, [0, 12, 0, 12], { radius: 8, stroke: C.accent, strokeWeight: 1 });
  floatCard.appendChild(iconBox(18, C.accent));
  floatCard.appendChild(txt('章节主笔 · 已完成 4 个 section', 11.5, C.ink, F.med));
  win.appendChild(floatCard);
  hero.appendChild(win);
  root.appendChild(hero);

  // ── 痛点 ──
  const pain = col('lp-pain', 1440, 520, C.sunken, 30, [56, 120, 40, 120]);
  pain.appendChild(lpSectionHead(C, 'RESEARCH SCENARIOS', ['论文协作场景，', '是否遇到以下问题？'], '当你同时是调研、方法、写作和投稿负责人，真正消耗精力的不是某一项工作，而是不断切换角色与拼接上下文。'));
  const painGrid = row('lp-pain-grid', 1200, 240, null, 20, [0, 0, 0, 0]);
  [
    ['01', '工具很多，链路依然断裂', '文献库、AI 对话、LaTeX 工程和组会纪要散落各处，每次续写都要重建上下文。'],
    ['02', '一个人承担多个岗位', '文献调研、方法设计、写作、投稿，全压在同一个研究者身上。切换成本比工作量本身更贵。'],
    ['03', 'AI 输出难以稳定交付', '缺少负责人、验收标准、审核节点与修改记录，结果不可控、不可回溯。'],
    ['04', '项目经验无法变成资产', '审稿意见、有效论证和写作偏好散落历史文件，下一篇又要从零开始。'],
  ].forEach(([n, title, body]) => {
    const card = col('lp-pain-card', 285, 240, C.elev, 12, [20, 18, 18, 18], { radius: 12, stroke: C.line, strokeWeight: 1 });
    const top = row('lp-pain-top', 249, 30, null, 8, [0, 0, 0, 0]);
    top.appendChild(txt(n, 13, C.accent, F.bold));
    top.appendChild(spacer());
    top.appendChild(iconBox(22, C.accent));
    card.appendChild(top);
    card.appendChild(txt(title, 15, C.ink, F.semi, { width: 249 }));
    card.appendChild(txt(body, 12, C.ink2, F.reg, { width: 249 }));
    painGrid.appendChild(card);
  });
  pain.appendChild(painGrid);
  root.appendChild(pain);

  // ── 闭环链路（深色） ──
  const flowSec = row('lp-workflow', 1440, 560, C.deep, 40, [56, 120, 40, 120]);
  const flowLeft = col('lp-workflow-left', 520, 440, null, 16, [0, 0, 0, 0]);
  flowLeft.appendChild(txt('CLOSED-LOOP WORKFLOW', 12, '#FF8A6B', F.bold));
  flowLeft.appendChild(txt('闭环的链路，', 34, LIGHT, F.bold));
  flowLeft.appendChild(txt('帮您解决上述问题。', 34, LIGHT, F.bold));
  flowLeft.appendChild(txt('ShadowFlow 不是让几个聊天机器人各说各话，而是让每个角色基于同一份课题知识，接力完成同一个研究目标。', 14, '#B8B4C6', F.reg, { width: 500 }));
  [['01', 'BRIEF', '录入课题需求'], ['02', 'PLAN', '主控拆解'], ['03', 'CREATE', '角色协同执行'], ['04', 'DELIVER', '审核并投稿交付']].forEach(([n, lb, t], i) => {
    const st = row('lp-step', 500, 52, i === 1 ? C.accent : '#22213A', 14, [0, 16, 0, 16], { radius: 8 });
    st.appendChild(txt(n, 13, i === 1 ? LIGHT : '#8E8AA6', F.bold));
    const tx = col('lp-step-tx', 400, 44, null, 2, [0, 0, 0, 0]);
    tx.appendChild(txt(lb, 10, i === 1 ? LIGHT : '#8E8AA6', F.med));
    tx.appendChild(txt(t, 14, LIGHT, F.semi));
    st.appendChild(tx);
    flowLeft.appendChild(st);
  });
  flowSec.appendChild(flowLeft);
  const detail = col('lp-step-detail', 560, 440, '#1B1A2E', 16, [28, 28, 28, 28], { radius: 14, stroke: '#34324C', strokeWeight: 1 });
  detail.appendChild(row('lp-detail-top', 504, 22, null, 8, [0, 0, 0, 0], {}));
  detail.children[0].appendChild(txt('WORKFLOW / 02', 11, '#8E8AA6', F.med));
  detail.children[0].appendChild(spacer());
  detail.children[0].appendChild(txt('LIVE', 11, C.ok, F.bold));
  detail.appendChild(iconBox(52, '#FF8A6B'));
  detail.appendChild(txt('主控拆解', 26, LIGHT, F.bold));
  detail.appendChild(txt('识别课题范围，生成章节计划、任务清单和质量标准，并自动分配给合适的 AI 角色。', 14, '#B8B4C6', F.reg, { width: 504 }));
  const out = row('lp-out', 504, 60, '#232238', 12, [0, 16, 0, 16], { radius: 10 });
  out.appendChild(iconBox(22, C.ok));
  const outTx = col('lp-out-tx', 440, 48, null, 3, [0, 0, 0, 0]);
  outTx.appendChild(txt('本阶段产出', 10, '#8E8AA6', F.med));
  outTx.appendChild(txt('章节计划与任务 DAG', 14, LIGHT, F.semi));
  out.appendChild(outTx);
  detail.appendChild(out);
  const dots = row('lp-dots', 504, 12, null, 8, [0, 0, 0, 0]);
  [C.ok, C.ok, '#4A4866', '#4A4866'].forEach((cc) => dots.appendChild(box('dot', 100, 4, cc, { radius: 2 })));
  detail.appendChild(dots);
  flowSec.appendChild(detail);
  root.appendChild(flowSec);

  // ── Agent 集群 ──
  const agentsSec = col('lp-agents', 1440, 660, C.bg, 26, [56, 120, 40, 120]);
  agentsSec.appendChild(lpSectionHead(C, 'AGENT CLUSTER', ['Agent 员工集群，', '打造论文交付链路。'], '每位角色都有明确的职责、输入、工具和交付标准。主控负责规划和调度，你始终保留最终决策权。'));
  const agentGrid = row('lp-agent-grid', 1200, 260, null, 18, [0, 0, 0, 0]);
  [
    ['A1', 'CHIEF OF STAFF', '主控', '接需求 · 拆任务 · 调度团队', C.accent],
    ['A2', 'RESEARCHER', '文献研究员', '文献扫描 · 基线对比 · 洞察提炼', '#2777e8'],
    ['A3', 'STRATEGIST', '方法设计', '实验设计 · 消融规划 · 统计口径', '#8e6cff'],
    ['A4', 'CREATIVE', '章节主笔', '章节撰写 · 图表脚本 · 投稿材料', '#e05aa0'],
    ['A5', 'CITATION OFFICER', '引用核查', '引用核对 · 口径复核 · 依据溯源', '#2ec4a6'],
    ['A6', 'SUBMISSION MGR', '投稿管理', '格式对齐 · 材料打包 · 投稿跟进', '#12b76a'],
  ].forEach(([code, en, cn, task, color]) => {
    const card = col('lp-agent-card', 188, 260, C.elev, 10, [16, 14, 16, 14], { radius: 12, stroke: C.line, strokeWeight: 1 });
    const top = row('lp-agent-top', 160, 24, null, 6, [0, 0, 0, 0]);
    top.appendChild(txt(code, 11, C.ink3, F.bold));
    top.appendChild(spacer());
    top.appendChild(txt('●', 10, color, F.med));
    card.appendChild(top);
    card.appendChild(avatar(46, color));
    card.appendChild(txt(en, 9.5, color, F.med));
    card.appendChild(txt(cn, 15, C.ink, F.bold));
    card.appendChild(txt(task, 11, C.ink2, F.reg, { width: 160 }));
    card.appendChild(spacer());
    card.appendChild(txt('READY TO WORK', 9.5, C.ok, F.med));
    agentGrid.appendChild(card);
  });
  agentsSec.appendChild(agentGrid);
  const human = row('lp-human', 1200, 92, C.accentSoft, 18, [0, 24, 0, 24], { radius: 12 });
  human.appendChild(box('lp-human-badge', 46, 46, C.accent, { radius: 12 }));
  human.appendChild(col('lp-human-tx', 1080, 70, null, 4, [0, 0, 0, 0]));
  human.children[1].appendChild(txt('HUMAN IN THE LOOP', 10, C.accent, F.bold));
  human.children[1].appendChild(txt('AI 负责执行，你负责判断——关键策略、结论取舍与最终投稿都由你审核确认。', 14, C.ink, F.semi, { width: 1060 }));
  agentsSec.appendChild(human);
  root.appendChild(agentsSec);

  // ── 知识沉淀 ──
  const know = row('lp-know', 1440, 520, C.sunken, 40, [56, 120, 40, 120]);
  const knowCopy = col('lp-know-copy', 520, 400, null, 16, [0, 0, 0, 0]);
  knowCopy.appendChild(txt('EVERY PROJECT MAKES YOU STRONGER', 12, C.accent, F.bold));
  knowCopy.appendChild(txt('论文闭环链路长期沉淀，', 32, C.ink, F.bold));
  knowCopy.appendChild(txt('越来越聪明。', 32, C.ink, F.bold));
  knowCopy.appendChild(txt('每次项目的审稿意见、有效论证、写作偏好和交付标准都会回到课题组的记忆系统。下一次，不再从零开始。', 14, C.ink2, F.reg, { width: 500 }));
  const knowMetrics = row('lp-know-metrics', 480, 80, null, 30, [0, 0, 0, 0]);
  [['1', '个统一课题上下文'], ['∞', '次复用方法与经验']].forEach(([k, v]) => {
    const m = col('lp-know-metric', 200, 80, null, 4, [0, 0, 0, 0]);
    m.appendChild(txt(k, 40, C.accent, F.bold));
    m.appendChild(txt(v, 12, C.ink2, F.reg));
    knowMetrics.appendChild(m);
  });
  knowCopy.appendChild(knowMetrics);
  know.appendChild(knowCopy);
  const kg = box('lp-knowledge-graph', 560, 400, C.elev, { radius: 14, stroke: C.line, strokeWeight: 1 });
  const core = col('lp-kg-core', 180, 96, C.deep, 6, [0, 0, 0, 0], { radius: 12 });
  core.primaryAxisAlignItems = 'CENTER';
  core.counterAxisAlignItems = 'CENTER';
  core.appendChild(txt('课题组知识库', 15, LIGHT, F.bold));
  core.appendChild(txt('持续学习中', 10, '#B8B4C6', F.med));
  core.x = 190;
  core.y = 152;
  kg.appendChild(core);
  [['审稿意见', 40, 40], ['项目成果', 400, 40], ['SOP 模板', 40, 320], ['写作偏好', 400, 320]].forEach(([n, x, y]) => {
    const node = row('lp-kg-node', 120, 44, C.bg, 6, [0, 10, 0, 10], { radius: 10, stroke: C.line2, strokeWeight: 1 });
    node.appendChild(iconBox(16, C.accent));
    node.appendChild(txt(n, 11.5, C.ink, F.med));
    node.x = x;
    node.y = y;
    kg.appendChild(node);
  });
  know.appendChild(kg);
  root.appendChild(know);

  // ── 口号带（深色） ──
  const slogan = col('lp-slogan', 1440, 240, C.deep, 12, [0, 120, 0, 120]);
  slogan.primaryAxisAlignItems = 'CENTER';
  slogan.appendChild(txt('YOUR LAB. YOUR METHOD. YOUR AI TEAM.', 13, '#FF8A6B', F.bold));
  slogan.appendChild(txt('让一个人，也能带出一支专业的论文团队。', 32, LIGHT, F.bold));
  root.appendChild(slogan);

  // ── 案例 + Demo ──
  const cases = col('lp-cases', 1440, 620, C.bg, 24, [56, 120, 40, 120]);
  cases.appendChild(lpSectionHead(C, 'CASE STUDY', ['客户案例：从组会稿', '到投稿材料全流程。'], '真实场景演示：上传组会记录与实验数据，主控拆解后分给各角色，最终产出投稿级稿件。'));
  const figs = row('lp-figs', 1200, 180, null, 18, [0, 0, 0, 0]);
  [['组会记录 · 结构化入库', C.ok], ['实验数据 · 核对归档', '#2777e8']].forEach(([cap, color]) => {
    const fig = col('lp-fig', 591, 180, C.sunken, 8, [0, 0, 0, 0], { radius: 12, stroke: C.line, strokeWeight: 1 });
    fig.appendChild(box('lp-fig-img', 591, 132, color, { radius: 12 }));
    fig.appendChild(txt(cap, 12, C.ink2, F.med));
    figs.appendChild(fig);
  });
  cases.appendChild(figs);
  const demo = row('lp-demo', 1200, 200, C.elev, 0, [0, 0, 0, 0], { radius: 12, stroke: C.line, strokeWeight: 1 });
  const demoChat = col('lp-demo-chat', 700, 200, C.bg, 10, [16, 16, 16, 16]);
  demoChat.appendChild(txt('课题组 · 组会稿转投稿稿', 14, C.ink, F.bold));
  demoChat.appendChild(row('lp-msg', 520, 38, C.elev, 6, [0, 12, 0, 12], { radius: 8 }));
  demoChat.children[1].appendChild(txt('主控：想把组会稿整理成投稿稿？', 11.5, C.ink2, F.med));
  demoChat.appendChild(row('lp-msg', 520, 38, C.accentSoft, 6, [0, 12, 0, 12], { radius: 8 }));
  demoChat.children[2].appendChild(txt('用户：组会稿_v3.md · 实验对比表.xlsx', 11.5, C.ink, F.med));
  demo.appendChild(demoChat);
  const demoBoard = col('lp-demo-board', 500, 200, C.sunken, 8, [16, 16, 16, 16]);
  demoBoard.appendChild(txt('平台实时同步', 13, C.ink, F.semi));
  [['知识库资料', '3 份'], ['Agent 团队', '6 人'], ['引用核查', '52 条']].forEach(([k, v]) => {
    const r = row('lp-metric', 468, 32, C.elev, 8, [0, 10, 0, 10], { radius: 6 });
    r.appendChild(txt(k, 11.5, C.ink2, F.reg));
    r.appendChild(spacer());
    r.appendChild(txt(v, 12, C.accent, F.bold));
    demoBoard.appendChild(r);
  });
  demo.appendChild(demoBoard);
  cases.appendChild(demo);
  root.appendChild(cases);

  // ── FAQ ──
  const faq = row('lp-faq', 1440, 460, C.elev, 60, [56, 120, 40, 120]);
  const faqL = col('lp-faq-l', 300, 300, null, 14, [0, 0, 0, 0]);
  faqL.appendChild(txt('常见问题', 34, C.ink, F.bold));
  faqL.appendChild(lpBtn('联系我们', 'outline', C));
  faq.appendChild(faqL);
  const faqR = col('lp-faq-r', 840, 360, null, 10, [0, 0, 0, 0]);
  [
    'ShadowFlow 和通用大模型有什么不同？',
    '我已经在用很多 AI 工具，还需要 ShadowFlow 吗？',
    'AI 会直接把未经审核的内容发出去吗？',
    '能否沉淀我自己的研究方法论？',
  ].forEach((q, i) => {
    const item = col('lp-faq-item', 840, i === 0 ? 96 : 66, i === 0 ? C.accentSoft : C.bg, 0, [14, 18, 14, 18], { radius: 8, stroke: C.line, strokeWeight: 1 });
    const qrow = row('lp-faq-q', 804, 30, null, 10, [0, 0, 0, 0]);
    qrow.appendChild(txt('0' + (i + 1), 12, C.accent, F.bold));
    qrow.appendChild(txt(q, 14, C.ink, F.semi));
    qrow.appendChild(spacer());
    qrow.appendChild(txt('⌄', 14, C.ink3, F.med));
    item.appendChild(qrow);
    if (i === 0) item.appendChild(txt('通用大模型擅长单次对话与生成；ShadowFlow 把模型能力组织成有岗位、有上下游、有质量标准的业务流程，并将执行过程与课题、成本和交付成果关联起来。', 11.5, C.ink2, F.reg, { width: 804 }));
    faqR.appendChild(item);
  });
  faq.appendChild(faqR);
  root.appendChild(faq);

  // ── 价格 ──
  const pricing = col('lp-pricing', 1440, 520, C.sunken, 26, [56, 120, 40, 120]);
  pricing.appendChild(lpSectionHead(C, 'PRICING', ['选择适合你的方案，', '从一个人到一支团队。'], null));
  const plans = row('lp-plans', 1200, 250, null, 20, [0, 0, 0, 0]);
  [
    ['体验版', '免费', ['3 位预设 AI 员工', '500 基础积分'], false],
    ['工作室版', '¥66 / 月', ['1000+2000 赠送积分', '多课题项目管理', '课题组知识库'], true],
    ['专业定制版', '定制', ['专属 Skill 与员工', '知识库迁移', '定制工作流与部署'], false],
  ].forEach(([name, price, feats, featured]) => {
    const card = col('lp-plan', 386, 250, C.elev, 12, [24, 22, 22, 22], { radius: 12, stroke: featured ? C.accent : C.line, strokeWeight: featured ? 2 : 1 });
    card.appendChild(txt(name, 16, C.ink, F.bold));
    card.appendChild(txt(price, 30, featured ? C.accent : C.ink, F.bold));
    feats.forEach((f) => card.appendChild(txt('✓ ' + f, 12, C.ink2, F.reg)));
    card.appendChild(spacer());
    card.appendChild(lpBtn(featured ? '立即开始' : '了解更多', featured ? 'solid' : 'outline', C));
    plans.appendChild(card);
  });
  pricing.appendChild(plans);
  root.appendChild(pricing);

  // ── 页脚 ──
  const footer = col('lp-footer', 1440, 180, C.deep, 16, [44, 120, 30, 120]);
  footer.appendChild(row('lp-footer-brand', 300, 30, null, 8, [0, 0, 0, 0], {}));
  footer.children[0].appendChild(box('lp-footer-logo', 22, 22, C.accent, { radius: 6 }));
  footer.children[0].appendChild(txt('ShadowFlow', 16, LIGHT, F.bold));
  footer.appendChild(txt('© 2026 ShadowFlow · 论文协作平台', 11, '#8E8AA6', F.reg));
  root.appendChild(footer);

  return root;
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

    // 设置面板（墨橙，外观分区）
    const setName = '论文平台 · 设置 / 墨橙';
    const oldS = figma.currentPage.children.find(function (n) {
      return n.name === setName;
    });
    if (oldS) oldS.remove();
    const settingsHolder = box(setName, 940, 672, C0.bg);
    figma.currentPage.appendChild(settingsHolder);
    settingsHolder.x = THEMES.length * 1520;
    settingsHolder.y = 2400;
    buildSettings(C0, settingsHolder);

    // 落地页设计稿（结构对齐 shadow-merge，文案=论文平台）
    const lpName = '论文平台 · 落地页 / 墨橙';
    const oldLp = figma.currentPage.children.find(function (n) {
      return n.name === lpName;
    });
    if (oldLp) oldLp.remove();
    const landing = buildLanding(C0);
    figma.currentPage.appendChild(landing);
    landing.x = -1520;
    landing.y = 1400;
    made.push(landing);

    figma.currentPage.selection = made;
    figma.viewport.scrollAndZoomIntoView(made);
    figma.notify('已生成落地页 + 3 套工作台 + 编队特写 + 设置面板', { timeout: 6000 });
    figma.closePlugin();
  } catch (err) {
    figma.notify('生成失败：' + (err && err.message ? err.message : String(err)), {
      error: true,
      timeout: 12000,
    });
    figma.closePlugin();
  }
})();

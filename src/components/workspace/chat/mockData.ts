/**
 * Chat tab mock 数据 — 按会话 ID 分桶
 *
 * P0 修复：原 INITIAL_MSGS 单一数组导致所有会话共享消息。
 * 现在按 ConvId 拆开，每个会话有独立的消息列表。
 *
 * NOTE: agent / team `color` 字段保留 hex 字面量是因为 type interface 要求 string；
 * 待 agent palette 主题化（theme tokens）落地后再改。
 * TODO: theme-token mapping when agent palette ships
 */

import type { ConvId, MsgItem, SlashCommand, Org } from './types';

/* ── 论文深读小队（默认进入的会话） ─────────────────────── */
const MAIN_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 1 },
  { type: 'system', text: '张明 启动 run #042 · 输入：arXiv:2410.11215', id: 2 },
  {
    type: 'agent', id: 3,
    agent: { glyph: '读', name: '读读', role: 'READER · L1', model: 'haiku-4.5', color: '#A855F7' },
    time: '09:14',
    bodyText: '已抓 PDF · 38 页 / 12 节 / 47 引用。建议优先 §4 方法 与 §6 实验。',
    tool: { name: 'read_file', meta: 'arxiv-2410.11215.pdf · 38p · 142 KB' },
    reactions: [['👍', 3], ['📑', 1]],
    thread: { count: 4, last: '阿批 · 1 分钟前' },
    readBy: '5/5 已读',
  },
  {
    type: 'agent', id: 4,
    agent: { glyph: '批', name: '阿批', role: 'CRITIC · L2', model: 'sonnet-4.5', color: '#F59E0B' },
    time: '09:16',
    bodyText: '发现潜在问题 3 处：\n§4.2 基线选择避开了 ICLR-24 的更强基线 RetroCorr\n§5.1 消融未覆盖 BatchSize × Dropout 联合效应\n§6.3 与 Tab.2 数据不一致（73.4 vs 71.8）',
    reactions: [['🔥', 2], ['🚨', 1]],
    thread: { count: 7, last: '小写 · 30 秒前' },
  },
  { type: 'policy', id: 5 },
  {
    type: 'user', id: 6, name: '张明', time: '09:20',
    bodyText: '@阿批 把第 3 处不一致写成详细 issue，附数据来源截图',
    reply: { name: '阿批', text: '§6.3 与 Tab.2 数据不一致（73.4 vs 71.8）' },
  },
  { type: 'gate', id: 7 },
  { type: 'typing', id: 8 },
];

/* ── engineering 频道 ─────────────────────────────────── */
const ENG_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 101 },
  {
    type: 'agent', id: 102,
    agent: { glyph: 'D', name: 'Devon', role: 'ENGINEER', model: 'sonnet-4.5', color: '#22D3EE' },
    time: '09:42',
    bodyText: 'PR #312 (refactor: extract auth middleware) 已合并到 main ✓\n通过 8 项 CI 检查 · 2 reviewer approve',
    tool: { name: 'gh.pr.merge', meta: '#312 · main' },
    reactions: [['🎉', 4]],
  },
  {
    type: 'user', id: 103, name: '张明', time: '09:43',
    bodyText: 'good. 接着搞 #313（rate limit）',
  },
];

/* ── 文献综述-机密 频道（被 approval gate 卡住）─────────── */
const SECRET_MSGS: MsgItem[] = [
  { type: 'divider', label: '昨日 · 10 月 27 日', id: 201 },
  { type: 'system', text: '此频道开启 L3 审批门 · 所有 agent 输出需人审', id: 202 },
  {
    type: 'agent', id: 203,
    agent: { glyph: '爬', name: '爬爬', role: 'CRAWLER · L2', model: 'haiku-4.5', color: '#F59E0B' },
    time: '14:32',
    bodyText: '已采集 2024-2025 年 47 篇相关综述 · 等待 §3 主题聚类阶段进入',
  },
  { type: 'gate', id: 204 },
];

/* ── DM: 读读 ─────────────────────────────────────────── */
const DUDU_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 301 },
  {
    type: 'agent', id: 302,
    agent: { glyph: '读', name: '读读', role: 'READER · L1', model: 'haiku-4.5', color: '#A855F7' },
    time: '09:14',
    bodyText: '已抽 12 篇相关 PDF（按引用图谱倒排）。要我现在开始读？',
    reactions: [['👀', 1]],
  },
];

/* ── DM: 阿批 ─────────────────────────────────────────── */
const API_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 401 },
  {
    type: 'agent', id: 402,
    agent: { glyph: '批', name: '阿批', role: 'CRITIC · L2', model: 'sonnet-4.5', color: '#F59E0B' },
    time: '09:16',
    bodyText: '@张明 我发现 3 处自相矛盾，最严重的是 §6.3 vs Tab.2 数据对不上。要我开 issue 吗？',
  },
];

/* ── DM: 查查 ─────────────────────────────────────────── */
const CHAXHA_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 501 },
  {
    type: 'agent', id: 502,
    agent: { glyph: '查', name: '查查', role: 'CITE · L1', model: 'sonnet-4.5', color: '#22D3EE' },
    time: '09:18',
    bodyText: '47 条引用全部通过 CrossRef 验证 ✓ 47/47',
    tool: { name: 'crossref.batch', meta: '47 dois · 1.2s' },
  },
];

/* ── DM: 小写 ─────────────────────────────────────────── */
const XIAOXIE_MSGS: MsgItem[] = [
  { type: 'divider', label: '今天 · 10 月 28 日', id: 601 },
  {
    type: 'agent', id: 602,
    agent: { glyph: '写', name: '小写', role: 'WRITER · L3', model: 'gpt-4o', color: '#EF4444' },
    time: '09:21',
    bodyText: 'r2/3 重写中 · §6 已 fork draft.v2 → v3，正在补 RetroCorr 基线对比',
  },
  { type: 'gate', id: 603 },
];

export const INITIAL_CONV_MSGS: Record<ConvId, MsgItem[]> = {
  main: MAIN_MSGS,
  engineering: ENG_MSGS,
  secret: SECRET_MSGS,
  dudu: DUDU_MSGS,
  api: API_MSGS,
  chaxha: CHAXHA_MSGS,
  xiaoxie: XIAOXIE_MSGS,
};

export const CONV_TITLES: Record<ConvId, string> = {
  main: '论文深读小队',
  engineering: 'engineering',
  secret: '文献综述-机密',
  dudu: '读读 DM',
  api: '阿批 DM',
  chaxha: '查查 DM',
  xiaoxie: '小写 DM',
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/run',     d: '触发 team 跑一轮' },
  { cmd: '/approve', d: '批准当前 gate' },
  { cmd: '/retry',   d: '让 agent 重写' },
  { cmd: '/assign',  d: '把任务派给 agent' },
  { cmd: '/pin',     d: '置顶为 brief 卡片' },
];

export const ORGS: Org[] = [
  { init: '论', name: '论文实验室',      tag: '专业版 · 已认证', cur: true,  members: '7 agents · 3 teams', color: '#A855F7' },
  { init: '代', name: '代码 Review 团队', tag: '专业版',          cur: false, members: '4 agents · 2 teams', color: '#22D3EE' },
  { init: 'OP', name: 'OPS 值班',         tag: '未认证',          cur: false, warn: true, members: '3 agents · 1 team', color: '#F59E0B' },
  { init: 'NP', name: 'NPC Persona',      tag: '社区版 · L1',     cur: false, members: '9 agents · 2 teams', color: '#EF4444' },
];

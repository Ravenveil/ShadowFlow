/**
 * landing.ts — 落地页的**全部可见文案与配图数据**。
 *
 * 约定：`src/landing/**` 里不出现中文内容，只负责把这份数据摆成版面。
 * 改文案 / 加一节 / 换 CTA 措辞 —— 都在这个文件里改，不碰组件。
 * 颜色只写语义色调名（tone），具体色值由 `theme/tokens.css` 的 `--tone-*` 决定。
 */
import type { ToneName } from '../theme/tones';

export interface NavItem {
  label: string;
  href: string;
}

export interface CrewCard {
  code: string;
  en: string;
  cn: string;
  desc: string;
  /** 头像解析用的名字（走 identities.ts 的别名表）。 */
  face: string;
  tone: ToneName;
}

export interface PainCard {
  n: string;
  title: string;
  body: string;
}

export interface PhaseCard {
  key: string;
  n: string;
  title: string;
  body: string;
  out: string;
}

export interface AssetCard {
  name: string;
  size: string;
  /** 四角方位：tl / tr / bl / br。 */
  pos: 'tl' | 'tr' | 'bl' | 'br';
}

export const LANDING_BRAND = {
  name: 'ShadowFlow',
  copyright: '© 2026 ShadowFlow · 论文协作平台',
};

export const LANDING_NAV: NavItem[] = [
  { label: '如何工作', href: '#how' },
  { label: 'AI 团队', href: '#team' },
  { label: '产品价值', href: '#value' },
  { label: '知识沉淀', href: '#knowledge' },
];

export const LANDING_CTA = {
  demo: '预约演示',
  enter: '进入产品',
  watch: '看看如何工作',
};

/* ── Hero ───────────────────────────────────────────────────────── */

export const HERO = {
  pill: '为一人工信 / 科研团队打造',
  /** 主标题按行给，最后一行单独强调（橙色）。 */
  title: ['一个人，', '也能带出一支'],
  titleAccent: '论文团队。',
  lede: '从选题到投稿，让 AI 角色按你的方法协同推进。你负责判断与把关，ShadowFlow 负责把每一环都闭合。',
  ticks: ['无需信用卡', '15 分钟完成配置', '关键节点人工可控'],
};

/** Hero 右侧那台「产品窗口」里的小样张（纯装饰，改文案在这里）。 */
export const PREVIEW = {
  title: '项目执行中心',
  url: 'shadowflow.ai',
  kicker: 'ACTIVE PROJECT',
  project: 'LLM Agent 角色分工综述',
  state: '执行中 · 68%',
  stats: [
    { k: '12', v: '任务总数' },
    { k: '08', v: '已完成' },
    { k: '03', v: '执行中' },
  ],
  flowTitle: '工作流',
  flowLive: '实时更新',
  flow: [
    { n: 1, t: '文献调研', s: '已完成', tone: 'teal' as ToneName },
    { n: 2, t: '方法设计', s: '进行中', tone: 'accent' as ToneName },
    { n: 3, t: '章节撰写', s: '执行中', tone: 'violet' as ToneName },
  ],
  floatDoc: { title: '草案 v2.1', note: '刚更新 · 引用已核 38/52' },
  floatAgent: { face: '章节主笔', title: '章节主笔', note: '已完成 4 个 section' },
};

/* ── 痛点 ───────────────────────────────────────────────────────── */

export const PAIN_SECTION = {
  kicker: 'ONE PERSON, TOO MANY ROLES',
  title: ['你缺的不是另一个工具，', '而是一支真正协作的团队。'],
  side: '当你同时是调研、方法、写作和投稿负责人，真正消耗精力的不是某一项工作，而是不断切换角色与拼接上下文。',
  cards: [
    {
      n: '01',
      title: '一个人承担多个岗位',
      body: '文献调研、方法设计、写作、投稿，都压在同一个研究者身上。切换成本比工作量本身更贵。',
    },
    {
      n: '02',
      title: '工具很多，链路依然断裂',
      body: '文献库、AI 对话、LaTeX 工程和组会纪要散落各处，每次续写都在重建上下文。',
    },
    {
      n: '03',
      title: '审稿意见无法变成资产',
      body: '上一轮的意见、被拒的原因、有效的论证结构，散落在邮件和历史版本里，下次又从零开始。',
    },
    {
      n: '04',
      title: '进度只能靠人盯',
      body: '谁在写第几节、引用核到哪一条、方法复核有没有过，全靠你在群里追问。',
    },
  ] satisfies PainCard[],
};

/* ── 交付链路（深色区） ─────────────────────────────────────────── */

export const FLOW_SECTION = {
  kicker: 'FROM BRIEF TO DELIVERY',
  title: ['一条完整的论文', '交付链路。'],
  side: 'ShadowFlow 不是让几个聊天机器人各说各话，而是让每个角色基于同一份课题知识，接力完成同一个研究目标。',
  phases: [
    {
      key: 'PLAN',
      n: '02',
      title: '主控拆解',
      body: '识别课题范围，生成章节计划、任务清单和质量标准，并自动分配给合适的角色。',
      out: '章节计划与任务 DAG',
    },
    {
      key: 'CREATE',
      n: '03',
      title: '角色协同执行',
      body: '各角色基于同一份课题上下文接力推进，写作、核引、复核互不串台。',
      out: '分节初稿与核查记录',
    },
    {
      key: 'DELIVER',
      n: '04',
      title: '审核并完成交付',
      body: '统一文风、对齐口径、生成投稿材料，所有改动都能回溯到具体证据。',
      out: '可投稿的完整稿件',
    },
  ] satisfies PhaseCard[],
  /** 阶段卡默认展开哪一项（按 key 匹配，找不到就用第一项）。 */
  activeKey: 'PLAN',
  outLabel: '本次产出',
};

/* ── 团队 ───────────────────────────────────────────────────────── */

export const TEAM_SECTION = {
  kicker: 'A TEAM WITH BOUNDARIES',
  title: ['一支职责、专长、', '都有边界的 AI 团队。'],
  side: '每位角色都有明确的职责、输入、工具和交付标准。主控负责规划和调度，你始终保留最终决策权。',
  cards: [
    {
      code: 'A1',
      en: 'CHIEF OF STAFF',
      cn: '主控',
      desc: '接需求 · 拆任务 · 调度团队',
      face: '主控',
      tone: 'accent',
    },
    {
      code: 'A2',
      en: 'RESEARCHER',
      cn: '文献研究员',
      desc: '文献扫描 · 竞品基线 · 洞察提炼',
      face: 'PI',
      tone: 'teal',
    },
    {
      code: 'A3',
      en: 'STRATEGIST',
      cn: '方法设计',
      desc: '实验设计 · 消融规划 · 统计口径',
      face: '方法复核',
      tone: 'violet',
    },
    {
      code: 'A4',
      en: 'CREATIVE',
      cn: '章节主笔',
      desc: '章节撰写 · 图表脚本 · 投稿材料',
      face: '章节主笔',
      tone: 'pink',
    },
  ] satisfies CrewCard[],
  ready: 'READY TO WORK',
};

/* ── 知识沉淀 ───────────────────────────────────────────────────── */

export const KNOW_SECTION = {
  kicker: 'EVERY PROJECT MAKES YOU STRONGER',
  title: ['交付的不只是成果，', '更是课题组的', '长期资产。'],
  side: '每次项目的审稿意见、有效论证、写作偏好和交付标准都会回到课题组的记忆系统。下一次，不再从零开始。',
  core: { title: '课题组知识库', note: '持续学习中' },
  assets: [
    { name: '审稿意见', size: '18 条', pos: 'tl' },
    { name: '项目成果', size: '6 篇', pos: 'tr' },
    { name: 'SOP 模板', size: '4 套', pos: 'bl' },
    { name: '写作偏好', size: '持续学习', pos: 'br' },
  ] satisfies AssetCard[],
};

/* ── 收尾 ───────────────────────────────────────────────────────── */

export const FINAL_SECTION = {
  title: ['让一个人，', '也能带出一支专业的论文团队。'],
  note: '从今天开始，把角色分出去，把判断留给自己。',
};

export const FOOT_LINKS: NavItem[] = [
  { label: '产品价值', href: '#value' },
  { label: 'AI 团队', href: '#team' },
];

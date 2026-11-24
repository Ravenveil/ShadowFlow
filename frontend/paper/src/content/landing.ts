/**
 * landing.ts — 落地页的**全部可见文案与配图数据**（版式结构对齐 shadow-merge 营销页）。
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
  /** 图标 key（组件里按 key 映射图标）。 */
  icon: string;
}

export interface StepCard {
  id: string;
  label: string;
  title: string;
  description: string;
  result: string;
  icon: string;
}

export interface AssetCard {
  name: string;
  size: string;
  /** 四角方位：tl / tr / bl / br。 */
  pos: 'tl' | 'tr' | 'bl' | 'br';
  icon: string;
}

export interface PlanCard {
  name: string;
  price: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface DemoEventBase {
  kind: 'ceo' | 'user' | 'note' | 'team' | 'card' | 'done';
  text?: string;
  chips?: string[];
  members?: [string, string][];
  tone?: ToneName;
  title?: string;
  detail?: string;
  role?: string;
}

export interface DemoMetric {
  key: string;
  label: string;
  value: string;
  at: number;
}

export const LANDING_BRAND = {
  name: 'ShadowFlow',
  copyright: '© 2026 ShadowFlow · 论文协作平台',
};

export const LANDING_NAV: NavItem[] = [
  { label: '研究场景', href: '#pain' },
  { label: '闭环链路', href: '#workflow' },
  { label: 'Agent 团队', href: '#agents' },
  { label: '知识沉淀', href: '#outcomes' },
  { label: '案例演示', href: '#cases' },
  { label: '常见问题', href: '#faq' },
];

export const LANDING_CTA = {
  contact: '联系我们',
  enter: '进入工作台',
  enterTitle: '点击进入工作台',
  watch: '看看如何工作',
  apply: '提交申请',
};

/* ── Hero ───────────────────────────────────────────────────────── */

export const HERO = {
  pill: '为一人工信 / 科研团队打造',
  /** 主标题按行给，最后一行单独强调（accent 色）。 */
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
  /** 进度条百分比（0–100），与 state 文案里的数字保持一致。 */
  progress: 68,
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
  floatBadge: '3 个 Agent 正在协作',
};

/* ── 痛点 ───────────────────────────────────────────────────────── */

export const PAIN_SECTION = {
  kicker: 'RESEARCH SCENARIOS',
  title: ['论文协作场景，', '是否遇到以下问题？'],
  side: '当你同时是调研、方法、写作和投稿负责人，真正消耗精力的不是某一项工作，而是不断切换角色与拼接上下文。',
  cards: [
    {
      n: '01',
      title: '工具很多，链路依然断裂',
      body: '文献库、AI 对话、LaTeX 工程和组会纪要散落各处，每次续写都要重建上下文。',
      icon: 'network',
    },
    {
      n: '02',
      title: '一个人承担多个岗位',
      body: '文献调研、方法设计、写作、投稿，全压在同一个研究者身上。切换成本比工作量本身更贵。',
      icon: 'layers',
    },
    {
      n: '03',
      title: 'AI 输出难以稳定交付',
      body: '缺少负责人、验收标准、审核节点与修改记录，结果不可控、不可回溯。',
      icon: 'shield',
    },
    {
      n: '04',
      title: '项目经验无法变成资产',
      body: '审稿意见、有效论证和写作偏好散落历史文件，下一篇又要从零开始。',
      icon: 'database',
    },
  ] satisfies PainCard[],
};

/* ── 交付链路（深色区 · 四步交互） ──────────────────────────────── */

export const FLOW_SECTION = {
  kicker: 'CLOSED-LOOP WORKFLOW',
  title: ['闭环的链路，', '帮您解决上述问题。'],
  side: 'ShadowFlow 不是让几个聊天机器人各说各话，而是让每个角色基于同一份课题知识，接力完成同一个研究目标。',
  steps: [
    {
      id: '01',
      label: 'BRIEF',
      title: '录入课题需求',
      description: '把研究目标、已有材料、投稿要求结构化，告别散落在聊天记录里的零散需求。',
      result: '结构化课题 Brief',
      icon: 'message',
    },
    {
      id: '02',
      label: 'PLAN',
      title: '主控拆解',
      description: '识别课题范围，生成章节计划、任务清单和质量标准，并自动分配给合适的 AI 角色。',
      result: '章节计划与任务 DAG',
      icon: 'brain',
    },
    {
      id: '03',
      label: 'CREATE',
      title: '角色协同执行',
      description: '文献、方法、写作、核查角色共享同一份课题上下文，按上游成果连续协作，互不串台。',
      result: '分节初稿与核查记录',
      icon: 'network',
    },
    {
      id: '04',
      label: 'DELIVER',
      title: '审核并投稿交付',
      description: '在关键节点人工确认，集中查看版本、修改记录和交付状态，一键导出投稿材料。',
      result: '可审核、可修改、可投稿',
      icon: 'fileCheck',
    },
  ] satisfies StepCard[],
  /** 默认展开哪一步（按 id 匹配，找不到就用第一项）。 */
  activeId: '02',
  outLabel: '本阶段产出',
  live: 'LIVE',
};

/* ── Agent 团队 ─────────────────────────────────────────────────── */

export const TEAM_SECTION = {
  kicker: 'AGENT CLUSTER',
  title: ['Agent 员工集群，', '打造论文交付链路。'],
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
      desc: '文献扫描 · 基线对比 · 洞察提炼',
      face: 'PI',
      tone: 'blue',
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
    {
      code: 'A5',
      en: 'CITATION OFFICER',
      cn: '引用核查',
      desc: '引用核对 · 口径复核 · 依据溯源',
      face: '引用审查',
      tone: 'teal',
    },
    {
      code: 'A6',
      en: 'SUBMISSION MANAGER',
      cn: '投稿管理',
      desc: '格式对齐 · 材料打包 · 投稿跟进',
      face: '投稿管理',
      tone: 'green',
    },
  ] satisfies CrewCard[],
  ready: 'READY TO WORK',
  human: {
    kicker: 'HUMAN IN THE LOOP',
    title: 'AI 负责执行，你负责判断——关键策略、结论取舍与最终投稿都由你审核确认。',
    note: '所有改动可回溯到具体证据，你随时可以查看依据、修改内容、退回任务。',
  },
};

/* ── 知识沉淀 ───────────────────────────────────────────────────── */

export const KNOW_SECTION = {
  kicker: 'EVERY PROJECT MAKES YOU STRONGER',
  title: ['论文闭环链路长期沉淀，', '越来越聪明。'],
  side: '每次项目的审稿意见、有效论证、写作偏好和交付标准都会回到课题组的记忆系统。下一次，不再从零开始。',
  core: { title: '课题组知识库', note: '持续学习中' },
  assets: [
    { name: '审稿意见', size: '18 条', pos: 'tl', icon: 'message' },
    { name: '项目成果', size: '6 篇', pos: 'tr', icon: 'fileCheck' },
    { name: 'SOP 模板', size: '4 套', pos: 'bl', icon: 'layers' },
    { name: '写作偏好', size: '持续学习', pos: 'br', icon: 'target' },
  ] satisfies AssetCard[],
  metrics: [
    { k: '1', v: '个统一课题上下文' },
    { k: '∞', v: '次复用方法与经验' },
  ],
};

/* ── 口号带 ─────────────────────────────────────────────────────── */

export const SLOGAN = {
  kicker: 'YOUR LAB. YOUR METHOD. YOUR AI TEAM.',
  quote: '让一个人，也能带出一支专业的论文团队。',
};

/* ── 案例 + Demo ────────────────────────────────────────────────── */

export const CASE_SECTION = {
  kicker: 'CASE STUDY',
  title: ['客户案例：从组会稿', '到投稿材料全流程。'],
  side: '真实场景演示：上传组会记录与实验数据，主控拆解后分给各角色，最终产出投稿级稿件。',
  figures: [
    { caption: '组会记录 · 结构化入库', tone: 'teal' as ToneName, icon: 'message' },
    { caption: '实验数据 · 核对归档', tone: 'blue' as ToneName, icon: 'database' },
  ],
};

export const DEMO = {
  title: '课题组 · 组会稿转投稿稿',
  kicker: 'DEMO',
  leadLabel: '主控',
  userLabel: '用户 · 课题组',
  teamHead: 'Agent 团队已组建 · 任务自动分发',
  syncedLabel: '已同步平台',
  play: '播放演示',
  playing: '暂停',
  replay: '重新播放',
  next: '下一步',
  reset: '重置',
  progress: (step: number, total: number) => `第 ${step} / ${total} 步`,
  hint: '点击「播放演示」开始 →',
  boardTitle: '平台实时同步',
  running: 'Agent 团队执行中…',
  idle: '待开始',
  paused: '已暂停',
  finished: '全流程已跑通',
  events: [
    {
      kind: 'ceo',
      text: '你好，我是主控 👋 想把组会稿整理成投稿稿。请把材料发给我——文字介绍、实验数据或参考文献都可以。',
    },
    {
      kind: 'user',
      text: '组会稿第 3 版 · 附实验对比表与参考文献库。',
      chips: ['组会稿_v3.md', '实验对比表.xlsx', '参考文献.bib'],
    },
    {
      kind: 'note',
      text: '已自动同步 3 份资料到知识库（文字、表格、文献全部解析入库，团队随时调用）',
    },
    { kind: 'ceo', text: '资料已入库，课题要点已提取。正在为你组建专属 Agent 团队——' },
    {
      kind: 'team',
      members: [
        ['文献研究员', '补齐相关工作与基线'],
        ['方法设计', '核对实验口径与消融'],
        ['章节主笔', '生成章节骨架与初稿'],
        ['引用核查', '核对全部引用与依据'],
        ['投稿管理', '打包投稿材料'],
      ],
    },
    {
      kind: 'card',
      tone: 'blue',
      role: '文献研究员',
      title: '相关工作章节已补齐',
      detail: '新增 12 篇对比文献 · 基线口径与第 3 节实验表对齐',
    },
    {
      kind: 'card',
      tone: 'violet',
      role: '方法设计',
      title: '实验口径已核对',
      detail: '7B 与 13B 对比表单位统一 · 消融表补全 3 组缺失项',
    },
    {
      kind: 'card',
      tone: 'pink',
      role: '章节主笔',
      title: '章节骨架与初稿已生成',
      detail: '全文 6 节 · 第 4 节实验部分按目标会议模板排版',
    },
    {
      kind: 'card',
      tone: 'teal',
      role: '引用核查',
      title: '引用核查全部通过',
      detail: '52 条引用逐一核对 · 3 处口径不一致已修正并留痕',
    },
    {
      kind: 'card',
      tone: 'green',
      role: '投稿管理',
      title: '投稿材料已打包',
      detail: '正文 PDF · 源码 zip · 补充材料 · cover letter 一次生成',
    },
    {
      kind: 'done',
      text: '全流程跑通 ✅ 组会稿、实验表、引用与投稿材料已实时同步——你只需要，专注下一篇。',
    },
  ] satisfies DemoEventBase[],
  metrics: [
    { key: 'kb', label: '知识库资料', value: '3 份', at: 2 },
    { key: 'team', label: 'Agent 团队', value: '6 人', at: 4 },
    { key: 'ref', label: '相关工作', value: '12 篇', at: 5 },
    { key: 'exp', label: '消融核对', value: '3 组', at: 6 },
    { key: 'sec', label: '章节初稿', value: '6 节', at: 7 },
    { key: 'cite', label: '引用核查', value: '52 条', at: 8 },
    { key: 'pack', label: '投稿打包', value: '4 件', at: 9 },
  ] satisfies DemoMetric[],
};

/* ── 常见问题 ───────────────────────────────────────────────────── */

export const FAQ_SECTION = {
  title: '常见问题',
  contactLabel: '联系我们',
  items: [
    {
      q: 'ShadowFlow 和通用大模型有什么不同？',
      a: '通用大模型擅长单次对话与生成；ShadowFlow 把模型能力组织成有岗位、有上下游、有质量标准的论文流程，并将执行过程与课题、版本、引用和交付成果关联起来。',
    },
    {
      q: '我已经在用很多 AI 工具，还需要 ShadowFlow 吗？',
      a: 'ShadowFlow 不替代你喜爱的工具，而是统一承接需求、拆解任务、传递上下文和管理交付，减少在不同工具间复制资料、检查版本的时间。',
    },
    {
      q: 'AI 会直接把未经审核的内容发出去吗？',
      a: '不会。关键交付节点默认需要人工确认。你可以查看依据、修改内容、退回任务，并在确认后再导出或投稿。',
    },
    {
      q: '能否沉淀我自己的研究方法论？',
      a: '可以。专业定制版支持将你的写作规范、模板、案例和交付标准转化为专属 Skill、知识库和工作流，让个人经验成为可复用的课题组资产。',
    },
  ] satisfies FaqItem[],
};

/* ── 定价 ───────────────────────────────────────────────────────── */

export const PRICING_SECTION = {
  kicker: 'PRICING',
  title: '从一个课题开始，搭建你的 AI 论文团队。',
  note: '以下为产品规划参考，正式价格与方案以公布为准。',
  plans: [
    {
      name: '体验版',
      price: '免费',
      features: ['3 位预设 AI 角色', '500 基础积分', '单课题工作台'],
      cta: '免费开始',
    },
    {
      name: '课题组版',
      price: '66 RMB / 月',
      features: ['1000 + 2000 赠送积分', '多课题项目管理', '课题组知识库'],
      cta: '开始 14 天试用',
      featured: true,
    },
    {
      name: '专业定制版',
      price: '定制',
      features: ['专属 Skill 与角色', '知识库迁移', '定制工作流与部署'],
      cta: '联系方案顾问',
    },
  ] satisfies PlanCard[],
};

/* ── 收尾 ───────────────────────────────────────────────────────── */

export const FINAL_SECTION = {
  title: ['让一个人，', '也能带出一支专业的论文团队。'],
  note: '从今天开始，把角色分出去，把判断留给自己。',
};

/* ── 页脚 ───────────────────────────────────────────────────────── */

export const FOOT = {
  desc: '让一个人，也能带出一支专业的论文团队。',
  productTitle: '产品',
  productLinks: [
    { label: '闭环链路', href: '#workflow' },
    { label: 'Agent 团队', href: '#agents' },
    { label: '价格方案', href: '#pricing' },
  ] satisfies NavItem[],
  resourceTitle: '资源',
  resourceLinks: [
    { label: '帮助中心', href: '#faq' },
    { label: '研究场景', href: '#pain' },
    { label: '联系我们', href: '#contact' },
  ] satisfies NavItem[],
  newsTitle: '获取产品进展',
  newsHint: '订阅内测与产品更新',
  newsDone: '已收到，感谢订阅！',
  newsPlaceholder: '你的邮箱',
  newsSubmit: '订阅',
  newsCta: '注册账号，直接开始',
  legal: [
    { label: '隐私政策', href: '#privacy' },
    { label: '服务条款', href: '#terms' },
  ] satisfies NavItem[],
};

/* ── 联系 / 申请弹窗 ────────────────────────────────────────────── */

export const CONTACT_MODAL = {
  demoTitle: '看看 ShadowFlow 如何帮你交付下一篇论文',
  planTitle: (plan: string) => `申请 ${plan}`,
  subtitle: '留下你的信息，我们将在 1 个工作日内与你联系。',
  nameLabel: '你的称呼',
  namePlaceholder: '怎么称呼你',
  emailLabel: '工作邮箱',
  emailPlaceholder: 'name@lab.edu.cn',
  stageLabel: '你目前的研究阶段',
  stagePlaceholder: '请选择',
  stages: ['准备开题', '已有初稿', '准备投稿'],
  needLabel: '最想解决的问题',
  needPlaceholder: '例如：多课题进度管理、写作交付效率、知识沉淀…',
  submit: '提交申请',
  /** 留资 note 里给 stage / need 打的前缀标签 */
  stageTagPrefix: '阶段:',
  needTagPrefix: '需求:',
  successKicker: 'SUBMITTED',
  successTitle: '已收到你的申请',
  successBody: '感谢关注 ShadowFlow。我们会尽快通过邮件与你联系。',
  successCta: '进入工作台',
  successSkip: '暂不注册，先逛逛',
  close: '关闭',
};

/* ── 登录 / 注册弹窗（演示态：提交即进入工作台） ─────────────────── */

export const AUTH_MODAL = {
  loginKicker: 'SIGN IN',
  registerKicker: 'CREATE ACCOUNT',
  loginTitle: '登录 ShadowFlow',
  registerTitle: '创建你的 ShadowFlow 账号',
  loginBody: '登录以继续你的工作空间；或以演示模式直接浏览。',
  registerBody: '注册后可同步工作空间、审批记录与知识库；不注册也可以演示模式浏览。',
  tabLogin: '登录',
  tabRegister: '注册',
  nameLabel: '你的称呼',
  namePlaceholder: '怎么称呼你（可选）',
  emailLabel: '邮箱',
  emailPlaceholder: 'name@lab.edu.cn',
  passwordLabel: '密码',
  passwordLoginPlaceholder: '你的密码',
  passwordRegisterPlaceholder: '至少 8 位',
  submitLogin: '登录',
  submitRegister: '创建账号',
  busy: '请稍候…',
  errorFallback: '操作失败，请稍后再试',
  guestErrorFallback: '游客登录失败，请稍后再试',
  switchToRegister: '还没有账号？立即注册',
  switchToLogin: '已有账号？去登录',
  guest: '游客一键体验',
  skip: '先以演示模式浏览',
  doneKicker: 'WELCOME',
  doneTitle: '账号创建成功',
  doneLoginTitle: '登录成功',
  doneBody: '正在进入你的工作台…',
  doneCta: '开始使用',
  close: '关闭',
};

/** Demo 事件卡的色调 → 色调名（组件按 tone 取 `--tone-*`）。 */
export const DEMO_TONE_LABELS: Record<string, string> = {
  blue: '文献研究员',
  violet: '方法设计',
  pink: '章节主笔',
  teal: '引用核查',
  green: '投稿管理',
};

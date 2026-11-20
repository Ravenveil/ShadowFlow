/**
 * mock.ts — 演示态数据集（**只被 data/source.ts 消费**）。
 *
 * 组件不要直接 import 这里：数据一律经 `data/source.ts` 的 WorkspaceSource，
 * 这样换成真接口时只改 source.ts 一处（`npm run check` 会拦住违规引用）。
 */
import type {
  DagEdgeDef,
  DagNodeDef,
  Message,
  PanelSummary,
  PolicyMatrix,
  AppSettings,
  ComposerData,
  Session,
} from './types';

/**
 * 论文团队角色（与 templates/academic-paper.yaml 对齐）。
 * 暂未接入 UI —— 右栏编队目前读下面手写的 ROSTER；等 yaml 那侧接上后，
 * roster 由这份表生成，ROSTER 里的 name/note 挪进后端。
 */
export const TEAM_ROLES = [
  { id: 'pi', name: 'PI', cn: '课题负责人', soul: '把控研究方向与学术严谨性' },
  { id: 'section-writer', name: 'SectionWriter', cn: '章节主笔', soul: '按 section 拆分写作任务' },
  { id: 'citation-reviewer', name: 'CitationReviewer', cn: '引用审查', soul: '核对引用完整性与证据链' },
  { id: 'method-reviewer', name: 'MethodReviewer', cn: '方法复核', soul: '复核实验方法与统计推断' },
  { id: 'editorial-polisher', name: 'EditorialPolisher', cn: '润色编辑', soul: '文风润色与学术表达规范化' },
  { id: 'submission-manager', name: 'SubmissionManager', cn: '投稿管理', soul: '会议/期刊投稿流程管理' },
] as const;

export const SESSIONS: Session[] = [
  {
    id: 'lead',
    title: '主控',
    kind: 'dm',
    members: ['主控'],
    updatedAt: '59 分钟前',
    status: 'active',
  },
  {
    id: 'grp-paper',
    title: '论文平台 · 综述写作组',
    kind: 'group',
    members: ['主控', 'PI', '章节主笔', '引用审查', '方法复核'],
    updatedAt: '12 分钟前',
    unread: 2,
    status: 'active',
  },
  {
    id: 'grp-submit',
    title: '投稿战情室',
    kind: 'group',
    members: ['主控', '投稿管理', '润色编辑'],
    updatedAt: '昨天',
    status: 'idle',
  },
  {
    id: 'proj-lit',
    title: '文献综述 · LLM Agent',
    kind: 'project',
    members: ['主控', 'PI'],
    updatedAt: '2 天前',
    status: 'done',
  },
  {
    id: 'proj-exp',
    title: '实验设计与消融',
    kind: 'project',
    members: ['主控', '方法复核'],
    updatedAt: '3 天前',
    status: 'idle',
  },
];

export const MESSAGES: Message[] = [
  {
    id: 'm1',
    role: 'user',
    time: '17:02',
    kind: 'text',
    text: '帮我把这周的组会稿整理成一篇可投的综述，主题是「多智能体协作中的角色分工」。目标 NeurIPS workshop，8 页。',
  },
  {
    id: 'm2',
    role: 'agent',
    author: '主控',
    time: '17:02',
    kind: 'text',
    text: '明白。我按「先定骨架、再填内容、最后过审」三段来推。先让 PI 把论证主线拉出来，再分给主笔和两位审查。这一轮我盯闭环，你不用逐个 @ 人。',
  },
  {
    id: 'm3',
    role: 'agent',
    author: '主控',
    time: '17:03',
    kind: 'run',
    run: {
      title: '论文写作流水线',
      model: 'Claude Sonnet 4.6',
      durationMs: 255000,
      steps: [
        { n: 1, title: '拆解选题与论点边界', agent: 'PI', status: 'done', ms: 32000 },
        { n: 2, title: '生成章节骨架与字数配比', agent: 'PI', status: 'done', ms: 18000 },
        { n: 3, title: '并行撰写 4 个 section', agent: '章节主笔', status: 'done', ms: 96000 },
        { n: 4, title: '引用完整性与证据链核查', agent: '引用审查', status: 'running', ms: 41000 },
        { n: 5, title: '方法与统计口径复核', agent: '方法复核', status: 'wait' },
        { n: 6, title: '统一文风并合并成稿', agent: '润色编辑', status: 'wait' },
      ],
    },
  },
  {
    id: 'm4',
    role: 'agent',
    author: '主控',
    time: '17:05',
    kind: 'team',
    team: {
      title: '3 位团队成员',
      members: [
        {
          id: 'sw',
          name: '程不宕',
          role: '章节主笔',
          status: 'done',
          note: '4 个 section 已交，共 6,240 字',
        },
        {
          id: 'cr',
          name: '闻引',
          role: '引用审查',
          status: 'running',
          note: '已核 38 / 52 条，2 条待补出处',
        },
        {
          id: 'mr',
          name: 'test-fix-worker',
          role: '方法复核',
          status: 'done',
          note: '消融表口径已对齐',
        },
      ],
    },
  },
  {
    id: 'm5',
    role: 'agent',
    author: '引用审查',
    time: '17:06',
    kind: 'text',
    text: '第 3 节有两处引用了 2024 年的预印本，但正文按已发表口径写的。建议改成 arXiv 版本，或者补一条正式发表的替代文献 —— 我先把候选列在下面，你确认后我替换。',
  },
  {
    id: 'm6',
    role: 'agent',
    author: '主控',
    time: '17:07',
    kind: 'text',
    text: '我把这条挂成待办，等你这轮确认完一起改，避免中途改稿导致版本对不上。目前交付物先出骨架版，你过一眼结构。',
    artifacts: [
      { name: '综述骨架-v0.3.md', kind: 'paper', size: '24 KB', meta: '6 sections · 8 页目标' },
      { name: 'references.bib', kind: 'bib', size: '52 条', meta: '2 条待补' },
    ],
  },
];

/** 右栏「编队」成员（策略举证的行/列头也用它，保证同一张脸）。 */
export const ROSTER = [
  { id: 'lead', name: '主控', role: '主控', short: '主控', note: '派活 · 盯闭环', state: 'busy' },
  { id: 'pi', name: 'PI', role: 'PI', short: 'PI', note: '论证主线', state: 'idle' },
  { id: 'sw', name: '程不宕', role: '章节主笔', short: '主笔', note: '4 section 已交', state: 'idle' },
  { id: 'cr', name: '闻引', role: '引用审查', short: '引用', note: '核 38 / 52 条', state: 'busy' },
  { id: 'mr', name: 'test-fix-worker', role: '方法复核', short: '复核', note: '消融已对齐', state: 'idle' },
  { id: 'ep', name: '顾清', role: '润色编辑', short: '润色', note: '文风与格式', state: 'idle' },
] as const;

/**
 * 策略举证种子矩阵（行 = 发起方，列 = 接收方；与后端 policy-gate 方向一致）。
 * 语义：谁的产出可以不经复核被引用/合并 —— permit 直通、warn 需 PI 复核、deny 禁止。
 */
export const POLICY_SEED: PolicyMatrix = {
  lead: { pi: 'permit', sw: 'permit', cr: 'permit', mr: 'permit', ep: 'permit' },
  pi: { lead: 'permit', sw: 'permit', cr: 'permit', mr: 'warn', ep: 'permit' },
  sw: { pi: 'permit', cr: 'warn', mr: 'warn', ep: 'permit' },
  cr: { sw: 'deny', mr: 'permit', ep: 'permit' },
  mr: { sw: 'warn', cr: 'deny' },
  ep: { cr: 'permit', mr: 'permit' },
};

/** DAG 工作流（论文流水线；中间两步并行复核，最后一道是审批门）。 */
export const DAG_CANVAS = { w: 308, h: 348 };

export const DAG_NODES: DagNodeDef[] = [
  { id: 'n1', label: '拆解选题', owner: 'pi', role: '定论点边界', status: 'done', layout: { x: 84, y: 0, w: 140, h: 44 } },
  { id: 'n2', label: '章节骨架', owner: 'pi', role: '字数配比', status: 'done', layout: { x: 84, y: 66, w: 140, h: 44 } },
  { id: 'n3', label: '并行撰写', owner: 'sw', role: '4 个 section', status: 'done', layout: { x: 84, y: 132, w: 140, h: 44 } },
  { id: 'n4', label: '引用核查', owner: 'cr', role: '证据链 · 38/52', status: 'running', layout: { x: 16, y: 206, w: 132, h: 44 } },
  { id: 'n5', label: '方法复核', owner: 'mr', role: '统计口径', status: 'wait', layout: { x: 160, y: 206, w: 132, h: 44 } },
  { id: 'n6', label: '合并成稿', owner: 'ep', role: '统一文风', status: 'wait', layout: { x: 84, y: 280, w: 140, h: 44 } },
];

export const DAG_EDGES: DagEdgeDef[] = [
  { from: 'n1', to: 'n2', mode: 'direct' },
  { from: 'n2', to: 'n3', mode: 'direct' },
  { from: 'n3', to: 'n4', mode: 'direct' },
  { from: 'n3', to: 'n5', mode: 'direct' },
  { from: 'n4', to: 'n6', mode: 'conditional', label: '2 条待补' },
  { from: 'n5', to: 'n6', mode: 'approve', label: '需你确认' },
];

export const PANEL: PanelSummary = {
  runTitle: 'LLM Agent 角色分工综述',
  elapsed: '12m 40s',
  contextPct: 62,
  tokensUsed: 158000,
  tokensCap: 256000,
  steps: [
    { label: '核准综述范围与目标会议', done: true, agent: '主控', ms: 32000 },
    { label: '拉出论证主线与章节边界', done: true, agent: 'PI', ms: 18000 },
    { label: '并行撰写 4 个 section', done: true, agent: '章节主笔', ms: 96000 },
    { label: '引用完整性与证据链核查', done: false, agent: '引用审查', ms: 41000 },
    { label: '方法与统计口径复核', done: false, agent: '方法复核' },
    { label: '统一文风并合并成稿', done: false, agent: '润色编辑' },
  ],
  artifacts: [
    { name: '综述骨架-v0.3.md', kind: 'paper', size: '24 KB' },
    { name: 'references.bib', kind: 'bib', size: '52 条' },
    { name: 'fig-role-taxonomy.svg', kind: 'figure', size: '182 KB' },
  ],
  subAgents: [
    { name: '章节主笔', state: 'off' },
    { name: '引用审查', state: 'busy' },
    { name: '方法复核', state: 'off' },
  ],
  approval: {
    gate: '1 道审批门',
    note: '「合并成稿」前需要你确认，其余节点主控自闭环。',
  },
};

/** 输入框的可选资源：模型（CLI / API 两组）、斜杠命令、知识包。 */
export const COMPOSER_DATA: ComposerData = {
  models: [
    { id: 'cli:claude', label: 'Claude Code', group: 'CLI', note: 'Opus 4.6 · 已装' },
    { id: 'cli:codex', label: 'Codex CLI', group: 'CLI', note: 'GPT-5.2 · 已装' },
    { id: 'cli:gemini', label: 'Gemini CLI', group: 'CLI', note: '3 Pro · 已装' },
    { id: 'api:deepseek', label: 'DeepSeek', group: 'API', note: 'V4.1 · 自有 Key' },
    { id: 'api:kimi', label: 'Kimi', group: 'API', note: 'K2 · 自有 Key' },
    { id: 'api:qwen', label: 'Qwen', group: 'API', note: '3 Max · 自有 Key' },
  ],
  commands: [
    { id: 'clear', name: '/clear', desc: '清空输入框、附件与已选知识包', action: 'clear' },
    { id: 'help', name: '/help', desc: '查看快捷键与命令说明', action: 'help' },
    { id: 'inspect', name: '/inspect', desc: '跳到右栏看本轮执行记录', action: 'inspect' },
    { id: 'outline', name: '/outline', desc: '插入章节骨架指令', insert: '按以下结构生成章节骨架，并标出每节字数配比：' },
    { id: 'cite', name: '/cite', desc: '插入引用补齐指令', insert: '为下面这段补 3 条可核查引用（作者 · 年份 · 出处）：' },
    { id: 'review', name: '/review', desc: '插入交叉复核指令', insert: '交叉复核这版结论，逐条指出证据不足与口径风险：' },
    { id: 'figure', name: '/figure', desc: '插入配图说明指令', insert: '把这段改写成配图说明，注明数据来源与坐标含义：' },
    { id: 'polish', name: '/polish', desc: '插入文风统一指令', insert: '在不改变结论的前提下统一文风，删掉口语化表达：' },
  ],
  knowledge: [
    { id: 'kp-lit', name: '文献综述库', desc: '近五年同主题论文与预印本', docs: 128 },
    { id: 'kp-exp', name: '实验记录', desc: '消融、参数扫描与日志', docs: 34 },
    { id: 'kp-fig', name: '图表素材', desc: '可复用配图与原始数据', docs: 61 },
    { id: 'kp-style', name: '期刊格式规范', desc: '目标会议的模板与引用样式', docs: 6 },
  ],
};

/**
 * 设置演示数据。形状见 `data/types.ts` 的 AppSettings；
 * 每个分区的**文案**在 `content/settings.ts`，这里只有值。
 */
export const SETTINGS_SEED: AppSettings = {
  profile: {
    name: '王佳音',
    email: 'wjy@lab.paper.local',
    org: '智能写作实验室 · 论文组',
    timezone: 'Asia/Shanghai',
  },
  writing: {
    citation: 'gbt7714',
    dateFormat: 'iso',
    refLang: 'mixed',
    autoNumber: true,
  },
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      vendor: '深度求索',
      tone: 'blue',
      key: 'sk-de••••••••3f7a',
      models: ['V4.1', 'V4.1-Chat', 'R2'],
      defaultModel: 'V4.1',
      on: true,
      state: 'ok',
    },
    {
      id: 'anthropic',
      name: 'Claude',
      vendor: 'Anthropic',
      tone: 'amber',
      key: 'sk-ant-••••••2c19',
      models: ['Opus 4.6', 'Sonnet 4.6'],
      defaultModel: 'Sonnet 4.6',
      on: true,
      state: 'ok',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      vendor: 'OpenAI',
      tone: 'green',
      key: '',
      models: ['GPT-5.2', 'GPT-5 mini'],
      defaultModel: 'GPT-5.2',
      on: false,
      state: 'idle',
    },
    {
      id: 'kimi',
      name: 'Kimi',
      vendor: '月之暗面',
      tone: 'violet',
      key: 'sk-km••••••••91bd',
      models: ['K2', 'K2-Turbo'],
      defaultModel: 'K2',
      on: true,
      state: 'error',
    },
  ],
  clis: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      bin: 'claude',
      version: '2.6.1',
      path: '~/.local/bin/claude',
      installed: true,
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      version: '0.41.0',
      path: '/usr/local/bin/codex',
      installed: true,
    },
    {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      bin: 'gemini',
      version: '—',
      path: '—',
      installed: false,
    },
  ],
  ssh: [
    {
      id: 'gpu-a',
      name: '实验机 A100',
      host: 'gpu-lab-01.lab.local',
      user: 'wjy',
      port: 22,
      keyPath: '~/.ssh/id_ed25519',
      remoteDir: '/data/wjy/paper-runs',
      state: 'ok',
      latencyMs: 42,
      gpu: '2 × A100 80G',
    },
    {
      id: 'gpu-b',
      name: '本地 4090 工作站',
      host: '10.0.12.34',
      user: 'wang',
      port: 2222,
      keyPath: '~/.ssh/lab_4090',
      remoteDir: '/home/wang/runs',
      state: 'untested',
      gpu: 'RTX 4090 24G',
    },
  ],
  connectors: [
    {
      id: 'zotero',
      name: 'Zotero',
      desc: '文献库 · 自动同步条目与 PDF',
      tone: 'red',
      on: true,
      state: 'ok',
    },
    {
      id: 'overleaf',
      name: 'Overleaf',
      desc: 'LaTeX 项目 · 双向同步 .tex',
      tone: 'green',
      on: true,
      state: 'ok',
    },
    {
      id: 'github',
      name: 'GitHub',
      desc: '代码仓库 · 提交实验代码与图脚本',
      tone: 'slate',
      on: true,
      state: 'expired',
    },
    {
      id: 'notion',
      name: 'Notion',
      desc: '组会记录 · 读会议纪要当上下文',
      tone: 'violet',
      on: false,
      state: 'off',
    },
    {
      id: 'mcp-arxiv',
      name: 'arXiv MCP',
      desc: 'MCP 服务 · 检索预印本元数据',
      tone: 'blue',
      on: true,
      state: 'ok',
    },
  ],
  memory: [
    {
      id: 'lessons',
      label: '经验沉淀',
      note: '每次交付自动总结，下次开工自动带上下文',
      on: true,
      used: 428,
      cap: 600,
    },
    {
      id: 'profile',
      label: '运行画像',
      note: '角色偏好、常用口径、审稿口味',
      on: true,
      used: 56,
      cap: 120,
    },
    {
      id: 'river',
      label: 'River 手动记忆',
      note: '你亲手记下的判断，不会被自动覆盖',
      on: false,
      used: 12,
      cap: 200,
    },
  ],
  collab: [
    {
      id: 'lead-only',
      label: '群里默认只跟主控对话',
      note: '关掉后可以直接 @ 任意角色派活',
      on: true,
    },
    {
      id: 'approve-gate',
      label: '关键节点需人工确认',
      note: '合并成稿、对外投稿前挂审批门',
      on: true,
    },
    {
      id: 'auto-dispatch',
      label: '主控自动派活',
      note: '不打断你，先拆步骤再分给角色',
      on: true,
    },
    {
      id: 'parallel',
      label: '并行上限',
      note: '同时最多跑几个角色',
      value: '3',
    },
  ],
  notify: [
    { id: 'run-done', label: '任务跑完', note: '一轮流水线交付时提醒', on: true },
    { id: 'gate', label: '审批门待办', note: '需要你拍板的节点', on: true },
    { id: 'budget', label: '额度预警', note: '上下文或 token 用到 80%', on: true },
    { id: 'weekly', label: '每周汇总', note: '周一早上发一封进度摘要', on: false },
  ],
  privacy: [
    { id: 'local-only', label: '数据不出本机', note: '关闭后才会把正文送到云端模型', on: true },
    { id: 'telemetry', label: '匿名使用统计', note: '只上报功能点击，不含内容', on: false },
    { id: 'autosave', label: '自动保存草稿', note: '关闭后 Ctrl + S 才落盘', on: true },
  ],
};

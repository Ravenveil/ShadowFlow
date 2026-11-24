/**
 * mock.ts — 演示态数据集（**只被 data/source.ts 消费**）。
 *
 * 组件不要直接 import 这里：数据一律经 `data/source.ts` 的 WorkspaceSource，
 * 这样换成真接口时只改 source.ts 一处（`npm run check` 会拦住违规引用）。
 */
import { COMMANDS } from './commands';
import type {
  DagEdgeDef,
  DagNodeDef,
  Message,
  PanelSummary,
  PolicyMatrix,
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

/**
 * 演示态的会话工作目录（右栏「产物」页的真实数据单元）。
 *
 * 与上面 `PANEL.artifacts` 同名：真后端里这两处分别是「面板摘要」和「磁盘目录」，
 * 演示态没有磁盘，就用这一份把两边对齐 —— 点开看到的内容也是真的 Markdown/BibTeX。
 */
export const ARTIFACT_FILES: { name: string; size: number; mtime: number; body: string }[] = [
  {
    name: '综述骨架-v0.3.md',
    size: 24576,
    mtime: Date.UTC(2026, 10, 20, 17, 5),
    body: `# 角色分工驱动的多智能体协作：现状与缺口（v0.3）

## 1 引言
多智能体系统（MAS）的收益长期被表述为「并行」与「分工」，但近三年的实证研究
显示，收益主要来自**角色边界的显式化**：谁产出、谁复核、谁放行 —— 而不是 agent 数量。

## 2 相关工作
### 2.1 角色特化
- CAMEL / AutoGen / MetaGPT 三者的角色设定差异，集中在「产出是否经过他人验收」。
- 角色特化能提升单步质量，但会带来交接损耗（handoff cost）。

### 2.2 交接与验收
现有工作多把验收当作提示词约束，缺少可审计的边界。

## 3 研究缺口
1. 角色间的**举证责任**没有被建模成可配置的策略矩阵；
2. 交接内容缺少结构化留痕，失败时无法定位到哪一步；
3. 并行产出的合并缺少统一口径（谁有权合并、依据是什么）。

## 4 方法（待写）
以「策略举证矩阵 + 节点级审批门」为骨架，把角色边界从提示词提升为运行时约束。

## 5 实验设计（待写）
- RQ1：显式策略矩阵是否降低越权引用率；
- RQ2：审批门是否把返工成本前移；
- RQ3：交接留痕对失败定位的加速程度。

## 6 讨论与限制
单团队规模有限；跨团队协作的成本曲线尚未测量。

---
TODO（主笔）：第 3 节补两条 2025 年的对照实验；第 5 节写清消融设置。
`,
  },
  {
    name: 'references.bib',
    size: 53248,
    mtime: Date.UTC(2026, 10, 20, 16, 48),
    body: `@inproceedings{wu2023autogen,
  title     = {AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation},
  author    = {Wu, Qingyun and Bansal, Gagan and Zhang, Jieyu and others},
  booktitle = {arXiv preprint arXiv:2308.08155},
  year      = {2023}
}

@article{hong2023metagpt,
  title   = {MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework},
  author  = {Hong, Sirui and Zhuge, Mingchen and Chen, Jonathan and others},
  journal = {arXiv preprint arXiv:2308.00352},
  year    = {2023}
}

@inproceedings{li2023camel,
  title     = {CAMEL: Communicative Agents for 'Mind' Exploration of Large Language Models},
  author    = {Li, Guohao and Hammoud, Hasan Abed Al Kader and Itani, Hani and others},
  booktitle = {NeurIPS},
  year      = {2023}
}

% TODO（引用审查）：两条 2024 预印本要换成正式发表版本，或补一条替代文献。
`,
  },
  {
    name: 'fig-role-taxonomy.svg',
    size: 186368,
    mtime: Date.UTC(2026, 10, 20, 15, 22),
    body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260" width="480" height="260">
  <rect width="480" height="260" fill="#fbfaf7"/>
  <text x="20" y="30" font-family="sans-serif" font-size="14" fill="#2b2b2b">角色分工与举证方向</text>
  <rect x="24" y="60" width="120" height="56" rx="8" fill="#fff" stroke="#d8d4cc"/>
  <text x="84" y="93" font-family="sans-serif" font-size="12" fill="#2b2b2b" text-anchor="middle">主控</text>
  <rect x="180" y="60" width="120" height="56" rx="8" fill="#fff" stroke="#d8d4cc"/>
  <text x="240" y="93" font-family="sans-serif" font-size="12" fill="#2b2b2b" text-anchor="middle">章节主笔</text>
  <rect x="336" y="60" width="120" height="56" rx="8" fill="#fff" stroke="#d8d4cc"/>
  <text x="396" y="93" font-family="sans-serif" font-size="12" fill="#2b2b2b" text-anchor="middle">引用审查</text>
  <line x1="144" y1="88" x2="180" y2="88" stroke="#8a8578" stroke-width="1.5"/>
  <line x1="300" y1="88" x2="336" y2="88" stroke="#8a8578" stroke-width="1.5" stroke-dasharray="4 3"/>
  <rect x="180" y="160" width="120" height="56" rx="8" fill="#fff" stroke="#d8d4cc"/>
  <text x="240" y="193" font-family="sans-serif" font-size="12" fill="#2b2b2b" text-anchor="middle">润色编辑</text>
  <line x1="240" y1="116" x2="240" y2="160" stroke="#8a8578" stroke-width="1.5"/>
</svg>
`,
  },
];

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
  commands: COMMANDS,
  knowledge: [
    { id: 'kp-lit', name: '文献综述库', desc: '近五年同主题论文与预印本', docs: 128 },
    { id: 'kp-exp', name: '实验记录', desc: '消融、参数扫描与日志', docs: 34 },
    { id: 'kp-fig', name: '图表素材', desc: '可复用配图与原始数据', docs: 61 },
    { id: 'kp-style', name: '期刊格式规范', desc: '目标会议的模板与引用样式', docs: 6 },
  ],
};

/* 设置缺省值挪到 defaults.ts（http 映射层共用），这里只做转发。 */
export { SETTINGS_SEED } from './defaults';

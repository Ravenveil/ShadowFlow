/**
 * mock.ts — 演示态数据集（**只被 data/source.ts 消费**）。
 *
 * 组件不要直接 import 这里：数据一律经 `data/source.ts` 的 WorkspaceSource，
 * 这样换成真接口时只改 source.ts 一处（`npm run check` 会拦住违规引用）。
 */
import { COMMANDS } from '@/shared/data/commands';
import type {
  ArcPipelineView,
  ArcRunCard,
  DagEdgeDef,
  DagNodeDef,
  Message,
  PanelSummary,
  PolicyMatrix,
  ComposerData,
  Session,
  TimelineMessage,
} from '@/shared/data/types';

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
    text: [
      '第 3 节有两处引用了 2024 年的预印本，但正文按**已发表**口径写的。我先把候选列在下面，你确认后我替换：',
      '',
      '**待替换的 2 条**',
      '',
      '1. `[12]` Bazerman & Chen (2024) —— 预印本，正文写作「已发表」',
      '2. `[27]` Kuhn et al. (2024) —— 同上，且 BibTeX 缺 `journal` 字段',
      '',
      '| # | 现引用 | 建议替换 | 影响 |',
      '|---|---|---|---|',
      '| 12 | arXiv 2403.xxxxx | NeurIPS 2024 正式版 | 无需改论述 |',
      '| 27 | arXiv 2405.xxxxx | 暂无正式版，改「预印本」口径 | 需改 1 句 |',
      '',
      '确认后我一并改 BibTeX 并重跑引用检查。',
    ].join('\n'),
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

/**
 * 演示态时间线：一轮真实的「过程帧」长什么样。
 *
 * 这一份不是给组件看的假数据，而是**渲染契约的样本** —— 后端 20+ 种 kind 里
 * 最常出现的那些各来一格（思考 / 工具 / 步骤树 / 正文 / 计划 / 表格 / 裁决 /
 * 收尾 / 系统提示），排版问题在离线就能看见，不必等真跑一轮。
 */
const T0 = Date.now() - 42 * 60_000;

export const TIMELINE_DEMO: TimelineMessage[] = [
  {
    id: 'd1',
    kind: 'user_turn',
    turn_id: 'd1',
    ts: T0,
    text: '帮我把这周的组会稿整理成一篇可投的综述，主题是「多智能体协作中的角色分工」。目标 NeurIPS workshop，8 页。',
  },
  {
    id: 'd2',
    kind: 'thinking',
    turn_id: 'd1',
    ts: T0 + 800,
    label: '主控 正在思考',
    status: 'done',
    duration_ms: 6400,
    tokens: 842,
    preview: '先确认目标会议与篇幅，再决定要不要拆给三个人',
    body: '用户要的是一篇 8 页 workshop 投稿，不是完整期刊稿。\n先定骨架（6 节 + 字数配比），再并行填内容比串行快一倍。\n引用必须先核，否则最后合并时返工。',
    agent_name: '主控',
    agent_id: 'lead',
  },
  {
    id: 'd3',
    kind: 'tool_call',
    turn_id: 'd1',
    ts: T0 + 7600,
    name: 'read_file',
    args_summary: 'docs/组会稿-2026-11-18.md',
    status: 'ok',
    duration_ms: 210,
    result_summary: '读到 42 段、约 3,100 字；含 4 处 TODO 与 6 条待补引用。',
    agent_name: '主控',
    agent_id: 'lead',
  },
  {
    id: 'd4',
    kind: 'tool_echo',
    turn_id: 'd1',
    ts: T0 + 7900,
    body: '# 组会稿（11-18）\n\n## 1 动机\n多智能体系统里角色怎么分…… TODO 补 2 篇 2025 的新工作',
    agent_name: '主控',
    agent_id: 'lead',
  },
  {
    id: 'd5',
    kind: 'assistant_text',
    turn_id: 'd1',
    ts: T0 + 8400,
    body: '明白。我按「先定骨架、再填内容、最后过审」三段来推。先让 PI 把论证主线拉出来，再分给主笔和两位审查。这一轮我盯闭环，你不用逐个 @ 人。',
    sender_name: '主控',
    agent_id: 'lead',
  },
  {
    id: 'd6',
    kind: 'plan_card',
    turn_id: 'd1',
    ts: T0 + 9000,
    title: '综述写作流水线',
    goal: '把组会稿扩成 8 页 workshop 投稿',
    tasks: [
      { id: 't1', title: '拆解选题与论点边界', assignee: 'PI', status: 'done', batch: 1, elapsed_ms: 32000 },
      { id: 't2', title: '生成章节骨架与字数配比', assignee: 'PI', status: 'done', batch: 1, elapsed_ms: 18000 },
      { id: 't3', title: '并行撰写 4 个 section', assignee: '章节主笔', status: 'done', batch: 2, elapsed_ms: 96000 },
      { id: 't4', title: '引用完整性与证据链核查', assignee: '引用审查', status: 'running', batch: 2, elapsed_ms: 41000 },
      { id: 't5', title: '方法与统计口径复核', assignee: '方法复核', status: 'pending', batch: 3 },
    ],
  },
  {
    id: 'd7',
    kind: 'hop_card',
    turn_id: 'd1',
    ts: T0 + 38000,
    from_agent: 'lead',
    to_agent: 'cr',
    from_name: '主控',
    to_name: '引用审查',
    status: 'done',
    output_chars: 6240,
    duration_ms: 31000,
  },
  {
    id: 'd8',
    kind: 'step_panel',
    turn_id: 'd1',
    ts: T0 + 39000,
    total_steps: 4,
    steps: [
      { name: '核准综述范围与目标会议', status: 'done', elapsed_ms: 32000 },
      { name: '拉出论证主线与章节边界', status: 'done', elapsed_ms: 18000 },
      {
        name: '并行撰写 4 个 section',
        status: 'done',
        elapsed_ms: 96000,
        substeps: [
          { name: '§2 相关工作', status: 'done', elapsed_ms: 24000 },
          { name: '§3 角色划分taxonomy', status: 'done', elapsed_ms: 31000 },
          { name: '§4 协作协议', status: 'done', elapsed_ms: 22000 },
          { name: '§5 评测与结论', status: 'done', elapsed_ms: 19000 },
        ],
      },
      { name: '引用完整性与证据链核查', status: 'running' },
    ],
  },
  {
    id: 'd9',
    kind: 'thinking',
    turn_id: 'd1',
    ts: T0 + 62000,
    label: '引用审查 正在思考',
    status: 'done',
    duration_ms: 9100,
    tokens: 612,
    preview: '先把「预印本」被写成「已发表」的条目挑出来',
    body: '按 venue 字段分组，凡是 venue 为空或含 arXiv 的都单独列。\n再看正文用的是哪种口径：写「已发表」就必须有正式版。',
    agent_name: '引用审查',
    agent_id: 'cr',
  },
  {
    id: 'd10',
    kind: 'tool_call',
    turn_id: 'd1',
    ts: T0 + 71500,
    name: 'check_bibtex',
    args_summary: 'references.bib --strict',
    status: 'ok',
    duration_ms: 1240,
    result_summary: '52 条：48 条字段完整，2 条缺 journal，2 条仅预印本。',
    agent_name: '引用审查',
    agent_id: 'cr',
  },
  {
    id: 'd11',
    kind: 'table_panel',
    turn_id: 'd1',
    ts: T0 + 73000,
    caption: '口径不一致的 2 条',
    columns: ['#', '现引用', '建议替换', '影响'],
    rows: [
      [12, 'arXiv 2403.xxxxx', 'NeurIPS 2024 正式版', '无需改论述'],
      [27, 'arXiv 2405.xxxxx', '暂无正式版，改「预印本」口径', '需改 1 句'],
    ],
  },
  {
    id: 'd12',
    kind: 'assistant_text',
    turn_id: 'd1',
    ts: T0 + 75000,
    body: [
      '第 3 节有两处引用了 2024 年的预印本，但正文按**已发表**口径写的。我先把候选列在下面，你确认后我替换：',
      '',
      '**待替换的 2 条**',
      '',
      '1. `[12]` Bazerman & Chen (2024) —— 预印本，正文写作「已发表」',
      '2. `[27]` Kuhn et al. (2024) —— 同上，且 BibTeX 缺 `journal` 字段',
      '',
      '确认后我一并改 BibTeX 并重跑引用检查。',
    ].join('\n'),
    sender_name: '引用审查',
    agent_id: 'cr',
  },
  {
    id: 'd13',
    kind: 'verdict_card',
    turn_id: 'd1',
    ts: T0 + 76000,
    title: '引用完整性',
    passed: false,
    score: 7.4,
    max_score: 10,
    summary: '52 条中 48 条通过；4 条需补出处或改口径。',
    notes: ['2 条仅有预印本', '2 条 BibTeX 缺 journal'],
  },
  {
    id: 'd14',
    kind: 'raw',
    turn_id: 'd1',
    ts: T0 + 77000,
    source: 'chat-gateway',
    body: '「合并成稿」前有 1 道审批门挂起，等待你确认。回复「批准」放行，或直接说出要改的地方。',
  },
  {
    id: 'd15',
    kind: 'msg_foot',
    turn_id: 'd1',
    ts: T0 + 78000,
    status: 'running',
    elapsed_ms: 78000,
    tools: 2,
    tokens: 1454,
    cost_cny: 0.31,
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
export { SETTINGS_SEED } from '@/shared/data/defaults';

/* ── ARC 管线演示数据（「管线」tab 的演示态；形状 = 后端 research 域响应） ── */

const ARC_STAGE_TABLE: Array<[number, string, string, string, string, boolean, 'done' | 'running' | 'pending' | 'paused', number | null]> = [
  [1, 'TOPIC_INIT', '课题初始化', 'A', '研究界定', false, 'done', 12.4],
  [2, 'PROBLEM_DECOMPOSE', '问题分解', 'A', '研究界定', false, 'done', 31.8],
  [3, 'SEARCH_STRATEGY', '检索策略', 'B', '文献发现', false, 'done', 45.2],
  [4, 'LITERATURE_COLLECT', '文献收集', 'B', '文献发现', false, 'done', 388.6],
  [5, 'LITERATURE_SCREEN', '文献筛选', 'B', '文献发现', true, 'done', 96.1],
  [6, 'KNOWLEDGE_EXTRACT', '知识抽取', 'B', '文献发现', false, 'done', 244.3],
  [7, 'SYNTHESIS', '知识综合', 'C', '知识综合', false, 'done', 120.5],
  [8, 'HYPOTHESIS_GEN', '假设生成', 'C', '知识综合', false, 'done', 154.9],
  [9, 'EXPERIMENT_DESIGN', '实验设计', 'D', '实验设计', true, 'done', 88.7],
  [10, 'CODE_GENERATION', '代码生成', 'D', '实验设计', false, 'done', 210.2],
  [11, 'RESOURCE_PLANNING', '资源规划', 'D', '实验设计', false, 'done', 18.9],
  [12, 'EXPERIMENT_RUN', '实验执行', 'E', '实验执行', false, 'done', 302.6],
  [13, 'ITERATIVE_REFINE', '迭代精炼', 'E', '实验执行', false, 'done', 596.4],
  [14, 'RESULT_ANALYSIS', '结果分析', 'F', '分析决策', false, 'done', 132.7],
  [15, 'RESEARCH_DECISION', '研究决策', 'F', '分析决策', false, 'done', 26.3],
  [16, 'PAPER_OUTLINE', '论文提纲', 'G', '论文写作', false, 'done', 64.8],
  [17, 'PAPER_DRAFT', '论文初稿', 'G', '论文写作', false, 'done', 428.1],
  [18, 'PEER_REVIEW', '同行评审', 'G', '论文写作', false, 'done', 197.5],
  [19, 'PAPER_REVISION', '论文修订', 'G', '论文写作', false, 'done', 283.4],
  [20, 'QUALITY_GATE', '质量门', 'H', '最终化', true, 'done', 58.2],
  [21, 'KNOWLEDGE_ARCHIVE', '知识归档', 'H', '最终化', false, 'done', 42.6],
  [22, 'EXPORT_PUBLISH', '导出发布', 'H', '最终化', false, 'done', 175.9],
  [23, 'CITATION_VERIFY', '引用核验', 'H', '最终化', false, 'done', 91.3],
];

function arcStageFile(index: number, names: string[]) {
  return names.map((name) => ({
    name,
    path: `stage-${String(index).padStart(2, '0')}/${name}`,
    kind: name.endsWith('.json') ? 'json' : name.endsWith('.md') ? 'markdown' : 'other',
    size: 2048,
  }));
}

export const ARC_RUNS_DEMO: ArcRunCard[] = [
  {
    runId: 'rc-demo-20261124-090000-a1b2c3',
    status: 'succeeded',
    doneCount: 23,
    total: 23,
    updatedAt: '2026-11-24T09:16:53+00:00',
    topic: '扩散模型引导的物理世界生成：方法、评测与局限',
  },
];

export const ARC_PIPELINE_DEMO: ArcPipelineView[] = [
  {
    runId: 'rc-demo-20261124-090000-a1b2c3',
    status: 'succeeded',
    doneCount: 23,
    total: 23,
    updatedAt: '2026-11-24T09:16:53+00:00',
    topic: '扩散模型引导的物理世界生成：方法、评测与局限',
    stages: ARC_STAGE_TABLE.map(([index, key, label, phase, phaseLabel, isGate, status, duration]) => ({
      index,
      key,
      label,
      phase,
      phaseLabel,
      isGate,
      status,
      attempts: index === 13 ? 3 : 1,
      decision: index === 15 ? 'proceed' : index === 13 ? 'refine' : null,
      durationSec: duration,
      error: null,
      artifacts: arcStageFile(index, index === 1 ? ['goal.md', 'hardware_profile.json'] : index === 9 ? ['exp_plan.yaml', 'domain_profile.json'] : index === 20 ? ['quality_report.json'] : index === 23 ? ['verification_report.json', 'paper_final_verified.md'] : ['decision.json']),
    })),
    deliverables: [
      { name: 'paper_final.md', path: 'deliverables/paper_final.md', kind: 'markdown', size: 45324 },
      { name: 'paper.pdf', path: 'deliverables/paper.pdf', kind: 'pdf', size: 4574905 },
      { name: 'paper.tex', path: 'deliverables/paper.tex', kind: 'tex', size: 50856 },
      { name: 'references.bib', path: 'deliverables/references.bib', kind: 'bib', size: 5675 },
      { name: 'verification_report.json', path: 'deliverables/verification_report.json', kind: 'json', size: 5193 },
      { name: 'charts', path: 'deliverables/charts', kind: 'other', size: 0 },
    ],
    verification: {
      total: 13,
      verified: 13,
      suspicious: 0,
      hallucinated: 0,
      integrityScore: 1.0,
      items: [
        { citeKey: 'zhang2024physdreamer', title: 'PhysDreamer: Physics-Based Interaction with 3D Objects', status: 'verified', method: 'doi', confidence: 1.0 },
        { citeKey: 'liu2024physgen', title: 'PhysGen: Rigid-Body Physics-Grounded Image-to-Video Generation', status: 'verified', method: 'doi', confidence: 1.0 },
        { citeKey: 'geng2025motion', title: 'Motion Prompting: Controlling Video Generation with Motion Trajectories', status: 'verified', method: 'doi', confidence: 1.0 },
        { citeKey: 'bansal2024videophy', title: 'VideoPhy: Evaluating Physical Commonsense for Video Generation', status: 'verified', method: 'datacite', confidence: 1.0 },
      ],
    },
    quality: {
      score: 6,
      verdict: 'Accept with minor revisions —— 实验记录内部一致、scope 诚实，但格式缺陷与缺失的统计确认待补。',
      strengths: ['汇报数字与实验 summary 完全一致，无捏造', '负结果如实报告并作为 headline 发现'],
      weaknesses: ['格式缺陷', '缺 rank-test 统计确认'],
    },
    decisions: [
      { decision: 'refine', rollbackTarget: 'ITERATIVE_REFINE', rollbackStage: 13, attempt: 1, timestamp: '2026-11-24T08:47:55+00:00' },
      { decision: 'refine', rollbackTarget: 'ITERATIVE_REFINE', rollbackStage: 13, attempt: 2, timestamp: '2026-11-24T09:02:16+00:00' },
      { decision: 'proceed', rollbackTarget: null, rollbackStage: null, attempt: 3, timestamp: '2026-11-24T09:14:41+00:00' },
    ],
  },
];

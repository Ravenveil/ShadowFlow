// ============================================================================
// Workflow template presets — seed teams loaded into the canvas on open
// Each preset defines its own domain-specific agent roster, while reusing
// the generic behavior of the base node types registered in nodeRegistry.
// ============================================================================

import type { WorkflowNode, WorkflowEdge } from '../common/types';

export interface PresetNode {
  id: string;
  nodeType: string;                                 // base node type in registry
  position: { x: number; y: number };
  /** Domain-specific display name (bilingual). Overrides registry name. */
  overrideName?: { en: string; zh: string };
  /** Domain-specific description (bilingual). Overrides registry description. */
  overrideDescription?: { en: string; zh: string };
  /** Optional single-char / glyph icon to replace the registry icon. */
  overrideIcon?: string;
  /** Optional accent color (hex) — useful for Ming Cabinet where each 部 has its own hue. */
  overrideColor?: string;
  /** Optional config overrides (model, temp, systemPrompt, etc.). */
  config?: Record<string, unknown>;
}

export interface TemplatePreset {
  alias: string;
  title:       { en: string; zh: string };
  cjk:         string;
  description: { en: string; zh: string };
  stats: { agents: number; edges: number; services: string; retryDepth: number };
  nodes: PresetNode[];
  edges: Array<{
    source: string;
    target: string;
    label?: string;
    color?: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// PRESETS — each defines its own cast of characters
// ──────────────────────────────────────────────────────────────────────────────

export const PRESETS: Record<string, TemplatePreset> = {

  // ═══ ACADEMIC PAPER ═══════════════════════════════════════════════════════
  academic_paper: {
    alias: 'academic_paper',
    title: { en: 'Academic Paper', zh: '学术论文' },
    cjk: '文',
    description: {
      en: 'Planner decomposes the paper, LitReviewer + DataScout run in parallel, SectionWriter drafts under Advisor\'s veto. Reject twice → retry_gate opens a gap-analysis loop.',
      zh: 'Planner 拆解论文，LitReviewer + DataScout 并行调研，SectionWriter 在 Advisor 审查下起草。两次 reject → retry_gate 触发 gap-analysis 循环。',
    },
    stats: { agents: 6, edges: 7, services: 'claude · 0g · serp', retryDepth: 3 },
    nodes: [
      { id: 'tpl_planner',      nodeType: 'planner',    position: { x: 80,   y: 240 },
        overrideName: { en: 'Planner',       zh: '选题官' },
        overrideDescription: { en: 'Decomposes the paper into sections and allocates sources', zh: '拆解论文结构，分配章节与资料' } },
      { id: 'tpl_lit_reviewer', nodeType: 'researcher', position: { x: 340,  y: 100 },
        overrideName: { en: 'LitReviewer',   zh: '文献官' }, overrideIcon: '📚',
        overrideDescription: { en: 'Surveys prior work, extracts citations and gaps', zh: '综述前人工作，抽取引用与研究空白' } },
      { id: 'tpl_data_scout',   nodeType: 'researcher', position: { x: 340,  y: 380 },
        overrideName: { en: 'DataScout',     zh: '数据官' }, overrideIcon: '📊',
        overrideDescription: { en: 'Hunts down datasets and reproducibility details',  zh: '寻找数据集与可复现信息' } },
      { id: 'tpl_section_writer',nodeType: 'writer',    position: { x: 620,  y: 240 },
        overrideName: { en: 'SectionWriter', zh: '执笔官' }, overrideIcon: '✍',
        overrideDescription: { en: 'Drafts the Methods / Results sections under review', zh: '在审查下起草方法 / 结果章节' } },
      { id: 'tpl_advisor',      nodeType: 'advisor',    position: { x: 880,  y: 140 },
        overrideName: { en: 'Advisor',       zh: '导师' }, overrideIcon: '🎓',
        overrideDescription: { en: 'Vetoes drafts that lack baseline comparison',       zh: '驳回缺少基线对照的草稿' } },
      { id: 'tpl_critic',       nodeType: 'critic',     position: { x: 880,  y: 340 },
        overrideName: { en: 'PeerCritic',    zh: '同行审稿' }, overrideIcon: '🔍',
        overrideDescription: { en: 'Simulates a hostile reviewer pass',                 zh: '模拟敌意审稿过一遍' } },
    ],
    edges: [
      { source: 'tpl_planner',      target: 'tpl_lit_reviewer' },
      { source: 'tpl_planner',      target: 'tpl_data_scout' },
      { source: 'tpl_lit_reviewer', target: 'tpl_section_writer' },
      { source: 'tpl_data_scout',   target: 'tpl_section_writer' },
      { source: 'tpl_section_writer', target: 'tpl_advisor' },
      { source: 'tpl_section_writer', target: 'tpl_critic' },
      { source: 'tpl_advisor',      target: 'tpl_critic' },
    ],
  },

  // ═══ SOLO COMPANY ═════════════════════════════════════════════════════════
  solo_company: {
    alias: 'solo_company',
    title: { en: 'Solo Company', zh: '单人公司' },
    cjk: '单干',
    description: {
      en: 'Four co-founders running a one-person company — strategy, build, market, ship. Minimal team, full OODA loop.',
      zh: '一人公司的四位合伙人——策略、构建、市场、发货。最小团队，完整 OODA 循环。',
    },
    stats: { agents: 4, edges: 4, services: 'claude', retryDepth: 2 },
    nodes: [
      { id: 'tpl_founder',    nodeType: 'planner', position: { x: 100, y: 240 },
        overrideName: { en: 'Founder',    zh: '创始人' }, overrideIcon: '👔', overrideColor: '#A855F7',
        overrideDescription: { en: 'Sets the weekly bet and decomposes it',   zh: '定每周押注，拆解任务' } },
      { id: 'tpl_builder',    nodeType: 'writer',  position: { x: 380, y: 140 },
        overrideName: { en: 'Builder',    zh: '工程师' }, overrideIcon: '🛠', overrideColor: '#22D3EE',
        overrideDescription: { en: 'Ships code, writes copy, builds the MVP', zh: '写代码、出文案、搭 MVP' } },
      { id: 'tpl_marketer',   nodeType: 'critic',  position: { x: 380, y: 340 },
        overrideName: { en: 'Marketer',   zh: '市场' },   overrideIcon: '📣', overrideColor: '#F59E0B',
        overrideDescription: { en: 'Challenges the build from a customer lens', zh: '从用户视角质问产品' } },
      { id: 'tpl_shipper',    nodeType: 'editor',  position: { x: 680, y: 240 },
        overrideName: { en: 'Shipper',    zh: '发货员' }, overrideIcon: '🚀', overrideColor: '#10B981',
        overrideDescription: { en: 'Polishes and pushes to production',       zh: '打磨并发到线上' } },
    ],
    edges: [
      { source: 'tpl_founder',  target: 'tpl_builder' },
      { source: 'tpl_founder',  target: 'tpl_marketer' },
      { source: 'tpl_builder',  target: 'tpl_shipper' },
      { source: 'tpl_marketer', target: 'tpl_shipper' },
    ],
  },

  // ═══ NEWSROOM ═════════════════════════════════════════════════════════════
  newsroom: {
    alias: 'newsroom',
    title: { en: 'Newsroom', zh: '新闻编辑室' },
    cjk: '新闻',
    description: {
      en: 'Reporter digs, CopyEditor drafts, FactChecker gates, ChiefEditor approves before publish.',
      zh: 'Reporter 挖料，CopyEditor 写稿，FactChecker 把关，ChiefEditor 审批后发布。',
    },
    stats: { agents: 5, edges: 5, services: 'claude · serp', retryDepth: 2 },
    nodes: [
      { id: 'tpl_reporter',    nodeType: 'researcher', position: { x: 80,  y: 240 },
        overrideName: { en: 'Reporter',     zh: '记者' }, overrideIcon: '📰', overrideColor: '#0EA5E9',
        overrideDescription: { en: 'Chases leads, interviews sources',  zh: '追线索，采访信源' } },
      { id: 'tpl_copy_editor', nodeType: 'writer',     position: { x: 360, y: 140 },
        overrideName: { en: 'CopyEditor',   zh: '主笔' }, overrideIcon: '✍',
        overrideDescription: { en: 'Drafts the story in house voice',   zh: '按编辑部口吻起草' } },
      { id: 'tpl_fact_check',  nodeType: 'advisor',    position: { x: 360, y: 340 },
        overrideName: { en: 'FactChecker',  zh: '核查' }, overrideIcon: '✓',
        overrideDescription: { en: 'Verifies every claim against sources', zh: '对照信源逐项核实' } },
      { id: 'tpl_approval',    nodeType: 'approval_gate', position: { x: 640, y: 240 },
        overrideName: { en: 'ChiefEditor',  zh: '主编' }, overrideIcon: '⚖',
        overrideDescription: { en: 'Human approval before the story goes live', zh: '发布前的人工审批' } },
      { id: 'tpl_publisher',   nodeType: 'editor',     position: { x: 920, y: 240 },
        overrideName: { en: 'Publisher',    zh: '出版' }, overrideIcon: '📡', overrideColor: '#10B981',
        overrideDescription: { en: 'Pushes to CMS and social channels', zh: '推到 CMS 与社媒' } },
    ],
    edges: [
      { source: 'tpl_reporter',    target: 'tpl_copy_editor' },
      { source: 'tpl_reporter',    target: 'tpl_fact_check' },
      { source: 'tpl_copy_editor', target: 'tpl_approval' },
      { source: 'tpl_fact_check',  target: 'tpl_approval' },
      { source: 'tpl_approval',    target: 'tpl_publisher' },
    ],
  },

  // ═══ MODERN STARTUP ═══════════════════════════════════════════════════════
  modern_startup: {
    alias: 'modern_startup',
    title: { en: 'Modern Startup', zh: '新创公司' },
    cjk: '新创',
    description: {
      en: 'PM plans, UserResearch validates, Engineer builds, Designer polishes, GTM launches — fan-out execution, parallel delivery.',
      zh: 'PM 规划、用研验证、工程实现、设计打磨、GTM 上线。Fan-out 并行交付。',
    },
    stats: { agents: 5, edges: 5, services: 'claude · 0g', retryDepth: 2 },
    nodes: [
      { id: 'tpl_pm',          nodeType: 'planner',    position: { x: 100, y: 240 },
        overrideName: { en: 'PM',           zh: '产品经理' }, overrideIcon: '📋', overrideColor: '#A855F7',
        overrideDescription: { en: 'Writes the brief and slices the sprint',    zh: '写需求文档，切 sprint' } },
      { id: 'tpl_user_research', nodeType: 'researcher', position: { x: 380, y: 100 },
        overrideName: { en: 'UserResearch', zh: '用户研究' }, overrideIcon: '🔬', overrideColor: '#0EA5E9',
        overrideDescription: { en: 'Validates assumptions with user interviews', zh: '通过用户访谈验证假设' } },
      { id: 'tpl_engineer',    nodeType: 'writer',     position: { x: 380, y: 240 },
        overrideName: { en: 'Engineer',     zh: '工程师' }, overrideIcon: '⚡', overrideColor: '#22D3EE',
        overrideDescription: { en: 'Ships the feature, keeps tests green',      zh: '交付特性，测试保持绿色' } },
      { id: 'tpl_designer',    nodeType: 'editor',     position: { x: 380, y: 380 },
        overrideName: { en: 'Designer',     zh: '设计师' }, overrideIcon: '🎨', overrideColor: '#EC4899',
        overrideDescription: { en: 'Polishes UI, enforces the design system',   zh: '打磨 UI，守住设计系统' } },
      { id: 'tpl_gtm',         nodeType: 'critic',     position: { x: 680, y: 240 },
        overrideName: { en: 'GTM',          zh: '市场上线' }, overrideIcon: '📈', overrideColor: '#F59E0B',
        overrideDescription: { en: 'Reviews, launches, measures adoption',      zh: '审阅、上线、看采用率' } },
    ],
    edges: [
      { source: 'tpl_pm',            target: 'tpl_user_research' },
      { source: 'tpl_pm',            target: 'tpl_engineer' },
      { source: 'tpl_pm',            target: 'tpl_designer' },
      { source: 'tpl_user_research', target: 'tpl_gtm' },
      { source: 'tpl_engineer',      target: 'tpl_gtm' },
      { source: 'tpl_designer',      target: 'tpl_gtm' },
    ],
  },

  // ═══ MING CABINET ═════════════════════════════════════════════════════════
  ming_cabinet: {
    alias: 'ming_cabinet',
    title: { en: 'Ming Cabinet', zh: '明朝内阁' },
    cjk: '内阁',
    description: {
      en: 'Six Ministries of Ming dynasty — Rites / Revenue / Personnel / War / Justice / Works. Each 部 has distinct authority under the Cabinet\'s veto.',
      zh: '明朝六部——礼、户、吏、兵、刑、工。在内阁主批下各司其职，权责矩阵分明。',
    },
    stats: { agents: 7, edges: 8, services: 'claude', retryDepth: 3 },
    nodes: [
      { id: 'tpl_cabinet', nodeType: 'planner', position: { x: 100, y: 260 },
        overrideName: { en: 'Cabinet',  zh: '内阁' }, overrideIcon: '⚖', overrideColor: '#A855F7',
        overrideDescription: { en: 'Routes memorials to the six ministries', zh: '将奏章分发六部' } },
      { id: 'tpl_rites',   nodeType: 'editor',     position: { x: 380, y: 80  },
        overrideName: { en: 'Rites',    zh: '礼部' }, overrideIcon: '礼', overrideColor: '#DC2626',
        overrideDescription: { en: 'Ceremonies, diplomacy, examinations',    zh: '典礼、外交、科举' } },
      { id: 'tpl_revenue', nodeType: 'writer',     position: { x: 380, y: 180 },
        overrideName: { en: 'Revenue',  zh: '户部' }, overrideIcon: '户', overrideColor: '#D97706',
        overrideDescription: { en: 'Census, taxation, treasury',             zh: '户籍、赋税、国库' } },
      { id: 'tpl_personnel', nodeType: 'advisor',  position: { x: 380, y: 280 },
        overrideName: { en: 'Personnel',zh: '吏部' }, overrideIcon: '吏', overrideColor: '#059669',
        overrideDescription: { en: 'Appointments, evaluations, promotions',  zh: '任命、考绩、升迁' } },
      { id: 'tpl_war',     nodeType: 'researcher', position: { x: 380, y: 380 },
        overrideName: { en: 'War',      zh: '兵部' }, overrideIcon: '兵', overrideColor: '#1D4ED8',
        overrideDescription: { en: 'Military, garrisons, logistics',         zh: '军务、驻防、后勤' } },
      { id: 'tpl_justice', nodeType: 'critic',     position: { x: 380, y: 480 },
        overrideName: { en: 'Justice',  zh: '刑部' }, overrideIcon: '刑', overrideColor: '#7C3AED',
        overrideDescription: { en: 'Law, trial, punishment',                 zh: '律法、审判、刑罚' } },
      { id: 'tpl_works',   nodeType: 'writer',     position: { x: 380, y: 580 },
        overrideName: { en: 'Works',    zh: '工部' }, overrideIcon: '工', overrideColor: '#0891B2',
        overrideDescription: { en: 'Infrastructure, canals, public works',   zh: '工程、运河、公共建设' } },
    ],
    edges: [
      { source: 'tpl_cabinet', target: 'tpl_rites' },
      { source: 'tpl_cabinet', target: 'tpl_revenue' },
      { source: 'tpl_cabinet', target: 'tpl_personnel' },
      { source: 'tpl_cabinet', target: 'tpl_war' },
      { source: 'tpl_cabinet', target: 'tpl_justice' },
      { source: 'tpl_cabinet', target: 'tpl_works' },
      { source: 'tpl_personnel', target: 'tpl_rites',   label: '考绩' },
      { source: 'tpl_justice',   target: 'tpl_personnel', label: '纠察' },
    ],
  },

  // ═══ BLANK ════════════════════════════════════════════════════════════════
  blank: {
    alias: 'blank',
    title: { en: 'Blank canvas', zh: '空白画布' },
    cjk: '空',
    description: {
      en: 'Start from scratch. Drag agents from the left palette to build your own team.',
      zh: '从零开始。从左侧面板拖 agent 到画布上组建你自己的团队。',
    },
    stats: { agents: 0, edges: 0, services: '—', retryDepth: 0 },
    nodes: [],
    edges: [],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Materialize preset → real WorkflowNode[] / WorkflowEdge[] using the registry
// ──────────────────────────────────────────────────────────────────────────────

type NodeRegistry = {
  getNode: (id: string) => {
    category: string;
    name: { en: string; zh: string };
    description: { en: string; zh: string };
    icon: string;
    color?: string;
    inputs: unknown[];
    outputs: unknown[];
    defaultConfig: Record<string, unknown>;
  } | undefined;
};

export function materializePreset(
  preset: TemplatePreset,
  registry: NodeRegistry,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = preset.nodes.map(n => {
    const def = registry.getNode(n.nodeType);
    if (!def) {
      throw new Error(`Unknown node type in preset: ${n.nodeType}`);
    }
    return {
      id: n.id,
      type: 'custom',
      position: n.position,
      data: {
        nodeId: n.id,
        nodeType: n.nodeType,
        category: def.category as never,
        name:        n.overrideName        ?? def.name,
        description: n.overrideDescription ?? def.description,
        icon:        n.overrideIcon        ?? def.icon,
        color:       n.overrideColor       ?? def.color ?? '#A855F7',
        inputs: def.inputs as never,
        outputs: def.outputs as never,
        config: { ...def.defaultConfig, ...(n.config || {}) },
        status: 'idle',
      },
    };
  });

  const edges: WorkflowEdge[] = preset.edges.map((e, i) => ({
    id: `tpl_edge_${i}_${e.source}_${e.target}`,
    source: e.source,
    target: e.target,
    type: 'default',
    animated: false,
    style: {
      stroke: e.color || '#52525B',
      strokeWidth: 2,
      strokeLinecap: 'round',
    },
    data: e.label ? { label: e.label } : undefined,
  }));

  return { nodes, edges };
}

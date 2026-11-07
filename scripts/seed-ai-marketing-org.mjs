#!/usr/bin/env node
/**
 * seed-ai-marketing-org.mjs — 内置「AI 营销公司」组织架构 + 任务 DAG。
 *
 * 依据《AI营销公司_组织架构与双线路业务流程设计方案_完整版》第 4 章：
 *   三层扁平结构 = 1 人类创始人（审批门）+ 1 AI 总经理 CEO + 6 部门核心员工。
 *
 * 产出（写入仓库根 .shadowflow/）：
 *   agents/agent-*.agent.yaml   ×7  —— Node 全局 agent 库（团队 DAG 编辑器读）
 *   agents/agent-*.json         ×7  —— Python agent 库（运行时真源）
 *   teams/ai-marketing-co.team.yaml —— 团队蓝图（成员/边/审批门/dag_layout）
 *   teams/ai-marketing-co.json      —— Python team 运行时真源（workflow 边）
 *
 * DAG 语义（对齐 chat-dag 执行器）：
 *   sequential/direct — 顺序流转（上游产出传下游）
 *   approve           — 顺序边 + 该节点执行前挂起等创始人人工批准
 *   conditional       — 返工回归边（评审命中驳回标记 → 上游重做，≤ max_retries）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SF = path.join(ROOT, '.shadowflow');

const MODEL = { id: 'claude-sonnet-4-6', temperature: 0.3, max_tokens: 8192, context_window: 200000 };

const AGENTS = [
  {
    id: 'agent-ceo',
    title: 'AI 总经理 CEO',
    sub: '目标拆解 · 任务调度 · 成果汇总',
    avatar_char: '总',
    type: 'coordinator',
    tags: ['coordination', 'marketing'],
    persona: `你是「AI 总经理 CEO」，AI 营销公司的统管者，只向创始人（人类管理者）汇报。
职责：1) 理解创始人的业务目标与关键审批意见；2) 把目标拆解为可执行任务；3) 按部门统一派单；4) 汇总六部门成果向创始人回传。
六部门交付物：市场分析师→用户画像·市场分析；品牌策划师→品牌方案·表达规范；内容策划师→营销内容包；运营专员→上架清单·运营计划；商务专员→采购方案·线索记录；合规审核员→风险清单·审核意见。
纪律：每名员工只向你汇报，不互相派单；任务经 Task API 传递，聊天仅作补充沟通；资金操作由人负责，你只做方案与汇总，不执行任何资金动作。`,
    tools: { picked: ['task_dispatch', 'doc_writer'], candidate: ['web_search', 'data_analyzer'] },
    io: { inputs: { expects: { goal: 'string', founder_notes: 'string?' } }, outputs: { produces: { task_plan: 'object[]', summary: 'string' } } },
  },
  {
    id: 'agent-market-analyst',
    title: '市场分析师',
    sub: '市场研究部',
    avatar_char: '研',
    type: 'agent',
    tags: ['research', 'marketing'],
    persona: `你是「市场分析师」（市场研究部）。只向 AI 总经理汇报，不向其他部门派单。
职责：目标用户、市场、竞品和需求分析。交付：用户画像、市场分析。
输出结构：1) 目标用户画像 2) 市场规模与趋势 3) 竞品对比 4) 需求洞察 5) 机会结论。`,
    tools: { picked: ['web_search', 'data_analyzer'], candidate: ['survey', 'doc_writer'] },
    io: { inputs: { expects: { brief: 'string' } }, outputs: { produces: { user_persona: 'object', market_analysis: 'string' } } },
  },
  {
    id: 'agent-brand-strategist',
    title: '品牌策划师',
    sub: '品牌策划部',
    avatar_char: '品',
    type: 'agent',
    tags: ['brand', 'marketing'],
    persona: `你是「品牌策划师」（品牌策划部）。只向 AI 总经理汇报，不向其他部门派单。
职责：品牌定位、产品卖点、品牌故事。交付：品牌方案、表达规范。
输出结构：1) 品牌定位 2) 核心卖点 3) 品牌故事 4) 表达规范（语气与禁语）。
注意：品牌定稿须创始人人工批准后才进入内容量产。`,
    tools: { picked: ['doc_writer', 'creative_brief'], candidate: ['web_search', 'image_gen'] },
    io: { inputs: { expects: { market_analysis: 'string', user_persona: 'object' } }, outputs: { produces: { brand_plan: 'string', expression_guide: 'string' } } },
  },
  {
    id: 'agent-content-creator',
    title: '内容策划师',
    sub: '内容创作部',
    avatar_char: '创',
    type: 'agent',
    tags: ['content', 'marketing'],
    persona: `你是「内容策划师」（内容创作部）。只向 AI 总经理汇报，不向其他部门派单。
职责：商品详情页、图文、短视频脚本。交付：营销内容包。
输出结构：1) 商品详情页文案 2) 图文方案 3) 短视频脚本。
被合规审核员打回时，按审核意见逐条修订后重新交付。`,
    tools: { picked: ['doc_writer', 'image_gen'], candidate: ['video_script', 'seo_lint'] },
    io: { inputs: { expects: { brand_plan: 'string', expression_guide: 'string' } }, outputs: { produces: { content_pack: 'object' } } },
  },
  {
    id: 'agent-ops-specialist',
    title: '运营专员',
    sub: '电商运营部',
    avatar_char: '运',
    type: 'agent',
    tags: ['ops', 'ecommerce'],
    persona: `你是「运营专员」（电商运营部）。只向 AI 总经理汇报，不向其他部门派单。
职责：商品资料、上架准备、店铺运营支持。交付：上架清单、运营计划。
输出结构：1) 上架清单（商品资料/素材/价格占位）2) 运营计划（节奏与预算建议）。
纪律：资金操作由人负责；预算只作建议，绝不执行任何支付或下单动作。`,
    tools: { picked: ['doc_writer', 'spreadsheet'], candidate: ['listing_api', 'data_analyzer'] },
    io: { inputs: { expects: { content_pack: 'object' } }, outputs: { produces: { listing_checklist: 'object[]', ops_plan: 'string' } } },
  },
  {
    id: 'agent-biz-developer',
    title: '商务专员',
    sub: '商务拓展部',
    avatar_char: '商',
    type: 'agent',
    tags: ['bd', 'sales'],
    persona: `你是「商务专员」（商务拓展部）。只向 AI 总经理汇报，不向其他部门派单。
职责：企业采购材料、潜在客户筛选跟进。交付：采购方案、线索记录。
输出结构：1) 采购方案（材料清单与话术）2) 线索记录（客户画像/意向/跟进计划）。
纪律：合同与资金操作由人负责；你只产出方案与线索，不做任何对外承诺。`,
    tools: { picked: ['doc_writer', 'crm_note'], candidate: ['web_search', 'spreadsheet'] },
    io: { inputs: { expects: { content_pack: 'object', market_analysis: 'string' } }, outputs: { produces: { procurement_plan: 'string', leads: 'object[]' } } },
  },
  {
    id: 'agent-compliance-reviewer',
    title: '合规审核员',
    sub: '风控审核部',
    avatar_char: '控',
    type: 'agent',
    tags: ['compliance', 'risk'],
    persona: `你是「合规审核员」（风控审核部）。只向 AI 总经理汇报，不向其他部门派单。
职责：内容合规、授权、品牌伦理和质量检查。交付：风险清单、审核意见。
权限：可打回并阻断高风险内容——发现问题时意见中必须包含「驳回」或 [verdict:reject]，并逐条列出整改项；无问题时以「审核通过」开头（正文勿出现驳回类词汇，避免误触发返工）。
检查项：1) 广告法禁语与夸大宣传 2) 素材授权与版权 3) 品牌伦理 4) 事实性错误 5) 质量底线。`,
    tools: { picked: ['policy_lint', 'doc_writer'], candidate: ['web_search', 'copyright_check'] },
    io: { inputs: { expects: { content_pack: 'object', brand_plan: 'string' } }, outputs: { produces: { risk_list: 'object[]', review_opinion: 'string' } } },
  },
];

// ─── 团队 DAG ────────────────────────────────────────────────────────────────
const TEAM_ID = 'ai-marketing-co';

const EDGES = [
  { from: 'agent-ceo', to: 'agent-market-analyst', kind: 'sequential', mode: 'direct' },
  { from: 'agent-market-analyst', to: 'agent-brand-strategist', kind: 'sequential', mode: 'direct' },
  // 品牌定稿须创始人人工批准（approve 边 = 顺序边 + 人工审批门）
  { from: 'agent-brand-strategist', to: 'agent-content-creator', kind: 'approve', mode: 'approve' },
  { from: 'agent-content-creator', to: 'agent-compliance-reviewer', kind: 'sequential', mode: 'direct' },
  // 合规可打回并阻断高风险内容（conditional 返工回归边，最多 2 次）
  { from: 'agent-compliance-reviewer', to: 'agent-content-creator', kind: 'conditional', mode: 'conditional', condition: 'rework', max_retries: 2 },
  // 对外发布（上架）须创始人人工批准
  { from: 'agent-compliance-reviewer', to: 'agent-ops-specialist', kind: 'approve', mode: 'approve' },
  { from: 'agent-compliance-reviewer', to: 'agent-biz-developer', kind: 'sequential', mode: 'direct' },
];

const LAYOUT = [
  ['agent-ceo', 400, 40],
  ['agent-market-analyst', 400, 190],
  ['agent-brand-strategist', 400, 340],
  ['agent-content-creator', 400, 490],
  ['agent-compliance-reviewer', 400, 640],
  ['agent-ops-specialist', 230, 800],
  ['agent-biz-developer', 570, 800],
];

// ─── 生成 ────────────────────────────────────────────────────────────────────
const indent = (text, pad = '  ') => text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
const yamlList = (arr) => (arr.length ? arr.map((s) => `    - ${s}`).join('\n') : '    []');

function agentYaml(a) {
  return `id: ${a.id}
version: 1
title: ${a.title}
sub: ${a.sub}
avatar_char: ${a.avatar_char}
type: ${a.type}
tags: [${a.tags.join(', ')}]
persona: |
${indent(a.persona)}
model:
  id: ${MODEL.id}
  temperature: ${MODEL.temperature}
  max_tokens: ${MODEL.max_tokens}
  context_window: ${MODEL.context_window}
tools:
  picked:
${yamlList(a.tools.picked)}
  candidate:
${yamlList(a.tools.candidate)}
memory: vector+scratch
io:
  inputs:
    expects:
${Object.entries(a.io.inputs.expects).map(([k, v]) => `      ${k}: '${v}'`).join('\n')}
  outputs:
    produces:
${Object.entries(a.io.outputs.produces).map(([k, v]) => `      ${k}: '${v}'`).join('\n')}
`;
}

function agentJson(a, now) {
  return JSON.stringify(
    {
      agent_id: a.id,
      name: a.title,
      soul: a.persona,
      workspace_id: null,
      blueprint: {
        name: a.title,
        goal: a.persona.split('\n')[0],
        role_profiles: [],
        tool_policies: [],
        metadata: { source: 'seed-ai-marketing-org', dept: a.sub },
      },
      status: 'idle',
      source: 'seed-ai-marketing-org',
      created_at: now,
      updated_at: now,
      avatar_color: null,
      claw_id: null,
      avatar_style: 'lorelei',
      avatar_seed: a.id.replace(/^agent-/, ''),
      avatar_image: null,
    },
    null,
    2,
  );
}

function teamYaml() {
  const memberLines = AGENTS.map((a) => `  - ${a.id}`).join('\n');
  const edgeLines = EDGES.map((e) => {
    const extra =
      (e.condition ? `\n    condition: ${e.condition}` : '') +
      (e.max_retries ? `\n    max_retries: ${e.max_retries}` : '');
    return `  - from: ${e.from}\n    to: ${e.to}\n    kind: ${e.kind}${extra}`;
  }).join('\n');
  const nodeLines = LAYOUT.map(([id, x, y]) => `    - id: ${id}\n      x: ${x}\n      y: ${y}`).join('\n');
  return `id: ${TEAM_ID}
version: 1
name: AI 营销公司
description: AI 营销公司组织架构（1 创始人审批门 + 1 AI 总经理 CEO + 6 部门核心员工）。每名员工只向 AI 总经理汇报，任务经 Task API 传递；合规审核员可打回并阻断高风险内容；品牌定稿与对外发布须创始人人工批准；资金操作由人负责。
mode: dag
policy:
  retry: 2
  escalation: approve_gate
  timeout_per_step_ms: 300000
members:
${memberLines}
edges:
${edgeLines}
dag_layout:
  mode: manual
  nodes:
${nodeLines}
  viewport:
    zoom: 1
    pan_x: 0
    pan_y: 0
`;
}

function teamJson(now) {
  const nodes = AGENTS.map((a, i) => ({ id: `n${i + 1}`, data: { agentId: a.id } }));
  const idOf = Object.fromEntries(AGENTS.map((a, i) => [a.id, `n${i + 1}`]));
  const edges = EDGES.map((e) => ({
    source: idOf[e.from],
    target: idOf[e.to],
    data: { mode: e.mode, ...(e.max_retries ? { max_retries: e.max_retries } : {}) },
  }));
  return JSON.stringify(
    {
      team_id: TEAM_ID,
      name: 'AI 营销公司',
      description:
        'AI 营销公司组织架构：1 创始人（人类管理者/审批门）+ 1 AI 总经理 CEO + 6 部门核心员工。每名员工只向 AI 总经理汇报，不互相派单；任务经 Task API 传递，聊天仅作补充沟通。合规审核员可打回并阻断高风险内容；品牌定稿与对外发布须创始人人工批准；资金操作由人负责。',
      workspace_id: 'default',
      agent_ids: AGENTS.map((a) => a.id),
      created_at: now,
      updated_at: now,
      workflow: { nodes, edges },
      policy_matrix: {
        'agent-compliance-reviewer': { 'agent-content-creator': 'permit' },
      },
    },
    null,
    2,
  );
}

function main() {
  const now = new Date().toISOString();
  fs.mkdirSync(path.join(SF, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(SF, 'teams'), { recursive: true });

  for (const a of AGENTS) {
    fs.writeFileSync(path.join(SF, 'agents', `${a.id}.agent.yaml`), agentYaml(a), 'utf-8');
    fs.writeFileSync(path.join(SF, 'agents', `${a.id}.json`), agentJson(a, now), 'utf-8');
    console.log('agent →', a.id);
  }
  fs.writeFileSync(path.join(SF, 'teams', `${TEAM_ID}.team.yaml`), teamYaml(), 'utf-8');
  fs.writeFileSync(path.join(SF, 'teams', `${TEAM_ID}.json`), teamJson(now), 'utf-8');
  console.log('team  →', TEAM_ID);
  console.log('done.');
}

main();

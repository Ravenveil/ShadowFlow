/**
 * craft-team-setup.ts — 「手工艺品代卖」agent 团队一键搭建（幂等，2026-11-08）。
 *
 * 案例：手工艺人只上架商品，团队负责营销、联系快递员寄出并同步经营数据。
 * 组织形态对齐《AI营销公司_组织架构与双线路业务流程设计方案》架构图（2026-11-08
 * 重组）：三层扁平 = 1 创始人（=董事长，人类管理者/审批门）+ 1 AI 总经理 CEO
 * （agent-shadow-secretary，soul 见 services/secretary_seed）+ 6 部门核心员工：
 *
 *   总经理 CEO（收产品素材→知识库、拆解派单、汇总回传）
 *     → 市场分析师（市场研究部）→ 品牌策划师（品牌策划部）
 *     →[品牌定稿·董事长审批]→ 内容策划师（内容创作部）
 *     → 合规审核员（风控审核部）↺ 驳回返工(≤2)
 *     →[对外发布·董事长审批]→ 运营专员（电商运营部）+ 商务专员（商务拓展部）
 *
 * 交付物（架构图口径）：市场分析师→用户画像·市场分析；品牌策划师→品牌方案·
 * 表达规范；内容策划师→营销内容包；运营专员→上架清单·运营计划；商务专员→
 * 采购方案·线索记录；合规审核员→风险清单·审核意见。
 *
 * 各 agent soul 写明输出协议（lib/craft-markers）：业务动作用 [intake]/[post]/
 * [link]/[order]/[ship]/[report] 标记声明，落产品盈利库/社媒发布域/快递域；
 * 总经理另有 [build-team]/[dispatch]（建团队/派活）。
 *
 * 落库全部经 Python API（与 team-persistence 同构）：
 *   POST /api/agents ×6 → POST /api/teams → PUT /api/teams/:id/workflow
 *   → POST /api/groups（绑 team_id）→ settings craft_profit.team 记引用。
 * 失败上抛 CraftProfitError（setup 是用户显式动作，不 fail-soft）。
 */
import { CraftProfitError } from './craft-profit';
import { CRAFT_TEAM_KEY, SECRETARY_AGENT_ID, type CraftTeamRef } from './craft-intake';
import { getSetting, setSetting } from './settings';
import { PYTHON_BACKEND_URL } from '../python-backend';

const PY_TIMEOUT_MS = 8000;

interface Envelope<T> {
  data?: T;
}

async function pyJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PY_TIMEOUT_MS);
  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Envelope<T> | T;
    return ((json as Envelope<T>).data ?? json) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 角色定义（soul 含输出协议）───────────────────────────────────────────────

const PROTOCOL = `
【输出协议】需要登记业务动作时，回复里输出独占一行的标记（JSON 紧凑单行，金额单位「元」）：
[intake] {"name":"商品名","price":68,"cost":20,"shipping":8} ——上架商品（售价/成本/快递费）
[post] {"platform":"小红书","title":"标题","text":"文案"} ——在媒体平台发帖推广
[link] {"product":"商品名","url":"https://…"} ——上商品购买链接
[order] {"product":"商品名","qty":2} ——登记销售出单
[ship] {"product":"商品名","qty":2,"tracking":"SF123","receiver":"张三","phone":"13800138000","address":"…"} ——联系快递员上门取件寄出（收件信息可选，知道就带）
[report] {"summary":"盈利汇报摘要"} ——输出盈利汇报
标记会自动落到「产品盈利」看板 / 社媒发布域 / 快递域并从聊天里隐藏；除此之外正常用中文输出给用户。
控制点：合规审核员可打回并阻断高风险内容（意见含「驳回」触发返工，≤2 次）；
品牌定稿与对外发布会挂起等董事长（创始人）批准，批准后流水线自动继续，不要跳过；
资金操作由人负责，任何岗位不执行支付/下单资金动作。`;

interface RoleDef {
  key: string;
  name: string;
  soul: string;
}

const ROLES: RoleDef[] = [
  {
    key: 'market',
    name: '市场分析师',
    soul: `你是「市场分析师」（市场研究部），「手工艺品代卖」团队业务链第 1 环。只向总经理 CEO 汇报，不向其他部门派单。
职责：目标用户、市场、竞品和需求分析。交付：用户画像、市场分析。
输出结构：1) 目标用户画像 2) 市场规模与趋势 3) 竞品对比 4) 需求洞察 5) 机会结论。
结合知识库里的产品资料（文字/图片/文档）分析；信息不足就合理推断并标注假设。结论交给下游品牌策划师。
${PROTOCOL}`,
  },
  {
    key: 'brand',
    name: '品牌策划师',
    soul: `你是「品牌策划师」（品牌策划部），「手工艺品代卖」团队业务链第 2 环。只向总经理 CEO 汇报，不向其他部门派单。
职责：品牌定位、产品卖点、品牌故事。交付：品牌方案、表达规范。
输出结构：1) 品牌定位 2) 核心卖点 3) 品牌故事 4) 表达规范（语气与禁语）。
结合手艺人故事与产品卖点产出；信息不足就合理推断并标注假设。
注意：品牌定稿须创始人（董事长）人工批准后才进入内容量产。
${PROTOCOL}`,
  },
  {
    key: 'content',
    name: '内容策划师',
    soul: `你是「内容策划师」（内容创作部），「手工艺品代卖」团队业务链第 3 环。只向总经理 CEO 汇报，不向其他部门派单。
职责：商品详情页、图文、短视频脚本。交付：营销内容包。
输出结构：1) 商品详情页文案 2) 图文方案（含小红书/朋友圈等平台贴文）3) 短视频脚本。
内容贴合手作温度与手艺人故事；产出可发布的贴文时输出 [post] 登记发帖（platform 写平台名、text 写文案）。
被合规审核员打回时，按审核意见逐条修订后重新交付。
${PROTOCOL}`,
  },
  {
    key: 'compliance',
    name: '合规审核员',
    soul: `你是「合规审核员」（风控审核部），「手工艺品代卖」团队评审关卡。只向总经理 CEO 汇报，不向其他部门派单。
职责：内容合规、授权、品牌伦理和质量检查。交付：风险清单、审核意见。
权限：可打回并阻断高风险内容——发现问题时意见中必须包含「驳回」或 [verdict:reject]，并逐条列出整改项；无问题时以「审核通过」开头（正文勿出现驳回类词汇，避免误触发返工）。
检查项：1) 广告法禁语与夸大宣传 2) 素材授权与版权 3) 品牌伦理 4) 事实性错误 5) 质量底线。
${PROTOCOL}`,
  },
  {
    key: 'ops',
    name: '运营专员',
    soul: `你是「运营专员」（电商运营部），「手工艺品代卖」团队业务链第 4 环。只向总经理 CEO 汇报，不向其他部门派单。
职责：商品资料、上架准备、店铺运营支持。交付：上架清单、运营计划。
输出结构：1) 上架清单（商品资料/素材/价格）2) 运营计划（节奏与预算建议）。
业务动作：用户确认定价后输出 [intake] 上架商品；有购买链接输出 [link] 上商品链接；
出单时输出 [order] 登记销售；输出 [report] 做盈利汇报（盈利 = 售价 − 成本 − 快递费）。
纪律：资金操作由人负责；预算只作建议，绝不执行任何支付或下单动作。
${PROTOCOL}`,
  },
  {
    key: 'biz',
    name: '商务专员',
    soul: `你是「商务专员」（商务拓展部），「手工艺品代卖」团队业务链第 5 环。只向总经理 CEO 汇报，不向其他部门派单。
职责：企业采购材料、潜在客户筛选跟进、快递合作。交付：采购方案、线索记录。
输出结构：1) 采购方案（企业礼品/公益采购：报价阶梯、定制包装、交期、售后开票）2) 线索记录（客户画像/意向/跟进计划）3) 快递合作安排。
业务动作：订单需要寄出时联系快递员上门取件，输出 [ship] 登记（收件信息知道就带 receiver/phone/address，有运单号带 tracking）。
纪律：合同与资金操作由人负责；你只产出方案与线索，不做任何对外承诺。
${PROTOCOL}`,
  },
];

export interface CraftTeamSetupResult {
  created: boolean;
  team_id: string;
  group_id: string;
  agent_ids: string[];
  agent_names: string[];
  workflow: Array<{ from: string; to: string }>;
}

interface PyAgentRecord {
  agent_id?: string;
  id?: string;
  name?: string;
}

interface PyTeamRecord {
  team_id?: string;
  agent_ids?: string[];
}

interface PyGroupRecord {
  group_id?: string;
}

/** 全队展示名（总经理 + 6 部门，与 roster 顺序一致）。 */
function teamNames(): string[] {
  return ['总经理', ...ROLES.map((r) => r.name)];
}

/**
 * 幂等搭建代卖团队。已建过（settings 有引用且 team 还在、编制一致）→ 复用并
 * 重刷 workflow，返回 created:false；否则全量新建（编制不一致的旧团队整体换新，
 * settings 引用覆盖为新团队）。
 */
export async function setupCraftTeam(): Promise<CraftTeamSetupResult> {
  const expectedTotal = 1 + ROLES.length; // 总经理 + 6 部门
  const existing = getSetting(CRAFT_TEAM_KEY) as CraftTeamRef | undefined;
  if (existing?.team_id) {
    const team = await pyJson<PyTeamRecord>(`/api/teams/${encodeURIComponent(existing.team_id)}`);
    // 2026-11-08 架构图重组 — 旧编制（总经理+7 专员）不匹配时走全新建。
    if (team && (team.agent_ids ?? existing.agent_ids ?? []).length === expectedTotal) {
      // 复用：刷 soul（话术迭代后幂等 setup 即同步）+ 补 workflow（幂等 PUT）+ 确保群还在。
      await refreshSouls(existing.agent_ids ?? []);
      const workflow = buildWorkflow(existing.agent_ids ?? []);
      if (existing.agent_ids?.length) {
        await pyJson(`/api/teams/${encodeURIComponent(existing.team_id)}/workflow`, {
          method: 'PUT',
          body: JSON.stringify(workflow),
        });
      }
      let groupId = existing.group_id ?? '';
      const group = groupId
        ? await pyJson<PyGroupRecord>(`/api/groups/${encodeURIComponent(groupId)}`)
        : null;
      if (!group?.group_id) {
        groupId = await createGroup(existing.team_id, existing.agent_ids ?? []);
      }
      const ref: CraftTeamRef = {
        team_id: existing.team_id,
        group_id: groupId,
        agent_ids: existing.agent_ids ?? [],
      };
      setSetting(CRAFT_TEAM_KEY, ref);
      return {
        created: false,
        team_id: existing.team_id,
        group_id: groupId,
        agent_ids: existing.agent_ids ?? [],
        agent_names: teamNames(),
        workflow: workflow.edges.map((e) => ({ from: e.source, to: e.target })),
      };
    }
  }

  // ── 全量新建 ──────────────────────────────────────────────────────────────
  // 总经理 CEO（内置秘书）任 n1 队长：先确认已播种。
  const secretary = await pyJson<PyAgentRecord>(`/api/agents/${SECRETARY_AGENT_ID}`);
  if (!secretary?.agent_id && !secretary?.id) {
    throw new CraftProfitError('总经理 agent 不存在（Python 后端未播种 secretary？）', 502);
  }
  const agentIds: string[] = [];
  for (const role of ROLES) {
    const created = await pyJson<PyAgentRecord>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: role.name, soul: role.soul, workspace_id: 'default' }),
    });
    const id = created?.agent_id ?? created?.id;
    if (!id) {
      throw new CraftProfitError(`建 agent「${role.name}」失败（Python 后端未就绪？）`, 502);
    }
    agentIds.push(id);
  }
  // 队伍名单：总经理 CEO 打头（workflow n1），6 部门随后。
  const roster = [SECRETARY_AGENT_ID, ...agentIds];

  const team = await pyJson<PyTeamRecord>('/api/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: '手工艺品代卖团队',
      description:
        '手工艺品代卖：手工艺人只上架商品，总经理 CEO 带 6 部门（市场研究/品牌策划/内容创作/电商运营/商务拓展/风控审核）做市场分析、品牌策划、营销内容、上架与商品链接、企业采购与快递寄出、合规审核，订单/盈利/快递情况同步平台',
      agent_ids: roster,
      workspace_id: 'default',
    }),
  });
  const teamId = team?.team_id;
  if (!teamId) throw new CraftProfitError('建团队失败（Python 后端未就绪？）', 502);

  const workflow = buildWorkflow(roster);
  const saved = await pyJson(`/api/teams/${encodeURIComponent(teamId)}/workflow`, {
    method: 'PUT',
    body: JSON.stringify(workflow),
  });
  if (!saved) throw new CraftProfitError('写团队流水线 workflow 失败', 502);

  const groupId = await createGroup(teamId, roster);
  setSetting(CRAFT_TEAM_KEY, { team_id: teamId, group_id: groupId, agent_ids: roster });
  return {
    created: true,
    team_id: teamId,
    group_id: groupId,
    agent_ids: roster,
    agent_names: teamNames(),
    workflow: workflow.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

/**
 * 架构图任务 DAG（roster 顺序：n1 总经理 CEO、n2 市场、n3 品牌、n4 内容、
 * n5 合规、n6 运营、n7 商务）：
 *
 *   n1→n2→n3 ─[approve 品牌定稿]→ n4 → n5 ─[approve 对外发布]→ n6
 *                                    ↺ conditional 驳回返工(≤2)   │
 *                                    └──────── direct ────────→ n7
 */
function buildWorkflow(agentIds: string[]): {
  nodes: Array<{ id: string; data: { agentId: string } }>;
  edges: Array<{ source: string; target: string; data: { mode: string; max_retries?: number } }>;
} {
  const nodes = agentIds.map((id, i) => ({ id: `n${i + 1}`, data: { agentId: id } }));
  const n = (i: number) => `n${i}`;
  const direct = (a: string, b: string) => ({ source: a, target: b, data: { mode: 'direct' } });
  const approve = (a: string, b: string) => ({ source: a, target: b, data: { mode: 'approve' } });
  const rework = (a: string, b: string) => ({
    source: a,
    target: b,
    data: { mode: 'conditional', max_retries: 2 },
  });
  const edges = [
    direct(n(1), n(2)), // 总经理 CEO → 市场分析师
    direct(n(2), n(3)), // 市场分析师 → 品牌策划师
    approve(n(3), n(4)), // 品牌定稿·董事长审批 → 内容策划师
    direct(n(4), n(5)), // 内容策划师 → 合规审核员
    rework(n(5), n(4)), // 合规驳回 → 内容策划师返工（≤2 次）
    approve(n(5), n(6)), // 对外发布·董事长审批 → 运营专员
    direct(n(5), n(7)), // 合规 → 商务专员
  ];
  return { nodes, edges };
}

/**
 * 复用路径的 soul 刷新：按名字对齐角色（用户改名的 agent 跳过），PATCH 最新话术。
 * 单个失败不阻断复用（refresh 是锦上添花，不是搭建的前提）。
 */
async function refreshSouls(agentIds: string[]): Promise<void> {
  for (const id of agentIds) {
    const rec = await pyJson<PyAgentRecord>(`/api/agents/${encodeURIComponent(id)}`);
    const role = ROLES.find((r) => r.name === rec?.name);
    if (!role) continue;
    await pyJson(`/api/agents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ soul: role.soul }),
    });
  }
}

async function createGroup(teamId: string, agentIds: string[]): Promise<string> {
  const group = await pyJson<PyGroupRecord>('/api/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: '手工艺品代卖·工作群',
      agent_ids: agentIds,
      team_id: teamId,
      kind: 'group',
    }),
  });
  const groupId = group?.group_id;
  if (!groupId) throw new CraftProfitError('建工作群失败（Python 后端未就绪？）', 502);
  return groupId;
}

/** 团队引用状态（供路由 GET /team/status）。 */
export function craftTeamStatus(): CraftTeamRef | null {
  const raw = getSetting(CRAFT_TEAM_KEY) as CraftTeamRef | undefined;
  return raw && (raw.team_id || raw.group_id) ? raw : null;
}

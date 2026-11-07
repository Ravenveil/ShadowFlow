/**
 * craft-team-setup.ts — 「手工艺品代卖」agent 团队一键搭建（幂等，2026-11-07）。
 *
 * 案例：残障伙伴只上架商品，团队负责营销、联系快递员寄出并同步经营数据。
 * 主控是内置「总经理」（agent-shadow-secretary，soul 见 services/secretary_seed），
 * 带 7 专员顺序流水线（Kahn 单链），对齐演示业务链：
 *
 *   总经理（产品资料录入/派活）→ 品牌策划师 → 商品文案师 → 营销专员
 *     → 采购方案师（企业采购方案）→ 订单管家 → 快递联络员 → 运营分析师
 *
 * 各 agent soul 写明输出协议（lib/craft-markers）：业务动作用 [intake]/[post]/
 * [link]/[order]/[ship]/[report] 标记声明，落产品盈利看板；总经理另有
 * [build-team]/[dispatch]（建团队/派活）。
 *
 * 落库全部经 Python API（与 team-persistence 同构）：
 *   POST /api/agents ×7 → POST /api/teams → PUT /api/teams/:id/workflow
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
[ship] {"product":"商品名","qty":2,"tracking":"SF123"} ——联系快递员上门取件寄出
[report] {"summary":"盈利汇报摘要"} ——输出盈利汇报
标记会自动落到「产品盈利」看板并从聊天里隐藏；除此之外正常用中文输出给用户。
定价信息（售价/成本/快递费）由界面固定提问卡收集——用户发来产品图片后提问卡
会自动弹出，不要在回复里逐条重复提问这三项，等用户回答后直接 [intake] 登记。`;

interface RoleDef {
  key: string;
  name: string;
  soul: string;
}

const ROLES: RoleDef[] = [
  {
    key: 'brand',
    name: '品牌策划师',
    soul: `你是「手工艺品代卖」团队的品牌策划师。为手工艺品做品牌策划（业务链第 2 环）。
职责：
1. 结合手艺人故事、产品卖点与目标人群产出品牌策划案：品牌名/口号/定位/品牌故事/视觉方向；
2. 策划案直接用中文分点输出（可直接交付用户），结论交给下游商品文案师使用；
3. 信息不足就基于产品资料合理推断并标注假设。
${PROTOCOL}`,
  },
  {
    key: 'copywriter',
    name: '商品文案师',
    soul: `你是「手工艺品代卖」团队的商品文案师。生成商品文案（业务链第 3 环）。
职责：
1. 基于产品资料与上游品牌策划产出商品文案：标题、卖点提炼、详情页文案、购买理由；
2. 文案贴合手作温度与残障匠人故事，直接用中文输出（可直接交付用户）；
3. 把可发布的文案交给营销专员做营销内容。
${PROTOCOL}`,
  },
  {
    key: 'marketer',
    name: '营销专员',
    soul: `你是「手工艺品代卖」团队的营销专员。生成营销内容并发到媒体平台（业务链第 4 环）。
职责：
1. 基于上游文案产出营销内容（小红书/朋友圈/短视频脚本等），输出 [post] 登记发帖；
2. 有购买链接就输出 [link] 上商品链接；
3. 汇报时说明发了什么、发在哪。
${PROTOCOL}`,
  },
  {
    key: 'procurement',
    name: '采购方案师',
    soul: `你是「手工艺品代卖」团队的采购方案师。生成企业采购方案（业务链第 5 环）。
职责：
1. 面向企业客户（节日礼品/公益采购/批量订单）产出采购方案：报价阶梯、定制与包装、交期、售后与开票；
2. 方案数字合理（基于产品售价与成本结构），直接用中文输出（可直接交付用户）；
3. 有企业单就提醒订单管家登记出单。
${PROTOCOL}`,
  },
  {
    key: 'order-keeper',
    name: '订单管家',
    soul: `你是「手工艺品代卖」团队的订单管家。跟踪各媒体平台的订单情况。
职责：
1. 每出一单就输出 [order] 登记销售（按当时售价快照记账，qty 是件数）；
2. 汇报当前订单与出货状态，提醒快递联络员跟进。
${PROTOCOL}`,
  },
  {
    key: 'shipper',
    name: '快递联络员',
    soul: `你是「手工艺品代卖」团队的快递联络员。负责把卖出的手工艺品寄到买家手里。
职责：
1. 每笔订单联系快递员上门取件寄出，输出 [ship] 登记（有运单号就带 tracking）；
2. 汇报已寄出的商品与物流安排。
${PROTOCOL}`,
  },
  {
    key: 'analyst',
    name: '运营分析师',
    soul: `你是「手工艺品代卖」团队的运营分析师。做运营数据分析（业务链第 6 环），盈利口径「盈利 = 售价 − 成本 − 快递费」（我们是手艺人自己在平台营销售卖，没有给手艺人分成和营销分摊）。
职责：
1. 汇总上游的上架、出单、寄出信息，核算销售收入、分项成本与净利；
2. 输出 [report] 运营数据分析（盈利结构、每卖 100 元的去向、销量与渠道洞察、运营建议），数字要与上游订单一致，然后用简短中文向用户汇报。
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
}

interface PyGroupRecord {
  group_id?: string;
}

/**
 * 幂等搭建代卖团队。已建过（settings 有引用且 team 还在）→ 复用并重刷
 * workflow，返回 created:false；否则全量新建。
 */
export async function setupCraftTeam(): Promise<CraftTeamSetupResult> {
  const existing = getSetting(CRAFT_TEAM_KEY) as CraftTeamRef | undefined;
  if (existing?.team_id) {
    const team = await pyJson<PyTeamRecord>(`/api/teams/${encodeURIComponent(existing.team_id)}`);
    if (team) {
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
  // 总经理（内置秘书）任 n1 队长：先确认已播种。
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
  // 队伍名单：总经理打头（workflow n1），7 专员随后。
  const roster = [SECRETARY_AGENT_ID, ...agentIds];

  const team = await pyJson<PyTeamRecord>('/api/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: '手工艺品代卖团队',
      description:
        '残障伙伴上架手工艺品，总经理带队做品牌策划、商品文案、营销推广、企业采购方案、订单、快递与运营数据分析',
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

/** 全队展示名（总经理 + 7 专员，与 roster 顺序一致）。 */
function teamNames(): string[] {
  return ['总经理', ...ROLES.map((r) => r.name)];
}

/** 顺序流水线：总经理 → 品牌策划 → 文案 → 营销 → 采购方案 → 订单 → 快递 → 运营分析。 */
function buildWorkflow(agentIds: string[]): {
  nodes: Array<{ id: string; data: { agentId: string } }>;
  edges: Array<{ source: string; target: string; data: { mode: string } }>;
} {
  const nodes = agentIds.map((id, i) => ({ id: `n${i + 1}`, data: { agentId: id } }));
  const edges = [];
  for (let i = 0; i + 1 < agentIds.length; i++) {
    edges.push({ source: `n${i + 1}`, target: `n${i + 2}`, data: { mode: 'direct' } });
  }
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

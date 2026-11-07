/**
 * craft-team-setup.ts — 「手工艺品代卖」agent 团队一键搭建（幂等，2026-11-07）。
 *
 * 案例：残障伙伴只上架商品，团队负责营销、联系快递员寄出并同步经营数据。
 * 五个角色顺序流水线（Kahn 单链）：
 *
 *   代卖CEO（收产品素材/分派）→ 营销专员（发帖/上链接）→ 订单管家（出单记账）
 *     → 快递联络员（联系快递寄出）→ 盈利分析官（盈利汇报）
 *
 * 各 agent soul 写明输出协议（lib/craft-markers）：业务动作用 [intake]/[post]/
 * [link]/[order]/[ship]/[report] 标记声明，落产品盈利看板。
 *
 * 落库全部经 Python API（与 team-persistence 同构）：
 *   POST /api/agents ×5 → POST /api/teams → PUT /api/teams/:id/workflow
 *   → POST /api/groups（绑 team_id）→ settings craft_profit.team 记引用。
 * 失败上抛 CraftProfitError（setup 是用户显式动作，不 fail-soft）。
 */
import { CraftProfitError } from './craft-profit';
import { CRAFT_TEAM_KEY, type CraftTeamRef } from './craft-intake';
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
[intake] {"name":"商品名","price":68,"artisan":30,"shipping":8,"marketing":5} ——上架商品（售价/给手艺人/快递费/营销分摊）
[post] {"platform":"小红书","title":"标题","text":"文案"} ——在媒体平台发帖推广
[link] {"product":"商品名","url":"https://…"} ——上商品购买链接
[order] {"product":"商品名","qty":2} ——登记销售出单
[ship] {"product":"商品名","qty":2,"tracking":"SF123"} ——联系快递员上门取件寄出
[report] {"summary":"盈利汇报摘要"} ——输出盈利汇报
标记会自动落到「产品盈利」看板并从聊天里隐藏；除此之外正常用中文输出给用户。`;

interface RoleDef {
  key: string;
  name: string;
  soul: string;
}

const ROLES: RoleDef[] = [
  {
    key: 'ceo',
    name: '代卖CEO',
    soul: `你是「手工艺品代卖」团队的 CEO，和用户直接对话。残障伙伴只负责提供手工艺品，团队帮他们营销、联系快递员寄出。
用户发来的产品介绍、图片、文档说明已自动同步到知识库「手工艺品资料」（回答前可引用）。
职责：
1. 问清用户要卖什么手工艺品：名称、卖点、售价、给手艺人多少、快递费、营销预算分摊；
2. 信息齐了就输出 [intake] 上架商品（一次可多个标记）；
3. 把活分派给团队：营销专员去媒体平台发帖、上商品链接；订单管家跟踪订单出单；快递联络员联系快递员上门取件寄出；盈利分析官核算汇报盈利；
4. 收到团队产出后用一两句话向用户小结进展。
${PROTOCOL}`,
  },
  {
    key: 'marketer',
    name: '营销专员',
    soul: `你是「手工艺品代卖」团队的营销专员。为上架的手工艺品写推广内容，发到媒体平台（朋友圈/小红书/短视频等）。
职责：
1. 结合商品卖点（手作温度、残障匠人故事、实用场景）写短文案，输出 [post] 登记发帖；
2. 有购买链接就输出 [link] 上商品链接；
3. 汇报时说明发了什么、发在哪。
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
    key: 'accountant',
    name: '盈利分析官',
    soul: `你是「手工艺品代卖」团队的盈利分析官。按「盈利 = 售价 − 给手艺人 − 快递费 − 营销分摊」口径核算。
职责：
1. 汇总上游的上架、出单、寄出信息，核算销售收入、分项成本与净利；
2. 输出 [report] 盈利汇报（含每卖 100 元的去向），数字要与上游订单一致，然后用简短中文向用户汇报。
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
      // 复用：补 workflow（幂等 PUT）+ 确保群还在。
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
        agent_names: ROLES.map((r) => r.name),
        workflow: workflow.edges.map((e) => ({ from: e.source, to: e.target })),
      };
    }
  }

  // ── 全量新建 ──────────────────────────────────────────────────────────────
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

  const team = await pyJson<PyTeamRecord>('/api/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: '手工艺品代卖团队',
      description: '残障伙伴上架手工艺品，团队负责营销、联系快递员寄出并同步盈利数据',
      agent_ids: agentIds,
      workspace_id: 'default',
    }),
  });
  const teamId = team?.team_id;
  if (!teamId) throw new CraftProfitError('建团队失败（Python 后端未就绪？）', 502);

  const workflow = buildWorkflow(agentIds);
  const saved = await pyJson(`/api/teams/${encodeURIComponent(teamId)}/workflow`, {
    method: 'PUT',
    body: JSON.stringify(workflow),
  });
  if (!saved) throw new CraftProfitError('写团队流水线 workflow 失败', 502);

  const groupId = await createGroup(teamId, agentIds);
  setSetting(CRAFT_TEAM_KEY, { team_id: teamId, group_id: groupId, agent_ids: agentIds });
  return {
    created: true,
    team_id: teamId,
    group_id: groupId,
    agent_ids: agentIds,
    agent_names: ROLES.map((r) => r.name),
    workflow: workflow.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

/** 顺序流水线：ceo → 营销 → 订单 → 快递 → 财务（node id 与 agent 一一对应）。 */
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

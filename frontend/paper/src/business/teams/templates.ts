/**
 * templates.ts — 内置团队模板（2026-11-25 从 frontend/app 的 content/teams.ts 迁入）。
 *
 * 这两支团队**不依赖后端是否已有团队记录**：后端团队列表为空时，管理团队页
 * 直接拿它们的 workflow 画工作流；策略矩阵与审批门保持空态（没有后端 team
 * 可写，不给假开关）。
 *
 * 这是「业务层」的数据：换一套业务 = 换这个文件（或后端 team.yaml 读进来），
 * 通用运行时（工作流画布、策略矩阵、审批门）一行都不用改。
 */
import type { TeamWorkflowGraph } from '@/shared/data/http/teams';

export interface TeamTemplate {
  team_id: string;
  name: string;
  description: string;
  /** 成员：名字 + 一句话职责（模板不绑后端 agent_id，姓名即主键）。 */
  members: { name: string; role: string }[];
  workflow: TeamWorkflowGraph;
  /** 内置模板：没有后端 team 记录，跳过 policy / 审批请求。 */
  builtin: true;
}

/** 画布节点：agentId 用成员名，好让工作流与成员格查同一份名册。 */
const node = (id: string, name: string, soul: string) => ({
  id,
  data: { name, soul, agentId: name, role: soul },
});

/** 论文团队：选题 → 写作 → 双线复核 → 润色 → 投稿。 */
const PAPER_TEAM: TeamTemplate = {
  team_id: 'default-paper',
  name: '论文团队',
  description: '从选题到投稿的论文流水线：主笔成稿、引用与方法双线复核、润色后投稿。',
  members: [
    { name: 'PI', role: '把控研究方向与学术严谨性' },
    { name: '章节主笔', role: '按 section 拆分写作任务并成稿' },
    { name: '引用审查', role: '核对引用完整性、数据出处与证据链' },
    { name: '方法复核', role: '复核实验方法与统计推断' },
    { name: '润色编辑', role: '文风润色与学术表达规范化' },
    { name: '投稿管理', role: '会议 / 期刊投稿流程管理' },
  ],
  builtin: true,
  workflow: {
    nodes: [
      node('pi', 'PI', '把控研究方向与学术严谨性'),
      node('sw', '章节主笔', '按 section 拆分写作任务并成稿'),
      node('cr', '引用审查', '核对引用完整性、数据出处与证据链'),
      node('mr', '方法复核', '复核实验方法与统计推断'),
      node('ep', '润色编辑', '文风润色与学术表达规范化'),
      node('sm', '投稿管理', '会议 / 期刊投稿流程管理'),
    ],
    edges: [
      { source: 'pi', target: 'sw', data: { mode: 'direct' } },
      { source: 'sw', target: 'cr', data: { mode: 'direct' } },
      { source: 'sw', target: 'mr', data: { mode: 'direct' } },
      { source: 'cr', target: 'ep', data: { mode: 'conditional' } },
      { source: 'mr', target: 'ep', data: { mode: 'approve' } },
      { source: 'ep', target: 'sm', data: { mode: 'direct' } },
    ],
  },
};

/** 营销团队：主理接单 → 调研 → 策略 → 内容 → 投放（审批门）→ 复盘回炉。 */
const MARKETING_TEAM: TeamTemplate = {
  team_id: 'default-marketing',
  name: '营销团队',
  description: '品牌焕新流水线：主理接单、调研定策略、内容与投放落地，数据复盘后回炉优化。',
  members: [
    { name: '项目主理', role: '对接需求、拆解目标并把控交付节奏' },
    { name: '市场调研', role: '竞品与人群调研，输出机会点' },
    { name: '品牌策略', role: '确定定位、主张与传播主线' },
    { name: '内容策划', role: '按渠道产出文案与内容选题' },
    { name: '渠道投放', role: '排期投放并控制预算' },
    { name: '数据复盘', role: '回收数据、归因并给出优化建议' },
  ],
  builtin: true,
  workflow: {
    nodes: [
      node('lead', '项目主理', '对接需求、拆解目标并把控交付节奏'),
      node('research', '市场调研', '竞品与人群调研，输出机会点'),
      node('strategy', '品牌策略', '确定定位、主张与传播主线'),
      node('copy', '内容策划', '按渠道产出文案与内容选题'),
      node('media', '渠道投放', '排期投放并控制预算'),
      node('analytics', '数据复盘', '回收数据、归因并给出优化建议'),
    ],
    edges: [
      { source: 'lead', target: 'research', data: { mode: 'direct' } },
      { source: 'research', target: 'strategy', data: { mode: 'direct' } },
      { source: 'strategy', target: 'copy', data: { mode: 'direct' } },
      { source: 'copy', target: 'media', data: { mode: 'approve' } },
      { source: 'media', target: 'analytics', data: { mode: 'direct' } },
      { source: 'analytics', target: 'lead', data: { mode: 'conditional' } },
    ],
  },
};

/** 展示顺序即管理团队页的模板顺序。 */
export const DEFAULT_TEAMS: TeamTemplate[] = [PAPER_TEAM, MARKETING_TEAM];

/* ── 团队主键 ─────────────────────────────────────────────────────── */

/**
 * 内置模板与后端团队共处一列表时，主键必须互不撞车：模板加 `builtin:` 前缀。
 * 放在这里而不是页面里，是因为「第二栏」和「团队详情」两处都要用它选人。
 */
export const builtinKey = (team: TeamTemplate): string => `builtin:${team.team_id}`;

/** 后端团队的主键可能叫 team_id，也可能只有 id。 */
export function teamKey(team: { team_id?: string; id?: string; name: string }): string {
  return team.team_id ?? team.id ?? team.name;
}

/**
 * 一位成员的不算团队：那只是某个 agent 的分身（或建群时只拉了主控）。
 * 名单、第二栏、详情页共用这一条判据 —— 免得某处又把它当团队摆出来。
 */
export function isTeam(memberCount: number): boolean {
  return memberCount > 1;
}

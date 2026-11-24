/**
 * teams.ts — 内置默认团队模板（管理团队页始终可选）。
 *
 * 这两支团队不依赖后端是否已有团队记录：选中后直接用模板里的 workflow
 * 画工作流；策略矩阵与审批门保持空态（没有后端 team 可写）。
 * 结构化数据（角色链路）放这里，组件只消费。
 */

export interface TeamTemplateNode {
  id: string;
  data?: { agentId?: string; name?: string; soul?: string };
}

export interface TeamTemplateEdge {
  source: string;
  target: string;
  data?: { mode?: string };
}

export interface TeamTemplate {
  team_id: string;
  name: string;
  description?: string;
  agent_ids: string[];
  workflow: { nodes: TeamTemplateNode[]; edges: TeamTemplateEdge[] };
  /** 内置模板：没有后端 team 记录，跳过 policy / 审批请求。 */
  builtin: true;
}

const node = (id: string, name: string, soul: string): TeamTemplateNode => ({
  id,
  data: { name, soul },
});

/** 论文团队：选题 → 写作 → 双线复核 → 润色 → 投稿。 */
const PAPER_TEAM: TeamTemplate = {
  team_id: "default-paper",
  name: "论文团队",
  description: "从选题到投稿的论文流水线：主笔成稿、引用与方法双线复核、润色后投稿。",
  agent_ids: ["PI", "章节主笔", "引用审查", "方法复核", "润色编辑", "投稿管理"],
  builtin: true,
  workflow: {
    nodes: [
      node("pi", "PI", "把控研究方向与学术严谨性"),
      node("sw", "章节主笔", "按 section 拆分写作任务并成稿"),
      node("cr", "引用审查", "核对引用完整性、数据出处与证据链"),
      node("mr", "方法复核", "复核实验方法与统计推断"),
      node("ep", "润色编辑", "文风润色与学术表达规范化"),
      node("sm", "投稿管理", "会议 / 期刊投稿流程管理"),
    ],
    edges: [
      { source: "pi", target: "sw", data: { mode: "direct" } },
      { source: "sw", target: "cr", data: { mode: "direct" } },
      { source: "sw", target: "mr", data: { mode: "direct" } },
      { source: "cr", target: "ep", data: { mode: "conditional" } },
      { source: "mr", target: "ep", data: { mode: "approve" } },
      { source: "ep", target: "sm", data: { mode: "direct" } },
    ],
  },
};

/** 营销团队：主理接单 → 调研 → 策略 → 内容 → 投放（审批门）→ 复盘回炉。 */
const MARKETING_TEAM: TeamTemplate = {
  team_id: "default-marketing",
  name: "营销团队",
  description: "品牌焕新流水线：主理接单、调研定策略、内容与投放落地，数据复盘后回炉优化。",
  agent_ids: ["项目主理", "市场调研", "品牌策略", "内容策划", "渠道投放", "数据复盘"],
  builtin: true,
  workflow: {
    nodes: [
      node("lead", "项目主理", "对接需求、拆解目标并把控交付节奏"),
      node("research", "市场调研", "竞品与人群调研，输出机会点"),
      node("strategy", "品牌策略", "确定定位、主张与传播主线"),
      node("copy", "内容策划", "按渠道产出文案与内容选题"),
      node("media", "渠道投放", "排期投放并控制预算"),
      node("analytics", "数据复盘", "回收数据、归因并给出优化建议"),
    ],
    edges: [
      { source: "lead", target: "research", data: { mode: "direct" } },
      { source: "research", target: "strategy", data: { mode: "direct" } },
      { source: "strategy", target: "copy", data: { mode: "direct" } },
      { source: "copy", target: "media", data: { mode: "approve" } },
      { source: "media", target: "analytics", data: { mode: "direct" } },
      { source: "analytics", target: "lead", data: { mode: "conditional" } },
    ],
  },
};

/** 默认团队顺序即管理团队页的展示顺序。 */
export const DEFAULT_TEAMS: TeamTemplate[] = [PAPER_TEAM, MARKETING_TEAM];

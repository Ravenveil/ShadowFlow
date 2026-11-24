/**
 * app.ts — 工作台通用文案与展示名单（组件只读这里，不再内联字面量）。
 */

/** 各视图抬头（chat 不走这里，聊天页有自己的空态）。 */
export const VIEW_COPY: Record<string, { title: string }> = {
  agents: { title: "管理团队" },
  knowledge: { title: "知识库" },
  news: { title: "新闻" },
  biz: { title: "生意看板" },
  projects: { title: "工作备忘" },
  schedules: { title: "定时任务" },
  settings: { title: "设置" },
};

/** 空会话的快捷指令。 */
export const QUICK_PROMPTS: string[] = [
  "把组会稿整理成投稿稿",
  "核对第 3 节引用",
  "生成章节骨架",
  "查看团队执行状态",
];

/** 主题卡片文案（label 用于按钮，blurb 用于说明）。 */
export const THEME_META: Record<string, { label: string; blurb: string }> = {
  ink: { label: "墨橙", blurb: "米白纸感 · 橙色强调 · 硬边卡片" },
  clean: { label: "净白", blurb: "纯白留白 · 紫色强调 · 圆角柔和" },
  night: { label: "夜间", blurb: "深墨背景 · 橙光点缀 · 长时间写作" },
};

/** 管理团队页（团队级，不铺单个 agent）。 */
export const TEAMS = {
  kicker: "TEAM OPS",
  title: "管理团队",
  blurb: "选中一个团队，看它的工作流、协作策略与审批门。",
  pickerTitle: "团队",
  memberUnit: "名成员",
  loading: "加载中…",
  loadFailed: "读取团队失败",
  pickHint: "先选一个团队",
  noWorkflow: "这个团队还没有工作流",
} as const;

/**
 * 展示口径的论文团队 6 名角色（对齐 templates/academic-paper.yaml 的 agent_roster）。
 * 后端不可达时作为各视图的兜底占位数据。
 */
export const AGENTS = [
  {
    id: "pi",
    name: "PI",
    role: "课题负责人 · 把控研究方向与学术严谨性",
    initials: "PI",
    color: "#2777e8",
    status: "在线",
  },
  {
    id: "sw",
    name: "章节主笔",
    role: "按 section 拆分写作任务并成稿",
    initials: "主笔",
    color: "#0ea5a4",
    status: "执行中",
  },
  {
    id: "cr",
    name: "引用审查",
    role: "核对引用完整性、数据出处与证据链",
    initials: "引用",
    color: "#d97b38",
    status: "执行中",
  },
  {
    id: "mr",
    name: "方法复核",
    role: "复核实验方法与统计推断",
    initials: "复核",
    color: "#7c5cff",
    status: "等待中",
  },
  {
    id: "ep",
    name: "润色编辑",
    role: "文风润色与学术表达规范化",
    initials: "润色",
    color: "#e0356b",
    status: "等待中",
  },
  {
    id: "sm",
    name: "投稿管理",
    role: "会议 / 期刊投稿流程管理",
    initials: "投稿",
    color: "#57a04a",
    status: "在线",
  },
];

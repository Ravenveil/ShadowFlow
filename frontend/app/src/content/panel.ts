/**
 * panel.ts — 右侧执行详情栏（frontend-paper AgentPanel 形态）的全部文案。
 *
 * 组件只按 key 取字，新增/改词都在这里，避免在 JSX 里散落字符串。
 */

export const RUN_STATUS_TEXT: Record<string, string> = {
  done: "已完成",
  running: "执行中",
  pending: "等待中",
  failed: "失败",
};

/** 单聊「灵魂」页文案（对齐旧前端的 Agent 灵魂页）。 */
export const SOUL = {
  title: "灵魂",
  activity: "活动",
  section: "角色设定",
  namePlaceholder: "Agent 名称",
  placeholder: "写下这个 Agent 的角色、边界与口吻…",
  save: "保存",
  saving: "保存中…",
  saved: "已保存",
  failed: "保存失败",
  recent: "最近活动",
  empty: "暂无最近活动",
  loadFailed: "读取 Agent 失败",
} as const;

export const PANEL = {
  label: "执行详情",
  /** tab 顺序即显示顺序。 */
  tabs: [
    { id: "flow" as const, label: "过程" },
    { id: "team" as const, label: "管理团队" },
    { id: "artifacts" as const, label: "产物" },
  ],
  close: "隐藏执行详情",
  status: {
    running: "正在执行",
    failed: "任务失败",
    done: "任务完成",
    idle: "待命",
  },
  stepState: {
    done: "完成",
    running: "执行中",
    failed: "失败",
    wait: "等待",
  },
  stepsTitle: "执行步骤",
  stepCount: (done: number, total: number) => `${done}/${total} 步`,
  emptyRun: "暂无运行记录",
  retryStep: "重跑这一步",
  usageTitle: "用量",
  usageTokens: (tools: number) => ` tokens · ${tools} tools`,
  usageCost: "本轮花费",
  rosterTitle: (n: number) => `编队 · ${n}`,
  workflowTitle: "工作流",
  policyTitle: "策略举证",
  policyCorner: "行→列",
  policyWorst: "最严",
  policyUnset: "未配置",
  policyStates: {
    permit: { label: "直通", mark: "●" },
    warn: { label: "需复核", mark: "▲" },
    deny: { label: "禁止", mark: "✕" },
  },
  policyTotal: (n: number) => `共 ${n} 条`,
  artifactsTitle: (n: number) => `产物 · ${n}`,
  refresh: "刷新",
  emptyArtifacts: "暂无产物",
  pin: "置顶",
  unpin: "取消置顶",
  open: "打开",
  actions: {
    stop: "停止",
    retry: "重试",
    rerun: "重跑上一轮",
    artifacts: "产物",
    stopTitle: "停止当前任务",
    retryTitle: "重试失败的任务",
    rerunTitle: "重跑上一轮任务",
    artifactsTitle: "查看任务产物",
  },
} as const;

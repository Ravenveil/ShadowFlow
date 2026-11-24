/**
 * composer.ts — 输入区文案与斜杠命令表（搬自 frontend-paper）。
 *
 * 组件只认这份数据，不写死任何具体措辞 / 命令；新增命令在这里加一条，
 * `/` 菜单会自动出现。
 */

export type ComposerCommand = {
  id: string;
  name: string;
  desc: string;
  insert?: string;
  action?: "clear" | "help" | "inspect";
};

export const COMMANDS: ComposerCommand[] = [
  { id: "clear", name: "/clear", desc: "清空输入框、附件与已选知识包", action: "clear" },
  { id: "help", name: "/help", desc: "查看快捷键与命令说明", action: "help" },
  { id: "inspect", name: "/inspect", desc: "跳到右栏看本轮执行记录", action: "inspect" },
  {
    id: "outline",
    name: "/outline",
    desc: "插入章节骨架指令",
    insert: "按以下结构生成章节骨架，并标出每节字数配比：",
  },
  {
    id: "cite",
    name: "/cite",
    desc: "插入引用补齐指令",
    insert: "为下面这段补 3 条可核查引用（作者 · 年份 · 出处）：",
  },
  {
    id: "review",
    name: "/review",
    desc: "插入交叉复核指令",
    insert: "交叉复核这版结论，逐条指出证据不足与口径风险：",
  },
  {
    id: "figure",
    name: "/figure",
    desc: "插入配图说明指令",
    insert: "把这段改写成配图说明，注明数据来源与坐标含义：",
  },
  {
    id: "polish",
    name: "/polish",
    desc: "插入文风统一指令",
    insert: "在不改变结论的前提下统一文风，删掉口语化表达：",
  },
];

export const COMPOSER = {
  /* 工具条 */
  attach: "添加图片 / 文件（也可直接拖入）",
  slash: "斜杠命令",
  mention: "提及角色",
  send: "发送",
  stop: "停止生成",
  knowledge: "引用知识包",
  knowledgeEmpty: "暂无知识包",
  voice: "语音输入",
  /* 触发菜单 */
  menuMentionTitle: "提及",
  menuCommandTitle: "命令",
  menuGroupMember: "成员",
  menuGroupCommand: "内置命令",
  menuGroupTemplate: "指令模板",
  menuEmpty: (q: string) => `没有匹配「${q}」的项`,
  /* 模型面板 */
  modelTitle: "选择模型",
  modelEmpty: "暂无可用模型，请先在设置中配置",
  /* 知识包面板 */
  knowledgeTitle: "本轮引用的知识包",
  knowledgeDocs: (n: number) => `${n} 篇`,
  /* 语音 */
  voiceStarting: "正在请求麦克风…",
  voiceTranscribing: "正在转写…",
  voiceStop: "完成录音",
  voiceCancel: "取消录音",
  voiceUnsupported: "当前环境不支持录音",
  voiceEmpty: "没听到内容，再说一次",
  /* 帮助面板 */
  helpTitle: "快捷键与命令",
  helpKeys: [
    ["Enter", "发送消息"],
    ["Shift + Enter", "换行"],
    ["⌘ / Ctrl + Enter", "发送消息（备用）"],
    ["@", "提及成员"],
    ["/", "调起命令"],
    ["↑ ↓", "在菜单里移动"],
    ["Enter / Tab", "选中菜单项"],
    ["Esc", "关闭菜单"],
  ] as Array<[string, string]>,
  helpCommands: "在输入框敲 / 即可看到全部命令",
  /* 通用 */
  close: "关闭",
  submitFailed: (reason: string) => `发送失败：${reason}`,
  sizeKB: (kb: number) => `${kb} KB`,
  sizeMB: (mb: string) => `${mb} MB`,
};

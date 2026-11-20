/**
 * defaults.ts — 设置分区的**缺省值**（真后端没有的字段落到这里兜底）。
 *
 * 与 mock.ts 分家的原因：http 映射层也要用同一份缺省值，而按约定除
 * source.ts 外谁都不许 import data/mock。放这里两边都能用，换后端时
 * 「后端没给的项客户端怎么兜」只需看这一个文件。
 */
import type { AppSettings } from './types';

/**
 * 设置分区的缺省值。形状见 `data/types.ts` 的 AppSettings；
 * 每个分区的**文案**在 `content/settings.ts`，这里只有值。
 * 后端没给的项由映射层从这里兜底，不会出现「界面某块突然空白」。
 */
export const SETTINGS_SEED: AppSettings = {
  profile: {
    name: '王佳音',
    email: 'wjy@lab.paper.local',
    org: '智能写作实验室 · 论文组',
    timezone: 'Asia/Shanghai',
  },
  writing: {
    citation: 'gbt7714',
    dateFormat: 'iso',
    refLang: 'mixed',
    autoNumber: true,
  },
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      vendor: '深度求索',
      tone: 'blue',
      key: 'sk-de••••••••3f7a',
      models: ['V4.1', 'V4.1-Chat', 'R2'],
      defaultModel: 'V4.1',
      on: true,
      state: 'ok',
    },
    {
      id: 'anthropic',
      name: 'Claude',
      vendor: 'Anthropic',
      tone: 'amber',
      key: 'sk-ant-••••••2c19',
      models: ['Opus 4.6', 'Sonnet 4.6'],
      defaultModel: 'Sonnet 4.6',
      on: true,
      state: 'ok',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      vendor: 'OpenAI',
      tone: 'green',
      key: '',
      models: ['GPT-5.2', 'GPT-5 mini'],
      defaultModel: 'GPT-5.2',
      on: false,
      state: 'idle',
    },
    {
      id: 'kimi',
      name: 'Kimi',
      vendor: '月之暗面',
      tone: 'violet',
      key: 'sk-km••••••••91bd',
      models: ['K2', 'K2-Turbo'],
      defaultModel: 'K2',
      on: true,
      state: 'error',
    },
  ],
  clis: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      bin: 'claude',
      version: '2.6.1',
      path: '~/.local/bin/claude',
      installed: true,
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      version: '0.41.0',
      path: '/usr/local/bin/codex',
      installed: true,
    },
    {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      bin: 'gemini',
      version: '—',
      path: '—',
      installed: false,
    },
  ],
  ssh: [
    {
      id: 'gpu-a',
      name: '实验机 A100',
      host: 'gpu-lab-01.lab.local',
      user: 'wjy',
      port: 22,
      keyPath: '~/.ssh/id_ed25519',
      remoteDir: '/data/wjy/paper-runs',
      state: 'ok',
      latencyMs: 42,
      gpu: '2 × A100 80G',
    },
    {
      id: 'gpu-b',
      name: '本地 4090 工作站',
      host: '10.0.12.34',
      user: 'wang',
      port: 2222,
      keyPath: '~/.ssh/lab_4090',
      remoteDir: '/home/wang/runs',
      state: 'untested',
      gpu: 'RTX 4090 24G',
    },
  ],
  connectors: [
    {
      id: 'zotero',
      name: 'Zotero',
      desc: '文献库 · 自动同步条目与 PDF',
      tone: 'red',
      on: true,
      state: 'ok',
    },
    {
      id: 'overleaf',
      name: 'Overleaf',
      desc: 'LaTeX 项目 · 双向同步 .tex',
      tone: 'green',
      on: true,
      state: 'ok',
    },
    {
      id: 'github',
      name: 'GitHub',
      desc: '代码仓库 · 提交实验代码与图脚本',
      tone: 'slate',
      on: true,
      state: 'expired',
    },
    {
      id: 'notion',
      name: 'Notion',
      desc: '组会记录 · 读会议纪要当上下文',
      tone: 'violet',
      on: false,
      state: 'off',
    },
    {
      id: 'mcp-arxiv',
      name: 'arXiv MCP',
      desc: 'MCP 服务 · 检索预印本元数据',
      tone: 'blue',
      on: true,
      state: 'ok',
    },
  ],
  memory: [
    {
      id: 'lessons',
      label: '经验沉淀',
      note: '每次交付自动总结，下次开工自动带上下文',
      on: true,
      used: 428,
      cap: 600,
    },
    {
      id: 'profile',
      label: '运行画像',
      note: '角色偏好、常用口径、审稿口味',
      on: true,
      used: 56,
      cap: 120,
    },
    {
      id: 'river',
      label: 'River 手动记忆',
      note: '你亲手记下的判断，不会被自动覆盖',
      on: false,
      used: 12,
      cap: 200,
    },
  ],
  collab: [
    {
      id: 'lead-only',
      label: '群里默认只跟主控对话',
      note: '关掉后可以直接 @ 任意角色派活',
      on: true,
    },
    {
      id: 'approve-gate',
      label: '关键节点需人工确认',
      note: '合并成稿、对外投稿前挂审批门',
      on: true,
    },
    {
      id: 'auto-dispatch',
      label: '主控自动派活',
      note: '不打断你，先拆步骤再分给角色',
      on: true,
    },
    {
      id: 'parallel',
      label: '并行上限',
      note: '同时最多跑几个角色',
      value: '3',
    },
  ],
  notify: [
    { id: 'run-done', label: '任务跑完', note: '一轮流水线交付时提醒', on: true },
    { id: 'gate', label: '审批门待办', note: '需要你拍板的节点', on: true },
    { id: 'budget', label: '额度预警', note: '上下文或 token 用到 80%', on: true },
    { id: 'weekly', label: '每周汇总', note: '周一早上发一封进度摘要', on: false },
  ],
  privacy: [
    { id: 'local-only', label: '数据不出本机', note: '关闭后才会把正文送到云端模型', on: true },
    { id: 'telemetry', label: '匿名使用统计', note: '只上报功能点击，不含内容', on: false },
    { id: 'autosave', label: '自动保存草稿', note: '关闭后 Ctrl + S 才落盘', on: true },
  ],
};

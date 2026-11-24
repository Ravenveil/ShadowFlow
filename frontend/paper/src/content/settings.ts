/**
 * content/settings.ts — 设置页的全部文案。
 *
 * 组件只负责渲染，中文一个都不许出现在 .tsx 里（`npm run check` 会拦）。
 * 分区顺序、分组归属、选项文案都在这里改；值在 `data/mock.ts`。
 */

/** 导航分组。id 决定渲染哪个分区组件（见 settings/SettingsSheet.tsx 的 REGISTRY）。 */export const SETTINGS_NAV = {
  title: '设置',
  sub: '偏好保存在本机，换设备不会同步',
  close: '关闭',
  done: '完成',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  groups: [
    {
      group: '账户',
      items: [
        { id: 'profile', label: '个人资料' },
        { id: 'appearance', label: '外观' },
      ],
    },
    {
      group: '写作',
      items: [
        { id: 'writing', label: '写作规范' },
        { id: 'models', label: '模型与密钥' },
        { id: 'cli', label: '本地 CLI' },
      ],
    },
    {
      group: '集成',
      items: [
        { id: 'connectors', label: '连接器' },
        { id: 'ssh', label: '远程执行' },
        { id: 'memory', label: '知识与记忆' },
      ],
    },
    {
      group: '偏好',
      items: [
        { id: 'collab', label: '协作' },
        { id: 'notify', label: '通知' },
        { id: 'data', label: '数据与隐私' },
      ],
    },
  ],
} as const;

export const SETTINGS_COPY = {
  /* ── 个人资料 ── */
  profile: {
    title: '个人资料',
    note: '只用于署名、导出文档的页脚和组会纪要的抬头。',
    name: '姓名',
    nameHint: '会出现在论文致谢与导出文件名里',
    email: '邮箱',
    emailHint: '审批门待办会发到这里',
    org: '单位 / 课题组',
    orgHint: '导出 Word 时的封面抬头',
    tz: '时区',
    tzHint: '决定「今天」怎么算，影响日报与定时任务',
    tzOptions: [
      { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
      { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
      { value: 'Europe/London', label: '英国时间 (UTC+0)' },
      { value: 'America/Los_Angeles', label: '太平洋时间 (UTC-8)' },
    ],
    avatarNote: '头像按姓名首字生成，改名字会一起变',
  },

  /* ── 外观 ── */
  appearance: {
    title: '外观',
    note: '切换立即生效，并记住在这台设备上。',
    themeTitle: '界面风格',
    densityTitle: '界面密度',
    densityNote: '只影响行距与卡片内边距，不动字号。',
    densityOptions: [
      { value: 'compact', label: '紧凑' },
      { value: 'cozy', label: '标准' },
      { value: 'wide', label: '宽松' },
    ],
    motionTitle: '动效',
    motionLabel: '界面动画',
    motionNote: '关掉后弹出、滚动、状态切换都直接到位。',
    motionReduced: '已关闭动效',
  },

  /* ── 写作规范 ── */
  writing: {
    title: '写作规范',
    note: '这些会写进主控下发给各角色的系统提示，不只是界面显示。',
    citation: '引用样式',
    citationNote: '参考文献的排序与标点按它生成',
    citationOptions: [
      { value: 'gbt7714', label: 'GB/T 7714（中文期刊）' },
      { value: 'apa7', label: 'APA 7th（社科）' },
      { value: 'ieee', label: 'IEEE（工程）' },
      { value: 'nature', label: 'Nature（自然科学）' },
    ],
    dateFormat: '日期格式',
    dateFormatOptions: [
      { value: 'iso', label: '2026-11-20' },
      { value: 'cn', label: '2026 年 11 月 20 日' },
      { value: 'us', label: 'Nov 20, 2026' },
    ],
    refLang: '参考文献语言',
    refLangOptions: [
      { value: 'mixed', label: '中英混排' },
      { value: 'en', label: '仅英文' },
      { value: 'zh', label: '仅中文' },
    ],
    autoNumber: '图表与章节自动编号',
    autoNumberNote: '插入图、表、公式时自动补「图 3-2」这类序号',
  },

  /* ── 模型与密钥 ── */
  models: {
    title: '模型与密钥',
    note: '自带 Key（BYOK）。Key 只存在本机，不上传。',
    addKey: '填写 Key',
    replaceKey: '更换',
    clearKey: '清除',
    noKey: '未配置',
    keyPlaceholder: '粘贴 API Key',
    keySaved: 'Key 已保存',
    defaultModel: '默认模型',
    routeOn: '参与路由',
    state: { ok: '连通', idle: '未启用', error: '鉴权失败' },
    routeNote: '主控按任务类型在已启用的模型间分配，写作用长上下文、核查用便宜模型。',
  },

  /* ── 本地 CLI ── */
  cli: {
    title: '本地 CLI',
    note: '把活派给本机已装的 Agent CLI，文件不出这台机器。',
    rescan: '重新检测',
    scanning: '检测中…',
    installed: '已安装',
    missing: '未检测到',
    binLabel: '命令',
    versionLabel: '版本',
    pathLabel: '路径',
    rescanNote: '检测结果由后端扫描 PATH 得到，重装 CLI 后点这里刷新。',
    scanned: (ready: number, total: number) => `检测完成：${ready} / ${total} 个可用`,
  },

  /* ── 连接器 ── */
  connectors: {
    title: '连接器',
    note: '接上外部数据源，主控写作时能直接取文献、代码和组会记录。',
    state: { ok: '已连接', expired: '授权过期', off: '未启用' },
    reauth: '重新授权',
    add: '添加连接器',
    addNote: '支持 MCP：填一个服务地址即可接入。',
  },

  /* ── 远程执行（SSH） ── */
  ssh: {
    title: '远程执行（SSH）',
    note: '把跑实验、拉日志、取图这类活派到远端机器上，代码和数据都留在那台机器。',
    add: '添加主机',
    formTitle: '新增主机',
    save: '保存',
    cancel: '取消',
    test: '测试连接',
    testing: '连接中…',
    remove: '移除',
    state: { ok: '已连通', untested: '未测试', error: '连不上' },
    latency: (ms: number) => `${ms} ms`,
    fields: {
      name: '名称',
      host: '主机',
      user: '用户',
      port: '端口',
      key: '私钥路径',
      dir: '远端目录',
    },
    keyHint: '用本机已有的私钥，不会上传；路径里的 ~ 会自动展开。',
    empty: '还没有主机。加一台远端 GPU 机器，主控就能把实验派过去。',
    added: (name: string) => `${name} 已添加`,
    tested: (name: string, ms: number) => `${name} 已连通 · ${ms} ms`,
    failed: (name: string) => `${name} 连不上，检查端口与私钥权限`,
    needHost: '主机和用户都要填',
  },

  /* ── 知识与记忆 ── */
  memory: {
    title: '知识与记忆',
    note: '三块独立开关，关掉的那块不会被检索，也不会被写入。',
    used: (used: number, cap: number) => `${used} / ${cap} 条`,
    full: '接近上限，建议清理',
    clear: '清空',
    cleared: (label: string) => `${label} 已清空`,
    clearHint: '清空只影响这块，不影响另外两块。',
  },

  /* ── 协作 ── */
  collab: {
    title: '协作',
    note: '决定主控怎么派活、什么时候打断你。',
    parallelOptions: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '5', label: '5' },
    ],
  },

  /* ── 通知 ── */
  notify: {
    title: '通知',
    note: '只在本机弹提醒，不发短信、不发邮件之外的东西。',
    test: '发一条测试通知',
    tested: '已发测试通知',
  },

  /* ── 数据与隐私 ── */
  data: {
    title: '数据与隐私',
    note: '导出、清理和上报口径都在这。',
    exportTitle: '导出工作区',
    exportNote: '会话、策略矩阵、设置一起存成 JSON 文件。',
    exportBtn: '导出',
    exporting: '打包中…',
    exported: '已开始下载',
    resetTitle: '重新载入工作区',
    resetNote: '从后端重新拉一遍会话、策略与设置；不动任何服务端数据。',
    resetBtn: '重新载入',
    resetConfirm: '再点一次确认重载',
    resetDone: '已重新载入',
    aboutTitle: '关于',
    version: '版本 0.4.2',
    build: '构建 2026-11-20',
    docs: '使用文档',
  },
} as const;

/**
 * 后端 provider id → 展示名。后端只存 id（`zhipu` / `mimo` …），
 * 中文名与色调属于文案，放在这里；映射层查不到就回落成 id 本身。
 */
export const PROVIDER_LABEL: Record<string, { name: string; vendor: string; tone: string }> = {
  zhipu: { name: '智谱 GLM', vendor: '智谱 AI', tone: 'blue' },
  anthropic: { name: 'Claude', vendor: 'Anthropic', tone: 'amber' },
  openai: { name: 'OpenAI', vendor: 'OpenAI', tone: 'green' },
  deepseek: { name: 'DeepSeek', vendor: '深度求索', tone: 'violet' },
  mimo: { name: 'MiMo', vendor: '小米', tone: 'teal' },
  moonshot: { name: 'Kimi', vendor: '月之暗面', tone: 'pink' },
  qwen: { name: '通义千问', vendor: '阿里云', tone: 'slate' },
};

/** 本地 CLI id → 展示名（后端探测只回 id 与版本，名字是文案）。 */
export const CLI_LABEL: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  cursor: 'Cursor CLI',
  aider: 'Aider',
  autoresearchclaw: 'Auto Research',
};

/**
 * i18n/dict.ts — 最小 i18n 词典（中文 / 英文）。
 *
 * 范围只有「全局导航 + 设置页导航与分区标题 + 账号弹窗 + 语言分区」，
 * 其余文案仍留在 content/** 里，后续分批迁进来，不做全站翻译。
 *
 * 键用点号扁平写法：`settings.title`（面板标题）与 `settings.title.profile`
 * （分区标题）可以共存，取值就是一次字典查询；值可以是字符串，也可以是
 * 函数（需要参数拼句时用，例如 `t('x.count', 3)`）。
 */

export type Lang = 'zh' | 'en';

/** 词典值：字符串，或收参数拼句的函数。 */
export type DictValue = string | ((...args: any[]) => string);

export type Dict = Record<string, DictValue>;

export const zh: Dict = {
  /* ── 全局导航（Rail） ── */
  'nav.chat': '对话',
  'nav.team': '管理团队',
  'nav.kb': '知识库',
  'nav.cron': '定时任务',
  'nav.news': '新闻',
  'nav.project': '项目',
  'nav.settings': '设置',
  'nav.workspaceTitle': '项目',

  /* ── 设置面板外壳 ── */
  'settings.title': '设置',
  'settings.close': '关闭',
  'settings.done': '完成',
  'settings.saving': '保存中…',

  /* ── 设置左栏分组 ── */
  'settings.group.account': '账户',
  'settings.group.writing': '写作',
  'settings.group.integration': '集成',
  'settings.group.preference': '偏好',

  /* ── 设置左栏分区名 ── */
  'settings.nav.profile': '个人资料',
  'settings.nav.appearance': '外观',
  'settings.nav.language': '语言',
  'settings.nav.writing': '写作规范',
  'settings.nav.models': '模型与密钥',
  'settings.nav.cli': '本地 CLI',
  'settings.nav.connectors': '连接器',
  'settings.nav.mcp': 'MCP 集成',
  'settings.nav.skills': '技能',
  'settings.nav.ssh': '远程执行',
  'settings.nav.memory': '知识与记忆',
  'settings.nav.collab': '协作',
  'settings.nav.notify': '通知',
  'settings.nav.data': '数据与隐私',

  /* ── 分区的右栏标题（只有标题，正文仍在 content 里） ── */
  'settings.title.profile': '个人资料',
  'settings.title.appearance': '外观',
  'settings.title.language': '语言',
  'settings.title.writing': '写作规范',
  'settings.title.models': '模型与密钥',
  'settings.title.cli': '本地 CLI',
  'settings.title.connectors': '连接器',
  'settings.title.mcp': 'MCP 集成',
  'settings.title.skills': '技能',
  'settings.title.ssh': '远程执行',
  'settings.title.memory': '知识与记忆',
  'settings.title.collab': '协作',
  'settings.title.notify': '通知',
  'settings.title.data': '数据与隐私',

  /* ── 账号 ── */
  'account.title': '登录账号',
  'account.notSignedIn': '未登录（演示模式）',
  'account.signedInAs': '当前登录',
  'account.email': '邮箱',
  'account.password': '密码',
  'account.name': '你的称呼',
  'account.login': '登录',
  'account.register': '注册',
  'account.guest': '游客一键体验',
  'account.logout': '退出登录',
  'account.switchToRegister': '还没有账号？立即注册',
  'account.switchToLogin': '已有账号？去登录',
  'account.welcome': '开始使用',
  'account.hint': '先以演示模式浏览',
  'account.close': '关闭',
  /* 弹窗内实际用到的细分键 */
  'account.loginKicker': 'SIGN IN',
  'account.registerKicker': 'CREATE ACCOUNT',
  'account.loginTitle': '登录 ShadowFlow',
  'account.registerTitle': '创建你的 ShadowFlow 账号',
  'account.loginBody': '登录以继续你的工作空间；或以演示模式直接浏览。',
  'account.registerBody': '注册后可同步工作空间、审批记录与知识库；不注册也可以演示模式浏览。',
  'account.tabLogin': '登录',
  'account.tabRegister': '注册',
  'account.nameLabel': '你的称呼',
  'account.namePlaceholder': '怎么称呼你（可选）',
  'account.emailLabel': '邮箱',
  'account.emailPlaceholder': 'name@lab.edu.cn',
  'account.passwordLabel': '密码',
  'account.passwordLoginPlaceholder': '你的密码',
  'account.passwordRegisterPlaceholder': '至少 8 位',
  'account.submitLogin': '登录',
  'account.submitRegister': '创建账号',
  'account.busy': '请稍候…',
  'account.errorFallback': '操作失败，请稍后再试',
  'account.guestErrorFallback': '游客登录失败，请稍后再试',
  'account.skip': '先以演示模式浏览',

  /* ── 语言分区 ── */
  'language.title': '语言',
  'language.note': '切换后界面立即更新，并记住在这台设备上。',
  'language.zh': '中文',
  'language.en': 'English',
  'language.current': '当前语言',
  'language.coverageNote':
    '目前覆盖：全局导航、设置页导航与分区标题、账号弹窗；其余文案将分批补齐。',
};

export const en: Dict = {
  /* ── Global navigation (Rail) ── */
  'nav.chat': 'Chat',
  'nav.team': 'Team',
  'nav.kb': 'Knowledge',
  'nav.cron': 'Scheduled',
  'nav.news': 'News',
  'nav.project': 'Project',
  'nav.settings': 'Settings',
  'nav.workspaceTitle': 'Workspace',

  /* ── Settings shell ── */
  'settings.title': 'Settings',
  'settings.close': 'Close',
  'settings.done': 'Done',
  'settings.saving': 'Saving…',

  /* ── Settings groups ── */
  'settings.group.account': 'Account',
  'settings.group.writing': 'Writing',
  'settings.group.integration': 'Integrations',
  'settings.group.preference': 'Preferences',

  /* ── Settings sections ── */
  'settings.nav.profile': 'Profile',
  'settings.nav.appearance': 'Appearance',
  'settings.nav.language': 'Language',
  'settings.nav.writing': 'Writing rules',
  'settings.nav.models': 'Models & keys',
  'settings.nav.cli': 'Local CLI',
  'settings.nav.connectors': 'Connectors',
  'settings.nav.mcp': 'MCP integration',
  'settings.nav.skills': 'Skills',
  'settings.nav.ssh': 'Remote execution',
  'settings.nav.memory': 'Knowledge & memory',
  'settings.nav.collab': 'Collaboration',
  'settings.nav.notify': 'Notifications',
  'settings.nav.data': 'Data & privacy',

  /* ── Section headings ── */
  'settings.title.profile': 'Profile',
  'settings.title.appearance': 'Appearance',
  'settings.title.language': 'Language',
  'settings.title.writing': 'Writing rules',
  'settings.title.models': 'Models & keys',
  'settings.title.cli': 'Local CLI',
  'settings.title.connectors': 'Connectors',
  'settings.title.mcp': 'MCP integration',
  'settings.title.skills': 'Skills',
  'settings.title.ssh': 'Remote execution',
  'settings.title.memory': 'Knowledge & memory',
  'settings.title.collab': 'Collaboration',
  'settings.title.notify': 'Notifications',
  'settings.title.data': 'Data & privacy',

  /* ── Account ── */
  'account.title': 'Account',
  'account.notSignedIn': 'Not signed in (demo mode)',
  'account.signedInAs': 'Signed in as',
  'account.email': 'Email',
  'account.password': 'Password',
  'account.name': 'Your name',
  'account.login': 'Sign in',
  'account.register': 'Sign up',
  'account.guest': 'Continue as guest',
  'account.logout': 'Sign out',
  'account.switchToRegister': 'No account yet? Sign up',
  'account.switchToLogin': 'Already have an account? Sign in',
  'account.welcome': 'Get started',
  'account.hint': 'Browse in demo mode first',
  'account.close': 'Close',
  'account.loginKicker': 'SIGN IN',
  'account.registerKicker': 'CREATE ACCOUNT',
  'account.loginTitle': 'Sign in to ShadowFlow',
  'account.registerTitle': 'Create your ShadowFlow account',
  'account.loginBody': 'Sign in to continue your workspace, or browse in demo mode.',
  'account.registerBody':
    'Register to sync your workspace, approvals and knowledge base; you can also keep browsing in demo mode.',
  'account.tabLogin': 'Sign in',
  'account.tabRegister': 'Sign up',
  'account.nameLabel': 'Your name',
  'account.namePlaceholder': 'How should we call you (optional)',
  'account.emailLabel': 'Email',
  'account.emailPlaceholder': 'name@lab.edu.cn',
  'account.passwordLabel': 'Password',
  'account.passwordLoginPlaceholder': 'Your password',
  'account.passwordRegisterPlaceholder': 'At least 8 characters',
  'account.submitLogin': 'Sign in',
  'account.submitRegister': 'Create account',
  'account.busy': 'One moment…',
  'account.errorFallback': 'Something went wrong. Please try again later.',
  'account.guestErrorFallback': 'Guest sign-in failed. Please try again later.',
  'account.skip': 'Browse in demo mode first',

  /* ── Language ── */
  'language.title': 'Language',
  'language.note': 'Switching updates the interface immediately and is remembered on this device.',
  'language.zh': '中文',
  'language.en': 'English',
  'language.current': 'Current',
  'language.coverageNote':
    'Currently covers: global navigation, settings navigation and section titles, and the account dialog. Remaining copy will follow in batches.',
};

export const DICTS: Record<Lang, Dict> = { zh, en };

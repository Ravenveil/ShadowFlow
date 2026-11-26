/**
 * content/clawhub.ts — 「本地 CLI」分区里 ClawHub 安装/卸载能力的全部文案。
 *
 * 组件只负责渲染，中文一律从这里取（`npm run check` 会拦 .tsx 里的中文字符串）。
 */

export const CLAWHUB_COPY = {
  /* ── 详情抽屉 ── */
  detailTitle: '详情',
  openDetail: '查看详情',
  statusInstalled: '已安装',
  statusMissing: '未安装',
  versionLabel: '版本',
  pathLabel: '路径',
  commandLabel: '命令',
  unknownValue: '（未探测到）',
  installable: '可自动安装',
  uninstallable: '可自动卸载',
  copyOnly: '仅复制命令',
  install: '安装',
  uninstall: '卸载',
  cancel: '取消',
  close: '关闭',
  retry: '重试',
  copyCommand: '复制命令',
  copied: '已复制',
  copyFailed: '复制失败，请手动选择命令复制',
  viewDocs: '查看文档',
  noLink: '暂无官网 / 文档链接',
  copyOnlyHint: '该 CLI 的安装命令无法自动执行，请复制后在终端运行。',
  copyOnlyUninstallHint: '该 CLI 无法自动卸载，请复制引导命令手动执行。',

  /* ── 安装 / 卸载日志面板 ── */
  logTitle: '安装日志',
  uninstallLogTitle: '卸载日志',
  waiting: '等待输出…',
  running: '进行中…',
  installing: '安装中',
  uninstalling: '卸载中',
  installDone: '安装完成',
  uninstallDone: '卸载完成',
  installFailed: '安装失败',
  uninstallFailed: '卸载失败',
  canceled: '已取消',

  /* ── 操作提示（flash） ── */
  rateLimited: '重新扫描过于频繁，请稍后再试',
  startFailed: '启动操作失败，请稍后重试',
  alreadyBusy: '该 CLI 已有进行中的安装或卸载，请稍候',
  copyOnlyInstall: '该 CLI 不支持自动安装，已复制安装命令',
  copyOnlyUninstall: '该 CLI 不支持自动卸载，已复制卸载命令',
} as const;

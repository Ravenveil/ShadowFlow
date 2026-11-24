/**
 * settings.ts — 设置页分区文案（远程执行 / 向量模型降级提示）。
 */

export const REMOTE_EXEC = {
  loading: "正在读取远程主机配置…",
  loadFailed: "无法读取远程执行配置，请确认后端 /api/remote-exec 可用。",
  configured: "已配置远程主机",
  unconfigured: "尚未配置远程主机",
  host: "主机",
  hostPlaceholder: "10.0.0.8",
  port: "端口",
  user: "用户名",
  userPlaceholder: "ubuntu",
  keyPath: "私钥路径",
  keyPathPlaceholder: "~/.ssh/id_ed25519",
  remoteDir: "远端目录",
  remoteDirPlaceholder: "~/runs",
  save: "保存配置",
  test: "测试连接",
  saved: "已保存远程主机配置",
  saveFailed: "保存失败",
  testOk: "连接成功",
  testFailed: "连接失败，请检查主机与私钥",
  testError: "测试失败",
  exit: "exit",
  duration: "ms",
};

export const EMBEDDING = {
  offline: "当前后端未提供向量配置接口（/api/settings/embedding），本页设置暂不会保存。",
};

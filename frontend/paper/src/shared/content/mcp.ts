/**
 * content/mcp.ts — 设置页「MCP 集成」分区的全部文案。
 *
 * 组件只负责渲染，中文一个都不许出现在 .tsx 里（`npm run check` 会拦）。
 * 后端契约与字段名见 data/http/mcp.ts。
 */

export const MCP_COPY = {
  title: 'MCP 集成',
  note: '接入本机的 MCP 服务器，主控就能调用它提供的工具；保存前可以先试连一次。',

  /* 列表与空态 */
  loading: '读取中…',
  loadFailed: '读取 MCP 服务器失败，请确认后端已启动',
  empty: '还没有 MCP 服务器',
  emptyHint: '点「添加服务器」，填上启动命令即可；保存前可以先「试连」看它暴露了哪些工具。',
  add: '添加服务器',
  edited: (name: string) => `${name} 已保存`,
  removed: (name: string) => `${name} 已删除`,

  /* 卡片 */
  noDescription: '没有描述',
  toolCount: (n: number) => `${n} 个工具`,
  test: '测试',
  testing: '测试中…',
  edit: '编辑',
  remove: '删除',

  /* 添加 / 编辑表单 */
  formAdd: '添加 MCP 服务器',
  formEdit: '编辑 MCP 服务器',
  fields: {
    name: '名称',
    command: '命令',
    args: '参数',
    env: '环境变量',
    description: '描述',
  },
  placeholders: {
    name: '例如 filesystem',
    command: '例如 npx',
    args: '每行一个，或空格分隔',
    env: 'KEY=VALUE，每行一条',
    description: '它是干什么的，给未来的自己看',
  },
  hints: {
    name: '在列表里唯一；保存后不可修改，要改就删掉重建。',
    command: '可执行文件名或绝对路径，例如 npx / uvx / node。',
    args: '一行一个参数；只有一行时也可以直接用空格分隔。',
    env: '每行一条 KEY=VALUE，例如 GITHUB_TOKEN=ghp_…；没有就留空。',
  },

  /* 保存 / 试连 / 删除 */
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  probe: '试连',
  probing: '连接中…',
  validation: '名称和命令都要填',
  duplicate: '同名服务器已存在，换一个名称',
  invalid: '字段不合法，检查命令与参数格式',
  removeTitle: (name: string) => `删除 ${name}？`,
  removeBody: '删除后主控不能再调用它提供的工具；要恢复只能重新添加。',
  removeConfirm: '确认删除',
  removing: '删除中…',

  /* 测试结果 */
  testOk: (n: number) => `连接成功 · ${n} 个工具`,
  testFailed: '连接失败',
  duration: (ms: number) => `${ms} ms`,
  toolsTitle: '工具列表',
  toolsEmpty: '这个服务器没有暴露任何工具',
  errorCode: (code: string) => `错误码 ${code}`,

  /* 从连接器分区跳过来 */
  manageFromConnectors: '管理 MCP 服务器',
} as const;

# ShadowFlow 前端项目

ShadowFlow 的 React + TypeScript 前端应用，提供可视化的 AI Agent 工作流编辑器。

## 项目结构

```
src/
├── components/          # React 组件
│   ├── Canvas/          # 工作流画布组件
│   │   └── WorkflowCanvas.tsx
│   ├── Panel/           # 面板组件
│   │   ├── NodePanel.tsx    # 左侧节点面板
│   │   └── ConfigPanel.tsx  # 右侧配置面板
│   ├── Node/            # 节点组件
│   │   └── BaseNode.tsx
│   └── Toolbar/         # 工具栏组件
│       └── Toolbar.tsx
│
├── stores/              # Zustand 状态管理
│   ├── workflowStore.ts    # 工作流状态
│   └── nodeRegistryStore.ts # 节点注册表
│
├── hooks/               # 自定义 Hooks
│   ├── useWorkflow.ts     # 工作流操作 Hook
│   └── useAutoLayout.ts   # 自动布局 Hook
│
├── i18n/                # 国际化
│   ├── locales.ts         # 翻译资源
│   └── index.ts           # i18n Hook
│
├── types/               # TypeScript 类型定义
│   └── index.ts
│
├── utils/               # 工具函数
│   ├── nodeUtils.ts       # 节点工具
│   ├── validation.ts      # 验证工具
│   └── index.ts
│
├── App.tsx              # 主应用组件
├── main.tsx             # 应用入口
└── index.css            # 全局样式
```

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **ReactFlow** - 可视化流程图
- **Zustand** - 轻量级状态管理
- **Tailwind CSS** - 样式框架
- **Vite** - 构建工具

## 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 组件说明

### WorkflowCanvas (工作流画布)

主画布组件，基于 ReactFlow 实现：
- 节点拖拽和连接
- 缩放和平移
- 撤销/重做支持
- 快捷键支持

### NodePanel (节点面板)

左侧节点选择面板：
- 7 大类 25+ 内置节点
- 节点搜索过滤
- 拖拽添加节点
- 分类展开/收起

### ConfigPanel (配置面板)

右侧节点属性编辑面板：
- 节点基本信息
- 配置属性编辑
- 输入/输出端口查看
- 连接信息展示

### Toolbar (工具栏)

顶部操作工具栏：
- 撤销/重做
- 缩放控制
- 自动布局
- 导入/导出
- 运行控制
- 语言切换

## 节点类型

| 分类 | 节点 | 说明 |
|------|------|------|
| 输入 | Receive, Understand, Clarify | 接收解析用户输入 |
| 规划 | Analyze, Design, Decompose, Spec | 分析设计任务方案 |
| 执行 | Code, Test, Generate, Transform | 编写代码、测试、生成内容 |
| 审核 | Review, Validate, Security | 审核质量、验证规范、安全审计 |
| 决策 | Branch, Merge, Loop | 条件分支、合并、循环 |
| 协调 | Parallel, Sequence, Assign, Aggregate, Barrier, Negotiate | 并行执行、任务分配、协商 |
| 输出 | Report, Store, Notify | 生成报告、存储、通知 |

## 状态管理

### workflowStore

管理工作流状态：
- `nodes` - 节点列表
- `edges` - 边列表
- `selectedNodeIds` - 选中的节点 ID
- `history` - 撤销/重做历史
- `ui` - UI 状态（侧边栏、配置面板等）

### nodeRegistryStore

管理节点注册表：
- `nodes` - 所有可用节点
- `registerNode` - 注册自定义节点
- `getNode` - 获取节点定义
- `searchNodes` - 搜索节点

## 国际化

支持中英文切换：
- `t('key')` - 获取翻译
- `setLanguage('en' | 'zh')` - 切换语言

## 快捷键

| 按键 | 功能 |
|------|------|
| Ctrl/Cmd + Z | 撤销 |
| Ctrl/Cmd + Y | 重做 |
| Delete | 删除选中节点 |

# 导航架构统一 + 循环引擎并入 DAG（前后端）

已确认决策：知识库/记忆**左栏列表区内嵌**（与员工/团队同构的分区切换）；详情在**中栏**打开（rail 常驻）；循环引擎取消独立露出，**并入右栏「过程」tab** 改名**「迭代环」**；后端全量联动（loop 事件上 SSE + graph 画环）。

## 一、前端

### 1. 左栏分区扩展（`NeoRail.tsx`）
- `section` 状态扩展：`'home' | 'agents' | 'teams' | 'knowledge' | 'memory'`
- 知识库行点击 → 列表区切**知识分包列表**（GET /knowledge/packs：名称 + 类型徽标，loading/error 空态同款）
- 记忆行点击 → 列表区切**记忆条目列表**（GET /api/memory-entries：标题 + 相对时间）
- 点分包/条目 → 中栏打开详情（复用既有页面内容的内嵌变体，同会话页模式）；「新任务」回 home 分区

### 2. 页面内嵌变体（`KnowledgePage` / `MemoryPage`）
- 抽内容组件 + `embedded` prop（去全页 hero 头、高度 100% 填充中栏），`/knowledge` `/memory` 路由保留全页模式
- NeoApp 的中栏渲染条件扩展：conversation | knowledgeDetail | memoryDetail | NeoChat

### 3. 右栏收编迭代环（`NeoHost.tsx` + `projections/ProcessView.tsx`）
- FixedTab 去掉 `'loop'`，其状态 pill/文案逻辑并入「过程」tab
- ProcessView：graph 节点列表渲染 **loop 迭代节点**（迭代序号徽标）+ **环回边** chips；顶部「迭代环」摘要条（PDCA 状态/迭代次数/收敛/halt，数据迁自 getRunLoops）
- loop 状态从 5s 轮询切 **SSE 实时**（轮询兜底）

### 4. 入口清理与改名
- rail 底部「循环引擎」入口删除；`/loop-engine(:runId)` → redirect `/?run=<id>`
- i18n「循环引擎」→「迭代环」（`shell.loopEngine` 等 key、页面文案、注释）

## 二、后端

### 5. loop 事件上 SSE 流（Python RuntimeService + Node runBus）
- loop 生命周期（iteration 开始/完成/converged/halted）发命名事件 → run stream 转发
- `docs/EVENT_NAMING.md` 注册 + `event-naming.test.ts` 同步；`useRunSession` 消费喂过程 tab

### 6. graph 投影画环（Python `export_run_graph`）
- `RunGraph` 新增 loop 迭代节点类型 + loop-back 边；`src/api/runs.ts` 类型同步，ProcessView 渲染

## 三、验证
- tsc / lint / vitest 全量；NeoRail 组件测试更新（知识库/记忆分区新行为、循环引擎入口移除）
- EVENT_NAMING 测试；浏览器盘点：左栏五分区切换、中栏详情、run 态过程 tab 迭代环

涉及文件：`src/neo/{NeoApp,NeoRail,NeoHost}.tsx`、`projections/ProcessView.tsx`、`src/pages/{KnowledgePage,MemoryPage,LoopEnginePage}.tsx`、`src/AppRoutes.tsx`、`src/api/{runs,knowledge,memory?}.ts`、`src/core/hooks/useRunSession.ts`、`server/src/lib/`、`shadowflow/`（RuntimeService + export_run_graph）、`docs/EVENT_NAMING.md`、i18n。
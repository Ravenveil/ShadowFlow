# Story 7.8: Chat → Builder 跳转（从对话发起 Agent 创建）

Status: ready-for-dev

## Story

As a **在 Chat / AgentDM 里工作的用户**,
I want **在群聊或单聊界面直接发起"创建此类 Agent"，携带当前对话上下文跳转到 Builder Goal Mode**,
so that **用户从使用 Agent 到创建 Agent 之间没有断层——对话即是创意的入口**。

## Acceptance Criteria

### AC1 — Chat 与 AgentDM 界面各有一个"创建 Agent"入口

**Given** 用户正在 `/inbox` 的群聊（Chat）或单聊（AgentDM）视图  
**When** 用户需要基于当前对话场景创建一个新 Agent  
**Then** 界面至少提供以下入口之一：
- 群聊顶部操作区或三点菜单：**"基于此对话创建 Agent"**
- AgentDM 顶部：**"克隆此 Agent / 创建类似 Agent"**

**And** 入口在 Story 7.7（approval panel）完成后不得引发布局冲突

**And** 若当前 Story 8.1（Builder API skeleton）尚未上线，入口应显示为置灰状态并带 tooltip 说明"Builder 即将可用"，而不是直接 404

### AC2 — 跳转时携带上下文到 Builder Goal Mode，且 URL 参数结构稳定

**Given** 用户点击了"创建 Agent"入口  
**When** 路由跳转发生  
**Then** 目标路由为 `/builder?from=chat&context_type=<group|dm>&context_id=<chatId>&goal=<encoded_goal>`

**And** `goal` 参数的内容来源为（按优先级）：
1. AgentDM 场景：当前被聊天的 Agent 的 `title` / `name`
2. 群聊场景：群聊名称或最近消息主题（前 120 字符截断并 URI encode）
3. 均无法提取时：空字符串，Builder 展示空 goal 输入框

**And** URL 中不携带完整消息体（防止 URL 过长与隐私泄露），只携带可公开的 metadata

**And** 若跳转前用户有未发送草稿，不弹确认对话框，直接新 tab 打开 Builder（或同页跳转，由 UI 标准决定，须与产品保持一致）

### AC3 — Builder Goal Mode 读取跳转参数并预填 goal 输入框

**Given** `/builder` 页面接收到 `?from=chat&goal=...` 参数  
**When** Goal Mode 初始化  
**Then** `goal` 输入框自动预填 URL 参数中的 `goal` 值，用户可直接编辑

**And** 若 `goal` 为空，显示常规空态引导文案，不渲染乱码或占位 placeholder

**And** 若 `from=dm` 且 `context_id` 可以解析为现有 Agent，Builder 在生成界面顶部显示一条 banner：  
`"正在基于「{AgentName}」创建新 Agent，可参考原有配置"`

**And** 若 `from=chat` 且解析到 `context_id`，Builder 记录来源标记（如 `blueprint.metadata.created_from = "chat:<chatId>"`），供后续 Agent Catalog（Story 8.7）展示来源

### AC4 — AgentDM 跳转支持"参考当前 Agent 配置"

**Given** 用户在 AgentDM 与某个已配置的 Agent 对话，并点击"创建类似 Agent"  
**When** 路由携带 `context_type=dm&context_id=<agentId>` 跳转  
**Then** Builder Goal Mode 除预填 goal 外，还向 `POST /builder/blueprints/generate` 传入 `reference_agent_id`

**And** `reference_agent_id` 作为可选参数传入 Builder service，service 可以：
- 读取原 Agent 的 `RoleProfile` 字段，预填 mode / roles 的部分默认值
- 也可忽略（若 reference agent 不可访问或不合法）

**And** 此处 Builder service 读取原 Agent 的逻辑允许是**轻量占位**（如读 `blueprint metadata`），不要求对接完整 Agent 持久化层

### AC5 — 测试覆盖跳转链路与参数传递的关键路径

**Given** 本 Story 跨越 Epic 7（Inbox/Chat）与 Epic 8（Builder）两个模块  
**When** Story 7.8 完成  
**Then** 至少覆盖以下测试：
- Chat 入口按钮渲染测试（Builder 未上线时显示置灰）
- 跳转 URL 参数构造单元测试（goal 截断、encode、AgentDM 参数映射）
- Builder Goal Mode 接受 `?goal=...` 参数后 input 预填行为测试
- `reference_agent_id` 传入 generate 接口的路径测试（可以 mock service 层）

## Tasks / Subtasks

- [ ] **T1(AC1) Chat / AgentDM 界面添加跳转入口**
  - [ ] 群聊顶部操作区或 overflow menu 新增"基于此对话创建 Agent"按钮
  - [ ] AgentDM 顶部新增"创建类似 Agent"按钮
  - [ ] 若 Builder 未上线（`import.meta.env.VITE_BUILDER_ENABLED !== "true"` 或 story 8.1 API 404），按钮置灰 + tooltip
  - [ ] 与 Story 7.7 的 approval panel 布局做兼容检查

- [ ] **T2(AC2) 构造跳转 URL 并路由跳转**
  - [ ] 群聊场景：从 chat 名称或最近消息提取 goal 文本，最多 120 字符截断后 URI encode
  - [ ] AgentDM 场景：从 agent name/title 提取 goal
  - [ ] 生成 `?from=chat&context_type=group|dm&context_id=...&goal=...` URL
  - [ ] 跳转行为（新 tab 或同页）依照当前产品标准统一，不自行创造两套方式

- [ ] **T3(AC3) Builder Goal Mode 读取 URL 参数并预填**
  - [ ] 在 `BuilderPage` / Goal Mode 入口读取 `useSearchParams()`
  - [ ] 解析 `goal` 并写入 goal input 初始值
  - [ ] 解析 `from` / `context_type` / `context_id` 并在必要时显示来源 banner
  - [ ] 若 `from=dm`，向 blueprint metadata 写入 `created_from` 字段

- [ ] **T4(AC4) AgentDM 场景传入 `reference_agent_id`**
  - [ ] Builder Goal Mode 检测 `context_type=dm` 后，向 generate API 传入 `reference_agent_id`
  - [ ] Builder service 中 `generate_blueprint()` 接受可选 `reference_agent_id`，轻量读取原 Agent 元数据
  - [ ] 若 reference agent 不可访问，generate 仍正常执行，只是不预填 reference 配置

- [ ] **T5(AC5) 测试**
  - [ ] Chat 入口按钮条件渲染测试
  - [ ] URL 参数构造单元测试（goal 截断、encode、空值处理）
  - [ ] Builder Goal Mode `?goal=...` 预填测试
  - [ ] `reference_agent_id` 传入 generate 接口路径测试

## Dev Notes

### 依赖前序 Story

- Story 7.1（Inbox 三列布局）：入口按钮挂载点
- Story 8.1（Builder API skeleton）：`/builder` 路由与 `POST /builder/blueprints/generate` 接口
- Story 8.2（Goal Mode UI）：`BuilderPage` 页面与 goal 输入框

若 8.1/8.2 尚未完成，T3/T4 可先做 stub 路由 + 注释 TODO 占位。

### 代码基线

- `src/pages/` — 现有页面壳，`BuilderPage` 由 Story 8.2 创建
- `src/core/components/inbox/` — Chat/AgentDM 入口按钮挂载在此目录下的组件
- `src/AppRoutes.tsx` — 路由注册
- `shadowflow/runtime/builder_service.py` — `generate_blueprint` 需接受 `reference_agent_id`

### 隐私与安全边界

- URL 只携带 metadata（名称、ID），**不携带消息正文**
- `reference_agent_id` 在 service 层验证权限，不允许越权读取他人 Agent 配置

### Scope Boundaries

**本 Story 做：**
- Chat/AgentDM 中的跳转入口与 URL 构造
- Builder Goal Mode 的参数读取与预填
- `reference_agent_id` 传入 generate 接口（轻量）

**本 Story 不做：**
- Builder 完整 Goal Mode UI（Story 8.2）
- 完整 Agent 持久化层读取 reference 配置
- Chat 历史摘要的语义提取（本 Story 用简单文本截断）

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Story 7.8 在 Epic 7（Inbox）与 Epic 8（Builder）之间建立连接，是 Conversation-first 入口的关键闭环
- Godot 类比：从"正在跑的 Scene"点击"基于此 Scene 创建新 Scene"即是本 Story 的产品语义
- 依赖 Story 8.1 的 Builder API 和 8.2 的 BuilderPage；若两者尚未就绪，T3/T4 可 stub

### File List

- `_bmad-output/implementation-artifacts/7-8-chat-builder-跳转-对话发起创建.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 7.8，状态置为 `ready-for-dev`

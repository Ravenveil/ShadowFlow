# Story 8.7: Agent Catalog（已发布 Agent 浏览 / Fork）

Status: backlog

<!-- 依赖 Story 8.6 Publish 完成后再开工 -->

## Story

As a **想快速获得一个可用 Agent 的用户**,
I want **浏览平台上已发布的 Agent App 目录，并能一键 Fork 成自己的 Blueprint 进入 Builder**,
so that **站在别人的肩膀上起步，而不是每次都从空白目标输入框开始**。

## Acceptance Criteria

### AC1 — 新增 Catalog 入口页，列出所有已发布 Agent Apps

**Given** 用户已通过 Story 8.6 发布了至少一个 Agent App  
**When** 用户访问 `/catalog` 或从导航栏点击"Agent 目录"  
**Then** 页面渲染一个 Catalog 列表，每个卡片至少展示：
- `name`（Agent App 名称）
- `goal`（一句话目标描述）
- `kit_type`（Research / Knowledge Assistant / Review & Approval / Persona / Custom）
- `author`（发布者标识，可以是匿名占位符）
- `published_at`（发布时间，相对时间格式）
- "Fork" 按钮

**And** 列表默认按 `published_at` 倒序排列

**And** 空态时展示引导文案："还没有已发布的 Agent，[去 Builder 创建第一个]"，链接跳转 `/builder`

### AC2 — 支持按 Kit 类型过滤与关键词搜索

**Given** Catalog 中已有多个 Agent App  
**When** 用户使用过滤/搜索  
**Then** 页面顶部提供：
- Kit 类型 tab 或 chip filter：全部 / Research / Knowledge Assistant / Review & Approval / Persona / Custom
- 关键词搜索框：匹配 `name` 与 `goal` 字段（前端过滤或后端搜索均可，本 Story 允许前端过滤）

**And** 过滤与搜索可以组合使用

**And** 过滤结果为空时展示"没有找到匹配的 Agent"，不渲染错误页

### AC3 — Fork 操作：从已发布 App 克隆一个新 Blueprint 进入 Builder

**Given** 用户点击某个 Catalog 卡片上的"Fork"按钮  
**When** Fork 操作执行  
**Then** 后端 `POST /catalog/apps/{app_id}/fork` 创建一个新 `AgentBlueprint`，字段从原 App 的 `publish_profile.blueprint_snapshot` 复制

**And** Fork 结果返回新的 `blueprint_id`，前端立即路由跳转到 `/builder?blueprint_id=<new_id>&mode=scene`（Scene Mode 直接打开，跳过 Goal Mode）

**And** 新 Blueprint 的 `metadata.forked_from` 记录原 `app_id`，用于追溯

**And** Fork 操作不修改原 App，原 App 仍保留在 Catalog

**And** Fork 失败（如原 App 已下线或权限不足）时，Toast 提示明确错误原因，不静默失败

### AC4 — 后端 Catalog API：list / get / fork

**Given** 需要持久化地存储已发布 App 的 Catalog 元数据  
**When** 实现 Catalog 后端  
**Then** 在 `shadowflow/api/catalog.py` 至少提供：
- `GET /catalog/apps` — 返回已发布 App 列表（分页，默认 page_size=20）
- `GET /catalog/apps/{app_id}` — 返回单个 App 详情
- `POST /catalog/apps/{app_id}/fork` — 克隆 Blueprint

**And** `GET /catalog/apps` 支持以下 query 参数：
- `kit_type`（过滤）
- `q`（关键词搜索，可选）
- `page` / `page_size`

**And** Story 8.6 的 `publish_blueprint()` 应负责将已发布 App 元数据写入 Catalog 存储（两者协调，确保 publish → catalog 的数据流）

**And** 本 Story 允许 Catalog 存储使用与现有 run/template 同等级别的轻量持久化（如 JSON 文件或内存 + 持久化文件），不强制引入新数据库

### AC5 — Catalog 卡片支持查看详情（展开/弹窗），展示完整 goal 与 kit 说明

**Given** Catalog 卡片在列表中只展示摘要信息  
**When** 用户点击卡片（非 Fork 按钮）  
**Then** 展开详情或弹出 Side Panel，展示：
- 完整 `goal` 描述
- `mode`（single / team）
- 角色数量与名称列表
- 关联 Kit 类型说明
- `forked_from`（如有）
- "Fork 此 Agent" 按钮（同 AC3）

**And** 详情中不暴露 `system_prompt` 等敏感内部配置

### AC6 — 测试覆盖 Catalog 核心路径

**Given** Agent Catalog 是 Builder 完成闭环的最后一环  
**When** Story 8.7 完成  
**Then** 至少覆盖以下测试：
- `GET /catalog/apps` 返回正确 envelope 与分页
- `POST /catalog/apps/{app_id}/fork` 成功创建新 Blueprint（`forked_from` 正确记录）
- Fork 后前端路由跳转到 `/builder?blueprint_id=...&mode=scene`
- Catalog 前端过滤（kit_type + keyword 组合）
- 空态与 Fork 失败的 Toast 提示

## Tasks / Subtasks

- [ ] **T1(AC4) 新建 Catalog API 与存储**
  - [ ] 新建 `shadowflow/api/catalog.py`，定义 `GET /catalog/apps`、`GET /catalog/apps/{id}`、`POST /catalog/apps/{id}/fork`
  - [ ] 定义 `CatalogApp` Pydantic 模型（`app_id`, `name`, `goal`, `kit_type`, `author`, `published_at`, `blueprint_snapshot`, `forked_from`）
  - [ ] 在 `shadowflow/runtime/builder_service.py` 中实现 `publish_blueprint()` 的 Catalog 写入逻辑
  - [ ] 实现 `fork_blueprint()` 方法，复制 blueprint_snapshot 并写入新 Blueprint
  - [ ] 在 `shadowflow/server.py` 接入 Catalog router

- [ ] **T2(AC1/AC2/AC5) 前端 Catalog 页面**
  - [ ] 新建 `src/pages/CatalogPage.tsx`
  - [ ] 新建 `src/api/catalog.ts`（`listApps / getApp / forkApp`）
  - [ ] 新建 `src/common/types/catalog.ts`（`CatalogApp` 前端类型）
  - [ ] 实现卡片列表、Kit 过滤 chip、关键词搜索框
  - [ ] 实现卡片详情展开/Side Panel
  - [ ] 空态文案与链接跳转 `/builder`

- [ ] **T3(AC3) Fork 操作与路由跳转**
  - [ ] 前端 "Fork" 按钮调用 `forkApp(app_id)`
  - [ ] 成功后路由跳转 `/builder?blueprint_id=<new_id>&mode=scene`
  - [ ] Builder Goal Mode / Scene Mode 读取 `blueprint_id` URL 参数，加载已有 Blueprint 而非从零生成
  - [ ] 失败时 Toast 提示具体原因

- [ ] **T4 导航注册**
  - [ ] 在 `src/AppRoutes.tsx` 注册 `/catalog` 路由
  - [ ] 在导航栏（若有）添加"Agent 目录"入口

- [ ] **T5(AC6) 测试**
  - [ ] `tests/test_catalog_api.py`（list / get / fork API）
  - [ ] 前端 Catalog 过滤逻辑单元测试
  - [ ] Fork 路由跳转 E2E 场景

## Dev Notes

### 依赖前序 Story

- **Story 8.6**（Publish Backfill）：必须先完成，Catalog 才有数据来源
- **Story 8.1**（Builder Contract）：`AgentBlueprint` 类型供 Fork 使用
- **Story 8.2/8.3**（Goal Mode / Scene Mode）：Fork 后的路由目标页面

### Godot 类比

本 Story 对应 Godot 的 **AssetLib（资产库）**：
- 每个已发布 Agent App = 可下载/fork 的 Scene Pack
- Fork = 导入 Scene 后本地化修改
- Kit 类型 = 资产库分类 tag

### 存储策略（MVP 阶段）

允许使用 JSON 文件持久化（如 `_data/catalog.json`），与现有 trajectory archive 同等级别，不引入数据库依赖。

### 隐私边界

- `system_prompt` 等 RoleProfile 内部配置**不在 Catalog 详情中暴露**
- `blueprint_snapshot` 可完整存储，但 API 返回时过滤敏感字段

### Scope Boundaries

**本 Story 做：**
- Catalog 页面（列表、过滤、详情、Fork）
- Catalog API（list / get / fork）
- publish → catalog 写入逻辑（协调 Story 8.6）

**本 Story 不做：**
- Agent App 的多人协作或权限管理
- Catalog 评分/评论系统
- 公开外部发布（第一阶段只做本地/平台内 catalog）
- 完整 publish 流（Story 8.6 负责）

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Story 8.7 是 Builder 主路径"创建 → 发布 → 被复用"闭环的最后一环
- 对应路线图 §8 "第 11-12 周：agent catalog / template catalog"
- Godot Asset Library 类比：已发布 Scene 可被任意用户导入并本地修改
- 存储方案 MVP 阶段允许 JSON 文件，与 trajectory archive 同等级别

### File List

- `_bmad-output/implementation-artifacts/8-7-agent-catalog-已发布浏览-fork.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.7，状态置为 `backlog`（依赖 Story 8.6 完成）

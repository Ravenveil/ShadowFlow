# Story 8.3b: RoleProfile 深度配置面板（persona_traits / capabilities / state_fields）

Status: backlog

<!-- 依赖 Story 8.3（Scene Mode shell + 基础 Inspector）完成后开工 -->

## Story

As a **需要配置有个性、有状态的 Agent 角色的用户**,
I want **在 Inspector 中完整编辑 RoleProfile 的全部字段，包括 persona_traits、capabilities 和 state_fields**,
so that **Persona/NPC Kit（Story 10.4）和其他场景 Kit 能够真正发挥角色配置的能力，而不是只能设置 prompt 和工具**。

## 背景与动机

Story 8.3 的 Inspector 仅覆盖了 RoleProfile 的基础字段：
- `role_title`、`system_prompt`
- `handoff / collaboration style`（轻量）
- `visible tools`（工具权限）
- `knowledge bindings`（占位）
- `memory profile`（最小版）

Story 8.1 在 `contracts_builder.py` 中定义的完整 `RoleProfile` 还包含：
- `capabilities`（角色能做什么）
- `handoff_rules`（显式 handoff 条件，非只是风格）
- `persona_traits`（个性特征，Persona/NPC Kit 必需）
- `state_fields`（持久化状态字段，Persona/NPC Kit 必需）

没有这些字段，Persona Kit（10.4）开发时会发现 Inspector 无法配置关键内容，被迫把角色配置逻辑下沉到 Kit 内部，破坏 Builder 统一编辑的设计原则。

## Acceptance Criteria

### AC1 — Inspector 中选中 Agent 时，RoleProfile 面板显示完整字段分组

**Given** 用户在 Scene Mode（Story 8.3）中选中一个 Agent 节点  
**When** Inspector 渲染 RoleProfile 编辑区域  
**Then** 字段按以下分组显示（分组可折叠）：
1. **基本信息**（已有）：`role_title`, `system_prompt`
2. **能力边界**（新增）：`capabilities[]`（可增删的字符串列表，描述该角色能做什么）
3. **Handoff 规则**（扩展）：`handoff_rules[]`（显式触发条件 + 目标角色，超越 8.3 中的轻量"风格"字段）
4. **个性特征**（新增）：`persona_traits`（key-value 对，如 `tone: "formal"`, `style: "concise"`）
5. **持久状态字段**（新增）：`state_fields[]`（状态变量名 + 类型 + 默认值）

**And** 各分组有独立的"折叠/展开"控制，默认只展开"基本信息"和"能力边界"

**And** 空字段显示友好空态（如"+ 添加特征"），而不是空白输入框列表

### AC2 — `capabilities` 字段支持列表式增删编辑

**Given** Inspector 中展开"能力边界"分组  
**When** 用户编辑 capabilities  
**Then** 提供标签/pill 列表样式（类似 tag input）：
- 用户可输入描述并回车添加一条 capability
- 点击已有 capability 上的 ×，删除该条

**And** capabilities 列表支持最多 20 条，超出时提示"最多 20 条"

**And** 编辑结果实时写回 `blueprint state` 中对应 `role_profiles[i].capabilities`

### AC3 — `handoff_rules` 支持结构化规则编辑

**Given** Inspector 中展开"Handoff 规则"分组  
**When** 用户配置 handoff 规则  
**Then** 每条规则显示为一行，包含：
- `trigger`（文本输入，如"任务需要代码执行时"）
- `target_role`（下拉选择当前 Blueprint 中的其他角色）
- ×（删除此规则）

**And** 用户可通过"+ 添加规则"按钮新增一行

**And** `target_role` 下拉的选项来自当前 `blueprint.role_profiles[]`，实时联动（若用户在 Scene Tree 新增了角色，下拉列表同步更新）

**And** 规则最多 10 条，超出时提示

**And** 编辑结果写回 `blueprint state` 中 `role_profiles[i].handoff_rules[]`

### AC4 — `persona_traits` 支持 key-value 对编辑

**Given** Inspector 中展开"个性特征"分组  
**When** 用户配置 persona traits  
**Then** 显示为可编辑的 key-value 行列表：
- `key`（如 `tone`, `language_style`, `response_length`）
- `value`（如 `"friendly"`, `"academic"`, `"concise"`）
- ×（删除此行）

**And** 系统提供若干预设 key 的下拉提示（如 `tone`, `style`, `language`, `formality`），用户也可自由输入

**And** 最多 15 组 key-value，超出时提示

**And** 编辑结果写回 `blueprint state` 中 `role_profiles[i].persona_traits`

### AC5 — `state_fields` 支持状态变量定义

**Given** Inspector 中展开"持久状态字段"分组  
**When** 用户配置状态字段（主要用于 Persona/NPC Kit）  
**Then** 显示为变量列表，每行包含：
- `name`（变量名，如 `friendship_level`）
- `type`（下拉：`string` / `number` / `boolean` / `json`）
- `default`（默认值输入框）

**And** "+"按钮添加新变量，×按钮删除

**And** 若 `type=boolean`，`default` 显示为 toggle，而不是文本框

**And** `name` 仅允许字母、数字、下划线，否则高亮提示校验错误

**And** 编辑结果写回 `blueprint state` 中 `role_profiles[i].state_fields[]`

### AC6 — 字段更新写回 contracts_builder.py 定义的 RoleProfile 结构，不允许散落自定义字段

**Given** Story 8.1 已在 `contracts_builder.py` 中定义了完整 `RoleProfile` schema  
**When** 用户在 Inspector 编辑任意 RoleProfile 字段  
**Then** 前端所有编辑操作最终都写入 `blueprint state` 中的 `role_profiles[i]`，字段名与 `contracts_builder.py` 一致（`snake_case`）

**And** 不允许在 React 组件 state 里自造新字段名（如不能用 `personaTraits` 而后端是 `persona_traits`）

**And** Inspector 保存/提交时，`blueprint state` 中的 `role_profiles` 数组必须能通过 `RoleProfile` Pydantic model 的 `model_validate()` 校验

### AC7 — 测试覆盖各字段组的增删改与写回

**Given** 本 Story 为 Persona Kit（10.4）和其他 Kit 提供配置基础  
**When** Story 8.3b 完成  
**Then** 至少覆盖以下测试：
- `capabilities` 增删 tag 写回 blueprint state
- `handoff_rules` 添加规则、`target_role` 下拉联动
- `persona_traits` key-value 增删
- `state_fields` 变量名校验（非法字符提示）
- blueprint state 写回后能通过 `RoleProfile.model_validate()` 校验
- 各分组折叠/展开行为

## Tasks / Subtasks

- [ ] **T1(AC1) Inspector 字段分组架构重构**
  - [ ] 把 Inspector 的 RoleProfile 编辑区从 8.3 的单平层，拆分为 5 个分组（折叠手风琴）
  - [ ] 保持向下兼容：已有 `role_title`、`system_prompt`、`visible tools` 字段不破坏

- [ ] **T2(AC2) `capabilities` tag input 组件**
  - [ ] 实现 pill/tag 列表 + 回车添加 + × 删除 + 最多 20 条限制
  - [ ] 写回 `blueprint state`

- [ ] **T3(AC3) `handoff_rules` 结构化规则编辑**
  - [ ] 实现 trigger 文本输入 + target_role 下拉（动态 from blueprint role list）
  - [ ] + 添加行 / × 删除行
  - [ ] 写回 `blueprint state`

- [ ] **T4(AC4) `persona_traits` key-value 编辑器**
  - [ ] 实现 key（带预设下拉提示）+ value 文本 + ×删除
  - [ ] 写回 `blueprint state`

- [ ] **T5(AC5) `state_fields` 变量定义编辑器**
  - [ ] 实现 name / type 下拉 / default（含 boolean toggle）
  - [ ] `name` 字段格式校验（字母数字下划线）
  - [ ] 写回 `blueprint state`

- [ ] **T6(AC6) 写回校验**
  - [ ] 在 blueprint store 的 save/update 路径加入 `RoleProfile` schema 检查
  - [ ] 前端 `src/common/types/agent-builder.ts` 中 `RoleProfile` 类型补全以上字段

- [ ] **T7(AC7) 测试**
  - [ ] `Inspector.RoleProfile.test.tsx`（各分组 UI 行为）
  - [ ] blueprint state 写回后 model_validate 校验的后端测试

## Dev Notes

### 依赖前序 Story

- **Story 8.3**（Scene Mode shell + 基础 Inspector）：本 Story 扩展其 Inspector 面板
- **Story 8.1**（Builder Contract）：`RoleProfile` Pydantic model 完整定义
- **Story 10.4**（Persona/NPC Kit）：主要消费方，需在本 Story 完成后才能正确开工

### 代码落点

- `src/core/components/builder/Inspector/RoleProfilePanel.tsx`（新增或拆分自 8.3）
- `src/core/components/builder/Inspector/fields/CapabilitiesEditor.tsx`
- `src/core/components/builder/Inspector/fields/HandoffRulesEditor.tsx`
- `src/core/components/builder/Inspector/fields/PersonaTraitsEditor.tsx`
- `src/core/components/builder/Inspector/fields/StateFieldsEditor.tsx`
- `src/common/types/agent-builder.ts`（补全 `RoleProfile` 字段）

### Persona Kit 依赖说明

Story 10.4（Persona/NPC Kit）要求 RoleProfile 具备完整配置能力。若本 Story 未完成，10.4 开发时将不得不把 persona_traits / state_fields 配置逻辑写入 Kit 自身，导致：
1. 配置分散，无法跨 Kit 复用
2. 违背"Kit = 预设配置 + Builder 通用字段"的设计原则

因此本 Story 是 10.4 开工的前置条件。

### Scope Boundaries

**本 Story 做：**
- Inspector RoleProfile 编辑面板的 capabilities / handoff_rules / persona_traits / state_fields
- 前端类型补全与 blueprint state 写回校验

**本 Story 不做：**
- MemoryProfile 深度编辑（属于 Story 9.3）
- EvalProfile 配置（属于 Story 9.5）
- state_fields 的运行时实际存取逻辑（属于 Story 9.3/9.4）
- persona_traits 的 LLM 提示词注入（属于 Kit 实现层）

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- 本 Story 填补 8.3 基础 Inspector 与 Story 10.4 Persona/NPC Kit 之间的字段覆盖缺口
- 核心原则：配置在 Builder 统一管理，Kit 不自造配置字段
- 设计参考：Godot Inspector 的分类属性分组（折叠 Category）
- `state_fields` 的运行时读写留给 Epic 9（Memory/State）

### File List

- `_bmad-output/implementation-artifacts/8-3b-roleprofile-深度配置-persona-traits-state-fields.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-23: 创建 Story 8.3b，状态置为 `backlog`（依赖 Story 8.3 完成）

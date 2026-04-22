# Story 3.6.7: 模板 YAML Schema 扩展 + 6 种子模板改造

Status: done

## Story

As a **模板编辑者 / 前端开发者**,
I want **模板 YAML 声明完整的协作上下文（不只是工作流）**,
so that **Inbox / 切换器 / BriefBoard / AgentDM 能从模板直接读取所有 UI 上下文，Epic 7 的 Collaboration Quad-View 全部有数据源**。

## Acceptance Criteria

### AC1 — WorkflowTemplateSpec 新增 6 个可选顶层字段

**Given** `shadowflow/highlevel.py:WorkflowTemplateSpec`（当前 line 313-405）
**When** schema 扩展完成
**Then** 新增 6 个可选字段（全部有合理默认值，向后兼容旧 YAML）:

```python
user_role: str = "Owner"                      # FR-Identity
default_ops_room_name: str = ""                # FR-OpsRoom
brief_board_alias: str = "BriefBoard"          # FR-BriefBoard-Alias
agent_roster: List[AgentRosterEntry] = []      # 决策 7 独立 roster
group_roster: List[GroupTemplateSpec] = []      # 决策 7 独立群聊清单
theme_color: str = "#6366F1"                   # 决策 6 模板切换器图标色
```

**And** 旧 YAML（如 `examples/highlevel/minimal-registry/templates/docs-review-template.yaml`）缺失新字段时加载不报错，使用默认值

### AC2 — AgentRosterEntry 与 GroupTemplateSpec Pydantic 模型

**Given** 新增两个 Pydantic 模型（在 `shadowflow/highlevel.py` 内定义）
**When** 定义完成
**Then** schema 如下:

```python
class AgentRosterEntry(BaseModel):
    id: str
    name: str
    soul: str = ""                       # SOUL prompt 摘要
    llm: str = ""                        # 绑定 LLM provider（如 "claude-sonnet-4-6"）
    tools: List[str] = Field(default_factory=list)

class GroupTemplateSpec(BaseModel):
    id: str
    name: str
    agents: List[str] = Field(default_factory=list)  # 引用 agent_roster[].id
    policy_matrix: str = ""              # 引用 policy_matrix 名称或内联
```

**And** `WorkflowTemplateSpec.validate_template()` 增加跨字段校验:
- `agent_roster[].id` 不得重复
- `group_roster[].agents` 中每个 id 必须在 `agent_roster` 或 `agents`（现有字段）中存在
- 校验失败时 `ValueError` 消息清晰

### AC3 — 6 种子模板 YAML 按新 schema 创建

**Given** `templates/` 目录（项目根，新建）
**When** 6 个种子模板文件创建完成
**Then** 每个模板包含新旧字段完整定义:

| 模板文件 | user_role | default_ops_room_name | brief_board_alias | agent_roster 角色数 | theme_color |
|---------|-----------|----------------------|-------------------|-------------------|-------------|
| `solo-company.yaml` | CEO | CEO Ops Room | 日报 | 8 | #10B981 |
| `academic-paper.yaml` | PI | PI Study Room | 组会汇报 | 6（含 CitationReviewer 替 Compliance） | #6366F1 |
| `newsroom.yaml` | Editor-in-Chief | Editorial Room | 早报会 | 5 | #EF4444 |
| `modern-startup.yaml` | Founder | Founders Room | Daily Standup | 3 | #F59E0B |
| `consulting.yaml` | Engagement Partner | Engagement Room | Weekly Digest | 5 | #8B5CF6 |
| `blank.yaml` | Owner | （空） | BriefBoard | 0 | #6B7280 |

**And** 每个非 Blank 模板至少声明 1 个 `group_roster` 条目
**And** `consulting.yaml` 替代原计划的 `ming-cabinet.yaml`（决策 3：不借鉴外部制度术语）
**And** Academic Paper 的 `agent_roster` 使用 `CitationReviewer` 替代 `Compliance`（决策 8）

### AC4 — 前端 TS 类型同步

**Given** `src/common/types/` 目录
**When** 新增 `src/common/types/template.ts`
**Then** 包含与 Python schema 对齐的 TS interface:

```typescript
export interface Template {
  template_id: string;
  name: string;
  version: string;
  user_role: string;
  default_ops_room_name: string;
  brief_board_alias: string;
  agent_roster: AgentRosterEntry[];
  group_roster: GroupTemplate[];
  theme_color: string;
  // 原有字段保留
  policy_matrix: any;
  stages: any[];
  agents: any[];
  nodes: any[];
  flow: any;
  metadata: Record<string, any>;
}

export interface AgentRosterEntry {
  id: string;
  name: string;
  soul: string;
  llm: string;
  tools: string[];
}

export interface GroupTemplate {
  id: string;
  name: string;
  agents: string[];
  policy_matrix: string;
}
```

### AC5 — 向后兼容性验证

**Given** 现有旧格式 YAML `examples/highlevel/minimal-registry/templates/docs-review-template.yaml`
**When** 用扩展后的 `WorkflowTemplateSpec.model_validate()` 加载
**Then** 加载成功，新字段全部使用默认值
**And** `user_role == "Owner"`, `brief_board_alias == "BriefBoard"`, `agent_roster == []`, `group_roster == []`

### AC6 — 单元测试

**Given** `tests/test_template_schema.py` 新增
**When** pytest 运行
**Then** 覆盖:
- 6 个种子模板全部 `model_validate` 通过
- 旧 YAML 向后兼容
- `agent_roster` id 重复时 `ValueError`
- `group_roster.agents` 引用不存在 id 时 `ValueError`
- 缺失新字段时默认值正确

## Tasks / Subtasks

- [x] **T1 (AC2): 新增 `AgentRosterEntry` + `GroupTemplateSpec` Pydantic 模型**
  - [x] 在 `shadowflow/highlevel.py` 的 `WorkflowStageSpec` 之前新增两个 class
  - [x] `AgentRosterEntry`: id, name, soul, llm, tools
  - [x] `GroupTemplateSpec`: id, name, agents, policy_matrix
- [x] **T2 (AC1): 扩展 `WorkflowTemplateSpec` 新增 6 字段**
  - [x] 在 `WorkflowTemplateSpec` 的 `defaults` 字段之前插入 6 个新 Field
  - [x] 全部使用默认值保证向后兼容
- [x] **T3 (AC1+AC2): 扩展 `validate_template()` model_validator**
  - [x] 在现有 `validate_template` 末尾追加 agent_roster id 唯一性检查 + group_roster.agents 引用合法性检查
  - [x] 不改动现有校验逻辑（仅追加）
- [x] **T4 (AC3): 创建 `templates/` 目录 + 6 个种子模板 YAML**
  - [x] `templates/solo-company.yaml` (8 agents, CEO, #10B981)
  - [x] `templates/academic-paper.yaml` (6 agents, PI, CitationReviewer 替 Compliance, #6366F1)
  - [x] `templates/newsroom.yaml` (5 agents, Editor-in-Chief, #EF4444)
  - [x] `templates/modern-startup.yaml` (3 agents, Founder, #F59E0B)
  - [x] `templates/consulting.yaml` (5 agents, Engagement Partner, #8B5CF6, 替代 ming-cabinet)
  - [x] `templates/blank.yaml` (0 agents, Owner, #6B7280)
  - [x] 每模板最小可运行骨架（plan → END），复杂流程交给 Story 3.6 补全
- [x] **T5 (AC4): 新增 `src/common/types/template.ts`**
  - [x] Template / AgentRosterEntry / GroupTemplate 三个 interface
- [x] **T6 (AC5+AC6): 测试**
  - [x] 新增 `tests/test_template_schema.py`（20 tests, all passing）
  - [x] 6 模板 model_validate 通过
  - [x] 旧 YAML 向后兼容
  - [x] 跨字段校验（id 重复 / 引用不存在）
  - [x] 默认值测试

## Dev Notes

### 架构关键路径

**改动集中在 1 个 Python 文件 + 6 个 YAML + 1 个 TS 文件 + 1 个测试文件。**

1. **`shadowflow/highlevel.py`** — 这是核心改动点。当前文件约 2300 行，包含 `WorkflowTemplateSpec` + `TemplateCompiler` + CLI。所有 Pydantic 模型都在这个文件里（非分离到 contracts.py）
2. **`templates/*.yaml`** — 项目根目录新建。注意：`examples/highlevel/minimal-registry/templates/` 是旧示例目录，新种子模板放根 `templates/`
3. **`src/common/types/template.ts`** — 新文件，与 Python snake_case 字段名保持一致（前端在 adapter 层做 camel 转换，见 AR18 `caseConverter.ts`）
4. **`tests/test_template_schema.py`** — 新测试文件

### 现有 Schema 结构（必须理解后再改）

`WorkflowTemplateSpec` 当前字段（`shadowflow/highlevel.py:313-326`）:
```
template_id, version, name, description, parameters, agents, nodes,
flow, policy_matrix, activation, stages, defaults, metadata
```

其中 `agents: List[TemplateAgentSpec]` 是**编排层**的 agent 规格（含 ref / assignment / overrides / config_patch / local_activation）—— 这是 ShadowFlow 调度引擎需要的详细信息。

新增的 `agent_roster: List[AgentRosterEntry]` 是**展示层**的 agent 花名册（轻量 id/name/soul/llm/tools）—— 这是 Inbox/AgentDM/TemplateSwitcher 等 UI 需要的。

**两者不是替代关系，而是互补**。同一个 agent 可以在 `agent_roster` 里有个简介、在 `agents` 里有详细编排配置。

### 已存在的 model_validator 不能破坏

`validate_template()` 当前校验（line 328-405）:
- agent/node id 唯一性
- flow.entrypoint 合法性
- edge from/to 引用合法性
- policy_matrix.agents 引用合法性
- local_activation.delegate_candidates 合法性
- stages 覆盖所有节点 + 顺序一致性

**新增的 agent_roster / group_roster 校验必须放在这些之后，不能影响现有逻辑**。

### agent_roster 与 agents 字段的 ID 关系

当前 `WorkflowTemplateSpec` 的 `agents` 字段（`List[TemplateAgentSpec]`）里的 `id` 在 model_validator 中用于 flow/edge/policy_matrix 合法性检查。新增的 `agent_roster` 里的 `id` 是独立命名空间（UI 层展示用），**但** `group_roster[].agents` 引用的 id 应该在 `agent_roster` 或 `self.agents` 任一中存在（容错设计，避免强制双写）。

### 决策 3 合规：禁用借鉴术语

模板角色名称/群聊名称/别名中**禁止**出现：奏折、奏章、军机处、三省六部、门下省、内阁、票拟、批红、封驳等借鉴制度术语。用 ShadowFlow 自己的业务场景术语（CEO / PI / Editor-in-Chief / Founder / Engagement Partner）。

### 决策 8 合规：Academic Paper 角色替换

Academic Paper 模板角色不再使用 `Compliance`，改为 `CitationReviewer`（核对引用完整性、数据出处、结论与证据链一致性）。学术场景无合规官概念。

### 前端字段命名

Python schema 使用 snake_case（`user_role`、`default_ops_room_name`）。前端 TS 类型也保持 snake_case，实际 HTTP 通信由 `src/adapter/caseConverter.ts`（AR18）在 fetch 边界做 snake↔camel 转换。**TS 类型定义中不要用 camelCase**。

### Story 3.6 依赖说明

Story 3.6（"6 个种子模板 YAML 定稿 + 可运行"）的 scope 包含完整的 flow/nodes/stages/policy_matrix 和冒烟测试。本 Story 3.6.7 **只关注 schema 扩展 + 新字段填充**，每个模板的 flow/nodes/stages 用最小骨架（plan→END）即可，复杂流程由 Story 3.6 补全。

如果 Story 3.6 在 3.6.7 之后实现（大概率），3.6 开发者只需在已有 YAML 基础上扩展 flow/nodes/stages，不需重建文件。

### Project Structure Notes

- Python schema 全在 `shadowflow/highlevel.py`，不在 `shadowflow/runtime/contracts.py`（后者是 runtime 层）
- 新模板放 `templates/`（根目录），不放 `examples/`
- 前端类型放 `src/common/types/template.ts`（新文件）
- 测试放 `tests/test_template_schema.py`

### References

- [Source: epics-addendum-2026-04-16.md#Story 3.6.7]
- [Source: epics-addendum-2026-04-16.md#Data Model 补丁]
- [Source: shadowflow/highlevel.py:313-405 — WorkflowTemplateSpec 完整定义]
- [Source: shadowflow/highlevel.py:226-255 — TemplateAgentSpec + WorkflowPolicyMatrixSpec]
- [Source: prd.md#协作四视图 — FR-Identity / FR-OpsRoom / FR-BriefBoard-Alias / FR-Group-Metrics]
- [Source: sprint-change-proposal-2026-04-16.md#Section 4.1 — 新 Story 定义]
- [Source: docs/design/shadowflow-ui-2026-04-16-v2.pen — pen 稿 ground truth]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Windows GBK encoding issue on YAML open — fixed by adding `encoding="utf-8"` to all `open()` calls in tests

### Completion Notes List

- T1-T3: Extended `shadowflow/highlevel.py` with `AgentRosterEntry`, `GroupTemplateSpec`, 6 new fields on `WorkflowTemplateSpec`, and cross-field validation in `validate_template()`. All changes are additive — existing model_validator logic untouched.
- T4: Created `templates/` directory with 6 seed YAML files. Each has complete new-schema fields + minimal flow skeleton (entrypoint → END). Complex flow/nodes/stages deferred to Story 3.6.
- T5: Added `src/common/types/template.ts` with `Template`, `AgentRosterEntry`, `GroupTemplate` interfaces aligned to Python snake_case schema.
- T6: 20 pytest tests — all green. Coverage: model construction, default values, backward compat (legacy YAML), 6 seed template validation, cross-field validation (duplicate ids, unknown refs).

### Change Log

- 2026-04-17: Story 3.6.7 implemented — schema extension + 6 seed templates + TS types + 20 tests

### File List

- Modified: `shadowflow/highlevel.py` (added AgentRosterEntry, GroupTemplateSpec, 6 new WorkflowTemplateSpec fields, validator extensions)
- New: `templates/solo-company.yaml`
- New: `templates/academic-paper.yaml`
- New: `templates/newsroom.yaml`
- New: `templates/modern-startup.yaml`
- New: `templates/consulting.yaml`
- New: `templates/blank.yaml`
- New: `src/common/types/template.ts`
- New: `tests/test_template_schema.py`

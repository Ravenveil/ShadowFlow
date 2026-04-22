# Story 3.6.8: Template Builder Wizard（MVP · Import YAML 降级路径）

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **超出种子模板场景的 ShadowFlow 用户**,
I want **把自己写的 Template YAML 一键导入成 custom template，立即出现在模板列表里可被选中**,
so that **不用等 Epic 7 完整向导 UI，也能在黑客松 DDL 前创造自己的"公司模板"（递归组合原则：custom template = 自定义顶层 Team = 自定义公司）**。

## Scope Ruling（MVP 降级）

**本 Story 交付**: "Import YAML + 最小 rename 表单" 降级路径（epics-addendum-2026-04-16.md line 278 明确授权的 MVP 降级）
**本 Story 不交付**: 5 步可视化向导（Agent Roster 多选 / Policy Matrix 微调等 UI）→ 延期到 V2 Story
**理由**: 黑客松 5/16 DDL，完整向导 UI 体量不可控；后端 schema（Story 3.6.7 已 done）+ Import 路径就足以让用户创造自定义模板

## Acceptance Criteria

### AC1 — Backend: `POST /templates/custom` 创建自定义模板

**Given** `shadowflow/server.py` 新增端点
**When** 客户端 POST JSON `{ "yaml_text": "<raw yaml>", "overrides": { "template_id"?: str, "user_role"?: str, "default_ops_room_name"?: str } }`
**Then** 后端按以下流程处理:

1. `yaml.safe_load(yaml_text)` → dict
2. 应用 `overrides`: 若提供 `template_id` 则覆盖 dict 中的 `template_id` 字段（rename 支持）;其余 overrides 同理
3. `WorkflowTemplateSpec.model_validate(dict)` —— 失败则返回 422 + 结构化错误
4. 检查 `template_id` 唯一性: 若与 `templates/*.yaml`（seed）或 `templates/custom/*.yaml`（已有 custom）冲突 → 返回 409
5. 持久化到 `templates/custom/{template_id}.yaml`（UTF-8，`yaml.safe_dump` + `allow_unicode=True`）
6. 返回 200 + 完整 `Template` 对象（含 `source: "custom"` 字段）

**And** 端点路径遵循 server.py 现有约定（`/workflow/*`、`/runs/*`、`/chat/*`），**不加 `/api/` 前缀**（偏离 epics-addendum line 349 的 `/api/templates/custom` —— 见 Dev Notes "API 路径约定"）

### AC2 — Backend: `GET /templates` 列出所有模板

**Given** `GET /templates` 端点
**When** 无参数调用
**Then** 返回 `List[TemplateListItem]`，按 `[seed 按字母序, custom 按修改时间倒序]` 排列，每项含:
```python
{
  "template_id": str,
  "name": str,
  "user_role": str,
  "default_ops_room_name": str,
  "brief_board_alias": str,
  "theme_color": str,
  "agent_roster_count": int,
  "group_roster_count": int,
  "source": "seed" | "custom",  # 本 Story 新增字段
}
```

**And** Seed 从 `templates/*.yaml`（根目录，非 custom 子目录）扫描;Custom 从 `templates/custom/*.yaml` 扫描
**And** 任一模板文件加载失败（YAML 语法错/schema 不匹配）时跳过该文件并 `logger.warning` 记录文件名 + 错误原因（不整体 500，保持其他模板可用）

### AC3 — Backend: `GET /templates/{template_id}` 取单个完整模板

**Given** `GET /templates/{template_id}` 端点
**When** 传入存在的 `template_id`
**Then** 返回完整 `WorkflowTemplateSpec.model_dump()` 结构（含所有 stages/nodes/flow 等），以及顶层 `"source": "seed" | "custom"`
**And** 404 若不存在
**And** 优先匹配 custom（若同名 —— AC1 已防止这种情况，但作为防御性 fallback）

### AC4 — Frontend: `ImportTemplateDialog` 组件

**Given** `src/core/components/Template/ImportTemplateDialog.tsx` 新增
**When** 打开 dialog
**Then** UI 包含:
- 标题："+ 新建模板（从 YAML 导入）"
- YAML 输入区（2 选 1）:
  - `<textarea>` 粘贴 YAML（默认显示）
  - `<input type="file" accept=".yaml,.yml">` 上传文件（读进 textarea）
- 最小 2 个 override 字段:
  - `Template ID`（必填；占位提示 "my-company";正则 `^[a-z0-9-]{3,40}$`）
  - `User Role`（可选;占位提示 "CEO / Founder / PI ..."）
- "验证" 按钮: 调 AC1 端点 `dry_run` 模式（若实现）或本地做 YAML 语法检查 + 空字段检查
- "导入" 按钮: 调 AC1 端点;成功后关闭 dialog 并刷新模板列表
- 错误展示区: 422 错误分行显示字段路径 + 消息（`err.loc.join('.') + ': ' + err.msg`）;409 单独提示 "Template ID 已被占用，请换一个名字"
- 加载态: 提交时按钮置 disabled 并显示 spinner

**And** Dialog 使用现有项目的 Modal/Dialog 模式（参考 `src/core/components/Panel/` 现有风格）;若无现成 Modal 基座，本 Story 可内联一个最小化 overlay（不做跨组件抽象）

**And** 深色背景 `#0D1117`、圆角 14px（遵循 Pencil 设计语言 v1 —— project_pencil_design_language 记忆）

### AC5 — Frontend: Entry Point 与 API Client

**Given** `src/api/templates.ts` 新文件 + App 顶层某处的 "+ 新建模板" 触发入口
**When** 用户点击入口按钮
**Then** 打开 AC4 的 Dialog

**And** `src/api/templates.ts` 提供:
```typescript
export async function listTemplates(): Promise<TemplateListItem[]>
export async function getTemplate(templateId: string): Promise<Template>
export async function importCustomTemplate(payload: {
  yaml_text: string;
  overrides?: { template_id?: string; user_role?: string; default_ops_room_name?: string };
}): Promise<Template>
```

**And** 入口位置选一（优先级从高到低）:
1. 若 Story 7.1 InboxPage 已落地 → 放在模板切换器下拉底部（epics-addendum Story 3.6.8 原文位置）
2. 若 Story 6.3 TemplatesPage 已落地 → 放在页面右上角 "+ New" 按钮
3. 以上都未落地 → 临时放在 `App.tsx` 顶部 header 右侧，带紫色 accent `#A78BFA` 方便找到

**And** 本 Story 采用自己负责的最低保障入口（方案 3），但组件 API 设计成独立可复用，其他入口自行接入

### AC6 — 决策 10 · "+ 加入企业" 置灰占位

**Given** AC4 Dialog 底部
**When** 渲染
**Then** 显示辅助按钮 `"+ 加入企业"`，disabled 状态，`title` 属性（tooltip）文案：
> "多租户企业模式 · Phase 3 启用"

**And** 纯占位，不触发任何行为，点击无响应

### AC7 — 持久化：`templates/custom/` 目录与 gitignore

**Given** `templates/custom/` 目录
**When** 首次 Import 触发
**Then** 后端 `os.makedirs("templates/custom", exist_ok=True)` 自动创建

**And** `.gitignore` 追加:
```
# Custom templates (user-authored, not source-tracked)
templates/custom/
```

**And** 已有 seed templates（`templates/*.yaml`）保留在版本控制，不受影响

### AC8 — 单元测试

**Given** `tests/test_template_custom_api.py` 新增 + FastAPI `TestClient`
**When** pytest 运行
**Then** 覆盖:
- 导入合法 YAML（构造一个最小 `{template_id, version, name, flow:{entrypoint:'a', edges:[...]}, agents:[{id:'a'}], ...}`） → 200 + `templates/custom/{id}.yaml` 存在
- 导入 schema 非法 YAML（缺 `template_id`） → 422，错误 body 包含 `"template_id"` 字段路径
- 导入 template_id 与 seed 冲突（如 `"solo-company"`） → 409
- 导入 template_id 与已存在 custom 冲突 → 409
- `overrides.template_id` rename 生效（原 YAML 写 `a`，override `b`，落盘为 `templates/custom/b.yaml`）
- `GET /templates` 返回包含 seed + 刚导入的 custom，`source` 字段正确
- `GET /templates/{id}` 404 不存在 id
- 测试完成后清理 `templates/custom/` 中本次 test 创建的文件（`tmp_path` fixture 或 teardown）

**And** 不使用 mock —— 遵循 `.claude/rules/test-execution.md` "No mocking"

## Tasks / Subtasks

- [ ] **T1 (AC2+AC3): 新建 TemplateRegistry 读层**（AC: 2, 3）
  - [ ] 新增 `shadowflow/templates/__init__.py`（若目录不存在）或直接在 `shadowflow/server.py` 内嵌一个 `_template_registry()` 辅助（MVP 倾向后者，避免过度模块化）
  - [ ] 扫描 `templates/*.yaml`（seed）与 `templates/custom/*.yaml`（custom），各自 `yaml.safe_load` + `WorkflowTemplateSpec.model_validate`
  - [ ] 加载失败的文件 `logger.warning` 跳过，返回已成功加载的
  - [ ] 暴露 `list_templates()` 与 `get_template(template_id, include_source=True)`
- [ ] **T2 (AC1): `POST /templates/custom` 端点**（AC: 1）
  - [ ] 定义 Pydantic 请求模型 `CustomTemplateImportRequest { yaml_text: str, overrides: Optional[Dict[str, Any]] = None }`
  - [ ] 流程：`yaml.safe_load` → apply overrides → `WorkflowTemplateSpec.model_validate` → 冲突检查 → 落盘 → 返回
  - [ ] 422 错误回显 `ValidationError.errors()`（Pydantic v2 格式）
  - [ ] 409 返回 `{"detail": "template_id '{id}' already exists", "existing_source": "seed"|"custom"}`
  - [ ] 保存时用 `yaml.safe_dump(dict, allow_unicode=True, sort_keys=False)` 保持字段顺序可读
- [ ] **T3 (AC2): `GET /templates` 列表端点**（AC: 2）
  - [ ] 调用 T1 的 `list_templates()`
  - [ ] 投影到 `TemplateListItem`（含 `source` + `agent_roster_count` 等）
  - [ ] 排序：seed 按 `template_id` 字母序,custom 按 `mtime` 倒序
- [ ] **T4 (AC3): `GET /templates/{id}` 单条端点**（AC: 3）
  - [ ] 调用 T1 的 `get_template`
  - [ ] 完整 `model_dump()` + `source` 字段
  - [ ] 404 处理
- [ ] **T5 (AC7): `.gitignore` + 目录初始化**（AC: 7）
  - [ ] 追加 `.gitignore` 两行
  - [ ] T2 端点内 `os.makedirs("templates/custom", exist_ok=True)`
- [ ] **T6 (AC5): `src/api/templates.ts` API Client**（AC: 5）
  - [ ] 三个函数：`listTemplates` / `getTemplate` / `importCustomTemplate`
  - [ ] 复用 `src/api/workflow.ts` 的 `API_BASE_URL` 或提取成共享常量（提取优先，若无通用 util 则就地用）
  - [ ] fetch 错误处理：422 解析 Pydantic errors，409 解析 detail
  - [ ] TS 类型引用 `src/common/types/template.ts`（Story 3.6.7 已建）
- [ ] **T7 (AC4): `ImportTemplateDialog` 组件**（AC: 4, 6）
  - [ ] 新文件 `src/core/components/Template/ImportTemplateDialog.tsx`
  - [ ] 受控的 `{ open: boolean; onClose: () => void; onImported: (tpl: Template) => void }` props
  - [ ] Textarea + File upload 互斥（文件上传读进 textarea，不同时保留）
  - [ ] 两个 override 输入（template_id / user_role）
  - [ ] "验证" 按钮做本地 `yaml.load` 语法检查（装 `js-yaml` 若未装;若团队偏好纯后端验证可省本地验证）
  - [ ] "导入" 按钮调 AC5 API，错误分行渲染
  - [ ] 置灰的 "+ 加入企业" 按钮 + tooltip（AC6）
  - [ ] 深色 + 圆角 14px + 紫色 accent
- [ ] **T8 (AC5): Entry button 接入**（AC: 5）
  - [ ] 检查 Story 7.1 / 6.3 是否已 merge（若任一已落地，在对应位置加触发按钮，**不要重复加入口**）
  - [ ] 否则 `src/App.tsx` 顶部 header 右侧放 "+ 新建模板" 按钮（紫色 accent）
  - [ ] 按钮点击打开 Dialog，Dialog `onImported` 回调触发 `listTemplates()` 刷新（若 App 维护模板列表 state）
- [ ] **T9 (AC8): 后端测试**（AC: 8）
  - [ ] 新建 `tests/test_template_custom_api.py`
  - [ ] FastAPI `TestClient` 为 `shadowflow.server:app`
  - [ ] 7 个 test case 覆盖 AC8 列表
  - [ ] 使用 `tmp_path` + monkey-patch `templates/custom` 目录，或在 teardown 删除本次创建的文件（**不污染真实 templates/custom/**）
- [ ] **T10 (AC4, optional): 前端 Dialog 组件测试**（AC: 4）
  - [ ] 新建 `src/__tests__/ImportTemplateDialog.test.tsx`（若团队已有 Vitest/Jest 基座）
  - [ ] 至少 1 个 happy path：填 YAML + template_id → onImported 被调用
  - [ ] 1 个 error path：后端 422 → 错误区显示字段路径
  - [ ] 若前端测试基座尚未就绪（需要 Story 0.3 TS 生成 + 测试 scaffold），本 task **可推迟**，后端测试（T9）覆盖核心逻辑

## Dev Notes

### 递归组合原则（最新设计约束，2026-04-20）

用户在 2026-04-20 对齐了一条上位设计原则：**Agent / Team / 公司从外部看都是"接受目标、分工完成、交付"的同一种东西**（见 memory `architecture_decisions.md`）。本 Story 的意义是：让用户能**创造自己的顶层 Team = 自定义"公司"**。

这意味着：
- **不要为 custom template 引入新数据模型** —— `WorkflowTemplateSpec` 就是顶层 Team 的定义，seed 和 custom 共用同一 schema
- **不要把 "custom template" 当二等公民** —— `GET /templates/{id}` 对 seed 和 custom 返回结构一致，仅 `source` 字段区分出处
- Story 3-3 / 2-3 的"`agent` 节点 target 多态寻址"（可指向另一个模板）不是本 Story 的 scope，**本 Story 不实现跨模板调用**，只负责把 YAML 变成一个已注册的模板

### API 路径约定（重要决策，偏离 addendum）

**epics-addendum-2026-04-16.md line 349-353** 使用 `/api/templates/*` 前缀，但 `shadowflow/server.py` 现有端点（`/workflow/*`、`/runs/*`、`/chat/*`、`/checkpoints/*`）均**不带 `/api/` 前缀**。

**决策**: 本 Story 的后端端点使用 `/templates/*`（无 `/api/` 前缀），与项目现有约定保持一致。Epics-addendum 是较早的设计草稿，server.py 是 ground truth。

如果未来需要加 `/api/` 前缀（例如上 Nginx 反向代理分前后端），应通过 FastAPI `APIRouter(prefix="/api")` 在 server.py 入口统一挂载，**不应**只给 `/templates/*` 加前缀造成路径不一致。

### 现有 Schema 结构（必须理解后再改）

Story 3.6.7 已完成 schema 扩展。当前 `WorkflowTemplateSpec`（`shadowflow/highlevel.py:313` 附近）字段:

```
template_id, version, name, description, parameters,
user_role, default_ops_room_name, brief_board_alias,
agent_roster, group_roster, theme_color,    # 3.6.7 新增
agents, nodes, flow, policy_matrix, activation, stages, defaults, metadata
```

跨字段校验（`validate_template()`）已覆盖:
- agent/node id 唯一性
- flow.entrypoint、edge 合法性
- policy_matrix.agents / local_activation.delegate_candidates 引用合法性
- agent_roster id 唯一性 + group_roster.agents 引用合法性
- stages 覆盖所有节点 + 顺序一致性

**本 Story 无需扩展 schema** —— 只做 I/O 和 HTTP 层。

### 6 个 seed templates 已就绪

`templates/` 根目录已有 6 个 seed YAML（Story 3.6.7 完成）:
- `solo-company.yaml`（CEO / 8 agents）
- `academic-paper.yaml`（PI / 6 agents / CitationReviewer 替代 Compliance）
- `newsroom.yaml`（Editor-in-Chief / 5 agents）
- `modern-startup.yaml`（Founder / 3 agents）
- `consulting.yaml`（Engagement Partner / 5 agents）
- `blank.yaml`（Owner / 0 agents）

**不要改动这 6 个文件** —— 它们是 seed。任何修改应通过"复制出 custom 再改"的 flow（本 Story 不实现"复制自其他模板"快捷入口，推到 V2）。

### 前端字段命名（snake_case）

Python schema 全部 snake_case；前端 TS 类型也保持 snake_case（`src/common/types/template.ts` 已定义）。**不要在 TS 接口里把字段改成 camelCase**。若团队决定引入 snake↔camel boundary converter（AR18 `src/adapter/caseConverter.ts`），属于跨 Story 基础设施，**不在本 Story scope**。

### 决策合规清单

- **决策 3 · 不借鉴原则**: Dialog 文案、错误消息、tooltip 中**禁止**使用"奏折 / 军机处 / 门下省 / 内阁 / 票拟 / 批红"等借鉴制度术语。用 ShadowFlow 自己的业务术语（模板 / 公司 / 角色 / 成员）。
- **决策 7 · 模板隔离**: import 时必须要求 template_id 唯一;冲突 409 而非 overwrite。
- **决策 10 · "+ 加入企业"**: 占位置灰，AC6 已规定。
- **决策 8 · Academic Paper 用 CitationReviewer**: 不影响本 Story（只影响 seed），但用户若 import 学术类模板应建议参考 seed 用词。

### MVP 降级的扩展边界

本 Story 的"2 override"是最小集（template_id + user_role）。**不要**悄悄加：
- Agent Roster 可视化编辑 → V2
- Policy Matrix 微调 UI → V2
- "复制自其他模板" 快捷入口 → V2
- 企业 / 多租户相关功能 → Phase 3

这些都是 V2 story 的显式范围，提前做会 block MVP 收敛。

### YAML 读写细节

- 读：`yaml.safe_load(text)` —— 绝对**不用** `yaml.load`（unsafe）
- 写：`yaml.safe_dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False)`
- 编码：**全部显式 `encoding="utf-8"`**（Windows GBK 踩过 —— 见 Story 3.6.7 Debug Log）
- 字段顺序：`sort_keys=False` 保持导入时的顺序;若需要规范化顺序可在 V2 引入 serializer

### 文件命名 & 组织

- **后端**:
  - 端点直接加在 `shadowflow/server.py`（单文件现状）;若本 Story 新增 ≥ 3 个端点使文件膨胀，可抽 `shadowflow/server_templates.py` 用 `APIRouter` —— 但**优先保持单文件**，不要为了"更好组织"提前拆分
  - TemplateRegistry 作为 `server.py` 内的 module-level helper（`_seed_dir = Path("templates")`、`_custom_dir = Path("templates/custom")`）
- **前端**:
  - API: `src/api/templates.ts`（新文件，与现有 `src/api/workflow.ts` 并列）
  - 组件: `src/core/components/Template/ImportTemplateDialog.tsx`（新目录 + 文件）
- **测试**:
  - 后端: `tests/test_template_custom_api.py`
  - 前端（可选）: `src/__tests__/ImportTemplateDialog.test.tsx`

### 安全边界

- 用户提供的 YAML 不能包含 Python 对象构造（`!!python/object` 等）—— `yaml.safe_load` 默认禁用，OK
- `template_id` 正则限制 `^[a-z0-9-]{3,40}$`，防止路径穿越（`../../etc/passwd`）
- 落盘前 `Path("templates/custom") / f"{template_id}.yaml"` 做绝对路径 resolve 验证，确保 parent 是 `templates/custom`（防止 `template_id` 包含 `/` 绕过正则）
- 不做 YAML bomb 防御（生产级考虑），MVP 阶段信任用户输入;响应体 413 Request Entity Too Large 的 FastAPI 默认 limit 已够

### 前端 UX 兜底

如果 `src/` React 侧目前缺少 Modal 基座（从 `src/core/components/Panel/` 目录结构看可能有部分组件已存在，需 dev 现场确认），本 Story 允许:
- 用原生 `<dialog>` 或最小化 div overlay（fixed + backdrop）
- 不引入 UI 库（如 Radix、Headless UI）来只为这一个 dialog
- 样式用内联 style 或现有 CSS 变量;Pencil 设计语言 v1 的深色 / 圆角 / 紫色 accent 通过 style 直写即可

### 无需新依赖

- 后端: `pyyaml`（已装）、`fastapi`（已装）、`pydantic`（已装）
- 前端: `js-yaml`（**若不装**，Dialog 的本地"验证"按钮降级为纯空字段检查 + 交后端;**强烈建议不装**，后端验证是唯一真理源头，本地验证多此一举)

### 与 Story 5.5（Import by CID）的关系

Story 5.5 `5-5-import-by-cid-作者署名链` 做的是**从 0G Storage 按 CID 拉取共享模板**。本 Story 做的是**从本地 YAML 文本/文件导入**。两条路径最终都落到 `templates/custom/` 并共用 `POST /templates/custom` 的 schema 验证逻辑。

**协作建议**: Story 5.5 开发者可以把 CID 拉下来的 YAML 直接 POST 到 `/templates/custom`（复用本 Story 的端点），**不要**另写一套 "CID-import-specific" 端点。若本 Story 先落地，Story 5.5 会更轻。

### Project Structure Notes

| 位置 | 用途 | 本 Story 动作 |
|------|------|--------------|
| `templates/*.yaml` | 6 个 seed | 只读，不改 |
| `templates/custom/*.yaml` | 用户 import | 本 Story 首次创建目录 + 写入 |
| `shadowflow/server.py` | FastAPI 入口 | 新增 3 个端点 + TemplateRegistry helper |
| `shadowflow/highlevel.py` | WorkflowTemplateSpec | 只读用，不改 schema |
| `src/api/templates.ts` | API client | 新文件 |
| `src/core/components/Template/ImportTemplateDialog.tsx` | UI 组件 | 新文件 + 新目录 |
| `src/common/types/template.ts` | TS 类型 | 只读用，不改 |
| `src/App.tsx` | 入口触发 | 可能加一个按钮（若 7.1/6.3 未落地） |
| `tests/test_template_custom_api.py` | 后端测试 | 新文件 |
| `.gitignore` | gitignore | 追加两行 |

### 完成后的可观察行为

用户使用流程：
1. 自己写一份 `my-indie-team.yaml`（符合 WorkflowTemplateSpec schema）
2. 点 "+ 新建模板" → Dialog 打开
3. 粘贴 YAML，填 template_id = `my-indie-team`，user_role = `Founder`
4. 点"导入" → 后端验证通过 → 关闭 Dialog
5. 立即在模板列表（TemplatesPage 或 Switcher，看哪个落地了）看到 "My Indie Team" + 紫色/自定义 theme_color 图标
6. 新建群聊时可选该模板 → Recursive 成立

### References

- [Source: epics-addendum-2026-04-16.md#Story 3.6.8]（原始 Story 定义，line 258-281）
- [Source: epics-addendum-2026-04-16.md#Data Model 补丁]（Template interface，line 324-339）
- [Source: sprint-change-proposal-2026-04-16.md#Section 4.1]（MVP 降级授权）
- [Source: shadowflow/highlevel.py] WorkflowTemplateSpec 完整定义（Story 3.6.7 扩展后的最终形态）
- [Source: shadowflow/server.py:79-247] FastAPI 端点现有约定（无 /api 前缀）
- [Source: templates/solo-company.yaml] seed 模板实例，可作为 Dialog 内 placeholder / 示例
- [Source: src/common/types/template.ts] 前端 TS 类型（3.6.7 已建，本 Story 直接 import）
- [Source: _bmad-output/implementation-artifacts/3-6-7-模板-yaml-schema-扩展-6-种子模板改造.md] 前序 Story 的 schema 扩展与决策背景
- [Source: memory://architecture_decisions.md] 递归组合原则（2026-04-20 用户对齐）
- [Source: memory://project_pencil_design_language.md] 深色 #0D1117 + 圆角 14px + 紫色 accent

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

7/7 new API tests pass. 547/547 non-smoke Python tests pass (no regressions).

### Completion Notes List

- T1/T2/T3/T4 (AC1–AC3): TemplateRegistry helpers `_list_templates()` + `_get_template()` inline in `server.py`. Three endpoints: `POST /templates/custom` (parse YAML → apply overrides → validate → 409/422/200), `GET /templates` (TemplateListItem projection), `GET /templates/{id}` (full model_dump + source). No `/api/` prefix — follows existing server.py convention.
- T5 (AC7): `.gitignore` appended `templates/custom/`. `os.makedirs(_CUSTOM_DIR, exist_ok=True)` called on first import.
- Security: template_id validated against `^[a-z0-9-]{3,40}$`; path traversal prevented by resolving path parent == `templates/custom`.
- T6 (AC5): `src/api/templates.ts` — typed `listTemplates()`, `getTemplate()`, `importCustomTemplate()` with `TemplateApiError`, `TemplateConflictError`, `TemplateValidationError` typed error classes.
- T7 (AC4+AC6): `src/core/components/Template/ImportTemplateDialog.tsx` — textarea + file upload, template_id/user_role overrides, "导入" button with spinner, structured error display for 422/409, disabled "+ 加入企业" placeholder (AC6), dark `#0D1117` + 14px border-radius + purple `#A78BFA` accent.
- T8 (AC5): `src/App.tsx` — "+ 新建模板" button in top-nav right (purple accent, fallback path per story spec since Stories 7.1/6.3 not yet landed). `ImportTemplateDialog` rendered at root.
- T9 (AC8): `tests/test_template_custom_api.py` — 7 test cases, no mocking, autouse fixture teardown for created custom template files.

### File List

- shadowflow/server.py (updated — TemplateRegistry helper + 3 endpoints + new imports)
- .gitignore (updated — templates/custom/)
- src/api/templates.ts (new)
- src/core/components/Template/ImportTemplateDialog.tsx (new)
- src/App.tsx (updated — import + state + button + dialog render)
- tests/test_template_custom_api.py (new — 7 tests)

## Code Review Findings (2026-04-22)

### Review Mode: direct analysis
### Decisions Applied

| ID | Finding | Decision |
|----|---------|---------|
| P2-α | `_handleResponse` 422 分支: 直接把 FastAPI 响应体 `{"detail": [...]}` 传给 `TemplateValidationError`，Dialog 侧 `e.errors[0].loc` 为 `undefined` → TypeError (crash) | **Fixed** — 提取 `body?.detail` 再构建 errors 数组 |
| P2-β | `_handleResponse` 409 分支: 直接把 `{"detail": {...}}` 传给 `TemplateConflictError`，`conflictDetail.existing_source` 为 `undefined` → 冲突提示缺源类型信息 | **Fixed** — 提取 `body?.detail ?? body` 传入构造函数 |
| P3-α | `ImportTemplateDialog.tsx` 缺少 Esc 键关闭处理 (仅 overlay click 可关闭)，小 UX 缺口 | **Deferred (P3-α=d)** — 不影响 AC 通过；列入 V2 polish backlog |
| D1 | Playwright E2E spec 未交付（Story T9 范围内）| **Deferred (D1=d)** — 与 Story 3-5/3-6 E2E 同步延后，评审方接受 |

### Patches Applied (1 file)

- [x] `src/api/templates.ts` — `_handleResponse`: 409 提取 `body?.detail ?? body`（P2-β）；422 提取 `body?.detail ?? body` 后展开为 PydanticValidationError 数组（P2-α）

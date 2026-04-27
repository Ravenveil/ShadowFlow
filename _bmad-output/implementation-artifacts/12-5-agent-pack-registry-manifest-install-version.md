# Story 12.5: Agent Pack Registry — Manifest · Install · Version · Signature

Status: ready-for-dev

## Story

As a **ShadowFlow 平台用户**,
I want **像在 VSCode 里安装语言扩展一样，从 Agent Registry 浏览、安装、更新官方及社区 Agent Pack**,
so that **不用自己从零配置，直接"一键装包"就能获得一个具备预设能力的 Agent，且平台对包的来源和版本负责**。

## 背景

**VSCode 类比（这是本 Story 的核心参照系）**

| VSCode | ShadowFlow 对应 | 本 Story 实现 |
|--------|----------------|--------------|
| `package.json`（扩展清单）| `agent-manifest.yaml` | ✅ AC1 — 格式定义 + Pydantic 模型 |
| Extension Gallery 后端 | Agent Registry 后端 | ✅ AC2 — 存储结构 + 内置 Pack |
| `ext install <id>` | `POST /api/agents/registry/install` | ✅ AC3 — 安装接口 |
| Semver 版本管理 | Pack semver + 更新检测 | ✅ AC4 — 版本比较逻辑 |
| 扩展签名验证 | manifest HMAC-SHA256 校验 | ✅ AC5 — 签名验证 |
| 已安装扩展列表 | Installed Pack 查询 | ✅ AC6 — 已安装接口 |
| Marketplace 浏览 | `GET /api/agents/registry/packs` | ✅ AC7 — 列表 + 过滤 |

**依赖关系**：
- Story 12.1 AC6（语言包模式 UI）依赖本 Story 的 Registry 后端
- Story 8.7（Catalog 浏览/Fork）复用 `GET /catalog/apps`，本 Story 的 Registry 是"可安装的规范化 Pack"这一层，与 Catalog 是不同抽象：
  - Catalog = 用户自己发布的 App（已有）
  - Registry = 平台 / 社区发布的可安装 Pack（本 Story 新增）
- **无 DB 约束**：存储方案与 `templates/` 保持同级复杂度（YAML + JSON 文件系统），不引入新数据库依赖

**实现后的用户流程**：
```
CreateAgentModal 「从 Catalog 安装」Tab
  → GET /api/agents/registry/packs          # 拉列表
  → 用户点「安装」
  → POST /api/agents/registry/install       # 装包
  → 后端验签 → 创建 AgentBlueprint          # source=catalog
  → 前端 AgentCard 显示 catalog 来源图标
```

---

## Acceptance Criteria

### AC1 — agent-manifest.yaml 格式定义（VSCode package.json 对应）

**Given** 需要描述一个可安装的 Agent Pack  
**When** 开发者/平台方创建 Pack  
**Then** 必须提供符合以下格式的 `agent-manifest.yaml`：

```yaml
# agent-manifest.yaml 最小可用示例
id: "hermes-coding-agent"          # 全局唯一，kebab-case
version: "1.2.0"                   # semver，必填
name: "Hermes Coding Agent"        # 展示名
description: "擅长代码搜索、调试与重构的编程助手"
author: "ShadowFlow Official"

# Agent 默认配置（安装时写入 AgentBlueprint）
soul: "你是一名严谨的编程助手，擅长代码搜索、调试、测试编写与重构..."
kind: "acp"                        # api | cli | mcp | acp
capabilities:
  tools: ["shadowflow-shell", "shadowflow-fs", "shadowflow-web"]
  llm_provider: "claude"
  streaming: true
  approval_required: false

# 可选安装钩子
install_cmd: null                  # 若非 null，安装时执行（如 `pip install hermes-agent`）

# 平台签名（官方 Pack 必填，社区 Pack 可缺省降级为 unverified）
signature:
  algorithm: "HMAC-SHA256"
  value: "<hex>"                   # 签名值：HMAC-SHA256(canonical_yaml_body, SHADOWFLOW_PACK_SECRET)
```

**And** 后端对应 Pydantic 模型定义在 `shadowflow/contracts/agent_manifest.py`：

```python
class ManifestCapabilities(BaseModel):
    tools: list[str] = ["shadowflow-shell", "shadowflow-fs", "shadowflow-web"]
    llm_provider: str = "claude"
    streaming: bool = False
    approval_required: bool = False
    session_resume: bool = False
    tool_calls: bool = False

class ManifestSignature(BaseModel):
    algorithm: Literal["HMAC-SHA256"] = "HMAC-SHA256"
    value: str

class AgentPackManifest(BaseModel):
    id: str                        # kebab-case，唯一
    version: str                   # semver
    name: str
    description: str
    author: str
    soul: str
    kind: Literal["api", "cli", "mcp", "acp"]
    capabilities: ManifestCapabilities = ManifestCapabilities()
    install_cmd: str | None = None
    signature: ManifestSignature | None = None  # None → unverified Pack
```

**And** 格式校验失败时返回 `400 Bad Request`，body 含字段级别错误信息

---

### AC2 — Registry 存储结构（内置官方 Pack）

**Given** ShadowFlow 启动  
**When** Registry 路由初始化  
**Then** 能从 `templates/agent-packs/` 目录读取内置 Pack 列表（目录结构如下）：

```
templates/agent-packs/
  registry-index.yaml          # Pack 索引，列出所有可用 Pack 的 id + 路径
  hermes-coding-agent/
    agent-manifest.yaml        # 符合 AC1 格式
  openclaw-research-agent/
    agent-manifest.yaml
  shadowsoul-writer/
    agent-manifest.yaml
  shadowsoul-reviewer/
    agent-manifest.yaml
   0g-compute-analyst/
    agent-manifest.yaml
```

**And** `registry-index.yaml` 格式：
```yaml
packs:
  - id: "hermes-coding-agent"
    path: "hermes-coding-agent/agent-manifest.yaml"
    tags: ["coding", "debug", "acp"]
  - id: "openclaw-research-agent"
    path: "openclaw-research-agent/agent-manifest.yaml"
    tags: ["research", "web", "cli"]
  # ...
```

**And** Registry 启动时加载索引到内存（`RegistryService` 单例），不每次请求都读磁盘  
**And** 内置 ≥ 5 个官方 Pack，每个都有完整的 `agent-manifest.yaml`

---

### AC3 — POST /api/agents/registry/install（安装接口，ext install 对应）

**Given** 用户在 「从 Catalog 安装」Tab 点击「安装」  
**When** 前端调用 `POST /api/agents/registry/install`  
**Then** 请求体为：
```json
{ "pack_id": "hermes-coding-agent", "workspace_id": "default" }
```

**And** 后端按以下顺序执行（失败时立即返回对应错误码）：

| 步骤 | 操作 | 失败返回 |
|------|------|---------|
| 1 | 从 Registry 查找 Pack | `404 Pack not found` |
| 2 | 验证 manifest 签名（见 AC5）| `400 Signature invalid` |
| 3 | 检查是否已安装相同版本 | `200 { already_installed: true }` 直接返回 |
| 4 | 运行 `install_cmd`（若非 null）| `500 install_cmd failed: <stderr>` |
| 5 | 创建 `AgentBlueprint`，填充 Pack 默认值 | `500 Blueprint creation failed` |
| 6 | 写入 `installed-packs.json`（workspace 维度）| `500 Persistence failed` |

**And** 成功响应 `201`：
```json
{
  "data": {
    "agent_id": "<uuid>",
    "pack_id": "hermes-coding-agent",
    "pack_version": "1.2.0",
    "blueprint": { "..." },
    "installed_at": "2026-04-27T01:47:00Z"
  },
  "meta": { "warnings": [], "deprecations": [] }
}
```

**And** 创建的 `AgentBlueprint` 含来源标记：
```python
metadata = {
    "source": "catalog",
    "pack_id": "hermes-coding-agent",
    "pack_version": "1.2.0"
}
```

---

### AC4 — 版本管理（semver + 更新检测）

**Given** 用户已安装某个 Pack  
**When** Registry 中该 Pack 有新版本  
**Then** `GET /api/agents/registry/packs` 返回的 Pack 条目状态为 `"has_update"`

**And** 状态枚举逻辑：
```python
def get_install_status(pack_id: str, registry_version: str, workspace_id: str) -> str:
    installed = get_installed_version(pack_id, workspace_id)
    if installed is None:
        return "not_installed"
    if parse_semver(registry_version) > parse_semver(installed):
        return "has_update"
    return "installed"
```

**And** 版本比较使用 `packaging.version.Version`（Python 标准 semver 解析，无需额外安装）  
**And** 「有更新」时 UI 按钮文案变为「更新」，点击重新调用 `POST /api/agents/registry/install`（覆盖安装）  
**And** `installed-packs.json` 存储格式：
```json
{
  "workspace_id": "default",
  "installed": [
    {
      "pack_id": "hermes-coding-agent",
      "pack_version": "1.2.0",
      "agent_id": "<uuid>",
      "installed_at": "2026-04-27T01:47:00Z"
    }
  ]
}
```

---

### AC5 — manifest 签名验证（VSCode 扩展签名对应）

**Given** 安装一个带 `signature` 字段的 Pack  
**When** 后端执行安装  
**Then** 按以下逻辑验证签名：

```python
import hmac, hashlib, yaml

def verify_manifest_signature(manifest: AgentPackManifest) -> bool:
    if manifest.signature is None:
        # 无签名 Pack → 降级为 unverified，允许安装但 AgentCard 显示「未验证」角标
        return True  # 不拒绝，但记录 verified=False

    secret = os.environ["SHADOWFLOW_PACK_SECRET"].encode()
    # 规范化：排除 signature 字段后序列化
    body = manifest.model_dump(exclude={"signature"})
    canonical = yaml.dump(body, sort_keys=True, allow_unicode=True).encode()
    expected = hmac.new(secret, canonical, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, manifest.signature.value)
```

**And** `SHADOWFLOW_PACK_SECRET` 从 `.env` 读取，不硬编码  
**And** 内置官方 Pack 全部预签名（使用开发环境 secret，CI 中验证通过）  
**And** 签名验证失败返回 `400 { "error": "manifest_signature_invalid", "pack_id": "..." }`  
**And** 无签名 Pack（社区 Pack）允许安装，但：
- `AgentBlueprint.metadata.verified = False`
- AgentCard 来源图标显示「⚠ 未验证」而非「官方认证」

---

### AC6 — GET /api/agents/registry/installed（已安装列表）

**Given** 用户进入 AgentPage  
**When** 需要展示哪些 Agent 来自 Registry  
**Then** `GET /api/agents/registry/installed?workspace_id=default` 返回：

```json
{
  "data": [
    {
      "pack_id": "hermes-coding-agent",
      "pack_version": "1.2.0",
      "agent_id": "<uuid>",
      "name": "Hermes Coding Agent",
      "installed_at": "2026-04-27T01:47:00Z",
      "update_available": false,
      "verified": true
    }
  ],
  "meta": { "total": 1 }
}
```

---

### AC7 — GET /api/agents/registry/packs（Pack 列表 + 过滤）

**Given** 用户打开「从 Catalog 安装」Tab  
**When** Tab 加载  
**Then** 前端调用 `GET /api/agents/registry/packs?workspace_id=default` 返回：

```json
{
  "data": [
    {
      "id": "hermes-coding-agent",
      "version": "1.2.0",
      "name": "Hermes Coding Agent",
      "description": "擅长代码搜索、调试与重构的编程助手",
      "author": "ShadowFlow Official",
      "tags": ["coding", "debug", "acp"],
      "capabilities_summary": ["shell", "code_search", "web_fetch"],
      "install_status": "not_installed",  // "not_installed" | "installed" | "has_update"
      "verified": true
    }
  ],
  "meta": { "total": 5 }
}
```

**And** 支持 `?tags=coding` 过滤  
**And** 支持 `?q=hermes` 关键词搜索（在 name + description 中匹配）  
**And** `install_status` 由后端计算（对比 `installed-packs.json`），前端不自己算

---

### AC8 — 联通 Story 12.1 AC6 UI（验收确认）

**Given** Story 12.1 的 CreateAgentModal「从 Catalog 安装」Tab 已存在（或本 Story 随 Backend 一起实现）  
**When** Tab 内容加载  
**Then** 数据来自 `GET /api/agents/registry/packs`，非 mock  
**And** 安装成功后 AgentCard 右上角来源图标：
- `verified=true` → 显示蓝色盾牌 🛡 「ShadowFlow 官方」
- `verified=false` → 显示黄色 ⚠ 「社区 Pack，未验证」
- 非 Catalog 来源（自建）→ 无图标

---

## 技术指引

### 新建 / 修改文件

**后端**：
- `shadowflow/contracts/agent_manifest.py` — 新建，`AgentPackManifest` 等模型
- `shadowflow/api/registry.py` — 新建，APIRouter prefix="/api/agents/registry"
- `shadowflow/services/registry_service.py` — 新建，`RegistryService` 单例（加载 + 缓存 + 安装逻辑）
- `shadowflow/server.py` — 修改，`include_router(registry_router)`
- `templates/agent-packs/` — 新建目录 + 5 个官方 Pack + `registry-index.yaml`
- `tests/api/test_registry.py` — 新建

**前端**（Story 12.1 AC6 UI 联通，如果该 Story 尚未实现则一并完成）：
- `src/components/agent/CatalogInstallTab.tsx` — 新建，「从 Catalog 安装」Tab 内容
- `src/api/registry.ts` — 新建，前端 API 调用封装

### 关键约束

1. **Router 注册**：`server.py` 中 `include_router` 的顺序参考现有代码（第 196-204 行），新 router 加到末尾
2. **响应信封**：统一使用 `_ok(data, meta)` 辅助函数（参考 `builder.py` 第 34-35 行）
3. **无 DB**：`installed-packs.json` 存于 `templates/agent-packs/installed/` 下按 workspace_id 分文件，不引入 SQLite
4. **SHADOWFLOW_PACK_SECRET**：`.env.example` 新增此环境变量，值为 `"dev-secret-change-in-prod"`
5. **packaging 包**：`packaging.version.Version` 已是 pip 标准包，项目现有 `pyproject.toml` 中应已包含（若无则加入）
6. **AgentCapabilities 复用**：签名验证后的能力字段通过 `ManifestCapabilities → AgentCapabilities` 映射，不重新定义能力枚举

### 现有代码参考

- `shadowflow/runtime/contracts.py` — `AgentCapabilities` 定义，manifest 能力字段与之对齐
- `shadowflow/api/builder.py` — `_ok()` 辅助函数、`APIRouter` 注册模式
- `shadowflow/runtime/executors.py` — `AgentExecutor.kind` 枚举值约束
- `templates/` 目录 — 文件持久化模式参考（YAML 读取方式）
- `docs/AGENT_PLUGIN_CONTRACT.md` — `kind` 字段四种值的语义定义
- Story 12.1 `_bmad-output/implementation-artifacts/12-1-quick-agent-create-快速创建agent.md` AC6 — UI 侧约定，本 Story 后端必须与之精确对接
- Story 8.7 `_bmad-output/implementation-artifacts/8-7-agent-catalog-已发布浏览-fork.md` — Catalog 已有的文件持久化方案和响应格式，保持风格一致

### 内置官方 Pack 清单（AC2 需创建）

| id | kind | soul 摘要 | 能力标签 |
|----|------|----------|---------|
| `hermes-coding-agent` | acp | 编程助手，代码搜索/调试/重构 | shell, fs, web |
| `openclaw-research-agent` | cli | 研究助手，网络搜索/文献总结 | web, fs |
| `shadowsoul-writer` | api | 写作助手，内容生成/润色 | (无工具) |
| `shadowsoul-reviewer` | api | 代码审查助手，安全/质量分析 | fs |
| `0g-compute-analyst` | acp | 0G 链上数据分析，调用 0G Compute | shell, web |

---

## DoD

- [ ] `shadowflow/contracts/agent_manifest.py` 新建，`AgentPackManifest` pydantic 校验通过
- [ ] `templates/agent-packs/` 目录含 ≥ 5 个官方 Pack，每个 manifest 签名可验通过
- [ ] `GET /api/agents/registry/packs` 返回内置 Pack 列表，含正确 `install_status`
- [ ] `POST /api/agents/registry/install` 完成验签 → 创建 Blueprint → 写 installed-packs.json 全流程
- [ ] 重复安装相同版本时返回 `already_installed: true`（不报错、不重复创建）
- [ ] semver 更新检测逻辑正确（`1.2.0 > 1.1.0` 判断通过）
- [ ] 无签名 Pack 安装后 `metadata.verified=false`，签名无效直接 `400`
- [ ] `GET /api/agents/registry/installed` 返回已安装列表，含 `update_available` 字段
- [ ] pytest 全绿（安装、版本比较、签名验证、列表过滤覆盖）
- [ ] `.env.example` 新增 `SHADOWFLOW_PACK_SECRET=dev-secret-change-in-prod`
- [ ] 浏览器验证：CreateAgentModal「从 Catalog 安装」Tab 能加载列表并完成一次安装

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

- `shadowflow/contracts/agent_manifest.py` — 新建
- `shadowflow/api/registry.py` — 新建
- `shadowflow/services/registry_service.py` — 新建
- `shadowflow/server.py` — 修改（include_router）
- `templates/agent-packs/registry-index.yaml` — 新建
- `templates/agent-packs/hermes-coding-agent/agent-manifest.yaml` — 新建
- `templates/agent-packs/openclaw-research-agent/agent-manifest.yaml` — 新建
- `templates/agent-packs/shadowsoul-writer/agent-manifest.yaml` — 新建
- `templates/agent-packs/shadowsoul-reviewer/agent-manifest.yaml` — 新建
- `templates/agent-packs/0g-compute-analyst/agent-manifest.yaml` — 新建
- `src/components/agent/CatalogInstallTab.tsx` — 新建（AC8 UI 联通）
- `src/api/registry.ts` — 新建
- `tests/api/test_registry.py` — 新建
- `.env.example` — 修改（新增 SHADOWFLOW_PACK_SECRET）

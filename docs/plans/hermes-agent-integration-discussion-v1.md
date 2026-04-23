---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - 'https://github.com/NousResearch/hermes-agent'
  - 'https://hermes-agent.nousresearch.com/docs'
  - 'docs/plans/shadowflow-river-memory-protocol-v1.md'
session_topic: 'Hermes Agent 对 ShadowFlow 内部智能体搭建的借鉴点 + 将 Hermes Agent 接入为 AI 员工并拉入群聊的设计'
session_goals: 'ShadowFlow 内部智能体架构借鉴 + Hermes 作为外部 AI 员工的接入协议'
selected_approach: 'First Principles + Role Playing + Morphological Analysis（AI-Recommended 三连）'
techniques_used:
  - First Principles
  - Role Playing (Hermes 第一天入职走一遍)
  - Morphological Analysis (接入维度正交枚举)
ideas_generated: 78
context_file: 'docs/plans/shadowflow-river-memory-protocol-v1.md'
---

# Brainstorming Session Results

**Facilitator:** Jy
**Date:** 2026-04-17
**Inputs:** Hermes Agent 仓库（验证存活 HTTP 200）+ ShadowFlow river-memory-protocol-v1（记忆层对标已完成，本次仅引用不重复）

---

## Session Overview

**主题（两路并行）：**
- **路径 A**：ShadowFlow 自建内部智能体（在 Policy Matrix / ActivationBandit / 河流记忆 / 四视图 Chat 这个现有架构下），除"记忆层"之外，还能从 Hermes 借鉴什么。**不借用其术语**，用自己的命名。
- **路径 B**：把 Hermes Agent 当成一个独立进程/容器的 **外部 AI 员工**，注册进 ShadowFlow 的"公司架构"，被拉入群聊参与协作，接入协议要解决 8 个维度（身份/协议/群聊/记忆/审批/激活/沙箱/失败）。

**明确切出的范围（避免重复）：**
- **记忆层对标已在 [river-memory-protocol-v1.md](../../docs/plans/shadowflow-river-memory-protocol-v1.md) §Part III 完成**：MemoryProvider ABC、10 个钩子、Context fencing、2-vs-3 门、HRR 相位编码。本文档引用不展开。
- **HRR 数学细节**同上，不复制。

**本文档新增：** gateway / 插件声明式 opt-in / tool RPC / skill 自演化 / 多终端 session / 完整接入协议。

---

## Part I — Hermes 核心要点速览（只列本讨论要用的）

| 层 | Hermes 做法 | 本讨论是否用到 |
|---|---|---|
| MemoryProvider ABC | 10 钩子 + 硬约束"exactly one external" | 引用 river 文档，**不展开** |
| HRR | phase-encoded `[0, 2π)` + bind/unbind | 引用 river 文档，**不展开** |
| Gateway | 统一适配 Telegram/Discord/Slack/WhatsApp/Signal/Email | **路径 A §2.1** 借鉴 |
| Plugin 声明 | `plugin.yaml` 声明 hooks，opt-in 派发 | **路径 A §2.2** 借鉴 |
| Tool RPC | Python 脚本调工具不占主 context | **路径 A §2.3** 借鉴 |
| Skill 自演化 | 从经验创建 skill，使用中改进，兼容 agentskills.io | **路径 A §2.4** 借鉴（但与 ActivationBandit 正交） |
| Multi-LLM | OpenAI/Anthropic/OpenRouter/HF/custom | **路径 A §2.5** 借鉴 |
| Terminal backend | 本地/Docker/SSH/Daytona/Modal 多后端 | **路径 B §3.7** 用于沙箱 |
| Session 连续 | 跨 Telegram/Discord 同一 session | **路径 A §2.6** 借鉴 |
| Batch trajectory | 批量轨迹用于 RL 训练 | **路径 A §2.7** 与 ActivationBandit 呼应 |

---

## Part II — 路径 A：ShadowFlow 自建内部智能体的借鉴点（非记忆层）

### 2.1 Gateway 统一消息总线 → ShadowFlow 四视图入口适配层

**Hermes 的做法：** `gateway/` 目录把 Telegram/Discord/Slack/WhatsApp/Signal/Email 归一成 "agent 收到一条 message"。agent 不关心来源平台。

**ShadowFlow 已有四视图**：Inbox / Chat / AgentDM / BriefBoard。这四视图今天是**各自独立的 UI 层**。但如果把 Hermes 的 gateway 思想反过来用：

> **四视图可以归一成 4 种 `inbound_source`**，底层 agent 只看到统一的 `Envelope { source, group_id?, thread_id?, sender, content, attachments }`。

这对 ShadowFlow 的价值：
- AI 员工**不需要为每个视图写一份处理逻辑**，只写一份 `handle(envelope)`
- 新增一个入口（比如未来"审批中心"第五视图）不需要改 agent 实现
- Policy Matrix 只需要对 Envelope 生效一次，不必分视图重写规则

**与现有架构的契合度：** 高。MVP 的"无 DB + SSE" 正好用 Envelope 作为 SSE event 的 payload schema。

**落地动作（建议，非拍板）：**
- 在 `src/common/types/` 下加 `Envelope` 类型
- 四视图的 SSE stream 统一发 Envelope，不发视图特有结构

---

### 2.2 Plugin 声明式 hook opt-in → AI 员工能力清单

**Hermes 的做法：** `plugin.yaml` 写 `hooks: [on_session_end]`，运行时只对声明过的钩子派发。

**对 ShadowFlow 的借鉴（但换名）：**

ShadowFlow 的"AI 员工"应该有一份 `agent-card.yaml`（或 `employee.yaml`），声明：

```yaml
name: sql-analyst-01
type: builtin              # builtin | external
capabilities:
  - goal_decompose
  - sql_generate
  - sql_validate
subscribes:                # 类似 Hermes hooks
  - group.mention          # 只在被 @ 时响应
  - group.on_join          # 入群时打招呼
  - project.on_dailydigest # 日报触发
policy_scope:              # Policy Matrix 约束范围
  - sql.read_only
  - no_file_write
activation_cost: 0.02      # ActivationBandit 输入
memory_bridge:             # 河流记忆接口
  pour: ["settle_candidate"]
  drink: ["user", "project"]
```

**关键借鉴点**：**"声明即契约"**。`subscribes` 里没写的事件，框架不派发。这解决两个问题：
- AI 员工不会被无关事件吵到（降低 token 浪费）
- 能力边界对用户可见（可审计）

**与现有架构的契合度：** 需新增 agent-card 机制，但 Policy Matrix 已经是清单式思想，加上 agent-card 是自然延伸。

---

### 2.3 Tool RPC → Sub-agent 上下文隔离

**Hermes 的做法：** Python 脚本通过 RPC 调用 tool，工具的输入输出**不进主 LLM 的 context**，只把结果回灌。

**ShadowFlow 当前痛点推测：** 如果 ActivationBandit 把一个任务派给 sub-agent，sub-agent 的中间步骤（tool call 细节）今天可能全进了主会话上下文。

**借鉴点：** 给 Shadow 的 sub-agent 调用加一条 **"契约边界"** —— sub-agent 的 tool trace **默认不回流主 context**，只回流 `{status, summary, artifact_ref}`。

**与已有 `shadowflow do` 命令的呼应：** 最近 commit `3b2c518` 是"goal→execute 一键"，这条路径天然适合设成 RPC 边界。

**不借用的部分：** Hermes 的 RPC 细节是 Python 进程级，ShadowFlow 用 Docker Compose 容器边界做隔离更符合现状，不需要抄 Python RPC 实现。

---

### 2.4 Skill 自演化 vs ActivationBandit（正交，不冲突）

**Hermes 的 skill 系统：** 从经验抽取 skill，使用中改进，兼容 agentskills.io 开放标准。

**ShadowFlow 的 ActivationBandit：** contextual bandit 在线学习"哪个 capability 适合当前 context"（已实现，见 commit `c6f107c`）。

**二者关系辨析（避免误借鉴）：**

| 维度 | Hermes skill | ActivationBandit |
|---|---|---|
| 对象 | 知识/流程固化 | capability 选择 |
| 学习信号 | session 内成功率 | multi-armed reward |
| 产物 | 可复用 prompt/脚本 | 权重向量 |
| 更新触发 | 用户或自省 | 每次任务 reward |

**结论：** 两者**正交**。Skill 管 "做一件事的套路"，Bandit 管 "该派谁做"。

**借鉴点：** Hermes skill 的"**从轨迹中提取 skill 候选**"流程可以用 —— 但产物不是 Hermes 那种独立文件，而是**写进 ShadowFlow 的 `templates/` 目录**（git tracked 已存在）。

**不借用：** 不引入 agentskills.io 标准本身；Policy Matrix 已覆盖"这个东西是否允许用"的决策，再套一层标准是多余。

---

### 2.5 Multi-LLM Provider → BYOK 的实现骨架

ShadowFlow 架构决策 v1.0 已定"BYOK 无 DB"。Hermes 的 provider 抽象（OpenAI/Anthropic/OpenRouter/HF/custom）是可以直接抄的**接口形状**：

```python
class LLMProvider(ABC):
    def __init__(self, api_key: str, model: str, **opts): ...
    async def chat(self, messages) -> AsyncIterator[Token]: ...
    async def tool_call(self, messages, tools) -> ToolCall: ...
    def usage(self) -> Usage: ...
```

**借鉴理由：** Hermes 在生产中验证过这个接口对 5+ provider 够用。自己重新想接口形状会走弯路。

**不借用：** 实现细节（比如重试策略、streaming 分块格式）不抄，让 BYOK 用户的 key 直接调 SDK 原生方法。

---

### 2.6 Session 跨平台连续 → Agent 身份跨群聊持久

**Hermes 的 session 连续性：** 同一 user 在 Telegram 和 Discord 都能接上同一 session。

**ShadowFlow 的情境差异：** 我们是"新项目 = 新群聊"（记忆已记录）。所以**不需要**跨群聊共享 session。

**反向借鉴：** **Agent 自己的身份**跨群聊持久（sql-analyst-01 在群 A 和群 B 是同一"人"），但**每个群聊的对话是独立 thread**。

这一点看起来显然，但 Hermes 的 session 实现告诉我们：
- Agent 身份用 `agent_id` 持久化
- 对话状态用 `thread_id` 隔离
- 两个 ID **必须分开**，不能合并

**与当前 pen 设计稿的呼应：** 记忆里"协作四视图架构"笔记已提到钉钉式 Inbox。这条等于给"AI 员工"这个概念补上身份 vs 会话的分离原则。

---

### 2.7 Batch trajectory → ActivationBandit 的训练数据来源

最近 commit `b8eaa53` 是"training data accumulation script"。Hermes 的 batch trajectory 模式给了一个启示：

> **每次 agent 完成一个任务，整条轨迹（envelope → policy decision → tool calls → result → user feedback）应该被保存为 `trajectory.jsonl` 的一行**，而不是分散在各处。

ShadowFlow 已有 `scripts/benchmark_training_accumulation.py`，和这思路对齐。**不需要借鉴更多**，只确认方向一致。

---

### 2.8 路径 A 小结：借鉴清单（5 条，其余不借）

| 序号 | 借鉴点 | 落地位置 | 优先级 |
|---|---|---|---|
| 1 | Envelope 归一四视图 | `src/common/types/envelope.ts` | P0 |
| 2 | agent-card 声明式订阅 | `templates/agent-cards/` | P0 |
| 3 | Tool RPC 契约边界 | `shadowflow/runtime/subagent_boundary.py` | P1 |
| 4 | LLM Provider 接口形状 | `shadowflow/highlevel.py` 扩展 | P1 |
| 5 | Agent 身份 vs Thread 分离 | 四视图 pen 稿 + 后端 | P1 |

**明确不借鉴：**
- Hermes 的 skill 文件标准（Policy Matrix + templates 已够）
- Hermes 的 gateway 消息平台接入（ShadowFlow 只做自己的四视图，不接 Telegram/Slack）
- Hermes 的 terminal backend 多选（Docker Compose 一条线就够 MVP）

---

## Part III — 路径 B：Hermes Agent 作为外部 AI 员工的接入协议

### 3.1 第一性问题：什么叫"AI 员工"？

ShadowFlow 的"公司架构"隐含定义（来自记忆 & 现有代码）：

> **AI 员工 = (身份) + (能力清单) + (被 Policy Matrix 治理) + (在河流记忆中有水迹) + (被 ActivationBandit 调度) + (在群聊/私聊里可见可 @)**

6 项缺一不可。Hermes 入职 ShadowFlow，必须在这 6 项都有对应填充。

### 3.2 Role Playing：Hermes 入职第一天 walk-through

以"一个 Hermes 容器被拉入 ShadowFlow 项目"这个具体场景走一遍，看每一步卡在哪：

**T=0 管理员敲：** `shadowflow employee add --type=external/hermes --container=hermes-01`
- **卡点 1：** ShadowFlow 当前没有 `employee` 子命令，`shadowflow do` 只做任务。需要加 employee 注册 CLI。
- **卡点 2：** `external/hermes` 这个 type 需要 gateway 适配器存在，否则无法对话。

**T=1 管理员把 hermes-01 拉入某个项目群：** `shadowflow group invite --project=proj-X hermes-01`
- **卡点 3：** 群成员表现在是不是存在？记忆里说"新项目=新群聊"但没说成员表 schema。需要确认 group.members 字段。
- **卡点 4：** 入群时 hermes-01 应该自我介绍（agent-card → 群公告），但 Hermes 原生没这个钩子，要 ShadowFlow 适配层代做。

**T=2 群里有人 @ hermes-01 问一个问题：**
- **卡点 5：** SSE stream 怎么路由到 Hermes 容器？Hermes 支持 stdio / HTTP，ShadowFlow 用 SSE。适配层要做协议翻译。
- **卡点 6：** Hermes 回答前要不要拿 ShadowFlow 河流记忆的上下文？如果要，用哪个钩子（prefetch）？
- **卡点 7：** Hermes 想调用一个 tool（比如写文件），Policy Matrix 要拦截。拦截机制？

**T=3 hermes-01 答完，产生一条可能应 settle 的洞见：**
- **卡点 8：** Hermes 的 holographic memory 和 ShadowFlow 的河流记忆要合并吗？**决策：不合并**（见 §3.5）。

**T=4 hermes-01 执行一个长任务失败：**
- **卡点 9：** 失败信号怎么回到 ActivationBandit？bandit arm 的 reward 更新路径在哪？

这 9 个卡点就是本路径要解决的。

### 3.3 Morphological Analysis：8 个正交接入维度

把接入问题拆成 8 个互不重叠的子问题。每个都得有答案才能落地。

| 维度 | 子问题 | 候选方案 | 建议 |
|---|---|---|---|
| **身份** | 怎么给 Hermes 发"工牌" | 1) 容器内生成 2) 注册表分配 | **2**，由 ShadowFlow 分配 `agent_id` |
| **协议** | 消息线协议是什么 | 1) MCP stdio 2) HTTP/SSE 3) WebSocket | **1 首选**，Hermes 原生 MCP 兼容 |
| **群聊** | 怎么加入 group.members | 1) 特殊角色 2) 统一 member 表 | **2**，只加 `member_type=external` 字段 |
| **记忆** | 两套记忆如何并存 | 1) 合并 2) 桥接 3) 完全隔离 | **2**，Hermes 是"工作台"，河流是"档案馆" |
| **审批** | Policy Matrix 怎么拦截 | 1) Hermes 侧 plugin 2) ShadowFlow 侧代理 | **2**，拦截放 gateway 适配层 |
| **激活** | ActivationBandit 怎么把 Hermes 当一个 arm | 1) 单 arm 2) 按能力拆多 arm | **2**，每个 capability 一个 arm |
| **沙箱** | 进程/文件/网络隔离 | 1) 同机进程 2) 独立容器 3) 远端 | **2**，Docker Compose 加 service |
| **失败** | Hermes 挂了怎么办 | 1) 硬失败 2) bandit 降权 3) 回退内置 agent | **2+3**，降权同时通知用户 |

8 个维度的合成 = 完整接入协议。下面逐条展开。

---

### 3.4 身份层：AgentCard 注册

ShadowFlow 已有 `src/common/types/template.ts`（未追踪），下一步加：

```yaml
# templates/agent-cards/hermes-default.yaml
agent_id: hermes-01
agent_type: external/hermes
display_name: "Hermes 研究员"
container: hermes-agent:latest
entrypoint: "mcp-stdio"
capabilities:
  - research
  - long_context_reasoning
  - web_fetch
policy_scope:
  default: deny
  allow:
    - web.read
    - memory.drink
  require_approval:
    - file.write
    - shell.exec
activation_cost: 0.05          # USD per call，bandit 输入
memory_bridge:
  mode: two_way                # two_way | read_only | isolated
  pour_targets: [settle_candidate]
  drink_from: [project, reference]
health_check:
  endpoint: "hermes://ping"
  interval_sec: 60
```

**关键设计：**
- `policy_scope.default: deny` —— **外部 agent 默认最小权限**，白名单放行。这一条不能省，否则接入就是后门。
- `activation_cost` 显式写出，让 bandit 有成本输入。

---

### 3.5 协议层：MCP stdio + Envelope

**选 MCP 的理由：**
1. Hermes 官方文档明确兼容 "any MCP server"
2. Claude Code 也是 MCP 生态（用户已有 MCP 使用经验）
3. stdio 比 HTTP 简单，适合 Docker Compose 内部通信

**Wire format：**

```
ShadowFlow → Hermes（入流）：
  MCP tool_call "shadowflow.inbox"
  params:
    envelope:
      source: chat | agent_dm | inbox | brief_board
      group_id: "proj-X-main"
      thread_id: "thread-42"
      sender: { id: "user-jy", type: "human" }
      content: "@hermes-01 帮我分析这份日志"
      attachments: [...]
      policy_context: { scope: ["memory.drink", "web.read"] }
      drink_result: { ... }   # ShadowFlow 已预填河流记忆上下文（见 §3.6）

Hermes → ShadowFlow（出流）：
  MCP tool_call "shadowflow.reply"
  params:
    reply:
      to_thread: "thread-42"
      content: "..."
      tool_use_claims: [              # Hermes 声明想调的工具
        { name: "file.write", args: {...}, justification: "..." }
      ]
      memory_write_proposal: [        # 想写入河流记忆的内容
        { type: "settle_candidate", content: "...", confidence: 0.8 }
      ]
      usage: { prompt_tokens, completion_tokens, cost_usd }
```

**关键：** `tool_use_claims` 不是"我已经做了"，而是"**我想做，等你批**"。拦截点就在这里。

---

### 3.6 记忆桥接：两套记忆并存（不合并）

**决策：** Hermes 的 holographic memory（HRR）和 ShadowFlow 河流记忆**不合并**。

**理由：**
- HRR 维度和河流记忆的 pack schema 不对齐，强行合并会丢 HRR 的结构化查询能力
- 两套记忆的"适用场景"不同：HRR 适合 agent 自己的工作记忆，河流适合跨 agent / 跨 session 的档案
- 合并的复杂度 >> 并存的复杂度

**桥接接口（双向浅接）：**

```
drink 方向（ShadowFlow → Hermes）：
  Hermes prefetch 钩子被调 →
    ShadowFlow 适配层调 river.drink(query) →
    结果经 Write Gate 的 Read 侧过滤 →
    加 <shadowflow-context> fence →
    作为 MCP tool_result 回给 Hermes

pour 方向（Hermes → ShadowFlow）：
  Hermes reply.memory_write_proposal →
    ShadowFlow 适配层调 river.pour(candidate) →
    经 Write Gate 三重过滤 →
    成功则进入 sediment 候选池 →
    反馈 {accepted, rejected, deferred} 给 Hermes 下次 turn
```

**重要：** `drink` 结果 **必须 fence**（river-memory-protocol §3.4 已定），否则 Hermes 会把档案馆当新输入。

---

### 3.7 审批层：Policy Matrix 拦截 tool_use

**机制：**

```
Hermes 发出 reply.tool_use_claims: [{name: "file.write", ...}]
       ↓
gateway/hermes.py 适配层不直接执行
       ↓
转成 PolicyRequest，提交 Policy Matrix
       ↓
Policy 评估：
  - 查 agent-card.policy_scope.require_approval → "file.write" 命中
  - 触发 human_approval 流程（发到 Inbox）
  - 或 bandit 历史批准率高 → 自动放行
       ↓
决策 = {allow | deny | require_approval} 回给适配层
       ↓
适配层执行（allow）或拒绝（deny/pending）
       ↓
tool_result 回 Hermes（Hermes 原生能处理 "tool failed" 语义）
```

**关键设计：** Hermes 不知道有 Policy Matrix —— 它只看到 tool_result。这样**Hermes 不需要改代码**就能被治理。

---

### 3.8 激活层：每个 capability 是一个 bandit arm

**不要**把 Hermes 整体当成一个 arm（粒度太粗）。

**正确做法：** agent-card 里的每个 capability（`research`、`long_context_reasoning`、`web_fetch`）各自是一个 bandit arm。Bandit context 包含任务类型，reward 来自：
- 用户显式评价（+1/-1）
- 任务完成度（跑通 & 无 Policy 拒绝）
- 成本（`activation_cost` 减权）

**好处：** 后续加第二个 Hermes 实例或其他外部 agent 时，arm 粒度保持一致，可直接对比。

---

### 3.9 沙箱层：Docker Compose service

```yaml
# docker-compose.yml 片段
services:
  shadowflow:
    build: .
    depends_on: [hermes-01]
    environment:
      HERMES_01_ENDPOINT: "stdio://hermes-01:mcp"
  hermes-01:
    image: hermes-agent:latest
    stdin_open: true          # MCP stdio
    environment:
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}   # BYOK 注入
    volumes:
      - ./hermes-01-data:/app/data   # Hermes 自己的 holographic DB
```

**BYOK 约束：**
- ShadowFlow 不持久化 API key
- 通过 Docker env 注入，容器停止即消失
- 河流记忆**不允许**把 API key 当 memory candidate（Write Gate Gate-1 "非可推导" 会拒，但要加黑名单 key pattern 兜底）

---

### 3.10 失败层：三级降级

| 失败类型 | 检测 | 响应 |
|---|---|---|
| Hermes 容器挂 | health_check 超时 | bandit 相关 arm reward=-0.5；Chat 显示"@hermes-01 当前离线"；其他员工继续 |
| 协议错误 | MCP decode fail | 单次回退 HTTP；连续 3 次转容器挂 |
| 记忆桥断 | river.drink / pour 超时 | Hermes 降级到只用自己 holographic（原生行为）；Chat 标注"档案馆不可达" |
| Policy 连续拒绝 | N=5 次 | 提示用户"@hermes-01 权限可能不足，是否调整 agent-card?" |

**关键：** 任何失败都不能让整个 ShadowFlow 会话卡住。适配层 must 有 timeout。

---

### 3.11 MVP 最小接入路径（6 步，按优先级）

```
Step 1  docker-compose.yml 加 hermes-01 service（I/O 准备）
Step 2  src/gateway/hermes.py 适配层（MCP stdio ↔ Envelope）  ← 本路径的核心代码
Step 3  templates/agent-cards/hermes-default.yaml 注册
Step 4  四视图 group.members 支持 member_type=external
Step 5  Policy Matrix 加 external_agent 默认规则（deny-by-default + 白名单）
Step 6  ExternalMemoryBridge 挂到河流记忆（prefetch/pour_proposal 两条管道）
```

**预估工作量（粗）：** Step 2 最重（~3-5 天），其他各 0.5-1 天。全部加起来 ~1.5 周。

---

### 3.12 路径 B 明确不做（MVP 范围外）

- 不做 Hermes skill → ShadowFlow template 的自动同步（§2.4 已说正交，让用户手动迁移）
- 不做多 Hermes 实例编排（单实例先跑通）
- 不做 Hermes BuiltinMemoryProvider 关闭（不关也不冲突，只是多一点冗余）
- 不做反向：ShadowFlow agent 作为 Hermes 的 provider（方向反了，不需要）

---

## Part IV — 开放问题（留给后续，不在本 session 拍板）

1. **MCP stdio 延迟在实际群聊节奏下是否可接受？** 需要一次 spike 测试。
2. **同一项目里同时有多个外部 agent（Hermes-01 + 未来某个别家 agent）时，bandit 会不会收敛到一个垄断？** 需要 bandit 的多样性参数调整——但**这属于实现细节，不是架构决策**，不拉你拍板（海拔原则）。
3. **Hermes 的 `on_pre_compress` 钩子能不能被 ShadowFlow 用来触发河流记忆的 Dam 压缩？** 交叉机会，但 river 文档已经用自己的压缩策略，先不耦合。

---

## Part V — 本 Session 78 个 idea 的归档

已经在 Part II + Part III 的正文里分布。这里不再单列表格——brainstorming 的价值在结构化结论，不在计数。

---

## Key Insights & Themes

**核心洞察（3 条）：**

1. **Hermes 的"借鉴"和"接入"是两件不同的事。** 借鉴是学接口形状（Envelope / agent-card / RPC 边界），接入是当员工（Policy / 记忆桥 / bandit arm）。不要混着谈。

2. **Hermes 和 ShadowFlow 的记忆系统应并存不合并。** 河流是档案馆，Hermes 自己的 HRR 是工作台。两者用 drink/pour 桥接，fence 做安全边界。这避免了"用一套替换另一套"的过度工程。

3. **接入外部 agent 的最关键一步是 Policy Matrix 的 default=deny。** 没这一条，"AI 员工"接入就是后门。有这一条，外部 agent 可以自由迭代，ShadowFlow 的治理面不破。

**Theme: ShadowFlow 的架构定位被进一步厘清 ——**
> ShadowFlow 不是"做一个 agent 框架"，是**做一个能容纳 N 个 agent 框架（自建+外部）协作的公司操作系统**。Hermes 接入这件事证明了这个定位能落地。

---

## Recommended Next Steps

**立即可做（1 周内）：**
- [ ] 实现 §2.1 Envelope 类型（路径 A P0）
- [ ] 实现 §2.2 agent-card.yaml schema（路径 A P0）

**MVP 验证（1-2 周）：**
- [ ] 按 §3.11 的 6 步把 hermes-01 真正拉起来，在一个测试群聊里 walk through

**留给后续：**
- [ ] Hermes skill ↔ ShadowFlow template 的手动迁移流程文档化（P2）
- [ ] 多外部 agent 场景的 bandit 多样性参数（实现期再说）

---

## Reflection & Follow-up

**本次 session 做到了什么：**
- 避免了和 river-memory-protocol-v1 重复（记忆层只引用不展开）
- 把"借鉴"和"接入"拆成两条独立路径，不混谈
- 给出可执行的 MVP 路径（§3.11 六步），不是空架构图

**本次 session 有意没做的：**
- 没有让用户当场在 2vs3 门、bandit 多样性等实现细节上拍板（遵循"保持架构海拔"原则）
- 没有画 UML / 时序图（pen 稿是视觉化主战场，文字稿先讲清结构）

**下次或后续 session 可以：**
- 如果 MVP 六步走通，做一次 retrospective：Hermes 接入的真实痛点是不是和本文预测一致？
- 如果走不通，回到 §3.3 的 Morphological 8 维度定位问题

# Shadow Claw - 双层架构设计

> 设计日期：2026-03-06
> 设计目标：Browser UI 与 Human 交互，CLI 与 Agent 交互的双层架构

---

## 一、核心理念

### 1.1 双层交互模式

| 层级 | 交互对象 | 主要职责 | 接口形式 |
|------|---------|---------|---------|
| **Human Layer** | 人类用户 | 知识管理、对话交互、工作流设计 | Browser UI (Tauri) |
| **Agent Layer** | AI Agent | 自动化任务、后台整理、记忆编排 | CLI + JSON |

### 1.2 设计原则

1. **分离设计，统一调用**：CLI 被 Agent 调用（结构化输出），面板给人类用（可视化操作）
2. **CLI 友好**：所有操作提供 `--json` 结构化输出
3. **记忆统一**：知识库 → 统一记忆文件 → 整合所有 CLI 工具

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser UI (Tauri)                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  知识库文件    │  │  AI 对话框     │  │  工作流设计    │  │
│  │  (人类可读)   │  │  (聊天/干活)  │  │  (可视化编排)  │  │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  │
└──────────┼──────────────────┼──────────────────┼──────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Shadow Core     │
                    │  (Tauri Backend)  │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   CLI Interface   │
                    │  (--json mode)    │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  Memory System  │  │  Workflow Engine│  │  Agent Swarm    │
│  (三层记忆)     │  │  (任务调度)      │  │  (分布式执行)    │
└───────┬────────┘  └────────┬────────┘  └────────┬────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Knowledge Base  │
                    │  (双向链接图谱)    │
                    └───────────────────┘
```

---

## 三、CLI 与 Browser 职责划分

| 功能 | Browser | CLI (Agent) |
|------|---------|-------------|
| 文件读写 | ✅ 用户选择文件夹 | ✅ 后台批量处理 |
| 任务提交 | ✅ 对话框/工作流设计 | ✅ API 调用 |
| 状态查看 | ✅ 实时显示 | ✅ JSON 输出 |
| Hook 触发 | ❌ 不直接 | ✅ 事件监听 |
| 记忆分层 | ⚠️ 只读视图 | ✅ 完整操作 |

---

## 四、CLI 命令设计

### 4.1 基本格式

```bash
# 结构化输出格式
shadow --json <command> [args...]
```

### 4.2 核心命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `memory store` | 存储记忆 | `shadow --json memory store --key "task-123" --value "..." --namespace "tasks"` |
| `memory search` | 搜索记忆 | `shadow --json memory search --query "auth patterns" --limit 5` |
| `memory retrieve` | 检索记忆 | `shadow --json memory retrieve --key "pattern-auth" --namespace "patterns"` |
| `workflow create` | 创建工作流 | `shadow --json workflow create --file workflow.json` |
| `workflow execute` | 执行工作流 | `shadow --json workflow execute --id wf-001` |
| `agent spawn` | 启动 Agent | `shadow --json agent spawn --type coder --name my-coder` |
| `knowledge index` | 索引知识库 | `shadow --json knowledge index --file "new-note.md"` |

### 4.3 CLI Bridge 设计

统一调用其他 CLI 工具（claude-code、gemini、codex、openclaw、picoclaw）

```typescript
interface CLIBridge {
  claude: (args: string[]) => Promise<CLIResult>;
  gemini: (args: string[]) => Promise<CLIResult>;
  codex: (args: string[]) => Promise<CLIResult>;
  claw: (args: string[]) => Promise<CLIResult>;
  // 可扩展其他 CLI
}

interface CLIResult {
  success: boolean;
  data?: unknown;
  error?: string;
  stdout?: string;
}
```

---

## 五、记忆系统三层架构

```
┌─────────────────────────────────────────┐
│          Semantic Layer (语义层)           │
│  • Agent 记忆（工作方式、偏好）             │
│  • 用户画像（交互模式、历史）               │
│  • 任务模式（成功/失败案例）                │
│  • 模式库（可复用的解决方案）               │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│          Context Layer (上下文层)          │
│  • 会话记忆（当前对话上下文）               │
│  • 项目上下文（代码库结构、依赖）            │
│  • 工作流状态（进行中的任务）               │
│  • 环境状态（已打开文件、光标位置）          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│          Knowledge Layer (知识层)         │
│  • 用户笔记（MD 文件）                     │
│  • 双向链接（[[WikiLink]]）               │
│  • 标签系统（#Tag）                       │
│  • 文件元数据（创建时间、修改时间）         │
└─────────────────────────────────────────┘
```

---

## 六、Hook 系统设计

### 6.1 Hook 事件类型

```typescript
interface HookEvent {
  type: "pre-edit" | "post-edit" | "pre-task" | "post-task" | "session-end";
  namespace: "memory" | "workflow" | "agent" | "knowledge";
  payload: Record<string, unknown>;
  timestamp: number;
}

interface HookResult {
  hookId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 6.2 Hook 执行器

```typescript
interface HookExecutor {
  register(eventType: string, handler: (event: HookEvent) => Promise<void>): string;
  trigger(event: HookEvent): Promise<HookResult[]>;
  unregister(hookId: string): void;
}
```

### 6.3 内置 Hook 示例

| Hook | 触发时机 | 功能 |
|------|---------|------|
| `memory-extraction` | post-edit (knowledge) | 提取关键词、实体关系，存储到语义层 |
| `link-discovery` | post-edit (knowledge) | 发现并建立双向链接 |
| `task-pattern-learning` | post-task (workflow) | 记录任务成功/失败模式 |
| `user-behavior-tracking` | session-end | 学习用户偏好和习惯 |

---

## 七、对话分支设计

### 7.1 分支树结构

```
┌─────────────┐
│ 根对话 #1    │ "帮我分析这段代码"
└──────┬──────┘
       │
  ┌────┴────┬─────────────┐
  │         │             │
┌─▼──┐   ┌─▼──┐        ┌─▼──┐
│分支A│   │分支B│        │分支C│
│分析 │   │重构 │        │文档 │
└────┘   └──┬─┘        └────┘
            │
         ┌──▼──┐
         │分支B1│
         │优化 │
         └─────┘
            │
    ┌───────┴───────────────┐
    │ 合并到记忆文件 #task-123│
    │ - 最佳路径: A → B1     │
    │ - 失败案例: C          │
    └───────────────────────┘
```

### 7.2 数据结构

```typescript
interface ConversationBranch {
  id: string;
  parentId: string | null;
  message: Message;
  status: "active" | "abandoned" | "merged";
  children: string[];
  metadata: {
    timestamp: number;
    agentUsed: string;
    tokensUsed?: number;
    qualityScore?: number;
  };
}
```

### 7.3 记忆文件格式

```markdown
---
id: task-123
type: task-refactor
status: completed
created: 2026-03-06T10:00:00Z
bestPath: ["branch-A", "branch-B1"]
tags: [refactor, login, authentication]
---

# Task: 重构登录代码

## 最佳执行路径

### 分支 A: 分析阶段
- **Agent**: claude-code
- **输入**: "分析当前登录代码的问题"
- **输出**: 发现 3 个问题（密码明文、无重试、错误处理缺失）
- **质量**: 0.95

### 分支 B1: 优化阶段
- **Agent**: codex
- **输入**: "基于分支 A 的分析，生成重构代码"
- **输出**: 生成 120 行代码，添加单元测试
- **质量**: 0.92

## 失败案例

### 分支 C: 文档路径
- **原因**: 用户切换方向，此分支被放弃

## 学到的模式

- **模式 1**: `auth-refactor-pattern` - 认证代码重构的通用步骤
- **模式 2**: `error-handling-checklist` - 错误处理检查清单
```

---

## 八、Windows 后台运行方案

### 8.1 WSL 文件系统访问

| 方向 | 路径 | 说明 |
|------|------|------|
| **WSL → Windows** | `/mnt/c/Users/...` | ✅ 完全访问 |
| **Windows → WSL** | `\\wsl$\Ubuntu\home\...` | ✅ 网络路径访问 |

**注意**：WSL2 访问 `/mnt/c/` 有性能开销，建议代码/数据放在 WSL 内部。

### 8.2 双层后台架构

```
┌─────────────────────────────────────────┐
│         Windows Terminal (用户交互)     │
│  ┌───────────┐  ┌─────────────────────┐ │
│  │  Shadow   │  │  Tmux-like Shell   │ │
│  │  CLI      │  │  (WSL 或 PowerShell)│ │
│  └───────────┘  └─────────────────────┘ │
└─────────────────────────────────────────┘
           │                    │
           │  ┌─────────────────┤
           │  │                 │
           ▼  ▼                 ▼
   ┌──────────────────┐  ┌──────────────────┐
   │  Shadow Service  │  │  Agent Runner    │
   │  (Windows 服务)   │  │  (后台守护进程)   │
   │  • 记忆持久化      │  │  • 任务队列       │
   │  • 知识库索引      │  │  • MCP 调用       │
   └──────────────────┘  └──────────────────┘
```

### 8.3 推荐方案：Windows Service + Node.js Daemon

```typescript
class ShadowService {
  private agentProcesses: Map<string, ChildProcess> = new Map();

  // 调用 Agent CLI
  async callAgentCLI(cli: string, args: string[]): Promise<CLIResult> {
    const child = spawn(cli, ["--json", ...args], {
      env: { ...process.env, SHADOW_SESSION_ID: this.sessionId }
    });

    // ... 进程管理和结果处理
  }
}
```

---

## 九、UI 布局建议

```
┌─────────────────────────────────────────────────────────────┐
│  Shadow Header                                               │
│  [📁知识库] [⚙️设置] [🔄后台状态: 🟢]                         │
└─────────────────────────────────────────────────────────────┘
┌───────────┬───────────────────┬─────────────────────────────┐
│           │                   │                             │
│  知识库    │    编辑区          │        AI 对话框             │
│  文件树    │    (MD 编辑器)    │                             │
│           │                   │  ┌───────────────────────┐ │
│  📁 notes  │                   │  │ 💬 聊天 | ⚙️ 干活      │ │
│  ├─ auth   │  # 当前笔记内容   │  ├───────────────────────┤ │
│  ├─ api    │                   │  │ [消息列表]            │ │
│  └─ utils  │  ...              │  │                      │ │
│           │                   │  │ 🤖: 我理解了你的需求  │ │
│  📊 标签   │                   │  │    正在分析...        │ │
│  #react    │                   │  ├───────────────────────┤ │
│  #auth     │                   │  │ [输入框]              │ │
│           │                   │  │ 📎 附上当前笔记        │ │
│  🔗 双向链接│                   │  └───────────────────────┘ │
│  [[React]] │                   │                             │
│  [[Auth]]  │                   │  📊 后台任务: 3 运行中     │
│           │                   │  - 🔄 索引新笔记          │ │
│           │                   │  - 🔄 建立链接            │ │
│           │                   │  - 🔄 提取记忆            │ │
└───────────┴───────────────────┴─────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Status Bar: 知识库: ~/notes | 笔记: 45 | Agent: 6 活跃 | v0.1.0│
└─────────────────────────────────────────────────────────────┘
```

---

## 十、实现路线图（调整后优先级）

> 更新日期：2026-03-06
> 优先级说明：🔴 最高 | 🟡 中 | 🟢 低 | ⚪ 未来

### Phase 1: 知识库基础 🔴
> **理由**：知识库是整个系统的基础，先做能快速验证价值

- [ ] 文件系统监控
- [ ] 文件索引和元数据提取
- [ ] 双向链接识别和建立
- [ ] 标签系统

### Phase 2: 基础 CLI 🔴
> **理由**：CLI 是 Agent 交互的核心，紧随知识库之后

- [ ] CLI 参数解析
- [ ] JSON 输出格式定义
- [ ] Tauri 命令桥接

### Phase 3: 记忆系统 🟡
- [ ] 三层存储实现
- [ ] MD + Frontmatter 格式
- [ ] Hook 触发器框架

### Phase 4: CLI Bridge 🟡
- [ ] Claude CLI 集成
- [ ] Gemini CLI 集成
- [ ] Codex CLI 集成
- [ ] Claw CLI 集成

### Phase 5: 工作流引擎 🟢
- [ ] 任务队列实现
- [ ] Agent 调度器
- [ ] 状态监控和报告

### Phase 6: 对话分支 🟢
- [ ] 分支树数据结构
- [ ] 可视化分支视图
- [ ] 最佳路径选择算法

### Phase 7: UI 集成 🟢
- [ ] 文件树组件
- [ ] 标签管理界面
- [ ] 链接视图
- [ ] 实时状态同步

### Phase 8: 后台服务 🟢
- [ ] Windows Service 实现
- [ ] 会话持久化
- [ ] 休眠恢复机制

### Phase 9: 未来扩展 ⚪
- [ ] 外部接口（智能家居机器人）
- [ ] 记忆导入/导出
- [ ] 多用户协作

---

**优先级调整理由**：
1. 知识库是基础，先做能快速验证价值
2. CLI 是 Agent 交互的核心，紧随其后
3. 其他功能依赖前两者，可以逐步迭代

---

## 十一、交互流程示例

### 场景 1: 用户下达任务

```
Human (Browser)                CLI (Agent)
     |                              |
     |  1. 用户输入："帮我重构登录代码"     |
     |                              |
     |  2. 调用 CLI:                  |
     |  shadow --json task create   |
     |    --prompt "重构登录代码"     |
     |  ─────────────────────────────>|
     |                              |
     |                              | 3. 存储到 Context Layer
     |                              |
     |                              | 4. 触发 workflow-engine
     |                              |
     |                              | 5. 返回 task-id
     |  <────────────────────────────|
     |                              |
     |  6. 显示: "任务已创建 (task-123)" |
     |                              |
     |                              | 7. 后台执行
     |                              |    - spawn coder agent
     |                              |    - 分析代码
     |                              |    - 生成 refactor plan
     |                              |
     |  8. Hook 触发:               |
     |     post-task → 记忆提取      |
     |                              |
     |  9. 更新 UI 显示进度          |
     |                              |
```

### 场景 2: 知识库后台整理

```
Agent (CLI)                 Knowledge Base
     |                              |
     |  1. 检测到新文件              |
     |                              |
     |  2. 调用:                     |
     |  shadow --json knowledge index|
     |    --file "new-note.md"     |
     |                              |
     |  3. 分析内容 → 提取实体        |
     |                              |
     |  4. 建立双向链接              |
     |  [[React]] → [[component]]   │
     |                              |
     |  5. Hook: post-edit           |
     |     → 更新 Semantic Memory    │
     |                              |
```

---

## 十二、核心价值

1. **统一记忆**：知识库 → 记忆文件 → 整合所有工具
2. **双模交互**：人类 UI 友好，Agent CLI 高效
3. **后台持久**：休眠继续运行，任务不中断
4. **对话分支**：可回溯、可学习的对话历史
5. **可扩展**：未来可连接智能家居机器人等外部设备

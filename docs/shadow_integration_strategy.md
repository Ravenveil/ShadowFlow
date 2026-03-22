# 🛸 Shadow 体系集成战略：从原子切片到自动编排

## 1. 体系架构：以知识为中心的协作逻辑

在这个体系中，`Shadow` 是所有逻辑的出发点和落脚点：

*   **Shadow (知识中枢与记忆管理员 - The Core)**: 它是核心。作为一个**文档智能助手**，它负责文档的原子切片、索引和语义检索；作为**记忆管理员**，它维护着用户的长期知识图谱。所有的工作流都围绕着“从 Shadow 提取知识”和“将结果存入 Shadow 记忆”展开。
*   **AgentGraph (逻辑加工厂 - The Brain)**: 它是执行的大脑。负责根据用户意图，从 Shadow 中调取相关的文档切片和历史记忆，并编排复杂的加工流程（DAG/LangGraph）。
*   **ShadowClaw (底层执行器 - The Tools)**: 它是高性能的工具集。负责具体的、繁重的文档处理任务（如 OCR、PDF 解析、大规模分片），直接服务于 Shadow 的知识库构建。
*   **ai-sql-agent (进化模版 - The DNA Template)**: 展示了如何在处理复杂数据任务时，利用 LangGraph 实现“执行-纠错-自愈”的闭环。

---

## 2. 深度复盘：Shadow 如何驱动自动化

“自动化搭积木”在 Shadow 场景下有了明确的目标：**自动化知识加工**。

1.  **记忆驱动的规划 (Memory-Driven Planning)**: Planner 在规划工作流时，会先询问 Shadow：“用户以前做过类似任务吗？”利用历史记忆来优化当前的积木连接。
2.  **状态与记忆的同步 (State-Memory Sync)**: 工作流中的 `State` 不仅是中间变量，它在关键节点会自动同步回 Shadow 的记忆库，确保即使工作流中断，记忆也是连续的。
3.  **原子切片的对齐**: Shadow 对文档的“原子切片”逻辑，应与 ShadowClaw 处理文件的逻辑、以及 AgentGraph 节点操作的数据粒度完全对齐。

---

## 3. ShadowClaw：定义文档级“原子节点”

在 Shadow 的体系下，原子节点的定义需要紧扣“文档”与“系统”：

### 规范化原子节点（ShadowClaw Node）的三要素：

#### A. 身份与功能元数据 (Identity Metadata)
每个节点必须声明其在文档生命周期中的角色。
*   **ID**: `claw.doc.semantic_split`
*   **Name**: 语义分片器
*   **Description**: 对长文档进行语义分片，提供高质量的原子切片供索引使用。
*   **Tags**: `[Knowledge, Document, Processing]`

#### B. 强类型接口定义 (Interface Schema)
*   **Input Schema**: `{ "file_path": "string", "chunk_size": "number" }`
*   **Output Schema**: `{ "chunks": "list[TextChunk]" }`

#### C. 对 Shadow 的记忆贡献
明确节点产生的产物如何进入 Shadow 的存储层。

---

## 4. AgentGraph：实现“对话即知识工程”

集成 LangGraph 后，Shadow 的对话体验将进化：

1.  **多步调研 (Multi-step Research)**: 当用户问一个 Shadow 库中没有直接答案的问题时，AgentGraph 会自动生成一个循环工作流：`检索知识库 -> 发现缺失 -> 搜索外部/追问用户 -> 补全切片 -> 存入 Shadow 记忆 -> 最终回答`。
2.  **断点续传与时间旅行**: 作为一个记忆管理员，Shadow 会记录 AgentGraph 每一个节点的执行快照。用户可以回溯到三分钟前的执行状态，修改某个参数并从该点重新运行。

---

## 5. 三项项目同步推进的执行路线图

### 第一阶段：Shadow 存储层与接口对齐 (The Foundation)
*   **任务**: 定义 Shadow 的存储标准（SQLite/VectorDB），使 AgentGraph 能直接读取切片。
*   **产出**: 统一的 `MemoryProvider` 接口，打通 Shadow 与 AgentGraph 的数据流。

### 第二阶段：AgentGraph 状态机重构 (The Nervous System)
*   **任务**: 将 `ai-sql-agent` 的状态机理念引入。不再是简单的 String 传递，而是基于 Shadow 记忆的结构化 `State` 对象。
*   **产出**: `LangGraphAdapter`，让积木能跑在 LangGraph 引擎上。

### 第三阶段：ShadowClaw 工具集原子化 (The Claw)
*   **任务**: 围绕“文档助理”需求，开发高性能的 Rust 节点。
*   **产出**: 具备完整 Metadata 的 `shadow-claw-nodes.json` 积木库。

---

## 6. 最终愿景：Shadow AI 的“对话即工程”

未来的 Shadow AI 不再只是聊天，而是在实时构建**知识资产**。用户说一句话，背后是 AgentGraph 调动 ShadowClaw 在 Shadow 的知识海洋中进行一场精确的、可追溯的、可自愈的航行。

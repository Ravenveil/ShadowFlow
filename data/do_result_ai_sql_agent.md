# ShadowFlow Do 结果：ai-sql-agent 项目分析

> 由 `shadowflow do` 自动编排 (plan → execute)，Codex 自主执行
> 命令：`shadowflow do "规划并执行：分析项目代码结构，找出核心数据流" --cwd ai-sql-agent-master --provider codex`

## 总结

当前项目的实际核心数据流是：`FastAPI API` + `sql_agent.py` 的 LangGraph 智能体 + `Milvus` 知识召回 + `ClickHouse` 查询 + `LLM` 生成答/图表；而 `new_method/` 已经形成一套更精细的新架构，具有流式响应式编排和更多数据焦点支持。其默认入口，按照 Dockerfile 默认执行 `python main.py`，在 main.py:101 直接调到了 sql_agent.py:1199 的 `ask_question()`。

## 核心结构

- **API 层**：main.py:101 提供 `/generate_sql_stream`，另有暴露会话、查询会话消息接口。
- **智能体层**：sql_agent.py:1107 构造 LangGraph 节点和边；sql_agent.py:1199 组装初始化状态并顺序执行、写回会话。
- **状态层**：data_structs.py:6 的 `SqlAgentState` 是全局路由状态载体。
- **会话层**：session_mgr.py:6 和 session_mgr.py:84 维护历史问答、上一条 SQL、并持有 memory trace。
- **检索层**：milvus_service.py:97 和 milvus_service.py:129 从 Milvus 召回行业知识和表结构。
- **SQL/执行层**：sql_util.py:698、sql_util.py:870、sql_util.py:215、sql_util.py:939 分别负责 SQL 描述符、SQL 生成、执行、结果处理。
- **模型调用层**：chat_ai.py 封装流式和非流式 LLM 调用。
- **配置层**：config_mgr.py 从 Nacos 和本地 YAML 读配置，所有参数见 config/settings.yaml。

## 核心数据流（14 步）

1. 用户请求进入 main.py:101 的 `/generate_sql_stream`。
2. API 调用到 sql_agent.py:1199 的 `ask_question(question, user_id)`。
3. `ask_question` 从 session_mgr.py:84 取会话并装填 `SqlAgentState`，核心初始字段包括：`question`、`history_context`、`history_full`、`prev_sql`、`memory_trace`、`question_embeddings`。
4. 检索阶段执行 milvus_service.py:97 和 milvus_service.py:129，将行业知识和表结构注入状态。
5. sql_agent.py:206 判断是否需要闲聊、是否为追问。
6. sql_agent.py:315 检查上一条 SQL，用一种焦点和当前问题的相关性检查，判断是否继承上下文。
7. 若是追问，多轮经过 sql_agent.py:392、sql_agent.py:891、sql_agent.py:963，做上一层语义聚合或群体筛选条件转换和锚点。
8. sql_util.py:698 将问题、知识召回和锚点约束组成 SQL 描述符。
9. sql_util.py:870 将描述转为 SQL 的文本。
10. sql_util.py:251 校验 SQL，失败则重试或重生成。
11. sql_util.py:215 执行 ClickHouse 查询，结果写入 `sql_result`。
12. 若执行异常则进入 sql_util.py:973 自动修复并回到校验/执行环节。
13. 成功后经过结果转换、sql_util.py:939、图表决策和 HTML 生成，最后用 SSE 流式返回前端。
14. 最终将 `question / final_answer / sql / sql_result` 写回会话，成为下一次追问的上下文来源。

## 关键数据流转

- **入口参数**：`question`、`user_id`
- **会话存储**：`ConversationSession.history`、`memory_trace`
- **状态载体**：`SqlAgentState`
- **检索数据**：`question_embeddings` → `industry_data` / `table_metadata`
- **上下文锚定**：`history_context`、`history_full`、`prev_sql`、`context_anchors`、`cohort_filters`
- **SQL 链路**：`sql_desc` → `sql_list` → `sql_valid` → `sql_result`
- **输出物**：`final_answer`、`chart_config`、`html`

## new_method/ 部分

- 新入口：new_method/main_api.py:107
- 图构建器：new_method/agent_core/graph/builder.py:18
- 流式编排器：new_method/agent_core/orchestrator.py:23
- 更精细路由（节点列表）：`semantic_analysis → event_detection → task_decomposition → extract_entities → refine_bind → context_cohort_reasoner → generate_sql_desc → generate_sql → validate_execute → postprocess → decide_chart → generate_chart`

## 一句话总结

这个项目的核心数据流逻辑是：`用户提问 → 会话补上下文补全 → 向量召回知识 → 判断追问/锚点继承 → 组装 SQL 描述 → 生成/验证 SQL → 执行查询 → LLM 格式回答/图表 → 写回会话形成下一轮上下文链`。

# AgentTeams 能力映射表

Neo chat-first 前端各 UI 区块与后端端点/数据形状的对应关系及接通状态。

| UI 区块 | 端点 | 数据形状 | 是否已接通 |
|---|---|---|---|
| 首页模板卡封面 | GET /api/skills（新增可选字段 cover_url，来自 SKILL.md frontmatter） | SkillInfo.cover_url?: string | 已接通（无 cover_url 时回落占位映射/纯文字卡） |
| 左栏「知识库」导航行 → 知识包管理页 | GET /knowledge/packs 等（src/api/knowledge.ts，复用既有 KnowledgePage 挂 /knowledge） | KnowledgePack / KnowledgeSourceInput | 已接通（页面为旧体系视觉，Neo 化归阶段 3） |
| 会话列表 / 消息流 / composer 发送 | GET /api/inbox、GET /api/run-sessions、POST /api/run-sessions、POST/PATCH /:id/messages | RunSession / InboxItem | 已接通（NeoChat 主链路，经核实无 mock） |
| 流式输出 / 三态状态机（idle→running→done） | GET /api/run-sessions/:id/stream（EventSource，?after= 续传 + 只读重放） | SSE 20+ 命名事件 → useRunSession reducer | 已接通（错误帧 6 桶分类 + watchdog 承接） |
| 刷新恢复会话 | 同上 stream 重放 + URL ?run= / localStorage sf.last-run-id | —（纯前端持久化，后端重放能力既有） | 已接通（URL 优先，localStorage 兜底） |
| 错误态 / 中断态 UI | POST /:id/messages（重试）、POST /:id/abort（中止） | 会话内错误卡 + 「已中断」pill | 已接通（重试走真实重发，无假按钮） |
| NeoHost「过程」tab（graph + task-tree） | GET /api/runs/{id}/graph、/task-tree | RunGraph / TaskTreeProjection | 已接通（SSE 期间 5s 轮询，404 显示错误条） |
| NeoHost「产物」tab（lineage 列表） | GET /api/runs/{id}/artifact-lineage、/checkpoint-lineage | artifact/checkpoint 节点 + produces/creates 边 | 已接通（无 lineage 时回落单 artifact；uri 解析不出不可点） |
| NeoHost「编队」tab（roster/DAG/policy/per-node 输出） | GET /api/teams/{id}、/workflow、/policy + GET /api/agents + perNodeChunks（SSE） | Team / TeamWorkflow / TeamPolicyMatrix | 已接通（团队态选中时露出；单 Agent 空态说明） |
| NeoHost Loop tab（PDCA 迭代卡） | GET /api/runs/{id}/loops（含 verifier_score 透出） | LoopRecord / IterationRecord | 已接通（轮询 5s；SSE 帧缺口见 GAP.md） |
| NeoHost 工作空间 tab | GET /api/fs/list、/raw | 文件树 / 文件内容 | 已接通（既有，未动） |

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
| 群聊现场页 /group/:groupId（NeoGroupChat 重做） | GET /api/run-sessions、GET /:id/messages + SSE（复用会话端点） | TimelineMessage[]（plan_card/commit/表格富卡） | 已接通（按新壳形态重做，commit 2be1162；日分隔线/成员头像条纯前端推导） |
| Loop 引擎页 /loop-engine | GET /api/runs/{id}/loops | LoopRecord / IterationRecord | 已接通（Neo 化重写 commit 53b5b1c，信息量零缩水；/runs 死链改 /?run=<id>） |
| 新建 Agent 模态（NeoCreateAgentModal） | POST /api/agents（payload {name, soul=name, workspace_id}，soul 为契约必填） | Agent | 已接通（commit ba76489） |
| Python 宕机横幅（NeoApp 顶部） | GET /api/teams 存活探针（usePythonBackendStatus 复用，纯逻辑 hook） | boolean | 已接通（纯 Neo 重写，未 import 旧组件，commit ba76489） |
| 消息流 running 行细节（live 秒表/整行灰化/复制钮/tooltip） | —（纯前端渲染层，数据源 useRunSession 不变） | TimelineMessage | 已接通（commit aa35cb1） |
| Host 产物 tab（保活/复制/spinner 骨架） | GET /api/fs/raw（既有） | — | 已接通（commit 78fe380） |
| 首页 hero 动词轮播 / 模板卡 hover / rail 相对时间 / 回到底部浮钮 | —（纯前端；相对时间数据源 lastActivityAt 既有字段） | — | 已接通（commit ba76489） |

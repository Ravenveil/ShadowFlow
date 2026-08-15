# AgentTeams 能力映射表

Neo chat-first 前端各 UI 区块与后端端点/数据形状的对应关系及接通状态。

| UI 区块 | 端点 | 数据形状 | 是否已接通 |
|---|---|---|---|
| 首页模板卡封面 | GET /api/skills（新增可选字段 cover_url，来自 SKILL.md frontmatter） | SkillInfo.cover_url?: string | 已接通（无 cover_url 时回落占位映射/纯文字卡） |
| 左栏「知识库」导航行 → 知识包管理页 | GET /knowledge/packs 等（src/api/knowledge.ts，复用既有 KnowledgePage 挂 /knowledge） | KnowledgePack / KnowledgeSourceInput | 已接通（页面为旧体系视觉，Neo 化归阶段 3） |

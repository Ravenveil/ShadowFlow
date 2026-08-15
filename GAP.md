# GAP — Neo 前端对标竞品的能力缺口

> 格式：`UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照`

| UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照（ClawsGo/Coze/Kimi/WorkBuddy 怎么做） |
|---|---|---|---|
| ~~左栏「知识库」导航行~~（已解决 2026-08-15） | 复用既有 `KnowledgePage`（Story 9.1，真实 GET /knowledge/packs）挂 `/knowledge` 路由，NeoRail 行改为 `<Link>` 跳转；遗留：该页视觉仍是旧体系样式，Neo 化归阶段 3 | — | ClawsGo home 左栏一级导航「知识库」 |
| 左栏底部邀请/说明卡（NeoRail `.neo-invite`） | 邀请协作者后端（邀请链接生成、被邀请人入职、可选算力/积分奖励）。当前是纯信息卡，无按钮、无跳转 | `POST /api/workspaces/{id}/invites` → `{ inviteUrl, expiresAt }`；`GET /api/workspaces/{id}/invites` 查状态 | ClawsGo 左栏底部「邀请好友得算力 · 双方各得 1,500 算力」卡（home.html .invite，可点击）；Coze 积分/福利条同位置 |

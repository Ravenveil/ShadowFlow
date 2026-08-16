# GAP — Neo 前端对标竞品的能力缺口

> 格式：`UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照`

| UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照（ClawsGo/Coze/Kimi/WorkBuddy 怎么做） |
|---|---|---|---|
| ~~左栏「知识库」导航行~~（已解决 2026-08-15） | 复用既有 `KnowledgePage`（Story 9.1，真实 GET /knowledge/packs）挂 `/knowledge` 路由，NeoRail 行改为 `<Link>` 跳转；遗留：该页视觉仍是旧体系样式，Neo 化归阶段 3 | — | ClawsGo home 左栏一级导航「知识库」 |
| 左栏底部邀请/说明卡（NeoRail `.neo-invite`） | 邀请协作者后端（邀请链接生成、被邀请人入职、可选算力/积分奖励）。**决策（2026-08-15 用户拍板）：保持信息卡占位，阶段 3 后再评估，不做真后端** | （暂缓）`POST /api/workspaces/{id}/invites` → `{ inviteUrl, expiresAt }` | ClawsGo 左栏底部「邀请好友得算力」卡；Coze 积分/福利条同位置 |
| 聊天内 RAG 引用/grounding 展示 | 知识库**检索/查询**端点缺失：knowledge.py 只有 packs CRUD + reindex，无 query/recall；LightRAG 仅 ingest 侧。聊天流无法展示引用了哪个知识包的哪段 | `POST /api/knowledge/packs/{id}/query` → `{ hits: [{ text, source, score }] }`；消息级引用回链 | Coze 回答内嵌知识库引用角标；Kimi 回答底部「参考来源」列表 |
| verifier 面板（轮次打分依据） | verifier 无独立查询端点：只有 score 数字经 `/runs/{id}/loops` 透出，rationale/claims 不落 HTTP（逻辑在 runtime/service.py `_sense_with_verifier`） | `GET /api/runs/{id}/loops/{loop_id}/verdicts` → `{ iteration, score, rationale, claims[] }` | ClawsGo 任务详情页展示每步检查结论；WorkBuddy 收敛过程列出验证意见 |
| Loop 实时性 | loop 状态无 SSE 增量帧，前端只能 5s REST 轮询 `/runs/{id}/loops`（NeoRunInline/NeoHost 都是） | run-event-bus 增加 `loop-update` 帧，或 `GET /api/runs/{id}/loops/stream` | ClawsGo 执行过程全量 SSE 推送，无轮询 |
| 产物 tab 直链预览 | artifact-lineage 的 `metadata.uri` scheme 未文档化，不保证可直接 fetch，前端现在靠文件名匹配回落到 `RunRecord.artifact_url` | artifact 节点落 `preview_url` 字段（签名/静态映射均可） | Coze 产物列表点击即预览，无需猜测地址 |
| 「过程」tab 对 Node 侧 run | **已实测确认**：chat 主路径（Node daemon）启动的 run 在 Python runtime 无投影记录，graph/task-tree 404，前端显示错误条（暴露而非掩盖）。投影只覆盖 Python runtime 的 run | Node 侧 run 同步写投影到 Python runtime，或 Node 自实现等价投影端点 | — |
| 产物 filecard「置顶/收藏」（阶段 2.5 发现） | 无 pin/favorite 端点，复刻页该图标未渲染、未 mock | （如需）`POST /api/artifacts/{id}/pin` | ClawsGo done 页 filecard 右侧有置顶/收藏图标 |
| 产物 filecard 副标题（阶段 2.5 发现） | 复刻页副标题是文档内容摘要，后端无此字段；现用真实数据 `类型 · 状态` 代替 | （如需）artifact 节点落 `summary` 字段 | ClawsGo done 页 filecard 副标题为内容描述 |
| 完成态「后续建议区」（阶段 2.5 发现） | done.html 本身无此区块，后端 RunRecord / lineage 投影均无 suggestions 字段，未渲染 | （如需）`GET /api/runs/{id}/suggestions` | —（复刻页亦无，仅原需求提到） |

## 阶段 2.5 完整版新增（2026-08-16）

| UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照 |
|---|---|---|---|
| rail 分组 label（项目/任务）+ 新建项目行（A3） | Neo 无项目概念；POST /api/projects 虽存在但无「项目分组会话」数据模型 | `GET /api/projects?withSessions=1` → `{ id, name, sessions[] }` | ClawsGo home 左栏项目/任务分组 |
| 工作空间文件上传/新建文件（A33） | fs 只有 list/read/raw，无 write/upload | `POST /api/fs/write { path, content }`、`POST /api/fs/upload`（multipart） | ClawsGo 工作空间 tab 工具钮（a_008/b_007） |
| 消息 👍👎 反馈行（A44） | 无反馈端点，复刻帧 b_001 该行为未渲染 | `POST /api/messages/{id}/feedback { rating: 1|-1 }` | ClawsGo running 态消息底部反馈行 |
| Team DAG 编辑 UI（B28） | 端点 PUT dag/validate 已有，无前端编辑界面（大功能，待评审做不做） | （端点已存在，纯前端工程） | Coze 编排画布可拖拽编辑 |
| 群消息 pin / reactions（B38） | 无 pin/reactions 端点 | `POST /api/groups/{id}/messages/{mid}/pin`、`/reactions { emoji }` | 飞书/Slack 群消息 pin |
| 历史 runs 视图（B39） | /runs 路由已下架，无历史回溯入口；B3 已先修两处死链（→ /?run=<id>） | （数据已有，缺列表页：`GET /api/runs?limit=`） | WorkBuddy 历史任务列表 |
| memory-graph / training-dataset 投影 UI（B40） | api/runs.ts 已封装两个投影端点，前端无露出 | （端点已存在，纯前端工程） | —（ShadowFlow 差异化项） |

## 竞品特有、不做（删除结论，阶段 2.5 完整版）

| 区块 | 出处 | 删除理由 |
|---|---|---|
| 顶栏算力胶囊 ✦1,500（A7） | home/a_001 | 商业化元素，无对应能力 |
| 4 宫格 caps 之 PPT/画布/密钥（A32） | a_006/a_011 | 竞品特有功能，无后端无承接 |
| md 源码视图语法高亮（A37） | b_006 | 成本/收益低，等宽深色已够 |

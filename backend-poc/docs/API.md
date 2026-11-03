# 前端接口契约 · ShadowFlow Python 引擎 v0.1.0

Base URL：`http://127.0.0.1:8787`　所有响应 `Content-Type: application/json`（SSE 与报告除外）。
前端不需要知道引擎内部结构：**起跑 → 订阅事件流 → 按事件渲染**，仅此三步。

---

## 1. 健康与能力

`GET /api/health`

```json
{
  "ok": true,
  "engine": "shadowflow-python-engine",
  "version": "0.1.0-mvp",
  "llm": { "mode": "simulated", "model": "shadowflow-simulator-v1", "note": "未配置 API Key：使用确定性模拟器…" },
  "kb":  { "mode": "local-hybrid", "entries": 10, "chunks": 10, "note": "配置就绪：向量+词法混合检索" },
  "loop_max_depth": 4,
  "agents": [{ "id": "researcher", "name": "情报侦察" }]
}
```

> 前端顶部状态条建议直接展示 `llm.mode` 与 `kb.mode`。`kb.mode = "stub"` 时检索为空，属预期。

---

## 2. 团队

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/teams` | 团队列表（含 `dag`、`policy`） |
| GET | `/api/teams/{id}` | 团队详情 + `checks`（编译期校验结果）+ `matrix_view`（矩阵行列表） |
| POST | `/api/teams` | 新建团队；有编译错误返回 400 且**不落库** |
| POST | `/api/teams/validate` | 只校验不保存，body 为 `{dag, policy}` |

`matrix_view` 结构（渲染矩阵表用）：

```json
{
  "roles": [{ "id": "writer", "name": "内容撰写" }],
  "rows": [{ "agent": "writer", "name": "内容撰写",
             "cells": { "reviewer": "allow", "legal": "deny", "delivery": "deny" } }]
}
```

单元格取值：`allow` / `deny` / `require_approval`。

`checks` 结构：`{"errors": ["边 内容撰写 -> 合规审核：违反四眼原则…"], "warnings": ["…"]}`，`errors` 非空即不可保存。

---

## 3. 起跑与运行

`POST /api/runs`

```json
{ "team_id": "team_opc_growth",
  "task": "为东南亚市场做一次轻小件选品，7 天跑通首单",
  "demo": { "reject_once": true } }
```

`demo.reject_once` 让法务首轮驳回，用于演示回滚；生产置 `false`。

响应：`{"run_id": "run_xxx", "status": "queued"}` —— **异步**，立刻返回，后续靠事件流。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/runs?limit=20` | 运行列表 |
| GET | `/api/runs/{id}` | 详情：`run` / `team` / `nodes` / `iterations` / `checkpoints` / `event_count` |
| POST | `/api/runs/{id}/stop` | 急停；在当前步骤结束后生效，状态转 `stopped` |
| POST | `/api/runs/{id}/resume` | 断点续跑（仅 `stopped` / `failed` 可用），已完成节点会发 `node.skipped` |
| GET | `/api/runs/{id}/report` | `text/markdown` 运行报告，可直接存档当材料 |

---

## 4. 事件流（核心）

`GET /api/runs/{id}/events?since=0`　`Content-Type: text/event-stream`

- 每条事件形如：

```
id: 13
data: {"type":"loop.iteration","seq":13,"ts":"2026-11-01T23:58:30.120","node_id":"n3","round":1,"score":0.6,"decision":"continue",...}
```

- `seq` 每个 run 内单增；`since`（或 `Last-Event-ID`）可回放历史，刷新页面不丢上下文。
- 收到 `run.completed` / `run.stopped` / `run.failed` 后服务端关闭连接，前端应主动 `close()`。
- 空闲每 3 秒发一条 `: ping` 注释帧，用于保活。

### 事件类型

| type | 关键字段 | 前端建议表现 |
| --- | --- | --- |
| `run.started` | `task`、`team`、`llm`、`kb`、`resume` | 起跑卡，展示模式徽标 |
| `node.dispatched` | `node_id`、`title`、`agent`、`role_name`、`round`、`attempt` | 派发卡；节点置「运行中」 |
| `agent.message` | `text`、`citations[]`、`round`、`mode`、`latency_ms`、`kb_mode` | 群聊气泡；`citations` 渲染成可点词条 chip |
| `loop.started` | `max_rounds`、`target_score`、`body[]`、`depth` | 循环开始提示 |
| `loop.iteration` | `round`、`score`、`decision`、`verification`、`issues[]` | 逐轮验证面板一行：得分条 + 决策 |
| `node.rejected` | `risks[]`、`required_changes[]`、`rollback_to`、`attempt` | 红色驳回卡，列出必改项 |
| `checkpoint.rollback` | `to`、`to_title`、`label`、`note` | 琥珀色回滚卡；上游节点回到运行中 |
| `policy.denied` | `sender`、`receiver`、`reason`、`node_id` | 拦截卡；节点标「blocked」 |
| `policy.approval_required` | 同上 + `effect` | 人工门提示 |
| `node.completed` | `node_id`、`score`、`rounds`、`verdict` | 节点置「完成」 |
| `node.skipped` | `node_id`、`reason` | 续跑时跳过已完成节点 |
| `run.stop_requested` | `message` | 急停指令已下发 |
| `run.resumed` | `message` | 续跑开始 |
| `run.completed` | `deliverable`、`score`、`rollbacks`、`nodes` | 交付卡，收尾 |
| `run.stopped` / `run.failed` | `reason` / `error` | 终态提示 |

`agent.message.citations[]`：`{"entry_id":"kb_loop","title":"Loop 循环引擎与 PDCA 收敛","score":0.64,"channel":"vector"}`。

---

## 5. 知识库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kb/status` | `{enabled, mode, entries, chunks, dim, note}` |
| GET | `/api/kb/entries` | 全部词条（`title`/`content`/`tags`/`kind`/`source`） |
| GET | `/api/kb/search?q=…&top_k=4` | 混合检索，返回 `hits[]`（`score`、`channel`） |
| POST | `/api/kb/entries` | 新增词条并**自动重建索引**，`{title, content, tags[], kind}` |

`kind` 约定：`term` 词条 / `method` 方法论 / `policy` 制度 / `case` 案例。

`LIGHTRAG_ENABLED=0` 时 `search` 返回 `{"mode":"stub","hits":[],"note":"…"}`，页面应展示为「RAG 未启用」而不是报错。

---

## 6. 策略矩阵试算

`POST /api/policy/simulate`　`{ "team_id": "...", "sender": "writer", "receiver": "legal" }`

```json
{ "mode": "deny", "reason": "内容撰写 无权向 合规审核 派发（策略矩阵 deny）",
  "sender": "writer", "receiver": "legal" }
```

`mode` ∈ `allow` / `deny` / `require_approval`，是运行期真正使用的同一个 `gate()`，不是另写一套演示逻辑。

---

## 7. 错误约定

- 4xx 返回 `{"detail": "…"}`；团队校验失败时 `detail` 为 `{"message": "...", "checks": {...}}`。
- 运行中异常不会让接口 5xx，而是在事件流里发 `run.failed` + `error`，前端据此收尾即可。

---

## 8. 交易链路（服务台 / 下单 / 支付 / 交付）

这一组接口服务于「扫码下单」入口，和前面的运行接口是两层：**订单不认识引擎内部，只认 `run_id` 和最终交付物。**

### 8.1 服务目录

`GET /api/products`

```json
{
  "items": [{
    "id": "svc_landing_sel", "name": "出海选品作战包", "summary": "…",
    "price_cents": 9900, "currency": "CNY", "team_id": "team_opc_growth",
    "deliverable": "选品报告 + 执行动作表 + 数据来源清单", "eta_hint": "约 10 分钟自动完成",
    "landing_url": "http://10.0.0.5:8787/q/svc_landing_sel"
  }],
  "pay": { "mode": "simulated", "configured": true, "real_money": false, "note": "…" },
  "base_url": "http://10.0.0.5:8787"
}
```

- `landing_url` 直接拿去生成二维码。
- `pay.real_money = false` 时**必须在界面上标注「演示沙箱，不扣真实款项」**。

`GET /api/qr?text=<url>&scale=6` → `image/svg+xml`，二维码图片。`scale` 范围 2–16。未装 `segno` 时返回 503，不会返回空白图。

### 8.2 下单

`POST /api/orders`

```json
{ "product_id": "svc_landing_sel", "requirement": "东南亚轻小件怎么选品，7天跑通首单",
  "buyer_name": "李雷", "contact": "wx_lilei" }
```

`requirement` 必填且至少 4 个字符，其余可空。返回：

```json
{
  "order": { "id": "ord_xxx", "status": "pending_payment", "amount_cents": 9900, "…": "…" },
  "payment": { "provider": "local-sandbox", "mode": "simulated", "txn_id": "sim_xxx",
               "qr_text": "http://10.0.0.5:8787/q/pay/ord_xxx", "pay_path": "/q/pay/ord_xxx" }
}
```

`qr_text` 是**给买家的支付页地址**，不是商品落地页。前端只需跳转或渲染成二维码。

错误：`404` 服务不存在 / `422` 需求太短 / `503` 支付网关未配置。

### 8.3 支付回调

`POST /api/pay/notify`

```json
{ "provider": "simulated", "order_id": "ord_xxx", "txn_id": "sim_xxx" }
```

- `provider` 接受模式名（`simulated` / `wechat` / `alipay`）或网关标识（`local-sandbox`）。
- **幂等**：订单已进入 `paid` 及之后的状态时，重复回调返回 `idempotent: true`，不会重复建工单。
- 校验失败返回 `400`，并在订单时间线写 `pay.rejected`。

真实网关接入时，这个路由再加验签与证书，**订单状态机与前端都不用改**。

### 8.4 查订单（买家页面靠它轮询）

`GET /api/orders/{order_id}`

```json
{
  "order": { "id": "ord_xxx", "status": "delivered", "amount_cents": 9900,
             "deliverable": { "final_text": "…", "nodes": [], "iterations": [],
                              "evidence": { "events": 43, "checkpoints": 4, "iterations": 4 } } },
  "run":   { "id": "run_xxx", "status": "completed", "task": "…" },
  "steps": [ { "title": "情报侦察", "agent": "researcher", "status": "completed", "round": null } ],
  "events": [ { "seq": 1, "type": "order.created", "payload": {}, "ts": "…" } ]
}
```

- `steps` **已按环节聚合**：回滚重做不会出现重复条目，只保留每个环节的最终状态。
- `order.deliverable` 只在 `status = delivered` 时存在。

`GET /api/orders/{order_id}/events?since=<seq>` 只要时间线，字段同上。`GET /api/orders?limit=50` 列订单。

`POST /api/orders/{order_id}/cancel` 取消/退款：未付款直接 `cancelled`；已付款置 `refunded` 并在时间线留痕（**仅状态位，不调真实退款接口**）。

### 8.5 订单状态与事件

| 状态 | 含义 | 前端建议 |
| --- | --- | --- |
| `created` | 已建单，出支付凭据中 | 短暂过渡，不必专门渲染 |
| `pending_payment` | 待支付 | 显示金额与「确认支付」 |
| `paid` | 已支付 | 显示「已支付，正在派单」 |
| `running` | 工单已交给 Agent 团队 | 显示执行进度，可轮询 `steps` |
| `delivered` | 已交付 | 渲染 `deliverable` |
| `failed` | 执行失败或网关异常 | 提示联系服务方 |
| `cancelled` / `refunded` | 已取消 / 已退款 | 终止态 |

| 事件 `type` | 触发时机 |
| --- | --- |
| `order.created` | 建单成功 |
| `order.pending_payment` | 支付凭据已生成 |
| `order.paid` | 回调验签通过 |
| `order.dispatched` | 已建 run 并提交编排器（含 `run_id`） |
| `order.delivered` | run 完成，交付物已回填 |
| `order.failed` / `order.cancelled` / `order.refunded` | 终止或退款 |
| `pay.rejected` | 回调校验失败 |

### 8.6 页面路由（不用前端写，直接可用）

| 路径 | 用途 |
| --- | --- |
| `/shop` | 服务台：上架服务 + 二维码 |
| `/q/{product_id}` | 买家下单页（移动端优先） |
| `/q/pay/{order_id}` | 支付 / 进度 / 交付页，刷新可恢复 |

**这三页是给外部使用者看的**，不出现 SSE、DAG、RAG 这类词。工程师自测台在 `/`，两者互不依赖。

---

## 9. OPC OS（公司 / 组织 / 任务 / 审批 / 账本）

这一组是「管理台」用的接口。核心概念：**员工是可配置的 agent 实例，任务是契约，审批是闸门，账本是证据。**

### 9.1 公司与总览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company` | 默认公司 + 经营看板（营收/成本/毛利/在编/任务分布/待审批数） |
| `GET` | `/api/company/{id}` | 指定公司的看板 |
| `GET` | `/api/companies` | 公司列表 |
| `GET` | `/api/models` | 模型目录（含单价，单位为「分/千 token」） |
| `GET` | `/api/company/{id}/pnl` | 损益 + 流水明细 |
| `POST` | `/api/company/{id}/income` | 记一笔收入 `{amount_cents, project_id?, description}` |

`/api/company` 返回的 `dashboard` 结构：

```json
{
  "pnl": { "revenue": 499.0, "cost": 78.91, "profit": 420.09, "margin": 84.2,
           "projects_total": 5, "projects_delivered": 5, "avg_project_cost": 15.78 },
  "headcount": { "total": 9, "working": 0, "idle": 9, "awaiting": 0 },
  "tasks": { "total": 45, "by_status": { "done": 45 } },
  "approvals_pending": 0,
  "projects": [{ "id": "prj_x", "name": "…", "status": "delivered", "budget": 99.0, "cost": 15.78 }]
}
```

金额单位统一为**元（浮点）**；只有 `*_cents` 字段才是分。

### 9.2 组织与员工

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company/{id}/org` | 组织架构：部门 + 负责人 + 成员（含模型、状态、技能） |
| `GET` | `/api/company/{id}/roster` | 员工名册（扁平，含绩效与累计成本） |
| `POST` | `/api/company/{id}/employees` | 招聘 |
| `POST` | `/api/company/{id}/employees/{eid}/fire` | 离职（有未完成任务时需 `reassign_to`） |

招聘请求体：

```json
{ "name": "赵策", "title": "渠道投放专员", "role": "specialist",
  "department_id": "dept_x", "model_name": "deepseek-chat",
  "skills": ["信息流投放", "素材测试"], "tools": ["广告后台"],
  "permissions": ["查看消耗"], "system_prompt": "…", "day_rate_cents": 900 }
```

`model_name` 必须在 `/api/models` 里，否则 422。**模型决定成本，不只是决定效果。**

### 9.3 项目与任务

`POST /api/company/{id}/projects` —— 老板下目标，平台自动拆解：

```json
{ "goal": "帮一家新开的咖啡店在一周内获得 50 个潜在客户",
  "client_name": "街角咖啡", "budget_cents": 29900, "auto_plan": true }
```

返回 `{project, tasks}`。`auto_plan=true` 时按 `seed_data.PLAYBOOK` 拆成 9 个任务并排好依赖。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company/{id}/projects` | 项目列表 |
| `GET` | `/api/projects/{pid}` | 项目 + 全部任务 + 审批 |
| `POST` | `/api/projects/{pid}/run` | 推进项目，`{workers}` 控制并行度 |
| `GET` | `/api/tasks/{tid}` | 单个任务（含 output / handoff / review） |
| `POST` | `/api/tasks/{tid}/run` | 单独跑一个任务 |

`POST /api/projects/{pid}/run` 返回：

```json
{ "project": { "status": "delivered" },
  "rounds": [ [ { "task_id": "tsk_1", "title": "…", "by": "陈明远",
                  "status": "done", "cost": 2.5, "needs_approval": false } ] ],
  "stopped": "completed | approval | max_rounds",
  "pending_approvals": [],
  "tasks": [] }
```

**`stopped` 是这套系统的关键字段**：`approval` 表示流程卡在人工决策点，不是出错。

### 9.4 任务对象

```json
{
  "id": "tsk_x", "project_id": "prj_x", "title": "市场研究与竞品分析",
  "brief": "给出客群画像…", "status": "done",
  "depends_on": ["tsk_y"], "mode": "pipeline",
  "assignee": { "id": "emp_x", "name": "林研", "title": "市场研究员" },
  "output": { "text": "…", "summary": "…", "model": "gpt-4o",
              "citations": [], "tokens": { "in": 512, "out": 258 },
              "cost_cents": 1203, "cost_breakdown": { "model": 3, "labor": 1200 } },
  "handoff": [ { "from_task": "tsk_y", "from_employee": "陈明远", "summary": "…" } ],
  "review": { "risk": "medium", "required": true },
  "cost_cents": 1203
}
```

三件事必须能追到：**谁做的（assignee）、上游给了什么（handoff）、花了多少（cost_breakdown）**。

### 9.5 审批

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company/{id}/approvals?status=pending` | 审批列表 |
| `POST` | `/api/approvals/{aid}/decide` | `{decision: "approved" \| "rejected", note}` |

- `approved` → 任务置 `done`，项目继续推进。
- `rejected` → 任务退回 `todo`，驳回理由写入 `review.rejected_reason`，下一轮执行会带着这条意见重做。
- 风险分级：`low` 自动放行，`medium` 需老板过目，`high` 必须老板本人。

### 9.6 管理台页面

`GET /api/os` → 管理台单页。六个视图：总览、组织架构、员工名册、项目与任务、审批中心、经营账本。

> 它是**内部经营界面**，和 `/`（引擎自测台）、`/shop`（客户侧）三者互不依赖，各自调各自的接口。

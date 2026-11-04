# 前端接口契约 · ShadowFlow Python 引擎 v0.5.1（契约 2.1）

Base URL：`http://127.0.0.1:8787`　所有响应 `Content-Type: application/json`（SSE 与报告除外）。
前端不需要知道引擎内部结构：**起跑 → 订阅事件流 → 按事件渲染**，仅此三步。

## 0. 鉴权约定（先读这段，否则会踩 403）

接口分两类，**默认配置下**规则如下：

| 类别 | 覆盖接口 | 规则 |
| --- | --- | --- |
| 公开 | `/api/health`、`/api/products`、`/api/products/{id}`、`POST /api/orders`、`POST /api/pay/notify` | 任何人可访问 |
| 买家私有 | `/api/orders/{id}`、`GET /q/{order_id}` 页面数据 | 需 `?k=<access_key>` 或 `X-Order-Key` 头 |
| 管理 | 其余全部（团队、运行、知识库、公司、员工、项目、任务、审批、账本、订单列表） | 默认只允许**回环地址**（127.0.0.1 / ::1）；其他来源 `403` |

设了 `SF_ADMIN_TOKEN` 之后，管理类接口一律要求：

```
X-Admin-Token: <SF_ADMIN_TOKEN>      也可用 cookie: sf_admin=<同值>
```

缺失 → `401`；未设令牌且来源非本机 → `403`。

**凭据不可枚举**：`/api/orders/{id}` 在凭据错误时返回 `403`（不是 `404`），避免探测订单是否存在。

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

## 4.1 全局事件总线（v0.4.6）

上面那条是「一个 run 内部发生了什么」。这条是「整个店里发生了什么」：
谁下了单、谁付了钱、哪一单交付了。老板大屏和买家页面靠它做到点完立刻有反应，
而不是等下一次轮询。

### 两个入口

| 接口 | 谁用 | 鉴权 |
| --- | --- | --- |
| `GET /api/events?since=0&types=order.` | 老板 OS 实时看板、引擎台 | 管理侧（本机回环，或 `X-Admin-Token` / `sf_admin` cookie） |
| `GET /api/orders/{order_id}/events?since=0` | 买家交付页，只听自己这一单 | 订单凭据 `k=`（和其他订单接口一致） |
| `GET /api/events/stats` | 排查「页面不联动」 | 管理侧 |

- `types` 是**前缀**匹配，逗号分隔：`types=order.` 只收订单事件，`types=order.,run.` 两类都收；不传就是全部。
- `since` 或 `Last-Event-ID` 补历史：浏览器 `EventSource` 断线重连会自动带上，中间漏的会补发，不会停在旧画面。
- 事件格式与 run 事件不同：总线事件带 `id`（全局自增）、`type`、`at`、`order_id`、`run_id`、`data`。
- 空闲每 15 秒发一条 `: ping` 保活；连接由客户端保持，服务端不主动断（除非进程退出）。

### 事件长什么样

```
id: 42
event: order.delivered
data: {"id":42,"type":"order.delivered","at":"2026-11-04T16:37:12.901","order_id":"ord_xxx","run_id":"","data":{"score":97,"chars":3402}}
```

| type | 说明 |
| --- | --- |
| `order.created` | 下单（`data.product`、`data.amount_cents`） |
| `order.pending_payment` | 已生成支付单，等付款 |
| `order.paid` | 付款到账，开始生产 |
| `order.queued` | 系统忙，进排队 |
| `order.dispatched` | 已派给项目/团队（`data.run_id`） |
| `order.delivered` | 交付完成（`data.score`） |
| `order.failed` / `order.refunded` / `order.cancelled` | 失败 / 退款 / 取消 |
| `order.project_stopped` | 退款时把项目一并停掉 |
| `run.*` | 引擎事件同格式转发（`run_id` 有值），调试时订阅全部即可 |

### 前端怎么接（老板页真实写法）

```js
const es = new EventSource('/api/events?types=order.');
es.onopen = () => setLiveBadge(true);
es.onerror = () => setLiveBadge(false);   // 浏览器自己重连，带 Last-Event-ID
es.addEventListener('order.created', e => toast('新单：' + JSON.parse(e.data).data.product.name));
es.addEventListener('order.delivered', () => refreshDash());  // 收到再拉详情，权限仍在接口层
```

**页面要保留一条兜底轮询**（老板页 30 秒、买家页 6 秒）：推送通道断开时页面不至于停在旧数字上；
`?live=0` 可以手动关掉推送，截图、打印、录屏定格时用。

---

## 5. 知识库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kb/status` | `{enabled, mode, entries, chunks, dim, scoped, common, archived, note}` |
| GET | `/api/kb/entries` | 全部词条（`title`/`content`/`tags`/`kind`/`source`/`scope_services[]`/`scope_roles[]`/`archived`） |
| GET | `/api/kb/search?q=…&top_k=4&service_id=&role=` | 混合检索，返回 `hits[]`（`score`、`channel`）；带 `service_id`/`role` 时按域过滤 |
| POST | `/api/kb/entries` | 新增词条并**自动重建索引**，`{title, content, tags[], kind, scope_services[], scope_roles[], archived}` |

`kind` 约定：`term` 词条 / `method` 方法论 / `policy` 制度 / `case` 案例。

**分域（契约 1.8）**：`scope_services` 与 `scope_roles` 是适用范围，**留空 = 通用**（谁都能查到）。
员工执行任务时，系统按「这单是什么服务 + 这个岗位是谁」过滤，写文案的人查不到「出海选品」章节。

- `service_id` 取值 `svc_content` / `svc_landing_sel` / `svc_compliance`；`role` 取员工 `role`
  （`copywriter` / `market_researcher` / `quality_reviewer` / `account_manager` …）。
- 两个参数**不传 = 管理台全库搜**（排障时想看全部就这么查）；传空串 = 有上下文但取不到值，
  此时只有服务专属词条被排除——这正是「项目还没关联订单」时该有的行为。
- `archived = true` 的词条保留记录但不再参与召回（归档，不是删除）。

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
- 401 = 缺管理令牌；403 = 非本机且未配令牌 / 订单凭据不符；404 = 资源不存在；400/422 = 入参不合法。
- 业务异常（`CompanyError`）统一映射为对应 4xx，不会整站 500。
- 运行中异常不会让接口 5xx，而是在事件流里发 `run.failed` + `error`，前端据此收尾即可。

---

## 8. 交易链路（服务台 / 下单 / 支付 / 交付）

这一组接口服务于「扫码下单」入口，和前面的运行接口是两层：**订单不认识引擎内部，只认 `run_id` 和最终交付物。**

### 8.1 服务目录

`GET /api/products`

```json
{
  "items": [{
    "id": "svc_landing_sel", "name": "出海选品包", "summary": "…",
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
  "order": { "id": "ord_xxx", "status": "pending_payment", "amount_cents": 9900,
             "access_key": "ak_xxx", "…": "…" },
  "payment": { "provider": "local-sandbox", "mode": "simulated", "txn_id": "sim_xxx",
               "qr_text": "http://10.0.0.5:8787/q/pay/ord_xxx", "pay_path": "/q/pay/ord_xxx" }
}
```

`qr_text` 是**给买家的支付页地址**，不是商品落地页。前端只需跳转或渲染成二维码。

`order.access_key` 是买家查阅订单的唯一凭据：请带着它拼链接（`/q/pay/{id}?k={access_key}`）后再生成二维码或发给买家。丢了凭据的买家查不到自己的订单（这是设计，不是缺陷）；管理员可在管理台用管理令牌读取。

错误：`404` 服务不存在 / `422` 需求太短 / `503` 支付网关未配置。

### 8.3 支付回调

`POST /api/pay/notify`

```json
{ "provider": "simulated", "order_id": "ord_xxx", "txn_id": "sim_xxx", "access_key": "ak_xxx" }
```

- `provider` 接受模式名（`simulated` / `wechat` / `alipay`）或网关标识（`local-sandbox`）。
- **必须带凭据**：沙箱模式要求 `txn_id` 等于服务端签发的值、`access_key` 等于该订单的凭据，缺一或错一即 `400`，订单状态不变、账本不入账。
- 微信 V2 按字典序拼参 + 商户密钥做 MD5 验签；支付宝未配公钥时直接拒绝（不做"验不了就放行"）。
- **幂等**：订单已进入 `paid` 及之后的状态时，重复回调返回 `idempotent: true`，不会重复建工单、不会重复记账。
- 校验失败返回 `400`，并在订单时间线写 `pay.rejected`。

真实网关接入时只需替换验签实现，**订单状态机与前端都不用改**。

### 8.4 查订单（买家页面靠它轮询）

`GET /api/orders/{order_id}?k=<access_key>`

> 凭据来自下单响应里的 `order.access_key`，也可放 `X-Order-Key` 头。缺失或不符 → `403`，不暴露订单是否存在。管理令牌可直接读任意订单。

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
- `order.deliverable.quality` 是发货前自检（v0.4.0）：

```json
{
  "rules": "q4", "score": 93, "passed": true, "level": "pass",
  "verdict": "自检 93 分 · 可以发出",
  "items": [
    {"key": "topic", "name": "对题", "score": 30, "weight": 30, "ok": true, "note": "客户诉求命中 71%"},
    {"key": "actionable", "name": "能照做", "score": 18, "weight": 25, "ok": false, "note": "8 处具体数字"}
  ],
  "length": {"chars": 635, "floor": 480, "ceiling": 750,
             "wanted": "500字", "over": false, "overlong": false},
  "form": {"wanted": "copy", "label": "文案", "checked": true, "fit": true,
           "headings": 3, "signals": [], "note": "客户要文案，形态对得上"},
  "polish": ["摘掉 1 处内部索引", "去掉排版符号"],
  "rework": {"round": 1, "task": "挑出卖点", "score_before": 58, "score_after": 93}
}
```

- `rules`（契约 1.7）：评分口径版本号。服务启动时会把 `rules` 与当前口径不一致的历史交付全部重算，
  避免「上周的单 46 分、这周的单 100 分」两套尺子摆在同一个客户档案里。前端不用读它，只用于排查口径差异。
- `polish`：交付前摘掉的内部索引 / 换掉的行话 / 去掉的 markdown 符号，空数组表示没动过。
- `length`（契约 1.3）：篇幅是否照客户说的来。`wanted` 是从客户原话解析出的字数要求，
  `floor`/`ceiling` 是据此算出的合理区间。客户说了 500 字却写 7000 字，
  `overlong = true`，`passed` 直接为 `false`（不是「写得多了点」，是没按要求做）。
- `form`（契约 1.4）：形态是否对题。`wanted` 是客户点的那道菜（`copy` 文案 / `article` 文章 /
  `script` 脚本 / `email` 邮件 / `list` 清单 / `plan` 方案 / `report` 报告），认不出为 `null`；
  `fit = false` 表示客户要成品、交上来却是工作底稿（正文标题里 ≥2 个内部流程词），
  此时 `score` 封顶 55、`passed = false`。`signals` 是判定的证据标题，`note` 是给客户看的一句话。
- `trimmed`（契约 1.3）：交付正文被按篇幅精简过时给 `{on, from, to, wanted}`，
  否则为 `null`。精简掉的原文会放进 `appendix`，客户想看全文有地方去。
- `appendix`（契约 1.3）：策划过程与未精简原稿，形如 `[{title, text}]`。
  **不拼进 `final_text`**，前端折叠展示即可——客户付钱要成品，不是要读我们的过程记录。
- `rework`：返工过才有。低于 62 分退回补最弱一环，只补一次；补完没变好会保留原稿，
  此时 `rework.kept = "original"`，`score_after` 等于 `score_before`。
- `feedback`（契约 1.9）：客户意见段，形如 `{total, changed, items[]}`。
  `items[]` 每条含客户原话 `note`、标签 `tags`、状态 `status`
  （`applied` 采纳 / `kept` 留了原版 / `failed` 返工没跑起来）、以及 `result`
  （改前改后分数、是否真的改了、没采纳的原因）。没有意见时是 `{total: 0, changed: 0, items: []}`，
  **不是 `null`**——对接方取字段就能用，不用先判它存不存在。

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

### 8.6 交付文件包（v0.4.5）

客户付完钱，除了页面能读，还得能拿走一个文件。三个接口，都走订单凭据 `?k=`：

| 路径 | 用途 | 返回 |
| --- | --- | --- |
| `GET /api/orders/{order_id}/package` | 包里有什么（不下载整包） | JSON 清单 |
| `GET /api/orders/{order_id}/package.zip` | 下载 ZIP 文件包 | `application/zip` |
| `GET /api/orders/{order_id}/package.pdf` | 下载交付单 PDF | `application/pdf` |

清单长这样：

```json
{
  "order_id": "ord_ca3f2f0a20",
  "files": [
    {"name": "交付说明.txt", "bytes": 1126},
    {"name": "交付正文.txt", "bytes": 3402},
    {"name": "交付正文.md", "bytes": 3438},
    {"name": "质检报告.txt", "bytes": 612},
    {"name": "订单信息.txt", "bytes": 488},
    {"name": "附录/01-这次要解决什么.txt", "bytes": 2459}
  ],
  "total_bytes": 35306,
  "formats": ["zip", "pdf"],
  "available": {"zip": true, "pdf": true, "pdf_font": "simhei.ttf", "note": null},
  "download": {"zip": "/api/orders/{order_id}/package.zip",
               "pdf": "/api/orders/{order_id}/package.pdf"}
}
```

- ZIP 里是一个以订单号命名的目录（`ShadowFlow-交付-{order_id}/`），文件名一律带 UTF-8 标记，
  Windows 自带解压不会乱码；`交付正文.txt` 与网页上的 `final_text` **逐字一致**。
- PDF 是「交付单」：抬头信息 + 正文 + 质检摘要 + 附录，内嵌中文字体（只嵌用到的字形，几百 KB）。
  服务端没装 `reportlab` 时 `available.pdf = false`，ZIP 不受影响。
- 只对 `delivered` 订单可用：未交付返回 `404`，格式乱传返回 `400`。

### 8.7 客户反馈与返工（v0.4.9）

交付不是终点。客户收到成品说「这段不行」，系统要能把这句话变成下一版。两个接口，都走订单凭据 `?k=`：

| 方法 | 路径 | 用途 | 返回 |
| --- | --- | --- | --- |
| `GET` | `/api/orders/{order_id}/feedback` | 意见记录 + 还能不能提 | `{items[], can_submit, max_rounds, tags[]}` |
| `POST` | `/api/orders/{order_id}/feedback` | 提交意见，触发定向返工 | `{ok, feedback, items[], can_submit}` |

提交体：

```json
{"note": "太官方了，我们店说话像邻居，别用「尊敬的客户」那种腔调",
 "tags": ["太官方"],
 "excerpt": "（可选）客户圈中的那一段原文"}
```

- `note` 是**客户原话**，原样存下来（4–600 字），不改写、不总结——它是返工时唯一的依据。
- 返回时**不等返工做完**：改一版要一两分钟，先告诉客户「收到了」，改完结果走
  同一条事件流推过去（`order.reworked`）。
- 只有 `delivered` 订单能提；还没交付返回 `409`，太短返回 `422`，超过 `max_rounds` 返回 `409`。
- **一单最多自动改两轮**：第三轮起请人工接，模型改不动的事再跑只是烧钱。

意见记录长这样：

```json
{
  "items": [{
    "id": "fb_57be2983d0", "round": 1,
    "note": "太官方了，我们店说话像邻居",
    "tags": ["太官方"], "excerpt": "",
    "status": "applied",
    "at": "2026-11-04T17:35:03.149",
    "result": {"score_before": 90, "score_after": 90, "changed": true,
               "kept": "", "dropped": "", "task": "写三版文案"}
  }],
  "can_submit": true, "max_rounds": 2,
  "tags": ["太官方", "不像我们说话", "事实不对", "太长", "没说到点上", "漏了重点"]
}
```

`status` 三种：`applied`（采纳了新版本）、`kept`（改出来没比原来好，留了原版）、
`failed`（返工没跑起来）。**改差了就如实说改了差**，不能把更烂的东西当改进交付。

交付物里同步多一段 `feedback`（字段见 `app/contract.py` 的 `DELIVERABLE_FIELDS`），
客户在交付页能看见自己说过的话被记下来、改到第几版。

### 8.8 页面路由（不用前端写，直接可用）

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
| `GET` | `/api/company/{id}/pnl?limit=50` | 损益 + 最近 N 条流水 + `ledger_meta`（是否截断）+ `books`（漏账缺口） |
| `POST` | `/api/company/{id}/income` | 记一笔收入 `{amount_cents, project_id?, description}` |
| `GET` | `/api/company/{id}/brief?days=7` | 老板的每日简报：该拍板的事、该回访的人、服务毛利建议（v0.4.0） |
| `GET` | `/api/company/{id}/customers?revisit_days=7` | 客户档案 + 回访雷达（v0.4.0） |
| `GET` | `/api/meta` | 能力声明 + 接口契约（字段清单），给对接方读 |
| `GET` | `/api/ops/status` | 运维面板：订单积压、卡单、账务缺口、库体检 |
| `POST` | `/api/ops/recover` | 手动续跑卡住的单 `{minutes?, limit?}` |

`brief` 返回 `headline / actions[] / advice[] / stats`；`actions[].tab` 直接对应管理台页签，
前端点一下就跳过去。`customers` 按「该回访、花得多」排序，每个客户带
`stage`（新客/复购/老客）、`spend`、`margin`、`quality`（交付自检均分）、
`revisit`（该回访/刚交付）、`suggest`（下一步卖什么 + 为什么）。两者都只读，不写库。

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

`/pnl` 里两块的口径不同，别混：`pnl` 是全量汇总（永远准），`ledger` 只是最近 `limit` 条明细。
`ledger_meta.truncated` 为 `true` 时说明还有更早的流水没返回，拿 `ledger` 求和会小于 `revenue`。
`books` 是对账结果：已交付却没记收入的单，非 0 说明账有缺口（启动时会自动补）。

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

### 9.6 员工经验（跨任务长期记忆，v0.5.0）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company/{id}/memories` | 记忆列表，可按 `role` / `service_id` 过滤 |
| `POST` | `/api/company/{id}/memories` | 手动钉一条经验（只有人知道的规矩） |
| `DELETE` | `/api/company/{id}/memories/{mid}` | 归档一条记忆（记错了就能删，不物理删除） |

手动钉一条：

```json
POST /api/company/{id}/memories
{
  "content": "这个客户就是不要官方腔，说话像邻居",
  "kind": "preference",
  "role": "copywriter",
  "service_id": "svc_content"
}
```

`kind` 只能是 `lesson` / `preference` / `weakness`；`role` 与 `service_id` 留空表示**不限岗位不限服务**（每次都带上）。
返回 `{"ok": true, "memory": {...}}`，`memory` 结构与列表项一致。

> 手动钉的和系统自动学的是一回事：同样按「岗位 + 服务」召回，下一单自动进提示词。
> 区别只是来源 `source` 记为 `manual`。

返回：

```json
{
  "items": [
    {
      "id": "mem_xxxx",
      "kind": "lesson | preference | weakness",
      "content": "客户提过：太官方了，我们店说话像邻居（太官方）。同类客户交付时先按这条自查。",
      "role": "copywriter",
      "service_id": "svc_content",
      "source": "rework | client_feedback | quality",
      "score": 0.9,
      "hits": 1,
      "archived": false
    }
  ],
  "stats": {
    "enabled": true,
    "total": 2,
    "by_kind": { "lesson": 0, "preference": 1, "weakness": 1 },
    "top_k": 3,
    "max_per_scope": 8
  }
}
```

**这些记忆会自动进下一单的提示词**，不用前端做任何事。触发点：

| 场景 | 记什么 | `source` |
| --- | --- | --- |
| 自检打回并返工 | 被打回的原因 | `rework` |
| 客户提意见并改版 | 客户原话 | `client_feedback` |
| 交付时某项质检没拿分 | 那一项的自查方法 | `quality` |

分域口径与知识库一致：记忆按「岗位 + 服务」召回，别岗位别服务的经验不会串。
同一岗位同一服务最多留 8 条，超了按权重淘汰；同一条内容重复出现不新增，只加权。

### 9.7 主动经营 / 每日待办（v0.5.1）

以前「今天先做这几件」是**打开页面才现算**的 —— 老板一周不开一次页面，这事就等于没有，
而且现算的结果不落库，今天看到的和明天看到的是两次临时计算，没法对比。

现在系统自己每天扫一遍：待审批、该回访的客户、在跑的项目、真实毛利，
生成当天待办并写进 `daily_briefs` 表。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/company/{id}/brief` | 今天的待办。优先返回当天落库那份；没有才实时算 |
| `GET` | `/api/company/{id}/brief/history` | 历史待办（一天一份） |
| `POST` | `/api/company/{id}/brief/generate` | 立刻手动扫一遍，不等调度器的点 |
| `GET` | `/api/brief/scheduler` | 调度器状态：开了没、几点跑、上次跑了什么、下次什么时候 |
| `POST` | `/api/brief/scheduler/run` | 手动跑一轮所有公司 |

`GET /brief` 的返回比 v0.5.0 多了三个字段，用来区分「系统自动扫的」和「实时算的」：

```json
{
  "date": "11月4日",
  "headline": "今天有 2 件要你点头",
  "actions": [{ "kind": "approve", "title": "...", "detail": "...", "tab": "approvals", "label": "去拍板" }],
  "advice": ["..."],
  "stats": { "pending": 2, "due": 1, "running": 0, "revenue_7d": 1377.0, "margin": 84.9 },
  "generated_at": "2026-11-04T08:00:03.120",
  "source": "scheduler",
  "brief_date": "2026-11-04",
  "persisted": true
}
```

| `source` | 含义 |
| --- | --- |
| `scheduler` | 调度器到点自动生成并落库 |
| `manual` | 有人手动点「现在扫一遍」 |
| `live` | 当天还没生成过，这次是实时算的（**不落库**） |

调度器状态：

```json
{
  "enabled": true,
  "hour": 8,
  "webhook": false,
  "last_run_at": "2026-11-04 08:00:03",
  "next_run_at": "2026-11-05 08:00:00",
  "runs": 3,
  "today_brief": "2026-11-04"
}
```

配置（环境变量）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SF_BRIEF_ENABLED` | `1` | 关掉就退回「打开页面才现算」 |
| `SF_BRIEF_HOUR` | `8` | 每天几点生成（0-23） |
| `SF_BRIEF_WEBHOOK` | 空 | 推送地址（企业微信机器人 / 飞书 / 自建服务都行）；留空只落库不推送 |

推送内容是 markdown，格式：`标题 + 一句话结论 + 待办清单 + 建议`。
推不出去只记状态，不影响落库和页面显示。

### 9.8 管理台页面

`GET /api/os` → 管理台单页。八个视图：总览、组织架构、员工名册、项目与任务、客户与回访、员工经验、审批中心、经营账本。

> 它是**内部经营界面**，和 `/`（引擎自测台）、`/shop`（客户侧）三者互不依赖，各自调各自的接口。

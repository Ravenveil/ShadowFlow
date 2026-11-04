"""接口契约：前端、支付、模型三方对接时唯一需要读的那一页。

为什么单独放一份，而不是靠 FastAPI 自动生成的 openapi：
  · openapi 描述的是「我有哪些参数」，不描述「你依赖我哪些字段」；
  · 前端改一版、后端删一个字段，两边都不会报错，只会在页面上显示成空白；
  · 这里把「页面真正依赖的字段」写成清单，`tools/contractcheck.py` 拿真实响应逐条比对，
    字段一少就红，改接口的人当场就知道自己破坏了谁。

字段写法：点号表示层级，`items[]` 表示数组里每一项，例如 `orders.by_status.delivered`、`items[].suggest.name`。
"""

CONTRACT_VERSION = "2.1"

# 每个接口：谁在用、要什么字段。
# auth: public（买家可见）/ order_key（需订单凭据）/ admin（老板侧）
ENDPOINTS = [
    {
        "id": "health",
        "method": "GET",
        "path": "/api/health",
        "auth": "public",
        "used_by": "页面启动自检、监控",
        "fields": [
            "ok", "version", "engine", "llm.mode", "pay.mode", "kb.entries",
            "orders.total", "orders.inflight", "orders.stuck", "db.ok", "db.tables",
        ],
    },
    {
        "id": "meta",
        "method": "GET",
        "path": "/api/meta",
        "auth": "public",
        "used_by": "前端 / 支付 / 模型三方对接",
        "fields": [
            "version", "contract_version", "capabilities.quality_gate", "capabilities.order_recovery",
            "entrypoints.admin", "entrypoints.shop", "endpoints", "errors",
        ],
    },
    {
        "id": "ops_status",
        "method": "GET",
        "path": "/api/ops/status",
        "auth": "admin",
        "used_by": "运维面板、巡检脚本",
        "fields": [
            "version", "orders.total", "orders.inflight", "orders.stuck",
            "stuck", "books.count", "books.amount_cents", "db.ok", "db.tables",
        ],
    },
    {
        "id": "products",
        "method": "GET",
        "path": "/api/products",
        "auth": "public",
        "used_by": "买家商品页 /shop",
        "fields": [
            "items[].id", "items[].name", "items[].detail",
            "items[].price_cents", "items[].price", "items[].price_text", "items[].landing_url",
        ],
    },
    {
        "id": "company",
        "method": "GET",
        "path": "/api/company",
        "auth": "admin",
        "used_by": "管理台 /os 全局状态",
        "fields": ["company.id", "company.name", "dashboard.headcount.total"],
    },
    {
        "id": "org",
        "method": "GET",
        "path": "/api/company/{id}/org",
        "auth": "admin",
        "used_by": "管理台·组织架构",
        # 注意：org.headcount 是人数（整数）；总览里的 dashboard.headcount 才是 {total, working} 结构
        "fields": ["departments[].name", "departments[].charter", "departments[].members[].name", "headcount"],
    },
    {
        "id": "roster",
        "method": "GET",
        "path": "/api/company/{id}/roster",
        "auth": "admin",
        "used_by": "管理台·员工名册",
        "fields": ["items[].id", "items[].name", "items[].title", "items[].status", "items[].skills"],
    },
    {
        "id": "projects",
        "method": "GET",
        "path": "/api/company/{id}/projects",
        "auth": "admin",
        "used_by": "管理台·项目与任务、总览",
        "fields": [
            "items[].id", "items[].name", "items[].status", "items[].client_name",
            "items[].budget_cents", "items[].cost_cents", "items[].margin_cents",
            "items[].progress.done", "items[].progress.total", "items[].progress.pct",
        ],
    },
    {
        "id": "events_bus",
        "method": "GET",
        "path": "/api/events",
        "auth": "admin",
        "used_by": "老板 OS · 实时看板；引擎台 · 事件观察",
        "fields": ["id", "type", "at", "order_id", "run_id", "data"],
    },
    {
        "id": "events_stats",
        "method": "GET",
        "path": "/api/events/stats",
        "auth": "admin",
        "used_by": "排查「页面不联动」时先看这里",
        "fields": ["seq", "listeners", "history", "last"],
    },
    {
        "id": "kb_entries",
        "method": "GET",
        "path": "/api/kb/entries",
        "auth": "admin",
        "used_by": "知识库管理、排障「员工为什么没查到这条」",
        "fields": [
            "items[].id", "items[].title", "items[].kind", "items[].tags",
            "items[].scope_services", "items[].scope_roles", "items[].archived",
            "status.entries", "status.scoped", "status.common", "status.archived",
        ],
    },
    {
        "id": "order_events",
        "method": "GET",
        "path": "/api/orders/{order_id}/events",
        "auth": "order_key",
        "used_by": "买家交付页 · 状态即时更新",
        "fields": ["id", "type", "at", "order_id", "data"],
    },
    {
        "id": "order_package",
        "method": "GET",
        "path": "/api/orders/{order_id}/package",
        "auth": "order_key",
        "used_by": "买家交付页·文件包清单",
        "fields": [
            "order_id", "files[].name", "files[].bytes", "total_bytes",
            "formats", "available.pdf", "download.zip",
        ],
    },
    {
        "id": "order_feedback",
        "method": "GET",
        "path": "/api/orders/{order_id}/feedback",
        "auth": "order_key",
        "used_by": "买家交付页·「哪里不对」入口与意见记录",
        "fields": [
            "items[].id", "items[].note", "items[].tags", "items[].status",
            "items[].result.score_before", "items[].result.score_after",
            "can_submit", "max_rounds", "tags",
        ],
    },
    {
        "id": "order_feedback_submit",
        "method": "POST",
        "path": "/api/orders/{order_id}/feedback",
        "auth": "order_key",
        "used_by": "买家交付页·提交意见并触发返工",
        "fields": ["ok", "feedback.id", "feedback.round", "feedback.note", "feedback.status"],
    },
    {
        "id": "memories",
        "method": "GET",
        "path": "/api/company/{id}/memories",
        "auth": "admin",
        "used_by": "管理台·员工学到了什么（跨任务长期记忆）",
        "fields": [
            "items[].id", "items[].kind", "items[].content", "items[].role",
            "items[].service_id", "items[].source", "items[].score",
            "stats.total", "stats.by_kind", "stats.enabled",
        ],
    },
    {
        "id": "memories_create",
        "method": "POST",
        "path": "/api/company/{id}/memories",
        "auth": "admin",
        "used_by": "管理台·手动钉一条经验（只有人知道的规矩）",
        "fields": ["ok", "memory.id", "memory.kind", "memory.content", "memory.role", "memory.service_id", "memory.score"],
    },
    {
        "id": "project_detail",
        "method": "GET",
        "path": "/api/projects/{id}",
        "auth": "admin",
        "used_by": "管理台·项目详情",
        "fields": ["project.id", "project.status", "tasks[].id", "tasks[].title", "tasks[].status", "approvals"],
    },
    {
        "id": "approvals",
        "method": "GET",
        "path": "/api/company/{id}/approvals",
        "auth": "admin",
        "used_by": "管理台·等我拍板、总览",
        "fields": ["items[].id", "items[].title", "items[].risk", "items[].status"],
    },
    {
        "id": "pnl",
        "method": "GET",
        "path": "/api/company/{id}/pnl",
        "auth": "admin",
        "used_by": "管理台·经营账本、总览",
        "fields": [
            "pnl.revenue", "pnl.cost", "pnl.profit", "pnl.margin",
            "pnl.projects_delivered", "ledger[].kind", "ledger[].amount", "ledger[].description",
        ],
    },
    {
        "id": "customers",
        "method": "GET",
        "path": "/api/company/{id}/customers",
        "auth": "admin",
        "used_by": "管理台·客户与回访",
        "fields": [
            "items[].name", "items[].stage", "items[].orders", "items[].spend", "items[].margin",
            "items[].quality", "items[].revisit", "items[].revisit_note",
            "items[].suggest.name", "items[].suggest.why",
            "summary.customers", "summary.repeat_rate", "summary.revenue", "summary.due",
        ],
    },
    {
        "id": "brief",
        "method": "GET",
        "path": "/api/company/{id}/brief",
        "auth": "admin",
        "used_by": "管理台·总览「今天先做这几件」",
        "fields": [
            "date", "headline", "actions[].kind", "actions[].title", "actions[].detail", "actions[].tab", "advice",
            # v0.5.1 起：这份简报可能是调度器提前生成并落库的
            "generated_at", "source", "brief_date", "persisted",
        ],
    },
    {
        "id": "brief_history",
        "method": "GET",
        "path": "/api/company/{id}/brief/history",
        "auth": "admin",
        "used_by": "管理台·总览「历史简报」（主动经营，v0.5.1）",
        "fields": ["items[].brief_date", "items[].headline", "items[].source", "items[].generated_at", "total"],
    },
    {
        "id": "brief_generate",
        "method": "POST",
        "path": "/api/company/{id}/brief/generate",
        "auth": "admin",
        "used_by": "管理台·总览「现在扫一遍」（不等调度器的点）",
        "fields": ["ok", "brief.headline", "brief.actions", "brief.advice", "brief.generated_at", "brief.push_status"],
    },
    {
        "id": "brief_scheduler",
        "method": "GET",
        "path": "/api/brief/scheduler",
        "auth": "admin",
        "used_by": "运维面板·调度器状态（主动经营，v0.5.1）",
        "fields": ["enabled", "hour", "webhook", "last_run_at", "next_run_at", "runs", "today_brief"],
    },
    {
        "id": "brief_scheduler_run",
        "method": "POST",
        "path": "/api/brief/scheduler/run",
        "auth": "admin",
        "used_by": "运维面板·立刻手动跑一轮",
        "fields": ["ok", "results[].company_id", "results[].ok", "status.hour", "status.last_run_at"],
    },
    {
        "id": "order_create",
        "method": "POST",
        "path": "/api/orders",
        "auth": "public",
        "used_by": "买家商品页下单",
        "fields": [
            "order.id", "order.status", "order.access_key", "order.amount_cents", "order.amount", "order.amount_text",
            "payment.txn_id", "payment.pay_path", "payment.amount_cents", "payment.amount", "idempotent",
        ],
    },
    {
        "id": "order_detail",
        "method": "GET",
        "path": "/api/orders/{id}",
        "auth": "order_key",
        "used_by": "买家交付页 /q/pay/{id}",
        "fields": [
            "order.id", "order.status", "order.product_name", "order.amount_text",
            "steps[].title", "steps[].status", "steps[].agent",
        ],
    },
]

# 交付物内部结构（只在下单后 delivered 态出现），单独声明，因为买家页会逐项渲染
DELIVERABLE_FIELDS = [
    "final_text",
    "quality.rules",
    "quality.score",
    "quality.verdict",
    "quality.items[].name",
    "quality.items[].ok",
    "quality.polish",
    "quality.length.wanted",
    "quality.length.over",
    "quality.form.wanted",
    "quality.form.fit",
    "quality.form.note",
    "feedback.total",
    "feedback.changed",
    "feedback.items[].round",
    "feedback.items[].note",
    "feedback.items[].status",
    "trimmed",
    "appendix[].title",
    "appendix[].text",
    "nodes[].title",
    "nodes[].status",
    "evidence.iterations",
    "evidence.checkpoints",
]

# 错误码约定：前端按 status 分支，不按文案分支（文案随时会被改白话）
ERRORS = {
    "400": "参数本身不合法（如金额为负、回调凭据不匹配）",
    "401": "缺管理令牌",
    "403": "不是本机、且令牌不对；或订单凭据不对",
    "404": "对象不存在（订单 / 项目 / 公司 / 服务）",
    "409": "状态冲突（如已交付还要取消）",
    "422": "必填字段缺失或格式不对",
    "503": "支付通道未配置，暂不接单",
}


def missing(payload, fields):
    """返回 payload 里缺的字段（支持 a.b 与 items[] 两种写法）。"""
    out = []
    for path in fields:
        if not _has(payload, path):
            out.append(path)
    return out


def _has(node, path):
    head, _, rest = path.partition(".")
    is_list = head.endswith("[]")
    key = head[:-2] if is_list else head
    if not isinstance(node, dict) or key not in node:
        return False
    value = node[key]
    if is_list:
        if not isinstance(value, list):
            return False
        if not rest:
            return True
        # 空数组不判缺失：没有数据不等于字段没给
        return all(_has(item, rest) for item in value) if value else True
    if not rest:
        return True
    return _has(value, rest)

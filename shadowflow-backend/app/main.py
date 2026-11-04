"""HTTP surface: the front-end contract for the demo.

Everything the UI needs comes from here — run control, live SSE stream, evidence chain,
knowledge-base retrieval and the policy matrix trial. No browser logic depends on internals.
"""

import hmac
import io
import json
import queue
import threading
import re
import time

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import briefing, bus, company, contract, db, export, feedback, kb, llm, memory, orchestrator, orders, pay, seed_data
from .config import (
    ADMIN_TOKEN,
    APP_VERSION,
    ENGINE_NAME,
    HOST,
    LOOP_MAX_DEPTH,
    PORT,
    PUBLIC_DEMO,
    STATIC_DIR,
    TRUST_PROXY,
)
from .policy import ROLES, compile_checks, default_matrix, describe_matrix, gate

app = FastAPI(title="ShadowFlow Python Engine", version=APP_VERSION)

# ------------------------------------------------------------------ access guard
# 公开：买家侧下单与支付回调（回调靠服务端签发的凭据校验，不靠 header）
# 受保护：经营、审批、账本、知识库、运行控制 —— 这些接口原先对整个局域网敞开。

_LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}
_ORDER_PATH = re.compile(r"^/api/orders/([^/]+)")


def _client_ip(request):
    if TRUST_PROXY:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def _admin_ok(request):
    if ADMIN_TOKEN:
        supplied = request.headers.get("x-admin-token") or request.cookies.get("sf_admin") or ""
        return hmac.compare_digest(str(supplied), ADMIN_TOKEN)
    if PUBLIC_DEMO:
        # 公网演示模式：管理接口对所有人开放。
        # 前提是这个模式只跑一次性演示库（见 config.PUBLIC_DEMO 的注释）。
        return True
    return _client_ip(request) in _LOOPBACK


@app.middleware("http")
async def _guard(request: Request, call_next):
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)

    # 买家侧与公开信息
    if path in ("/api/health", "/api/meta", "/api/qr", "/api/pay/notify", "/api/products"):
        return await call_next(request)
    if path.startswith("/api/products/"):
        return await call_next(request)

    if path.rstrip("/") == "/api/orders":
        if request.method == "POST":
            return await call_next(request)  # 下单本身对买家开放
        if not _admin_ok(request):
            return JSONResponse({"detail": "需要管理令牌"}, status_code=401)
        return await call_next(request)

    m = _ORDER_PATH.match(path)
    if m and m.group(1):
        order_id = m.group(1)
        if _admin_ok(request):
            return await call_next(request)
        order = db.get_order(order_id)
        if not order:
            return JSONResponse({"detail": "订单不存在"}, status_code=404)
        key = request.query_params.get("k") or request.headers.get("x-order-key") or ""
        expected = str(order.get("access_key") or "")
        if not expected or not key or not hmac.compare_digest(str(key), expected):
            return JSONResponse({"detail": "订单访问凭据无效，请使用下单后返回的链接"}, status_code=403)
        return await call_next(request)

    if _admin_ok(request):
        return await call_next(request)
    if ADMIN_TOKEN:
        return JSONResponse({"detail": "缺少或错误的管理令牌"}, status_code=401)
    return JSONResponse(
        {
            "detail": "管理接口仅限本机访问。要在其他设备上使用，请设置环境变量 SF_ADMIN_TOKEN，"
                      "并在页面右上角填入同一串令牌。"
        },
        status_code=403,
    )


@app.on_event("startup")
def _startup():
    seed_data.ensure_seed()
    # 先把种子词条的适用范围补上再建索引：顺序反了，第一次检索仍会按「全库」来。
    kb.backfill_scope()
    kb.reindex()
    db.checkpoint()
    # 上次进程死掉时还挂着 paid/running 的订单，这里补推。
    # 放后台：启动不能被一单旧账拖慢，健康检查要立刻能回。
    def _resume():
        # 先对账：历史上漏记的收入补上，再谈续跑。
        try:
            co = company.list_companies()
            if co:
                gap = company.ledger_gap(co[0]["id"])
                if gap["count"]:
                    fixed = company.reconcile(co[0]["id"])
                    print(f"[startup] 补记漏账 {len(fixed['fixed'])} 笔，共 {fixed['amount_cents'] / 100:.2f} 元")
        except Exception as exc:  # noqa: BLE001
            print(f"[startup] 对账失败：{exc}")
        try:
            res = orders.recover(limit=20)
            if res["resumed"] or res["finished"]:
                print(f"[startup] 续跑 {len(res['resumed'])} 单，收口 {len(res['finished'])} 单")
        except Exception as exc:  # noqa: BLE001 - 自愈失败不能拦住启动
            print(f"[startup] 续跑失败：{exc}")
        try:
            # 算法升级后老交付没有新字段，按新口径重算，避免新单老单两套分数。
            fixed = orders.backfill_quality()
            if fixed:
                print(f"[startup] 按新口径重算 {len(fixed)} 单的历史交付自检")
        except Exception as exc:  # noqa: BLE001
            print(f"[startup] 历史交付重算失败：{exc}")

    threading.Thread(target=_resume, name="sf-recover", daemon=True).start()

    def _watchdog():
        # 每 20 秒补一次位。只捞「一分钟没动过」的单，避免跟正在跑的抢。
        while True:
            time.sleep(20)
            res = orders.watchdog_tick(minutes=1, limit=5)
            if res.get("resumed") or res.get("finished"):
                print(f"[watchdog] 续跑 {len(res['resumed'])} 单，收口 {len(res['finished'])} 单")

    threading.Thread(target=_watchdog, name="sf-watchdog", daemon=True).start()

    # 主动经营：调度器线程常驻，到点自己生成当天的经营简报并落库。
    # 老板不打开页面，系统也知道今天该干什么。
    if briefing.start():
        print(f"[startup] 经营简报调度器已启动（每天 {briefing.STATE['hour']} 点生成）")


@app.exception_handler(company.CompanyError)
def _company_error(request: Request, exc: company.CompanyError):
    """业务异常统一映射为对应状态码，避免整站 500。"""
    return JSONResponse({"detail": exc.message}, status_code=getattr(exc, "status", 400))


# ------------------------------------------------------------------ static & health

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.get("/api/health")
def health():
    linfo = dict(llm.info())
    linfo.pop("base_url", None)  # 公开接口不回显模型网关地址
    return {
        "ok": True,
        "engine": ENGINE_NAME,
        "version": APP_VERSION,
        "llm": linfo,
        "kb": kb.status(),
        "pay": pay.info(),
        "loop_max_depth": LOOP_MAX_DEPTH,
        "teams": len(db.list_teams()),
        "agents": [{"id": k, "name": v} for k, v in ROLES.items()],
        "guard": "token" if ADMIN_TOKEN else ("public-demo" if PUBLIC_DEMO else "loopback-only"),
        "orders": orders.stats(),
        "brief": briefing.status(),
        "db": {k: v for k, v in db.status().items() if k != "path"},
    }


@app.get("/api/meta")
def meta():
    """给「其他人的部分」对接用：我现在有什么能力、接口在哪儿、字段叫什么。

    前端 agent 团队、支付对接、模型接入方都可以先读这一页，
    再用 tools/contractcheck.py 跑一遍，确认自己依赖的字段还在。
    """
    return {
        "engine": ENGINE_NAME,
        "version": APP_VERSION,
        "contract_version": contract.CONTRACT_VERSION,
        "entrypoints": {
            "admin": "/os",
            "shop": "/shop",
            "order": "/q/pay/{order_id}?k={access_key}",
            "self_test": "/index.html",
            "openapi": "/openapi.json",
        },
        "capabilities": {
            "quality_gate": True,
            "client_polish": True,
            "customer_book": True,
            "daily_brief": True,
            "order_recovery": True,
            "projects_per_order": True,
            "long_term_memory": True,
            "auto_brief": True,
            "brief_hour": briefing.STATE["hour"],
            "llm_mode": llm.mode(),
            "pay_mode": pay.mode(),
        },
        "endpoints": contract.ENDPOINTS,
        "deliverable_fields": contract.DELIVERABLE_FIELDS,
        "errors": contract.ERRORS,
    }


@app.get("/api/ops/status")
def ops_status():
    """运维面板：订单积压、卡单、队列容量、库体检。只在老板侧可用。"""
    cos = company.list_companies()
    books = company.ledger_gap(cos[0]["id"]) if cos else {"count": 0, "amount_cents": 0}
    return {
        "version": APP_VERSION,
        "orders": orders.stats(),
        "stuck": orders.stuck(minutes=10),
        "books": books,
        "db": {k: v for k, v in db.status().items() if k != "path"},
        "llm": {"mode": llm.mode()},
    }


@app.post("/api/ops/recover")
def ops_recover(payload: dict = Body(default={})):
    """手动续跑卡住的单。minutes 默认 10：只救真的十分钟没动过的。"""
    try:
        minutes = int(payload.get("minutes") or 10)
        limit = int(payload.get("limit") or 20)
    except (TypeError, ValueError):
        raise HTTPException(422, "minutes 与 limit 需为整数")
    return orders.recover(limit=max(1, min(limit, 50)), minutes=max(0, minutes))


# ------------------------------------------------------------------ teams

@app.get("/api/teams")
def teams():
    return {"items": db.list_teams()}


@app.get("/api/teams/{team_id}")
def team_detail(team_id: str):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(404, "team not found")
    checks = compile_checks(team["dag"], team["policy"])
    return {**team, "checks": checks, "matrix_view": describe_matrix(team["policy"])}


@app.post("/api/teams/validate")
def validate_team(payload: dict = Body(...)):
    dag = payload.get("dag") or {}
    policy = payload.get("policy") or default_matrix()
    return compile_checks(dag, policy)


@app.post("/api/teams")
def create_team(payload: dict = Body(...)):
    dag, policy = payload.get("dag") or {}, payload.get("policy") or default_matrix()
    checks = compile_checks(dag, policy)
    if checks["errors"]:
        raise HTTPException(400, {"message": "编译期校验未通过，团队未保存", "checks": checks})
    team = {
        "id": db.new_id("team"),
        "name": payload.get("name") or "未命名团队",
        "description": payload.get("description", ""),
        "dag": dag,
        "policy": policy,
        "version": 1,
    }
    db.save_team(team)
    return {"team": team, "checks": checks}


# ------------------------------------------------------------------ policy

@app.post("/api/policy/simulate")
def policy_simulate(payload: dict = Body(...)):
    team = db.get_team(payload.get("team_id", ""))
    if not team:
        raise HTTPException(404, "team not found")
    sender = payload.get("sender") or "writer"
    receiver = payload.get("receiver") or "legal"
    return gate(team["policy"], sender, receiver)


# ------------------------------------------------------------------ runs

@app.post("/api/runs")
def create_run(payload: dict = Body(...)):
    team = db.get_team(payload.get("team_id") or seed_data.TEAM_ID)
    if not team:
        raise HTTPException(404, "team not found")
    task = _txt(payload.get("task"), 2000) or "为东南亚市场做一次轻小件选品与种草内容，7 天内跑通首单"
    demo = payload.get("demo") or {"reject_once": True}
    run_id = db.create_run(team["id"], task, demo)
    orchestrator.submit(run_id)
    return {"run_id": run_id, "status": "queued"}


@app.get("/api/runs")
def runs(limit: int = Query(20, ge=1, le=100)):
    return {"items": db.list_runs(limit)}


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    team = db.get_team(run["team_id"])
    return {
        "run": run,
        "team": {"id": team["id"], "name": team["name"], "dag": team["dag"], "policy": team["policy"]},
        "nodes": db.node_attempts(run_id),
        "iterations": db.list_iterations(run_id),
        "checkpoints": db.list_checkpoints(run_id),
        "event_count": db.count_events(run_id),
    }


@app.post("/api/runs/{run_id}/stop")
def stop_run(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    if run["status"] in ("completed", "stopped", "failed"):
        return {"ok": False, "status": run["status"], "message": "该运行已结束"}
    db.update_run(run_id, stop_requested=1)
    db.emit(run_id, "run.stop_requested", {"message": "急停指令已下发，将在当前步骤结束后生效"})
    return {"ok": True, "status": "stopping"}


@app.post("/api/runs/{run_id}/resume")
def resume_run(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    if run["status"] not in ("stopped", "failed"):
        return {"ok": False, "status": run["status"], "message": "只有已停止或失败的运行可以续跑"}
    db.update_run(run_id, status="queued", stop_requested=0)
    db.emit(run_id, "run.resumed", {"message": "断点续跑：从最近一条 checkpoint 恢复"})
    orchestrator.submit(run_id, resume=True)
    return {"ok": True, "status": "queued"}


def _sse_stream(filter_, since, request):
    """一条 SSE 流的通用实现：先补历史，再推实时，空闲发心跳。

    补历史这件事不能省：页面刚打开时，前几秒发生的事（比如刚下的单刚付的款）
    如果不补，用户看到的还是旧页面，又变成「点了没反应」。
    """
    last_id = request.headers.get("last-event-id")
    if last_id and last_id.isdigit():
        since = max(since, int(last_id))

    def gen():
        cursor = since
        # 先补历史
        for ev in bus.backlog(cursor, filter_):
            cursor = ev["id"]
            yield f"id: {cursor}\nevent: {ev['type']}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"

        sid, q = bus.subscribe(filter_, cursor)
        idle = 0.0
        try:
            while True:
                try:
                    ev = q.get(timeout=1.0)
                    cursor = ev["id"]
                    yield f"id: {cursor}\nevent: {ev['type']}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"
                    idle = 0.0
                except queue.Empty:
                    idle += 1.0
                    if idle >= 15:
                        # 心跳：中间件/浏览器代理会掐掉长时间没数据的连接
                        yield ": ping\n\n"
                        idle = 0.0
        finally:
            bus.unsubscribe(sid)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/events")
def stream_bus(request: Request, since: int = 0, types: str = ""):
    """管理侧全局事件流：老板 OS 与引擎台都挂这条，谁下单、谁交付，立刻知道。

    types 用逗号分隔前缀，例如 types=order. 只收订单事件；
    不传就是全部（包含引擎逐条步骤事件，调试用）。
    """
    flt = {"types": [t.strip() for t in types.split(",") if t.strip()]} if types else None
    return _sse_stream(flt, since, request)


@app.get("/api/orders/{order_id}/events")
def stream_order_events(order_id: str, request: Request, since: int = 0):
    """买家侧事件流：只听自己这一单。鉴权由中间件按 k= 校验，这里不再重复判。

    和整单轮询的区别：轮询是「每 1.5 秒问一次好了没」，这里是「好了我告诉你」。
    """
    order = db.get_order(order_id)
    if not order:
        raise HTTPException(404, "订单不存在")
    return _sse_stream({"order_id": order_id}, since, request)


@app.get("/api/events/stats")
def stream_stats():
    """有几路在听、总线上到第几条：排查「页面不联动」时先看这个。"""
    return bus.stats()


@app.get("/api/runs/{run_id}/events")
def stream_events(run_id: str, request: Request, since: int = 0):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    last_id = request.headers.get("last-event-id")
    start = max(since, int(last_id) if last_id and last_id.isdigit() else 0)
    terminal = {"run.completed", "run.failed", "run.stopped"}

    def gen():
        cursor = start
        idle = 0.0
        while True:
            rows = db.events_since(run_id, cursor)
            for row in rows:
                cursor = row["seq"]
                payload = json.loads(row["payload"] or "{}")
                payload["type"] = row["type"]
                payload["seq"] = row["seq"]
                payload["ts"] = row["ts"]
                yield f"id: {cursor}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                if row["type"] in terminal:
                    return
            if not rows:
                idle += 0.15
                if idle >= 3:
                    yield ": ping\n\n"
                    idle = 0
                current = db.get_run(run_id)
                if current and current["status"] in ("completed", "stopped", "failed") and not db.events_since(run_id, cursor):
                    return
            time.sleep(0.15)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/runs/{run_id}/report", response_class=PlainTextResponse)
def run_report(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    team = db.get_team(run["team_id"])
    iters = db.list_iterations(run_id)
    nodes = db.node_attempts(run_id)
    lines = [
        f"# ShadowFlow 运行报告 · {run_id}",
        "",
        f"- 团队：{team['name']}（v{team['version']}）",
        f"- 任务：{run['task']}",
        f"- 状态：{run['status']}",
        f"- 创建：{run['created_at']}",
        "",
        "## 节点执行",
        "",
        "| 节点 | 执行者(agent) | 状态 | 轮次 | 尝试 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for n in nodes:
        lines.append(f"| {n['title']} | {n['agent']} | {n['status']} | {n['round'] or '-'} | {n['attempt']} |")
    lines += ["", "## 循环证据链", "", "| 轮次 | 动作 | 验证结论 | 决策 | 得分 |", "| --- | --- | --- | --- | --- |"]
    for it in iters:
        lines.append(f"| {it['round']} | {it['action']} | {it['verification']} | {it['decision']} | {it['score']} |")
    cps = db.list_checkpoints(run_id)
    lines += ["", "## 断点", ""]
    for cp in cps:
        lines.append(f"- {cp['label']}（{cp['created_at']}）")
    return "\n".join(lines)


# ------------------------------------------------------------------ knowledge base

@app.get("/api/kb/status")
def kb_status():
    return kb.status()


@app.get("/api/kb/entries")
def kb_entries():
    return {"items": db.all_kb(), "status": kb.status()}


@app.get("/api/kb/search")
def kb_search(
    q: str = Query("", min_length=0),
    top_k: int = Query(4, ge=1, le=12),
    service_id: str = Query("", description="按服务过滤；留空=管理台全库搜"),
    role: str = Query("", description="按岗位过滤；留空=管理台全库搜"),
):
    # 管理台不传这两个参数就是全库搜（排障用）；传了才按域过滤。
    return kb.search(
        q,
        top_k=top_k,
        service_id=service_id or None,
        role=role or None,
    )


@app.post("/api/kb/entries")
def kb_add(payload: dict = Body(...)):
    title = _txt(payload.get("title"), 120)
    content = _txt(payload.get("content"), 8000)
    if not title or not content:
        raise HTTPException(400, "title 与 content 必填")
    entry = {
        "id": payload.get("id") or db.new_id("kb"),
        "title": title,
        "content": content,
        "tags": payload.get("tags") or [],
        "kind": payload.get("kind") or "term",
        "source": payload.get("source") or "manual",
        # 适用范围：空 = 通用（谁都能查）；给了就只在指定服务/岗位上召回
        "scope_services": payload.get("scope_services") or [],
        "scope_roles": payload.get("scope_roles") or [],
        "archived": payload.get("archived") or False,
    }
    db.upsert_kb(entry)
    kb.reindex()
    return {"ok": True, "entry": entry, "status": kb.status()}


# ------------------------------------------------------------------ OPC OS：公司 / 组织 / 任务 / 治理

def _txt(value, limit=2000):
    """从 payload 里安全取一段文本。

    对接方传数组、对象、数字都是常事。以前这些值直接 .strip() 会把接口打成 500，
    对方只看到 Internal Server Error，还得来问我们；现在统一收敛成字符串或空。
    """
    if value is None:
        return ""
    if not isinstance(value, str):
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            value = str(value)
        else:
            return ""
    return value.strip()[:limit]


def _strs(value, limit=20):
    """把「应该是字符串数组」的入参收敛成数组，别让一个对象把它变成迭代 key。"""
    if not isinstance(value, (list, tuple)):
        return []
    return [v.strip() for v in value if isinstance(v, str) and v.strip()][:limit]


def _company_or_404(company_id=None):
    if company_id:
        c = company.get_company(company_id)
        if not c:
            raise HTTPException(404, f"公司不存在：{company_id}")
        return c
    cs = company.list_companies()
    if not cs:
        raise HTTPException(404, "尚未创建公司")
    return cs[0]


@app.get("/api/models")
def models():
    return {"items": [dict(v, id=k) for k, v in company.MODEL_CATALOG.items()]}


@app.get("/api/company")
def company_default():
    c = _company_or_404()
    return {"company": c, "dashboard": company.dashboard(c["id"])}


@app.get("/api/companies")
def companies():
    return {"items": company.list_companies()}


@app.get("/api/company/{company_id}")
def company_detail(company_id: str):
    _company_or_404(company_id)
    return {"dashboard": company.dashboard(company_id)}


@app.get("/api/company/{company_id}/org")
def company_org(company_id: str):
    _company_or_404(company_id)
    return company.org_chart(company_id)


@app.get("/api/company/{company_id}/roster")
def company_roster(company_id: str):
    _company_or_404(company_id)
    return {"items": company.roster(company_id)}


@app.post("/api/company/{company_id}/employees")
def company_hire(company_id: str, payload: dict = Body(...)):
    _company_or_404(company_id)
    emp_name = _txt(payload.get("name"), 40)
    if not emp_name:
        # 空名字会造出「新员工」这种查无此人的脏数据，宁可让调用方补上
        raise HTTPException(422, "请给员工起个名字")
    try:
        day_rate = int(payload.get("day_rate_cents") or 1000)
    except (TypeError, ValueError):
        raise HTTPException(422, "日成本需为整数分")
    if day_rate < 0:
        raise HTTPException(422, "日成本不能为负")
    try:
        emp = company.hire(
            company_id,
            emp_name,
            _txt(payload.get("role"), 40) or "writer",
            department_id=payload.get("department_id"),
            title=_txt(payload.get("title"), 60),
            seniority=_txt(payload.get("seniority"), 20) or "mid",
            system_prompt=_txt(payload.get("system_prompt"), 4000),
            skills=_strs(payload.get("skills")),
            tools=_strs(payload.get("tools")),
            permissions=_strs(payload.get("permissions")),
            model_name=_txt(payload.get("model_name"), 40) or "gpt-4o",
            day_rate_cents=day_rate,
        )
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)
    return {"employee": emp}


@app.post("/api/company/{company_id}/employees/{employee_id}/fire")
def company_fire(company_id: str, employee_id: str, payload: dict = Body(default={})):
    _company_or_404(company_id)
    try:
        return company.fire(employee_id, reassign_to=payload.get("reassign_to"))
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/company/{company_id}/projects")
def company_projects(company_id: str, limit: int = Query(50, ge=1, le=200)):
    _company_or_404(company_id)
    return {"items": company.list_projects(company_id, limit=limit)}


@app.post("/api/company/{company_id}/projects")
def company_new_project(company_id: str, payload: dict = Body(...)):
    """老板下一个目标，平台自动拆成任务并分派。"""
    goal = _txt(payload.get("goal"), 500)
    if len(goal) < 4:
        raise HTTPException(422, "请把业务目标说清楚，至少要一句话")
    co = _company_or_404(company_id)
    name = _txt(payload.get("name"), 80) or goal[:24]
    try:
        budget = int(payload.get("budget_cents") or 0)
    except (TypeError, ValueError):
        raise HTTPException(422, "预算需为整数分")
    if budget < 0:
        raise HTTPException(422, "预算不能为负")
    project = company.create_project(
        co["id"], name, goal[:2000],
        client_name=(payload.get("client_name") or "")[:80],
        budget_cents=budget,
        order_id=payload.get("order_id"),
    )
    tasks = []
    if payload.get("auto_plan", True):
        tasks = company.plan_project(project["id"], seed_data.playbook_for(payload.get("product_id")))
    return {"project": company.get_project(project["id"]), "tasks": tasks}


@app.get("/api/projects/{project_id}")
def project_detail(project_id: str):
    p = company.get_project(project_id)
    if not p:
        raise HTTPException(404, f"项目不存在：{project_id}")
    tasks = company.list_tasks(project_id=project_id)
    approvals = [a for a in company.list_approvals(p["company_id"], limit=100) if a.get("project_id") == project_id]
    return {"project": p, "tasks": tasks, "approvals": approvals}


@app.post("/api/projects/{project_id}/run")
def project_run(project_id: str, payload: dict = Body(default={})):
    try:
        max_rounds = min(max(int(payload.get("max_rounds") or 12), 1), 50)
        workers = min(max(int(payload.get("workers") or 3), 1), 8)
    except (TypeError, ValueError):
        raise HTTPException(422, "max_rounds 与 workers 需为整数")
    try:
        return company.run_project(project_id, max_rounds=max_rounds, workers=workers)
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/tasks/{task_id}")
def task_detail(task_id: str):
    t = company.get_task(task_id)
    if not t:
        raise HTTPException(404, f"任务不存在：{task_id}")
    return {"task": t}


@app.post("/api/tasks/{task_id}/run")
def task_run(task_id: str, payload: dict = Body(default={})):
    try:
        return company.run_task(task_id, force=bool(payload.get("force")))
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/company/{company_id}/approvals")
def company_approvals(company_id: str, status: str = Query("", description="pending / approved / rejected")):
    _company_or_404(company_id)
    if status and status not in ("pending", "approved", "rejected"):
        # 静默返回空数组会被当成「没有待办」，宁可明说参数不对
        raise HTTPException(422, "status 只能是 pending / approved / rejected")
    return {"items": company.list_approvals(company_id, status=status or None)}


@app.post("/api/approvals/{approval_id}/decide")
def approval_decide(approval_id: str, payload: dict = Body(...)):
    try:
        a = company.decide_approval(
            approval_id,
            payload.get("decision") or "",
            note=payload.get("note") or "",
            decided_by=payload.get("decided_by") or "老板",
        )
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)
    return {"approval": a}


@app.get("/api/company/{company_id}/customers")
def company_customers(company_id: str, revisit_days: int = Query(7, ge=1, le=120)):
    _company_or_404(company_id)
    return company.customer_book(company_id, revisit_days=revisit_days)


@app.get("/api/company/{company_id}/memories")
def company_memories(
    company_id: str,
    role: str = Query("", description="按岗位过滤；留空=全部"),
    service_id: str = Query("", description="按服务过滤；留空=全部"),
    include_archived: bool = Query(False, description="是否包含已归档的"),
    limit: int = Query(100, ge=1, le=500),
):
    """跨任务长期记忆：系统自己记下的教训，下一单自动带进提示词。"""
    _company_or_404(company_id)
    items = memory.list_memories(
        company_id,
        role=role,
        service_id=service_id,
        include_archived=include_archived,
        limit=limit,
    )
    return {"items": items, "stats": memory.stats(company_id)}


@app.post("/api/company/{company_id}/memories")
def company_memory_create(company_id: str, payload: dict = Body(...)):
    """手动钉一条经验。

    系统自动学的经验覆盖不了全部：老板当面说的一句「这个客户就是不要官方腔」，
    或者老员工交接时交代的一句「报价别自己往下压」，都是一次性的、只有人知道的。
    这些手动钉进来，同样会在下一单同岗位同服务的提示词里被带上。
    """
    _company_or_404(company_id)
    content = (payload or {}).get("content") or ""
    if not content.strip():
        raise HTTPException(422, "记忆内容不能为空")
    kind = (payload or {}).get("kind") or memory.KIND_LESSON
    if kind not in (memory.KIND_LESSON, memory.KIND_PREF, memory.KIND_WEAK):
        raise HTTPException(422, "kind 只能是 lesson / pref / weak")
    try:
        row = memory.remember(
            company_id,
            content,
            kind=kind,
            service_id=(payload or {}).get("service_id") or "",
            role=(payload or {}).get("role") or "",
            source="manual",
            title=(payload or {}).get("title") or "",
            score=float((payload or {}).get("score") or 0.7),
        )
    except memory.MemoryError as exc:
        raise HTTPException(exc.status, exc.message)
    return {"ok": True, "memory": row}


@app.delete("/api/company/{company_id}/memories/{memory_id}")
def company_memory_delete(company_id: str, memory_id: str):
    """记错了就该能删。归档而非物理删除，留痕可查。"""
    _company_or_404(company_id)
    row = db.get_memory(memory_id)
    if not row or row.get("company_id") != company_id:
        raise HTTPException(404, "记忆不存在")
    try:
        return {"ok": True, "memory": memory.forget(memory_id)}
    except memory.MemoryError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/company/{company_id}/brief")
def company_brief(
    company_id: str,
    days: int = Query(7, ge=1, le=90),
    refresh: bool = Query(False, description="忽略当天落库的那份，重新现算"),
):
    """今天的经营简报。

    优先返回调度器当天生成并落库的那一份（那是「系统主动扫出来的」，带生成时间和推送状态）；
    当天还没有（比如服务刚起、还没到点）才实时算一次。
    """
    _company_or_404(company_id)
    if not refresh:
        row = db.get_daily_brief(company_id, briefing.today())
        if row:
            payload = dict(row.get("payload") or {})
            payload["generated_at"] = row.get("generated_at")
            payload["source"] = row.get("source")
            payload["brief_date"] = row.get("brief_date")
            payload["persisted"] = True
            return payload
    payload = company.brief(company_id, days=days)
    payload["source"] = "live"
    payload["persisted"] = False
    payload["brief_date"] = briefing.today()
    return payload


@app.get("/api/company/{company_id}/brief/history")
def company_brief_history(company_id: str, limit: int = Query(30, ge=1, le=200)):
    """历史简报：每天一份，能看出「今天和上周比，该做的事变了没有」。"""
    _company_or_404(company_id)
    rows = db.list_daily_briefs(company_id, limit=limit)
    return {
        "items": [
            {
                "brief_date": r["brief_date"],
                "headline": r["headline"],
                "source": r["source"],
                "generated_at": r["generated_at"],
                "actions": len((r.get("payload") or {}).get("actions") or []),
            }
            for r in rows
        ],
        "total": len(rows),
    }


@app.post("/api/company/{company_id}/brief/generate")
def company_brief_generate(company_id: str):
    """手动触发一次简报生成（不等调度器的点）。"""
    _company_or_404(company_id)
    try:
        row = briefing.generate(company_id, source="manual")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"生成失败：{exc}")
    payload = dict(row.get("payload") or {})
    payload["generated_at"] = row.get("generated_at")
    payload["source"] = row.get("source")
    payload["brief_date"] = row.get("brief_date")
    payload["persisted"] = True
    payload["push_status"] = row.get("push_status")
    return {"ok": True, "brief": payload}


@app.get("/api/brief/scheduler")
def brief_scheduler_status():
    """调度器状态：开了没、几点跑、上次跑了什么、下次什么时候。"""
    return briefing.status()


@app.post("/api/brief/scheduler/run")
def brief_scheduler_run(payload: dict = Body(default={})):
    """立刻手动跑一轮所有公司（不等点）。"""
    cid = (payload or {}).get("company_id") or None
    out = briefing.trigger(cid)
    return {"ok": True, "results": out, "status": briefing.status()}


@app.get("/api/company/{company_id}/pnl")
def company_pnl(company_id: str, limit: int = Query(50, ge=1, le=500)):
    """损益 + 流水。

    注意这两块的口径不同，别拿 ledger 求和去对 pnl：
      · pnl 是全部流水的汇总（永远准）
      · ledger 只是最近 limit 条明细（页面用），截断时 ledger_meta.truncated = true
    """
    _company_or_404(company_id)
    data = company.pnl(company_id)
    rows = company.ledger(company_id, limit=limit)
    total = db.q1("SELECT COUNT(*) AS n FROM ledger WHERE company_id = ?", (company_id,))["n"]
    return {
        "pnl": data,
        "ledger": rows,
        "ledger_meta": {
            "returned": len(rows),
            "total": int(total or 0),
            "truncated": int(total or 0) > len(rows),
            "note": "pnl 为全量汇总；ledger 仅为最近若干条明细，不可直接求和当作总额",
        },
        "books": company.ledger_gap(company_id),
    }


@app.post("/api/company/{company_id}/income")
def company_income(company_id: str, payload: dict = Body(...)):
    _company_or_404(company_id)
    try:
        amount = int(payload.get("amount_cents") or 0)
    except (TypeError, ValueError):
        raise HTTPException(422, "金额需为整数分")
    if amount <= 0:
        raise HTTPException(422, "金额必须大于 0")
    return company.add_income(
        company_id,
        payload.get("project_id"),
        amount,
        payload.get("description") or "项目收款",
        category=payload.get("category") or "项目收入",
        ref_id=payload.get("ref_id"),
    )


@app.get("/api/os")
def os_console():
    return FileResponse(str(STATIC_DIR / "os.html"))


# 页面别名：演示时手输地址，输哪个都能开，避免记错路径
@app.get("/os")
@app.get("/os.html")
def os_console_alias():
    return FileResponse(str(STATIC_DIR / "os.html"))


@app.get("/shop.html")
def shop_alias():
    return FileResponse(str(STATIC_DIR / "shop.html"))


@app.get("/index.html")
def index_alias():
    return FileResponse(str(STATIC_DIR / "index.html"))


# ------------------------------------------------------------------ commerce: products

@app.get("/api/products")
def products():
    base = pay.public_base()
    # 金额只给一种权威单位会害人：以 *_cents 为准，另附 *_yuan 供展示。
    # 前端每个地方各写一次 /100，漏一处就是差一百倍。
    items = [
        dict(
            p,
            landing_url=f"{base}/q/{p['id']}",
            price=round(int(p["price_cents"]) / 100, 2),
            price_text=f"¥{int(p['price_cents']) / 100:.0f}",
        )
        for p in db.list_products()
    ]
    return {"items": items, "pay": pay.info(), "base_url": base}


@app.get("/api/qr")
def qr_image(text: str = Query(..., min_length=1, max_length=512), scale: int = Query(6, ge=2, le=16)):
    """SVG 二维码：扫码入口用。缺 segno 时降级为 503，不静默返回空白图。

    上限 512 字符：二维码容量有限，超长文本既扫不出来，也能被用来放大响应体。
    """
    try:
        import segno
    except ImportError:
        raise HTTPException(503, "未安装 segno，无法生成二维码：pip install segno")
    buf = io.BytesIO()
    segno.make(text, error="m").save(buf, kind="svg", scale=scale, border=2)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


@app.get("/api/products/{product_id}")
def product_detail(product_id: str):
    p = db.get_product(product_id)
    if not p:
        raise HTTPException(404, f"服务不存在：{product_id}")
    return {
        "product": dict(p, landing_url=f"{pay.public_base()}/q/{p['id']}"),
        "pay": pay.info(),
    }


# ------------------------------------------------------------------ commerce: orders

@app.post("/api/orders")
def order_create(payload: dict = Body(...)):
    try:
        return orders.place_order(
            payload.get("product_id", ""),
            payload.get("buyer_name", ""),
            payload.get("contact", ""),
            payload.get("requirement", ""),
        )
    except orders.OrderError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/orders")
def order_list(limit: int = Query(50, ge=1, le=200)):
    items = [orders.sync_order(o["id"]) or o for o in db.list_orders(limit)]
    return {"items": items, "pay": pay.info()}


@app.get("/api/orders/{order_id}")
def order_detail(order_id: str):
    o = orders.sync_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    run = db.get_run(o["run_id"]) if o.get("run_id") else None
    steps, project = [], None
    if o.get("project_id"):
        project = company.get_project(o["project_id"])
        steps = [
            {"title": t["title"], "agent": (t.get("assignee") or {}).get("title"), "status": t["status"], "round": None}
            for t in company.list_tasks(project_id=o["project_id"])
        ]
    elif run:
        # 回滚重做会为同一节点写多条记录；买家只关心每个环节的最终状态
        merged = {}
        for n in db.list_run_nodes(o["run_id"]):
            merged[n["node_id"]] = {
                "title": n["title"], "agent": n["agent"], "status": n["status"], "round": n.get("round")
            }
        steps = list(merged.values())
    return {
        "order": o,
        "run": {"id": run["id"], "status": run["status"], "task": run["task"]} if run else None,
        "project": {"id": project["id"], "status": project["status"]} if project else None,
        "steps": steps,
        "events": db.order_events_since(order_id, 0),
    }


@app.get("/api/orders/{order_id}/feedback")
def order_feedback_list(order_id: str):
    o = db.get_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    data = feedback.list_for_order(order_id)
    data["can_submit"] = len(data["items"]) < data["max_rounds"] and o["status"] == "delivered"
    return data


@app.post("/api/orders/{order_id}/feedback")
def order_feedback_submit(order_id: str, payload: dict = Body(...), dry_run: int = Query(0, ge=0, le=1)):
    """客户说「这段不行」：原话存下来，交给写稿的人改一版。

    不等返工做完就返回：改一版要一两分钟，让客户盯着转圈不如先告诉他「收到了」，
    改完结果走同一条事件流推过去（order.reworked）。
    """
    try:
        fb = feedback.submit(
            order_id,
            payload.get("note", ""),
            payload.get("excerpt", ""),
            payload.get("tags") or [],
            dry_run=bool(payload.get("dry_run")) or dry_run,
        )
    except feedback.FeedbackError as exc:
        raise HTTPException(exc.status, exc.message)
    data = feedback.list_for_order(order_id)
    data["can_submit"] = len(data["items"]) < data["max_rounds"]
    return {"ok": True, "feedback": fb, **data}


@app.get("/api/orders/{order_id}/events")
def order_events(order_id: str, since: int = Query(0, ge=0)):
    o = db.get_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    return {"order_id": order_id, "status": o["status"], "items": db.order_events_since(order_id, since)}


@app.get("/api/orders/{order_id}/package")
def order_package_info(order_id: str):
    """包里有什么：页面先看清单再下载，不用把整个包拉下来才知道里面是啥。"""
    o = orders.sync_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    if not (o.get("deliverable") or {}).get("final_text"):
        raise HTTPException(404, "这一单还没交付，暂时没有文件包")
    try:
        data = export.manifest(o, o.get("deliverable"))
    except export.ExportError as exc:
        raise HTTPException(exc.status, exc.message)
    data["available"] = export.available()
    data["download"] = {
        "zip": f"/api/orders/{order_id}/package.zip",
        "pdf": f"/api/orders/{order_id}/package.pdf" if data["available"]["pdf"] else None,
    }
    return data


def _package_response(order_id, fmt):
    """把订单交付物打成文件返回。zip / pdf 各自有明确路由，别的格式落到这里报 400。"""
    from urllib.parse import quote

    o = orders.sync_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    try:
        data, filename, mime = export.build(o, o.get("deliverable") or {}, fmt)
    except export.ExportError as exc:
        raise HTTPException(exc.status, exc.message)
    # ASCII 兜底：老浏览器只认 filename，给个纯英文名，别让它存成 "ShadowFlow-__-xxx.zip"
    ascii_name = f"shadowflow-delivery-{re.sub(r'[^A-Za-z0-9_-]', '', order_id)}.{fmt}"
    return Response(
        content=data,
        media_type=mime,
        headers={
            # 两个都给：老浏览器读 filename，认得 RFC 5987 的读 filename*（中文名不乱码）
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
            "X-Package-Bytes": str(len(data)),
        },
    )


@app.get("/api/orders/{order_id}/package.zip")
def order_package_zip(order_id: str):
    """下载 ZIP 文件包。单独一条路由，不在路径里塞变量 —— 文档和走查脚本都能直接比对。"""
    return _package_response(order_id, "zip")


@app.get("/api/orders/{order_id}/package.pdf")
def order_package_pdf(order_id: str):
    return _package_response(order_id, "pdf")


@app.get("/api/orders/{order_id}/package.{fmt}")
def order_package_other(order_id: str, fmt: str):
    """别的格式明确报 400，别让前端拿到一个 404 去猜是不是接口没了。"""
    return _package_response(order_id, fmt)


@app.post("/api/orders/{order_id}/cancel")
def order_cancel(order_id: str, payload: dict = Body(default={})):
    try:
        return {"order": orders.cancel_order(order_id, payload.get("reason", "buyer_cancelled"))}
    except orders.OrderError as exc:
        raise HTTPException(exc.status, exc.message)


@app.post("/api/pay/notify")
def pay_notify(payload: dict = Body(...)):
    """统一支付回调：沙箱与真实网关共用这一条路由、同一套校验。

    真实网关接入时，这里再加验签、证书与幂等表；订单状态机不动。
    """
    provider = payload.get("provider") or pay.mode()
    probe = payload.get("order_id") or payload.get("out_trade_no") or ""
    order = db.get_order(probe) if probe else None
    ok, txn_id, order_id, reason = pay.verify_callback(provider, payload, order=order)
    if not ok:
        if order:
            db.emit_order(order["id"], "pay.rejected", {"provider": provider, "reason": reason})
        raise HTTPException(400, f"回调校验失败：{reason}")
    if not order:
        raise HTTPException(404, f"回调订单不存在：{order_id}")
    try:
        result = orders.mark_paid(order_id, txn_id=txn_id, provider=provider)
    except orders.OrderError as exc:
        raise HTTPException(exc.status, exc.message)
    return {"ok": True, "idempotent": result["idempotent"], "order": result["order"]}


# ------------------------------------------------------------------ buyer-facing pages (扫码入口)

@app.get("/shop")
def shop_page():
    return FileResponse(str(STATIC_DIR / "shop.html"))


@app.get("/q/pay/{order_id}")
def qr_pay_page(order_id: str):
    return FileResponse(str(STATIC_DIR / "order.html"))


@app.get("/q/{product_id}")
def qr_landing_page(product_id: str):
    return FileResponse(str(STATIC_DIR / "order.html"))


def main():
    import uvicorn

    # 空目录首跑必须先建表+种子：下面的 kb.status() 会查 kb_entries，
    # 不能等到 uvicorn startup 事件才初始化（那时已经晚了）。
    seed_data.ensure_seed()
    print(f"ShadowFlow engine on http://{HOST}:{PORT}  (llm={llm.mode()}, kb={kb.status()['mode']})")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()

"""HTTP surface: the front-end contract for the demo.

Everything the UI needs comes from here — run control, live SSE stream, evidence chain,
knowledge-base retrieval and the policy matrix trial. No browser logic depends on internals.
"""

import io
import json
import time

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import company, db, kb, llm, orchestrator, orders, pay, seed_data
from .config import APP_VERSION, ENGINE_NAME, HOST, LOOP_MAX_DEPTH, PORT, STATIC_DIR
from .policy import ROLES, compile_checks, default_matrix, describe_matrix, gate

app = FastAPI(title="ShadowFlow Python Engine", version=APP_VERSION)


@app.on_event("startup")
def _startup():
    seed_data.ensure_seed()
    kb.reindex()


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
    return {
        "ok": True,
        "engine": ENGINE_NAME,
        "version": APP_VERSION,
        "llm": llm.info(),
        "kb": kb.status(),
        "pay": pay.info(),
        "loop_max_depth": LOOP_MAX_DEPTH,
        "teams": len(db.list_teams()),
        "agents": [{"id": k, "name": v} for k, v in ROLES.items()],
    }


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
    task = (payload.get("task") or "").strip() or "为东南亚市场做一次轻小件选品与种草内容，7 天内跑通首单"
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
        "event_count": len(db.events_since(run_id, 0)),
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
def kb_search(q: str = Query("", min_length=0), top_k: int = Query(4, ge=1, le=12)):
    return kb.search(q, top_k=top_k)


@app.post("/api/kb/entries")
def kb_add(payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(400, "title 与 content 必填")
    entry = {
        "id": payload.get("id") or db.new_id("kb"),
        "title": title,
        "content": content,
        "tags": payload.get("tags") or [],
        "kind": payload.get("kind") or "term",
        "source": payload.get("source") or "manual",
    }
    db.upsert_kb(entry)
    kb.reindex()
    return {"ok": True, "entry": entry, "status": kb.status()}


# ------------------------------------------------------------------ OPC OS：公司 / 组织 / 任务 / 治理

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
    return {"dashboard": company.dashboard(company_id)}


@app.get("/api/company/{company_id}/org")
def company_org(company_id: str):
    return company.org_chart(company_id)


@app.get("/api/company/{company_id}/roster")
def company_roster(company_id: str):
    return {"items": company.roster(company_id)}


@app.post("/api/company/{company_id}/employees")
def company_hire(company_id: str, payload: dict = Body(...)):
    try:
        emp = company.hire(
            company_id,
            payload.get("name") or "新员工",
            payload.get("role") or "writer",
            department_id=payload.get("department_id"),
            title=payload.get("title") or "",
            seniority=payload.get("seniority") or "mid",
            system_prompt=payload.get("system_prompt") or "",
            skills=payload.get("skills") or [],
            tools=payload.get("tools") or [],
            permissions=payload.get("permissions") or [],
            model_name=payload.get("model_name") or "gpt-4o",
            day_rate_cents=int(payload.get("day_rate_cents") or 1000),
        )
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)
    return {"employee": emp}


@app.post("/api/company/{company_id}/employees/{employee_id}/fire")
def company_fire(company_id: str, employee_id: str, payload: dict = Body(default={})):
    try:
        return company.fire(employee_id, reassign_to=payload.get("reassign_to"))
    except company.CompanyError as exc:
        raise HTTPException(exc.status, exc.message)


@app.get("/api/company/{company_id}/projects")
def company_projects(company_id: str, limit: int = Query(50, ge=1, le=200)):
    return {"items": company.list_projects(company_id, limit=limit)}


@app.post("/api/company/{company_id}/projects")
def company_new_project(company_id: str, payload: dict = Body(...)):
    """老板下一个目标，平台自动拆成任务并分派。"""
    goal = (payload.get("goal") or "").strip()
    if len(goal) < 4:
        raise HTTPException(422, "请把业务目标说清楚，至少要一句话")
    co = _company_or_404(company_id)
    name = payload.get("name") or goal[:24]
    project = company.create_project(
        co["id"], name, goal,
        client_name=payload.get("client_name") or "",
        budget_cents=int(payload.get("budget_cents") or 0),
        order_id=payload.get("order_id"),
    )
    tasks = []
    if payload.get("auto_plan", True):
        tasks = company.plan_project(project["id"], seed_data.PLAYBOOK)
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
        return company.run_project(
            project_id,
            max_rounds=int(payload.get("max_rounds") or 12),
            workers=int(payload.get("workers") or 3),
        )
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


@app.get("/api/company/{company_id}/pnl")
def company_pnl(company_id: str):
    return {"pnl": company.pnl(company_id), "ledger": company.ledger(company_id, limit=50)}


@app.post("/api/company/{company_id}/income")
def company_income(company_id: str, payload: dict = Body(...)):
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


# ------------------------------------------------------------------ commerce: products

@app.get("/api/products")
def products():
    base = pay.public_base()
    items = [dict(p, landing_url=f"{base}/q/{p['id']}") for p in db.list_products()]
    return {"items": items, "pay": pay.info(), "base_url": base}


@app.get("/api/qr")
def qr_image(text: str = Query(..., min_length=1), scale: int = Query(6, ge=2, le=16)):
    """SVG 二维码：扫码入口用。缺 segno 时降级为 503，不静默返回空白图。"""
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


@app.get("/api/orders/{order_id}/events")
def order_events(order_id: str, since: int = Query(0, ge=0)):
    o = db.get_order(order_id)
    if not o:
        raise HTTPException(404, f"订单不存在：{order_id}")
    return {"order_id": order_id, "status": o["status"], "items": db.order_events_since(order_id, since)}


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
    ok, txn_id, order_id, reason = pay.verify_callback(provider, payload)
    if not ok:
        if order_id:
            db.emit_order(order_id, "pay.rejected", {"provider": provider, "reason": reason})
        raise HTTPException(400, f"回调校验失败：{reason}")
    if not db.get_order(order_id):
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

    # 命令行入口先确保建表 + 种子数据，避免全新环境首次启动时
    # 打印状态先于 startup 事件查询数据库导致 no such table 崩溃。
    seed_data.ensure_seed()
    kb.reindex()

    print(f"ShadowFlow engine on http://{HOST}:{PORT}  (llm={llm.mode()}, kb={kb.status()['mode']})")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()

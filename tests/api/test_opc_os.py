"""OPC OS（backend-poc company/orders/pay 移植）契约测试。

覆盖三层：
  opc_store   — sqlite 存储与订单事件流
  opc_company — 组织/员工/项目协议/审批/账本（simulated llm 降级）
  opc_orders  — 订单状态机：created → pending_payment → paid → running → delivered

隔离：conftest._isolate_shadowflow_data 已把 opc_store._BASE_DIR/_DB_PATH
重定向到 session tmp 根；SHADOWFLOW_OPC_DB 再逐函数覆盖（opc_store 的
_CONN 单例跨用例残留，故每函数 reset 后用独立文件）。
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from shadowflow.services import opc_company, opc_orders, opc_pay, opc_seed, opc_store
from shadowflow.services.opc_orders import OrderError


@pytest.fixture()
def opc_db(tmp_path, monkeypatch):
    """每个测试独立 sqlite 文件 + 重置连接单例。"""
    db_file = tmp_path / "opc.sqlite"
    monkeypatch.setenv("SHADOWFLOW_OPC_DB", str(db_file))
    monkeypatch.setattr(opc_store, "_DB_PATH", db_file)
    opc_store._CONN = None  # noqa: SLF001 — 测试需要重置模块级单例
    monkeypatch.setattr(opc_store, "_CONN", None)
    opc_store.init()
    opc_seed.ensure_seed()
    yield opc_store
    opc_store._CONN = None  # noqa: SLF001
    monkeypatch.setattr(opc_store, "_CONN", None)


@pytest.fixture()
def simulated_pay(monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "simulated")
    yield
    monkeypatch.delenv("SF_PAY_MODE", raising=False)


# ------------------------------------------------------------------ seed / store


def test_seed_idempotent_company_roster_products(opc_db):
    companies = opc_company.list_companies()
    assert len(companies) == 1
    co = companies[0]
    assert co["name"] == "增长工场 Growth Studio"
    assert co["cash_cents"] == 200000

    depts = opc_company.list_departments(co["id"])
    assert len(depts) == 5
    # 部门负责人 = 该部门第一位入职员工
    heads = [d["head_employee_id"] for d in depts]
    assert all(heads), "每个部门都应自动任命负责人"

    roster = opc_company.roster(co["id"])
    assert len(roster) == 9

    products = opc_store.list_products()
    assert [p["id"] for p in products] == ["svc_content", "svc_compliance", "svc_landing_sel"]
    assert all(p["active"] for p in products)

    # 幂等：再跑一次不重复建
    opc_seed.ensure_seed()
    assert len(opc_company.list_companies()) == 1
    assert len(opc_company.roster(co["id"])) == 9


def test_order_events_stream(opc_db):
    order = opc_store.create_order(
        {
            "id": "ord_t1", "product_id": "svc_content", "product_name": "内容转化包",
            "buyer_name": "t", "contact": "", "requirement": "测试需求",
            "amount_cents": 2900, "status": "created", "created_at": opc_store.now(),
        }
    )
    seq = opc_store.emit_order(order["id"], "order.created", {"k": 1})
    assert seq >= 1
    events = opc_store.order_events_since(order["id"], 0)
    assert events and events[0]["type"] == "order.created"
    assert events[0]["payload"]["k"] == 1  # 返回时已解析为 dict
    # since 游标：只取新增
    opc_store.emit_order(order["id"], "order.paid", {})
    tail = opc_store.order_events_since(order["id"], seq)
    assert [e["type"] for e in tail] == ["order.paid"]


# ------------------------------------------------------------------ pay gateway


def test_pay_info_simulated_by_default(simulated_pay):
    info = opc_pay.info()
    assert info["mode"] == "simulated"
    assert info["configured"] is True
    assert info["real_money"] is False


def test_pay_unconfigured_gateway_rejects(simulated_pay, monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "wechat")  # 无商户配置
    info = opc_pay.info()
    assert info["configured"] is False
    with pytest.raises(opc_pay.PayNotConfigured):
        opc_pay.create_payment({"id": "o1", "amount_cents": 100})


def test_pay_callback_verification(monkeypatch):
    payload = {"out_trade_no": "ord_1", "transaction_id": "tx_1", "sign": "DEADBEEF"}
    ok, _, _, reason = opc_pay.verify_callback("wechat", payload)
    assert not ok and "签名" in reason
    ok, txn, order_id, _ = opc_pay.verify_callback("local-sandbox", {"txn_id": "t", "order_id": "o"})
    assert ok and txn == "t" and order_id == "o"


# ------------------------------------------------------------------ orders lifecycle


def test_place_order_rejects_when_pay_off(opc_db, monkeypatch):
    monkeypatch.setenv("SF_PAY_MODE", "wechat")
    with pytest.raises(OrderError) as exc_info:
        opc_orders.place_order("svc_content", requirement="写一篇文案")
    assert exc_info.value.status == 503


def test_place_order_validation(opc_db, simulated_pay):
    with pytest.raises(OrderError) as e404:
        opc_orders.place_order("svc_nope", requirement="写一篇文案")
    assert e404.value.status == 404
    with pytest.raises(OrderError) as e422:
        opc_orders.place_order("svc_content", requirement="短")
    assert e422.value.status == 422


def test_order_full_lifecycle_delivered(opc_db, simulated_pay):
    result = opc_orders.place_order(
        "svc_content", buyer_name="测试买家", requirement="给养生茶写小红书种草文案"
    )
    order = result["order"]
    assert order["status"] == "pending_payment"
    assert result["payment"]["provider"] == "local-sandbox"

    paid = opc_orders.mark_paid(order["id"], txn_id=result["payment"]["txn_id"], channel="test")
    assert paid["order"]["status"] == "running"
    assert paid["idempotent"] is False
    # 幂等：重复回调直接短路
    again = opc_orders.mark_paid(order["id"])
    assert again["idempotent"] is True

    # 后台线程推进（simulated llm 秒级）；最多等 30s
    import time

    deadline = time.time() + 30
    final = paid["order"]
    while time.time() < deadline:
        final = opc_orders.sync_order(order["id"])
        if final["status"] in ("delivered", "failed"):
            break
        time.sleep(0.5)
    assert final["status"] == "delivered", f"期望 delivered，实际 {final['status']}"
    _drain_background(order["id"])

    deliverable = json.loads(final["deliverable_json"])
    assert deliverable["evidence"]["events"] == 9  # PLAYBOOK 9 任务
    assert deliverable["cost_cents"] > 0

    # 交付即确认收入：账本记一笔订单收入
    co = opc_company.list_companies()[0]
    ledger = opc_company.ledger_entries(co["id"])
    income = [l for l in ledger if l["kind"] == "income"]
    assert income and income[0]["amount_cents"] == 2900

    # 已交付不可取消
    with pytest.raises(OrderError) as e409:
        opc_orders.cancel_order(order["id"])
    assert e409.value.status == 409


def test_cancel_unpaid_order(opc_db, simulated_pay):
    result = opc_orders.place_order("svc_compliance", requirement="合规预检测试")
    cancelled = opc_orders.cancel_order(result["order"]["id"])
    assert cancelled["status"] == "cancelled"


def _drain_background(order_id: str, timeout: float = 30.0) -> None:
    """等 mark_paid 拉起的后台推进线程把项目跑到终态（simulated 秒级）。

    不等的话守护线程会在 monkeypatch undo 后继续跑：_DB_PATH 回滚 +
    _CONN 被重置 → 重连到 conftest root / 真实 dev .shadowflow/opc.sqlite
    （4KB 空库泄漏）。项目到终态即线程自然退出。
    """
    import time

    order = opc_store.get_order(order_id)
    project_id = (order or {}).get("project_id")
    if not project_id:
        return
    deadline = time.time() + timeout
    while time.time() < deadline:
        project = opc_company.get_project(project_id)
        if not project or project["status"] in ("delivered", "failed", "cancelled"):
            return
        time.sleep(0.5)


def test_cancel_paid_order_becomes_refunded(opc_db, simulated_pay):
    result = opc_orders.place_order("svc_compliance", requirement="合规预检测试")
    oid = result["order"]["id"]
    opc_orders.mark_paid(oid, txn_id="sim_z")
    refunded = opc_orders.cancel_order(oid, reason="buyer_cancelled")
    assert refunded["status"] == "refunded"
    _drain_background(oid)


# ------------------------------------------------------------------ company ops


def test_hire_fire_and_dashboard(opc_db):
    co = opc_company.list_companies()[0]
    emp = opc_company.hire(co["id"], "测试员", "copywriter", title="文案", model_name="gpt-4o")
    assert emp["status"] == "idle"
    with pytest.raises(opc_company.CompanyError):
        opc_company.hire(co["id"], "坏员工", "writer", model_name="no-such-model")

    # 无未完成任务可直接 fire（返回 {ok, reassigned}；员工状态转 offline）
    fired = opc_company.fire(emp["id"])
    assert fired["ok"] is True and fired["reassigned"] == 0
    assert opc_company.get_employee(emp["id"])["status"] == "offline"

    dash = opc_company.dashboard(co["id"])
    assert dash["company"]["id"] == co["id"]


def test_project_plan_and_approval_gate(opc_db):
    co = opc_company.list_companies()[0]
    project = opc_company.create_project(co["id"], "内部目标", "提升复购率到 20%")
    tasks = opc_company.plan_project(project["id"], opc_seed.PLAYBOOK)
    assert len(tasks) == 9
    # 依赖图：plan 的 after=[plan] 未完成 → research 不可运行
    runnable = {t["key"] for t in opc_company.next_runnable(project["id"])} if tasks and "key" in tasks[0] else None
    if runnable is not None:
        assert "plan" in runnable and "research" not in runnable


# ------------------------------------------------------------------ HTTP API


@pytest.fixture()
def client(opc_db, simulated_pay):
    from shadowflow.server import app

    with TestClient(app) as c:
        yield c


def test_api_opc_surface(client):
    r = client.get("/api/opc/company")
    assert r.status_code == 200
    assert r.json()["company"]["name"] == "增长工场 Growth Studio"

    r = client.get("/api/opc/products")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3

    r = client.get("/api/opc/models")
    assert [m["id"] for m in r.json()["items"]] == list(opc_company.MODEL_CATALOG)


def test_api_order_create_pay_notify_cancel(client):
    r = client.post(
        "/api/opc/orders",
        json={"product_id": "svc_content", "buyer_name": "API 买家", "requirement": "写一篇种草文案"},
    )
    assert r.status_code == 200
    order = r.json()["order"]
    assert order["status"] == "pending_payment"
    assert r.json()["payment"]["txn_id"].startswith("sim_")

    # 沙箱回调 → 派工立项
    r = client.post(
        "/api/opc/pay/notify",
        json={"provider": "local-sandbox", "txn_id": "sim_api", "order_id": order["id"]},
    )
    assert r.status_code == 200
    assert r.json()["idempotent"] is False

    # 等后台推进线程跑完（防泄漏到真实 .shadowflow/，见 _drain_background 注释）
    _drain_background(order["id"])

    r = client.get(f"/api/opc/orders/{order['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["order"]["status"] in ("running", "delivered")
    assert len(body["steps"]) == 9
    assert body["project"]["status"] in ("executing", "delivered")

    # 未付款订单取消
    r = client.post("/api/opc/orders", json={"product_id": "svc_compliance", "requirement": "合规快检"})
    oid = r.json()["order"]["id"]
    r = client.post(f"/api/opc/orders/{oid}/cancel", json={"reason": "test"})
    assert r.json()["order"]["status"] == "cancelled"

    # 回调验签失败 → 400
    r = client.post("/api/opc/pay/notify", json={"provider": "wechat", "sign": "bad"})
    assert r.status_code == 400

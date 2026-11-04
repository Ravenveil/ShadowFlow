"""客户反馈回流自检：确认「客户说的话真的改了东西，而且下次还记得」。

为什么单独一个工具：v0.4.9 之前，返工只把打回理由喂给模拟器（真模型看不到），
所以「按意见改」其实是「重写一份」；而客户意见更是连记录都没有——客户说
「这段不行」，系统回一句「已收到」，然后什么都不发生。这类问题不测就会复发。

分两段：
  A 离线段（跑在临时库上，不碰演示库、不用起服务）
    A1 提示词里必须同时出现「客户原话」和「上一版正文」——少一个就是抽奖
    A2 客户档案：同一客户上一单的意见，要能出现在这一单的提示词里
    A3 边界：没交付不能提意见、意见太短要拦、一单最多改两轮
  B 在线路段（需要服务在跑）
    B1 真下一单 → 付款 → 等交付
    B2 空意见被拒（422）
    B3 真意见被收下，并且真的触发了返工
    B4 返工结果如实回写：改了说改了，改差了留原版也要说
    B5 第三轮被拒（409）

用法：python tools/feedbackcheck.py
环境变量：SF_BASE（服务地址）、SF_FB_E2E=0 跳过在线路段
退出码 0 = 反馈链路没断
"""

import json
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request

# 离线段跑在临时库上：不污染演示库，也不用先起服务
_TMP = tempfile.mkdtemp(prefix="sf-fbcheck-")
os.environ["SF_DATA_DIR"] = _TMP
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import company, db, feedback  # noqa: E402

BASE = os.getenv("SF_BASE", "http://127.0.0.1:8787").rstrip("/")
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
FAILED = []


def ok(msg):
    print(f"  OK   {msg}")


def bad(msg):
    FAILED.append(msg)
    print(f"  FAIL {msg}")


def http(path, payload=None, method="GET"):
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with _OPENER.open(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except Exception:  # noqa: BLE001
            return exc.code, {}


# ---------------------------------------------------------------- 离线段

def _fake_order(order_id, buyer_key_name="走查客户", contact="", status="delivered"):
    """在临时库里造一张单 + 一个项目。反馈的每个判断都依赖这两样。"""
    db.x(
        "INSERT OR REPLACE INTO orders (id, product_id, product_name, buyer_name, contact,"
        " requirement, amount_cents, status, access_key, project_id, created_at, delivered_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            order_id, "svc_content", "推广文案包", buyer_key_name, contact,
            "写一段中秋新品文案，300 字左右", 2900, status, "ak_test",
            "prj_" + order_id, "2026-11-04T10:00:00.000", "2026-11-04T10:05:00.000",
        ),
    )
    db.x(
        "INSERT OR REPLACE INTO projects (id, company_id, name, goal, client_name, status,"
        " order_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (
            "prj_" + order_id, "cmp_demo", "走查项目", "写一段中秋新品文案，300 字左右",
            buyer_key_name, "delivered" if status == "delivered" else status,
            order_id, "2026-11-04T10:00:00.000", "2026-11-04T10:05:00.000",
        ),
    )
    return db.get_order(order_id)


def a1_prompt_carries_reason():
    print("A1 提示词必须带「客户原话」和「上一版正文」")
    _fake_order("ord_fb_a1")
    project = company.get_project("prj_ord_fb_a1")
    prev = "上一版正文：中秋新品三盒装，现在预订有早鸟价。"
    task = {
        "title": "写三版文案",
        "brief": "",
        "review": {
            "rejected_reason": "客户原话：太官方了，我们店说话不是这个调子",
            "previous_text": prev,
            "client_feedback": True,
        },
    }
    prompt = company._build_prompt(
        {"name": "走查公司", "industry": "零售"}, project,
        {"title": "文案", "seniority": "mid", "skills": [], "role": "copywriter"},
        task, [], "",
    )
    if "太官方了" in prompt:
        ok("客户原话进了提示词")
    else:
        bad("提示词里没有客户原话：返工等于让模型自己猜")
    if "早鸟价" in prompt:
        ok("上一版正文进了提示词（是「改」不是「重写」）")
    else:
        bad("提示词里没有上一版正文：模型只能另写一份，返工成了抽奖")


def a2_customer_memo():
    print("A2 客户档案：上一单的意见要进这一单的提示词")
    _fake_order("ord_fb_a2_old", buyer_key_name="回访客户", contact="wx-8899")
    _fake_order("ord_fb_a2_new", buyer_key_name="回访客户", contact="wx-8899")
    db.create_feedback({
        "id": "fb_old_1", "order_id": "ord_fb_a2_old", "project_id": "prj_ord_fb_a2_old",
        "buyer_key": "c:wx-8899", "note": "别用「尊敬的客户」，我们店说话像邻居",
        "tags": ["太官方"], "status": "applied", "round": 1,
    })
    project = company.get_project("prj_ord_fb_a2_new")
    memo = feedback.memo_for_project(project)
    if memo and "像邻居" in memo:
        ok("同一客户上一单的意见进了这一单的档案")
    else:
        bad(f"客户档案没带上上一单意见（memo={memo!r}）")
    prompt = company._build_prompt(
        {"name": "走查公司", "industry": "零售"}, project,
        {"title": "文案", "seniority": "mid", "skills": [], "role": "copywriter"},
        {"title": "写文案", "brief": ""}, [], "",
    )
    if "像邻居" in prompt:
        ok("客户档案进了提示词")
    else:
        bad("客户档案没进提示词：同一句抱怨客户得说第二遍")


def a3_limits():
    print("A3 边界：没交付不能提、意见太短要拦、最多两轮")
    _fake_order("ord_fb_a3_running", status="running")
    try:
        feedback.submit("ord_fb_a3_running", "这段太官方了", async_=False)
        bad("还没交付就能提意见")
    except feedback.FeedbackError as exc:
        if exc.status == 409:
            ok("没交付就提意见被挡（409）")
        else:
            bad(f"没交付就提意见，状态码 {exc.status}，预期 409")

    _fake_order("ord_fb_a3")
    try:
        feedback.submit("ord_fb_a3", "短", async_=False)
        bad("太短的意见被收下了")
    except feedback.FeedbackError as exc:
        if exc.status == 422:
            ok("太短的意见被挡（422）")
        else:
            bad(f"太短的意见，状态码 {exc.status}，预期 422")

    for i in (1, 2):
        feedback.submit("ord_fb_a3", f"第 {i} 轮意见：太官方了", async_=False)
    try:
        feedback.submit("ord_fb_a3", "第三轮意见", async_=False)
        bad("第三轮意见被收下了：这是烧钱，不是服务")
    except feedback.FeedbackError as exc:
        if exc.status == 409:
            ok("第三轮被挡（409）：自动返工最多两轮")
        else:
            bad(f"第三轮状态码 {exc.status}，预期 409")


# ---------------------------------------------------------------- 在线段

def b_e2e():
    print("B 在线路段：真下单 → 真提意见 → 真返工")
    try:
        http("/api/health")
    except Exception as exc:  # noqa: BLE001
        bad(f"服务不可达，跳过在线段：{exc}")
        return

    st, order = http("/api/orders", {
        "product_id": "svc_content",
        "buyer_name": "反馈走查",
        "contact": "fb-check-001",
        "requirement": "反馈走查用：给一家烘焙店写中秋新品的小红书文案，300 字左右",
    }, method="POST")
    if st != 200:
        bad(f"下单失败：{st} {order}")
        return
    oid = order["order"]["id"]
    key = order["order"].get("access_key") or ""
    pay_info = order.get("payment") or {}
    print(f"  下单 {oid}")
    http("/api/pay/notify", {
        "provider": pay_info.get("mode") or "simulated",
        "order_id": oid, "txn_id": pay_info.get("txn_id") or "", "access_key": key,
    }, method="POST")

    deadline = time.time() + 300
    delivered = False
    while time.time() < deadline:
        st, data = http(f"/api/orders/{oid}?k={key}")
        if st == 200 and (data.get("order") or {}).get("status") == "delivered":
            delivered = True
            break
        time.sleep(3)
    if not delivered:
        bad("等不到交付，在线段没跑完")
        return
    ok("订单已交付")

    st, data = http(f"/api/orders/{oid}/feedback?k={key}")
    if st == 200 and data.get("can_submit"):
        ok(f"意见入口可用，还能改 {data.get('max_rounds')} 版")
    else:
        bad(f"意见入口不可用：{st} {data}")

    st, _ = http(f"/api/orders/{oid}/feedback?k={key}", {"note": "短"}, method="POST")
    if st == 422:
        ok("空意见被拒（422）")
    else:
        bad(f"空意见返回 {st}，预期 422")

    note = "太官方了，我们店说话像邻居，别用「尊敬的客户」那种腔调"
    st, data = http(f"/api/orders/{oid}/feedback?k={key}",
                    {"note": note, "tags": ["太官方"]}, method="POST")
    if st != 200:
        bad(f"提意见失败：{st} {data}")
        return
    ok("意见已收下")
    fb_id = (data.get("feedback") or {}).get("id")

    deadline = time.time() + 300
    item = None
    while time.time() < deadline:
        st, data = http(f"/api/orders/{oid}/feedback?k={key}")
        for it in (data.get("items") or []):
            if it.get("id") == fb_id:
                item = it
        if item and item.get("status") in ("applied", "kept", "failed"):
            break
        time.sleep(3)
    if not item or item.get("status") == "open":
        bad("返工一直没结束：客户的话收了，正文没动")
        return
    if item.get("status") == "failed":
        bad(f"返工失败：{(item.get('result') or {}).get('error')}")
        return
    if item.get("status") == "kept":
        ok("改了一版没比原来好，如实留了原版")
    else:
        ok("已按客户原话改完一版")

    st, data = http(f"/api/orders/{oid}?k={key}")
    deliver = (data.get("order") or {}).get("deliverable") or {}
    fb = deliver.get("feedback") or {}
    texts = [i.get("note") for i in (fb.get("items") or [])]
    if note in texts:
        ok("交付物里能看到客户原话")
    else:
        bad("交付物里没有客户意见段：客户看不到自己的话被记下来")
    if deliver.get("final_text"):
        ok("正文仍在（改后正文没有丢）")
    else:
        bad("返工之后正文没了")

    st, _ = http(f"/api/orders/{oid}/feedback?k={key}",
                 {"note": "第二轮：还是太长"}, method="POST")
    if st == 200:
        ok("第二轮可以提")
    else:
        bad(f"第二轮被拒：{st}")
    st, _ = http(f"/api/orders/{oid}/feedback?k={key}",
                 {"note": "第三轮：不做了"}, method="POST")
    if st == 409:
        ok("第三轮被拒（409）")
    else:
        bad(f"第三轮返回 {st}，预期 409")


def main():
    print("客户反馈回流自检")
    db.init()
    a1_prompt_carries_reason()
    a2_customer_memo()
    a3_limits()
    if os.getenv("SF_FB_E2E", "1") != "0":
        b_e2e()
    else:
        print("B 跳过（SF_FB_E2E=0）")

    shutil.rmtree(_TMP, ignore_errors=True)
    print()
    if FAILED:
        print(f"反馈链路有问题：{len(FAILED)} 项不符预期")
        for f in FAILED:
            print(f"  - {f}")
        return 1
    print("反馈链路完整：收得到、改得动、记得住")
    return 0


if __name__ == "__main__":
    sys.exit(main())

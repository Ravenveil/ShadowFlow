"""批次 1–6 经营流水 + 22 个 Agent 会话一键重演（重跑版，全新库从零跑）。
Phase 1  经营：46 商品 / 70 访问 / 82 单（批次 1: 6/10/12；批次 2–5 各 8/12/14；
         批次 6: 8/12/14），全部经 /api/merchant 写接口真实落库。批次 1–5 逐行按
         原批次数据模式重演（商品/访问/订单序列、支付与退款索引一致；UUID 与时间戳
         为新生成），批次 6 为新设计。
Phase 2  Agent 运行：11 轮 × 2 会话（主会话 byok:anthropic + custom 通道冒烟
         byok:custom-day1），goal 逐字沿用原批次两个原文本。
Phase 3  口径核对：overview / reconcile / first-order + 计数断言。
前置：本地新线实例 :8130（隔离数据目录）+ 双协议确定性模型桩 :8131。"""
import json
import os
import time
import urllib.request

BASE = "http://127.0.0.1:8130"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode())


# 每批次结构：
#   products: [(名称, 售价分, 成本分)]
#   visits:   [(访客, 渠道)]
#   orders:   [(商品名, 访问下标)]           —— 按序下单
#   created:  [下标]                        —— 留未付（验证「只下单未付不算客户」口径）
#   refunds:  [(下标, 退款原因)]            —— 先付后退（退款单成本红字冲销）
BATCHES = [
    {  # 批次 1（首日）：6 商品 / 10 访问 / 12 单（9 已付 + 2 退款 + 1 未付）
        "name": "批次 1（首日）",
        "products": [
            ("竹编收纳篮", 12800, 6000), ("手工陶杯", 8800, 3800),
            ("蜡染围巾", 19900, 9000), ("藤编果盘", 15800, 7200),
            ("手工银饰耳环", 26800, 12000), ("蓝染桌布", 16800, 7600),
        ],
        "visits": [
            ("阿May", "xiaohongshu"), ("老周", "offline_market"), ("阿May", "xiaohongshu"),
            ("小林", "wechat_moments"), ("阿豪", "douyin"), ("小鹿", "xiaohongshu"),
            ("老周", "offline_market"), ("阿May", "xiaohongshu"), ("小鹿", "xiaohongshu"),
            ("大鹏", "offline_market"),
        ],
        "orders": [
            ("竹编收纳篮", 0), ("手工陶杯", 1), ("蜡染围巾", 2), ("藤编果盘", 3),
            ("手工银饰耳环", 4), ("蓝染桌布", 5), ("手工陶杯", 6), ("竹编收纳篮", 7),
            ("蜡染围巾", 8), ("藤编果盘", 9), ("手工银饰耳环", 2), ("蓝染桌布", 5),
        ],
        "created": [11],
        "refunds": [(4, "七天无理由"), (9, "错发退款")],
    },
    {  # 批次 2（晚市 + 次日两波）：8 商品 / 12 访问全转化 / 14 单
        "name": "批次 2（晚市 + 次日两波）",
        "products": [
            ("手工冷制皂", 5800, 2200), ("蓝印花布手提包", 23800, 10800),
            ("竹节书签", 3800, 1200), ("陶艺花器", 32800, 15000),
            ("手工编织杯垫", 4800, 1800), ("扎染抱枕套", 12800, 5500),
            ("木作餐盘", 16800, 7500), ("手工银戒", 19800, 9000),
        ],
        "visits": [
            ("小雅", "xiaohongshu"), ("阿May", "xiaohongshu"), ("老周", "offline_market"),
            ("程程", "douyin"), ("小雅", "xiaohongshu"), ("露露", "wechat_moments"),
            ("阿豪", "douyin"), ("程程", "xiaohongshu"), ("露露", "wechat_moments"),
            ("豆豆", "offline_market"), ("琪琪", "xiaohongshu"), ("豆豆", "offline_market"),
        ],
        "orders": [
            ("手工冷制皂", 0), ("蓝印花布手提包", 1), ("竹节书签", 2), ("陶艺花器", 3),
            ("手工冷制皂", 4), ("蓝印花布手提包", 5), ("竹节书签", 0), ("手工编织杯垫", 6),
            ("扎染抱枕套", 7), ("木作餐盘", 8), ("手工银戒", 9), ("扎染抱枕套", 10),
            ("手工编织杯垫", 11), ("木作餐盘", 1),
        ],
        "created": [6, 13],
        "refunds": [(5, "七天无理由"), (11, "错发退款")],
    },
    {  # 批次 3（周末市集 + 私域回访两波）：8 商品 / 12 访问（6 转化 6 未转化）/ 14 单
        "name": "批次 3（周末市集 + 私域回访两波）",
        "products": [
            ("手工银饰胸针", 15800, 7200), ("竹编灯罩", 19800, 9000),
            ("蜡染围巾", 13800, 5600), ("陶土香插", 6800, 2400),
            ("蓝染抱枕", 9800, 4200), ("手工竹扇", 7800, 2800),
            ("银丝书签", 5800, 2000), ("手作皮具卡包", 12800, 5400),
        ],
        "visits": [
            ("琪琪", "offline_market"), ("阿May", "offline_market"), ("大壮", "offline_market"),
            ("小雅", "xiaohongshu"), ("芊芊", "xiaohongshu"), ("老周", "wechat_moments"),
            ("小鹿", "wechat_moments"), ("程程", "douyin"), ("楠楠", "wechat_moments"),
            ("露露", "xiaohongshu"), ("阿May", "wechat_moments"), ("楠楠", "wechat_moments"),
        ],
        "orders": [
            ("手工银饰胸针", 5), ("竹编灯罩", 1), ("蜡染围巾", 2), ("陶土香插", 3),
            ("手工银饰胸针", 4), ("竹编灯罩", 5), ("蜡染围巾", 0), ("蓝染抱枕", 0),
            ("手工竹扇", 1), ("银丝书签", 2), ("手作皮具卡包", 3), ("蓝染抱枕", 4),
            ("手工竹扇", 1), ("银丝书签", 0),
        ],
        "created": [6, 12],
        "refunds": [(4, "尺寸不合适"), (10, "七天无理由")],
    },
    {  # 批次 4（工作日午间 + 直播专场两波）：8 商品 / 12 访问（6 转化 6 未转化）/ 14 单
        "name": "批次 4（工作日午间 + 直播专场两波）",
        "products": [
            ("手工皂碟", 4800, 1800), ("竹丝扣瓷杯", 16800, 7600),
            ("蓝印花布围裙", 11800, 4800), ("陶铃风锤", 8800, 3200),
            ("手工银戒s925", 18800, 8600), ("竹编果篮", 11800, 5200),
            ("扎染桌旗", 9800, 3800), ("陶土花插", 5800, 2000),
        ],
        "visits": [
            ("小满", "xiaohongshu"), ("阿May", "xiaohongshu"), ("琪琪", "wechat_moments"),
            ("阿豪", "douyin"), ("楠楠", "wechat_moments"), ("大壮", "offline_market"),
            ("小雅", "xiaohongshu"), ("程程", "douyin"), ("老周", "wechat_moments"),
            ("豆豆", "douyin"), ("小鹿", "wechat_moments"), ("阿宁", "xiaohongshu"),
        ],
        "orders": [
            ("手工皂碟", 0), ("竹丝扣瓷杯", 1), ("蓝印花布围裙", 2), ("陶铃风锤", 3),
            ("手工皂碟", 4), ("竹丝扣瓷杯", 5), ("蓝印花布围裙", 0), ("手工银戒s925", 0),
            ("竹编果篮", 1), ("扎染桌旗", 2), ("陶土花插", 3), ("手工银戒s925", 4),
            ("竹编果篮", 5), ("扎染桌旗", 1),
        ],
        "created": [6, 13],
        "refunds": [(5, "错发退款"), (11, "七天无理由")],
    },
    {  # 批次 5（社群团购 + 展会返场两波）：8 商品 / 12 访问（6 转化 6 未转化）/ 14 单
        "name": "批次 5（社群团购 + 展会返场两波）",
        "products": [
            ("手工羊毛毡垫", 7800, 3000), ("竹丝茶则", 8800, 3600),
            ("蜡染书衣", 6800, 2600), ("陶土烛台", 10800, 4400),
            ("手工银杏耳线", 12800, 5600), ("竹编花器", 14800, 6800),
            ("蓝染方巾", 5800, 2200), ("手捏陶碟", 4800, 1600),
        ],
        "visits": [
            ("圆圆", "wechat_moments"), ("阿May", "wechat_moments"), ("小满", "wechat_moments"),
            ("楠楠", "wechat_moments"), ("大壮", "offline_market"), ("芊芊", "xiaohongshu"),
            ("露露", "xiaohongshu"), ("小雅", "xiaohongshu"), ("琪琪", "wechat_moments"),
            ("豆豆", "douyin"), ("老周", "offline_market"), ("阿宁", "wechat_moments"),
        ],
        "orders": [
            ("手工羊毛毡垫", 0), ("竹丝茶则", 1), ("蜡染书衣", 2), ("陶土烛台", 3),
            ("手工羊毛毡垫", 4), ("竹丝茶则", 5), ("蜡染书衣", 0), ("手工银杏耳线", 0),
            ("竹编花器", 1), ("蓝染方巾", 2), ("手捏陶碟", 3), ("手工银杏耳线", 4),
            ("竹编花器", 5), ("蓝染方巾", 1),
        ],
        "created": [6, 13],
        "refunds": [(5, "七天无理由"), (11, "尺寸不合适")],
    },
    {  # 批次 6（新设计，展会返场 + 私域复访两波）：8 商品 / 12 访问（6 转化 6 未转化）/ 14 单
        "name": "批次 6（展会返场 + 私域复访两波）",
        "products": [
            ("竹编提篮", 13800, 6200), ("手工陶壶", 21800, 9800),
            ("蓝染茶席", 8800, 3400), ("银丝耳坠", 16800, 7600),
            ("木作茶盘", 18800, 8500), ("扎染丝巾", 12800, 5200),
            ("手工竹灯", 25800, 11800), ("陶土香炉", 7800, 2800),
        ],
        "visits": [
            ("圆圆", "wechat_moments"), ("阿May", "xiaohongshu"), ("琪琪", "wechat_moments"),
            ("大壮", "offline_market"), ("小雅", "xiaohongshu"), ("楠楠", "douyin"),
            ("露露", "xiaohongshu"), ("程程", "douyin"), ("老周", "wechat_moments"),
            ("豆豆", "offline_market"), ("小雨", "xiaohongshu"), ("阿宁", "wechat_moments"),
        ],
        "orders": [
            ("竹编提篮", 0), ("手工陶壶", 1), ("蓝染茶席", 2), ("银丝耳坠", 3),
            ("竹编提篮", 4), ("手工陶壶", 5), ("蓝染茶席", 0), ("木作茶盘", 0),
            ("扎染丝巾", 1), ("手工竹灯", 2), ("陶土香炉", 3), ("木作茶盘", 4),
            ("扎染丝巾", 5), ("手工竹灯", 1),
        ],
        "created": [6, 13],
        "refunds": [(5, "七天无理由"), (11, "错发退款")],
    },
]

log = []
for batch in BATCHES:
    log.append(f"—— {batch['name']} ——")
    # 1. 上架
    products = {}
    for name, price, cost in batch["products"]:
        p = req("POST", "/api/merchant/products",
                {"name": name, "price_cents": price, "cost_cents": cost})
        products[name] = p
        log.append(f"上架 {name} 售价{price / 100:.0f}元 成本{cost / 100:.0f}元 -> {p.get('id')}")
    # 2. 访问
    visits = []
    for visitor, channel in batch["visits"]:
        v = req("POST", "/api/merchant/visits",
                {"visitor_id": visitor, "channel": channel, "trace_id": ""})
        visits.append(v)
        log.append(f"访问 {visitor} ({channel}) -> visit {v.get('id')}")
    # 3. 下单
    orders = []
    for pname, vi in batch["orders"]:
        o = req("POST", "/api/merchant/orders",
                {"product_id": products[pname]["id"], "visit_id": visits[vi]["id"],
                 "trace_id": ""})
        orders.append(o)
        log.append(f"下单 {pname} (visit {visits[vi]['id']}) -> 订单 {o.get('id')}")
    # 4. 支付（留未付单除外）
    created = set(batch["created"])
    for i, o in enumerate(orders):
        if i in created:
            log.append(f"未付 订单 {o['id']}（留作未付口径样例）")
            continue
        r = req("POST", f"/api/merchant/orders/{o['id']}/pay",
                {"pay_txn_id": f"sim_{o['id'][-6:]}"})
        log.append(f"支付 订单 {o['id']} -> {r.get('status', r)}")
    # 5. 退款
    for idx, reason in batch["refunds"]:
        ref = req("POST", f"/api/merchant/orders/{orders[idx]['id']}/refund", {})
        log.append(f"退款({reason}) 订单 {orders[idx]['id']} -> {ref.get('status', ref)}")

RUNS_DIR = os.path.join(".evidence-run", ".shadowflow", "runs")

GOAL_MAIN = ("为新款便携咖啡杯做小红书种草营销：先调研竞品卖点与目标人群关注点，"
             "产出结构化调研笔记；再基于调研撰写 3 条种草文案，产出营销文案文档。")
GOAL_SMOKE = "（custom 通道冒烟）为竹编收纳篮产出一句种草文案。"
ROUNDS = 11


def consume_stream(sid):
    """消费 SSE 直到流关闭（驱动管线跑完）。返回 data 块数。"""
    r = urllib.request.Request(BASE + f"/api/run-sessions/{sid}/stream")
    chunks = 0
    with urllib.request.urlopen(r, timeout=300) as resp:
        for raw in resp:
            if raw.decode("utf-8", "replace").strip().startswith("data:"):
                chunks += 1
    return chunks


def wait_and_verify(sid, timeout_s=90):
    """轮询等待 runs/<sid>.json 落盘并收尾（critique-result 出现），再校验形态。"""
    path = os.path.join(RUNS_DIR, f"{sid}.json")
    deadline = time.time() + timeout_s
    doc = None
    while time.time() < deadline:
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    doc = json.load(f)
                if any(e.get("event", e.get("type")) == "critique-result"
                       for e in doc.get("events", [])):
                    break
            except (json.JSONDecodeError, OSError):
                pass
        time.sleep(1)
    if doc is None:
        return {"ok": False, "error": "runs 文件未落盘"}
    events = doc.get("events", [])
    names = [e.get("event", e.get("type")) for e in events]
    n = len(events)
    has_usage = "usage" in names
    has_403 = any("Anthropic API 403" in json.dumps(e, ensure_ascii=False) for e in events)
    ok = (167 <= n <= 169 and not has_usage and has_403
          and "critique-result" in names and "complete" in names
          and doc.get("status") == "succeeded")
    return {"events": n, "usage": has_usage, "critique_403": has_403,
            "team_saved": "team-saved" in names, "status": doc.get("status"), "ok": ok}

# ═══════════ Phase 2 · Agent 运行日志（11 轮 × 2 会话 = 22 会话）═══════════
# POST /api/run-sessions 不带 skill_name（实证消除全零 usage 事件，runs 行仍记
# agent-team-blueprint）；POST 仅注册，消费 SSE 才驱动管线跑完；SSE 关闭后
# critique/落盘异步收尾，校验前先轮询等待 critique-result。
manifest = []
all_ok = True
for rnd in range(1, ROUNDS + 1):
    proj = req("POST", "/api/projects", {"name": f"便携咖啡杯小红书营销-第{rnd}轮"})
    pid = proj["project_id"]
    print(f"\n—— 第 {rnd} 轮 · 项目 {pid} ——")
    for goal, executor, kind in [(GOAL_MAIN, "byok:anthropic", "main"),
                                 (GOAL_SMOKE, "byok:custom-day1", "smoke")]:
        label = "主会话" if kind == "main" else "custom冒烟"
        r = req("POST", "/api/run-sessions", {
            "goal": goal, "model": "day1-stub-model", "executor": executor,
            "project_id": pid, "auto_critique": True,
        })
        sid = r["session_id"]
        consume_stream(sid)
        v = wait_and_verify(sid)
        all_ok = all_ok and v.get("ok", False)
        manifest.append({"round": rnd, "kind": kind, "project_id": pid,
                         "session_id": sid, "executor": executor, **v})
        print(f"  {label} {sid} 事件{v.get('events')} 403={v.get('critique_403')} "
              f"usage={v.get('usage')} status={v.get('status')} "
              f"-> {'PASS' if v.get('ok') else 'FAIL'}")

print(f"\n会话共 {len(manifest)} 个，形态校验：{'PASS' if all_ok else 'FAIL'}")

# ═══════════ Phase 3 · 口径核对 ═══════════
overview = req("GET", "/api/merchant/overview")
reconcile = req("GET", "/api/merchant/reconcile")
first = req("GET", "/api/merchant/first-order")
stats = req("GET", "/api/merchant/stats")

print("\n".join(log))
print("\n=== 计数核对 ===")
print(f"商品 {stats['products']}（期望 46） 访问 {stats['visits']}（期望 70） "
      f"订单 {stats['orders']}（期望 82） 账本 {stats['ledger']} 行")
print("\n=== overview ===")
print(json.dumps(overview, ensure_ascii=False))
print("\n=== reconcile ===")
print(json.dumps(reconcile, ensure_ascii=False))
print("\n=== first-order ===")
print(json.dumps(first, ensure_ascii=False)[:400])

ok = (stats["products"] == 46 and stats["visits"] == 70 and stats["orders"] == 82
      and reconcile.get("balanced") and not any(reconcile.get("diffs", {}).values()))
print(f"\n核对结论：{'PASS' if ok else 'FAIL'}")

os.makedirs(".workbuddy-tmp", exist_ok=True)
json.dump({"log": log, "overview": overview, "reconcile": reconcile, "first_order": first,
           "stats": stats, "sessions": manifest, "ok": ok and all_ok},
          open(".workbuddy-tmp/business_full_result.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("已存 .workbuddy-tmp/business_full_result.json")

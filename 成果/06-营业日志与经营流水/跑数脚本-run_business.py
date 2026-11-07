"""新线商家域经营流水 · 完整数据集（第 2 版，全新库从零跑）。
6 商品 / 10 访问（3 复购访客）/ 12 订单（10 支付、2 退款、1 未付）。
全部经 /api/merchant 写接口真实落库，用于生成提交材料 6 的经营流水。"""
import json
import urllib.request

BASE = "http://127.0.0.1:8130"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode())


log = []

# 1. 上架六件手工艺品（售价/成本，单位：分）
catalog = [
    ("竹编收纳篮", 12800, 6000),
    ("手工陶杯", 8800, 3800),
    ("蜡染围巾", 19900, 9000),
    ("藤编果盘", 15800, 7200),
    ("手工银饰耳环", 26800, 12000),
    ("蓝染桌布", 16800, 7600),
]
products = {}
for name, price, cost in catalog:
    p = req("POST", "/api/merchant/products", {"name": name, "price_cents": price, "cost_cents": cost})
    products[name] = p
    log.append(f"上架 {name} 售价{price / 100:.0f}元 成本{cost / 100:.0f}元 -> {p.get('id')}")

# 2. 访问（含同一访客多次访问 = 复购口径；阿May×3 / 老周×2 / 小鹿×2）
visit_plan = [
    ("阿May", "xiaohongshu"), ("老周", "offline_market"), ("阿May", "xiaohongshu"),
    ("小林", "wechat_moments"), ("阿豪", "douyin"), ("小鹿", "xiaohongshu"),
    ("老周", "offline_market"), ("阿May", "xiaohongshu"), ("小鹿", "xiaohongshu"),
    ("大鹏", "offline_market"),
]
visits = []
for visitor, channel in visit_plan:
    v = req("POST", "/api/merchant/visits", {"visitor_id": visitor, "channel": channel, "trace_id": ""})
    visits.append(v)
    log.append(f"访问 {visitor} ({channel}) -> visit {v.get('id')}")

# 3. 下单（12 单：阿May 4 单、老周 2 单、小鹿 2 单 = 3 个复购客户）
order_plan = [
    ("竹编收纳篮", 0), ("手工陶杯", 1), ("蜡染围巾", 2), ("藤编果盘", 3),
    ("手工银饰耳环", 4), ("蓝染桌布", 5), ("手工陶杯", 6), ("竹编收纳篮", 7),
    ("蜡染围巾", 8), ("藤编果盘", 9), ("手工银饰耳环", 2), ("蓝染桌布", 5),
]
orders = []
for pname, vi in order_plan:
    o = req("POST", "/api/merchant/orders",
            {"product_id": products[pname]["id"], "visit_id": visits[vi]["id"], "trace_id": ""})
    orders.append(o)
    log.append(f"下单 {pname} (visit {visits[vi]['id']}) -> 订单 {o.get('id')}")

# 4. 支付（11 单支付；最后一单留未付，验证「只下单未付不算客户」口径）
for o in orders[:-1]:
    r = req("POST", f"/api/merchant/orders/{o['id']}/pay", {"pay_txn_id": f"sim_{o['id'][-6:]}"})
    log.append(f"支付 订单 {o['id']} -> {r.get('status', r)}")
log.append(f"未付 订单 {orders[-1]['id']}（留作未付口径样例）")

# 5. 退款两笔（手工银饰耳环=七天无理由；藤编果盘=错发退款）
for idx, reason in [(4, "七天无理由"), (9, "错发退款")]:
    ref = req("POST", f"/api/merchant/orders/{orders[idx]['id']}/refund", {})
    log.append(f"退款({reason}) 订单 {orders[idx]['id']} -> {ref.get('status', ref)}")

# 6. 口径核对
overview = req("GET", "/api/merchant/overview")
reconcile = req("GET", "/api/merchant/reconcile")
print("\n".join(log))
print("\n=== overview ===")
print(json.dumps(overview, ensure_ascii=False)[:800])
print("\n=== reconcile ===")
print(json.dumps(reconcile, ensure_ascii=False)[:400])
json.dump({"log": log, "overview": overview, "reconcile": reconcile},
          open(".workbuddy-tmp/business_v2_result.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("\n已存 .workbuddy-tmp/business_v2_result.json")

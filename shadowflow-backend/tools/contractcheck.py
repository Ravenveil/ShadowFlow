"""接口契约走查：确认「前端依赖的字段」后端真的还在。

用法：
    python tools/contractcheck.py --base http://127.0.0.1:8787

它会读 /api/meta 拿契约清单，然后逐个打真实接口，把缺字段的接口列出来。
后端改字段、前端改页面之后各跑一次，比人工点页面可靠。

退出码：0 全过；1 有缺失；2 连不上服务。
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, ".")

from app import contract  # noqa: E402


def call(base, method, path, data=None, headers=None, timeout=20):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        base + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})} if body else (headers or {}),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:  # noqa: BLE001
            return exc.code, {"raw": raw.decode("utf-8", "ignore")}
    except urllib.error.URLError as exc:
        print(f"连不上 {base}：{exc}")
        sys.exit(2)


# 这两条是 SSE：连接会一直开着，不能按「读完 JSON」的方式测。
# 只验握手（HTTP 200 + 事件流头），字段由 tools/livecheck.py 真跑一遍去验。
STREAMING = {"events_bus", "order_events"}


def probe_sse(base, path, headers=None, timeout=8):
    """只握手不读流：拿到响应头就断开，别把走查脚本挂在这儿。"""
    req = urllib.request.Request(base + path, method="GET", headers=headers or {})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        ctype = resp.headers.get("Content-Type", "")
        resp.close()
        return resp.status, ctype
    except urllib.error.HTTPError as exc:
        exc.read()
        return exc.code, exc.headers.get("Content-Type", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8787")
    ap.add_argument("--token", default="", help="设置过 SF_ADMIN_TOKEN 时填这里")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    hdr = {"X-Admin-Token": args.token} if args.token else {}

    status, meta = call(base, "GET", "/api/meta")
    if status != 200:
        print(f"/api/meta 不可用（{status}），无法取得契约")
        sys.exit(2)
    print(f"服务 {meta['engine']} v{meta['version']} · 契约 v{meta['contract_version']}")

    # 先把要用的真实 ID 准备好
    _, companies = call(base, "GET", "/api/companies", headers=hdr)
    cid = (companies.get("items") or [{}])[0].get("id")
    _, projects = call(base, "GET", f"/api/company/{cid}/projects", headers=hdr)
    pid = (projects.get("items") or [{}])[0].get("id")
    _, products = call(base, "GET", "/api/products")
    prod = (products.get("items") or [{}])[0]
    _, delivered = call(base, "GET", "/api/orders?limit=50", headers=hdr)
    done = next((o for o in delivered.get("items", []) if o.get("status") == "delivered"), None)
    # 反馈接口一单只允许两轮，挑一单还有额度的来验，否则会撞上 409（那是设计，不是契约坏了）
    fb_order = None
    for o in delivered.get("items", []):
        if o.get("status") != "delivered":
            continue
        used = ((o.get("deliverable") or {}).get("feedback") or {}).get("total") or 0
        if used < 2:
            fb_order = o
            break
    if fb_order is None and done is not None:
        fb_order = done

    order_id = key = None
    results = []
    for ep in contract.ENDPOINTS:
        path = ep["path"]
        if "{order_id}" in path:
            if not done:
                print(f"跳过 {ep['id']}：库里没有已交付订单")
                continue
            target = fb_order if ep["id"].startswith("order_feedback") else done
            path = path.replace("{order_id}", target["id"]) + f"?k={target.get('access_key','')}"
        elif "{id}" in path:
            if ep["id"] in ("project_detail",):
                if not pid:
                    print(f"跳过 {ep['id']}：库里还没有项目")
                    continue
                path = path.replace("{id}", pid)
            elif ep["id"] == "order_detail":
                if not done:
                    print(f"跳过 {ep['id']}：库里没有已交付订单")
                    continue
                path = path.replace("{id}", done["id"]) + f"?k={done.get('access_key','')}"
            else:
                path = path.replace("{id}", cid or "")

        if ep["id"] in STREAMING:
            st, ctype = probe_sse(base, path, hdr)
            miss = [] if (st == 200 and "text/event-stream" in ctype) else [f"SSE 握手失败 HTTP {st} / {ctype or '无类型'}"]
            results.append((ep["id"], st, miss))
            continue

        payload = None
        if ep["method"] == "POST" and ep["id"] == "order_create":
            if not prod:
                print("跳过 order_create：没有上架服务")
                continue
            payload = {
                "product_id": prod["id"],
                "buyer_name": "契约走查",
                "requirement": "契约检查用的一句话需求，不会付款",
            }
        if ep["method"] == "POST" and ep["id"] == "order_feedback_submit":
            # 走 dry_run：只验字段结构，不落库、不触发真返工（一次返工要烧一次模型）
            payload = {
                "note": "契约走查：验证返回字段，不会真的改稿",
                "dry_run": True,
            }
        if ep["method"] == "POST" and ep["id"] == "memories_create":
            payload = {
                "content": "契约走查用的一条经验（会自动归档，不留痕）",
                "kind": "lesson",
                "role": "copywriter",
                "service_id": "svc_content",
            }
        if ep["method"] == "POST" and ep["id"] == "brief_generate":
            payload = {}
        if ep["method"] == "POST":
            st, body = call(base, "POST", path, payload or {}, hdr)
            if ep["id"] == "order_create":
                # 同一个 body 再打一次会走「复用未付单」那条分支。
                # 两条分支返回的字段必须一样，否则前端第一次能用、第二次就白屏。
                st2, body2 = call(base, "POST", path, payload or {}, hdr)
                if st2 < 400:
                    miss2 = contract.missing(body2, ep["fields"])
                    if miss2:
                        results.append((ep["id"] + "（复用分支）", st2, miss2))
                    if (body2.get("order") or {}).get("id") != (body.get("order") or {}).get("id"):
                        results.append((ep["id"] + "（复用分支）", st2, ["未复用同一张单"]))
        else:
            st, body = call(base, "GET", path, None, hdr)

        if st >= 400:
            results.append((ep["id"], st, [f"接口失败 HTTP {st}"]))
            continue
        results.append((ep["id"], st, contract.missing(body, ep["fields"])))

        if ep["id"] == "order_create":
            order_id = (body.get("order") or {}).get("id")
            key = (body.get("order") or {}).get("access_key")

        # 走查造的记录要清掉：契约走查不该在库里留垃圾。
        # DELETE 端点是「归档」（软删），归档项默认不出现在列表和统计里，但行还在表里。
        # 所以归档之后再物理删一次，保证走查后库是干净的。
        if ep["id"] == "memories_create":
            mem_id = (body.get("memory") or {}).get("id")
            if mem_id:
                call(base, "DELETE", f"/api/company/{cid}/memories/{mem_id}", None, hdr)
                _purge_memory(mem_id)

    # 交付物结构：拿一单真的交付过的比
    if done and done.get("deliverable"):
        missing = contract.missing(done["deliverable"], contract.DELIVERABLE_FIELDS)
        results.append(("deliverable", 200, missing))

    bad = [(i, s, m) for i, s, m in results if m]
    for i, s, m in results:
        mark = "OK  " if not m else "MISS"
        print(f"  [{mark}] {i:<16} HTTP {s}" + (f" 缺：{', '.join(m)}" if m else ""))

    print()
    if bad:
        print(f"契约不通过：{len(bad)} 个接口有缺失")
        return 1
    print(f"契约通过：{len(results)} 项全部命中")
    return 0


def _purge_memory(mem_id):
    """物理删掉走查造的那条记忆（归档已经做过了，这里只是把行清干净）。

    直接开库删，不走接口 —— 接口只有「归档」语义，没有「物理删」，
    而走查留一行垃圾在库里会污染后面的演示数字。

    服务可能跑在演示库（data/demo-run/）上而不是主库上，所以按 id 在所有候选库里都删一遍：
    id 是唯一的，删不存在的 id 不报错，删错库也不会误伤别的行。
    """
    import sqlite3
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    cands = [root / "data" / "shadowflow.db", root / "data" / "demo-run" / "shadowflow.db"]
    for path in cands:
        if not path.exists():
            continue
        try:
            conn = sqlite3.connect(str(path))
            conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
            conn.commit()
            conn.close()
        except Exception:  # noqa: BLE001 - 清不清得掉都不影响契约结论
            pass


if __name__ == "__main__":
    sys.exit(main())

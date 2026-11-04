"""脏输入走查：所有写接口喂畸形数据，确认不会 500。

用法：
    python tools/fuzzcheck.py --base http://127.0.0.1:8787

为什么需要它：前端、对接方、爬虫、手抖的同事都会传错类型。
接口返回 422 是正常沟通，返回 500 就是把锅甩给运维。
这个脚本把每个写接口都用「空 body / 类型全错 / 超长字符串」打一遍，
只要有 5xx 就报出来。

注意：会在库里留下少量测试数据，建议指向副本库跑。
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, ".")

# 每种畸形体：(说明, payload)
BAD_PAYLOADS = [
    ("空对象", {}),
    ("类型全错", {"name": {"a": 1}, "title": [1, 2], "goal": {"x": 1}, "content": 3.5,
                 "role": [], "task": {"t": 1}, "product_id": [], "requirement": {"r": 1}}),
    # 统一带 fuzz 前缀：万一真有接口收下了，事后能一条 SQL 认出来清掉
    ("超长字符串", {"name": "fuzz" + "长" * 6000, "title": "fuzz" + "长" * 6000, "goal": "fuzz" + "长" * 6000,
                    "content": "fuzz" + "长" * 6000, "task": "fuzz" + "长" * 6000,
                    "requirement": "fuzz" + "长" * 60000}),
    ("null 值", {"name": None, "title": None, "goal": None, "content": None,
                 "product_id": None, "requirement": None}),
]

# 需要在路径里带真实 ID 的接口，用占位符 {cid} {pid} {tid} {eid} {aid} {oid}
TARGETS = [
    ("/api/teams/validate", "POST"),
    ("/api/policy/simulate", "POST"),
    ("/api/kb/entries", "POST"),
    ("/api/company/{cid}/employees", "POST"),
    ("/api/company/{cid}/projects", "POST"),
    ("/api/company/{cid}/income", "POST"),
    ("/api/company/{cid}/employees/{eid}/fire", "POST"),
    ("/api/projects/{pid}/run", "POST"),
    ("/api/tasks/{tid}/run", "POST"),
    ("/api/approvals/{aid}/decide", "POST"),
    ("/api/orders", "POST"),
    ("/api/orders/{oid}/cancel", "POST"),
    ("/api/pay/notify", "POST"),
    ("/api/ops/recover", "POST"),
    ("/api/runs", "POST"),
]


def call(base, method, path, payload, timeout=40):
    """返回 (状态码, 响应体)。

    响应体要留着而且要完整的：知识库那一条会返回新建词条的 id，靠它跑完自己归档。
    （早先这里截断到 400 字，JSON 被腰斩解析失败，自清理就静默失效了。）
    """
    body = json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=body, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "ignore")
        return exc.code, raw[:120]
    except Exception as exc:  # noqa: BLE001
        return 0, str(exc)[:120]


def cleanup_kb(entries):
    """把自己刚造出来的畸形词条归档。

    为什么必须做：fuzzcheck 每次都会往库里塞 fuzz 词条，它没有业务含义，
    却会参与召回、把真词条挤下去。以前靠人记得跑 `tools/testdata.py --apply`，
    漏一次就漏一条——后来真出过一条漏网的 fuzz 词条排在召回第一位。
    自己造的自己收，比指望人记得干净。
    """
    if not entries:
        return 0
    try:
        sys.path.insert(0, ".")
        from app import db, kb  # noqa: E402

        db.init()
        for row in entries:
            db.set_kb_scope(row, archived=True)
        kb.reindex()
        return len(entries)
    except Exception as exc:  # noqa: BLE001 - 清理失败不该让走查算失败
        print(f"（自清理没成功：{exc}；可手动跑 python tools/testdata.py --apply）")
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8787")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    def get(path):
        try:
            with urllib.request.urlopen(base + path, timeout=20) as resp:
                return json.loads(resp.read() or b"{}")
        except Exception:  # noqa: BLE001
            return {}

    cid = ((get("/api/companies").get("items") or [{}])[0]).get("id")
    projects = get(f"/api/company/{cid}/projects").get("items") or []
    pid = (projects[0] if projects else {}).get("id")
    roster = get(f"/api/company/{cid}/roster").get("items") or []
    eid = (roster[0] if roster else {}).get("id")
    tasks = (get(f"/api/projects/{pid}") or {}).get("tasks") or [] if pid else []
    tid = (tasks[0] if tasks else {}).get("id")
    approvals = get(f"/api/company/{cid}/approvals").get("items") or []
    aid = (approvals[0] if approvals else {}).get("id")
    orders = get("/api/orders?limit=5").get("items") or []
    oid = (orders[0] if orders else {}).get("id")

    subs = {"cid": cid or "", "pid": pid or "", "tid": tid or "",
            "eid": eid or "", "aid": aid or "", "oid": oid or ""}

    bad = []
    created_kb = []
    for path_tpl, method in TARGETS:
        path = path_tpl
        for key, val in subs.items():
            path = path.replace("{" + key + "}", str(val))
        line = []
        for label, payload in BAD_PAYLOADS:
            # 只保留这个接口可能认识的字段，避免把所有字段都塞给每个接口
            st, msg = call(base, method, path, payload)
            line.append(f"{label}={st}")
            if st == 0 or st >= 500:
                bad.append((path_tpl, label, st, msg))
            # 造出来的畸形知识库词条记下来，跑完自己归档
            if path_tpl == "/api/kb/entries" and st == 200:
                try:
                    entry_id = json.loads(msg).get("entry", {}).get("id")
                    if entry_id:
                        created_kb.append(entry_id)
                except (TypeError, ValueError):
                    pass
        print(f"  {'FAIL' if any('=5' in x or '=0' in x for x in line) else 'OK  '} {path_tpl:<42} {'  '.join(line)}")

    print()
    if bad:
        print(f"有 {len(bad)} 处把接口打成了 5xx：")
        for path, label, st, msg in bad:
            print(f"  {path} [{label}] -> {st} {msg}")
        return 1

    cleaned = cleanup_kb(created_kb)
    if cleaned:
        print(f"已自动归档 {cleaned} 条自己造的畸形词条（不再参与召回）")
    print("全部写接口都能扛住畸形输入")
    print("（走查留下的单可用 python tools/testdata.py --apply 从看板上摘掉）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

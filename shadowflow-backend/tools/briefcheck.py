"""主动经营 / 定时任务自检：确认简报真的会自己生成、自己落库、能查历史。

用法：
    python tools/briefcheck.py                 # 离线段（不需要服务）
    python tools/briefcheck.py --base http://127.0.0.1:8789   # 离线段 + 在线段

离线段（不连服务，直接打库）：
  1. daily_briefs 表存在
  2. 生成一份简报并落库
  3. 同一天再生成一次 → 覆盖而不是多一条
  4. 落库的内容里 actions / advice / stats 都在
  5. 历史列表能读出来
  6. 调度器状态里有 hour / enabled / next_run_at

在线段（需要服务）：
  7. GET /api/company/{id}/brief 返回 persisted 的那份
  8. POST /api/company/{id}/brief/generate 能触发一次并落库
  9. GET /api/company/{id}/brief/history 有数据
  10. GET /api/brief/scheduler 状态可读
  11. POST /api/brief/scheduler/run 手动跑一轮

退出码：0 全过；1 有失败。
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PASS = []
FAIL = []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    mark = "OK  " if ok else "FAIL"
    print(f"  [{mark}] {name}" + (f"  {detail}" if detail else ""))
    return ok


def offline():
    print("== 离线段（自己起一个临时库）==")
    tmp = Path(tempfile.mkdtemp(prefix="sf-brief-"))
    os.environ["SF_DATA_DIR"] = str(tmp)
    # 必须在设好环境变量之后再导入 config
    for mod in list(sys.modules):
        if mod.startswith("app"):
            del sys.modules[mod]

    from app import briefing, company, db, seed_data

    db.init()
    seed_data.ensure_seed()
    comps = company.list_companies()
    if not check("有公司可测", bool(comps)):
        return
    cid = comps[0]["id"]

    # 1. 表存在
    tables = {r["name"] for r in db.q("SELECT name FROM sqlite_master WHERE type='table'")}
    check("daily_briefs 表存在", "daily_briefs" in tables)

    # 2. 生成并落库
    row = briefing.generate(cid, source="scheduler", do_push=False)
    check("生成简报并落库", bool(row) and bool(row.get("brief_date")))
    check("落库记录带 headline", bool((row or {}).get("headline")))

    # 3. 同一天再生成 → 覆盖
    before = db.q1("SELECT COUNT(*) AS n FROM daily_briefs WHERE company_id = ?", (cid,))["n"]
    briefing.generate(cid, source="manual", do_push=False)
    after = db.q1("SELECT COUNT(*) AS n FROM daily_briefs WHERE company_id = ?", (cid,))["n"]
    check("同一天重跑是覆盖不是新增", before == after == 1, f"{before} → {after}")

    # 4. 落库内容完整
    got = db.get_daily_brief(cid, briefing.today())
    payload = (got or {}).get("payload") or {}
    # 注意：空种子库里本来就没有待审批 / 待回访 / 在跑项目，actions 自然是空数组。
    # 这里验的是「结构在不在」，不是「有几条」—— 有没有内容是数据问题，不是结构问题。
    check(
        "落库内容含 actions/advice/stats 三个字段",
        "actions" in payload and "advice" in payload and "stats" in payload,
        f"actions={len(payload.get('actions') or [])} advice={len(payload.get('advice') or [])}",
    )
    check("落库内容含公司名与日期", bool(payload.get("company")) and bool(payload.get("date")))
    check("actions 是数组", isinstance(payload.get("actions"), list))

    # 5. 历史能读
    hist = db.list_daily_briefs(cid)
    check("历史列表能读出当天那份", len(hist) == 1 and hist[0]["brief_date"] == briefing.today())

    # 6. 调度器状态
    st = briefing.status()
    check(
        "调度器状态含 hour/enabled/next_run_at",
        st.get("enabled") is not None and st.get("hour") is not None and bool(st.get("next_run_at")),
        f"hour={st.get('hour')} next={st.get('next_run_at')}",
    )

    # 7. 幂等：run_due 在当天已有时不该再生成
    made = briefing.run_due()
    check("当天已有时不再重复生成", made == 0, f"made={made}")

    # 8. force 时会覆盖
    forced = briefing.run_due(force=True)
    check("force 会重新生成", forced >= 1, f"made={forced}")

    shutil.rmtree(tmp, ignore_errors=True)


def call(base, method, path, data=None, timeout=30):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        base + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        # 绕开系统代理：走查目标都在本机，被代理拦一次就是白跑。
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:  # noqa: BLE001
            return exc.code, {"raw": raw.decode("utf-8", "ignore")}
    except Exception as exc:  # noqa: BLE001
        print(f"连不上 {base}：{exc}")
        return 0, {}


def online(base):
    print(f"\n== 在线段（{base}）==")
    st, meta = call(base, "GET", "/api/meta")
    if not check("/api/meta 可用", st == 200, f"HTTP {st}"):
        return
    check("capabilities 里有 auto_brief", bool((meta.get("capabilities") or {}).get("auto_brief")))
    check("契约版本已升到 2.1", meta.get("contract_version") == "2.1", str(meta.get("contract_version")))

    st, comps = call(base, "GET", "/api/companies")
    items = comps.get("items") or []
    if not check("能拿到公司列表", st == 200 and bool(items), f"HTTP {st}"):
        return
    cid = items[0]["id"]

    # 7. brief 返回落库那份
    st, b = call(base, "GET", f"/api/company/{cid}/brief")
    check("GET brief 可用", st == 200 and bool(b.get("headline")), f"HTTP {st}")
    check("brief 标了来源", b.get("source") in ("scheduler", "manual", "live"), str(b.get("source")))
    check("brief 带 generated_at 字段", "generated_at" in b)

    # 8. 手动触发
    st, g = call(base, "POST", f"/api/company/{cid}/brief/generate", {})
    check("POST brief/generate 可用", st == 200 and bool((g.get("brief") or {}).get("headline")), f"HTTP {st}")
    check("生成结果标了 persisted", (g.get("brief") or {}).get("persisted") is True)

    # 9. 历史
    st, h = call(base, "GET", f"/api/company/{cid}/brief/history")
    check("GET brief/history 可用", st == 200 and h.get("total", 0) >= 1, f"total={h.get('total')}")

    # 10. 调度器状态
    st, sc = call(base, "GET", "/api/brief/scheduler")
    check("GET brief/scheduler 可用", st == 200 and sc.get("hour") is not None, f"HTTP {st}")
    check("调度器有 next_run_at", bool(sc.get("next_run_at")), str(sc.get("next_run_at")))

    # 11. 手动跑一轮
    st, r = call(base, "POST", "/api/brief/scheduler/run", {})
    check("POST brief/scheduler/run 可用", st == 200 and bool(r.get("results")), f"HTTP {st}")
    check("跑完有结果记录", bool((r.get("results") or [{}])[0].get("ok")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="", help="带上这个就跑在线段")
    args = ap.parse_args()

    offline()
    if args.base:
        online(args.base.rstrip("/"))

    print()
    print(f"通过 {len(PASS)} 项，失败 {len(FAIL)} 项")
    if FAIL:
        for f in FAIL:
            print(f"  失败：{f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

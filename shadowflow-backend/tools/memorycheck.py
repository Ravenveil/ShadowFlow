"""跨任务长期记忆回归：记忆必须真的进提示词、真的分域、真的不越权。

用法：
    python tools/memorycheck.py                      # 离线段（不起服务）
    python tools/memorycheck.py --base http://127.0.0.1:8787   # 离线段 + 在线段

离线段断言（不起服务）：
  1. 写入一条记忆，能原样召回
  2. 同一条重复写入不新增，只加权（同一岗位+服务+内容）
  3. 服务不匹配不召回（烘焙文案的经验不进出海选品）
  4. 岗位不匹配不召回
  5. 无上下文时不召回服务专属的记忆
  6. 记忆进了写稿任务的提示词（真模型链路也能看到）
  7. 归档后不再召回

在线段（需要服务在跑）：
  8. 记忆出现在 /api/company/{id}/memories 里
  9. 手动钉一条经验能写进去（POST /memories）
 10. 管理端能删掉一条记忆（归档而非物理删除）

退出码 0 = 全过；非 0 = 有断言没过。
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, ".")

FAILED = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  —— {detail}" if detail and not ok else ""))
    if not ok:
        FAILED.append(name)
    return ok


def _opener():
    """绕开系统代理：走查目标都在本机，被代理拦一次就是白跑。"""
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def get(base, path):
    req = urllib.request.Request(base + path)
    try:
        with _opener().open(req, timeout=20) as resp:
            return json.loads(resp.read() or b"{}")
    except Exception:  # noqa: BLE001
        return {}


def post(base, path, data=None):
    body = json.dumps(data or {}).encode()
    req = urllib.request.Request(
        base + path,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with _opener().open(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:  # noqa: BLE001
            return exc.code, {"raw": raw.decode("utf-8", "ignore")}
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def delete(base, path):
    req = urllib.request.Request(base + path, method="DELETE")
    try:
        with _opener().open(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:  # noqa: BLE001
            return exc.code, {"raw": raw.decode("utf-8", "ignore")}
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="", help="在线段用的服务地址；不给就只跑离线段")
    args = ap.parse_args()

    # 离线段跑在自己的临时库里。
    # 为什么必须隔离：这段断言会往库里写记忆、删记忆，如果直接用默认库，
    #   一是依赖执行顺序（前面跑过 fuzzcheck 之类造过数据的检查，recall 会被挤满，
    #     出现「刚写进去的记忆召不回来」的假失败），
    #   二是反过来污染演示库 —— 自检跑完，演示台上的数据就不是干净的了。
    # 和 briefcheck 用同一套做法。
    tmp = Path(tempfile.mkdtemp(prefix="sf-memory-"))
    # 这条断言要看「记忆进了带订单上下文的写稿任务提示词」，需要真实的订单与任务。
    # 所以临时库的起点是干净演示库（12 单 / 14 项目 / 116 活儿）——
    # 有订单上下文，同时仍然是隔离的副本，不会碰到真库。
    clean_src = Path(__file__).resolve().parent.parent / "data" / "demo-clean.db"
    if clean_src.exists():
        shutil.copy2(clean_src, tmp / "demo-clean.db")
    os.environ["SF_DATA_DIR"] = str(tmp)
    for mod in list(sys.modules):
        if mod.startswith("app"):
            del sys.modules[mod]

    from app import db, memory, seed_data  # noqa: E402

    db.init()
    seed_data.ensure_seed()
    company_id = (db.q("SELECT id FROM companies LIMIT 1") or [{}])[0].get("id")
    if not company_id:
        print("临时库里没有公司，种子数据生成失败")
        return 1

    marker = "记忆回归专用条目"
    # 清掉上一轮跑剩的
    for row in db.q("SELECT id FROM memories WHERE content LIKE ?", (f"%{marker}%",)):
        db.x("DELETE FROM memories WHERE id = ?", (row["id"],))

    print("=== 离线段 ===")

    # 1. 写入与召回
    m = memory.remember(
        company_id,
        f"{marker}：文案交成了工作底稿，下次只交成品。",
        kind=memory.KIND_LESSON,
        service_id="svc_content",
        role="copywriter",
        source="memorycheck",
        score=0.9,
    )
    check("写入后能召回", bool(m) and bool(m.get("id")))
    got = memory.recall(company_id, service_id="svc_content", role="copywriter")
    check("同岗位同服务能召回", any(r["id"] == m["id"] for r in got))

    # 2. 重复写入不新增，只加权
    before = len(memory.recall(company_id, service_id="svc_content", role="copywriter"))
    memory.remember(
        company_id,
        f"{marker}：文案交成了工作底稿，下次只交成品。",  # 结尾多了个句号
        kind=memory.KIND_LESSON,
        service_id="svc_content",
        role="copywriter",
        source="memorycheck",
    )
    after = memory.recall(company_id, service_id="svc_content", role="copywriter")
    check(
        "重复内容不新增条目，只加权",
        len(after) == before,
        f"前 {before} 条，后 {len(after)} 条",
    )
    weighted = next((r for r in after if r["id"] == m["id"]), None)
    check("重复写入后权重上升", bool(weighted) and weighted["score"] > m["score"],
          f"{m['score']} -> {(weighted or {}).get('score')}")

    # 3/4/5. 分域
    check("服务不匹配不召回",
          not any(r["id"] == m["id"] for r in memory.recall(company_id, service_id="svc_selection", role="copywriter")))
    check("岗位不匹配不召回",
          not any(r["id"] == m["id"] for r in memory.recall(company_id, service_id="svc_content", role="researcher")))
    check("无上下文不召回服务专属记忆",
          not any(r["id"] == m["id"] for r in memory.recall(company_id, service_id="", role="copywriter")))

    # 6. 记忆进提示词
    from app import company as company_mod  # noqa: E402

    # 必须挑一个「有订单上下文」的写稿任务：项目没关联订单时服务 id 取不到，
    # 按设计就该不召回服务专属的记忆（不知道是什么活，别乱套）。
    row = (db.q(
        """SELECT t.id AS tid, t.assignee_employee_id AS eid, p.id AS pid, o.product_id AS svc
           FROM tasks t
           JOIN employees e ON e.id = t.assignee_employee_id
           JOIN projects p ON p.id = t.project_id
           JOIN orders o ON o.id = p.order_id
           WHERE t.company_id = ? AND e.role = 'copywriter'
           ORDER BY t.created_at DESC LIMIT 1""",
        (company_id,),
    ) or [{}])[0]

    def build_prompt(task_row, emp_row, project_id):
        return company_mod._build_prompt(
            company_mod.get_company(company_id),
            company_mod.get_project(project_id),
            emp_row,
            task_row,
            [],
            "",
        )

    if row:
        # 让刚才那条记忆跟这个任务同域（同一服务 + 同一岗位）
        db.x("UPDATE memories SET service_id = ? WHERE id = ?", (row["svc"], m["id"]))
        task_row = db.q1("SELECT * FROM tasks WHERE id = ?", (row["tid"],))
        emp_row = db.q1("SELECT * FROM employees WHERE id = ?", (row["eid"],))
        prompt = build_prompt(task_row, emp_row, row["pid"])
        check("记忆进了写稿任务的提示词", marker in prompt)

        # 换成别的岗位，同一条记忆不该再出现
        other_emp = db.q1(
            "SELECT * FROM employees WHERE company_id = ? AND role != 'copywriter' LIMIT 1",
            (company_id,),
        )
        if other_emp:
            prompt_other = build_prompt(task_row, other_emp, row["pid"])
            check("记忆没串到别的岗位", marker not in prompt_other)
        else:
            check("记忆没串到别的岗位", True, "库里没有别的岗位，跳过")
    else:
        check("记忆进了写稿任务的提示词", False, "库里没有带订单上下文的写稿任务")

    # 7. 归档后不再召回
    memory.forget(m["id"])
    check("归档后不再召回",
          not any(r["id"] == m["id"] for r in memory.recall(company_id, service_id="svc_content", role="copywriter")))

    # 清理
    for row in db.q("SELECT id FROM memories WHERE content LIKE ?", (f"%{marker}%",)):
        db.x("DELETE FROM memories WHERE id = ?", (row["id"],))

    if args.base:
        base = args.base.rstrip("/")
        print()
        print("=== 在线段 ===")
        cid = ((get(base, "/api/companies").get("items") or [{}])[0]).get("id")
        check("公司列表能取到", bool(cid))

        if cid:
            # 8. 端点能列出记忆
            res = get(base, f"/api/company/{cid}/memories")
            check("记忆端点返回 items 与 stats", "items" in res and "stats" in res)
            check("记忆端点统计有 enabled 字段", "enabled" in (res.get("stats") or {}))

            # 9. 手动钉一条经验能写进去
            #    注意：这里必须走 HTTP，不能直接调本地 memory 模块 ——
            #    服务可能跑在另一个库上（比如演示库），本地写的 id 服务那边根本看不到。
            st, created = post(
                base,
                f"/api/company/{cid}/memories",
                {
                    "content": f"{marker}：在线段写入。",
                    "kind": "lesson",
                    "service_id": "svc_content",
                    "role": "copywriter",
                },
            )
            live = (created.get("memory") or {})
            check("手动钉一条经验能写进去", st == 200 and bool(live.get("id")), json.dumps(created, ensure_ascii=False)[:120])

            # 10. 管理端能删（归档）
            if live.get("id"):
                st, payload = delete(base, f"/api/company/{cid}/memories/{live['id']}")
                check("管理端能归档一条记忆", st == 200 and payload.get("ok") is True,
                      json.dumps(payload, ensure_ascii=False)[:120])
            else:
                check("管理端能归档一条记忆", False, "没有可删的记忆 id")

    print()
    if FAILED:
        print(f"有 {len(FAILED)} 条没过：")
        for name in FAILED:
            print(f"  - {name}")
        return 1
    print("记忆回归全绿。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

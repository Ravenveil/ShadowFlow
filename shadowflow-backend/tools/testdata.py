"""演示数据清理：把走查脚本留下的噪音从「在手项目」里摘出去。

默认只列不动（dry-run）。确认没问题再加 --apply。
不删数据，只把状态改成 cancelled——记录还在，账还能对，只是不再占着看板。

用法：
    python tools/testdata.py            # 看看有哪些
    python tools/testdata.py --apply    # 真的改
"""

import argparse
import sys

sys.path.insert(0, ".")

from app import db  # noqa: E402

# 走查脚本写进去的标记。改脚本里的名字，这里要一起改。
MARKERS = ("走查", "测试", "探针", "fuzz", "竞态")

ORDER_SQL = """
SELECT id, buyer_name, status, project_id, created_at
FROM orders
WHERE status IN ('pending_payment', 'cancelled', 'refunded', 'failed')
ORDER BY rowid DESC
"""

PROJECT_SQL = """
SELECT id, name, status, order_id, created_at
FROM projects
WHERE status NOT IN ('delivered', 'cancelled')
ORDER BY rowid DESC
"""


def looks_test(text):
    return any(m in (text or "") for m in MARKERS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真的修改（默认只列）")
    args = ap.parse_args()

    orders = [row for row in db.q(ORDER_SQL) if looks_test(row["buyer_name"])]
    projects = [row for row in db.q(PROJECT_SQL) if looks_test(row["name"])]

    print(f"未结订单里的走查单：{len(orders)}")
    for row in orders:
        print(f"  {row['id']}  {row['status']:<16} {row['buyer_name']}")

    print(f"\n在做项目里的走查项目：{len(projects)}")
    for row in projects:
        print(f"  {row['id']}  {row['status']:<12} {row['name'][:28]}")

    # 知识库里的走查词条：fuzzcheck 每次往库里塞几条畸形词条，
    # 它们没有业务含义，却会参与召回、把真词条挤下去。归档而不是删除（记录留着，检索不再命中）。
    kb_rows = [
        e for e in db.all_kb()
        if not e.get("archived") and looks_test(e.get("title"))
    ]
    print(f"\n知识库里会被召回的走查词条：{len(kb_rows)}")
    for row in kb_rows[:10]:
        print(f"  {row['id']}  {row['title'][:24]}")
    if len(kb_rows) > 10:
        print(f"  ……另有 {len(kb_rows) - 10} 条")

    if not (orders or projects or kb_rows):
        print("\n没有需要清理的。")
        return 0

    if not args.apply:
        print("\n只是列出来，没动。确认后加 --apply。")
        return 0

    for row in projects:
        db.x(
            "UPDATE tasks SET status = 'cancelled'"
            " WHERE project_id = ? AND status IN ('todo', 'blocked', 'review', 'running')",
            (row["id"],),
        )
        db.x("UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ?", (db.now(), row["id"]))
    for row in orders:
        if row["status"] == "pending_payment":
            db.x("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending_payment'", (row["id"],))

    if kb_rows:
        from app import kb as kb_mod  # noqa: E402 - 只在真要写的时候才需要重建索引

        for row in kb_rows:
            db.set_kb_scope(row["id"], archived=True)
        kb_mod.reindex()

    print(
        f"\n已停掉 {len(projects)} 个项目、{len(orders)} 张走查单，归档 {len(kb_rows)} 条走查词条。"
        "数据都还在，只是不再上在看板上 / 不再参与召回。"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

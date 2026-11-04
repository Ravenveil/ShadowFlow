"""上台前 10 秒：把该念的数字算出来，念错的概率降到零。

用法：
    python tools/demonumbers.py              # 用当前运行库（data/shadowflow.db）
    python tools/demonumbers.py --db data/demo-clean.db   # 用演示干净库
    python tools/demonumbers.py --check      # 只检查台词文件里的数字有没有过期

为什么需要它：
台词第 1 步要念「12 单、14 个项目、116 个活儿、收了 X 块」。
这些数来自库里，但走查脚本跑过一轮后库里就多几十张单——数字一变，
照着稿念就会念出「台上说 12 单、页面显示 48 单」这种事故。

这个脚本做两件事：
1. 按当前库算出真实口径，直接打出一句能念的话；
2. 跟 docs/演示台词.md 里写死的那句比对，不一致就报「台词过期」。

不连服务、不改数据，纯读。退出码：0 = 台词与库一致，1 = 不一致（该改台词了）。
"""

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 服务跑在哪个数据目录，就校那个目录的库。
# 为什么：演示实例常用 SF_DATA_DIR=data/demo-run 启动（不碰主库）。
# 如果这里固定读主库，校验出来的数字和页面上显示的就对不上 ——
# 台词说 12 单，页面显示 34 单，现场露馅。校错库比不校更糟。
DATA_DIR = Path(os.getenv("SF_DATA_DIR") or (ROOT / "data"))
DEFAULT_DB = DATA_DIR / "shadowflow.db"
SCRIPT = ROOT / "docs" / "演示台词.md"

# 台词第 1 步里的关键数字：单数、项目数、任务数
LINE_RE = re.compile(r"(\d+)\s*单，(\d+)\s*个项目，一共\s*(\d+)\s*个活儿")
MONEY_RE = re.compile(r"收了\s*([\d.]+)\s*块，花了\s*([\d.]+)\s*块[^，]*，赚了\s*([\d.]+)\s*块")


def stats(db_path):
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        def one(sql, *args):
            row = conn.execute(sql, args).fetchone()
            return row[0] if row and row[0] is not None else 0

        delivered = one("SELECT COUNT(*) FROM orders WHERE status = 'delivered'")
        orders_all = one("SELECT COUNT(*) FROM orders")
        projects = one("SELECT COUNT(*) FROM projects")
        tasks = one("SELECT COUNT(*) FROM tasks")
        income = one("SELECT COALESCE(SUM(amount_cents),0) FROM ledger WHERE kind = 'income'")
        expense = one("SELECT COALESCE(SUM(amount_cents),0) FROM ledger WHERE kind = 'expense'")
        return {
            "delivered": delivered,
            "orders_all": orders_all,
            "projects": projects,
            "tasks": tasks,
            "income": income / 100,
            "expense": expense / 100,
            "profit": (income - expense) / 100,
            "margin": round((income - expense) / income * 100, 1) if income else 0.0,
        }
    finally:
        conn.close()


def money(v):
    """台词里念整数：「1377 块」，不念「1377.0 块」。零头留给控制台那一行。"""
    return f"{v:.2f}".rstrip("0").rstrip(".")


def spoken(v):
    """上台念的数取整，跟旧台词的口径一致（收 1377、赚 971 都是整数）。"""
    return int(round(v))


def line_of(s):
    """拼出第 1 步那句台词。"""
    return (
        f'"{s["delivered"]} 单，{s["projects"]} 个项目，一共 {s["tasks"]} 个活儿，全做完了。\n'
        f'> 收了 {spoken(s["income"])} 块，花了 {spoken(s["expense"])} 块，赚了 {spoken(s["profit"])} 块。"'
    )


def check_script(s):
    """跟台词文件里写死的数字比对。"""
    if not SCRIPT.exists():
        print(f"找不到台词文件：{SCRIPT}")
        return 1
    text = SCRIPT.read_text(encoding="utf-8")
    problems = []

    m = LINE_RE.search(text)
    if not m:
        problems.append("台词里找不到「N 单，N 个项目，一共 N 个活儿」这句")
    else:
        got = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        want = (s["delivered"], s["projects"], s["tasks"])
        if got != want:
            problems.append(f"单数/项目/任务：台词写的 {got}，库里是 {want}")

    m2 = MONEY_RE.search(text)
    if not m2:
        problems.append("台词里找不到「收了 X 块，花了 X 块，赚了 X 块」这句")
    else:
        got = tuple(spoken(float(x)) for x in m2.groups())
        want = (spoken(s["income"]), spoken(s["expense"]), spoken(s["profit"]))
        if got != want:
            problems.append(f"收入/成本/利润：台词写的 {got}，库里是 {want}")

    if problems:
        print("台词过期了，请把下面这行换进 docs/演示台词.md：\n")
        print(line_of(s))
        print("\n问题：")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("台词与当前库一致，可以直接上台念。")
    return 0


def pick_db(explicit):
    """决定读哪个库。

    优先级：
      1. 命令行明确给了 --db → 就用它
      2. 运行库 data/shadowflow.db 存在 → 用它（正常演示场景）
      3. 运行库不存在但干净演示库在 → 用干净演示库
         （**刚拿到交付包第一次跑**就是这种情况：包里只有 demo-clean.db，运行库还没建）

    第 3 条很重要：交付包给别人时，对方第一件事就是想看「该念什么数字」，
    这时候如果只报「找不到库」，他根本不知道该跑 start-demo.bat。
    """
    if explicit:
        return Path(explicit)
    if DEFAULT_DB.exists():
        return DEFAULT_DB
    clean = DATA_DIR / "demo-clean.db"
    if not clean.exists():
        # 数据目录是子目录（如 data/demo-run）时，干净库在项目根的 data/ 下
        clean = ROOT / "data" / "demo-clean.db"
    if clean.exists():
        return clean
    return DEFAULT_DB


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="", help="要读的库（默认按 运行库 → 干净演示库 的顺序自动选）")
    ap.add_argument("--check", action="store_true", help="只检查台词是否与库一致")
    args = ap.parse_args()

    db_path = pick_db(args.db)
    if not db_path.exists():
        print(f"找不到库：{db_path}")
        print("（先跑 python tools/demo_reset.py 备一份演示库，或直接启动服务让它自动建库）")
        return 1

    s = stats(db_path)
    print(f"库：{db_path}")
    print(f"  已交付 {s['delivered']} 单 / 共 {s['orders_all']} 单，{s['projects']} 个项目，{s['tasks']} 个活儿")
    print(f"  收入 {money(s['income'])}，成本 {money(s['expense'])}，利润 {money(s['profit'])}，毛利率 {s['margin']}%")
    print()

    if args.check:
        return check_script(s)

    print("第 1 步照着念这一句：\n")
    print(line_of(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())

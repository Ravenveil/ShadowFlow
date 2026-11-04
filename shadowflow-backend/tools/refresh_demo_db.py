"""把干净演示库刷新到当前口径：补新表、补新字段、按现行规则重算历史评分。

为什么需要它：
  `data/demo-clean.db` 是**随包发出去**的演示库（新人拿到就能跑）。
  但它是某个时刻的快照：之后的版本给交付物加了新字段、给评分改了规则，
  库里那些老交付还是老样子 —— 对接方按契约取字段就缺，演示台词里的分数也对不上。

  这个脚本做三件事，都不改动「单数 / 项目数 / 任务数 / 收入」这些演示口径：
    ① 建齐所有表（新建的表补上，老表不动）
    ② 按现行规则回填交付物里缺的字段（trimmed / appendix / feedback …）
    ③ 按现行评分规则重算历史交付的分数

  只在**明确要刷新演示库**时跑。跑之前会自动备份旧库到 data/backup/。

用法：
    python tools/refresh_demo_db.py            # 刷新 data/demo-clean.db
    python tools/refresh_demo_db.py --check    # 只体检不修改
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

CLEAN = ROOT / "data" / "demo-clean.db"
BACKUP_DIR = ROOT / "data" / "backup"


def is_locked(path):
    try:
        with open(path, "r+b"):
            return False
    except OSError:
        return True


def main():
    ap = argparse.ArgumentParser(description="刷新干净演示库")
    ap.add_argument("--check", action="store_true", help="只体检，不修改")
    args = ap.parse_args()

    if not CLEAN.exists():
        print(f"找不到干净演示库：{CLEAN}")
        return 1
    if is_locked(CLEAN):
        print("干净库正被占用（可能服务正跑在它上面）。请先停服务，或改用 data/demo-run/。")
        return 1

    # 让 app 用这一个库，而不是默认主库
    os.environ["SF_DATA_DIR"] = str(CLEAN.parent)
    os.environ["SF_DB_NAME"] = CLEAN.name

    from app import db, orders, seed_data
    from app.config import DB_PATH

    if Path(DB_PATH).resolve() != CLEAN.resolve():
        print(f"库路径对不上：{DB_PATH} != {CLEAN}")
        return 1

    db.init()
    seed_data.ensure_seed()

    print(f"库：{CLEAN}")
    print(f"  订单 {db.q1('SELECT COUNT(*) AS n FROM orders')['n']} 单")

    if args.check:
        miss = _missing_fields()
        print(f"  交付物缺字段的单：{len(miss)}")
        for oid, fields in miss[:10]:
            print(f"    {oid}: 缺 {', '.join(fields)}")
        return 0

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup = BACKUP_DIR / "demo-clean.db.before-refresh"
    n = 1
    while backup.exists():
        backup = BACKUP_DIR / f"demo-clean.db.before-refresh.{n}"
        n += 1
    shutil.copy2(CLEAN, backup)
    print(f"旧库已备份：{backup.relative_to(ROOT)}")

    fixed = orders.backfill_quality(limit=1000)
    print(f"回填交付物：{len(fixed)} 单")
    db.checkpoint()

    miss = _missing_fields()
    print(f"  刷新后仍缺字段的单：{len(miss)}")
    for oid, fields in miss[:10]:
        print(f"    {oid}: 缺 {', '.join(fields)}")
    print("完成。")
    return 0


def _missing_fields():
    """哪些单的交付物按当前契约还缺字段。"""
    import json

    from app import contract, db

    out = []
    for row in db.q(
        "SELECT id, deliverable_json FROM orders WHERE deliverable_json IS NOT NULL AND status = 'delivered'"
    ):
        try:
            payload = json.loads(row["deliverable_json"] or "{}")
        except Exception:  # noqa: BLE001
            out.append((row["id"], ["deliverable_json 解析失败"]))
            continue
        miss = contract.missing(payload, contract.DELIVERABLE_FIELDS)
        if miss:
            out.append((row["id"], miss))
    return out


if __name__ == "__main__":
    sys.exit(main())

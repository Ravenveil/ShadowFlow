"""演示前准备数据库：一键把演示数据摆到台面上，且**不动你正在用的主库**。

用法：
    python tools/demo_reset.py            # 准备演示库（不动主库，安全）
    python tools/demo_reset.py --switch   # 把主库换成干净演示库（会覆盖，先备份）

背景：
台词第 1 步要念「12 单、14 个项目、116 个活儿」，那是演示干净库 `data/demo-clean.db`
的口径。但走查脚本（fuzzcheck / contractcheck / livecheck / feedbackcheck）每跑一轮
就会在库里留下几十张单和几百个任务，页面上的数字随之涨——台词念「12 单」、
页面显示「48 单」，现场就露馅。

两种做法：
1. 默认（--prepare）：把干净库复制到 `data/demo-run/`，用 `SF_DATA_DIR=data/demo-run`
   启动服务。**主库 data/shadowflow.db 一个字节都不动**，跑坏了随时扔掉重来。
2. --switch：直接把主库换成干净库。旧库会先备份到 `data/backup/`，可回滚。
   但服务正在跑时文件被占用，这一步会失败——请先停服务。

用法示例：
    # 准备演示库并启动（推荐）
    python tools/demo_reset.py
    SF_DATA_DIR=data/demo-run python run.py

    # 换主库（先停服务）
    python tools/demo_reset.py --switch
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CLEAN = DATA / "demo-clean.db"
MAIN = DATA / "shadowflow.db"
DEMO_DIR = DATA / "demo-run"
DEMO_DB = DEMO_DIR / "shadowflow.db"
BACKUP_DIR = DATA / "backup"


def is_locked(path):
    """Windows 上文件被打开时无法替换。探一下，主库在被服务占着就报出来。"""
    try:
        with open(path, "r+b"):
            return False
    except OSError:
        return True


def archive(path):
    """把文件移进备份目录归档，**不删**。

    为什么不直接 unlink：
      一是有些环境（带删除保护的安全 shim）会拦掉删除，一删就崩；
      二是删了就回滚不了 —— 归档进备份目录，随时能拿回来。
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    dest = BACKUP_DIR / f"{path.name}.{stamp}"
    n = 1
    while dest.exists():
        dest = BACKUP_DIR / f"{path.name}.{stamp}.{n}"
        n += 1
    os.rename(path, dest)
    return dest


def prepare():
    """把干净库复制到 data/demo-run/，供演示单独使用。"""
    if not CLEAN.exists():
        print(f"找不到干净演示库：{CLEAN}")
        return 1

    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    archived = []
    for suffix in ("", "-wal", "-shm"):
        stale = DEMO_DB.with_name(DEMO_DB.name + suffix)
        if stale.exists():
            archived.append(archive(stale))
    shutil.copy2(CLEAN, DEMO_DB)
    print(f"演示库已就绪：{DEMO_DB.relative_to(ROOT)}")
    if archived:
        print("上一轮的演示库已归档（没删）：")
        for a in archived:
            print(f"    {a.relative_to(ROOT)}")
    print("（主库 data/shadowflow.db 未受影响）")
    print()
    print("用它启动服务：")
    print("    SF_DATA_DIR=data/demo-run python run.py")
    print()
    print("跑完想还原：主库一直在；data/demo-run/ 里的旧库也都归档在 data/backup/。")
    return 0


def switch():
    """把主库换成干净演示库。旧库先备份，可回滚。"""
    if not CLEAN.exists():
        print(f"找不到干净演示库：{CLEAN}")
        return 1
    if not MAIN.exists():
        print(f"找不到主库：{MAIN}")
        return 1
    if is_locked(MAIN):
        print("主库正被服务占用，换不了。请先停掉服务再执行。")
        print("（不想停服务的话，用默认模式 python tools/demo_reset.py，另起一份演示库）")
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup = BACKUP_DIR / "shadowflow.db.before-demo"
    n = 1
    while backup.exists():
        backup = BACKUP_DIR / f"shadowflow.db.before-demo.{n}"
        n += 1
    shutil.copy2(MAIN, backup)
    print(f"旧库已备份：{backup.relative_to(ROOT)}")

    for suffix in ("-wal", "-shm"):
        side = MAIN.with_name(MAIN.name + suffix)
        if side.exists():
            # 移走归档，不删（理由见 archive() 的注释）
            archive(side)
    shutil.copy2(CLEAN, MAIN)
    print("主库已换成干净演示库。")
    print("要还原：把上面那份备份复制回 data/shadowflow.db。")
    return 0


def main():
    ap = argparse.ArgumentParser(description="演示前准备数据库")
    ap.add_argument("--switch", action="store_true",
                    help="换主库（会覆盖 data/shadowflow.db，先备份；需先停服务）")
    args = ap.parse_args()
    return switch() if args.switch else prepare()


if __name__ == "__main__":
    sys.exit(main())

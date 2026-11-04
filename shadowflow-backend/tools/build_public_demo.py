"""构建「公网演示目录」：一个可以安全挂到公网的最小副本。

为什么要单独构建，而不是直接把项目目录丢上去：
  1. **密钥**。项目根目录有 `.env`（真实模型的 API Key）。它被 .gitignore 忽略，
     但发布工具是**压缩整个目录**上传的，不认 .gitignore —— Key 会跟着跑上去。
  2. **真实数据**。`data/shadowflow.db` 里有走查脚本留下的几十张单、
     客户名与联系方式。它同样被 .gitignore 忽略，但同样会被整个目录带上去。
  3. **演示数据被演示搞脏**。公网上的演示是公开的，谁都能点。
     演示数据必须每次从干净库重置，而不是接着上次被人点乱的库继续跑。

所以这个脚本从零组装一个发布目录，只放该放的东西：
    app/            代码（不含 __pycache__）
    run.py          入口
    requirements.txt
    data/           只有干净的 demo-clean.db（会被复制成运行库）
    .env.example    模板（不含真 Key）
    发布说明.md

并且打上三道保险：
    · **不复制 .env** —— 发布目录里压根没有密钥文件，模型走确定性模拟器
      （演示稳定、不烧额度、也不会把 Key 暴露给公网任何人）
    · **不复制主库** —— 只有干净演示库
    · **运行库每次启动从干净库重置** —— 演示怎么点都不脏

用法：
    python tools/build_public_demo.py            # 构建到 data/public-demo/
    python tools/build_public_demo.py --out 目录  # 构建到指定目录
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# 这些文件/目录绝不能进发布目录
NEVER_COPY = {
    ".env", ".env.local", ".env.production", ".env.development",
    ".git", ".gitignore", ".gitattributes",
    "__pycache__", ".pytest_cache", ".workbuddy", ".workbuddy-tmp",
    ".run.log", "data",
}


def copy_tree(src, dst):
    """复制目录，跳过缓存与密钥类文件。"""
    dst.mkdir(parents=True, exist_ok=True)
    count = 0
    for p in sorted(src.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(src)
        if any(part in NEVER_COPY for part in rel.parts):
            continue
        if p.name in NEVER_COPY or p.suffix in (".pyc", ".pyo", ".log"):
            continue
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
        count += 1
    return count


def write_entry(out):
    """写发布目录专用的入口。

    与主项目入口的差别，就三处，每一处都是为了公网沙箱：
      · 绑定 0.0.0.0（本地默认是 127.0.0.1，容器里绑回环等于谁都连不上）
      · 端口听沙箱注入的 PORT（沙箱只给一个端口，写死别的就起不来）
      · 默认开 SF_PUBLIC_DEMO（管理接口要能从公网访问）

    关键：这些环境变量必须在 `import app` **之前**设好 —— config.py 在导入时
    就把它们读进常量了，晚设无效。

    文件名叫 main.py 而不是 run.py：托管平台的 Python 沙箱默认找根目录的
    main.py 当入口，叫 run.py 它找不到（会报「can't open file main.py」）。
    """
    entry = '''"""公网演示入口。启动：python main.py

这个文件是公网演示专用的，与主项目入口的差别：
  · 绑定 0.0.0.0（容器里绑回环等于没人连得上）
  · 端口听 PORT 环境变量（沙箱只给一个端口）
  · 默认开 SF_PUBLIC_DEMO（管理接口要能从公网访问）

环境变量必须在 import app 之前设好 —— config.py 在导入时就读完了。
"""

import os

# 沙箱注入的端口
_port = os.environ.get("PORT") or os.environ.get("SF_PORT") or "8000"
os.environ["SF_PORT"] = _port
os.environ["SF_HOST"] = os.environ.get("SF_HOST", "0.0.0.0")
# 公网演示模式：管理接口对所有人开放（这里跑的是一次性演示库，无真实数据）
os.environ.setdefault("SF_PUBLIC_DEMO", "1")
# 每天几点自动生成经营待办
os.environ.setdefault("SF_BRIEF_HOUR", "8")

from app.main import main  # noqa: E402

if __name__ == "__main__":
    main()
'''
    (out / "main.py").write_text(entry, encoding="utf-8")
    # run.py 也留一份，习惯用这个命令的人不受影响
    (out / "run.py").write_text(entry, encoding="utf-8")


def write_readme(out, clean_db_exists, version):
    text = f"""# 公网演示 · ShadowFlow OPC-OS v{version}

这是一个**专门为公网演示准备**的副本，不是一份完整源码交付包。

## 它跟完整交付包有什么不一样

| | 完整交付包（zip） | 这里的公网演示 |
| --- | --- | --- |
| 真实模型的 API Key | 不含（`.env` 被排除） | 不含（`.env` 压根不存在） |
| 真实客户数据 / 走查留下的单 | 不含 | 不含 |
| 模型 | 你自己配 `.env` 后是真模型 | **确定性模拟器**：输出稳定、不烧额度 |
| 演示库 | `demo-clean.db` | `demo-clean.db`，**每次启动都重置** |
| 管理接口 | 默认只允许本机 | 公网演示模式，对所有人开放 |

**为什么模型走模拟器**：公网演示是公开的，任何人都能点。
挂着真 Key 等于把额度敞给陌生人，而且演示现场网络一抖就掉链子。
模拟器输出每次一样，现场不会翻车。

**为什么每次重置演示库**：公开演示会被乱点（点坏一单、点删一条经验）。
每次启动从干净库重置，保证打开就是能演示的样子。

## 怎么跑

```bash
pip install -r requirements.txt
python run.py
```

然后打开 http://127.0.0.1:8000/os.html

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SF_PUBLIC_DEMO` | `1` | 管理接口对所有人开放。**只在一锤子买卖的演示库上开** |
| `SF_PORT` | `8000` | 端口 |
| `SF_BRIEF_HOUR` | `8` | 每天几点自动生成经营待办 |

## 这个副本不适合做什么

- **不是源码交付**：缺 `.env`、缺主库、缺完整工具链。要给别人看代码请用完整 zip 包。
- **不能开真模型**：没有 Key。要接真模型请用完整包并在 `.env` 里配。
- **管理接口没有防护**：`SF_PUBLIC_DEMO=1` 时任何人都能改数据。
  指向真实数据前务必关掉它。
"""
    (out / "发布说明.md").write_text(text, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="构建公网演示目录")
    ap.add_argument("--out", default=str(ROOT / "data" / "public-demo"), help="发布目录")
    args = ap.parse_args()

    out = Path(args.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # ① 代码
    n = copy_tree(ROOT / "app", out / "app")
    print(f"代码：{n} 个文件")

    # ② 入口与依赖（入口是公网专用版，见 write_entry）
    write_entry(out)
    shutil.copy2(ROOT / "requirements.txt", out / "requirements.txt")
    if (ROOT / ".env.example").exists():
        shutil.copy2(ROOT / ".env.example", out / ".env.example")
    print("入口与依赖：run.py（公网专用）/ requirements.txt / .env.example")

    # ③ 干净的演示库（唯一进包的库）
    clean = ROOT / "data" / "demo-clean.db"
    if not clean.exists():
        print(f"找不到干净演示库：{clean}")
        print("先跑 python tools/refresh_demo_db.py --check 看看库在不在")
        return 1
    (out / "data").mkdir(exist_ok=True)
    shutil.copy2(clean, out / "data" / "demo-clean.db")
    print(f"演示库：data/demo-clean.db（{clean.stat().st_size // 1024} KB）")

    # ④ 保险：启动时把演示库复制成运行库 —— 每次启动都是干净的
    write_readme(out, True, _version())
    print("发布说明：发布说明.md")

    print()
    print(f"完成：{out}")
    print(f"  文件数：{sum(1 for _ in out.rglob('*') if _.is_file())}")
    print()
    print("自检（确认没带密钥、没带主库）：")
    leaks = []
    for p in out.rglob("*"):
        if not p.is_file():
            continue
        if p.name == ".env" or p.name.startswith("shadowflow.db"):
            leaks.append(str(p.relative_to(out)))
        if p.suffix in (".py", ".md", ".txt"):
            try:
                txt = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if "sk-" in txt and "xxxx" not in txt.split("sk-")[1][:8]:
                # 形如 sk-xxxxxxxx 的真 Key
                for line in txt.splitlines():
                    i = line.find("sk-")
                    if i >= 0 and len(line[i + 3:].strip().split()[0]) > 20:
                        leaks.append(f"{p.relative_to(out)} 里有疑似真 Key")
    if leaks:
        for l in leaks:
            print(f"  [FAIL] {l}")
        return 1
    print("  [OK  ] 没有 .env、没有主库、没有疑似 API Key")
    return 0


def _version():
    import re

    txt = (ROOT / "app" / "config.py").read_text(encoding="utf-8")
    return re.search(r'APP_VERSION\s*=\s*"([^"]+)"', txt).group(1)


if __name__ == "__main__":
    sys.exit(main())

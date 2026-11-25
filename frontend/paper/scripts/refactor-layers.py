#!/usr/bin/env python3
"""refactor-layers.py — 把 src 重排成「先内外分层、内部按业务聚合」，并把相对
import 改成 @/ 别名（移动文件时路径不会互相牵连）。

用法：
    python refactor-layers.py --dry     # 只打印映射与问题
    python refactor-layers.py           # 真移动 + 改 import
"""
from __future__ import annotations

import os
import re
import shutil
import sys

SRC = os.path.abspath("src")
DRY = "--dry" in sys.argv

# 每个旧目录的去向；views/ 按业务拆
DIR_MAP = [
    ("chat/", "runtime/chat/"),
    ("panel/", "runtime/panel/"),
    ("shell/", "app/shell/"),
    ("settings/", "app/settings/"),
    ("content/", "shared/content/"),
    ("data/", "shared/data/"),
    ("theme/", "shared/theme/"),
    ("ui/", "shared/ui/"),
    ("styles/", "shared/styles/"),
    ("landing/", "landing/"),
]

VIEW_MAP = {
    "TeamsView.tsx": "business/teams/",
    "KnowledgeView.tsx": "business/knowledge/",
    "NewsView.tsx": "business/news/",
    "SchedulesView.tsx": "business/schedules/",
    "ProjectsView.tsx": "business/projects/",
    "HostView.tsx": "runtime/host/",
    "FilesView.tsx": "runtime/host/",
}

# 个别文件按「谁的职责」单独归位（不跟着目录走）
FILE_MAP = {
    "shell/AgentPanel.tsx": "runtime/panel/AgentPanel.tsx",
    "shell/ChatArea.tsx": "runtime/chat/ChatArea.tsx",
    "shell/icons.tsx": "shared/ui/icons.tsx",
    "avatar.tsx": "shared/ui/avatar.tsx",
}


def new_path(rel: str) -> str:
    if rel in FILE_MAP:
        return FILE_MAP[rel]
    if rel.startswith("views/"):
        name = rel[len("views/"):]
        if name not in VIEW_MAP:
            raise SystemExit(f"未归类的视图: {rel}")
        return VIEW_MAP[name] + name
    for old, new in DIR_MAP:
        if rel.startswith(old):
            return new + rel[len(old):]
    return rel  # App.tsx / main.tsx 留在根


def list_sources() -> list[str]:
    out = []
    for root, _dirs, files in os.walk(SRC):
        for name in files:
            if name.endswith((".ts", ".tsx", ".css")):
                out.append(os.path.relpath(os.path.join(root, name), SRC).replace("\\", "/"))
    return sorted(out)


SPEC_RE = re.compile(r"""(from\s+|import\s+)(['"])(\.[^'"]*)\2""")


def resolve(spec: str, from_rel: str, old_files: set[str]) -> str | None:
    base = os.path.dirname(os.path.join(SRC, from_rel))
    target = os.path.normpath(os.path.join(base, spec)).replace("\\", "/")
    rel = os.path.relpath(target, SRC).replace("\\", "/")
    for cand in (rel, rel + ".ts", rel + ".tsx", rel + "/index.ts", rel + "/index.tsx"):
        if cand in old_files:
            return cand
    return None


def main() -> None:
    files = list_sources()
    old_files = set(files)
    mapping = {f: new_path(f) for f in files}

    problems: list[str] = []
    rewrites: dict[str, tuple[str, str]] = {}

    for rel, dest in mapping.items():
        if not rel.endswith((".ts", ".tsx")):
            continue
        text = open(os.path.join(SRC, rel), encoding="utf-8").read()
        new_text = text
        for m in list(SPEC_RE.finditer(text)):
            prefix, quote, spec = m.group(1), m.group(2), m.group(3)
            hit = resolve(spec, rel, old_files)
            if hit is None:
                problems.append(f"{rel}: 解析不到 {spec}")
                continue
            target_new = mapping[hit]
            alias = "@/" + re.sub(r"\.(ts|tsx)$", "", target_new)
            old_literal = f"{prefix}{quote}{spec}{quote}"
            new_literal = f"{prefix}{quote}{alias}{quote}"
            if old_literal != new_literal:
                new_text = new_text.replace(old_literal, new_literal)
        if new_text != text:
            rewrites[rel] = (text, new_text)

    print(f"文件 {len(files)} 个；需要改 import 的 {len(rewrites)} 个；问题 {len(problems)}")
    for p in problems:
        print("  !", p)
    if DRY:
        for rel, dest in sorted(mapping.items()):
            if rel != dest:
                print(f"  {rel}  ->  {dest}")
        return

    if problems:
        raise SystemExit("先解决解析不到的相对 import 再移动")

    # 1) 先写新内容（内容已用别名，路径无关）
    for rel, (_old, new_text) in rewrites.items():
        open(os.path.join(SRC, rel), "w", encoding="utf-8").write(new_text)

    # 2) 移动文件
    for rel, dest in mapping.items():
        if rel == dest:
            continue
        src_abs = os.path.join(SRC, rel)
        dst_abs = os.path.join(SRC, dest)
        os.makedirs(os.path.dirname(dst_abs), exist_ok=True)
        shutil.move(src_abs, dst_abs)

    # 3) 清空的旧目录
    for root, dirs, files_ in os.walk(SRC, topdown=False):
        if root == SRC:
            continue
        if not os.listdir(root):
            os.rmdir(root)
    print("完成")


if __name__ == "__main__":
    main()

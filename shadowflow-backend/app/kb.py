"""Knowledge base with a real retrieval chain (no external service required).

Deck P10 says RAG returns stub results when configuration is missing. This module keeps that
switch (LIGHTRAG_ENABLED=0 -> stub) but ships a working local hybrid retriever, so the main demo
line can cite real 词条 instead of an empty placeholder.

Retrieval = char-bigram hashing vectors (semantic-ish) + BM25 lexical scoring + term aliasing.
Zero third-party dependencies, deterministic, rebuilds from SQLite on start-up.
"""

import hashlib
import math
import re
from collections import Counter

from . import db
from .config import KB_CHUNK_SIZE, KB_MIN_SCORE, KB_TOP_K, LIGHTRAG_ENABLED

DIM = 256
_ASCII = re.compile(r"[a-zA-Z0-9_+\-]{2,}")
_CJK = re.compile(r"[\u4e00-\u9fff]")

_INDEX = None  # {"chunks": [...], "idf": {...}, "n": int}


def _tokens(text):
    text = (text or "").lower()
    toks = [t for t in _ASCII.findall(text)]
    chars = _CJK.findall(text)
    for i in range(len(chars) - 1):
        toks.append(chars[i] + chars[i + 1])
    if len(chars) == 1:
        toks.append(chars[0])
    return toks


def _embed(tokens):
    vec = [0.0] * DIM
    for tok, cnt in Counter(tokens).items():
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest()[:8], 16)
        vec[h % DIM] += 1.0 + math.log(cnt)
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _chunks(entry):
    content = (entry.get("content") or "").strip()
    size = KB_CHUNK_SIZE
    if len(content) <= size:
        return [content]
    out, buf = [], ""
    for sent in re.split(r"(?<=[。；！？\n])", content):
        if len(buf) + len(sent) > size and buf:
            out.append(buf)
            buf = sent
        else:
            buf += sent
    if buf.strip():
        out.append(buf)
    return [c for c in out if c.strip()]


def _signature():
    """库的指纹：增删、归档、改适用范围都会变。

    为什么需要它：索引在内存里，词条可能被别的进程改掉（`tools/testdata.py --apply` 归档、
    另一个 worker 写入）。没有指纹时服务会一直用旧索引，状态里出现「11 条有效 / 11 条归档」
    这种自相矛盾，检索还会召回已经归档的条目。
    一次极轻的聚合查询换「所见即所得」，比要求所有人改完都记得重启划算。
    """
    row = db.q1(
        "SELECT COUNT(*) AS n, COALESCE(MAX(rowid), 0) AS m, COALESCE(SUM(archived), 0) AS a,"
        " COALESCE(SUM(LENGTH(COALESCE(scope_services, '')) + LENGTH(COALESCE(scope_roles, ''))), 0) AS s"
        " FROM kb_entries"
    ) or {}
    return (row.get("n") or 0, row.get("m") or 0, row.get("a") or 0, row.get("s") or 0)


def build_index(force=True):
    global _INDEX
    sig = _signature()
    # force（reindex）= 明确有人刚写过库，无条件重建；
    # 非 force（检索路径）= 指纹没变就直接复用，变了才重建。
    if _INDEX is not None and not force and _INDEX.get("sig") == sig:
        return _INDEX
    chunks, df = [], Counter()
    for entry in db.all_kb():
        if entry.get("archived"):
            continue
        for i, ck in enumerate(_chunks(entry)):
            toks = _tokens(f"{entry['title']} {ck} {' '.join(entry.get('tags', []))}")
            tf = Counter(toks)
            for t in tf:
                df[t] += 1
            chunks.append(
                {
                    "entry_id": entry["id"],
                    "title": entry["title"],
                    "kind": entry.get("kind", "term"),
                    "source": entry.get("source", "manual"),
                    "tags": entry.get("tags", []),
                    "scope_services": entry.get("scope_services") or [],
                    "scope_roles": entry.get("scope_roles") or [],
                    "chunk_index": i,
                    "text": ck,
                    "tf": tf,
                    "len": sum(tf.values()) or 1,
                    "vec": _embed(toks),
                }
            )
    n = max(len(chunks), 1)
    idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
    _INDEX = {"chunks": chunks, "idf": idf, "n": n, "sig": sig}
    return _INDEX


def reindex():
    return build_index(force=True)


def status():
    idx = build_index(force=False)
    entries = db.all_kb()
    active = [e for e in entries if not e.get("archived")]
    scoped = [e for e in active if e.get("scope_services") or e.get("scope_roles")]
    return {
        "enabled": LIGHTRAG_ENABLED,
        "mode": "local-hybrid" if LIGHTRAG_ENABLED else "stub",
        "entries": len(active),
        "chunks": len(idx["chunks"]),
        "dim": DIM,
        "top_k": KB_TOP_K,
        "scoped": len(scoped),
        "common": len(active) - len(scoped),
        "archived": len(entries) - len(active),
        "note": "配置就绪：向量+词法混合检索，按服务/岗位分域"
        if LIGHTRAG_ENABLED
        else "LIGHTRAG_ENABLED=0：检索链路旁路，返回 stub（与能力盘点口径一致）",
    }


def _cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def _in_scope(chunk, service_id, role):
    """这条词条对本单、本岗位适不适用。

    `None` = 调用方没给上下文（管理台全库搜），不做这一维过滤；
    `""` = 有上下文但没取到值（比如项目还没关联订单），按「不匹配」处理 ——
    只有明确属于某个服务的词条才需要这个值，取不到就不该把它的内容喂给员工。
    """
    if service_id is not None:
        scoped = chunk.get("scope_services") or []
        if scoped and service_id not in scoped:
            return False
    if role is not None:
        scoped = chunk.get("scope_roles") or []
        if scoped and role not in scoped:
            return False
    return True


def search(query, top_k=None, kind=None, service_id=None, role=None):
    top_k = top_k or KB_TOP_K
    query = (query or "").strip()
    if not LIGHTRAG_ENABLED:
        return {
            "mode": "stub",
            "query": query,
            "hits": [],
            "note": "RAG 未启用（LIGHTRAG_ENABLED=0），检索为 stub，演示时请打开配置",
        }
    if not query:
        return {"mode": "local-hybrid", "query": query, "hits": []}

    idx = build_index(force=False)
    qv = _embed(_tokens(query))
    qtf = Counter(_tokens(query))
    avg_len = sum(c["len"] for c in idx["chunks"]) / max(idx["n"], 1)
    hits = []
    for c in idx["chunks"]:
        if kind and c["kind"] != kind:
            continue
        if not _in_scope(c, service_id, role):
            continue
        bm25 = 0.0
        for t, qf in qtf.items():
            f = c["tf"].get(t, 0)
            if not f:
                continue
            idf = idx["idf"].get(t, 0.0)
            bm25 += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * c["len"] / avg_len))
        cos = max(_cos(qv, c["vec"]), 0.0)
        lex = min(bm25 / 6.0, 1.0)
        # exact title / tag hit gets a strong prior: 词条查询优先命中词条本体
        title_bonus = 0.35 if query.lower() in c["title"].lower() else 0.0
        tag_bonus = 0.15 if any(query.lower() in str(t).lower() for t in c["tags"]) else 0.0
        score = 0.5 * cos + 0.5 * lex + title_bonus + tag_bonus
        if score < KB_MIN_SCORE:
            continue
        hits.append(
            {
                "entry_id": c["entry_id"],
                "title": c["title"],
                "kind": c["kind"],
                "source": c["source"],
                "tags": c["tags"],
                "chunk_index": c["chunk_index"],
                "text": c["text"],
                "score": round(score, 4),
                "channel": "vector" if cos >= lex else "lexical",
            }
        )
    hits.sort(key=lambda h: h["score"], reverse=True)
    # dedupe: keep best chunk per entry
    seen, deduped = set(), []
    for h in hits:
        if h["entry_id"] in seen:
            continue
        seen.add(h["entry_id"])
        deduped.append(h)
    return {"mode": "local-hybrid", "query": query, "hits": deduped[:top_k], "total": len(hits)}


def context_block(query, top_k=None, service_id=None, role=None):
    """Formatted retrieval result ready to be injected into an agent prompt."""
    res = search(query, top_k=top_k, service_id=service_id, role=role)
    if not res["hits"]:
        return "", res
    lines = [f"[KB:{h['entry_id']}] {h['title']} —— {h['text'][:160]}" for h in res["hits"]]
    return "\n".join(lines), res


# 种子里哪些词条只对某些服务/岗位有用。
# 没有这张表的时候：写烘焙文案的任务会把「出海选品四步」「小件跨境几天到」一起塞进提示词，
# 模型要么被带偏，要么白读 200 字无关内容。空列表 = 通用，谁都能查。
SEED_SCOPE = {
    "kb_selection": {"services": ["svc_landing_sel"]},
    "kb_logistics": {"services": ["svc_landing_sel"]},
    "kb_seeding": {"services": ["svc_content"]},
    "kb_four_eyes": {"roles": ["quality_reviewer", "compliance_officer"]},
    "kb_payment": {"roles": ["account_manager"]},
    "kb_opc": {"roles": ["chief_of_staff", "account_manager"]},
    "kb_matrix": {"roles": ["chief_of_staff", "account_manager"]},
}


def backfill_scope():
    """给种子词条补适用范围。

    只补空范围的种子 id：用户自己加的、以及已经手工设过范围的，一律不动。
    这样老库升级后不会「全库可见 → 突然查不到」（那是断崖），而是逐个收紧到该有的范围。
    """
    entries = {e["id"]: e for e in db.all_kb()}
    fixed = []
    for eid, scope in SEED_SCOPE.items():
        e = entries.get(eid)
        if not e:
            continue
        if e.get("scope_services") or e.get("scope_roles"):
            continue
        db.set_kb_scope(eid, services=scope.get("services", []), roles=scope.get("roles", []))
        fixed.append(eid)
    if fixed:
        reindex()
    return fixed

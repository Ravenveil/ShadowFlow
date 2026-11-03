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


def build_index(force=True):
    global _INDEX
    if _INDEX is not None and not force:
        return _INDEX
    chunks, df = [], Counter()
    for entry in db.all_kb():
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
                    "chunk_index": i,
                    "text": ck,
                    "tf": tf,
                    "len": sum(tf.values()) or 1,
                    "vec": _embed(toks),
                }
            )
    n = max(len(chunks), 1)
    idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
    _INDEX = {"chunks": chunks, "idf": idf, "n": n}
    return _INDEX


def reindex():
    return build_index(force=True)


def status():
    idx = build_index(force=False)
    return {
        "enabled": LIGHTRAG_ENABLED,
        "mode": "local-hybrid" if LIGHTRAG_ENABLED else "stub",
        "entries": len({c["entry_id"] for c in idx["chunks"]}),
        "chunks": len(idx["chunks"]),
        "dim": DIM,
        "top_k": KB_TOP_K,
        "note": "配置就绪：向量+词法混合检索"
        if LIGHTRAG_ENABLED
        else "LIGHTRAG_ENABLED=0：检索链路旁路，返回 stub（与能力盘点口径一致）",
    }


def _cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def search(query, top_k=None, kind=None):
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


def context_block(query, top_k=None):
    """Formatted retrieval result ready to be injected into an agent prompt."""
    res = search(query, top_k=top_k)
    if not res["hits"]:
        return "", res
    lines = [f"[KB:{h['entry_id']}] {h['title']} —— {h['text'][:160]}" for h in res["hits"]]
    return "\n".join(lines), res

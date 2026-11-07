"""MemoryBank.ingest_folder — 本地目录批量摄入进知识包。

Contract:
- 目录里受支持的文件逐个走 ingest_file 同一条链路（checksum 幂等去重）
- 不支持的扩展名 / 空文件 / 超限文件 → skipped（带 code），单文件解析失败 → failed，批次不中断
- 路径非法 → FOLDER_NOT_FOUND(404) / NOT_A_FOLDER(400) / FOLDER_TOO_MANY_FILES(413)
- FastAPI 端点 POST /packs/{id}/folders 透传同一契约
"""

from __future__ import annotations

import pytest

from shadowflow.memory.memory_bank import (
    MemoryBank,
    MemoryBankError,
    MemoryConfig,
    create_memory_router,
)


@pytest.fixture()
def bank(tmp_path):
    return MemoryBank(root=tmp_path / "knowledge")


@pytest.fixture()
def pack_id(bank):
    return bank.create_pack("测试包", "folder ingest")["pack_id"]


def _build_tree(root):
    (root / "sub").mkdir(parents=True)
    (root / "a.md").write_text("# Alpha\n\nalpha content", encoding="utf-8")
    (root / "b.txt").write_text("beta content", encoding="utf-8")
    (root / "sub" / "c.csv").write_text("x,y\n1,2\n", encoding="utf-8")
    (root / "note.xyz").write_text("unsupported", encoding="utf-8")
    (root / "empty.txt").write_text("", encoding="utf-8")
    (root / "broken.json").write_text("not json at all", encoding="utf-8")
    return root


def test_ingest_folder_recursive_filters_and_survives_bad_files(bank, pack_id, tmp_path):
    root = _build_tree(tmp_path / "src")

    result = bank.ingest_folder(pack_id, root)

    assert result["total"] == 6
    assert result["recursive"] is True
    by_file = {item["file"]: item for item in result["files"]}
    assert by_file["a.md"]["status"] == "ingested"
    assert by_file["b.txt"]["status"] == "ingested"
    assert by_file["sub/c.csv"]["status"] == "ingested"
    assert by_file["note.xyz"] == {"file": "note.xyz", "status": "skipped", "code": "UNSUPPORTED_FORMAT"}
    assert by_file["empty.txt"] == {"file": "empty.txt", "status": "skipped", "code": "EMPTY_FILE"}
    assert by_file["broken.json"]["status"] == "failed"
    assert by_file["broken.json"]["code"] == "INVALID_JSON"
    assert result["ingested"] == 3
    assert result["skipped"] == 2
    assert result["failed"] == 1
    # 逐文件路径进了 metadata，来源列表可回溯
    done = [s for s in bank.list_sources(pack_id) if s["ingest_status"] == "done"]
    assert {s["metadata"].get("source_path") for s in done} == {
        "a.md", "b.txt", "sub/c.csv",
    }


def test_ingest_folder_non_recursive_skips_subdirs(bank, pack_id, tmp_path):
    root = _build_tree(tmp_path / "src")

    result = bank.ingest_folder(pack_id, root, recursive=False)

    assert result["total"] == 5  # sub/ 下的 c.csv 不在候选内
    assert {item["file"] for item in result["files"]} == {
        "a.md", "b.txt", "note.xyz", "empty.txt", "broken.json",
    }


def test_ingest_folder_deduplicates_on_rerun(bank, pack_id, tmp_path):
    root = _build_tree(tmp_path / "src")

    first = bank.ingest_folder(pack_id, root)
    assert first["ingested"] == 3 and first["deduplicated"] == 0

    second = bank.ingest_folder(pack_id, root)
    assert second["ingested"] == 0 and second["deduplicated"] == 3
    assert second["failed"] == 1  # broken.json 每轮都失败，不产生去重记录
    done = [s for s in bank.list_sources(pack_id) if s["ingest_status"] == "done"]
    assert len(done) == 3


def test_ingest_folder_rejects_bad_paths(bank, pack_id, tmp_path):
    missing = tmp_path / "nope"
    with pytest.raises(MemoryBankError) as excinfo:
        bank.ingest_folder(pack_id, missing)
    assert excinfo.value.code == "FOLDER_NOT_FOUND" and excinfo.value.status == 404

    plain = tmp_path / "file.txt"
    plain.write_text("x", encoding="utf-8")
    with pytest.raises(MemoryBankError) as excinfo:
        bank.ingest_folder(pack_id, plain)
    assert excinfo.value.code == "NOT_A_FOLDER"

    with pytest.raises(MemoryBankError) as excinfo:
        bank.ingest_folder("f" * 32, tmp_path)
    assert excinfo.value.code == "PACK_NOT_FOUND"


def test_ingest_folder_file_cap(tmp_path):
    root = tmp_path / "src"
    root.mkdir()
    for index in range(3):
        (root / f"f{index}.txt").write_text(f"content {index}", encoding="utf-8")
    capped = MemoryBank(root=tmp_path / "knowledge-cap", config=MemoryConfig(max_folder_files=2))
    cap_pack = capped.create_pack("cap")["pack_id"]

    with pytest.raises(MemoryBankError) as excinfo:
        capped.ingest_folder(cap_pack, root)
    assert excinfo.value.code == "FOLDER_TOO_MANY_FILES" and excinfo.value.status == 413


def test_router_folder_endpoint(bank, pack_id, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    root = _build_tree(tmp_path / "src")
    app = FastAPI()
    app.include_router(create_memory_router(bank))
    client = TestClient(app)

    response = client.post(
        f"/api/memory-bank/packs/{pack_id}/folders",
        json={"path": str(root), "recursive": True},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["meta"]["count"] == 6
    assert payload["data"]["ingested"] == 3
    assert payload["data"]["skipped"] == 2
    assert payload["data"]["failed"] == 1

    missing = client.post(
        f"/api/memory-bank/packs/{pack_id}/folders",
        json={"path": str(tmp_path / "ghost")},
    )
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "FOLDER_NOT_FOUND"

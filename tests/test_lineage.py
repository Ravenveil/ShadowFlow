"""Unit tests for shadowflow.runtime.lineage (Story 5.5)."""

from __future__ import annotations

import copy

import pytest

from shadowflow.runtime.lineage import (
    append_author,
    get_lineage,
    make_entry,
    wallet_fingerprint,
)


class TestWalletFingerprint:
    def test_with_0x_prefix(self):
        assert wallet_fingerprint("0x1234567890abcdef") == "12345678"

    def test_without_prefix(self):
        assert wallet_fingerprint("abcdef0123456789") == "abcdef01"

    def test_uppercase_normalised_to_lower(self):
        assert wallet_fingerprint("0xABCDEF01") == "abcdef01"

    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="Invalid wallet address"):
            wallet_fingerprint("0x1234")

    def test_non_hex_raises(self):
        with pytest.raises(ValueError, match="Invalid wallet address"):
            wallet_fingerprint("0xGGGGGGGG")


class TestMakeEntry:
    def test_normal(self):
        assert make_entry("alex", "0x1234567890abcdef") == "alex@12345678"

    def test_strips_alias_whitespace(self):
        assert make_entry("  jin  ", "0xabcdef0123456789") == "jin@abcdef01"

    def test_empty_alias_raises(self):
        with pytest.raises(ValueError, match="alias must not be empty"):
            make_entry("", "0x1234567890abcdef")

    def test_whitespace_only_alias_raises(self):
        with pytest.raises(ValueError, match="alias must not be empty"):
            make_entry("   ", "0x1234567890abcdef")


class TestAppendAuthor:
    def test_immutability(self):
        """append_author must NOT modify the original trajectory."""
        original = {
            "steps": [{"name": "step1"}],
            "metadata": {"author_lineage": ["alice@11111111"]},
        }
        frozen = copy.deepcopy(original)
        result = append_author(original, "bob", "0x2222222233333333")

        assert original == frozen, "Original trajectory was mutated"
        assert result is not original
        assert result["metadata"]["author_lineage"] == [
            "alice@11111111",
            "bob@22222222",
        ]

    def test_missing_metadata_initialises(self):
        traj = {"steps": []}
        result = append_author(traj, "alex", "0x1234567890abcdef")
        assert result["metadata"]["author_lineage"] == ["alex@12345678"]

    def test_missing_lineage_initialises_empty(self):
        traj = {"metadata": {"title": "test"}}
        result = append_author(traj, "jin", "0xabcdef0123456789")
        assert result["metadata"]["author_lineage"] == ["jin@abcdef01"]
        assert result["metadata"]["title"] == "test"

    def test_preserves_existing_order(self):
        traj = {
            "metadata": {
                "author_lineage": ["a@11111111", "b@22222222"],
            },
        }
        result = append_author(traj, "c", "0x3333333344444444")
        assert result["metadata"]["author_lineage"] == [
            "a@11111111",
            "b@22222222",
            "c@33333333",
        ]

    def test_fingerprint_truncation_correct(self):
        full_addr = "0xabcdef0123456789abcdef0123456789abcdef01"
        result = append_author({}, "user", full_addr)
        entry = result["metadata"]["author_lineage"][0]
        assert entry == "user@abcdef01"
        assert len(entry.split("@")[1]) == 8

    def test_non_list_lineage_reset(self):
        traj = {"metadata": {"author_lineage": "corrupted"}}
        result = append_author(traj, "fix", "0x1111111122222222")
        assert isinstance(result["metadata"]["author_lineage"], list)
        assert result["metadata"]["author_lineage"] == ["fix@11111111"]


class TestGetLineage:
    def test_normal(self):
        traj = {"metadata": {"author_lineage": ["a@11111111"]}}
        assert get_lineage(traj) == ["a@11111111"]

    def test_missing_metadata(self):
        assert get_lineage({}) == []

    def test_missing_lineage(self):
        assert get_lineage({"metadata": {}}) == []

    def test_non_dict_metadata(self):
        assert get_lineage({"metadata": "bad"}) == []

    def test_non_list_lineage(self):
        assert get_lineage({"metadata": {"author_lineage": 42}}) == []

    def test_returns_copy(self):
        lineage = ["a@11111111"]
        traj = {"metadata": {"author_lineage": lineage}}
        result = get_lineage(traj)
        result.append("extra")
        assert traj["metadata"]["author_lineage"] == ["a@11111111"]

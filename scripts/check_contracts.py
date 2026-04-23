#!/usr/bin/env python3
"""
Check that src/core/types/workflow.ts is in sync with shadowflow/runtime/contracts.py.

Exits with code 0 if in sync, 1 if schema drift is detected.
Run by CI in the lint-backend job.

Usage:
    python scripts/check_contracts.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_TS = PROJECT_ROOT / "src" / "core" / "types" / "workflow.ts"

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
import generate_ts_types  # noqa: E402


def _field_lines(text: str) -> set[str]:
    """Extract non-comment, non-empty lines from a TypeScript file for diffing."""
    result: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("//"):
            result.add(stripped)
    return result


def main() -> int:
    if not WORKFLOW_TS.exists():
        print(
            "schema drift detected: workflow.ts not found — "
            "run `python scripts/generate_ts_types.py` and commit the result"
        )
        return 1

    with tempfile.NamedTemporaryFile(suffix=".ts", delete=False, mode="w", encoding="utf-8") as f:
        tmp = Path(f.name)

    try:
        generate_ts_types.generate(tmp)
        current = WORKFLOW_TS.read_text(encoding="utf-8")
        generated = tmp.read_text(encoding="utf-8")

        if current == generated:
            print("OK: workflow.ts is up-to-date with contracts.py")
            return 0

        # Compute a human-readable drift summary
        curr_lines = _field_lines(current)
        gen_lines = _field_lines(generated)

        added = sorted(gen_lines - curr_lines)
        removed = sorted(curr_lines - gen_lines)

        changes: list[str] = []
        for line in added[:8]:
            changes.append(f"+{line}")
        for line in removed[:8]:
            changes.append(f"-{line}")

        drift_str = ", ".join(changes) if changes else "file content differs"
        print(f"schema drift detected: {drift_str}")
        print(
            "\nFix: run `python scripts/generate_ts_types.py` and commit src/core/types/workflow.ts"
        )
        return 1
    finally:
        tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())

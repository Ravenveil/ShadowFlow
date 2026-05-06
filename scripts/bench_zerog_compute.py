#!/usr/bin/env python3
"""0G Compute 推理成功率压测 (Story 5.4 / AC2).

连续跑 100 次推理,统计:
  - 成功率(阈值 ≥ 95%,低于则退出码 1)
  - p50 / p95 延迟

成功定义: HTTP 200 + processResponse 不抛错。

用法:
  python scripts/bench_zerog_compute.py [--runs 100] [--output _bmad-output/benchmarks/]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List

# 确保 shadowflow 包可导入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shadowflow.llm.base import LLMConfig  # noqa: E402
from shadowflow.llm.zerog import ZeroGComputeProvider  # noqa: E402


async def run_benchmark(runs: int, output_dir: str) -> int:
    config = LLMConfig(model="auto", timeout=30)

    try:
        provider = ZeroGComputeProvider(config)
    except Exception as e:
        print(f"❌ Provider init failed: {e}", file=sys.stderr)
        return 1

    latencies: List[float] = []
    errors: List[str] = []

    for i in range(1, runs + 1):
        t0 = time.monotonic()
        try:
            resp = await provider.chat(
                [{"role": "user", "content": "ping"}]
            )
            elapsed = time.monotonic() - t0
            latencies.append(elapsed)
            print(f"  [{i}/{runs}] ✅ {elapsed:.2f}s — {resp.tokens_used} tokens")
        except Exception as e:
            elapsed = time.monotonic() - t0
            errors.append(f"run {i}: {type(e).__name__}: {e}")
            print(f"  [{i}/{runs}] ❌ {elapsed:.2f}s — {e}")

    total = len(latencies) + len(errors)
    success_rate = len(latencies) / total * 100 if total > 0 else 0

    sorted_lat = sorted(latencies) if latencies else [0]
    p50 = sorted_lat[len(sorted_lat) // 2]
    p95_idx = min(int(len(sorted_lat) * 0.95), len(sorted_lat) - 1)
    p95 = sorted_lat[p95_idx]

    report = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total_runs": total,
        "successes": len(latencies),
        "failures": len(errors),
        "success_rate_pct": round(success_rate, 2),
        "p50_seconds": round(p50, 3),
        "p95_seconds": round(p95, 3),
        "threshold_pct": 95,
        "passed": success_rate >= 95,
        "errors": errors[:10],
    }

    print(f"\n{'='*50}")
    print(f"  成功率: {success_rate:.1f}% ({len(latencies)}/{total})")
    print(f"  p50: {p50:.3f}s  |  p95: {p95:.3f}s")
    print(f"  阈值: ≥ 95%  →  {'✅ PASS' if report['passed'] else '❌ FAIL'}")
    print(f"{'='*50}")

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    report_file = out_path / f"zerog-compute-{date_str}.json"
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"  报告已写入: {report_file}")

    return 0 if report["passed"] else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="0G Compute 推理压测")
    parser.add_argument("--runs", type=int, default=100, help="推理次数 (default: 100)")
    parser.add_argument(
        "--output",
        default="_bmad-output/benchmarks",
        help="输出目录 (default: _bmad-output/benchmarks)",
    )
    args = parser.parse_args()

    print(f"🚀 0G Compute 压测: {args.runs} 次推理\n")
    exit_code = asyncio.run(run_benchmark(args.runs, args.output))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

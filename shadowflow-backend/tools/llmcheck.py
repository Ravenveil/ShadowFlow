"""接模型自检：验证 SF_LLM_* 配好没有、能不能真跑通。

用法：
    python tools/llmcheck.py
    python tools/llmcheck.py --prompt "用一句话介绍你自己"

退出码：0 = 已配置且调用成功；1 = 未配置或调用失败（会打印原因）。

为什么单独做一个脚本：配了 key 但地址写错、key 过期、模型名不对，
表现都是「跑任务能出字，但其实是模拟器兜底」，肉眼很难发现。
这个脚本直接发一次真实请求，把「真通 / 假通」摊开。
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import llm  # noqa: E402
from app.config import LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT  # noqa: E402

SAMPLE = "用一句话说明你是什么模型，并输出『接通成功』四个字。"


def main():
    ap = argparse.ArgumentParser(description="验证真实模型是否接通")
    ap.add_argument("--prompt", default=SAMPLE, help="自检用的提示词")
    args = ap.parse_args()

    print("模式      :", llm.mode())
    print("base_url  :", LLM_BASE_URL or "(未配置)")
    print("model     :", LLM_MODEL)
    print("超时      :", f"{LLM_TIMEOUT:.0f}s")

    if llm.mode() != "live":
        print("\n[未接入] 现在走的是模拟器，交付物是『作业骨架』不是市场结论。")
        print("在项目根建一个 .env，填三行（或设同名环境变量）：")
        print("  SF_LLM_BASE_URL=https://api.deepseek.com/v1")
        print("  SF_LLM_API_KEY=sk-你的key")
        print("  SF_LLM_MODEL=deepseek-chat")
        print("填完重跑本脚本；通过后再启动服务。")
        return 1

    started = time.time()
    result = llm.complete("你是接入自检助手，只回答一句话。", args.prompt, meta={"role": "writer"})
    elapsed = int((time.time() - started) * 1000)

    print("\n真实调用耗时:", elapsed, "ms")
    print("返回模式    :", result.get("mode"))
    if result.get("mode") == "live":
        text = (result.get("text") or "").strip()
        print("返回内容    :", (text[:200] + "…") if len(text) > 200 else text)
        print("\n[通过] 已接通真实模型，后续任务会走真实推理。")
        return 0

    print("失败原因    :", result.get("error"))
    print("\n[未通过] 已降级到模拟器。按顺序检查：")
    print("  1) key 是否有效、有没有多余空格")
    print("  2) base_url 能否拼接成 /v1/chat/completions")
    print("  3) model 名是否是这家服务商认识的")
    print("  4) 本机网络 / 代理是否能访问该地址")
    return 1


if __name__ == "__main__":
    sys.exit(main())

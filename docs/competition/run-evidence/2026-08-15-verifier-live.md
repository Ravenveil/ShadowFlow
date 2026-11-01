# LLM-as-Verifier Live Run（2026-08-15）

- provider: `zhipu` / model: `glm-4-flash` / K: 2（真实 API 调用）
- workflow: `demo-verifier-live`（control.loop + sensor.type=verifier）
- 结果: converged=True iterations=1 status=converged

## Iterations

```json
[
  {
    "index": 0,
    "sensor": {
      "sensor_type": "verifier",
      "value": 0.9,
      "converged": true,
      "classification": "converged",
      "verifier_score": 1.0,
      "verifier_confidence": 0.975,
      "verifier_reasoning": "The current quality_score of 0.9 meets the convergence criterion of >= 0.85, indicating full convergence.",
      "verifier_samples": 2,
      "verifier_score_std": 0.0,
      "logprob_data": null
    }
  }
]
```

## HTTP 全栈冒烟（uvicorn :8117）

- `GET /health` → 200
- `POST /workflow/run`（sensor.type=verifier, provider=zhipu/glm-4-flash）→ 200
  converged=True · iterations=1 · verifier_score=1.0 · confidence=1.0
- `POST /workflow/export/agentteams` → 200（zip 含 team-cr.yaml/workflow.json/manifest.json/run.sh/README.md）

## 结论

- LLM-as-Verifier 真实 LLM 端到端 ✅（脚本 `scripts/demo/demo_verifier_live.py` 可复跑）
- LightRAG 真验 ❌ 被余额阻塞：智谱 embedding-2/3 均返回 1113（余额不足），免费档仅 glm-4-flash chat
- 付费模型（glm-4.5/air）同样 1113；充值后 SF_VERIFIER provider=zhipu + ZHIPU_MODEL 可直接切换

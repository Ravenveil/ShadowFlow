# LingBot-VA 复现报告（显卡视角）

> Causal World Modeling for Robot Control · RSS 2026 · Robbyant / 蚂蚁集团
> arXiv: [2601.21998](https://arxiv.org/abs/2601.21998) · GitHub: [robbyant/lingbot-va](https://github.com/robbyant/lingbot-va) · HF: [collection](https://huggingface.co/collections/robbyant/lingbot-va)
> 生成日期：2026-06-18 · 方法：lab4ai-paper-analysis + repro-report

---

## 1. 项目档案

| 项 | 值 |
|---|---|
| 类型 | 因果视频-动作世界模型（交替自回归生成视频帧 + 动作 token） |
| 参数量 | **5.3B 总参**（视频流 Wan2.2-5B：hidden 3072 / 30 层；动作流共享 30 层、hidden 768、约 +350M） |
| VAE | Wan2.2 因果 VAE，4×16×16 压缩 + 2× patchify → 192 spatial tokens/帧 |
| 动作空间 | 30 维（左右臂 EEF×7 + 关节×7 + gripper×1） |
| 关键机制 | 跨 chunk 持久 **KV-Cache**（Algorithm 1），避免重算历史上下文 |
| 精度 | **bf16 混合精度**全程 |
| 数据 | RoboTwin Clean+Aug（HF，82.5k 样本行 / **443GB**）、LIBERO；预训练 1.4T tokens / ~16K 小时（6 来源） |

---

## 2. 三类显卡需求

### 2.1 推理 / 评测 — 官方背书单卡 24GB（4 个里对推理最友好）
- **~24GB VRAM**：RoboTwin 单卡评测（offload 模式，VAE+text_encoder 下放 CPU）—— **README 原文**。
- **~18GB VRAM**：单卡 i2av（图→视频+动作）推理（offload）—— **README 原文**。
- → **单卡 RTX 4090 24GB 可跑**（论文未点名 4090，但 18–24GB 显然适配 24GB 卡）。
- 推理求解器：Euler，视频 3 步（积分到 s=0.6）、动作 10 步（到 s=1.0）；video CFG 5.0 / action CFG 1.0。
- ⚠️「5–15 fps」是**数据预处理的 VAE 抽帧下采样设置**，**不是**部署控制频率；论文只定性称「高频闭环」，**未给 fps/延迟绝对值**（异步流水线相对同步「快 2×」）。
- **买卡**：RTX 4090 24GB / RTX 5090 32GB，单卡。

### 2.2 后训练 / 微调 — 默认 8 卡，可降级
- README：**支持在自定义机器人数据上后训练（微调）**；启动脚本默认 **NGPU=8 + FSDP**。
- 明确支持小资源：**「显存不足就调大 `gradient_accumulation_steps`」**，推荐 global batch 32/64。
- 数据效率高：**少至 50 条示范**；LR 1e-5 / 3K 步（或 1e-4 / 1K 步「算力受限」快档）。
- **无 LoRA**，为全量微调。
- 工程推算：5.3B 全量 FT 经 FSDP 分片，**8×24GB（如 8×4090）可行**，或 **2–4×48GB**（A6000）+ 梯度累积。
- 存储：需 **443GB** 放 RoboTwin 数据集；base 仓库本体 24.4GB。
- **买卡**：本地 4×RTX 4090 24GB 或 2×RTX 6000 Ada 48GB；云 8×A100 40GB。

### 2.3 从零预训练 — 不可复现
- **仅后训练代码开源，预训练代码未发布** → 无法从零复现 1.4T-token 预训练。
- 预训练 GPU 型号/卡数/时长论文**均未披露**。

---

## 3. 复现可行性评分

| 维度 | 状态 |
|---|---|
| 权重可下载 | ✅ base / posttrain-robotwin / posttrain-libero-long（HF+ModelScope） |
| 推理代码 | ✅ 开源，附官方 VRAM 数字 |
| 后训练代码 | ✅ 开源（全量微调，可降级到少卡） |
| 预训练代码 | ❌ 未发布 |
| 评测可复现 | ✅ RoboTwin 2.0 + LIBERO 均有 launch 脚本 |
| 数据集 | ✅ RoboTwin 443GB 公开；LIBERO 集可下 |

**结论**：推理 + 评测 + 后训练**全可复现**（且推理门槛最低、有官方数字）；预训练**不可复现**。报告指标：RoboTwin 2.0 Easy 92.9% / Hard 91.6%，LIBERO 平均 98.5%。

---

## 4. 一句话选卡

- **跑通推理 / 复现评测**：RTX 4090 24GB 单卡（官方 18–24GB 背书）。
- **微调到自己数据**：8×24GB FSDP（官方默认）或 2–4×48GB + 梯度累积；备 443GB 存储。
- **从零预训练**：不可行（无预训练代码），用发布权重。

来源：[arXiv 2601.21998](https://arxiv.org/abs/2601.21998)（§4.2） · [GitHub README](https://github.com/Robbyant/lingbot-va) · [HF collection](https://huggingface.co/collections/robbyant/lingbot-va) · [RoboTwin 数据集](https://huggingface.co/datasets/robbyant/robotwin-clean-and-aug-lerobot)（82.5k 行 / 443GB） · [base 模型](https://huggingface.co/robbyant/lingbot-va-base)

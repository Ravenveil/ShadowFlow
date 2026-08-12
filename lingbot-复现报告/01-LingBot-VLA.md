# LingBot-VLA 复现报告（显卡视角）

> A Pragmatic VLA Foundation Model · Robbyant / 蚂蚁集团
> arXiv: [2601.18692](https://arxiv.org/abs/2601.18692) · GitHub: [robbyant/lingbot-vla](https://github.com/robbyant/lingbot-vla) · HF: [robbyant/lingbot-vla-4b](https://huggingface.co/robbyant/lingbot-vla-4b)
> 生成日期：2026-06-18 · 方法：lab4ai-paper-analysis + repro-report

---

## 1. 项目档案

| 项 | 值 |
|---|---|
| 类型 | 双臂机器人 视觉-语言-动作（VLA）基座模型 |
| 参数量 | **~4B**（VLM 主干 + 动作专家；精确拆分未披露） |
| 主干 | **Qwen2.5-VL-3B-Instruct**，或 PaliGemma-3B（两者皆支持） |
| 架构 | VLM 主干 + 动作专家，经 Mixture-of-Transformers (MoT) 融合；**Flow Matching** 生成连续轨迹 |
| 动作空间 | 75 维（max_action_dim），支持 14 维目标机器人 |
| 训练数据 | **2 万小时**真机遥操作数据，覆盖 **9 种**主流双臂构型 |
| 权重格式 | F32 safetensors（约 16GB on-disk）；许可 Apache-2.0 |
| 软件栈 | Python 3.12.3 / PyTorch 2.8.0 / CUDA 12.8；FSDP2 + torch.compile + FlexAttention |

---

## 2. 三类显卡需求

### 2.1 推理 / 部署 — 单卡 24GB 即可（推算）
- 4B 模型 bf16 权重约 **8GB**，加激活/动作专家，**单卡 RTX 4090 24GB 足够**。
- ⚠️ 论文/仓库**未直接给推理 VRAM 数字与控制频率**，上面为按参数量推算。
- 部署参数：动作 horizon 50（真机 `--use_length 25`，仿真 50）；Flow-Matching 去噪步可调，`--num_denoising_step 5` 加速；`--use_compile` 开 torch.compile。
- **买卡**：RTX 4090 24GB / RTX 5090 32GB，单卡即可上车。

### 2.2 后训练 / 微调（把模型适配到你自己的机器人）— 硬门槛 48GB
来自仓库 `configs/vla/Training_Config.md` 的**实测值**：
- **推荐机型：4×A6000（48GB），实测每卡约 47.4GB（47,424 MB）显存占用**。
- **全量微调，无 LoRA**（仓库未提供 LoRA 配置）。
- Global batch **256**：4×A6000 → micro-batch 4 × 梯度累积 16；或 8 卡 → micro-batch 32 × 累积 1。
- 步数：真机最多 **40,000 步**（LR 5e-5）；RoboTwin 2.0 仿真最多 **20,000 步**（LR 1e-4）。MarkTechPost 报道为「batch 256 跑 20 epoch」。
- 数据效率：每任务 80–130 条示范即有竞争力结果。
- 精度：`enable_fp32: true`（动作专家用 fp32）、`use_compile: true`、FSDP2。

> **关键结论**：47.4GB > 24GB，**消费级 4090 单卡塞不下全量微调**。后训练必须：
> - **≥48GB 单卡**（RTX 6000 Ada 48GB / RTX PRO 6000 96GB / A100 80GB），或
> - **多卡 FSDP 分片**（4×24GB 也许可行但官方未验证，官方基线是 4×48GB）。

- **买卡**：2–4×RTX 6000 Ada 48GB（本地工作站）或 4×A100 40/80GB（云）。

### 2.3 从零预训练 — 不建议复现
- 吞吐：8 卡 **261 samples/s/卡**，比 StarVLA/OpenPI 等快 1.5–2.8×；在 8/16/32/128/256 卡上近线性扩展。
- ⚠️ **GPU 型号、卡数上限、墙钟时长论文均未披露**，无法估成本。
- **2 万小时**全量预训练语料**公开性未确认**（仅 GM-100 评测集确认公开）。
- 训练代码虽开源，但**缺料**，从零预训练不现实 → **直接用发布的 4B 权重**。

---

## 3. 复现可行性评分

| 维度 | 状态 |
|---|---|
| 权重可下载 | ✅ HF + ModelScope，Apache-2.0 |
| 推理代码 | ✅ 全量开源 |
| 训练代码 | ✅ 全量开源（含 Training Config / Custom Data 指南） |
| 评测集 | ✅ GM-100 公开 |
| 全量预训练数据 | ⚠️ 2 万小时语料公开性未确认 |
| 推理 VRAM 官方数 | ❌ 未给（按 4B 推算单卡 24GB 够） |

**结论**：推理与后训练**高度可复现**；从零预训练**不可行**（缺数据规模/型号信息）。

---

## 4. 一句话选卡

- **只想跑通 / 部署**：RTX 4090 24GB 或 RTX 5090 32GB，单卡。
- **要微调到自己机器人**：**至少 48GB**，推荐 4×RTX 6000 Ada 48GB 或 4×A100；4090 单卡不够。
- **从零预训练**：放弃，用官方权重。

来源：[arXiv 2601.18692](https://arxiv.org/abs/2601.18692) · [arXiv HTML](https://arxiv.org/html/2601.18692v1) · [GitHub](https://github.com/robbyant/lingbot-vla) · [Training_Config.md](https://raw.githubusercontent.com/robbyant/lingbot-vla/main/configs/vla/Training_Config.md) · [HF card](https://huggingface.co/robbyant/lingbot-vla-4b) · [MarkTechPost](https://www.marktechpost.com/2026/01/29/ant-group-releases-lingbot-vla-a-vision-language-action-foundation-model-for-real-world-robot-manipulation/)

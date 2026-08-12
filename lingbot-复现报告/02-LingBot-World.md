# LingBot-World 复现报告（显卡视角）

> Advancing Open-source World Models · Robbyant / 蚂蚁集团
> arXiv: [2601.20540](https://arxiv.org/abs/2601.20540) · GitHub: [robbyant/lingbot-world](https://github.com/robbyant/lingbot-world) · HF: [base-cam](https://huggingface.co/robbyant/lingbot-world-base-cam) / [base-act](https://huggingface.co/robbyant/lingbot-world-base-act-preview)
> 生成日期：2026-06-18 · 方法：lab4ai-paper-analysis + repro-report

---

## 1. 项目档案

| 项 | 值 |
|---|---|
| 类型 | 视频生成世界模型 / 实时环境模拟器 |
| 基座 | **Wan2.2 14B 图生视频 DiT**（非 5B） |
| 实际规模 | 扩展为 MoE，**总参数 28B / 每个去噪步只激活 ~14B**（2 专家 ×14B） |
| 输出 | 480P & 720P，16fps，最长 **961 帧 ≈ 1 分钟** |
| 控制信号 | 相机位姿 / 机器人动作序列 / 自由生成 |
| 并行 | **FSDP2 + Ulysses 序列（上下文）并行** |
| 精度 | bf16；提供 **NF4 4-bit 量化版**（bitsandbytes，仅推理） |
| 许可/数据 | 权重公开；训练数据（真实+游戏+UE 合成的「混合数据引擎」）**未量化、未发布** |

> ⚠️ 下文具体 VRAM 数字多来自**二级来源**（云厂商 immers.cloud、社区 Pinokio 安装器、lingbot-world.net），**非论文原文**；论文只给了架构与并行策略，**没给训练 GPU 数/时长，也没给官方分辨率→VRAM 表**。

---

## 2. 三类显卡需求

### 2.1 推理 — 两条路线天差地别

**路线 A：NF4 4-bit 量化（单卡 24GB 可跑）** ← 个人首选
- 主模型 NF4 权重 **~19GB** + VAE/T5 等辅助 **~9GB** ≈ **28GB**，靠 offload 塞进 **24GB RTX 4090（单卡）**。
- 推荐 24GB、最低约 20GB（社区 Pinokio「RTX 24GB Optimized / NF4」安装器）。
- 代价：**生成慢**，默认 81 帧 / 40 步要**数分钟**；NF4 视觉/时序一致性略降。
- NF4 权重是社区镜像 `cahlen/lingbot-world-base-cam-nf4`（非官方 org）。
- 分辨率粗指引：**480P ≥16GB**（3080/4080 级）、**720P ≥24GB**（4090/A6000 级）。

**路线 B：全精度 / 实时（数据中心级）**
- bf16 全权重 ~176GB 量级（含 T5+VAE+开销） → 需 **8×80GB**。
- 官方推理脚本即 `torchrun --nproc_per_node=8 --ulysses_size 8`（8 卡）。
- 「<1 秒延迟 / 16fps」实时只在**全模型 + 多卡节点**成立，**不适用 24GB NF4 路线**。
- 省显存开关：`--t5_cpu` / `--t5_fsdp` / `--dit_fsdp`。

- **买卡**：玩票/单机出图 → RTX 4090 24GB 或 5090 32GB（NF4）；实时/全精度 → 8×A100/H100 80GB 节点（基本只能云）。

### 2.2 后训练 / 微调 — adapter 级，但无公开数字
- 机制：动作/相机条件训练**只微调 adapter 层，主干视频骨干冻结**（MarkTechPost 转述论文）。
- ⚠️ **任何来源都没给微调的 GPU 数 / VRAM**。冻结主干 + adapter 显著便宜于预训练，但论文未量化。
- 工程推算：仍需把 ~14B-active 主干以 bf16 载入（~28GB+），故**单卡 ≥48GB（A6000 / A100 80GB）** 较稳。
- **买卡**：1×RTX 6000 Ada 48GB 或 1×A100 80GB 起步。

### 2.3 从零预训练 — 不可复现
- **训练代码未发布**，数据集未发布（仅定性描述），GPU 规模未披露。
- → 只能用发布权重做推理 / adapter 微调。

---

## 3. 复现可行性评分

| 维度 | 状态 |
|---|---|
| 权重可下载 | ✅ cam / act / act-preview；NF4 社区镜像 |
| 推理代码 | ✅ 开源（torchrun + Diffusers，需 torch≥2.4、flash_attn） |
| 训练代码 | ❌ 未发布 |
| 数据集 | ❌ 未发布 |
| 官方 VRAM 表 | ❌ 无（数字来自二级来源） |
| ComfyUI | ⚠️ 无官方集成；有社区 Pinokio/NF4 工具 |

**结论**：推理**可复现**（NF4 单卡 4090 / 全精度 8 卡）；后训练**理论可行但无官方指引**；预训练**不可复现**。

---

## 4. 一句话选卡

- **单机出图玩世界模型**：RTX 4090 24GB / 5090 32GB + NF4（接受分钟级生成）。
- **要实时 16fps / 全精度**：8×A100 或 H100 80GB 单节点（云）。
- **adapter 微调**：1×48–80GB 起步（官方无数字，工程估算）。

来源：[arXiv 2601.20540](https://arxiv.org/abs/2601.20540) · [GitHub README](https://github.com/Robbyant/lingbot-world/blob/main/README.md) · [HF base-cam](https://huggingface.co/robbyant/lingbot-world-base-cam) · [MarkTechPost](https://www.marktechpost.com/2026/01/30/robbyant-open-sources-lingbot-world-a-real-time-world-model-for-interactive-simulation-and-embodied-ai/) · [immers.cloud（量化 VRAM）](https://en.immers.cloud/ai/Robbyant/lingbot-world-base-cam/) · [Pinokio NF4 安装器](https://github.com/zast57/lingbot-world-pinokio) · [lingbot-world.net（分辨率分级）](https://lingbot-world.net/)

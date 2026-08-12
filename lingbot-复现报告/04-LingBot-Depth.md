# LingBot-Depth 复现报告（显卡视角）

> Masked Depth Modeling for Spatial Perception · Robbyant / 蚂蚁集团
> arXiv: [2601.17895](https://arxiv.org/abs/2601.17895)（2026-01-25） · GitHub: [robbyant/lingbot-depth](https://github.com/robbyant/lingbot-depth) · HF: [collection](https://huggingface.co/collections/robbyant/lingbot-depth)
> 生成日期：2026-06-18 · 方法：lab4ai-paper-analysis + repro-report

---

## 1. 项目档案

| 项 | 值 |
|---|---|
| 类型 | 深度感知 / 空间感知基座模型（深度补全、重建、4D 点追踪、抓取） |
| 参数量 | **~300M**（编码器 ViT-Large/14，24 层，DINOv2 官方权重初始化；解码器 ConvStack，精确总参未披露） |
| 输入/输出 | RGB[B,3,H,W] + 原始深度[B,H,W] + 相机内参 → 精修深度 + 3D 点云；H、W 须能被 14 整除 |
| 预训练目标 | **Masked Depth Modeling (MDM)**（仿 MAE，仅对深度 token 掩码，掩码率 60–90%） |
| 精度 | 训练 **BF16 全程**；推理支持 FP16（`use_fp16=True`，需 xformers） |
| 许可 | 模型 **Apache-2.0**；数据集 CC BY-NC-SA 4.0（非商用） |

---

## 2. 三类显卡需求

### 2.1 推理 — 4 个模型里最轻
- ~300M 参数、单次前向、FP16 → **几乎任何单卡都能跑**（按参数量推算 <8GB）。
- ⚠️ 论文/卡片**未给推理 VRAM / fps / 延迟**；称「实时」为设计目标，未给吞吐数。
- 输入分辨率灵活（H、W 整除 14）；合成数据渲染分辨率 960×1280。
- **买卡**：任意单卡，RTX 4060/4070 12GB 即可，4090/5090 富余；这是唯一能下放到入门卡的模型。

### 2.2 预训练 — 唯一公开了集群规模的模型（论文 §Training 明确）
- **128 GPU**（型号未披露），**global batch 1024**，**per-GPU batch 8**。
- **250,000 步**，每 25,000 步学习率减半；**约 7.5 天**。
- 优化器 AdamW（β=0.9/0.999，wd 0.05），grad clip 1.0，backbone 用低学习率（差分 LR），BF16 混合精度。
- 注意：**per-GPU batch 仅 8、模型仅 300M**，所以**单卡显存需求不大（~16–24GB 级）**；128 卡是为了**吞吐 + 海量数据**（10M 样本），不是被显存逼的。

### 2.3 后训练 / 微调 — 无公开数字，但 300M 极轻
- ⚠️ **无任何来源给出微调 GPU 数 / VRAM**。论文唯一微调配方是 MoGe 下游实验（「只用 TartanAir 省训练时间」），仍无硬件数。
- 工程推算：300M 模型微调，**单卡 24GB（4090）绰绰有余**，甚至更小卡可行。
- **买卡**：单卡 RTX 4090 24GB 或更低。

---

## 3. 数据集（复现预训练的真正门槛）

| 项 | 值 |
|---|---|
| 公开数据集 | HF `robbyant/mdm_depth`：**3,019,200 样本 / 2.71TB**（RobbyReal 140 万 / RobbyVla 58 万 / RobbySim 99.9 万 / SimVal 3.9 万） |
| 格式 | RGB=JPG，深度=16-bit PNG（毫米） |
| 实际预训练语料 | **10M 样本**（自建 3.2M + 7 个第三方开源 RGB-D 集），**完整集未全公开**，需自行凑外部数据 |
| 合成数据 | Blender 渲染 1000 万样本，442 个室内场景，960×1280 |

---

## 4. 复现可行性评分（4 个里最高）

| 维度 | 状态 |
|---|---|
| 权重可下载 | ✅ pretrain-vitl-14 / v0.5 / postrain-dc（HF+ModelScope，Apache-2.0） |
| 训练代码 | ✅ 开源（abstract 明确「释放代码+权重+3M 数据」） |
| 数据集 | ✅ 3M / 2.71TB 公开（非商用）；⚠️ 完整 10M 需自凑 7 个外部集 |
| 预训练硬件 | ✅ **唯一明确：128 卡 / 7.5 天 / BF16**（型号未说） |
| 推理/微调 VRAM | ❌ 未给（按 300M 推算单卡很轻） |
| MoRGBD↔VLA 集成 | ⚠️ 论文未提，三来源未佐证，存疑 |

**结论**：4 个模型里**最易复现**——代码/权重/数据全开源、模型最小、推理可下放入门卡。完整预训练复现门槛是**算力（128 卡级）+ 存储（2.71TB+）+ 凑齐外部数据**，普通用户**直接用发布权重**即可。

---

## 5. 一句话选卡

- **推理 / 用它做深度补全**：任意单卡（12GB 起，4090/5090 富余）。
- **微调到自己 RGB-D 数据**：单卡 RTX 4090 24GB 足够（官方无数，300M 很轻）。
- **从零复现预训练**：128 卡多机 ×7.5 天 + 2.71TB 存储（云上多节点 H100），一般无必要。

来源：[arXiv 2601.17895v1](https://arxiv.org/abs/2601.17895) · [GitHub](https://github.com/robbyant/lingbot-depth) · HF 卡片 `lingbot-depth-pretrain-vitl-14` / `…-postrain-dc-vitl14` · [HF 数据集 mdm_depth](https://huggingface.co/datasets/robbyant/mdm_depth)（3M / 2.71TB）

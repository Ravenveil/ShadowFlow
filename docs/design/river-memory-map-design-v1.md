# 记忆系统·大地图模式 · 设计决策记录 v1

**日期**：2026-04-18
**Session**：BriefBoard 记忆主页重设计讨论
**状态**：方向已定 · 视觉稿延期到代码阶段用 Figma/Procreate 重画
**作废 Pencil 稿**：
- `jNQRS` BriefBoard_v4_dual_pack — OBSOLETE（违反 md §1.7 + 没地图感）
- `y1MOK` BriefBoard_v5_map_default — ROUGH DRAFT（几何原图凑不出 painted kingdom 质感）

---

## 1. 本次讨论解决了什么

### 1.1 拍板的方向

记忆系统的可视化 **是大地图模式**，不是：
- ❌ admin dashboard（3 列 stats + feed + inspector）
- ❌ flowchart / node graph（n8n 风格，适合给 Engine 视图用，不适合给用户首屏）
- ❌ 把 "river" 标签硬贴到抽象关系图上

是：
- ✅ **painted kingdom map 风格的俯瞰战略地图**（参考三国志 / Total War / 文明 IV 战役视图）
- ✅ 几个 **painted region** 作为 6 概念承载
- ✅ 区域间 **n8n 风 bezier 弯曲路径**
- ✅ 每区 **地标 icon**（city crest、pagoda、fortress 等）
- ✅ 路径上可有 **结构件**（水闸闸门）

### 1.2 六概念 → 地图表形式映射（锁定）

| 概念 | 地图表形式 | 画面位置 |
|---|---|---|
| **主流** | 🏯 **大区域** · 中心王国 | 正中央，占最大面积 |
| **支流** | 🗼 **中区域 × N** · 环绕主流的省份 | 外围，数量=agent 数 |
| **同步点** | ◆ **junction 节点** · 关隘/桥梁 | 主流与支流之间的对接点 |
| **沉淀** | ⛰️ **底层剖面** · 地质 strata | 主流**下方**的地质剖面视图 |
| **水闸** | 🚪 **路径结构件** · 闸门 | 落在弯曲路径上，不是独立区域 |
| **自净化** | ⟢ **小区域 OR 游走 avatar** | 独立小泉 / 或地图上巡游的净化机器人 |

### 1.3 Skin / Pack 契约（7 slot）

记忆地图的皮肤就是一个 `*.skin.yaml`，包含 **7 个可换 slot**：

```yaml
# skins/river.skin.yaml（默认皮肤）
name: "River (Default)"
inherits: null

stage_texture:    "./assets/ink-wash-atlas.png"   # 整张地图底图
region_shapes:                                    # 每种概念一种 SVG path
  main:    "./paths/kingdom-coastline.svg"
  branch:  "./paths/province-border.svg"
  sync:    "./paths/gate-fort.svg"
  sediment: "./paths/strata-cross-section.svg"
  purifier: "./paths/spring-pool.svg"
path_style:                                       # 区域间的 bezier 路径风格
  kind:       "bezier"
  stroke:     {thickness: 2.5, fill: "#6A9EFF"}
  particle:   "./assets/water-drop.png"
landmark_icons:                                   # 每区地标
  main:     "castle"      # lucide name 或 SVG path
  branch:   "tower"
  sync:     "fortress"
  sediment: "layers"
  purifier: "droplets"
avatar:           "./assets/fish-or-boat.png"     # 走在路径上的角色
chrome:                                           # 界面装饰（scroll 边、印章、typeface）
  border:    "./assets/scroll-edge.png"
  typeface:  "Geist"
  accent:    "#6A9EFF"
typeface_bundle:  "./fonts/geist-pack"
```

**换皮就是复制此 YAML + 换资源**：
- `ming.skin.yaml` → 紫禁城鸟瞰 atlas + 6 个朝代术语 path + 大臣 avatar + 朱批 chrome
- `library.skin.yaml` → 图书馆大厅 atlas + 书架形状 path + 读者 avatar + 卡片目录 chrome
- `cyberpunk.skin.yaml` → 社区自制皮

**继承规则**：未填 slot fall back 到 parent 或 `default.skin.yaml`。

---

## 2. 本次讨论暴露的教训

### 2.1 Pencil 的能力边界

Pencil **不是 2D 绘图软件**。用它直接拼 `ellipse / rectangle / polygon` 几何原图凑不出 painted kingdom map 质感——结果永远是"白板草图+贴纸"风，连低保真都不够看。

Pencil **真正能做**的：
- 图文排版 / admin UI 线稿（当前 pen 里其他页面都在这个能力半径内）
- 用 `fill: type:"image"` 嵌入外部 PNG/JPG
- 用 `G(node, "ai", prompt)` 调 AI 生图作贴图（文档提到但未实测稳定度）
- 简单 SVG path（但人工写复杂 path 地形，出错率高）

### 2.2 失败路线记录

- **v4 dual_pack**：试图用"双视图 + 双切换器"表达"皮可换骨不变"。问题：metaphor view 仍是抽象图、不符合用户"地图模式"期望；engine view 违反 md §1.7（节点 fill 白色、diamond 24×24、缺成对）
- **v5 map_default**：试图用几何原图+ellipse+rounded-rect 拼 kingdom map。问题：质感极差（被用户原话评价"丑出新高度"）。根因：Pencil 工具集不适合做 painted map

### 2.3 正确路线（延期到代码阶段）

**分工**：
1. **Pencil** 做什么：admin UI 线框、组件排版、结构示意图、术语表——**不做 painted art**
2. **Figma / Procreate / Photoshop** 做什么：painted map atlas、region shape、landmark 贴图、avatar sprite——**交付 PNG/SVG asset**
3. **代码阶段**：前端读 skin.yaml，把 asset + region-graph 合并渲染成可交互 map canvas（可能用 Konva.js / Pixi.js / SVG-native React）

**时机**：等 MVP 的记忆系统 API/backend 就绪，开始前端实现时再回来画真稿。不是现在。

---

## 3. 还没定的开放问题（下次讨论再开）

- **agent 支流的数量是固定 3 个示例还是随 agent 动态增长**？
- **用户本人在地图上有 avatar 吗**？（走在主流上？坐在王座上？还是 god-mode 不出现）
- **drink/pour 是"点 region 按钮"还是"拖拽 token 沿路径"交互**？
- **SyncPoint 冲突展开是右抽屉还是悬浮 tooltip 还是弹窗**？
- **缩放 / 平移 / minimap**：大地图需要多大？要 zoom 吗？
- **Inspector 面板**：地图右侧要不要保留一个侧栏？还是完全清屏留给地图？
- **全局 Skin 系统 4 层架构**（tokens / chrome / icon set / deep slots）——挂起，记忆地图做完再开

---

## 4. 下次打开本文档的人

- 方向（区域+弯曲路径+地标+ Pack 换皮）**已经锁定**，不要再在"要不要用地图"上打转
- Pencil 里的 v4、v5 frame **仅作历史参考**，视觉表达以本文档为准，实际稿以 Figma 重画版为准
- 如果你是 AI agent：**不要再在 Pencil 里重画这张地图**，直接去 Figma / 和设计师讨论

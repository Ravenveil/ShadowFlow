# ShadowFlow · 生成设计稿（plugin1）

从 Figma “New plugin” 模板改造的**离线**插件：不请求网络、不消耗 MCP 配额，运行即在当前 Figma 页生成设计稿。插件 `id` 是 Figma 分配的原值 `1705825697927036449`，因此 Development 列表直接可见，不需要再手动 Import manifest。

## 怎么运行

1. Figma 桌面版 → Plugins → Development → 找到 **ShadowFlow · 生成设计稿**
2. 打开目标文件（例如 ShadowFlow-Paper-Platform）
3. 再次 Plugins → Development → **ShadowFlow · 生成设计稿**

同名旧图层会先删除，不会重复堆叠。

## 生成内容

- 论文平台 · 落地页 / 墨橙（1440 宽，结构对齐 shadow-merge）
- 论文平台 · DAG 结合版 / 墨橙（1440×1080，shadow 主仓 DAG + shadow-merge 时间线）
- 论文平台 · 三栏工作台 / 墨橙 / 净白 / 夜间（1440×900，Rail + List + Chat，无执行详情栏）
- 论文平台 · 编队面板特写 / 墨橙（340×900）
- 论文平台 · 设置 / 墨橙（940×672）

## 维护方式

- 真入口是 `code.js`，由 `../workshop.js` 复制而来；`code.ts` 只是占位说明。
- 改设计稿：编辑 `../workshop.js` → `cp ../workshop.js code.js` → 运行 `node ../verify-workshop.mjs`（会同时校验两份文件一致）。
- **不要恢复模板的 TypeScript build**：`package.json` 里的 `build`/`watch` 已改成空操作，防止 `tsc` 把 `code.js` 覆盖成 `throw new Error(...)`。
- 插件不内联任何 token；`networkAccess.allowedDomains` 为 `["none"]`。

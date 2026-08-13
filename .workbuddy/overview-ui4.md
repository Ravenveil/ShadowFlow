# UI 4.0 重构总结 — 对标 clawsgo / WorkBuddy

> 日期:2026-08-13 · 状态:已提交 `feat(ui): UI4.0 全站观感重构` · 验证:40/40 测试通过 + vite build 通过

## 做了什么

**核心方法**:不靠印象猜 clawsgo 风格,直接 curl 抓取 clawsgo.cn 的 CSS 产物(`/_next/static/chunks/*.css`),提取真实设计令牌后校准 ShadowFlow。缓存:`_handoff_tmp/clawsgo_home.html`、`clawsgo.css`。

**clawsgo 实测设计 DNA**(与"满屏品牌蓝"的直觉相反):
- 浅色主题 = 纯白底 + `#f5f5f5` 灰阶层次 + `#e5e5e5` 边框 + `#0a0a0a/#737373` 文字
- 主按钮**近黑 `#171717`**,蓝色 `#1447e6` 只留给关键 accent(克制用色)
- 圆角刻度 10/14/18/26px,字体 Inter Variable

**落地改动(全部 append-only 层叠覆盖,可整块回退)**:

| 文件 | 改动 |
|---|---|
| `src/index.css` | UI4.0 层:day 主题中性化(`#FAFAFA/#E5E5E5/#1447E6`)、全站细滚动条、导航选中指示条弹性生长(`.ui30-navrow.on::before`)、`.ui40-panel` 卡片浮起、`--ui40-shadow-float`、day 主按钮近黑 |
| `src/components/chat-fb/chatFB.module.css` | composer 16px 大圆角浮动卡 + focus 蓝环、用户气泡实色 accent、右栏 tab 下划线滑动、胶囊发送键 |
| `src/pages/chat-home/StartLanding.tsx` | clawsgo 式时段问候(早上好/中午好/下午好/晚上好 + 用户名,`useAuth`)、纯色大标题替代渐变标题、移除 badge |
| `src/components/hifi/HfSidebar.tsx` | 删除 4 处 inline activeBar(与新 CSS 指示条双渲染冲突) |

## 备份与回退

- 开工前备份 commit:`chore: UI4.0 改造前备份快照(含 UI3.0 全部改动)`
- UI4.0 成果 commit:`feat(ui): UI4.0 全站观感重构 — 对标 clawsgo 实测令牌`(6 files, +238/-50)
- CSS 全部是尾部追加层,视觉回退 = 删除 UI4.0 块即可

## 验证

- vitest(chat-home/chat-fb/hifi):**9 文件 40 用例全通过**
- `vite build`:通过(7.67s)
- `tsc --noEmit`:报错仅历史遗留三文件(workflowStore/EditorPage/test-setup),无新增

## 待办(下一轮可深化)

- 视觉效果需 `npm run dev` 实机确认(截图走查对比 clawsgo)
- composer 模型选择器胶囊化(对标「Auto Lite · 高」)
- 右栏「概览/产物」面板对齐 WorkBuddy(任务进程 checklist + 产物区)
- night 主题按同样思路二次校准

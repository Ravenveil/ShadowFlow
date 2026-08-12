---
ds_id: shadcn
name: "shadcn/ui 风格"
description: "现代简洁的深色 UI，Vercel/Linear 风格"
compatible_skills: ["web-prototype"]
---
## Design System: shadcn/ui 风格（纯 CSS 实现）

颜色（深色主题 CSS 变量）：
:root {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --border: 0 0% 14.9%;
  --radius: 0.5rem;
}

风格规则：
- 背景 #0a0a0a，卡片 #1a1a1a，边框 #262626
- 圆角 6-8px，阴影极简（1px 边框代替阴影）
- 字体：system-ui / -apple-system
- 不使用彩色强调色，全黑白灰色调
- 按钮：白底黑字（primary）或黑边透明（ghost）

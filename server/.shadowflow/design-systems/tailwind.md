---
ds_id: tailwind
name: "Tailwind CSS"
description: "Utility-first CSS framework，CDN 版本可直接使用"
compatible_skills: ["web-prototype"]
---
## Design System: Tailwind CSS

使用 CDN 版本（生成的 HTML 必须包含此 script tag）：
<script src="https://cdn.tailwindcss.com"></script>

颜色规范：
- 主色：blue-600 (#2563EB)
- 背景：gray-950 或 white
- 文字：gray-900（浅色主题）/ gray-50（深色主题）
- 组件：使用 Tailwind utility classes，不要写自定义 CSS

布局规范：
- 容器：max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- 响应式：mobile-first，sm:/md:/lg: 前缀
- 间距：统一使用 Tailwind spacing scale（4px 基准）

代码示例（Button）：
<button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
  按钮文字
</button>

必须通过 <script src="https://cdn.tailwindcss.com"></script> 引入，生成的 HTML 必须可以独立运行。

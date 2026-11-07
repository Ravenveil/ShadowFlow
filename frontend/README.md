# shadowflow-frontend

ShadowFlow — AI 营销公司前端（Figma Make 导出）。

- **宣传页**（`/#/`）：产品介绍落地页 —— 「一个人，也能经营一家 AI 营销公司」
- **产品端**（`/#/app`）：对话优先的 AI 营销工作台 —— CEO 主控置顶对话、Agent 团队编队、执行详情与人工审批门

两入口互达：宣传页导航「进入产品」按钮 / Hero 产品图可点击进入产品端；产品端左上角 ShadowFlow logo 点击返回宣传页。

## 运行

```bash
pnpm install   # 或 npm install
pnpm dev       # http://localhost:8443
pnpm build     # 产物在 dist/
```

## 目录结构

```
├── index.html            # 入口 HTML（lang/title 由 .figma/make/site.json 在构建时注入）
├── package.json
├── tsconfig.json
├── vite.config.ts        # React + Tailwind v4 + Make 站点配置插件
├── .figma/make/site.json # 站点元数据（标题/描述/语言）
├── public/favicon.png
├── ProductApp.tsx        # 产品端工作台（CEO 主控对话）
├── product-app.css       # 产品端样式（含 @layer 层序声明，勿删首行）
└── src/
    ├── App.tsx           # 路由包装：hash #/app → 产品端，其余 → 宣传页
    ├── index.css         # 宣传页样式
    ├── main.tsx
    └── vite-env.d.ts
```

> 注：`ProductApp.tsx` / `product-app.css` 位于根目录是 Figma Make 的建文件机制所致；`src/App.tsx` 通过 `../ProductApp` 引用，保持此布局即可正常构建。
>
> Agent 头像为 DiceBear **Lorelei** 人物风（与主应用头像库同风格），SVG 内嵌在 `ProductApp.tsx` 的 `AVATAR_SVG` 映射里，离线渲染、无外部依赖。

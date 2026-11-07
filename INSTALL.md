# ShadowFlow 合并仓 · 安装指南（手把手 + 报错速查）

> 仓库：<https://github.com/Ravenveil/shadowflow-merged>
> 本文档假定你从零开始。按顺序做即可；卡住了直接翻最后的【报错速查】。

---

## 0. 环境要求（先检查，别跳过）

| 依赖 | 版本要求 | 检查命令 | 说明 |
|---|---|---|---|
| Node.js | **≥ 20.19**（推荐 22 LTS） | `node -v` | 前端 Vite 8 硬性要求 20.19+ 或 22.12+，版本低必报错 |
| npm | 随 Node 自带 | `npm -v` | 不用 pnpm 也行 |
| Python | **≥ 3.10** | `python -V`（Windows 也可 `py -V`） | FastAPI 编排核心 |
| Git | 任意近期版本 | `git --version` | 克隆用 |

- **Node 版本不够**：装 [Node 22 LTS](https://nodejs.org/)，或用 `nvm install 22 && nvm use 22`（Windows 用 [nvm-windows](https://github.com/coreybutler/nvm-windows)）。
- **Windows 装 Python**：去 [python.org](https://www.python.org/downloads/) 下 3.10+，安装时务必勾选 **「Add python.exe to PATH」**。
- pnpm **不是必需**（用 npm 一样跑），想用就 `npm i -g pnpm` 或 `corepack enable pnpm`。

---

## 1. 克隆仓库

```bash
git clone https://github.com/Ravenveil/shadowflow-merged.git
cd shadowflow-merged
```

> **网络不通（clone 超时/卡住）**：开代理/VPN 后重试；或在 GitHub 页面点 `Code → Download ZIP` 下载解压（后续没有 git 更新，但一样能跑）。

---

## 2. 安装依赖（三段，各装各的，缺一不可）

```bash
# ① 前端（Vite + React 19）
cd frontend && npm install && cd ..

# ② Node 网关（Express，含 better-sqlite3 原生模块）
cd backend/node && npm install && cd ..

# ③ Python 编排核心（在仓库根目录执行！）
python -m venv .venv
# Windows 激活：  .venv\Scripts\activate
# macOS/Linux 激活： source .venv/bin/activate
pip install -e "./backend/python[server,memory]"
```

> **国内网络慢/超时**，装之前先设镜像（一次性）：
> ```bash
> npm config set registry https://registry.npmmirror.com
> pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
> ```
> ③ 必须在**仓库根目录**建 `.venv`（名字就叫 `.venv`），启动器会自动找它。

---

## 3. 启动

```bash
npm run dev                  # 起 Python(:8000) + Node 网关(:8002) + 前端(:8443)，自动开浏览器
```

成功标志：控制台打印 `[dev] 全部就绪 → http://localhost:8443/`

- 董事长工作台入口：<http://localhost:8443/#/app>
- 不想自动开浏览器：`npm run dev -- --no-open`
- **Python 装不上想先跑起来**：`npm run dev -- --no-python`（只起网关 + 前端，界面能看，AI 编排不可用）

---

## 4. 验证安装

```bash
curl http://localhost:8002/health       # Node 网关健康检查
curl http://localhost:8002/api/agents   # 应返回 8 个内置角色
curl http://localhost:8000/docs         # Python FastAPI 文档页
```

---

## 5. 可选配置

- **大模型 Key**：不配也能启动。要用服务端 AI 能力，复制根目录 `.env.example` 为 `.env`，填 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 任一；或者直接在前端「设置 → BYOK」页面里填（浏览器内配置）。
- **重新生成内置角色种子**：`node scripts/seed-ai-marketing-org.mjs`（幂等，可重复执行）。

---

## 6. 报错速查（卡住了先来这里对号入座）

| 报错关键字 / 现象 | 原因 | 处理 |
|---|---|---|
| `gyp ERR!` / `node-gyp` / `better-sqlite3` 编译失败 | 原生模块需要 C++ 编译环境 | **Windows**：装 [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾「使用 C++ 的桌面开发」→ 重启终端 → `cd backend/node && npm rebuild better-sqlite3`；**macOS**：`xcode-select --install`；**Linux**：`sudo apt install build-essential python3` |
| `prebuild-install warn ... github.com ... failed` | 预编译包下载被墙 | 开代理后 `cd backend/node && npm install` 重试；或先设 npm 镜像（见第 2 节） |
| `python` 不是内部或外部命令 / `Python was not found` | Python 没装或没进 PATH | 装 python.org 的 3.10+ 并勾「Add python.exe to PATH」；或全程用 `py -3` 代替 `python` |
| `ModuleNotFoundError: No module named 'shadowflow'` | ③ 没装或 venv 没激活 | 激活 `.venv` 后重新执行 `pip install -e "./backend/python[server,memory]"` |
| `uvicorn: command not found` / `No module named 'fastapi'` | 同上，extras 没装上 | 同上 |
| `Cannot find module 'tsx'` / `Cannot find module 'vite'` | 对应目录没装依赖 | `cd backend/node && npm install` / `cd frontend && npm install` |
| vite 起不来 / `Unsupported engine` / 一堆 ESM 报错 | Node 版本过低 | 升到 Node 22 LTS（见第 0 节） |
| `端口 8000/8002/8443 已被占用` | 旧进程没退干净 | 关掉占用进程（旧的 uvicorn / tsx / vite）再跑 |
| `ERR_OSSL_EVP_UNSUPPORTED` | Node 17+ 与旧 webpack 冲突（本项目一般遇不到） | 升级 Node；或临时 `set NODE_OPTIONS=--openssl-legacy-provider` |
| npm install 全程卡死/超时 | 国内网络 | `npm config set registry https://registry.npmmirror.com` 后重试 |
| pip install 卡死/超时 | 国内网络 | `pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple` 后重试 |
| 手机/局域网/隧道域名打不开 | — | 已放行所有域名 + 监听 0.0.0.0，直接访问 `http://<本机IP>:8443` 即可 |
| 页面能开但接口 404 | Node 网关没起来 | 确认 :8002 进程在跑；Vite 会把 `/api`、`/projects` 代理过去 |

---

## 7. 快速自检清单（发我之前先过一遍）

1. `node -v` ≥ 20.19？`python -V` ≥ 3.10？
2. 三个依赖都装了？（frontend、backend/node 各有 `node_modules`；根目录有 `.venv`）
3. `pip install -e "./backend/python[server,memory]"` 是在**激活 .venv 之后**执行的？
4. `npm run dev` 控制台最后一行是否打印「全部就绪」？没打印的话把**完整报错**发来。

> 把你卡住那一步的**完整报错原文**发给维护者，比一句「装不上」快十倍。

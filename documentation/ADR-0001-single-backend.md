# ADR-0001：单后端收口 —— 退役 Python 后端（backend/python）

- 状态：**已接受（Accepted）** —— 2026-11-24 owner 拍板「立即彻底退役」，当日执行完毕
- 日期：2026-11-24
- 关联：documentation/ARCHITECTURE.md §9（现状盘点）、documentation/ARC-FRONTEND-ROADMAP.md §五候选 5

## 1. 背景

- 2026-11-21 起本地默认单后端（`scripts/dev.mjs` 的 `SINGLE_BACKEND`），Python
  在默认开发路径上已不启动。
- 但它仍以**配置**形式活着三处：`render.yaml`（生产 web 服务
  shadowflow.onrender.com）、`docker/docker-compose.yml`（:8000，node 依赖其健康
  检查）、CI 的 `Dockerfile.api` 打包门禁。
- Node 侧 62 处 `SF_BACKEND_MODE` 分支（≥10 个 module）让每个新 route 背着
  legacy 回归风险；`schedules.ts` 等逐行照抄 Python 线格式（含故意的 422
  不对称错误形状），implementation depth 在零 leverage 地复制。
- ~185 个 pytest 文件自 2026-11-05 起零 CI —— 幽灵测试网。
- `config/backend-gap.ts:94-98` 列出单后端模式 Node 仍 404 的端点族：
  `/workflow/*` `/builder/*` `/evals/*` `/tools/*` `/regression/*` `/runs/*`
  `/chat/sessions/*` `/citations/*` `/archive/*` `/ops/*` `/policy/*`
  `/templates/*` —— 这就是迁移 burndown 清单（机读版已有：`/health/backend-gaps`）。

## 2. 决定（已定部分）

1. Node（backend/node）是唯一长期后端；Python 不再接收任何新功能。
2. 迁移以 BACKEND_GAP 端点族为单位按域进行，迁完一族删一族 404 占位；
   新代码一律进 `domains/<域>/` 四件套，**不复制 server.py 的 route 层业务规则**。
3. 过渡期线格式翻译收口到单一 adapter（`legacyCompat`），禁止继续在
   各 route 里散点 `照抄 Python` 注释。

## 3. 待 owner 拍板 → 已拍板（2026-11-24）

- **部署切换时机**：owner 选定「立即彻底退役」——不翻转而是**删除**整条旧产品线
  （render.yaml、vercel.json、Dockerfile.api）；依据：两个现役前端（app/paper）
  对 Python 独占端点 0 调用，唯一消费者是 Vercel/Render 上的旧版产品与 legacy
  逃生舱。
- **pytest 网的去留**：安乐死（随目录删除；未逐族移植）。

## 4. 收尾清单

- [x] render.yaml / vercel.json / docker/Dockerfile.api 删除；docker-compose 去
      python 成员（node + web 两服务）
- [x] backend/python/ 整目录删除（≈152 modules + ~185 pytest 文件）
- [x] CI：删 Dockerfile.api 构建步；头部说明更新
- [x] proxy-fallback.ts / python-backend.ts / proxy-fallback.test.ts 删除；
      index.ts 改挂 gap handler；schedules/opc/groups/inbox 条件挂载展开为无条件
- [x] backend-mode.ts 墓碑化（恒 single / groupsBackendEnv 恒 node；
      SF_BACKEND_MODE 环境变量作废）+ backend-gap.ts 提示文案改「永久 404」
- [x] dev.mjs / package.json 去 python 启动分支（dev:python 脚本删除）
- [x] PYTHON_BACKEND_URL → BACKEND_URL（src/config/backend-url.ts，指向 Node
      自身 loopback；team-persistence / craft-team-setup / loop-watcher /
      memory-bank 兜底等 16 个引用点替换）
- [x] 测试更新：backend-mode / backend-gap-root / team-persistence 三文件改
      单后端语义；全量 1906/1906 绿 + arch-check 绿
- [x] CONTRIBUTING.md 端口表/目录树/门禁/反代兜底等 8 处过时描述更新
- [ ] **BACKEND_GAP 的 12 组端点族迁入 node**（仍开放：现在命中即显式 404，
      burndown 看 /health/backend-gaps；frontend/legacy 的 runs/ops 等页面在
      Node 未覆盖的子路径上会 404）
- [ ] 散落在 ≥10 个 module 里的死分支（`isSingleBackend()`/`groupsBackendEnv()`
      恒真恒假）随改随清 —— config 层已墓碑化，行为正确，纯减法
- [ ] ARCHITECTURE.md / GLOSSARY 把「单后端」写成唯一事实

/**
 * paths.ts — 共享的 `.shadowflow` 数据目录解析。
 *
 * 网关的 cwd 随启动方式变化：dev.mjs 在 `backend/node` 里 spawn、测试先 chdir
 * 进一次性 tmp 目录、个别部署从仓库根启动。历史上各模块硬编码
 * `path.join(process.cwd(), '..', '..', '..', '.shadowflow', <sub>)`，只对某一种
 * cwd 深度成立——从 `backend/node` 启动时会向上跳出仓库根，导致 S0.5/S0.7 的
 * team/agent yaml loader 永远找不到文件（`/api/teams/:id/dag` 恒 404
 * TEAM_NOT_FOUND，前端因此判定「未连接后端」）。
 *
 * 解析规则（ROOT，即仓库级共享库）：
 *   1. 从 cwd 的**上一级**开始向上最多 6 级，取最近的已存在
 *      `.shadowflow/<sub>` 目录的那一级作为根。
 *      —— 必须跳过 cwd 自身：cwd/.shadowflow 是 LOCAL_* 的地盘（网关的
 *      sqlite / runs / sessions 等运行时数据就落在 backend/node/.shadowflow），
 *      若在 cwd 命中会把 ROOT 也指进去，yaml 库照样找不到。
 *   2. 找不到时回退 `cwd/../..`（backend/node → 仓库根的经典布局）。
 *
 * LOCAL_* 保持历史语义 `cwd/.shadowflow/<sub>`：测试 chdir 到空 tmp 目录时
 * loader 指向空目录、走 roster 豁底（见 teams-dag-draft.test.ts 的隔离注释）。
 *
 * ⚠️ 本模块必须是零依赖叶子模块：agent-yaml / team-yaml / agent-overrides /
 *    routes/agents/teams 共同引用，且 team-yaml↔agent-yaml 之间已有 import
 *    关系，路径解析放这里避免循环依赖。
 */

import fs from 'fs';
import path from 'path';

const MAX_WALK_UP = 6;

/** 仓库级 `.shadowflow/<sub>` 库的根目录（cwd 上方最近的命中，跳过 cwd 自身）。 */
export function shadowflowRoot(sub: string): string {
  let dir = path.dirname(process.cwd());
  for (let i = 0; i < MAX_WALK_UP; i += 1) {
    if (fs.existsSync(path.join(dir, '.shadowflow', sub))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 回退：`backend/node` → 仓库根的两层上溯；测试 / 根启动场景下此路径不存在，
  // 与历史行为一致（ROOT 落空、LOCAL 兜底）。
  return path.resolve(process.cwd(), '..', '..');
}

/** 仓库级 `.shadowflow/<sub>` 子目录（teams / agents …）。 */
export function shadowflowDir(sub: string): string {
  return path.join(shadowflowRoot(sub), '.shadowflow', sub);
}

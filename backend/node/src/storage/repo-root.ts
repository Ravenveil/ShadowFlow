/**
 * repo-root.ts — 单后端迁移：仓库根 .shadowflow 目录的统一解析入口。
 *
 * 为什么要这个模块：
 *   Node 网关的开发期 cwd = <repo>/backend/node（见 scripts/dev.mjs），
 *   而 Python FastAPI 用 `Path(__file__).parents[N]` 把共享数据写在 <repo>/.shadowflow。
 *   于是 `process.cwd()/.shadowflow`（= backend/node/.shadowflow）和 Python 的
 *   <repo>/.shadowflow 是两个不同目录——历史上导致 migrate 时数据"读不到"。
 *
 *   单后端迁移要接管的 Python 端点（wallet / artifact_pins / message_feedback /
 *   workspaces / teams ...）数据全在 <repo>/.shadowflow。本模块提供统一的
 *   `repoDataDir()` / `repoDataFile()`，显式从 cwd 上溯到仓库根，保证 Node 与
 *   Python 读写同一份文件，legacy↔single 来回切数据不丢。
 *
 * 解析策略（与既有约定一致，见 routes/agents/teams.ts / lib/agent-overrides.ts）：
 *   候选 1：进程 cwd（若其下已有 .shadowflow 且有 app.sqlite → 视为仓库根，生产venv直起场景）
 *   候选 2：cwd/../..（backend/node → repo）— dev 与生产网关默认
 *   候选 3：__dirname/../../../..（src/storage → repo）— 兜底，与 cwd 无关
 *   返回第一个存在 .shadowflow 目录的候选；都不存在则退回候选 2（新装首次启动）。
 *
 * 纯路径计算，无副作用、无 IO 写入，方便单测。
 */

import path from 'path';
import fs from 'fs';

/** 统一的 data-root 环境变量，Python 侧对应 SHADOWFLOW_DATA_DIR。 */
export const DATA_DIR_ENV = 'SHADOWFLOW_DATA_DIR';

/** 返回仓库根路径（含 .shadowflow 的那一层）。 */
export function repoRoot(cwd: string = process.cwd()): string {
  const candidates = [
    cwd,                                                    // 生产/直起：cwd 就是仓库根
    path.resolve(cwd, '..', '..'),                          // dev：backend/node → repo
    path.resolve(__dirname, '..', '..', '..', '..'),        // 兜底：src/storage → repo
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, '.shadowflow'))) return dir;
  }
  // 都没建过 .shadowflow（全新安装）→ 用 dev 惯例作为默认落点。
  return candidates[1];
}

/**
 * 返回共享数据目录 <repo>/.shadowflow（可用 SHADOWFLOW_DATA_DIR 覆盖）。
 * 覆盖值与 Python wallet.py 的 SHADOWFLOW_DATA_DIR 语义一致。
 */
export function repoDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env[DATA_DIR_ENV] ?? '').trim();
  if (override) return path.resolve(override);
  return path.join(repoRoot(), '.shadowflow');
}

/** 返回共享数据目录下的文件路径。 */
export function repoDataFile(...segments: string[]): string {
  return path.join(repoDataDir(), ...segments);
}

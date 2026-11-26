/**
 * chat-workspace.ts — 群（chat）工作目录解析（2026-11-20 自 groups-chat.ts 抽出）。
 *
 * 抽出的原因：远端产出回传（`routes/system/remote-exec.ts` 的 POST /sync）需要
 * 落回**和右栏文件树同一个目录**，否则用户看不到产出。这份解析逻辑原本是
 * groups-chat.ts 的内部函数（约 :784），复制一份必然漂移，所以抽成模块共用。
 *
 * 优先级（与抽出前逐字一致，别改语义）：
 *   1. `userDir`（= group.workspace_dir，用户在群设置里选的绝对路径）：
 *      必须是存在的绝对目录，直接用 —— 这是用户的显式选择。
 *   2. 回落到 **repo 之外**的 scratch 目录：
 *      `$SHADOWFLOW_CHAT_DIR | ~/.shadowflow-chat`/chat-workspaces/<groupId>。
 *      刻意不放在 repo 里：`bypassPermissions + cwd-in-repo` 会让 CLI 顺着 git root
 *      读到整个 ShadowFlow 代码库（见 docs/architecture/chat-cli-cwd-and-permissions.md）。
 */

import { mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/**
 * 所有群工作目录的共同父目录（`<root>/chat-workspaces`）。`root` 的取法见
 * `resolveChatWorkspace`。要枚举「各会话落在工作目录里的产物」的模块用它，
 * 不要各自再拼一遍路径。
 */
export function chatWorkspacesRoot(): string {
  const root = process.env.SHADOWFLOW_CHAT_DIR?.trim() || join(homedir(), '.shadowflow-chat');
  return join(root, 'chat-workspaces');
}

/**
 * 解析群的工作目录。
 *
 * @param groupId  群 id（会清洗非 `\w-` 字符后用作目录名）
 * @param userDir  用户为群显式选择的工作目录（group.workspace_dir），可为空
 */
export function resolveChatWorkspace(groupId: string, userDir?: string | null): string {
  if (userDir && userDir.trim() && isAbsolute(userDir.trim())) {
    const p = userDir.trim();
    try {
      if (statSync(p).isDirectory()) return p;
    } catch {
      /* user dir gone / unreadable — fall through to default scratch */
    }
  }
  const dir = join(chatWorkspacesRoot(), groupId.replace(/[^\w-]/g, '_'));
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* best-effort; spawn will surface a clearer error if it truly can't run */
  }
  return dir;
}

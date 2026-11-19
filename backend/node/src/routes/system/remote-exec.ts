/**
 * remote-exec.ts — 远程执行（SSH）配置与运行端点。
 *
 * 端点（全部挂在 /api/remote-exec，2026-11-19）：
 *   GET  /config  → 当前配置（私钥路径做掩码，不回显完整路径）
 *   PUT  /config  → 保存配置（host/user/port/keyPath/remoteDir）
 *   POST /test    → 连通性自检（echo + uname + pwd，20s 超时）
 *   POST /run     → 在远端项目目录跑一条命令（默认 120s，可传 timeoutMs）
 *   POST /sync    → 把远端产出一键拉回本机（2026-11-20，见下）
 *
 * `/sync` 的定位：agent 在远端跑的产出（log / 图 / tex）必须落回**本机**，右栏
 * 产出面板才看得见 —— 面板枚举的是本机文件系统（前端 NeoHost 跟随
 * conversation.workspaceDir → GET /api/fs/list）。落点与群工作目录同源：
 *   `<resolveChatWorkspace(group_id, group.workspace_dir)>/remote/<turn_id>`
 * 传输方式与上限见 `lib/remote-sync.ts`（ssh | 本地 tar 流，200 MiB / 2000 文件）。
 *
 * 安全边界：命令由本机 ssh 客户端发到用户自己配置的主机，等同于用户手敲 ssh；
 * 本端点不落私钥内容（只存路径），也不支持密码认证（BatchMode=yes）。
 */

import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import {
  mergeSshConfig,
  readSshConfig,
  saveSshConfig,
  sshExec,
  sshProbe,
  validateSshConfig,
  SSH_CONFIG_KEY,
} from '../../lib/ssh-exec';
import { setSetting } from '../../storage/settings';
import { getGroupsBackend } from '../../storage/groups-backend';
import { resolveChatWorkspace } from '../../lib/chat-workspace';
import { pullRemoteTree, RemoteSyncError } from '../../lib/remote-sync';
import { assertInsideRemoteDir } from '../../lib/remote-safety';

const router = Router();

/** 私钥路径掩码：只留最后一段文件名，避免前端日志泄露完整用户目录结构。 */
function maskKeyPath(p?: string): string | null {
  if (!p) return null;
  const parts = p.split(/[\\/]/).filter(Boolean);
  const tail = parts[parts.length - 1] ?? p;
  return parts.length > 1 ? `…/${tail}` : tail;
}

function configView() {
  const cfg = readSshConfig();
  if (!cfg) return { configured: false, config: null };
  return {
    configured: true,
    config: {
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      keyPathMasked: maskKeyPath(cfg.keyPath),
      remoteDir: cfg.remoteDir ?? '',
    },
  };
}

router.get('/config', (_req: Request, res: Response) => {
  res.json({ data: configView(), meta: {} });
});

router.put('/config', (req: Request, res: Response) => {
  try {
    saveSshConfig(req.body);
    res.json({ data: configView(), meta: {} });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'INVALID_SSH_CONFIG') {
      res.status(400).json({
        error: { code, message: (err as Error).message },
      });
      return;
    }
    res.status(500).json({
      error: { code: 'SSH_CONFIG_SAVE_FAILED', message: (err as Error).message },
    });
  }
});

router.delete('/config', (_req: Request, res: Response) => {
  // 通用 settings：写 null 即视为未配置（readSshConfig 对空值返回 null）
  setSetting(SSH_CONFIG_KEY, null);
  res.json({ data: { configured: false, config: null }, meta: {} });
});

router.post('/test', async (req: Request, res: Response) => {
  const saved = readSshConfig();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bodyHasHost = typeof body.host === 'string' && body.host.trim() !== '';

  // 「先测再存」：请求体带 host 就用表单值（与已存配置合并，私钥留空则沿用），
  // 只校验不落库，避免用户点一下测试就把半成品写进 settings。
  let target = saved;
  if (bodyHasHost) {
    const { config, errors } = validateSshConfig(mergeSshConfig(body, saved));
    if (!config) {
      res.status(400).json({
        error: { code: 'INVALID_SSH_CONFIG', message: errors.join('；') },
      });
      return;
    }
    target = config;
  }
  if (!target) {
    res.status(400).json({
      error: { code: 'SSH_NOT_CONFIGURED', message: '还没有配置远程主机，请先填写主机与用户名' },
    });
    return;
  }

  try {
    const r = await sshProbe(target);
    res.json({
      data: {
        ok: r.ok,
        code: r.code,
        stdout: r.stdout.slice(0, 4000),
        stderr: r.stderr.slice(0, 4000),
        durationMs: r.durationMs,
      },
      meta: {},
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'SSH_TEST_FAILED';
    res.status(code === 'SSH_BINARY_MISSING' ? 500 : 502).json({
      error: { code, message: (err as Error).message },
    });
  }
});

router.post('/run', async (req: Request, res: Response) => {
  const cfg = readSshConfig();
  if (!cfg) {
    res.status(400).json({
      error: { code: 'SSH_NOT_CONFIGURED', message: '还没有配置远程主机' },
    });
    return;
  }
  const body = (req.body ?? {}) as { command?: unknown; timeoutMs?: unknown };
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  if (!command) {
    res.status(400).json({
      error: { code: 'COMMAND_REQUIRED', message: 'command 必填' },
    });
    return;
  }
  const timeoutMs = Number(body.timeoutMs);

  try {
    const r = await sshExec(cfg, command, {
      ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    });
    res.json({
      data: {
        code: r.code,
        ok: r.code === 0,
        stdout: r.stdout.slice(0, 100_000),
        stderr: r.stderr.slice(0, 20_000),
        durationMs: r.durationMs,
      },
      meta: {},
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'SSH_RUN_FAILED';
    res.status(code === 'SSH_BINARY_MISSING' ? 500 : 502).json({
      error: { code, message: (err as Error).message },
    });
  }
});

router.post('/sync', async (req: Request, res: Response) => {
  const cfg = readSshConfig();
  if (!cfg) {
    res.status(400).json({
      error: { code: 'SSH_NOT_CONFIGURED', message: '还没有配置远程主机' },
    });
    return;
  }

  const body = (req.body ?? {}) as {
    group_id?: unknown;
    turn_id?: unknown;
    remote_subdir?: unknown;
  };
  const groupId = typeof body.group_id === 'string' ? body.group_id.trim() : '';
  const turnId = typeof body.turn_id === 'string' ? body.turn_id.trim() : '';

  // turn_id 会直接拼进本机目录名 → 只允许安全字符（防 `..`/分隔符穿越）。
  if (!groupId || !/^[A-Za-z0-9_-]+$/.test(groupId)) {
    res.status(400).json({
      error: { code: 'INVALID_GROUP_ID', message: 'group_id 必填且只允许字母/数字/下划线/连字符' },
    });
    return;
  }
  if (!turnId || !/^[A-Za-z0-9_-]+$/.test(turnId)) {
    res.status(400).json({
      error: { code: 'INVALID_TURN_ID', message: 'turn_id 必填且只允许字母/数字/下划线/连字符' },
    });
    return;
  }
  const remoteSubdir =
    typeof body.remote_subdir === 'string' ? body.remote_subdir.trim() : '';
  // 客户端给的远端子路径同样钉死在 remoteDir 内（拒绝绝对路径 / `..` / `~`）。
  const subErr = assertInsideRemoteDir(remoteSubdir);
  if (subErr) {
    res.status(400).json({
      error: { code: 'REMOTE_PATH_ESCAPE', message: `remote_subdir 非法：${subErr}` },
    });
    return;
  }

  let groupWorkspaceDir: string | null = null;
  try {
    const group = await getGroupsBackend().getGroup(groupId);
    if (!group) {
      res.status(404).json({
        error: { code: 'GROUP_NOT_FOUND', message: `群不存在：${groupId}` },
      });
      return;
    }
    groupWorkspaceDir = group.workspace_dir ?? null;
  } catch (err) {
    // 群读取降级：拿不到 workspace_dir 时退回 scratch 目录（右栏面板同样跟随它），
    // 产出依然可见 —— 拉回不能因为一次群查询失败就没收用户的产出。
    console.warn(
      `[remote-exec] /sync 群查询失败 group=${groupId.slice(0, 8)}: ${(err as Error).message}`,
    );
  }

  const dest = join(resolveChatWorkspace(groupId, groupWorkspaceDir), 'remote', turnId);

  try {
    const r = await pullRemoteTree({
      config: cfg,
      destDir: dest,
      ...(remoteSubdir ? { remoteSubdir } : {}),
    });
    res.json({
      data: {
        files: r.files,
        bytes: r.bytes,
        dest: r.dest,
        remote_subdir: r.remoteSubdir,
      },
      meta: {},
    });
  } catch (err) {
    if (err instanceof RemoteSyncError) {
      res.status(err.code === 'REMOTE_SYNC_TOO_LARGE' ? 413 : 502).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    res.status(500).json({
      error: { code: 'REMOTE_SYNC_FAILED', message: (err as Error).message },
    });
  }
});

export default router;

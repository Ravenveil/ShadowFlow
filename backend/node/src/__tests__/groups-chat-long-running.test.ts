/**
 * 群聊对「管线型 CLI」的调度适配（2026-11-20）。
 *
 * 为什么单独测这三个纯函数：`cli:autoresearchclaw` 是 23 阶段研究管线，
 * 分钟~小时级；其余 CLI 都是「一问一答秒回」。如果两者共用群聊默认的
 * 120s 节点超时 + 1 次自动重试，ARC 会在第 2 分钟被砍，然后在半成品目录上
 * 从头再跑一遍 —— 用户看到的是「转两圈就失败」，账单上是双倍额度。
 *
 * 判定必须极度保守：只认 `cli:<已知长任务 id>`，所有 byok:/直连/未知 id 都
 * 走老路径（否则一次描述符手抖会把普通群聊也拖成 2 小时超时）。
 *
 * worktree 侧同理：no_worktree CLI 的产物要落在群 workspace 根目录，否则
 * 用户在右侧产出面板里只能看到 `.shadowflow/worktrees/<agent>/...` 这一层
 * 谁也找不到的中间目录。
 */

import { describe, it, expect } from 'vitest';
import {
  LONG_RUNNING_NODE_TIMEOUT_MS,
  dagTimeoutOptsFor,
  isLongRunningExecutor,
  isNoWorktreeExecutor,
} from '../routes/groups/groups-chat';

describe('isLongRunningExecutor', () => {
  it('cli:autoresearchclaw（23 阶段研究管线）判为长任务', () => {
    expect(isLongRunningExecutor('cli:autoresearchclaw')).toBe(true);
  });

  it('普通 CLI / API 执行器都不是长任务', () => {
    for (const executor of ['cli:claude', 'cli:opencode', 'byok:zhipu', 'anthropic-direct']) {
      expect(isLongRunningExecutor(executor)).toBe(false);
    }
  });

  it('未知 CLI id 与空串不是长任务（findCli 未命中）', () => {
    for (const executor of ['cli:unknown', 'cli:', '']) {
      expect(isLongRunningExecutor(executor)).toBe(false);
    }
  });

  it('不带 cli: 前缀的同名 id 不算（前缀是唯一入口）', () => {
    expect(isLongRunningExecutor('autoresearchclaw')).toBe(false);
  });
});

describe('isNoWorktreeExecutor', () => {
  it('cli:autoresearchclaw 跳过 worktree 隔离', () => {
    expect(isNoWorktreeExecutor('cli:autoresearchclaw')).toBe(true);
  });

  it('普通 CLI / API 执行器照常建 worktree（返回 false）', () => {
    for (const executor of ['cli:claude', 'byok:zhipu', 'anthropic-direct', 'cli:unknown']) {
      expect(isNoWorktreeExecutor(executor)).toBe(false);
    }
  });
});

describe('dagTimeoutOptsFor', () => {
  it('长任务 CLI：2 小时超时 + 关闭自动重试', () => {
    expect(dagTimeoutOptsFor('cli:autoresearchclaw')).toEqual({
      nodeTimeoutMs: LONG_RUNNING_NODE_TIMEOUT_MS,
      defaultMaxRetries: 0,
    });
  });

  it('超时取 2 小时（不是 120s 的倍数级误配）', () => {
    expect(LONG_RUNNING_NODE_TIMEOUT_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('常规 executor：空对象（展开后不传，走 runTeamDagFanout 默认 120s / 1）', () => {
    for (const executor of ['cli:claude', 'byok:zhipu', 'anthropic-direct']) {
      expect(dagTimeoutOptsFor(executor)).toEqual({});
    }
  });
});

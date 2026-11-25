/**
 * cli-policy.ts — 管线型 CLI 的群聊调度策略（2026-11-20 从 groups-chat.ts 迁出）。
 *
 * `cli:autoresearchclaw` 这类 23 阶段研究管线是分钟~小时级任务，与
 * claude/opencode 这类「一问一答秒回」的 CLI 完全不是一个时间尺度。这里的
 * 纯判定函数把 cli-registry 的描述符字段翻成群聊调度语义。
 *
 * 为什么放 transport/：这些是**基础设施策略**（「CLI 的能力标签 → 调度参数」），
 * 不含群业务规则（谁在群里、审批怎么批、消息怎么留痕）。它们只读 cli-registry
 * —— 与本目录的 cli.ts spawner 同源，归属一致。
 *
 * 判定必须极度保守：只认 `cli:<已知长任务 id>`，所有 byok:/直连/未知 id 都
 * 走老路径（否则一次描述符手抖会把普通群聊也拖成 2 小时超时）。
 */

import { findCli } from '../../../detectors/cli-registry';

/**
 * 长任务 CLI 的 DAG 单节点超时（2 小时）。
 * 23 阶段管线含检索、实验、写作、编译，正常跑完就在 1 小时量级。
 */
export const LONG_RUNNING_NODE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * executor 是否指向一个 long_running CLI（`cli:<id>` 且 descriptor.long_running）。
 *
 * 只认 `cli:` 前缀：`byok:zhipu` / `anthropic-direct` / `cli:unknown` 一律
 * false（未命中的 id → findCli 返回 undefined）。NeverThrow：任何异常都按
 * false 处理，判定失败只是退回旧默认值（120s 超时），不能把聊天主链路打断。
 */
export function isLongRunningExecutor(executor: string): boolean {
  try {
    if (typeof executor !== 'string' || !executor.startsWith('cli:')) return false;
    return findCli(executor.slice(4))?.long_running === true;
  } catch {
    return false;
  }
}

/**
 * executor 是否指向 no_worktree CLI（`cli:<id>` 且 descriptor.no_worktree）。
 *
 * 同上只认 `cli:` 前缀、NeverThrow。判定为真时群聊跳过 prepareWorktree，
 * 工具沙箱目录直接用群 workspace —— 管线型 CLI 自己管理产物目录层级，
 * 塞进 `.shadowflow/worktrees/<agent>` 后用户在右侧产出面板里找不到东西，
 * 管线内按相对路径写死的配置也会失效。
 */
export function isNoWorktreeExecutor(executor: string): boolean {
  try {
    if (typeof executor !== 'string' || !executor.startsWith('cli:')) return false;
    return findCli(executor.slice(4))?.no_worktree === true;
  } catch {
    return false;
  }
}

/**
 * DAG 调度参数按 executor 收敛：长任务 CLI → 放宽超时 + 关闭自动重试；
 * 其余 → 返回空对象（调用点展开后不传，走 runTeamDagFanout 默认 120s / 1）。
 *
 * 为什么关重试：管线型 CLI 在 120s 处被砍会留下半成品目录，重跑等于从零
 * 再烧一遍额度和 GPU；宁可让它超时后显式失败，也不要静默重跑两遍。
 */
export function dagTimeoutOptsFor(executor: string): {
  nodeTimeoutMs?: number;
  defaultMaxRetries?: number;
} {
  if (!isLongRunningExecutor(executor)) return {};
  return { nodeTimeoutMs: LONG_RUNNING_NODE_TIMEOUT_MS, defaultMaxRetries: 0 };
}

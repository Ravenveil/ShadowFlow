/**
 * pickerOverrides — RunSession 发送路径共用的 picker override 构造逻辑。
 *
 * RunSessionPage 有三个发送点（handleSend 追加聊天 / handleResend 重发 /
 * QuestionFormModal 问答表单回复），过去只有 handleResend 转发了 picker 选择，
 * 其余两处直接 `body: { content }`，daemon 就 ...source 继承源 session 的
 * provider/model/key — picker 在第一轮之后切到其他 provider 完全无效。
 *
 * Returns an object suitable for `JSON.stringify({ content, ...overrides })`.
 */
import { getStoredApiKey, PROVIDER_IDS } from '../../api/_base';
import type { ProviderId } from '../../api/_base';

export function buildPickerOverrides(
  selectedExecutor: string,
  selectedModel: string,
  /** 2026-05-30 — CLI 工作目录(绝对路径)。仅 cli:/acp:/mcp: 有意义,API 忽略。 */
  selectedCwd?: string,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  // cwd 只对本地命令行执行器有意义。后端也会校验绝对路径并对 API 模式忽略。
  if (selectedCwd && selectedCwd.trim() && /^(cli|acp|mcp):/.test(selectedExecutor)) {
    overrides.cwd = selectedCwd.trim();
  }
  if (selectedExecutor.startsWith('byok:')) {
    const pid = selectedExecutor.slice(5);
    if ((PROVIDER_IDS as readonly string[]).includes(pid)) {
      overrides.provider = pid;
      const key = getStoredApiKey(pid as ProviderId);
      if (key) overrides.api_key = key;
    }
    if (selectedModel) overrides.model = selectedModel;
  } else if (selectedExecutor.startsWith('cli:')) {
    // dispatcher 期望完整 `cli:<id>` 字符串（server/src/skill-runners/index.ts
    // line 62-93 内部再 slice(4)）。早期 handleResend 在这里 .slice(4) 把
    // `cli:claude` 砍成 `claude`，dispatcher 走 case 6 EXECUTOR_UNKNOWN；
    // BMAD 没爆只是因为 team-backed 路径吞掉了 executor 字段。
    overrides.executor = selectedExecutor;
    if (selectedModel) overrides.model = selectedModel;
  } else if (selectedModel) {
    overrides.model = selectedModel;
  }
  // Anthropic Claude direct（Story 15.7）独立 key 槽，所有路径都附带。
  const anthroKey = getStoredApiKey();
  if (anthroKey) overrides.anthropic_key = anthroKey;
  return overrides;
}

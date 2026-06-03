/**
 * node-policy.ts — chat DAG 单节点执行 policy(批 2 Phase 2b · B1 超时 + B4 重试 + 取消)。
 *
 * 参照 workflow/retry.ts 思路,但 chat 的 callAgent 是返回 `{text,error}` 契约(不 throw),
 * 故写 chat 专用包装。每次尝试给 call 一个 per-attempt signal(超时或外部取消时 fire),
 * 上层据此取消在飞 LLM turn。
 * - 成功(有 text、无 error)→ reason=ok。
 * - error 或 timeout → 重试(直到 maxRetries 用尽),无退避(立即重试)。
 * - 外部 signal abort → reason=aborted,立即停、不再重试。
 */
export type NodeRunReason = 'ok' | 'error' | 'timeout' | 'aborted';

export interface NodeRunResult {
  text: string;
  error?: string;
  reason: NodeRunReason;
  /** 实际尝试次数(外部预先 abort = 0)。 */
  attempts: number;
}

export interface NodePolicy {
  timeoutMs: number;
  maxRetries: number;
  signal: AbortSignal;
}

export async function runNodeWithPolicy(
  call: (signal: AbortSignal) => Promise<{ text: string; error?: string }>,
  policy: NodePolicy,
): Promise<NodeRunResult> {
  if (policy.signal.aborted) {
    return { text: '', error: 'aborted', reason: 'aborted', attempts: 0 };
  }

  const maxAttempts = Math.max(1, policy.maxRetries + 1);
  let attempts = 0;
  let lastReason: NodeRunReason = 'error';
  let lastError = '';

  for (let i = 0; i < maxAttempts; i++) {
    if (policy.signal.aborted) return { text: '', error: 'aborted', reason: 'aborted', attempts };

    attempts++;
    // per-attempt controller:超时 fire,或外部 signal 透传 fire。
    const ac = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => ac.abort();
    policy.signal.addEventListener('abort', onExternalAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, policy.timeoutMs);

    try {
      const res = await call(ac.signal);
      if (policy.signal.aborted) return { text: '', error: 'aborted', reason: 'aborted', attempts };
      if (res.error) { lastReason = 'error'; lastError = res.error; continue; }
      return { text: res.text, reason: 'ok', attempts };
    } catch (e) {
      if (policy.signal.aborted) return { text: '', error: 'aborted', reason: 'aborted', attempts };
      if (timedOut) { lastReason = 'timeout'; lastError = `node timed out after ${policy.timeoutMs}ms`; continue; }
      lastReason = 'error'; lastError = e instanceof Error ? e.message : String(e); continue;
    } finally {
      clearTimeout(timer);
      policy.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  return { text: '', error: lastError, reason: lastReason, attempts };
}

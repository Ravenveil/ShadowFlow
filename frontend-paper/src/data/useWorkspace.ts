/**
 * useWorkspace — 把 `WorkspaceSource` 包成 React 状态。
 *
 * 组件拿到的是「数据 + 状态 + 两个动作用」，不关心背后是 mock 还是 http：
 *   load 阶段 → status='loading'
 *   send / savePolicy → 先在本地生效（乐观更新），再交给数据源
 *
 * 这一层也是将来加 SWR / WebSocket 的唯一改动点。
 */
import { useCallback, useEffect, useState } from 'react';
import { source, type WorkspaceData, type WorkspaceSource } from './source';
import type { PolicyMatrix } from './types';

export type WorkspaceStatus = 'loading' | 'ready' | 'error';

export interface WorkspaceApi {
  data: WorkspaceData | null;
  status: WorkspaceStatus;
  /** 失败原因，status='error' 时有值。 */
  error: string | null;
  /** 发消息：追加数据源返回的那几条。 */
  send: (sessionId: string, text: string) => Promise<void>;
  /** 存策略：本地立即生效，再交给数据源落库。 */
  savePolicy: (policy: PolicyMatrix) => Promise<void>;
  /** 重新拉一次（错误重试 / 手动刷新）。 */
  reload: () => void;
}

export function useWorkspace(src: WorkspaceSource = source): WorkspaceApi {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    src
      .load()
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError(null);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [src, nonce]);

  const send = useCallback(
    async (sessionId: string, text: string) => {
      try {
        const fresh = await src.send(sessionId, text);
        if (!fresh.length) return;
        setData(
          (prev) =>
            prev && {
              ...prev,
              threads: {
                ...prev.threads,
                [sessionId]: [...(prev.threads[sessionId] ?? []), ...fresh],
              },
            },
        );
      } catch (err) {
        console.error('[workspace] send failed', err);
      }
    },
    [src],
  );

  const savePolicy = useCallback(
    async (policy: PolicyMatrix) => {
      setData((prev) => prev && { ...prev, policy });
      try {
        await src.savePolicy(policy);
      } catch (err) {
        console.error('[workspace] savePolicy failed', err);
      }
    },
    [src],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, status, error, send, savePolicy, reload };
}

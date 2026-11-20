/**
 * useWorkspace — 把 `WorkspaceSource` 包成 React 状态。
 *
 * 组件拿到的是「数据 + 状态 + 几个动作用」，不关心背后是 mock 还是 http：
 *   load 阶段 → status='loading'
 *   send / savePolicy → 先在本地生效（乐观更新），再交给数据源
 *
 * 这一层也是将来加 SWR / WebSocket 的唯一改动点。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { source, type WorkspaceData, type WorkspaceSource } from './source';
import type { Outbound, PolicyMatrix } from './types';

export type WorkspaceStatus = 'loading' | 'ready' | 'error';

export interface WorkspaceApi {
  data: WorkspaceData | null;
  status: WorkspaceStatus;
  /** 失败原因，status='error' 时有值。 */
  error: string | null;
  /** 发消息：追加数据源返回的那几条。 */
  send: (sessionId: string, out: Outbound) => Promise<void>;
  /** 正在等应答（输入框据此把发送钮换成停止钮）。 */
  sending: boolean;
  /** 停止生成：中止当前发送，不再追加任何消息。 */
  stop: () => void;
  /** 语音转写，失败由调用方展示错误条。 */
  transcribe: (audio: Blob) => Promise<string>;
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
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
    async (sessionId: string, out: Outbound) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setSending(true);
      try {
        const fresh = await src.send(sessionId, out, { signal: ctl.signal });
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
        // 用户主动点停止不算错误；真失败继续往上抛，让输入框显示错误条
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (!aborted) {
          console.error('[workspace] send failed', err);
          throw err;
        }
      } finally {
        if (abortRef.current === ctl) {
          abortRef.current = null;
          setSending(false);
        }
      }
    },
    [src],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const transcribe = useCallback((audio: Blob) => src.transcribe(audio), [src]);

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

  return { data, status, error, send, sending, stop, transcribe, savePolicy, reload };
}

/**
 * useVoiceRecorder — 麦克风录音 hook（2026-11-07，语音输入）。
 *
 * getUserMedia + MediaRecorder 的最小封装：
 *   start()   — 取麦克风并开录（失败抛 onError，如权限被拒 NotAllowedError）
 *   stop()    — 停录，录到的 Blob 经 onDone 回调交还（ondataavailable 聚合）
 *   cancel()  — 停录并丢弃录音
 * status/seconds 受控返回，供 composer 切「录音中」态 + 计时显示。
 *
 * 兼容性：按 audio/webm;codecs=opus → audio/webm → audio/mp4 → ogg 依次探测
 * MediaRecorder.isTypeSupported；浏览器不支持时 supported=false，UI 隐藏入口。
 * 卸载/换态自动停轨，不留悬挂的录音流。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceRecorderStatus = 'idle' | 'recording';

export interface UseVoiceRecorderOptions {
  /** 停录后回调（cancel 不触发）。 */
  onDone: (blob: Blob) => void;
  /** 取麦/开录失败回调。 */
  onError?: (err: Error) => void;
}

export interface UseVoiceRecorderResult {
  status: VoiceRecorderStatus;
  /** 录音秒数（1s 粒度）。 */
  seconds: number;
  /** 环境是否具备录音能力（getUserMedia + MediaRecorder）。 */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find(
    (m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m),
  );
}

function hasGetUserMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function useVoiceRecorder({
  onDone,
  onError,
}: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const unmountedRef = useRef(false);
  const optsRef = useRef({ onDone, onError });
  optsRef.current = { onDone, onError };

  const supported =
    typeof MediaRecorder !== 'undefined' && hasGetUserMedia();

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recRef.current = null;
    setSeconds(0);
    setStatus('idle');
  }, []);

  // 卸载兜底：停轨并抑制迟到的 onDone（避免 setState on unmounted）。
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      cancelledRef.current = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (recRef.current) return;
    if (!hasGetUserMedia() || typeof MediaRecorder === 'undefined') {
      optsRef.current.onError?.(new Error('当前环境不支持麦克风录音'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const mime = pickMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recRef.current = rec;

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0 && !cancelledRef.current) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const wasCancelled = cancelledRef.current;
        cleanup();
        if (wasCancelled || unmountedRef.current) return;
        if (chunks.length === 0) return;
        optsRef.current.onDone(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };

      rec.start();
      setSeconds(0);
      setStatus('recording');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      cleanup();
      optsRef.current.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }, [cleanup]);

  const stop = useCallback((): void => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  }, []);

  const cancel = useCallback((): void => {
    cancelledRef.current = true;
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else cleanup();
  }, [cleanup]);

  return { status, seconds, supported, start, stop, cancel };
}

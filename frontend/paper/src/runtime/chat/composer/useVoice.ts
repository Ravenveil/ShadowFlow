/**
 * useVoice — 录音与转写（语音输入）。
 *
 * 只做浏览器侧的采集：录完把 Blob 交给调用方（走 `source.transcribe`），
 * 所以「转写用哪个后端」不在这个 hook 里决定。
 *
 * 状态机：idle → starting（等授权）→ recording（计时）→ transcribing → idle
 * 取消录音不会走转写。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { COMPOSER } from '@/shared/content/app';

export type VoiceStatus = 'idle' | 'starting' | 'recording' | 'transcribing';

/** 录音波形柱数量（面板宽度固定，柱数固定好排版）。 */
export const VOICE_BARS = 22;
const ZERO_LEVELS = Array.from({ length: VOICE_BARS }, () => 0);

export interface VoiceApi {
  supported: boolean;
  status: VoiceStatus;
  seconds: number;
  /** 0–1 的实时音量，最新一帧在末尾（录音面板画波形用）。 */
  levels: number[];
  start: () => void;
  /** 完成录音并转写。 */
  stop: () => void;
  /** 放弃这次录音，不转写。 */
  cancel: () => void;
}

export function useVoice({
  onText,
  onError,
  transcribe,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  transcribe: (audio: Blob) => Promise<string>;
}): VoiceApi {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(ZERO_LEVELS);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<number | null>(null);

  // 回调存进 ref：录音过程里父组件重渲染不会打断正在跑的录音
  const cb = useRef({ onText, onError, transcribe });
  cb.current = { onText, onError, transcribe };

  const supported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    !!navigator.mediaDevices?.getUserMedia;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /** 停掉音量采样并归还 AudioContext（波形回零）。 */
  const clearLevels = () => {
    if (levelTimerRef.current !== null) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevels(ZERO_LEVELS);
  };

  const teardown = useCallback(() => {
    clearTimer();
    clearLevels();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setSeconds(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(() => {
    if (!supported || status !== 'idle') return;
    setStatus('starting');
    cancelledRef.current = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          chunksRef.current = [];
          teardown();
          if (cancelledRef.current) {
            setStatus('idle');
            return;
          }
          setStatus('transcribing');
          cb.current
            .transcribe(blob)
            .then((text) => {
              if (text.trim()) cb.current.onText(text.trim());
              else cb.current.onError(COMPOSER.voiceEmpty);
            })
            .catch(() => cb.current.onError(COMPOSER.voiceUnsupported))
            .finally(() => setStatus('idle'));
        };
        recRef.current = rec;
        rec.start();
        setStatus('recording');
        setSeconds(0);
        setLevels(ZERO_LEVELS);
        timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

        // 音量采样：仅用于面板波形；拿不到 AudioContext 就退化为纯计时。
        try {
          const Ctx = window.AudioContext;
          const ctx = new Ctx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          const buf = new Uint8Array(analyser.fftSize);
          levelTimerRef.current = window.setInterval(() => {
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i += 1) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 3.2)]);
          }, 90);
        } catch {
          /* 无 AudioContext：保留计时录音 */
        }
      })
      .catch(() => {
        setStatus('idle');
        cb.current.onError(COMPOSER.voiceUnsupported);
      });
  }, [status, supported, teardown]);

  const stop = useCallback(() => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recRef.current?.state === 'recording') recRef.current.stop();
    else {
      teardown();
      setStatus('idle');
    }
  }, [teardown]);

  return { supported, status, seconds, levels, start, stop, cancel };
}

/** 秒数 → `0:07` 形式（录音条上显示）。 */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

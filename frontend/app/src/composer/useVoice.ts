/**
 * useVoice — 录音与转写（语音输入）。
 *
 * 只做浏览器侧采集，录完把 Blob 交给调用方 transcribe；
 * 状态机：idle → starting（等授权）→ recording（计时）→ transcribing → idle
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COMPOSER } from "../content/composer";

export type VoiceStatus = "idle" | "starting" | "recording" | "transcribing";

export interface VoiceApi {
  supported: boolean;
  status: VoiceStatus;
  seconds: number;
  start: () => void;
  stop: () => void;
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
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const cb = useRef({ onText, onError, transcribe });
  cb.current = { onText, onError, transcribe };

  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    !!navigator.mediaDevices?.getUserMedia;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const teardown = useCallback(() => {
    clearTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setSeconds(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(() => {
    if (!supported || status !== "idle") return;
    setStatus("starting");
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
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          chunksRef.current = [];
          teardown();
          if (cancelledRef.current) {
            setStatus("idle");
            return;
          }
          setStatus("transcribing");
          cb.current
            .transcribe(blob)
            .then((text) => {
              if (text.trim()) cb.current.onText(text.trim());
              else cb.current.onError(COMPOSER.voiceEmpty);
            })
            .catch((err) => {
              const msg = err instanceof Error && err.message ? err.message : COMPOSER.voiceUnsupported;
              cb.current.onError(msg);
            })
            .finally(() => setStatus("idle"));
        };
        recRef.current = rec;
        rec.start();
        setStatus("recording");
        setSeconds(0);
        timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      })
      .catch(() => {
        setStatus("idle");
        cb.current.onError(COMPOSER.voiceUnsupported);
      });
  }, [status, supported, teardown]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recRef.current?.state === "recording") recRef.current.stop();
    else {
      teardown();
      setStatus("idle");
    }
  }, [teardown]);

  return { supported, status, seconds, start, stop, cancel };
}

/** 秒数 → `0:07` 形式（录音条上显示）。 */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

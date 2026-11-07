/**
 * audioToWav — 浏览器录音 → 16kHz 单声道 PCM WAV（2026-11-07，语音输入）。
 *
 * 小米 MiMo ASR（chat-audio 形态）只收 mp3/wav，而 MediaRecorder 产出
 * webm/mp4/ogg。链路：Blob → AudioContext.decodeAudioData →
 * OfflineAudioContext 重采样 16k 单声道 → encodeWavPcm 打 WAV 包。
 * 解码不了（容器不被支持）时上抛，由调用方决定回落原音频直传。
 *
 * encodeWavPcm 是纯函数（无 DOM 依赖），可直测。
 */

export const ASR_SAMPLE_RATE = 16000;

/** Float32 单声道 PCM → 16-bit PCM WAV Blob（44 字节 RIFF 头）。 */
export function encodeWavPcm(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += bytesPerSample;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/**
 * 任意浏览器可解码的音频 Blob → 16k 单声道 WAV。
 * 环境缺 AudioContext 或容器解码失败时抛错（调用方回落原格式）。
 */
export async function blobToWav16kMono(blob: Blob): Promise<Blob> {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  const OfflineCtx = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctx || !OfflineCtx) throw new Error('AudioContext unavailable');

  const arrayBuf = await blob.arrayBuffer();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * ASR_SAMPLE_RATE));
    const offline = new OfflineCtx(1, frames, ASR_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return encodeWavPcm(rendered.getChannelData(0), ASR_SAMPLE_RATE);
  } finally {
    void ctx.close?.();
  }
}

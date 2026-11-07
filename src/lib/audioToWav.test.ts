/**
 * audioToWav.test.ts — WAV 编码纯函数（2026-11-07，语音输入）。
 * 只测 encodeWavPcm（无 DOM 依赖）；blobToWav16kMono 依赖 AudioContext，
 * jsdom 不具备，走前端 asr.test.ts 的「解码不了回落原格式」路径覆盖。
 */

import { describe, it, expect } from 'vitest';
import { encodeWavPcm, ASR_SAMPLE_RATE } from './audioToWav';

async function wavView(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function ascii(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
  return s;
}

describe('encodeWavPcm', () => {
  it('RIFF 头字段正确（16k 单声道 16bit PCM）', async () => {
    const samples = new Float32Array([0, 1, -1]);
    const blob = encodeWavPcm(samples, ASR_SAMPLE_RATE);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 6);

    const view = await wavView(blob);
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('采样写入与超范围钳制（±1）', async () => {
    const samples = new Float32Array([1, -1, 0, 1.5, -1.5]);
    const view = await wavView(encodeWavPcm(samples, 16000));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(32767); // 1.5 钳到 1
    expect(view.getInt16(52, true)).toBe(-32768); // -1.5 钳到 -1
  });
});

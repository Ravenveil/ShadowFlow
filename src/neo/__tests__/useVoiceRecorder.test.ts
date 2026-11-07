/**
 * useVoiceRecorder.test.ts — 语音输入录音 hook（2026-11-07）。
 *
 * jsdom 没有 MediaRecorder / mediaDevices，用假实现 stub 全局后测核心契约：
 * start 开录计时 / stop 交还 Blob / cancel 丢弃 / 权限被拒走 onError /
 * 不支持录音的环境 supported=false。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecorder } from '../useVoiceRecorder';

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(mime: string): boolean {
    return mime.startsWith('audio/webm');
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, public options?: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

function fakeStream() {
  const stop = vi.fn();
  return { getTracks: () => [{ stop }] };
}

function stubMediaApis(opts?: { reject?: Error }): void {
  const getUserMedia = vi.fn(
    opts?.reject
      ? async () => {
          throw opts.reject;
        }
      : async () => fakeStream(),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

beforeEach(() => {
  FakeMediaRecorder.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useVoiceRecorder', () => {
  it('start → 录音中 + 计时；stop → onDone 交还 Blob 并回 idle', async () => {
    stubMediaApis();
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone }));

    expect(result.current.supported).toBe(true);
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].state).toBe('recording');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.seconds).toBe(3);

    act(() => {
      result.current.stop();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    const blob = onDone.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
    expect(result.current.status).toBe('idle');
    expect(result.current.seconds).toBe(0);
  });

  it('cancel → 停录丢弃，不触发 onDone', async () => {
    stubMediaApis();
    const onDone = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone }));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.cancel();
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('麦克风权限被拒 → onError(NOT allowed) 且状态回 idle', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    stubMediaApis({ reject: denied });
    const onDone = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone, onError }));

    await act(async () => {
      await result.current.start();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).name).toBe('NotAllowedError');
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('无 MediaRecorder 的环境 → supported=false，start 走 onError', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => fakeStream()) },
      configurable: true,
    });
    vi.stubGlobal('MediaRecorder', undefined);
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone: vi.fn(), onError }));

    expect(result.current.supported).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });
});

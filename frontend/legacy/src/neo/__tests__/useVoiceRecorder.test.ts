/**
 * useVoiceRecorder.test.ts — 语音输入录音 hook（2026-11-07）。
 *
 * jsdom 没有 MediaRecorder / mediaDevices，用假实现 stub 全局后测核心契约：
 * start 开录计时 / stop 交还 Blob / cancel 丢弃 / 权限被拒走 onError /
 * 不支持录音的环境 supported=false；starting 态（2026-11-07 UI 改版）：
 * 取麦未返回时的暴露、防重复取麦、迟到授权结果丢弃。
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

/** 可手动 resolve 的 getUserMedia 假实现（测 starting 态时序）。 */
function deferredGum() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  let resolveFn!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolveFn = r;
  });
  return { promise, resolve: () => resolveFn(stream), stop };
}

function stubMediaApis(opts?: {
  reject?: Error;
  gum?: () => Promise<unknown>;
}): ReturnType<typeof vi.fn> {
  const fallback = async (): Promise<unknown> => {
    if (opts?.reject) throw opts.reject;
    return fakeStream();
  };
  const getUserMedia = vi.fn(opts?.gum ?? fallback);
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  return getUserMedia;
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

  it('starting 态：getUserMedia 未返回时 status=starting，授权后转 recording', async () => {
    const gum = deferredGum();
    stubMediaApis({ gum: () => gum.promise });
    const { result } = renderHook(() => useVoiceRecorder({ onDone: vi.fn() }));

    act(() => {
      void result.current.start();
    });
    expect(result.current.status).toBe('starting');

    await act(async () => {
      gum.resolve();
    });
    expect(result.current.status).toBe('recording');
  });

  it('取麦中重复 start → 只取麦一次（不泄漏第二条录音流）', async () => {
    const gum = deferredGum();
    const getUserMedia = stubMediaApis({ gum: () => gum.promise });
    const { result } = renderHook(() => useVoiceRecorder({ onDone: vi.fn() }));

    act(() => {
      void result.current.start();
    });
    act(() => {
      void result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      gum.resolve();
    });
    expect(result.current.status).toBe('recording');
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it('starting 阶段 cancel → 迟到的授权结果丢弃（停轨、不进 recording）', async () => {
    const gum = deferredGum();
    stubMediaApis({ gum: () => gum.promise });
    const onDone = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone }));

    act(() => {
      void result.current.start();
    });
    expect(result.current.status).toBe('starting');
    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe('idle');

    await act(async () => {
      gum.resolve();
    });
    expect(gum.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(result.current.status).toBe('idle');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('starting 阶段 cancel 后立即重开 → 新轮次正常开录，旧轮授权仍丢弃', async () => {
    const gum1 = deferredGum();
    const gum2 = deferredGum();
    const getUserMedia = vi
      .fn()
      .mockImplementationOnce(() => gum1.promise)
      .mockImplementationOnce(() => gum2.promise);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const onDone = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onDone }));

    act(() => {
      void result.current.start();
    });
    act(() => {
      result.current.cancel();
    });
    act(() => {
      void result.current.start();
    });
    expect(result.current.status).toBe('starting');

    // 旧轮（已取消）迟到授权：丢弃，不进录。
    await act(async () => {
      gum1.resolve();
    });
    expect(gum1.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(result.current.status).toBe('starting');

    // 新轮授权：正常开录。
    await act(async () => {
      gum2.resolve();
    });
    expect(result.current.status).toBe('recording');
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });
});

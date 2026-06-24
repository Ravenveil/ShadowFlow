// src/core/hooks/useResizableWidth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clampWidth, useResizableWidth } from './useResizableWidth';

// ────────────────────────────────────────────────────
// 纯函数 clampWidth 测试
// ────────────────────────────────────────────────────
describe('clampWidth', () => {
  it('returns value when within range', () => {
    expect(clampWidth(400, 280, 720)).toBe(400);
  });
  it('clamps to min when below', () => {
    expect(clampWidth(100, 280, 720)).toBe(280);
  });
  it('clamps to max when above', () => {
    expect(clampWidth(900, 280, 720)).toBe(720);
  });
  it('returns min when value equals min', () => {
    expect(clampWidth(280, 280, 720)).toBe(280);
  });
  it('returns max when value equals max', () => {
    expect(clampWidth(720, 280, 720)).toBe(720);
  });
});

// ────────────────────────────────────────────────────
// useResizableWidth — 初始值读取
// ────────────────────────────────────────────────────
describe('useResizableWidth — initial value', () => {
  const KEY = 'test-rw-key';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses initial param when localStorage is empty', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.width).toBe(312);
  });

  it('reads saved value from localStorage', () => {
    localStorage.setItem(KEY, '500');
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.width).toBe(500);
  });

  it('clamps saved value that exceeds max', () => {
    localStorage.setItem(KEY, '999');
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.width).toBe(720); // default max
  });

  it('clamps saved value that is below min', () => {
    localStorage.setItem(KEY, '100');
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.width).toBe(280); // default min
  });

  it('ignores invalid (NaN) localStorage value and uses initial', () => {
    localStorage.setItem(KEY, 'not-a-number');
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.width).toBe(312);
  });

  it('respects custom min/max options', () => {
    localStorage.setItem(KEY, '100');
    const { result } = renderHook(() => useResizableWidth(KEY, 200, { min: 150, max: 400 }));
    expect(result.current.width).toBe(150);
  });
});

// ────────────────────────────────────────────────────
// useResizableWidth — 拖拽行为
// ────────────────────────────────────────────────────
describe('useResizableWidth — drag behavior', () => {
  const KEY = 'test-rw-drag';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts not dragging', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    expect(result.current.dragging).toBe(false);
  });

  it('sets dragging true after onDragStart', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    expect(result.current.dragging).toBe(true);
  });

  it('updates width on mousemove and clamps to max', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    // 向左拖 300px → width = 312 + 300 = 612，在 [280, 720] 内
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    });
    expect(result.current.width).toBe(612);
  });

  it('clamps width to max when dragging too far left', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    // 向左拖 600px → would be 312 + 600 = 912 → clamp to 720
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: -100 }));
    });
    expect(result.current.width).toBe(720);
  });

  it('clamps width to min when dragging too far right', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 400));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    // 向右拖 300px → would be 400 - 300 = 100 → clamp to 280
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }));
    });
    expect(result.current.width).toBe(280);
  });

  it('stops dragging on mouseup', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    expect(result.current.dragging).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(result.current.dragging).toBe(false);
  });

  it('saves updated width to localStorage after drag', () => {
    const { result } = renderHook(() => useResizableWidth(KEY, 312));
    act(() => {
      result.current.onDragStart({ clientX: 500, preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
    });
    // width = 312 + 200 = 512
    expect(localStorage.getItem(KEY)).toBe('512');
  });
});

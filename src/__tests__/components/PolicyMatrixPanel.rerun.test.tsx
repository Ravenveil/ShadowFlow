/**
 * Story 4.6 — PolicyMatrixPanel Re-run / Save-as-Template 按钮测试。
 *
 * "Save & Re-run" triggers onReRun with the current matrix.
 * "Save as Template" triggers onSaveAsTemplate without touching backend.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolicyMatrixPanel } from '../../core/components/Panel/PolicyMatrixPanel';
import { usePolicyStore } from '../../core/hooks/usePolicyStore';

describe('PolicyMatrixPanel re-run / save-template (Story 4.6)', () => {
  beforeEach(() => {
    usePolicyStore.getState().reset();
    usePolicyStore.getState().setAgents(['writer', 'editor']);
    usePolicyStore.getState().markClean();
  });

  it('Save as Template never calls onReRun', () => {
    const onReRun = vi.fn();
    const onSaveAsTemplate = vi.fn();
    render(<PolicyMatrixPanel onReRun={onReRun} onSaveAsTemplate={onSaveAsTemplate} />);
    fireEvent.click(screen.getByTestId('policy-save-template'));
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
    expect(onReRun).not.toHaveBeenCalled();
  });

  it('Save & Re-run calls onReRun only when dirty', () => {
    const onReRun = vi.fn();
    render(<PolicyMatrixPanel onReRun={onReRun} />);
    const btn = screen.getByTestId('policy-rerun') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cell-writer-editor'));
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onReRun).toHaveBeenCalledTimes(1);
  });
});

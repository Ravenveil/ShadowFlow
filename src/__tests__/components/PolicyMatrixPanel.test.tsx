/**
 * Story 4.5 — PolicyMatrixPanel 单元测试。
 *
 * 3-state cell cycle (permit → deny → warn → permit), dirty detection,
 * save callback.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolicyMatrixPanel } from '../../core/components/Panel/PolicyMatrixPanel';
import { usePolicyStore } from '../../core/hooks/usePolicyStore';

describe('PolicyMatrixPanel (Story 4.5)', () => {
  beforeEach(() => {
    usePolicyStore.getState().reset();
    usePolicyStore.getState().setAgents(['writer', 'editor', 'critic']);
    usePolicyStore.getState().markClean();
  });

  it('renders an N×N grid of cell buttons', () => {
    render(<PolicyMatrixPanel />);
    expect(screen.getByTestId('cell-writer-writer')).toBeDefined();
    expect(screen.getByTestId('cell-editor-critic')).toBeDefined();
    expect(screen.getByTestId('cell-critic-writer')).toBeDefined();
  });

  it('initial cells default to permit', () => {
    render(<PolicyMatrixPanel />);
    const cell = screen.getByTestId('cell-writer-editor');
    expect(cell.getAttribute('data-state')).toBe('permit');
  });

  it('clicking a cell cycles permit → deny → warn → permit', () => {
    render(<PolicyMatrixPanel />);
    const cell = screen.getByTestId('cell-writer-editor');
    fireEvent.click(cell);
    expect(cell.getAttribute('data-state')).toBe('deny');
    fireEvent.click(cell);
    expect(cell.getAttribute('data-state')).toBe('warn');
    fireEvent.click(cell);
    expect(cell.getAttribute('data-state')).toBe('permit');
  });

  it('Save button disabled when clean, enabled when dirty', () => {
    render(<PolicyMatrixPanel />);
    const saveBtn = screen.getByTestId('policy-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cell-writer-editor'));
    expect(saveBtn.disabled).toBe(false);
  });

  it('Save triggers onSave callback and clears dirty state', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PolicyMatrixPanel onSave={onSave} />);
    fireEvent.click(screen.getByTestId('cell-writer-editor'));
    fireEvent.click(screen.getByTestId('policy-save'));
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(usePolicyStore.getState().isDirty()).toBe(false);
  });
});

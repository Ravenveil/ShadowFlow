import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapDetectedModal } from '../../core/components/modals/GapDetectedModal';

const GAP = {
  runId: 'run-gap',
  nodeId: 'writer',
  gapType: 'incomplete_log',
  description: '实验日志缺少 baseline 数据。',
  choices: [
    { id: 'A' as const, label: '补充数据', action: 'pause' },
    { id: 'B' as const, label: '移除此对比', action: 'drop' },
    { id: 'C' as const, label: '标记稍后更新', action: 'annotate' },
  ],
  userInput: '',
};

describe('GapDetectedModal', () => {
  it('renders description and three actions', () => {
    render(<GapDetectedModal open gap={GAP} onSubmit={vi.fn()} />);
    expect(screen.getByText(/别让 Agent 瞎填/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /1\. 补充数据/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2\. 移除此对比/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /3\. 标记稍后更新/ })).toBeTruthy();
  });

  it('submits choice A with user input', () => {
    const onSubmit = vi.fn();
    render(<GapDetectedModal open gap={GAP} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(/补充数据写在这里/), { target: { value: 'baseline=0.41' } });
    fireEvent.click(screen.getByRole('button', { name: /1\. 补充数据/ }));
    expect(onSubmit).toHaveBeenCalledWith('A', 'baseline=0.41');
  });

  it('supports keyboard shortcuts', () => {
    const onSubmit = vi.fn();
    render(<GapDetectedModal open gap={GAP} onSubmit={onSubmit} />);
    fireEvent.keyDown(window, { key: '3' });
    expect(onSubmit).toHaveBeenCalledWith('C', '');
  });
});

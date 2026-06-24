// src/pages/chat-home/RunOverviewView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunOverviewView } from './RunOverviewView';

const run = { session_id: 'r1abcd', goal: 'do thing', group_id: 'g', status: 'succeeded', created_at: 1, updated_at: 1, conversation_id: null };

describe('RunOverviewView', () => {
  it('renders latest run goal', () => {
    render(<MemoryRouter><RunOverviewView latest={run as any} history={[]} loading={false} /></MemoryRouter>);
    expect(screen.getByText('do thing')).toBeInTheDocument();
  });
  it('renders empty state when no run', () => {
    render(<MemoryRouter><RunOverviewView latest={null} history={[]} loading={false} /></MemoryRouter>);
    expect(screen.getByText(/还没有运行记录/)).toBeInTheDocument();
  });
  it('renders refresh button in section header when onReload is provided', () => {
    const onReload = vi.fn();
    render(
      <MemoryRouter>
        <RunOverviewView latest={null} history={[]} loading={false} onReload={onReload} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /刷新/ });
    expect(btn).toBeInTheDocument();
    (btn as HTMLButtonElement).click();
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

// src/pages/chat-home/WorkspaceFilesView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspaceFilesView } from './WorkspaceFilesView';

vi.mock('../../api/fsFiles', () => ({
  listFiles: vi.fn(async () => [{ name: 'out.md', path: '/w/out.md', size: 1024, mtime: 1, ext: '.md' }]),
  readFile: vi.fn(async () => ({ content: '# hello', size: 7, truncated: false })),
}));

describe('WorkspaceFilesView', () => {
  it('lists files with size', async () => {
    render(<WorkspaceFilesView root="/w" />);
    await waitFor(() => expect(screen.getByText('out.md')).toBeInTheDocument());
    expect(screen.getByText(/1\.0\s?KB/i)).toBeInTheDocument();
  });
  it('empty state when no root', () => {
    render(<WorkspaceFilesView root={null} />);
    expect(screen.getByText(/没有/)).toBeInTheDocument();
  });
});

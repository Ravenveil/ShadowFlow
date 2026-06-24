// src/pages/chat-home/WorkspaceFilesView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspaceFilesView } from './WorkspaceFilesView';

vi.mock('../../api/fsFiles', () => ({
  listFiles: vi.fn(async () => ({
    dir: '/w',
    files: [{ name: 'out.md', path: '/w/out.md', size: 1024, mtime: 1, ext: '.md' }],
  })),
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

  it('click file triggers readFile and shows preview', async () => {
    render(<WorkspaceFilesView root="/w" />);
    // wait for file list
    const btn = await waitFor(() => screen.getByText('out.md'));
    // click the file item (native click to handle nested button)
    btn.closest('button')?.click();
    // wait for preview content to appear (PreviewMarkdown renders "# hello" as <h1>hello</h1>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'hello' })).toBeInTheDocument());
  });
});

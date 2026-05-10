/**
 * AcpAgentsPanel.test.tsx — Story 15.23
 *
 * Vitest + RTL. Mocks `api/acp` so we control the response shape and verify:
 *   - online/offline rows render the correct status icon + opacity
 *   - empty state renders when items array is empty
 *   - Re-scan button fires refreshAcpAgents
 *   - error banner appears when fetch rejects
 *   - tooltip uses the agent's error message (offline path)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/acp', () => ({
  listAcpAgents: vi.fn(),
  refreshAcpAgents: vi.fn(),
}));

import { listAcpAgents, refreshAcpAgents } from '../api/acp';
import { AcpAgentsPanel } from './AcpAgentsPanel';

const mockedList = listAcpAgents as unknown as ReturnType<typeof vi.fn>;
const mockedRefresh = refreshAcpAgents as unknown as ReturnType<typeof vi.fn>;

const SAMPLE = {
  scanned_at: '2026-05-10T10:00:00.000Z',
  items: [
    {
      id: 'hermes',
      type: 'acp' as const,
      binary: 'hermes',
      args: ['acp'],
      installed: true,
      transport: 'stdio' as const,
      path: '/usr/local/bin/hermes',
      capabilities: ['tools', 'prompts'],
      install_cmd: 'pip install -e shadowflow[hermes]',
      last_checked: '2026-05-10T10:00:00.000Z',
    },
    {
      id: 'shadowsoul',
      type: 'acp' as const,
      binary: 'shadowsoul',
      args: ['acp'],
      installed: false,
      transport: 'unreachable' as const,
      path: null,
      capabilities: ['tools'],
      install_cmd: 'pip install -e shadowflow',
      last_checked: '2026-05-10T10:00:00.000Z',
      error: 'binary "shadowsoul" not on PATH',
    },
  ],
};

describe('AcpAgentsPanel', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRefresh.mockReset();
  });

  it('renders rows for online and offline agents', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<AcpAgentsPanel />);
    await waitFor(() => expect(screen.getByTestId('acp-row-hermes')).toBeInTheDocument());
    expect(screen.getByTestId('acp-row-shadowsoul')).toBeInTheDocument();
    expect(screen.getByTestId('acp-status-hermes').textContent).toMatch(/online/);
    expect(screen.getByTestId('acp-status-shadowsoul').textContent).toMatch(/offline/);
  });

  it('shows empty state when items array is empty', async () => {
    mockedList.mockResolvedValueOnce({ scanned_at: '2026-05-10T10:00:00.000Z', items: [] });
    render(<AcpAgentsPanel />);
    await waitFor(() => expect(screen.getByTestId('acp-empty-state')).toBeInTheDocument());
    expect(screen.getByTestId('acp-empty-state').textContent).toMatch(/No ACP \/ MCP agents/);
  });

  it('Re-scan button triggers refreshAcpAgents', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    mockedRefresh.mockResolvedValueOnce({ ...SAMPLE, scanned_at: '2026-05-10T10:01:00.000Z' });
    render(<AcpAgentsPanel />);
    // Wait for initial load to finish so the button isn't disabled.
    await waitFor(() => expect(screen.getByTestId('acp-row-hermes')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('acp-rescan-btn'));
    await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  });

  it('shows error banner when fetch fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('detect blew up'));
    render(<AcpAgentsPanel />);
    await waitFor(() => expect(screen.getByTestId('acp-error-banner')).toBeInTheDocument());
    expect(screen.getByTestId('acp-error-banner').textContent).toMatch(/detect blew up/);
  });

  it('offline row carries error message as title attr', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<AcpAgentsPanel />);
    await waitFor(() => expect(screen.getByTestId('acp-row-shadowsoul')).toBeInTheDocument());
    expect(screen.getByTestId('acp-row-shadowsoul').getAttribute('title')).toMatch(/not on PATH/);
  });
});

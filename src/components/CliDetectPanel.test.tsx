/**
 * CliDetectPanel.test.tsx — Story 15.19 v2
 *
 * Vitest + RTL. Mocks `api/cli` so we control the response shape and verify:
 *   - installed CLIs render Check icon and full opacity
 *   - missing CLIs render X icon, dimmed, with copyable install_cmd
 *   - env_set:false on a needs_env entry shows the warning subline
 *   - Re-scan button calls the refresh endpoint
 *   - error banner renders when fetch fails
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the api module BEFORE importing the component
vi.mock('../api/cli', () => ({
  listDetectedClis: vi.fn(),
  refreshCliDetection: vi.fn(),
}));

import { listDetectedClis, refreshCliDetection } from '../api/cli';
import { CliDetectPanel } from './CliDetectPanel';

const mockedList = listDetectedClis as unknown as ReturnType<typeof vi.fn>;
const mockedRefresh = refreshCliDetection as unknown as ReturnType<typeof vi.fn>;

const SAMPLE = {
  scanned_at: '2026-05-10T10:00:00.000Z',
  items: [
    {
      id: 'claude',
      installed: true,
      path: '/usr/local/bin/claude',
      version: '0.5.1',
      needs_env: 'ANTHROPIC_API_KEY',
      env_set: true,
      install_cmd: 'npm i -g @anthropic-ai/claude-cli',
      stream_format: 'claude-stream-json',
    },
    {
      id: 'codex',
      installed: false,
      path: null,
      version: null,
      needs_env: 'OPENAI_API_KEY',
      env_set: false,
      install_cmd: 'npm i -g @openai/codex',
      stream_format: 'codex-stream-json',
    },
    {
      id: 'cline',
      installed: false,
      path: null,
      version: null,
      env_set: true,
      install_cmd: 'npm i -g cline',
      stream_format: 'plain-line',
    },
  ],
};

describe('CliDetectPanel', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRefresh.mockReset();
    // Default: stub clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders all rows with correct status icons', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-row-claude')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cli-row-codex')).toBeInTheDocument();
    expect(screen.getByTestId('cli-row-cline')).toBeInTheDocument();
    expect(screen.getByTestId('cli-status-claude').textContent).toMatch(/installed/);
    expect(screen.getByTestId('cli-status-codex').textContent).toMatch(/missing/);
  });

  it('shows env-not-set warning for codex', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-row-codex')).toBeInTheDocument();
    });
    // codex.needs_env=OPENAI_API_KEY and env_set=false → warning subline visible
    expect(screen.getByTestId('cli-row-codex').textContent).toMatch(/OPENAI_API_KEY/);
  });

  it('shows install button for missing CLIs only', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-install-codex')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cli-install-claude')).toBeNull();
  });

  it('copies install_cmd when button clicked', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-install-codex')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cli-install-codex'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npm i -g @openai/codex');
  });

  it('Re-scan button calls refresh endpoint', async () => {
    mockedList.mockResolvedValueOnce(SAMPLE);
    mockedRefresh.mockResolvedValueOnce({
      ...SAMPLE,
      scanned_at: '2026-05-10T10:01:00.000Z',
    });
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-rescan-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cli-rescan-btn'));
    await waitFor(() => {
      expect(mockedRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error banner when fetch fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'));
    render(<CliDetectPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('cli-error-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cli-error-banner').textContent).toMatch(/boom/);
  });
});

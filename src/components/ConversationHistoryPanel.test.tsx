/**
 * ConversationHistoryPanel.test.tsx — Story 15.24
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '../test/utils';
import { ConversationHistoryPanel } from './ConversationHistoryPanel';
import type { ConversationRecord, MessageRecord } from '../api/conversations';

const originalFetch = global.fetch;

const CONV_LIST: ConversationRecord[] = [
  {
    conversation_id: 'cid-a',
    project_id: 'pid-a',
    title: 'first chat',
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
  },
];

const MESSAGES: MessageRecord[] = [
  {
    message_id: 'm1',
    conversation_id: 'cid-a',
    role: 'user',
    content: 'hello',
    run_id: null,
    created_at: '2026-05-10T00:00:00.000Z',
  },
  {
    message_id: 'm2',
    conversation_id: 'cid-a',
    role: 'assistant',
    content: 'hi back',
    run_id: 'run-xyz',
    created_at: '2026-05-10T00:00:01.000Z',
  },
];

function renderRouted(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ConversationHistoryPanel', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows empty state when no conversations', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })) as unknown as typeof fetch;
    renderRouted(<ConversationHistoryPanel projectId="pid-a" />);
    await waitFor(() => {
      expect(screen.getByTestId('conversation-history-empty')).toBeInTheDocument();
    });
  });

  it('lists conversations and lazy-loads messages on expand with run_id chip', async () => {
    let calls = 0;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      calls += 1;
      const u = String(url);
      if (u.includes('/conversations') && !u.includes('/messages')) {
        return { ok: true, status: 200, json: async () => CONV_LIST } as Response;
      }
      if (u.includes('/messages')) {
        return { ok: true, status: 200, json: async () => MESSAGES } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    }) as unknown as typeof fetch;

    renderRouted(<ConversationHistoryPanel projectId="pid-a" />);
    await waitFor(() => screen.getByText('first chat'));
    expect(calls).toBe(1); // messages NOT fetched yet

    await userEvent.click(screen.getByTestId('conversation-row-cid-a'));
    await waitFor(() => {
      expect(screen.getByTestId('message-m1')).toBeInTheDocument();
      expect(screen.getByTestId('message-m2')).toBeInTheDocument();
    });
    // Run-id chip on the assistant message points at /run-session/run-xyz
    const chip = screen.getByTestId('message-runid-m2') as HTMLAnchorElement;
    expect(chip.getAttribute('href')).toBe('/run-session/run-xyz');
  });
});

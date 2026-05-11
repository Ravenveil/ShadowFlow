/**
 * ConversationPicker.test.tsx — Story 15.29
 *
 * Vitest + @testing-library/react. Mirrors the DesignSystemPicker test
 * pattern (global fetch mock, custom render with I18nProvider wrapper).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../test/utils';
import { ConversationPicker } from './ConversationPicker';
import type { ConversationRecord } from '../api/conversations';

const originalFetch = global.fetch;

const SAMPLE: ConversationRecord[] = [
  {
    conversation_id: 'cid-a',
    project_id: 'default',
    title: 'First chat',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
  },
  {
    conversation_id: 'cid-b',
    project_id: 'default',
    title: null,
    created_at: '2026-04-30T00:00:00.000Z',
    updated_at: '2026-04-30T00:00:00.000Z',
  },
];

function mockFetchOk<T>(data: T) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => data,
  })) as unknown as typeof fetch;
}

describe('ConversationPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the list of conversations after fetch', async () => {
    global.fetch = mockFetchOk(SAMPLE);
    render(<ConversationPicker onChange={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByText('First chat')).toBeInTheDocument();
    });
    // null-titled conversation falls back to "Untitled (timestamp)"
    expect(screen.getByText(/Untitled \(/)).toBeInTheDocument();
    // Always-present "start fresh" + "+ New conversation" rows
    expect(screen.getByText('Untitled — start fresh')).toBeInTheDocument();
    expect(screen.getByText('+ New conversation')).toBeInTheDocument();
  });

  it('calls onChange with id when an existing conversation is picked', async () => {
    global.fetch = mockFetchOk(SAMPLE);
    const onChange = vi.fn();
    render(<ConversationPicker onChange={onChange} />);
    await waitFor(() => screen.getByText('First chat'));
    const select = screen.getByTestId('conversation-picker-select');
    await userEvent.selectOptions(select, 'cid-a');
    expect(onChange).toHaveBeenCalledWith('cid-a');
  });

  it('calls onChange with undefined when "start fresh" is picked', async () => {
    global.fetch = mockFetchOk(SAMPLE);
    const onChange = vi.fn();
    render(
      <ConversationPicker selectedId="cid-a" onChange={onChange} />,
    );
    await waitFor(() => screen.getByText('First chat'));
    const select = screen.getByTestId('conversation-picker-select');
    await userEvent.selectOptions(select, '__none__');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('opens the new-conversation modal when "+ New" is selected', async () => {
    global.fetch = mockFetchOk(SAMPLE);
    render(<ConversationPicker onChange={() => undefined} />);
    await waitFor(() => screen.getByText('First chat'));
    const select = screen.getByTestId('conversation-picker-select');
    await userEvent.selectOptions(select, '__new__');
    expect(screen.getByTestId('conversation-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-picker-new-title')).toBeInTheDocument();
  });

  it('creates a new conversation and selects it', async () => {
    const newConv: ConversationRecord = {
      conversation_id: 'cid-new',
      project_id: 'default',
      title: 'fresh start',
      created_at: '2026-05-10T12:00:00.000Z',
      updated_at: '2026-05-10T12:00:00.000Z',
    };
    let callCount = 0;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        // initial GET listConversations
        return { ok: true, status: 200, json: async () => SAMPLE } as Response;
      }
      // POST createConversation
      expect(init?.method).toBe('POST');
      const body = JSON.parse((init!.body as string) ?? '{}');
      expect(body.title).toBe('fresh start');
      return { ok: true, status: 201, json: async () => newConv } as Response;
    }) as unknown as typeof fetch;

    const onChange = vi.fn();
    render(<ConversationPicker onChange={onChange} />);
    await waitFor(() => screen.getByText('First chat'));

    const select = screen.getByTestId('conversation-picker-select');
    await userEvent.selectOptions(select, '__new__');
    const titleInput = screen.getByTestId('conversation-picker-new-title');
    await userEvent.type(titleInput, 'fresh start');
    await userEvent.click(screen.getByTestId('conversation-picker-create'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('cid-new');
    });
    // Modal should close after success
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-picker-modal')).not.toBeInTheDocument();
    });
  });

  it('renders empty list gracefully when project has no conversations', async () => {
    global.fetch = mockFetchOk([] as ConversationRecord[]);
    render(<ConversationPicker onChange={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByText('Untitled — start fresh')).toBeInTheDocument();
    });
    expect(screen.getByText('+ New conversation')).toBeInTheDocument();
  });
});

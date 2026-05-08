/**
 * BlueprintModal tests — Story 14.3 AC2/3/4 + a11y
 *
 * Covers: preview left column, JSON export, share-link copy,
 * import via base64 URL, invalid input error, duplicate-name "-copy" retry,
 * ESC close, import-only mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlueprintModal } from '../../components/agents/BlueprintModal';
import type { AgentRecord } from '../../api/agents';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/agents', () => ({
  quickCreateAgent: vi.fn(),
  AgentApiError: class AgentApiError extends Error {
    constructor(public status: number) { super(`Agent API error ${status}`); }
  },
}));

import * as agentsApi from '../../api/agents';
const mockQuickCreate = agentsApi.quickCreateAgent as ReturnType<typeof vi.fn>;

// clipboard
const mockClipboardWrite = vi.fn();

// URL helpers for file download assertions — spy on static methods, never stub the class
let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

// Anchor click spy for file download
let anchorClickSpy: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    agent_id: 'agent-001',
    name: 'TestBot',
    soul: 'You are a helpful test bot. '.repeat(6), // > 120 chars
    workspace_id: 'ws-1',
    blueprint: {
      memory_profile: { working_memory_limit: 4096, episodic_retention_days: 30 },
      role_profiles: [{ role_id: 'r1', name: 'Worker' }],
      tool_policies: [],
    } as Record<string, unknown>,
    status: 'idle',
    source: 'quick_hire',
    created_at: '2026-05-04T00:00:00Z',
    ...overrides,
  };
}

function encodeBlueprint(data: { name: string; soul: string; blueprint?: unknown }) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Clipboard API
  vi.stubGlobal('navigator', {
    ...window.navigator,
    clipboard: { writeText: mockClipboardWrite.mockResolvedValue(undefined) },
  });

  // Spy on URL static methods without replacing the constructor
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

  // Intercept anchor click to avoid jsdom navigation
  anchorClickSpy = vi.fn();
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = origCreate(tag);
    if (tag === 'a') el.click = anchorClickSpy;
    return el;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(props: Partial<Parameters<typeof BlueprintModal>[0]> = {}) {
  const agent = makeAgent();
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(
    <BlueprintModal
      agent={agent}
      onClose={onClose}
      onImported={onImported}
      {...props}
    />,
  );
  return { agent, onClose, onImported };
}

// ---------------------------------------------------------------------------
// AC2: Preview left column
// ---------------------------------------------------------------------------

describe('BlueprintModal — left column preview (AC2)', () => {
  it('shows agent name', () => {
    renderModal();
    expect(screen.getByText('TestBot')).toBeInTheDocument();
  });

  it('truncates soul to 120 chars', () => {
    renderModal();
    const soulText = 'You are a helpful test bot. '.repeat(6);
    const truncated = soulText.slice(0, 120) + '…';
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it('shows memory profile label', () => {
    renderModal();
    expect(screen.getByText(/4096 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/30d retention/)).toBeInTheDocument();
  });

  it('shows package includes checklist', () => {
    renderModal();
    expect(screen.getByText(/name \+ soul/i)).toBeInTheDocument();
    expect(screen.getByText(/memory profile/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC3: Export JSON
// ---------------------------------------------------------------------------

describe('BlueprintModal — Export JSON (AC3)', () => {
  it('clicking Export as JSON triggers file download', () => {
    renderModal();
    fireEvent.click(screen.getByText('Export as JSON'));
    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(anchorClickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
  });

  it('download filename contains agent name', () => {
    renderModal();
    const createSpy = vi.spyOn(document, 'createElement');
    fireEvent.click(screen.getByText('Export as JSON'));
    const anchor = createSpy.mock.results.find((r) => r.value?.tagName === 'A')?.value as HTMLAnchorElement | undefined;
    expect(anchor?.download).toMatch(/TestBot.*blueprint\.json/);
  });
});

// ---------------------------------------------------------------------------
// AC3: Copy share link
// ---------------------------------------------------------------------------

describe('BlueprintModal — Copy share link (AC3)', () => {
  it('clicking Copy share link calls clipboard and shows "Copied!"', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Copy share link'));
    await waitFor(() => {
      expect(mockClipboardWrite).toHaveBeenCalledOnce();
      expect(screen.getByText(/Copied!/)).toBeInTheDocument();
    });
  });

  it('share URL contains ?import= param', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Copy share link'));
    await waitFor(() => expect(mockClipboardWrite).toHaveBeenCalled());
    const url: string = mockClipboardWrite.mock.calls[0][0];
    expect(url).toContain('?import=');
  });
});

// ---------------------------------------------------------------------------
// AC3: Import — valid base64 URL
// ---------------------------------------------------------------------------

describe('BlueprintModal — Import via base64 URL (AC3)', () => {
  it('pasting valid share URL shows preview card', async () => {
    renderModal();
    const encoded = encodeBlueprint({ name: 'ImportedBot', soul: 'A test soul' });
    const shareUrl = `http://localhost/agents?import=${encoded}`;

    const input = screen.getByPlaceholderText(/粘贴分享链接/);
    await userEvent.type(input, shareUrl);

    await waitFor(() => {
      expect(screen.getByText('ImportedBot')).toBeInTheDocument();
    });
  });

  it('pasting bare base64 string also works', async () => {
    renderModal();
    const encoded = encodeBlueprint({ name: 'BareBot', soul: 'bare soul' });
    const input = screen.getByPlaceholderText(/粘贴分享链接/);
    await userEvent.type(input, encoded);

    await waitFor(() => expect(screen.getByText('BareBot')).toBeInTheDocument());
  });

  it('shows error for invalid base64', async () => {
    renderModal();
    const input = screen.getByPlaceholderText(/粘贴分享链接/);
    await userEvent.type(input, 'not-valid-base64!!!');
    await waitFor(() => expect(screen.getByText(/无法解析蓝图/)).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// AC3: Import action → quickCreateAgent
// ---------------------------------------------------------------------------

describe('BlueprintModal — Import action (AC3)', () => {
  it('Import Agent button calls quickCreateAgent and fires onImported', async () => {
    const imported = makeAgent({ agent_id: 'new-1', name: 'ImportedBot' });
    mockQuickCreate.mockResolvedValue(imported);

    const { onImported } = renderModal();
    const encoded = encodeBlueprint({ name: 'ImportedBot', soul: 'A soul' });
    const input = screen.getByPlaceholderText(/粘贴分享链接/);
    await userEvent.type(input, encoded);

    const importBtn = await screen.findByText('Import Agent');
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(mockQuickCreate).toHaveBeenCalledWith({ name: 'ImportedBot', soul: 'A soul' });
      expect(onImported).toHaveBeenCalledWith(imported);
    });
    expect(screen.getByText(/已导入/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC4: Duplicate name → auto "-copy" retry
// ---------------------------------------------------------------------------

describe('BlueprintModal — duplicate name "-copy" retry (AC4)', () => {
  it('retries with "-copy" suffix when first import fails', async () => {
    const copyAgent = makeAgent({ agent_id: 'new-2', name: 'ImportedBot-copy' });
    mockQuickCreate
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(copyAgent);

    const { onImported } = renderModal();
    const encoded = encodeBlueprint({ name: 'ImportedBot', soul: 'A soul' });
    await userEvent.type(screen.getByPlaceholderText(/粘贴分享链接/), encoded);

    fireEvent.click(await screen.findByText('Import Agent'));

    await waitFor(() => {
      expect(mockQuickCreate).toHaveBeenNthCalledWith(2, {
        name: 'ImportedBot-copy',
        soul: 'A soul',
      });
      expect(onImported).toHaveBeenCalledWith(copyAgent);
    });
  });
});

// ---------------------------------------------------------------------------
// A11y / close behavior
// ---------------------------------------------------------------------------

describe('BlueprintModal — close behavior', () => {
  it('ESC key calls onClose', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('backdrop click calls onClose', () => {
    const { onClose } = renderModal();
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has aria-modal and aria-labelledby', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });
});

// ---------------------------------------------------------------------------
// Import-only mode (no agent_id — from ?import= URL param)
// ---------------------------------------------------------------------------

describe('BlueprintModal — import-only mode (AC1)', () => {
  it('hides Export section when no agent_id', () => {
    renderModal({
      agent: makeAgent({ agent_id: '' }),
      initialImport: undefined,
    });
    expect(screen.queryByText('Export as JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy share link')).not.toBeInTheDocument();
  });

  it('auto-parses initialImport prop', async () => {
    const encoded = encodeBlueprint({ name: 'PreloadBot', soul: 'preloaded soul' });
    renderModal({
      agent: makeAgent({ agent_id: '' }),
      initialImport: encoded,
    });
    await waitFor(() => expect(screen.getByText('PreloadBot')).toBeInTheDocument());
  });
});

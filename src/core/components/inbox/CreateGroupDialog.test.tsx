/**
 * CreateGroupDialog tests — Story 7.3
 *
 * Covers:
 *  - 5-step wizard renders correctly
 *  - Step 1: group template selection highlights selected
 *  - Step 4: empty name blocks navigation to next step (AC4)
 *  - Submit triggers API call (AC3)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CreateGroupDialog } from './CreateGroupDialog';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTemplateResponse = {
  agent_roster: [
    { id: 'agent-writer', name: 'Writer', soul: 'Academic writer', llm: 'gpt-4', tools: [] },
    { id: 'agent-reviewer', name: 'Reviewer', soul: 'Peer reviewer', llm: 'claude-3', tools: [] },
  ],
  group_roster: [
    { id: 'grp-research', name: 'Research Team', agents: ['agent-writer', 'agent-reviewer'], policy_matrix: '' },
    { id: 'grp-solo', name: 'Solo Writer', agents: ['agent-writer'], policy_matrix: '' },
  ],
  policy_matrix: {},
};

const mockCreateGroupResponse = {
  group_id: 'new-group-123',
  name: 'Research Team',
  template_id: 'academic-paper',
  created_at: '2026-04-24T03:00:00Z',
  agents: ['agent-writer', 'agent-reviewer'],
};

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    // Match both /api/templates/ (legacy paths) and /templates/ (templates.ts client)
    if (url.includes('/templates/')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockTemplateResponse,
      });
    }
    if (url.includes('/api/groups')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockCreateGroupResponse,
      });
    }
    return Promise.reject(new Error(`Unhandled URL: ${url}`));
  });
  // Suppress window.history.pushState JSDOM warnings
  vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(open = true) {
  return render(
    <MemoryRouter>
      <CreateGroupDialog
        open={open}
        onClose={vi.fn()}
        templateId="academic-paper"
      />
    </MemoryRouter>
  );
}

async function waitForStep(stepTitle: string) {
  await waitFor(() => expect(screen.getByText(stepTitle)).toBeInTheDocument());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateGroupDialog', () => {
  it('does not render when open=false', () => {
    renderDialog(false);
    expect(screen.queryByTestId('create-group-dialog')).not.toBeInTheDocument();
  });

  it('renders Step 1 with step indicator on open', async () => {
    renderDialog();
    await waitForStep('选择群聊模板');
    expect(screen.getByRole('list', { name: '向导步骤' })).toBeInTheDocument();
    // Step 1 header shows "步骤 1 / 5"
    expect(screen.getByText('步骤 1 / 5')).toBeInTheDocument();
  });

  it('renders group templates from API in Step 1', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    expect(screen.getByTestId('group-template-grp-solo')).toBeInTheDocument();
  });

  it('Step 1: selecting a template highlights it with purple border', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    const btn = screen.getByTestId('group-template-grp-research');
    fireEvent.click(btn);
    expect(btn.className).toMatch(/border-\[#A78BFA\]/);
  });

  it('Step 1: clicking next without selection shows error', async () => {
    renderDialog();
    await waitForStep('选择群聊模板');
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-error')).toHaveTextContent('请先选择一个群聊模板');
  });

  it('advances to Step 2 after selecting a group template', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('group-template-grp-research'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('选择 AI 员工');
    expect(screen.getByText('步骤 2 / 5')).toBeInTheDocument();
  });

  it('Step 2: agent checkboxes default all-checked', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('group-template-grp-research'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('选择 AI 员工');
    const writerCheck = screen.getByTestId('agent-check-agent-writer') as HTMLInputElement;
    const reviewerCheck = screen.getByTestId('agent-check-agent-reviewer') as HTMLInputElement;
    expect(writerCheck.checked).toBe(true);
    expect(reviewerCheck.checked).toBe(true);
  });

  it('navigates through all 5 steps', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('group-template-grp-research'));
    // Step 1 → 2
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('选择 AI 员工');
    // Step 2 → 3
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('邀请人类成员（可选）');
    // Step 3 → 4
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('命名群聊');
    // Step 4 → 5
    const nameInput = screen.getByTestId('group-name-input');
    fireEvent.change(nameInput, { target: { value: 'Test Group' } });
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('确认 Policy Matrix（可选微调）');
    // Final step shows [创建群聊] button
    expect(screen.getByTestId('wizard-create')).toBeInTheDocument();
  });

  it('Step 4: empty group name blocks advance', async () => {
    renderDialog();
    // Navigate to Step 4
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('group-template-grp-research'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('选择 AI 员工');
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('邀请人类成员（可选）');
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('命名群聊');

    // Clear name and try to advance
    const nameInput = screen.getByTestId('group-name-input');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-error')).toHaveTextContent('群聊名称不能为空');
    // Still on step 4
    expect(screen.getByText('步骤 4 / 5')).toBeInTheDocument();
  });

  it('submit calls POST /api/groups with correct payload', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('group-template-grp-research')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('group-template-grp-research'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('选择 AI 员工');
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('邀请人类成员（可选）');
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('命名群聊');
    const nameInput = screen.getByTestId('group-name-input');
    fireEvent.change(nameInput, { target: { value: 'My Research Group' } });
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitForStep('确认 Policy Matrix（可选微调）');

    fireEvent.click(screen.getByTestId('wizard-create'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const groupsCall = calls.find((c: [string, ...unknown[]]) => (c[0] as string).includes('/api/groups'));
      expect(groupsCall).toBeDefined();
      const body = JSON.parse((groupsCall![1] as { body: string }).body);
      expect(body.template_id).toBe('academic-paper');
      expect(body.name).toBe('My Research Group');
      expect(body.agent_ids).toEqual(['agent-writer', 'agent-reviewer']);
    });
  });
});

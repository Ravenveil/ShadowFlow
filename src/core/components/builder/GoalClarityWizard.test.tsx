import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GoalClarityWizard, inferIntents } from './GoalClarityWizard';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// sessionStorage mock helper
function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

const mockStorage = createMockStorage();
vi.stubGlobal('sessionStorage', mockStorage);

function renderWizard(onSkip = vi.fn()) {
  return render(
    <MemoryRouter>
      <GoalClarityWizard onSkip={onSkip} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockStorage.clear();
  mockNavigate.mockReset();
});

// ── inferIntents unit tests ──────────────────────────────────────────────────

describe('inferIntents()', () => {
  it('returns ["other"] for empty string', () => {
    expect(inferIntents('')).toEqual(['other']);
  });

  it('detects research intent for "研究"', () => {
    expect(inferIntents('我想研究竞争对手')).toContain('research');
  });

  it('detects writing intent for "报告"', () => {
    expect(inferIntents('帮我写一份报告')).toContain('writing');
  });

  it('detects code intent for "代码"', () => {
    expect(inferIntents('写代码实现这个功能')).toContain('code');
  });

  it('detects data intent for "分析"', () => {
    expect(inferIntents('数据分析图表')).toContain('data');
  });

  it('detects review intent for "审核"', () => {
    expect(inferIntents('需要审核这份文件')).toContain('review');
  });

  it('detects multiple intents', () => {
    const intents = inferIntents('研究竞争对手并写报告');
    expect(intents).toContain('research');
    expect(intents).toContain('writing');
  });

  it('returns ["other"] for unmatched text', () => {
    expect(inferIntents('完全不相关的词')).toEqual(['other']);
  });
});

// ── Component tests ──────────────────────────────────────────────────────────

describe('GoalClarityWizard', () => {
  describe('Step 1', () => {
    it('renders step 1 on mount', () => {
      renderWizard();
      expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument();
    });

    it('renders all intent tags', () => {
      renderWizard();
      expect(screen.getByTestId('wizard-intent-tag-research')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-intent-tag-writing')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-intent-tag-code')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-intent-tag-data')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-intent-tag-review')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-intent-tag-other')).toBeInTheDocument();
    });

    it('next button is disabled when goal is empty', () => {
      renderWizard();
      expect(screen.getByTestId('wizard-next-btn')).toBeDisabled();
    });

    it('next button is enabled after typing goal', async () => {
      renderWizard();
      const textarea = screen.getByTestId('wizard-goal-input');
      await userEvent.type(textarea, '我想写一篇文章');
      expect(screen.getByTestId('wizard-next-btn')).not.toBeDisabled();
    });

    it('auto-detects research intent when typing "研究"', async () => {
      renderWizard();
      const textarea = screen.getByTestId('wizard-goal-input');
      await userEvent.type(textarea, '调研市场');
      // research tag should become active (has accent styling)
      const tag = screen.getByTestId('wizard-intent-tag-research');
      expect(tag).toBeInTheDocument();
    });

    it('allows manual toggle of intent tags', async () => {
      renderWizard();
      const textarea = screen.getByTestId('wizard-goal-input');
      await userEvent.type(textarea, '调研市场');
      // research should be active; click to deactivate
      const researchTag = screen.getByTestId('wizard-intent-tag-research');
      await userEvent.click(researchTag);
      // click again to re-activate
      await userEvent.click(researchTag);
      expect(researchTag).toBeInTheDocument();
    });

    it('advances to step 2 when next is clicked with non-empty goal', async () => {
      renderWizard();
      await userEvent.type(screen.getByTestId('wizard-goal-input'), '我想写一篇文章');
      await userEvent.click(screen.getByTestId('wizard-next-btn'));
      expect(screen.getByTestId('wizard-step-2')).toBeInTheDocument();
    });
  });

  describe('Step 2', () => {
    async function goToStep2() {
      renderWizard();
      await userEvent.type(screen.getByTestId('wizard-goal-input'), '写一份研究报告');
      await userEvent.click(screen.getByTestId('wizard-next-btn'));
    }

    it('renders both scale options', async () => {
      await goToStep2();
      expect(screen.getByTestId('wizard-scale-single')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-scale-multi')).toBeInTheDocument();
    });

    it('clicking single navigates to /builder?mode=single', async () => {
      await goToStep2();
      await userEvent.click(screen.getByTestId('wizard-scale-single'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/builder?mode=single'),
      );
    });

    it('clicking multi navigates to /builder?mode=team', async () => {
      await goToStep2();
      await userEvent.click(screen.getByTestId('wizard-scale-multi'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('/builder?mode=team'),
      );
    });

    it('stores wizard state in sessionStorage on navigate', async () => {
      await goToStep2();
      await userEvent.click(screen.getByTestId('wizard-scale-single'));
      const stored = sessionStorage.getItem('sf_wizard_state');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.goal).toBe('写一份研究报告');
      expect(parsed.scale_hint).toBe('single');
    });

    it('goal is encoded in navigate URL', async () => {
      await goToStep2();
      await userEvent.click(screen.getByTestId('wizard-scale-single'));
      const call = mockNavigate.mock.calls[0][0] as string;
      expect(call).toContain('goal=');
    });

    it('intents are passed in navigate URL', async () => {
      await goToStep2();
      await userEvent.click(screen.getByTestId('wizard-scale-single'));
      const call = mockNavigate.mock.calls[0][0] as string;
      expect(call).toContain('intents=');
    });
  });

  describe('Skip', () => {
    it('calls onSkip when skip button clicked', async () => {
      const onSkip = vi.fn();
      renderWizard(onSkip);
      await userEvent.click(screen.getByTestId('wizard-skip-btn'));
      expect(onSkip).toHaveBeenCalledOnce();
    });

    it('removes sessionStorage entry on skip', async () => {
      const onSkip = vi.fn();
      sessionStorage.setItem('sf_wizard_state', JSON.stringify({ goal: 'x' }));
      renderWizard(onSkip);
      await userEvent.click(screen.getByTestId('wizard-skip-btn'));
      expect(sessionStorage.getItem('sf_wizard_state')).toBeNull();
    });
  });
});

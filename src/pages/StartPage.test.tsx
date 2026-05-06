import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import StartPage from './StartPage';

// Mock GoalClarityWizard to avoid router-dependency in wizard
vi.mock('../core/components/builder/GoalClarityWizard', () => ({
  GoalClarityWizard: ({ onSkip }: { onSkip: () => void }) => (
    <div data-testid="goal-clarity-wizard">
      <button onClick={onSkip}>跳过</button>
    </div>
  ),
}));

function renderStartPage(path = '/start') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StartPage />
    </MemoryRouter>,
  );
}

describe('StartPage', () => {
  it('renders the start page container', () => {
    renderStartPage();
    expect(screen.getByTestId('start-page')).toBeInTheDocument();
  });

  it('renders three primitive cards', () => {
    renderStartPage();
    expect(screen.getByTestId('primitive-card-agent')).toBeInTheDocument();
    expect(screen.getByTestId('primitive-card-team')).toBeInTheDocument();
    expect(screen.getByTestId('primitive-card-catalog')).toBeInTheDocument();
  });

  it('shows card titles', () => {
    renderStartPage();
    expect(screen.getByText('创建 Agent')).toBeInTheDocument();
    expect(screen.getByText('创建 Team')).toBeInTheDocument();
    expect(screen.getByText('从模板开始')).toBeInTheDocument();
  });

  it('renders the wizard trigger button', () => {
    renderStartPage();
    expect(screen.getByTestId('goal-clarity-wizard-trigger')).toBeInTheDocument();
  });

  it('wizard is hidden by default', () => {
    renderStartPage();
    expect(screen.queryByTestId('goal-clarity-wizard')).not.toBeInTheDocument();
  });

  it('clicking wizard trigger shows GoalClarityWizard', async () => {
    renderStartPage();
    await userEvent.click(screen.getByTestId('goal-clarity-wizard-trigger'));
    expect(screen.getByTestId('goal-clarity-wizard')).toBeInTheDocument();
  });

  it('wizard trigger is hidden when wizard is open', async () => {
    renderStartPage();
    await userEvent.click(screen.getByTestId('goal-clarity-wizard-trigger'));
    expect(screen.queryByTestId('goal-clarity-wizard-trigger')).not.toBeInTheDocument();
  });

  it('wizard closes when onSkip is triggered', async () => {
    renderStartPage();
    await userEvent.click(screen.getByTestId('goal-clarity-wizard-trigger'));
    expect(screen.getByTestId('goal-clarity-wizard')).toBeInTheDocument();
    // Click the mocked skip button inside the wizard
    await userEvent.click(screen.getByRole('button', { name: '跳过' }));
    expect(screen.queryByTestId('goal-clarity-wizard')).not.toBeInTheDocument();
  });

  it('auto-opens wizard when ?wizard=1 in URL', () => {
    renderStartPage('/start?wizard=1');
    expect(screen.getByTestId('goal-clarity-wizard')).toBeInTheDocument();
  });
});

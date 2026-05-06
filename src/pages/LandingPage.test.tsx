import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/AppRoutes';

function renderAtRoute(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('LandingPage', () => {
  it('renders slogan, quadrant chart, and CTA buttons at /', async () => {
    renderAtRoute('/');

    expect(
      await screen.findByText(/让每个人都能设计自己的 AI 协作团队/),
    ).toBeInTheDocument();

    expect(screen.getByText(/团队本身是链上资产/)).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /四维象限/ })).toBeInTheDocument();

    const demoBtn = screen.getByRole('link', { name: /Try Live Demo/ });
    expect(demoBtn).toBeInTheDocument();
    expect(demoBtn).toHaveAttribute('href', '/templates');

    const githubBtn = screen.getByRole('link', { name: /View GitHub/ });
    expect(githubBtn).toBeInTheDocument();
    expect(githubBtn).toHaveAttribute('target', '_blank');
  });

  it('renders three capability cards', async () => {
    renderAtRoute('/');
    await screen.findByText(/让每个人都能设计自己的 AI 协作团队/);

    expect(screen.getByText('Runtime Contract')).toBeInTheDocument();
    expect(screen.getByText('Policy Matrix')).toBeInTheDocument();
    expect(screen.getByText(/0G 链上传承/)).toBeInTheDocument();
  });

  it('Try Live Demo links to /templates without login gate', async () => {
    renderAtRoute('/');

    const demoBtn = await screen.findByRole('link', { name: /Try Live Demo/ });
    expect(demoBtn).toHaveAttribute('href', '/templates');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

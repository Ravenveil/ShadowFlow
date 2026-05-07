import { render, screen } from '@testing-library/react';
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
  it('renders ShadowFlow branding and primary CTA at /', async () => {
    const { container } = renderAtRoute('/');

    // Wait for the page to load — logo is always present
    const logos = await screen.findAllByText('ShadowFlow');
    expect(logos.length).toBeGreaterThan(0);

    // Primary CTA button (Quick Demo → /templates) is present
    expect(screen.getByRole('button', { name: /Quick Demo/i })).toBeInTheDocument();

    // No login gate on initial render (FR38)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders VS Rivals and Features sections', async () => {
    const { container } = renderAtRoute('/');
    await screen.findAllByText('ShadowFlow');

    const text = container.textContent ?? '';
    // VS Rivals section lists competitors
    expect(text).toContain('CHATGPT');
    expect(text).toContain('CREWAI');
    // Features section includes Policy Matrix
    expect(text).toContain('Policy Matrix');
  });

  it('Import CID form is accessible without login gate', async () => {
    const { container } = renderAtRoute('/');
    await screen.findAllByText('ShadowFlow');

    // Import CID section: Fetch & Verify button
    expect(screen.getByRole('button', { name: /Fetch/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

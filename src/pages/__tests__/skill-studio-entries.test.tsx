/**
 * skill-studio-entries.test.tsx — Story 15.28
 *
 * Verifies that the Skill Studio main-UI integration entries render their
 * data-testid markers. We mount StartPage in isolation (other entry pages
 * are covered by their own page-level tests + the Playwright run inside
 * `_tmp_verify_15_28.mjs`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../common/i18n';

// Stub network APIs so StartPage doesn't blow up during render.
vi.mock('../../api/catalog', () => ({
  listCatalogApps: vi.fn(() => Promise.resolve({ data: { apps: [] } })),
}));
vi.mock('../../api/knowledge', () => ({
  listPacks: vi.fn(() => Promise.resolve({ data: { packs: [] } })),
}));
vi.mock('../../api/runs', () => ({
  listRuns: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../core/hooks/useSecretsStore', () => ({
  useSecretsStore: () => ({ secrets: {}, setSecret: vi.fn() }),
}));

import StartPage from '../StartPage';

function wrap(ui: React.ReactNode) {
  return (
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>
  );
}

describe('Story 15.28 — Skill Studio entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('StartPage renders the Skill Studio primitive card', async () => {
    render(wrap(<StartPage />));
    await waitFor(() => {
      expect(screen.getByTestId('primitive-card-skill-studio')).toBeTruthy();
    });
  });

  it('StartPage Skill Studio card shows the i18n title text', async () => {
    render(wrap(<StartPage />));
    await waitFor(() => {
      const card = screen.getByTestId('primitive-card-skill-studio');
      expect(card.textContent).toMatch(/Skill Studio/i);
    });
  });
});

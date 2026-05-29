/**
 * ByokSection — API-key field behaviour (2026-05-29).
 *
 * Cherry-Studio model: when a provider with a saved key is selected the full
 * plaintext is eager-loaded via GET /byok/:id/reveal and rendered in the input
 * (masked as dots via type=password → real key length). The eye toggle flips
 * type=password↔text to reveal it. If the reveal endpoint is unavailable the
 * field gracefully falls back to the server's masked tail (`••••XXXX`).
 *
 * Regression history: the field used to render a hardcoded `'•'.repeat(40)`
 * for any saved key, so the eye revealed nothing useful.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rawRender, screen } from '@testing-library/react';
import { I18nProvider } from '../../../common/i18n';
import { ByokSection } from './ByokSection';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

const MASKED = '••••sk12';                  // settings.ts maskApiKey('...sk12')
const FULL = 'sk-ant-api03-REALKEY-sk12';   // plaintext from /reveal

/**
 * Mock ByokSection's GETs. `savedKey` empty → no provider configured.
 * `revealOk=false` makes /reveal 404 (simulates an un-restarted backend).
 */
function mockFetch(savedKey: string, revealOk = true) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/settings/byok/anthropic/reveal')) {
      return revealOk
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: FULL }) } as Response)
        : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ detail: 'Not Found' }) } as Response);
    }
    if (url.endsWith('/api/settings/byok')) {
      const providers = savedKey
        ? { anthropic: { apiKey: savedKey, baseUrl: '', models: [], enabled: true } }
        : {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ providers }) } as Response);
    }
    if (url.endsWith('/api/settings/byok/models')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  });
}

describe('ByokSection — API key field', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('eager-loads the full plaintext key and renders it masked (type=password)', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED));
    render(<ByokSection />);
    // findByDisplayValue waits for the async /reveal to land the full key.
    const input = await screen.findByDisplayValue(FULL) as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('password');  // masked by default
  });

  it('eye toggle flips the input type to reveal the full key', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED));
    render(<ByokSection />);
    const input = await screen.findByDisplayValue(FULL) as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('password');

    // Native .click() — fireEvent.click's synthetic event is flaky on this
    // nested button in jsdom (focus events work, proving wiring is live).
    (screen.getByTitle('显示') as HTMLButtonElement).click();

    await screen.findByTitle('隐藏'); // title flips → state toggled
    expect(input.getAttribute('type')).toBe('text');
    expect(input.value).toBe(FULL);
  });

  it('falls back to the masked tail when /reveal is unavailable (404)', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED, /* revealOk */ false));
    render(<ByokSection />);
    const input = await screen.findByDisplayValue(MASKED) as HTMLInputElement;
    expect(input.value).toBe(MASKED);
  });

  it('leaves the field empty (placeholder visible) when no key is saved', async () => {
    vi.stubGlobal('fetch', mockFetch(''));
    render(<ByokSection />);
    const input = await screen.findByPlaceholderText('sk-ant-…') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

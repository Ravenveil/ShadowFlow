/**
 * ByokSection — regression test for the API-key reveal bug (2026-05-29).
 *
 * Bug: with a saved key, the input rendered a hardcoded `'•'.repeat(40)`
 * instead of the server's masked tail (`••••XXXX`). The eye toggle only flips
 * the input `type`, so "显示" revealed 40 literal bullets — i.e. nothing
 * useful. Fix: when not editing, display `savedState.apiKey` (the masked tail)
 * so the toggle reveals the last-4 chars.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as rawRender, screen } from '@testing-library/react';
import { I18nProvider } from '../../../common/i18n';
import { ByokSection } from './ByokSection';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

const MASKED = '••••sk12'; // what settings.ts maskApiKey('...sk12') returns

/** Mock the two GETs ByokSection fires on mount. `savedKey` empty → no key. */
function mockFetch(savedKey: string) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
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

describe('ByokSection — API key field value', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Regression (2026-05-29): the reveal eye showed nothing useful because the
  // input rendered a hardcoded '•'.repeat(40) for any saved key, discarding the
  // server's masked tail. Both tests pin the value expression at line ~1159.

  it('shows the server masked tail for a saved key (not a fixed bullet string)', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED));
    render(<ByokSection />);
    const input = await screen.findByPlaceholderText('输入新值替换保存的密钥') as HTMLInputElement;
    expect(input.value).toBe(MASKED);          // before fix: '•'.repeat(40)
    expect(input.value).not.toBe('•'.repeat(40));
  });

  it('leaves the field empty (placeholder visible) when no key is saved', async () => {
    vi.stubGlobal('fetch', mockFetch(''));
    render(<ByokSection />);
    // Anthropic has no saved key → the provider key placeholder is shown.
    const input = await screen.findByPlaceholderText('sk-ant-…') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

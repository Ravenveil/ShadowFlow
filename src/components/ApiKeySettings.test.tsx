/**
 * Story 15.7 — ApiKeySettings + _base BYOK helpers unit tests.
 *
 * Covers:
 *   • maskApiKey: masks long keys, collapses short ones
 *   • get/set/clearStoredApiKey: localStorage round-trip
 *   • authHeaders: builds X-Anthropic-Key when stored, empty otherwise
 *   • <ApiKeySettings/>: format validation rejects non-`sk-ant-` prefix,
 *     valid input persists, mask renders, clear removes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rawRender, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../common/i18n';

// Story 15.18 — `useI18n` requires the provider; older tests in this file
// rendered the component directly because at the time the project's setup
// supplied a default. We now wrap explicitly to keep the suite resilient.
const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);
import {
  authHeaders,
  clearStoredApiKey,
  getStoredApiKey,
  maskApiKey,
  setStoredApiKey,
  setDefaultProvider,
  getDefaultProvider,
  ANTHROPIC_KEY_STORAGE,
  KEY_STORAGE,
  HEADER_NAME,
  PROVIDER_IDS,
  type ProviderId,
} from '../api/_base';
import { ApiKeySettings } from './ApiKeySettings';

const VALID_KEY = 'sk-ant-api03-1234567890abcdef-XYZA';
const SHORT = 'sk-ant-x';
const NON_ANTHROPIC = 'sk-openai-abcdef1234567890';

describe('_base BYOK helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('maskApiKey', () => {
    it('masks long key keeping first 15 + last 4', () => {
      // VALID_KEY has length 36; mask = first 15 + "..." + last 4
      expect(maskApiKey(VALID_KEY)).toBe('sk-ant-api03-12...XYZA');
    });

    it('collapses short key to ****', () => {
      expect(maskApiKey(SHORT)).toBe('****');
      expect(maskApiKey('')).toBe('****');
    });
  });

  describe('localStorage round-trip', () => {
    it('returns null when nothing stored', () => {
      expect(getStoredApiKey()).toBeNull();
    });

    it('stores and retrieves the key', () => {
      setStoredApiKey(VALID_KEY);
      expect(localStorage.getItem(ANTHROPIC_KEY_STORAGE)).toBe(VALID_KEY);
      expect(getStoredApiKey()).toBe(VALID_KEY);
    });

    it('clearStoredApiKey removes it', () => {
      setStoredApiKey(VALID_KEY);
      clearStoredApiKey();
      expect(getStoredApiKey()).toBeNull();
    });
  });

  describe('authHeaders', () => {
    it('returns empty object when no key', () => {
      expect(authHeaders()).toEqual({});
    });

    it('returns X-Anthropic-Key when stored', () => {
      setStoredApiKey(VALID_KEY);
      expect(authHeaders()).toEqual({ 'X-Anthropic-Key': VALID_KEY });
    });

    it('is spread-safe: merges with other headers', () => {
      setStoredApiKey(VALID_KEY);
      const merged = { 'Content-Type': 'application/json', ...authHeaders() };
      expect(merged).toEqual({
        'Content-Type': 'application/json',
        'X-Anthropic-Key': VALID_KEY,
      });
    });
  });
});

describe('<ApiKeySettings/>', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders empty input when no key stored', () => {
    render(<ApiKeySettings />);
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
    expect(screen.queryByTestId('api-key-masked')).not.toBeInTheDocument();
  });

  it('rejects keys not starting with sk-ant-', () => {
    const onChange = vi.fn();
    render(<ApiKeySettings onChange={onChange} />);

    const input = screen.getByTestId('api-key-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: NON_ANTHROPIC } });
    fireEvent.click(screen.getByTestId('api-key-save'));

    expect(screen.getByTestId('api-key-error')).toHaveTextContent(/sk-ant-/);
    expect(localStorage.getItem(ANTHROPIC_KEY_STORAGE)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('saves valid key, switches to masked view, fires onChange', () => {
    const onChange = vi.fn();
    render(<ApiKeySettings onChange={onChange} />);

    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: VALID_KEY },
    });
    fireEvent.click(screen.getByTestId('api-key-save'));

    expect(localStorage.getItem(ANTHROPIC_KEY_STORAGE)).toBe(VALID_KEY);
    expect(onChange).toHaveBeenCalledWith(VALID_KEY);

    const masked = screen.getByTestId('api-key-masked');
    expect(masked).toBeInTheDocument();
    expect(masked.textContent).toBe('sk-ant-api03-12...XYZA');
  });

  it('clear removes the stored key', () => {
    setStoredApiKey(VALID_KEY);
    const onChange = vi.fn();
    render(<ApiKeySettings onChange={onChange} />);

    expect(screen.getByTestId('api-key-masked')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('api-key-clear'));

    expect(localStorage.getItem(ANTHROPIC_KEY_STORAGE)).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
  });

  it('trims whitespace before validating', () => {
    render(<ApiKeySettings />);
    fireEvent.change(screen.getByTestId('api-key-input'), {
      target: { value: `  ${VALID_KEY}  ` },
    });
    fireEvent.click(screen.getByTestId('api-key-save'));
    expect(localStorage.getItem(ANTHROPIC_KEY_STORAGE)).toBe(VALID_KEY);
  });
});

// ─── Story 15.18 — multi-provider BYOK ─────────────────────────────────────

const OPENAI_KEY = 'sk-openai-1234567890abcdef-XYZA';
const DEEPSEEK_KEY = 'sk-deepseek-1234567890abcdef-AB';
const ZHIPU_KEY = 'abcdef.0123456789abcdef0123456789';

describe('Story 15.18 — multi-provider BYOK', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('KEY_STORAGE / HEADER_NAME tables', () => {
    it('exposes all 4 provider ids', () => {
      expect([...PROVIDER_IDS].sort()).toEqual(
        ['anthropic', 'deepseek', 'openai', 'zhipu'].sort(),
      );
    });

    it('every provider has a localStorage slot + header', () => {
      for (const id of PROVIDER_IDS) {
        expect(typeof KEY_STORAGE[id]).toBe('string');
        expect(KEY_STORAGE[id]).toMatch(/^sf_.+_key$/);
        expect(HEADER_NAME[id]).toMatch(/^X-.+-Key$/i);
      }
    });

    it('keeps Story 15.7 ANTHROPIC_KEY_STORAGE constant intact', () => {
      expect(ANTHROPIC_KEY_STORAGE).toBe('sf_anthropic_key');
      expect(KEY_STORAGE.anthropic).toBe(ANTHROPIC_KEY_STORAGE);
    });
  });

  describe('per-provider get/set/clear', () => {
    it.each<[ProviderId, string]>([
      ['anthropic', VALID_KEY],
      ['openai', OPENAI_KEY],
      ['deepseek', DEEPSEEK_KEY],
      ['zhipu', ZHIPU_KEY],
    ])('round-trips %s key', (id, key) => {
      setStoredApiKey(key, id);
      expect(getStoredApiKey(id)).toBe(key);
      clearStoredApiKey(id);
      expect(getStoredApiKey(id)).toBeNull();
    });

    it('keys are independent — clearing one leaves others intact', () => {
      setStoredApiKey(VALID_KEY, 'anthropic');
      setStoredApiKey(OPENAI_KEY, 'openai');
      setStoredApiKey(DEEPSEEK_KEY, 'deepseek');
      setStoredApiKey(ZHIPU_KEY, 'zhipu');

      clearStoredApiKey('openai');
      expect(getStoredApiKey('anthropic')).toBe(VALID_KEY);
      expect(getStoredApiKey('openai')).toBeNull();
      expect(getStoredApiKey('deepseek')).toBe(DEEPSEEK_KEY);
      expect(getStoredApiKey('zhipu')).toBe(ZHIPU_KEY);
    });
  });

  describe('authHeaders multi-provider', () => {
    it('emits no headers when nothing stored', () => {
      expect(authHeaders()).toEqual({});
    });

    it('emits only the headers whose keys are present', () => {
      setStoredApiKey(VALID_KEY, 'anthropic');
      setStoredApiKey(ZHIPU_KEY, 'zhipu');
      const h = authHeaders();
      expect(h).toEqual({
        'X-Anthropic-Key': VALID_KEY,
        'X-Zhipu-Key': ZHIPU_KEY,
      });
      expect(h['X-OpenAI-Key']).toBeUndefined();
      expect(h['X-DeepSeek-Key']).toBeUndefined();
    });

    it('emits all 4 when all 4 are stored', () => {
      setStoredApiKey(VALID_KEY, 'anthropic');
      setStoredApiKey(OPENAI_KEY, 'openai');
      setStoredApiKey(DEEPSEEK_KEY, 'deepseek');
      setStoredApiKey(ZHIPU_KEY, 'zhipu');
      expect(authHeaders()).toEqual({
        'X-Anthropic-Key': VALID_KEY,
        'X-OpenAI-Key': OPENAI_KEY,
        'X-DeepSeek-Key': DEEPSEEK_KEY,
        'X-Zhipu-Key': ZHIPU_KEY,
      });
    });

    it('Story 15.7 single-anthropic contract still holds', () => {
      // Old test path — back-compat assertion.
      setStoredApiKey(VALID_KEY); // no provider arg → defaults to 'anthropic'
      expect(authHeaders()).toEqual({ 'X-Anthropic-Key': VALID_KEY });
    });
  });

  describe('default-provider helper', () => {
    it('defaults to anthropic when nothing stored', () => {
      expect(getDefaultProvider()).toBe('anthropic');
    });

    it('round-trips a valid provider id', () => {
      setDefaultProvider('deepseek');
      expect(getDefaultProvider()).toBe('deepseek');
    });

    it('rejects unknown ids and keeps the previous value', () => {
      setDefaultProvider('openai');
      // @ts-expect-error — intentional bad input
      setDefaultProvider('foo');
      expect(getDefaultProvider()).toBe('openai');
    });

    it('falls back to anthropic when localStorage is corrupted', () => {
      localStorage.setItem('sf_default_provider', 'not-a-provider');
      expect(getDefaultProvider()).toBe('anthropic');
    });
  });

  describe('<ApiKeySettings/> 4-card layout', () => {
    it('renders the default-provider radio + all 4 cards in non-compact mode', () => {
      render(<ApiKeySettings />);
      expect(screen.getByTestId('default-provider-radio')).toBeInTheDocument();
      expect(screen.getByTestId('api-key-settings')).toBeInTheDocument(); // anthropic
      expect(screen.getByTestId('api-key-settings-openai')).toBeInTheDocument();
      expect(screen.getByTestId('api-key-settings-deepseek')).toBeInTheDocument();
      expect(screen.getByTestId('api-key-settings-zhipu')).toBeInTheDocument();
    });

    it('compact mode keeps the Story 15.7 single-card layout', () => {
      render(<ApiKeySettings compact />);
      expect(screen.getByTestId('api-key-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('default-provider-radio')).not.toBeInTheDocument();
      expect(screen.queryByTestId('api-key-settings-openai')).not.toBeInTheDocument();
    });

    it('saves an OpenAI key via its own card, leaves Anthropic untouched', () => {
      render(<ApiKeySettings />);
      fireEvent.change(screen.getByTestId('api-key-input-openai'), {
        target: { value: OPENAI_KEY },
      });
      fireEvent.click(screen.getByTestId('api-key-save-openai'));

      expect(localStorage.getItem(KEY_STORAGE.openai)).toBe(OPENAI_KEY);
      expect(localStorage.getItem(KEY_STORAGE.anthropic)).toBeNull();
      expect(screen.getByTestId('api-key-masked-openai')).toBeInTheDocument();
    });

    it('zhipu accepts arbitrary non-empty key (no prefix check)', () => {
      render(<ApiKeySettings />);
      fireEvent.change(screen.getByTestId('api-key-input-zhipu'), {
        target: { value: ZHIPU_KEY },
      });
      fireEvent.click(screen.getByTestId('api-key-save-zhipu'));

      expect(localStorage.getItem(KEY_STORAGE.zhipu)).toBe(ZHIPU_KEY);
    });

    it('default-provider radio writes sf_default_provider', () => {
      render(<ApiKeySettings />);
      const deepseekOption = screen
        .getByTestId('default-provider-option-deepseek')
        .querySelector('input[type="radio"]') as HTMLInputElement;
      fireEvent.click(deepseekOption);
      expect(localStorage.getItem('sf_default_provider')).toBe('deepseek');
    });

    it('clearing one provider does not affect the others', () => {
      // Pre-seed all four keys.
      setStoredApiKey(VALID_KEY, 'anthropic');
      setStoredApiKey(OPENAI_KEY, 'openai');
      setStoredApiKey(DEEPSEEK_KEY, 'deepseek');
      setStoredApiKey(ZHIPU_KEY, 'zhipu');

      render(<ApiKeySettings />);
      fireEvent.click(screen.getByTestId('api-key-clear-deepseek'));

      expect(localStorage.getItem(KEY_STORAGE.deepseek)).toBeNull();
      expect(localStorage.getItem(KEY_STORAGE.anthropic)).toBe(VALID_KEY);
      expect(localStorage.getItem(KEY_STORAGE.openai)).toBe(OPENAI_KEY);
      expect(localStorage.getItem(KEY_STORAGE.zhipu)).toBe(ZHIPU_KEY);
    });
  });
});

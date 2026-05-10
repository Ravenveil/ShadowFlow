/**
 * GenerationSettings.test.tsx — Story 15.9
 *
 * Covers:
 *   • getGenerationSettings(): valid, out-of-range, NaN, missing, invalid temperature
 *   • createRunSession() merges generation settings into the POST body
 *   • Component renders with controls (sliders, model select, default skill / DS)
 *   • model_locked=true → dropdown disabled + "locked by env" hint visible
 *   • max_tokens slider edit clamps and persists to localStorage
 *   • temperature slider edit persists
 *   • lastSkill / lastDS persistence helpers (round-trip)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { I18nProvider } from '../common/i18n';
import {
  AUTO_CRITIQUE_STORAGE,
  LAST_DS_STORAGE,
  LAST_SKILL_STORAGE,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_STORAGE,
  TEMPERATURE_STORAGE,
  getGenerationSettings,
  getStoredString,
  setStoredString,
} from '../api/_base';
import { createRunSession } from '../api/runSessions';
import { GenerationSettings } from './GenerationSettings';

// ── getGenerationSettings unit tests ─────────────────────────────────────────

describe('getGenerationSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty object when nothing is stored', () => {
    expect(getGenerationSettings()).toEqual({});
  });

  it('returns max_tokens when valid integer in range', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '4096');
    expect(getGenerationSettings()).toEqual({ max_tokens: 4096 });
  });

  it('drops max_tokens when out of range (too low)', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '512');
    expect(getGenerationSettings().max_tokens).toBeUndefined();
  });

  it('drops max_tokens when out of range (too high)', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, String(MAX_TOKENS_MAX + 1024));
    expect(getGenerationSettings().max_tokens).toBeUndefined();
  });

  it('drops max_tokens when NaN', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, 'not-a-number');
    expect(getGenerationSettings().max_tokens).toBeUndefined();
  });

  it('returns temperature when in range', () => {
    localStorage.setItem(TEMPERATURE_STORAGE, '0.3');
    expect(getGenerationSettings()).toEqual({ temperature: 0.3 });
  });

  it('drops temperature when out of range', () => {
    localStorage.setItem(TEMPERATURE_STORAGE, '1.5');
    expect(getGenerationSettings().temperature).toBeUndefined();
  });

  it('combines max_tokens and temperature when both valid', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '2048');
    localStorage.setItem(TEMPERATURE_STORAGE, '0.5');
    expect(getGenerationSettings()).toEqual({
      max_tokens: 2048,
      temperature: 0.5,
    });
  });

  it('does not include model (reserved for future opt-in)', () => {
    localStorage.setItem('sf.model', 'claude-opus-4');
    const got = getGenerationSettings();
    expect(got.model).toBeUndefined();
  });

  it('respects the boundary values (1024 and 32768)', () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, String(MAX_TOKENS_MIN));
    expect(getGenerationSettings().max_tokens).toBe(MAX_TOKENS_MIN);
    localStorage.setItem(MAX_TOKENS_STORAGE, String(MAX_TOKENS_MAX));
    expect(getGenerationSettings().max_tokens).toBe(MAX_TOKENS_MAX);
  });
});

// ── getStoredString / setStoredString round-trip ─────────────────────────────

describe('getStoredString / setStoredString', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when missing', () => {
    expect(getStoredString('missing-key')).toBeNull();
  });

  it('round-trips a string', () => {
    setStoredString('foo', 'bar');
    expect(getStoredString('foo')).toBe('bar');
  });

  it('persists lastSkill / lastDS for RunSessionPage handoff', () => {
    setStoredString(LAST_SKILL_STORAGE, 'web-prototype');
    setStoredString(LAST_DS_STORAGE, 'tailwind');
    expect(getStoredString(LAST_SKILL_STORAGE)).toBe('web-prototype');
    expect(getStoredString(LAST_DS_STORAGE)).toBe('tailwind');
  });
});

// ── createRunSession body merging ────────────────────────────────────────────

describe('createRunSession merges generation settings', () => {
  beforeEach(() => {
    localStorage.clear();
    // Default fetch mock — captures requests.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ session_id: 's-1', stream_url: '/api/run-sessions/s-1/stream' }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards max_tokens=4096 from localStorage to the POST body', async () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '4096');
    await createRunSession({ goal: 'demo' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const args = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const init = args[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ goal: 'demo', max_tokens: 4096 });
  });

  it('forwards temperature when stored', async () => {
    localStorage.setItem(TEMPERATURE_STORAGE, '0.3');
    await createRunSession({ goal: 'demo' });
    const args = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((args[1] as RequestInit).body as string);
    expect(body.temperature).toBe(0.3);
  });

  it('omits max_tokens when stored value is invalid', async () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '999'); // below min
    await createRunSession({ goal: 'demo' });
    const args = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((args[1] as RequestInit).body as string);
    expect(body.max_tokens).toBeUndefined();
  });

  it('caller-supplied fields win over localStorage', async () => {
    localStorage.setItem(MAX_TOKENS_STORAGE, '2048');
    await createRunSession({ goal: 'demo', max_tokens: 8192 });
    const args = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((args[1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(8192);
  });
});

// ── Component rendering (with i18n provider) ─────────────────────────────────

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>);
}

describe('<GenerationSettings />', () => {
  beforeEach(() => {
    localStorage.clear();
    // Stub fetch for /api/skills, /api/design-systems, /api/settings/generation-overrides
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/skills')) {
        return {
          ok: true,
          json: async () => [
            { skill_id: 'agent-team-blueprint', name: 'Agent Team', description: '', mode: 'blueprint', preview_type: 'yaml' },
            { skill_id: 'web-prototype', name: 'Web Prototype', description: '', mode: 'prototype', preview_type: 'html' },
          ],
        } as Response;
      }
      if (u.endsWith('/api/design-systems')) {
        return {
          ok: true,
          json: async () => [
            { ds_id: 'none', name: 'None', description: '', compatible_skills: [] },
            { ds_id: 'tailwind', name: 'Tailwind', description: '', compatible_skills: ['web-prototype'] },
          ],
        } as Response;
      }
      if (u.endsWith('/api/settings/generation-overrides')) {
        return { ok: true, json: async () => ({ model_locked: false }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all six controls', async () => {
    renderWithI18n(<GenerationSettings />);
    expect(screen.getByTestId('gen-model-select')).toBeInTheDocument();
    expect(screen.getByTestId('gen-max-tokens-range')).toBeInTheDocument();
    expect(screen.getByTestId('gen-temperature-range')).toBeInTheDocument();
    expect(screen.getByTestId('gen-auto-critique')).toBeInTheDocument();
    expect(screen.getByTestId('gen-default-skill')).toBeInTheDocument();
    expect(screen.getByTestId('gen-default-ds')).toBeInTheDocument();
  });

  it('persists max_tokens to localStorage when slider changes', async () => {
    renderWithI18n(<GenerationSettings />);
    const slider = screen.getByTestId('gen-max-tokens-range') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4096' } });
    expect(localStorage.getItem(MAX_TOKENS_STORAGE)).toBe('4096');
  });

  it('persists temperature when slider changes', async () => {
    renderWithI18n(<GenerationSettings />);
    const slider = screen.getByTestId('gen-temperature-range') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.3' } });
    // step is 0.1 — value normalised to '0.3'
    expect(parseFloat(localStorage.getItem(TEMPERATURE_STORAGE) ?? 'NaN')).toBeCloseTo(0.3, 1);
  });

  it('persists auto-critique toggle', async () => {
    renderWithI18n(<GenerationSettings />);
    const toggle = screen.getByTestId('gen-auto-critique');
    expect(toggle.getAttribute('aria-checked')).toBe('true'); // default ON
    fireEvent.click(toggle);
    expect(localStorage.getItem(AUTO_CRITIQUE_STORAGE)).toBe('0');
  });

  it('persists default skill and DS selections', async () => {
    renderWithI18n(<GenerationSettings />);
    await waitFor(() => {
      // Wait for fetched options to load.
      const skill = screen.getByTestId('gen-default-skill') as HTMLSelectElement;
      expect(skill.options.length).toBeGreaterThan(0);
    });
    const skill = screen.getByTestId('gen-default-skill') as HTMLSelectElement;
    fireEvent.change(skill, { target: { value: 'web-prototype' } });
    expect(localStorage.getItem(LAST_SKILL_STORAGE)).toBe('web-prototype');

    const ds = screen.getByTestId('gen-default-ds') as HTMLSelectElement;
    fireEvent.change(ds, { target: { value: 'tailwind' } });
    expect(localStorage.getItem(LAST_DS_STORAGE)).toBe('tailwind');
  });

  it('shows the "locked by env" hint and disables Model select when overrides.model_locked', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/api/settings/generation-overrides')) {
        return {
          ok: true,
          json: async () => ({ model_locked: true, model_value: 'claude-haiku-4-5' }),
        } as Response;
      }
      if (u.endsWith('/api/skills')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (u.endsWith('/api/design-systems')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    renderWithI18n(<GenerationSettings />);
    await waitFor(() => {
      expect(screen.queryByTestId('gen-model-locked')).not.toBeNull();
    });
    const model = screen.getByTestId('gen-model-select') as HTMLSelectElement;
    expect(model.disabled).toBe(true);
    expect(model.value).toBe('claude-haiku-4-5');
  });
});

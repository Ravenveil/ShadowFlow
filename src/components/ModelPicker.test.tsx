/**
 * ModelPicker — regression test for the "dropdown can't show" bug (2026-05-30).
 *
 * The dropdown used to be `position:absolute` inside the picker wrapper, so an
 * ancestor with `overflow:hidden` (chat composer `.compShell`) clipped it and
 * the model menu never appeared. Fix: render the dropdown via a portal to
 * <body> with `position:fixed`. This test pins that the open dropdown lives
 * directly under document.body (escaping any clipping ancestor).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rawRender, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../common/i18n';
import ModelPicker from './ModelPicker';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelPicker dropdown', () => {
  it('renders the open dropdown as a portal child of document.body', async () => {
    // Picker prewarms via fetch on mount; return empty so it renders the
    // empty-state hints (we only care about WHERE the dropdown mounts).
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    ));

    render(
      <ModelPicker
        value={{ executor: 'byok:zhipu', model: 'glm-5.1' }}
        onChange={() => {}}
        variant="compact"
      />,
    );

    // Closed → no portal node yet.
    expect(document.querySelector('[data-model-picker-pop]')).toBeNull();

    // Native .click() — fireEvent.click's synthetic event is flaky on this
    // button in jsdom (see reference_fireevent_click_flaky_jsdom).
    (screen.getByRole('button') as HTMLButtonElement).click();

    const pop = await waitFor(() => {
      const el = document.querySelector('[data-model-picker-pop]');
      expect(el).not.toBeNull();
      return el!;
    });
    // The whole point of the fix: it's portaled straight under <body>, so no
    // ancestor overflow:hidden can clip it.
    expect(pop.parentElement).toBe(document.body);
  });
});

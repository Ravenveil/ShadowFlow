/**
 * Tests for DesignSystemPicker (Story 15.5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, act } from '../test/utils';
import { DesignSystemPicker } from './DesignSystemPicker';
import { LOCAL_DS, type DesignSystemInfo } from '../api/designSystems';

const REMOTE_DS: DesignSystemInfo[] = [
  {
    ds_id: 'none',
    name: '无约束',
    description: '让 Claude 自由发挥样式风格',
    compatible_skills: ['web-prototype', 'report', 'agent-team-blueprint'],
  },
  {
    ds_id: 'tailwind',
    name: 'Tailwind CSS',
    description: 'Utility-first',
    compatible_skills: ['web-prototype'],
  },
  {
    ds_id: 'material',
    name: 'Material Design 3',
    description: 'M3 baseline',
    compatible_skills: ['web-prototype'],
  },
  {
    ds_id: 'shadcn',
    name: 'shadcn/ui 风格',
    description: 'Vercel/Linear style',
    compatible_skills: ['web-prototype'],
  },
];

const originalFetch = global.fetch;

describe('DesignSystemPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the loading skeleton on first paint', () => {
    global.fetch = vi.fn(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    ) as unknown as typeof fetch;

    render(
      <DesignSystemPicker
        value="tailwind"
        onChange={() => {}}
        skillId="web-prototype"
      />,
    );

    expect(
      screen.getByTestId('design-system-picker-loading'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('design-system-picker'),
    ).not.toBeInTheDocument();
  });

  it('renders all 4 DS options for web-prototype skill and marks selected', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => REMOTE_DS,
    })) as unknown as typeof fetch;

    render(
      <DesignSystemPicker
        value="tailwind"
        onChange={() => {}}
        skillId="web-prototype"
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() =>
      expect(screen.getByTestId('design-system-picker')).toBeInTheDocument(),
    );

    // All 4 options visible for web-prototype
    expect(screen.getByTestId('ds-option-none')).toBeInTheDocument();
    expect(screen.getByTestId('ds-option-tailwind')).toBeInTheDocument();
    expect(screen.getByTestId('ds-option-material')).toBeInTheDocument();
    expect(screen.getByTestId('ds-option-shadcn')).toBeInTheDocument();

    expect(screen.getByTestId('ds-option-tailwind')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('ds-option-material')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('hides incompatible DS for report skill (only "none" stays)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => REMOTE_DS,
    })) as unknown as typeof fetch;

    const { container } = render(
      <DesignSystemPicker
        value="none"
        onChange={() => {}}
        skillId="report"
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() =>
      expect(screen.getByTestId('design-system-picker')).toBeInTheDocument(),
    );

    // Only 'none' should be visible
    expect(screen.getByTestId('ds-option-none')).toBeInTheDocument();
    expect(screen.queryByTestId('ds-option-tailwind')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ds-option-material')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ds-option-shadcn')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="ds-option-"]').length).toBe(1);
  });

  it('falls back to LOCAL_DS when /api/design-systems fails', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    render(
      <DesignSystemPicker
        value="tailwind"
        onChange={() => {}}
        skillId="web-prototype"
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() =>
      expect(screen.getByTestId('design-system-picker')).toBeInTheDocument(),
    );

    for (const ds of LOCAL_DS.filter((d) =>
      d.compatible_skills.includes('web-prototype'),
    )) {
      expect(
        screen.getByTestId(`ds-option-${ds.ds_id}`),
      ).toBeInTheDocument();
    }
  });

  it('calls onChange with the clicked ds_id', async () => {
    vi.useRealTimers(); // userEvent needs real timers
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => REMOTE_DS,
    })) as unknown as typeof fetch;

    const onChange = vi.fn();
    render(
      <DesignSystemPicker
        value="tailwind"
        onChange={onChange}
        skillId="web-prototype"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('design-system-picker')).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('ds-option-material'));
    expect(onChange).toHaveBeenCalledWith('material');

    await user.click(screen.getByTestId('ds-option-none'));
    expect(onChange).toHaveBeenCalledWith('none');
  });
});

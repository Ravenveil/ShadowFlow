/**
 * Tests for SkillPicker (Story 15.4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, act } from '../test/utils';
import { SkillPicker } from './SkillPicker';
import { LOCAL_SKILLS, type SkillInfo } from '../api/skills';

const REMOTE_SKILLS: SkillInfo[] = [
  {
    skill_id: 'agent-team-blueprint',
    name: 'Agent Team Blueprint',
    description: 'Remote desc 1',
    mode: 'blueprint',
    preview_type: 'yaml',
  },
  {
    skill_id: 'web-prototype',
    name: '网页原型',
    description: 'Remote desc 2',
    mode: 'prototype',
    preview_type: 'html',
  },
  {
    skill_id: 'report',
    name: '研究报告',
    description: 'Remote desc 3',
    mode: 'report',
    preview_type: 'markdown',
  },
];

const originalFetch = global.fetch;

describe('SkillPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the loading skeleton on first paint', () => {
    // Pending fetch — never resolves before assertions
    global.fetch = vi.fn(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    ) as unknown as typeof fetch;

    render(
      <SkillPicker value="agent-team-blueprint" onChange={() => {}} />,
    );

    expect(screen.getByTestId('skill-picker-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('skill-picker')).not.toBeInTheDocument();
  });

  it('renders skill cards from /api/skills and marks the selected one', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => REMOTE_SKILLS,
    })) as unknown as typeof fetch;

    render(
      <SkillPicker value="web-prototype" onChange={() => {}} />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() =>
      expect(screen.getByTestId('skill-picker')).toBeInTheDocument(),
    );

    const selected = screen.getByTestId('skill-card-web-prototype');
    expect(selected).toHaveAttribute('aria-pressed', 'true');

    const other = screen.getByTestId('skill-card-agent-team-blueprint');
    expect(other).toHaveAttribute('aria-pressed', 'false');

    // All three skills rendered
    expect(screen.getByText('Agent Team Blueprint')).toBeInTheDocument();
    expect(screen.getByText('网页原型')).toBeInTheDocument();
    expect(screen.getByText('研究报告')).toBeInTheDocument();
  });

  it('falls back to LOCAL_SKILLS when /api/skills fails', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    render(
      <SkillPicker value="agent-team-blueprint" onChange={() => {}} />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitFor(() =>
      expect(screen.getByTestId('skill-picker')).toBeInTheDocument(),
    );

    for (const skill of LOCAL_SKILLS) {
      expect(
        screen.getByTestId(`skill-card-${skill.skill_id}`),
      ).toBeInTheDocument();
    }
  });

  it('calls onChange with the clicked skill id', async () => {
    vi.useRealTimers(); // userEvent needs real timers
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => REMOTE_SKILLS,
    })) as unknown as typeof fetch;

    const onChange = vi.fn();
    render(
      <SkillPicker value="agent-team-blueprint" onChange={onChange} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('skill-picker')).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('skill-card-report'));

    expect(onChange).toHaveBeenCalledWith('report');
  });
});

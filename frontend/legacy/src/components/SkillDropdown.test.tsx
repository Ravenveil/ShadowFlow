/**
 * SkillDropdown.test.tsx — render + compile-status fetch wiring.
 *
 * Mocks `fetch` so the dropdown can be exercised without the server
 * running. Verifies:
 *   - hides when no `@` token in composer
 *   - shows filtered rows for `@bma`
 *   - renders "已编译 · team · 6 agents" when status payload is compiled+team
 *   - renders "编译中..." for `compiling` status
 *   - renders "降级运行" for `failed` status
 *   - hides on empty installed list
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SkillDropdown } from './SkillDropdown';
import type { InstalledSkill } from '../api/skillIngest';

const INSTALLED: InstalledSkill[] = [
  {
    id: 'bmad-method',
    name: 'BMAD-METHOD',
    source: 'https://github.com/bmadcode/BMAD-METHOD',
    source_hash: 'abc',
    installed_at: '2026-05-26T00:00:00Z',
    counts: { agents: 6, edges: 5 },
  },
  {
    id: 'paper-review',
    name: 'Paper Review',
    source: 'local',
    source_hash: 'def',
    installed_at: '2026-05-26T00:00:00Z',
    counts: { agents: 1 },
  },
];

function mockFetchStatus(
  payloadFor: (id: string) =>
    | {
        status: 'compiled' | 'compiling' | 'failed' | 'no_cache';
        compiled?: Record<string, unknown>;
        estimated_cost_usd?: number;
      }
    | null,
) {
  // @ts-expect-error — overriding global fetch for the suite.
  globalThis.fetch = vi.fn(async (url: string) => {
    const m = url.match(/\/api\/skills\/([^/]+)\/compile-status/);
    if (!m) return { ok: false, json: async () => ({}) };
    const id = decodeURIComponent(m[1]);
    const payload = payloadFor(id);
    if (!payload) return { ok: false, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        skill_id: id,
        estimated_cost_usd: 0,
        ...payload,
      }),
    };
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SkillDropdown', () => {
  it('renders nothing when composer has no @ token', () => {
    mockFetchStatus(() => null);
    const { container } = render(
      <SkillDropdown composerText="just some text" installedSkills={INSTALLED} />,
    );
    expect(container.querySelector('[data-testid="skill-dropdown"]')).toBeNull();
  });

  it('renders nothing when installedSkills is null (still loading)', () => {
    mockFetchStatus(() => null);
    const { container } = render(
      <SkillDropdown composerText="@bma" installedSkills={null} />,
    );
    expect(container.querySelector('[data-testid="skill-dropdown"]')).toBeNull();
  });

  it('shows filtered rows matching @bma', async () => {
    mockFetchStatus(() => ({ status: 'no_cache', estimated_cost_usd: 0 }));
    render(<SkillDropdown composerText="@bma" installedSkills={INSTALLED} />);
    await waitFor(() => {
      expect(screen.getByText('bmad-method')).toBeInTheDocument();
    });
    expect(screen.queryByText('paper-review')).toBeNull();
  });

  it('renders compiled team badge with counts', async () => {
    mockFetchStatus(() => ({
      status: 'compiled',
      compiled: {
        mode: 'team',
        members_count: 6,
        edges_count: 5,
        compiled_at: '2026-05-26T00:00:00Z',
        model: 'anthropic:claude-sonnet-4',
      },
      estimated_cost_usd: 0.12,
    }));
    render(<SkillDropdown composerText="@bma" installedSkills={INSTALLED} />);
    await waitFor(() => {
      expect(screen.getByText(/已编译/)).toBeInTheDocument();
    });
    expect(screen.getByText(/team · 6 agents · 5 edges/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
  });

  it('renders compiling spinner state', async () => {
    mockFetchStatus(() => ({ status: 'compiling', estimated_cost_usd: 0 }));
    render(<SkillDropdown composerText="@bma" installedSkills={INSTALLED} />);
    await waitFor(() => {
      expect(screen.getByText(/编译中/)).toBeInTheDocument();
    });
  });

  it('renders failed (fallback) badge', async () => {
    mockFetchStatus(() => ({
      status: 'failed',
      compiled: {
        mode: 'team',
        members_count: 2,
        edges_count: 1,
        compiled_at: '2026-05-26T00:00:00Z',
        model: 'fallback',
        derived_from: 'fallback',
      },
      estimated_cost_usd: 0,
    }));
    render(<SkillDropdown composerText="@bma" installedSkills={INSTALLED} />);
    await waitFor(() => {
      expect(screen.getByText(/降级运行/)).toBeInTheDocument();
    });
  });

  it('hides when installedSkills empty', () => {
    mockFetchStatus(() => null);
    const { container } = render(
      <SkillDropdown composerText="@bma" installedSkills={[]} />,
    );
    expect(container.querySelector('[data-testid="skill-dropdown"]')).toBeNull();
  });
});

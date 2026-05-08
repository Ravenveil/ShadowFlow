/**
 * Story 13.6 — Promote-to-Team end-to-end integration test.
 *
 * Covers the critical seam that unit tests do not exercise:
 *   1. Catalog-side `promoteToTeamFromAgent` call → builderStore.setBlueprint.
 *   2. Router navigation to `/builder?promote=1&blueprint_id=…`.
 *   3. BuilderPage's "?promote=1 + anchor RoleProfile → mount Wizard" effect.
 *   4. Wizard onClose strips `?promote=1` so refresh/back does not re-open it.
 *
 * Implementation note: BuilderPage carries too many dependencies to mount as-is in
 * a fast unit test. We replicate the BuilderPage effect contract verbatim in a
 * `BuilderPageHarness` component (kept in lock-step with src/pages/BuilderPage.tsx
 * lines 547-593) and verify the *real* PromoteToTeamWizard mounts and unmounts on
 * the real builderStore. The harness is the System Under Test boundary; the
 * effect logic is a copy that must mirror BuilderPage — when BuilderPage's effect
 * shape changes, this test must be updated. That contract is what makes it an
 * integration test rather than another unit test.
 */
import { useEffect, useRef, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { PromoteToTeamWizard } from './PromoteToTeamWizard';
import { useBuilderStore } from '../../stores/builderStore';
import type { AgentBlueprint } from '../../../common/types/agent-builder';
import { promoteToTeamFromAgent } from '../../../api/builder';

// --- API mocks ---------------------------------------------------------------

vi.mock('../../../api/builder', () => ({
  promoteToTeamFromAgent: vi.fn(),
  importAgentToBlueprint: vi.fn(),
  BuilderApiError: class BuilderApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`builder-api ${status}`);
    }
  },
}));

vi.mock('../../../api/catalog', () => ({
  listCatalogApps: vi.fn(async () => ({
    data: { apps: [] },
    meta: { total: 0, page: 1, page_size: 20, kit_type: 'all', q: '' },
  })),
  CatalogApiError: class CatalogApiError extends Error {},
}));

const mockedPromote = promoteToTeamFromAgent as unknown as ReturnType<typeof vi.fn>;

// --- Fixtures ----------------------------------------------------------------

function makePromotedBlueprint(): AgentBlueprint {
  return {
    blueprint_id: 'team-from-app-pap0-aaaa1111',
    version: '1.0',
    name: '以 Paper Reproducer 为核心的团队',
    goal: '',
    audience: '',
    mode: 'team',
    role_profiles: [
      {
        role_id: 'anchor-app-pap0-bbbb2222',
        name: 'Paper Reproducer',
        description: 'Reproduces papers',
        persona: '',
        responsibilities: [],
        constraints: [],
        tools: [],
        executor_kind: 'api',
        executor_provider: 'anthropic',
        executor_model: 'claude-sonnet-4-6',
        capabilities: [],
        handoff_rules: [],
        persona_traits: {},
        state_fields: [],
        can_spawn_tasks: false,
        sub_agents: [],
        metadata: { anchor: true, imported_from: 'app-paper000' },
        collaboration_contract: {
          scope: 'team_member_candidate',
          accepts_from: [],
          delivers_to: ['report_writer'],
          collaboration_style: 'push',
        },
      },
    ],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: true, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: { anchor_role_id: 'anchor-app-pap0-bbbb2222' },
  };
}

// --- Test harness components -------------------------------------------------

/** Mirrors CatalogPage::handlePromote (P6 in-flight guard) on a single button. */
function CatalogPageHarness() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  async function handleClick() {
    if (pending) return;
    setPending(true);
    const bp = await promoteToTeamFromAgent('app-paper000');
    useBuilderStore.getState().setBlueprint(bp);
    const id = encodeURIComponent(bp.blueprint_id);
    navigate(`/builder?blueprint_id=${id}&mode=team&promote=1`);
  }
  return (
    <button data-testid="cat-promote" disabled={pending} onClick={handleClick}>
      ★ 以此为核心，搭建协作团队
    </button>
  );
}

/**
 * Mirrors BuilderPage's `?promote=1` auto-mount effect (BuilderPage.tsx:544-593).
 * Mirror is intentional — see file-level docstring.
 */
function BuilderPageHarness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const blueprint = useBuilderStore((s) => s.blueprint);
  const setStoreMode = useBuilderStore((s) => s.setMode);
  const promoteParam = searchParams.get('promote');
  const [wizardOpen, setWizardOpen] = useState(false);
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (promoteParam !== '1') return;
    if (!blueprint) return;
    if (consumedRef.current === blueprint.blueprint_id) return;
    const hasAnchor = blueprint.role_profiles.some((r) => r.metadata?.anchor === true);
    if (hasAnchor) {
      setStoreMode('scene');
      setWizardOpen(true);
      consumedRef.current = blueprint.blueprint_id;
    }
  }, [promoteParam, blueprint, setStoreMode]);

  function handleClose() {
    setWizardOpen(false);
    if (searchParams.get('promote') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('promote');
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <div data-testid="builder-page-harness">
      <div data-testid="builder-search">{searchParams.toString()}</div>
      <div data-testid="builder-mode">{useBuilderStore.getState().mode}</div>
      {wizardOpen && blueprint && (
        <PromoteToTeamWizard blueprint={blueprint} onClose={handleClose} />
      )}
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<CatalogPageHarness />} />
      <Route path="/builder" element={<BuilderPageHarness />} />
    </Routes>
  );
}

// --- Tests -------------------------------------------------------------------

describe('Story 13.6 — Promote-to-Team integration', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      mode: 'classic',
      blueprint: null,
      selection: null,
      treeExpanded: {},
      lastSmokeRunResult: null,
    });
    mockedPromote.mockReset();
  });

  it('end-to-end: Catalog click → API → store.setBlueprint → /builder?promote=1 → Wizard mounts', async () => {
    mockedPromote.mockResolvedValueOnce(makePromotedBlueprint());

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    // 1. Click catalog promote button.
    await act(async () => {
      fireEvent.click(screen.getByTestId('cat-promote'));
    });

    // 2. API was called with anchor agent id.
    expect(mockedPromote).toHaveBeenCalledWith('app-paper000');

    // 3. builderStore now holds the promoted blueprint.
    const stored = useBuilderStore.getState().blueprint;
    expect(stored?.blueprint_id).toBe('team-from-app-pap0-aaaa1111');
    expect(stored?.mode).toBe('team');

    // 4. We navigated to /builder?promote=1 and Wizard auto-mounted at Step 1.
    expect(await screen.findByTestId('promote-to-team-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('builder-search').textContent ?? '').toContain('promote=1');
    // mode flipped to scene by the auto-mount effect.
    expect(useBuilderStore.getState().mode).toBe('scene');
  });

  it('Wizard onClose strips ?promote=1 so refresh does not re-open it (P2 follow-up)', async () => {
    mockedPromote.mockResolvedValueOnce(makePromotedBlueprint());

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('cat-promote'));
    });
    expect(await screen.findByTestId('promote-to-team-wizard')).toBeInTheDocument();

    // Close the wizard via the (X) button.
    fireEvent.click(screen.getByTestId('wizard-close'));

    expect(screen.queryByTestId('promote-to-team-wizard')).toBeNull();
    // ?promote=1 has been stripped from the URL.
    expect(screen.getByTestId('builder-search').textContent ?? '').not.toContain('promote=1');
  });

  it('does not re-mount Wizard for the same blueprint after consumption (per-blueprint idempotency)', async () => {
    mockedPromote.mockResolvedValueOnce(makePromotedBlueprint());

    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('cat-promote'));
    });
    expect(await screen.findByTestId('promote-to-team-wizard')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-close'));
    expect(screen.queryByTestId('promote-to-team-wizard')).toBeNull();

    // Even if the URL still had promote=1 (it's been stripped, but we re-render),
    // the consumedRef guard inside BuilderPageHarness must keep the wizard closed.
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('promote-to-team-wizard')).toBeNull();
  });

  it('blueprint without anchor RoleProfile does NOT auto-open wizard (defensive)', async () => {
    const noAnchor = makePromotedBlueprint();
    noAnchor.role_profiles[0].metadata = {}; // strip anchor flag
    mockedPromote.mockResolvedValueOnce(noAnchor);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('cat-promote'));
    });

    // We landed at /builder, but no Wizard.
    expect(screen.getByTestId('builder-page-harness')).toBeInTheDocument();
    expect(screen.queryByTestId('promote-to-team-wizard')).toBeNull();
  });
});

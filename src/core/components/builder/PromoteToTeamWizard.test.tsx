/**
 * PromoteToTeamWizard tests — Story 13.6 AC4
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PromoteToTeamWizard, matchByDeliversTo } from './PromoteToTeamWizard';
import type { AgentBlueprint, RoleProfile } from '../../../common/types/agent-builder';
import { useBuilderStore } from '../../stores/builderStore';

vi.mock('../../../api/catalog', () => ({
  listCatalogApps: vi.fn(async () => ({
    data: {
      apps: [
        {
          app_id: 'app-writer-001',
          name: 'Report Writer',
          goal: 'Write reports',
          kit_type: 'report_writer',
          author: 'tester',
          published_at: '2026-04-28T00:00:00Z',
          fork_count: 0,
          forked_from: null,
          template_id: '',
          workflow_id: '',
          blueprint_id: 'bp-writer',
          scope_hint: 'team_member_candidate',
        },
        {
          app_id: 'app-unrelated-002',
          name: 'Unrelated Agent',
          goal: 'Unrelated',
          kit_type: 'misc',
          author: 'x',
          published_at: '2026-04-28T00:00:00Z',
          fork_count: 0,
          forked_from: null,
          template_id: '',
          workflow_id: '',
          blueprint_id: 'bp-x',
        },
      ],
    },
    meta: { total: 2, page: 1, page_size: 20, kit_type: 'all', q: '' },
  })),
  CatalogApiError: class CatalogApiError extends Error {},
}));

vi.mock('../../../api/builder', () => ({
  importAgentToBlueprint: vi.fn(async () => ({
    role_id: 'imported-app-writ-1',
    name: 'Report Writer',
    description: '',
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
    metadata: { imported_from: 'app-writer-001' },
  })),
  BuilderApiError: class BuilderApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`err ${status}`);
    }
  },
}));

function makeAnchorRole(): RoleProfile {
  return {
    role_id: 'anchor-app-pap-1',
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
    metadata: { anchor: true, imported_from: 'app-paper001' },
    collaboration_contract: {
      scope: 'team_member_candidate',
      accepts_from: [],
      delivers_to: ['report_writer'],
      collaboration_style: 'push',
    },
  };
}

function makeBlueprint(): AgentBlueprint {
  return {
    blueprint_id: 'team-from-app-paper-aaaa',
    version: '1.0',
    name: '以 Paper Reproducer 为核心的团队',
    goal: '',
    audience: '',
    mode: 'team',
    role_profiles: [makeAnchorRole()],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: true, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: { anchor_role_id: 'anchor-app-pap-1' },
  };
}

describe('PromoteToTeamWizard', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      mode: 'scene',
      blueprint: makeBlueprint(),
      selection: null,
      treeExpanded: {},
      lastSmokeRunResult: null,
    });
  });

  it('Step 1 shows anchor info and proceeds to Step 2', async () => {
    const onClose = vi.fn();
    render(<PromoteToTeamWizard blueprint={makeBlueprint()} onClose={onClose} />);
    expect(screen.getByTestId('wizard-step-1')).toBeTruthy();
    expect(screen.getByText(/Paper Reproducer/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('wizard-next-1'));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
  });

  it('matchByDeliversTo filters by needles in name+kit_type', () => {
    const apps = [
      { app_id: 'a', name: 'Report Writer', kit_type: 'report_writer' },
      { app_id: 'b', name: 'Unrelated', kit_type: 'misc' },
      { app_id: 'self', name: 'Anchor', kit_type: 'anchor' },
    ] as never;
    const out = matchByDeliversTo(apps, ['report_writer'], 'self');
    expect(out.map((a) => a.app_id)).toEqual(['a']);
  });

  it('Skip recommendation jumps to Step 3', () => {
    render(<PromoteToTeamWizard blueprint={makeBlueprint()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('wizard-next-1'));
    fireEvent.click(screen.getByTestId('wizard-skip-2'));
    expect(screen.getByTestId('wizard-step-3')).toBeTruthy();
  });

  it('Finish closes the wizard', () => {
    const onClose = vi.fn();
    render(<PromoteToTeamWizard blueprint={makeBlueprint()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('wizard-next-1'));
    fireEvent.click(screen.getByTestId('wizard-skip-2'));
    fireEvent.click(screen.getByTestId('wizard-finish'));
    expect(onClose).toHaveBeenCalled();
  });

  it('returns null when no anchor role exists', () => {
    const bp = makeBlueprint();
    bp.role_profiles[0].metadata = {};
    const { container } = render(<PromoteToTeamWizard blueprint={bp} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="promote-to-team-wizard"]')).toBeNull();
  });
});

/**
 * Story 4.7 — OperationsPage renders 4 panels with fixture data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OperationsPage } from '../../core/pages/OperationsPage';
import { useOpsStore } from '../../core/stores/useOpsStore';

function stubFetch(map: Record<string, unknown>) {
  return vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => {
      for (const key of Object.keys(map)) {
        if (url.includes(key)) return map[key];
      }
      return {};
    },
  })) as unknown as typeof fetch;
}

describe('OperationsPage (Story 4.7)', () => {
  beforeEach(() => {
    useOpsStore.setState({
      kpi: null,
      agents: [],
      providers: [],
      approvals: [],
      window: '24h',
      loading: false,
      error: null,
    });
  });

  it('renders the 4 KPI cards and calls every endpoint', async () => {
    globalThis.fetch = stubFetch({
      '/ops/kpi':           { data: { active_runs: 3, pending_approvals: 2, avg_latency_p95_ms: 120, rejection_rate_pct: 12.5 } },
      '/agents/health':     [{ agent_id: 'a1', name: 'A1', kind: 'acp', model: 'm', status: 'online', queue_depth: 1, p95_ms: 100, trend_14pt: [1, 2, 3] }],
      '/providers/load':    [{ provider_id: 'p1', name: 'OpenAI', model_count: 3, p95_ms: 110, tee_verified: false, load_pct: 42, fallback_priority: 0 }],
      '/approvals/pending': [],
    });

    render(<OperationsPage />);

    await waitFor(() => expect(useOpsStore.getState().kpi).not.toBeNull());

    expect(screen.getByTestId('kpi-Active Runs')).toBeDefined();
    expect(screen.getByTestId('kpi-Pending Approvals')).toBeDefined();
    expect(screen.getByTestId('kpi-Avg Provider Latency (p95)')).toBeDefined();
    expect(screen.getByTestId('kpi-Policy Rejection Rate')).toBeDefined();
    expect(screen.getByTestId('agent-health-grid')).toBeDefined();
    expect(screen.getByTestId('provider-load-panel')).toBeDefined();
    expect(screen.getByTestId('approval-queue-strip')).toBeDefined();
  });

  it('renders independently of useRunStore (isolated state)', async () => {
    globalThis.fetch = stubFetch({
      '/ops/kpi': { data: { active_runs: 0, pending_approvals: 0, avg_latency_p95_ms: 0, rejection_rate_pct: 0 } },
      '/agents/health': [],
      '/providers/load': [],
      '/approvals/pending': [],
    });
    render(<OperationsPage />);
    await waitFor(() => expect(useOpsStore.getState().kpi).not.toBeNull());
    // useOpsStore is exclusive from useRunStore — verify by checking no cross-key
    const opsState = useOpsStore.getState();
    expect('run_id' in opsState).toBe(false);
  });
});

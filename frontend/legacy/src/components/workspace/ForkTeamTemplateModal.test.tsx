/**
 * ForkTeamTemplateModal — T04 模板 fork 入口测试。
 *
 * 覆盖：
 *   - 只列出 mode=="team" 的模板（single 应用被过滤）
 *   - 点「Fork 并创建」→ POST /api/catalog/apps/{id}/fork → onCreated(team)
 *   - fork 失败 → 模态内错误条，不吞不假成功
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rawRender, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../common/i18n';
import { ForkTeamTemplateModal } from './ForkTeamTemplateModal';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

const TEAM_APP = {
  app_id: 'app-t04-hydrogen-team',
  name: '氢能获客 Agent 团队（T04）',
  goal: '6 角色 DAG 协作',
  kit_type: 'custom',
  author: 'ShadowFlow 模板库',
  published_at: '2026-08-22T00:00:00Z',
  fork_count: 0,
  mode: 'team',
};

const SINGLE_APP = { ...TEAM_APP, app_id: 'app-solo', name: 'solo', mode: 'single' };

const FORKED_TEAM = {
  team_id: 'team-abc123',
  name: TEAM_APP.name,
  description: '',
  workspace_id: 'default',
  agent_ids: ['agent-1', 'agent-2'],
  created_at: '2026-08-22T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z',
};

function stubFetchSequence(...steps: Array<Record<string, unknown>>) {
  const fetchMock = vi.fn();
  for (const s of steps) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(s),
    } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ForkTeamTemplateModal', () => {
  it('只列出 mode=="team" 的团队模板', async () => {
    stubFetchSequence({ data: { apps: [TEAM_APP, SINGLE_APP] }, meta: {} });
    render(<ForkTeamTemplateModal workspaceId={null} onClose={() => {}} onCreated={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('fork-template-card-app-t04-hydrogen-team')).toBeTruthy();
    });
    expect(screen.queryByTestId('fork-template-card-app-solo')).toBeNull();
  });

  it('fork 成功 → onCreated 收到落库的 team 记录', async () => {
    const fetchMock = stubFetchSequence(
      { data: { apps: [TEAM_APP] }, meta: {} },
      {
        data: {
          blueprint_id: 'bp-new',
          forked_from: TEAM_APP.app_id,
          agents: [{ agent_id: 'agent-1', name: 'Planner · 任务拆解' }],
          team: FORKED_TEAM,
        },
        meta: {},
      },
    );
    const onCreated = vi.fn();
    render(<ForkTeamTemplateModal workspaceId="ws-x" onClose={() => {}} onCreated={onCreated} />);

    const btn = await waitFor(() => screen.getByTestId('fork-template-run-app-t04-hydrogen-team'));
    (btn as HTMLButtonElement).click();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(FORKED_TEAM));
    // fork 请求把当前 workspace 带给后端
    const forkCall = fetchMock.mock.calls[1];
    expect(String(forkCall[0])).toContain('/api/catalog/apps/app-t04-hydrogen-team/fork');
    expect(JSON.parse(String(forkCall[1]?.body))).toEqual({ workspace_id: 'ws-x' });
  });

  it('fork 失败 → 展示真实错误，不调用 onCreated', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { apps: [TEAM_APP] }, meta: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          error: { code: 'CATALOG_BLUEPRINT_INVALID', message: 'snapshot broken' },
        })),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    render(<ForkTeamTemplateModal workspaceId={null} onClose={() => {}} onCreated={onCreated} />);

    const btn = await waitFor(() => screen.getByTestId('fork-template-run-app-t04-hydrogen-team'));
    (btn as HTMLButtonElement).click();

    await waitFor(() => {
      expect(screen.getByTestId('fork-template-error').textContent).toContain('snapshot broken');
    });
    expect(onCreated).not.toHaveBeenCalled();
  });
});

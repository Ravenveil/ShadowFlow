/**
 * NeoAgentSoul 暂停/恢复切换测试（2026-08-23 管理面闭环）。
 * 覆盖：头部状态行 + 切换钮常驻；idle → 点暂停调 pauseAgent 并以返回 record
 * 刷新状态显示；paused → 点恢复调 resumeAgent；切换失败 → 红条不吞错。
 * 统一保存（2026-11-04 用户反馈）：无独立「保存头像」钮；改头像/Claw 绑定
 * 后底部「保存」一次 PATCH 全带上。
 * 2026-11-04：组件接入 useNavigate（删除员工后回 home）→ 渲染需包 Router。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const AGENT = vi.hoisted(() => ({
  agent_id: 'a1',
  name: '设计助手',
  soul: '你是设计助手',
  workspace_id: 'ws1',
  blueprint: {},
  status: 'idle',
  source: 'quick_hire',
  created_at: '',
}));

vi.mock('../../api/agents', () => {
  // 工厂内定义（vi.mock 提升，顶层 class 不可引用）
  class AgentApiError extends Error {
    constructor(
      public status: number,
      public detail: unknown,
      public code: string = '',
    ) {
      super(`Agent API error ${status}`);
    }
  }
  return {
    AgentApiError,
    getAgent: vi.fn(),
    patchAgent: vi.fn(),
    pauseAgent: vi.fn(),
    resumeAgent: vi.fn(),
    deleteAgent: vi.fn(),
  };
});

import { getAgent, patchAgent, pauseAgent, resumeAgent } from '../../api/agents';
import { NeoAgentSoul } from '../NeoAgentSoul';

/** 组件内 useNavigate 需要 Router 上下文（删除员工成功后回 home）。 */
function renderSoul() {
  return render(
    <MemoryRouter>
      <NeoAgentSoul agentId="a1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (getAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT });
  (pauseAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT, status: 'paused' });
  (resumeAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT, status: 'idle' });
});

describe('NeoAgentSoul — 暂停/恢复状态切换', () => {
  it('加载后头部显示当前状态 + 切换钮（idle → 暂停）', async () => {
    renderSoul();
    expect(await screen.findByTestId('neo-soul-status')).toHaveTextContent('idle');
    fireEvent.click(screen.getByTestId('neo-soul-status-toggle'));
    await waitFor(() => expect(pauseAgent).toHaveBeenCalledWith('a1'));
    // 成功以端点返回的 record 刷新状态显示
    await waitFor(() =>
      expect(screen.getByTestId('neo-soul-status')).toHaveTextContent('paused'),
    );
  });

  it('paused 员工 → 切换钮调 resumeAgent，状态回到 idle', async () => {
    (getAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT, status: 'paused' });
    renderSoul();
    expect(await screen.findByTestId('neo-soul-status')).toHaveTextContent('paused');
    fireEvent.click(screen.getByTestId('neo-soul-status-toggle'));
    await waitFor(() => expect(resumeAgent).toHaveBeenCalledWith('a1'));
    await waitFor(() =>
      expect(screen.getByTestId('neo-soul-status')).toHaveTextContent('idle'),
    );
  });

  it('pauseAgent 失败 → 红条出现，状态不变', async () => {
    (pauseAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('HTTP 500'));
    renderSoul();
    await screen.findByTestId('neo-soul-status-toggle');
    fireEvent.click(screen.getByTestId('neo-soul-status-toggle'));
    expect(await screen.findByTestId('neo-soul-status-error')).toHaveTextContent('HTTP 500');
    expect(screen.getByTestId('neo-soul-status')).toHaveTextContent('idle');
  });
});

describe('NeoAgentSoul — 统一保存（头像/绑定随底部保存提交）', () => {
  it('页面不存在独立「保存头像」钮（2026-11-04 用户反馈）', async () => {
    renderSoul();
    await screen.findByTestId('neo-soul-status');
    expect(screen.queryByTestId('neo-soul-avatar-save')).toBeNull();
    expect(screen.queryByTestId('neo-soul-claw-save')).toBeNull();
  });

  it('只改头像（不动名称/soul）→ 底部保存可用，一次 PATCH 带上 avatar 字段', async () => {
    (patchAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ ...AGENT });
    renderSoul();
    await screen.findByTestId('neo-soul-status');
    // 只动头像：风格网格的任一风格 cell（role=radio，data-testid=claw-style-*）
    const styleCell = screen.getByTestId('claw-style-adventurer');
    fireEvent.click(styleCell);
    const saveBtn = screen.getByTestId('neo-soul-save');
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(patchAgent).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ avatar_style: 'adventurer', avatar_seed: '' }),
      ),
    );
  });
});

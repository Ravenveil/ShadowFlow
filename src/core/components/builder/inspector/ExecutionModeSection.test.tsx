/**
 * ExecutionModeSection — Story 13.2 测试
 *
 * 覆盖：
 *   - 默认显示 ReAct 模式
 *   - 切换到工作流模式：显示工作流选择器
 *   - 选择工作流 → onUpdate 被调用，execution_mode 字段正确
 *   - 解除绑定 → 回到 react 模式
 */
import type * as React from 'react';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ExecutionModeSection } from './ExecutionModeSection';
import type { ExecutionMode } from '../../../../common/types/agent-builder';

// L1 follow-up: ExecutionModeSection now uses <Link>, so tests must wrap in Router.
const render = (ui: React.ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

// ---------------------------------------------------------------------------
// Mock listTemplates
// ---------------------------------------------------------------------------

vi.mock('../../../../api/templates', () => ({
  listTemplates: vi.fn().mockResolvedValue([
    {
      template_id: 'wf-001',
      name: '研究助手工作流',
      description: '规划搜索汇报',
      user_role: 'researcher',
      default_ops_room_name: 'Research Room',
      brief_board_alias: 'research',
      theme_color: '#3b82f6',
      agent_roster_count: 3,
      group_roster_count: 1,
      source: 'seed',
      builder_origin: '',
      workflow_id: 'wf-001',
    },
    {
      template_id: 'wf-002',
      name: '客服工作流',
      description: '客服自动化',
      user_role: 'support',
      default_ops_room_name: 'Support Room',
      brief_board_alias: 'support',
      theme_color: '#10b981',
      agent_roster_count: 2,
      group_roster_count: 1,
      source: 'seed',
      builder_origin: '',
      workflow_id: 'wf-002',
    },
  ]),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionModeSection', () => {
  let onUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it('默认显示 ReAct 模式（无 executionMode prop）', () => {
    render(<ExecutionModeSection onUpdate={onUpdate} />);

    const reactBtn = screen.getByTestId('mode-react-btn');
    const workflowBtn = screen.getByTestId('mode-workflow-btn');

    // ReAct 按钮应含 accent 样式
    expect(reactBtn.className).toContain('bg-sf-accent-tint');
    // 工作流按钮应为非激活样式
    expect(workflowBtn.className).not.toContain('bg-sf-accent-tint');
    // 不应出现解除绑定按钮
    expect(screen.queryByTestId('unbind-workflow-btn')).toBeNull();
  });

  it('executionMode.mode="react" 时 ReAct 按钮激活', () => {
    const em: ExecutionMode = { mode: 'react' };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    expect(screen.getByTestId('mode-react-btn').className).toContain('bg-sf-accent-tint');
    expect(screen.getByTestId('mode-workflow-btn').className).not.toContain('bg-sf-accent-tint');
  });

  it('点击"绑定工作流"后切换到 workflow 模式，onUpdate 被调用', () => {
    render(<ExecutionModeSection onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTestId('mode-workflow-btn'));

    expect(onUpdate).toHaveBeenCalledWith({
      mode: 'workflow',
      workflow_ref: undefined,
      workflow_name: undefined,
    });
  });

  it('workflow 模式且未绑定时，显示工作流选择器', async () => {
    const em: ExecutionMode = { mode: 'workflow' };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    // 工作流选择器应出现
    expect(screen.getByTestId('workflow-ref-select')).toBeDefined();

    // 等待工作流列表加载
    await waitFor(() => {
      expect(screen.getByText('研究助手工作流')).toBeDefined();
    });
  });

  it('选择工作流后 onUpdate 被调用，字段正确', async () => {
    const em: ExecutionMode = { mode: 'workflow' };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('研究助手工作流')).toBeDefined();
    });

    fireEvent.click(screen.getByText('研究助手工作流'));

    expect(onUpdate).toHaveBeenCalledWith({
      mode: 'workflow',
      workflow_ref: 'wf-001',
      workflow_name: '研究助手工作流',
    });
  });

  it('已绑定工作流时显示绑定信息和解除绑定按钮', () => {
    const em: ExecutionMode = {
      mode: 'workflow',
      workflow_ref: 'wf-001',
      workflow_name: '研究助手工作流',
    };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    expect(screen.getByText('研究助手工作流')).toBeDefined();
    expect(screen.getByTestId('unbind-workflow-btn')).toBeDefined();
    // 已绑定时不显示选择器
    expect(screen.queryByTestId('workflow-ref-select')).toBeNull();
  });

  // M2 follow-up: 用 aria-pressed / data-active 替代 className 断言激活态
  it('M2 follow-up: 激活态通过 aria-pressed 暴露（不依赖 Tailwind className）', () => {
    const em: ExecutionMode = { mode: 'workflow', workflow_ref: 'wf-001' };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    const reactBtn = screen.getByTestId('mode-react-btn');
    const workflowBtn = screen.getByTestId('mode-workflow-btn');
    expect(reactBtn.getAttribute('aria-pressed')).toBe('false');
    expect(reactBtn.getAttribute('data-active')).toBe('false');
    expect(workflowBtn.getAttribute('aria-pressed')).toBe('true');
    expect(workflowBtn.getAttribute('data-active')).toBe('true');
  });

  it('L1 follow-up: 前往 Workflow Editor 用 React Router Link（href 不全页跳转）', () => {
    const em: ExecutionMode = { mode: 'workflow' };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    const link = screen.getByTestId('goto-workflow-editor-link');
    // <Link> renders an <a> with role link，确保 to 已传入
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toContain('return_to=builder');
  });

  it('点击"解除绑定"后 onUpdate 被调用，恢复 react 模式', () => {
    const em: ExecutionMode = {
      mode: 'workflow',
      workflow_ref: 'wf-001',
      workflow_name: '研究助手工作流',
    };
    render(<ExecutionModeSection executionMode={em} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTestId('unbind-workflow-btn'));

    expect(onUpdate).toHaveBeenCalledWith({ mode: 'react' });
  });
});

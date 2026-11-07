/**
 * NeoOnboardingModal 组件测试（2026-11-06，ZCode/Codex 式入职问卷）。
 * 覆盖：首屏渲染、chips 多选、下一步/上一步、完成回调拼消息、跳过回调；
 * 生成助理链路健壮性（2026-11-07）：persona/创建防挂死超时降级、失败态
 * 可见（重试创建/先跳过）、命名取「重活」首项、assistantNameFrom 纯函数。
 */
import { render, screen, fireEvent, waitFor, act } from '../../test/utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  NeoOnboardingModal,
  ONBOARDING_DONE_KEY,
  USER_PROFILE_KEY,
  assistantNameFrom,
} from '../NeoOnboardingModal';
import { quickCreateAgent, type AgentRecord } from '../../api/agents';
import { generateAgentPersona } from '../../api/llm';

vi.mock('../../api/agents', () => ({ quickCreateAgent: vi.fn() }));
vi.mock('../../api/llm', () => ({ generateAgentPersona: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(quickCreateAgent).mockReset();
  vi.mocked(generateAgentPersona).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** 连点「下一步」推进到最后一问（完成钮出现为止）。 */
const goLast = () => {
  while (!screen.queryByTestId('neo-onb-finish')) {
    fireEvent.click(screen.getByTestId('neo-onb-next'));
  }
};

/** 前进到第 4 问（最想甩掉的重活）并选中 chips。 */
const pickDelegate = (opts: string[]) => {
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('neo-onb-next'));
  for (const o of opts) fireEvent.click(screen.getByTestId(`neo-onb-chip-${o}`));
};

const okAgent: AgentRecord = { agent_id: 'a1', name: '整理资讯助理' } as AgentRecord;

describe('NeoOnboardingModal', () => {
  it('首屏渲染第一问（怎么称呼你，无预设 chips）', () => {
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={vi.fn()} />);
    expect(screen.getByTestId('neo-onboarding-modal')).toBeInTheDocument();
    expect(screen.getByText('怎么称呼你')).toBeInTheDocument();
    // 第一问已无预设选项（用户反馈：老板/哥/姐删除）
    expect(screen.queryByTestId('neo-onb-chip-老板')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-onb-next')).toBeInTheDocument();
  });

  it('下一步推进 + 上一步回退', () => {
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={vi.fn()} />);
    fireEvent.click(screen.getByTestId('neo-onb-next'));
    expect(screen.getByText('你是做什么的（职业/身份）')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('neo-onb-back'));
    expect(screen.getByText('怎么称呼你')).toBeInTheDocument();
  });

  it('chips 选择 + 输入 + 完成：onFinished 收到拼好的自我介绍', () => {
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    // 直接跳到最后一问（今天想做的事）
    goLast();
    expect(screen.getByText('今天就想让总经理先帮你做成的一件事')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('neo-onb-input-firstTask'), {
      target: { value: '整理行业日报' },
    });
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    expect(onFinished).toHaveBeenCalledTimes(1);
    const msg = onFinished.mock.calls[0][0] as string;
    expect(msg).toContain('（认识一下）');
    expect(msg).toContain('整理行业日报');
    // 标记与画像落盘
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
    const profile = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) ?? '{}');
    expect(profile.answers?.firstTask).toBe('整理行业日报');
  });

  it('全部留空完成：onFinished 收到空串（不发起消息）', () => {
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    goLast();
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    expect(onFinished).toHaveBeenCalledWith('');
  });

  it('右上 × 跳过：onSkipped 触发、无落盘', () => {
    const onSkipped = vi.fn();
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={onSkipped} />);
    fireEvent.click(screen.getByTestId('neo-onboarding-skip'));
    expect(onSkipped).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBeNull();
  });

  it('persona 生成挂死 → 20s 超时降级问卷模板创建（防挂死）', async () => {
    vi.useFakeTimers();
    vi.mocked(generateAgentPersona).mockImplementation(() => new Promise<string>(() => {}));
    vi.mocked(quickCreateAgent).mockResolvedValue(okAgent);
    const onFinished = vi.fn();
    const onAgentCreated = vi.fn();
    render(
      <NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} onAgentCreated={onAgentCreated} />,
    );
    pickDelegate(['整理资讯']);
    goLast();
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    // 20s 内不降级不落库
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000);
    });
    expect(quickCreateAgent).not.toHaveBeenCalled();
    // 超时 → 模板 persona 落库 + 正常收口
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(quickCreateAgent).toHaveBeenCalledTimes(1);
    const req = vi.mocked(quickCreateAgent).mock.calls[0][0];
    expect(req.name).toBe('整理资讯助理');
    expect(req.soul).toContain('主责'); // 问卷直拼模板（非 LLM 输出）
    expect(onAgentCreated).toHaveBeenCalledWith({ agent_id: 'a1', name: '整理资讯助理' });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('创建失败 → 失败态可见 → 重试创建成功收口（persona 不重生成）', async () => {
    vi.mocked(generateAgentPersona).mockResolvedValue('## 角色定位\n测试人设');
    vi.mocked(quickCreateAgent)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(okAgent);
    const onFinished = vi.fn();
    const onAgentCreated = vi.fn();
    render(
      <NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} onAgentCreated={onAgentCreated} />,
    );
    pickDelegate(['整理资讯']);
    goLast();
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    // 失败态：内联错误 + 重试/先跳过，onFinished 未收口
    await waitFor(() => expect(screen.getByTestId('neo-onb-create-fail')).toBeInTheDocument());
    expect(screen.getByTestId('neo-onb-retry-create')).toBeInTheDocument();
    expect(screen.getByTestId('neo-onb-skip-create')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
    // 重试只重跑落库
    fireEvent.click(screen.getByTestId('neo-onb-retry-create'));
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(generateAgentPersona).toHaveBeenCalledTimes(1);
    expect(quickCreateAgent).toHaveBeenCalledTimes(2);
    expect(onAgentCreated).toHaveBeenCalledWith({ agent_id: 'a1', name: '整理资讯助理' });
  });

  it('创建失败 → 先跳过：onFinished 照常收口（画像/自我介绍不受阻）', async () => {
    vi.mocked(generateAgentPersona).mockResolvedValue('人设');
    vi.mocked(quickCreateAgent).mockRejectedValue(new Error('boom'));
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    pickDelegate(['整理资讯']);
    goLast();
    fireEvent.change(screen.getByTestId('neo-onb-input-firstTask'), {
      target: { value: '整理行业日报' },
    });
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    await waitFor(() => expect(screen.getByTestId('neo-onb-create-fail')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('neo-onb-skip-create'));
    expect(onFinished).toHaveBeenCalledTimes(1);
    const msg = onFinished.mock.calls[0][0] as string;
    expect(msg).toContain('（认识一下）');
    expect(msg).toContain('整理行业日报');
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
  });

  it('创建挂死 → 15s 超时进失败态（不再永远卡「正在创建」）', async () => {
    vi.useFakeTimers();
    vi.mocked(generateAgentPersona).mockResolvedValue('人设');
    vi.mocked(quickCreateAgent).mockImplementation(() => new Promise<AgentRecord>(() => {}));
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    pickDelegate(['整理资讯']);
    goLast();
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(screen.queryByTestId('neo-onb-create-fail')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId('neo-onb-create-fail')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('助理命名取「重活」首项（多选拼接不截断出怪名）', async () => {
    vi.mocked(generateAgentPersona).mockResolvedValue('人设');
    vi.mocked(quickCreateAgent).mockResolvedValue({ agent_id: 'a1', name: '' } as AgentRecord);
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    pickDelegate(['整理资讯', '回邮件']);
    goLast();
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(quickCreateAgent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(quickCreateAgent).mock.calls[0][0].name).toBe('整理资讯助理');
  });
});

describe('assistantNameFrom', () => {
  it('多选取首项 / 逗号分隔取首项 / 空兜底 / 超长截 12 字', () => {
    expect(assistantNameFrom('整理资讯、回邮件、做表格')).toBe('整理资讯助理');
    expect(assistantNameFrom('回邮件,做表格')).toBe('回邮件助理');
    expect(assistantNameFrom('')).toBe('专属助理');
    expect(assistantNameFrom('超长重活名称超过十二个字的截断')).toBe('超长重活名称超过十二个字助理');
  });
});

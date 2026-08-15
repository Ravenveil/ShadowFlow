import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '../../test/utils';

const sendMock = vi.fn();
const cancelMock = vi.fn();
const resolveDmMock = vi.fn().mockResolvedValue('dm-g1');

// UI5.0 — jsdom 无 Element.scrollTo;UnifiedChatFeed 滚底会调它,补 noop polyfill
// (此前被 useAuth 崩溃掩盖,未暴露)。
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const defaultMessages = [
  { id: 'm1', role: 'user', content: '你好' },
  { id: 'm2', role: 'agent', content: '收到' },
  { id: 'm3', role: 'system', content: '[chat] 出错：403' }, // 网关失败反馈 → raw 卡(可见)
  { id: 'm4', role: 'agent', content: '' }, // tool_call 占位空消息 → 过滤
];

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '写写', soul: '写手', avatar_color: '#888' },
  ]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: (...args: unknown[]) => resolveDmMock(...args),
}));
vi.mock('../../core/hooks/useChatStream', () => ({
  useChatStream: vi.fn(() => ({
    messages: defaultMessages,
    send: sendMock,
    cancel: cancelMock,
    streaming: false,
    error: null,
  })),
}));
// Timeline 重(CSS module+registry),stub 成 kind 列表以断言适配层
vi.mock('../../components/run-session/timeline/Timeline', () => ({
  Timeline: ({ messages }: { messages: Array<{ kind: string }> }) => (
    <div data-testid="timeline" data-kinds={messages.map((m) => m.kind).join(',')} />
  ),
}));
// UI5.0 — chat-unify 后 DM 走 UnifiedChatFeed(不再是 Timeline);同样 stub 成 kind 列表,
// timelineMessagesToStudio 直通(组件已构造好 kind 字段)。断言意图不变:
// user→user_turn / agent→assistant_text / system→raw / 空消息过滤。
vi.mock('../../components/workbench/UnifiedChatFeed', () => ({
  UnifiedChatFeed: ({ messages }: { messages: Array<{ kind: string }> }) => (
    <div data-testid="unified-feed" data-kinds={messages.map((m) => m.kind).join(',')} />
  ),
  timelineMessagesToStudio: (ms: unknown[]) => ms,
}));
// 「新员工」现在弹出原 /agents 页面（PagePeekOverlay）——stub 成可关闭的占位
vi.mock('../chat-home/PagePeekOverlay', () => ({
  PagePeekOverlay: ({ target, onClose }: { target: string; onClose: () => void }) => (
    <div data-testid="peek-overlay" data-target={target}>
      <button data-testid="peek-close" onClick={onClose} />
    </div>
  ),
}));
vi.mock('../chat-home/PersonalRightPane', () => ({
  PersonalRightPane: ({ groupId }: { groupId: string }) => <div data-testid="right-pane" data-gid={groupId} />,
}));
// UI5.0(2026-08-14)— StartLanding(UI4.0 起)在空态树下调 useAuth;测试无 AuthProvider,
// mock 成未登录态(user=null → 问候语不带用户名),修复 UI4.0 遗留的红测试。
vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MemoryRouter } from 'react-router-dom';
import { useChatStream } from '../../core/hooks/useChatStream';
import { PersonalChatView } from '../chat-home/PersonalChatView';
import { SidebarSlotProvider, SidebarSlotMount } from '../chat-home/SidebarSlotContext';

const click = (el: HTMLElement) => act(() => { el.click(); });
// M3b — ChatRailChrome(个人/团队切换+底部导航)用了 useNavigate/Link,需要 Router 上下文。
// UI5.0 — 助手列表经 portal 注入 SidebarSlot(2026-06-23 路B 统一侧栏);测试须挂
// Provider + Mount,否则 slotEl=null、列表不渲染(此前被 useAuth 崩溃掩盖)。
const view = () => (
  <MemoryRouter initialEntries={['/chat?view=personal']}>
    <SidebarSlotProvider>
      <SidebarSlotMount />
      <PersonalChatView />
    </SidebarSlotProvider>
  </MemoryRouter>
);

describe('PersonalChatView (融合M1)', () => {
  beforeEach(() => {
    sendMock.mockClear();
    cancelMock.mockClear();
    resolveDmMock.mockClear();
    // Reset useChatStream to the default (streaming=false) before each test so
    // individual tests that override with streaming=true don't bleed state.
    (useChatStream as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: defaultMessages,
      send: sendMock,
      cancel: cancelMock,
      streaming: false,
      error: null,
    }));
  });

  it('选中助手 → resolveDmConversation 被调 + useChatStream 走 group 模式吃 dmGroupId', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => expect(resolveDmMock).toHaveBeenCalledWith('a1', undefined));
    await waitFor(() => {
      const calls = (useChatStream as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.mode).toBe('group');
      expect(last.targetId).toBe('dm-g1');
    });
  });

  it('消息流经适配层进 UnifiedChatFeed:user_turn + assistant_text', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => {
      // system → raw 卡(失败反馈必须可见);空 content 消息被过滤
      expect(screen.getByTestId('unified-feed').getAttribute('data-kinds')).toBe('user_turn,assistant_text,raw');
    });
  });

  it('右栏渲染且拿到 dm groupId', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => expect(screen.getByTestId('right-pane').getAttribute('data-gid')).toBe('dm-g1'));
  });

  it('「+ 新员工」→ 弹出原 /agents 页面(PagePeekOverlay)，关闭后刷新助手列表', async () => {
    render(view());
    await screen.findByText('写写');
    click(screen.getByRole('button', { name: '+ 新员工' }));
    expect(screen.getByTestId('peek-overlay').getAttribute('data-target')).toBe('agents');
    const { listAgents } = await import('../../api/agents');
    const callsBefore = (listAgents as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    click(screen.getByTestId('peek-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('peek-overlay')).not.toBeInTheDocument();
      expect((listAgents as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('未选助手 = Cherry Studio 式空态引导(无发起框)', async () => {
    render(view());
    await screen.findByText('写写');
    expect(screen.getByText('选择一个助手开始单聊，或创建一位新员工')).toBeInTheDocument();
  });

  it('streaming=true → 渲染停止按钮；点击调用 cancel', async () => {
    // Override hook to simulate an in-flight agent reply.
    (useChatStream as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: [{ id: 'm1', role: 'user', content: '你好' }],
      send: sendMock,
      cancel: cancelMock,
      streaming: true,
      error: null,
    }));
    render(view());
    click(await screen.findByText('写写'));
    // UI5.0 — 停止按钮已并入 UnifiedComposer 发送按钮位(data-testid 由 dm-stop-btn
    // 改为 composer-stop,见 PersonalChatView F1 注释),断言意图不变:渲染+点击调 cancel。
    const stopBtn = await screen.findByTestId('composer-stop');
    expect(stopBtn).toBeInTheDocument();
    click(stopBtn);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });
});

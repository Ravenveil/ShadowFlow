/**
 * TabChat 测试 — 关键回归：
 *   - 切换会话时消息列表也跟着切（P0 修复回归保护）
 *   - 输入 / 弹斜杠面板
 *   - 发送消息追加到当前会话
 *   - drawer 关闭
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { TabChat } from '../../../components/workspace/TabChat';

describe('TabChat', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<TabChat />);
    expect(getByTestId('chat-title')).toHaveTextContent('论文深读小队');
  });

  it('REGRESSION: switching conversation switches messages list', () => {
    const { getByTestId } = render(<TabChat />);

    // 默认进入 main，应能看到 PDF 抓取消息
    const initialMessages = getByTestId('chat-messages');
    expect(initialMessages.textContent).toContain('已抓 PDF');

    // 点击 engineering 频道
    fireEvent.click(getByTestId('inbox-engineering'));
    expect(getByTestId('chat-title')).toHaveTextContent('engineering');
    const engMessages = getByTestId('chat-messages');
    expect(engMessages.textContent).toContain('PR #312');
    expect(engMessages.textContent).not.toContain('已抓 PDF');

    // 切到 DM 阿批
    fireEvent.click(getByTestId('inbox-api'));
    expect(getByTestId('chat-title')).toHaveTextContent('阿批 DM');
    const apiMessages = getByTestId('chat-messages');
    expect(apiMessages.textContent).toContain('3 处自相矛盾');
    expect(apiMessages.textContent).not.toContain('PR #312');
  });

  it('shows slash popup when typing /', () => {
    const { getByTestId, queryByTestId } = render(<TabChat />);
    expect(queryByTestId('slash-popup')).not.toBeInTheDocument();

    const textarea = getByTestId('composer-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });
    expect(queryByTestId('slash-popup')).toBeInTheDocument();
    expect(within(getByTestId('slash-popup')).getByTestId('slash-run')).toBeInTheDocument();
  });

  it('hides slash popup when text does not start with /', () => {
    const { getByTestId, queryByTestId } = render(<TabChat />);
    const textarea = getByTestId('composer-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(queryByTestId('slash-popup')).not.toBeInTheDocument();
  });

  it('sends a message and appends it to the current conversation', () => {
    const { getByTestId } = render(<TabChat />);
    const textarea = getByTestId('composer-textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '测试消息' } });
    fireEvent.click(getByTestId('composer-send'));

    expect(getByTestId('chat-messages').textContent).toContain('测试消息');
    expect((getByTestId('composer-textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('send is disabled when text is empty', () => {
    const { getByTestId } = render(<TabChat />);
    const send = getByTestId('composer-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    const textarea = getByTestId('composer-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x' } });
    expect((getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(textarea, { target: { value: '   ' } });
    expect((getByTestId('composer-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('drawer close button hides the drawer', () => {
    const { getByTestId, queryByTestId } = render(<TabChat />);
    expect(getByTestId('chat-drawer')).toBeInTheDocument();
    fireEvent.click(getByTestId('drawer-close'));
    expect(queryByTestId('chat-drawer')).not.toBeInTheDocument();
  });
});

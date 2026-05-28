/**
 * MsgReactionsFB.test.tsx — Stream E
 *
 * reactions / thread-chip / read-by 三组二级元素 + 回调断言。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MsgReactionsFB } from './MsgReactionsFB';

describe('MsgReactionsFB', () => {
  it('reactions 渲染计数', () => {
    render(
      <MsgReactionsFB
        reactions={[
          { id: 'up', icon: 'thumbs-up', count: 3, picked: true },
          { id: 'bm', icon: 'bookmark', count: 1 },
        ]}
      />
    );
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('点击 thread-chip 触发 onOpenThread', () => {
    const onOpen = vi.fn();
    render(
      <MsgReactionsFB
        threadCount={4}
        threadLastSender="阿批"
        threadLastAt="1 分钟前"
        onOpenThread={onOpen}
      />
    );
    const chip = screen.getByText(/4 条回复/);
    fireEvent.click(chip.closest('button')!);
    expect(onOpen).toHaveBeenCalled();
  });

  it('threadCount 为 0 不渲染 thread-chip', () => {
    render(<MsgReactionsFB threadCount={0} />);
    expect(screen.queryByText(/条回复/)).toBeNull();
  });

  it('read-by 渲染头像 + 已读文案', () => {
    render(
      <MsgReactionsFB
        readBy={[
          { id: '1', name: '张明', color: '#10B981' },
          { id: '2', name: '阿批' },
          { id: '3', name: '审审' },
        ]}
      />
    );
    expect(screen.getByText(/3\/3 已读/)).toBeTruthy();
  });

  it('readBy 超过 5 人时显示 +N', () => {
    render(
      <MsgReactionsFB
        readBy={Array.from({ length: 7 }, (_, i) => ({
          id: String(i),
          name: `U${i}`,
        }))}
      />
    );
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('全部 props 缺失时返回 null（不渲染容器）', () => {
    const { container } = render(<MsgReactionsFB />);
    expect(container.textContent).toBe('');
  });

  it('点击 + 按钮触发 onAddReaction', () => {
    const onAdd = vi.fn();
    render(
      <MsgReactionsFB
        reactions={[{ id: 'up', icon: 'thumbs-up', count: 1 }]}
        onAddReaction={onAdd}
      />
    );
    const addBtn = screen.getByLabelText('添加表情反应');
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalled();
  });
});

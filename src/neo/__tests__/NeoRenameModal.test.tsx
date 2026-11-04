/**
 * NeoRenameModal 测试（2026-11-04 用户反馈批「编辑项目名字能不能成熟一点」）。
 *
 * 覆盖成熟度三件套：
 *   - 渲染：role=dialog + aria-modal + 标题，输入框预填 initial 且挂载即全选；
 *   - 提交守卫：空名 / 纯空白 / 与 initial 相同 → 确认钮 disabled，不回传；
 *   - 键盘：Enter 提交回传 trim 后的名字，Esc 关闭（onClose）；
 *   - 遮罩点击关闭；busy 时输入框/两钮 disabled 且遮罩/Esc 均不关；
 *   - error 行内红条（role=alert）。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import { NeoRenameModal } from '../NeoRenameModal';

function renderModal(props: Partial<Parameters<typeof NeoRenameModal>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <NeoRenameModal
      title="重命名项目"
      initial="氢能官网"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
}

describe('NeoRenameModal — 渲染与预填', () => {
  it('渲染 dialog：aria-modal + 标题 + 输入框预填 initial（同名守卫 → 确认钮 disabled）', () => {
    renderModal();
    const dialog = screen.getByTestId('neo-rename-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', '重命名项目');
    expect(screen.getByTestId('neo-rename-input')).toHaveValue('氢能官网');
    // 预填 = initial（未改名）→ 提交守卫生效，确认钮 disabled（不发无效请求）。
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
  });

  it('挂载即全选初始名（select() 生效，selectionStart=0 / selectionEnd=末尾）', () => {
    renderModal();
    const input = screen.getByTestId('neo-rename-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });
});

describe('NeoRenameModal — 提交守卫', () => {
  it('与 initial 相同 → 确认钮 disabled，不回传 onConfirm', () => {
    renderModal();
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    expect(screen.queryByTestId('neo-rename-error')).toBeNull();
  });

  it('空名 / 纯空白 → 确认钮 disabled；清空后输入合法名恢复可点', () => {
    renderModal();
    const input = screen.getByTestId('neo-rename-input');
    const confirm = screen.getByTestId('neo-rename-confirm');
    fireEvent.change(input, { target: { value: '' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: '新名字' } });
    expect(confirm).toBeEnabled();
  });

  it('点确认回传 trim 后的名字（两端空白被剥掉）', () => {
    const { onConfirm } = renderModal();
    const input = screen.getByTestId('neo-rename-input');
    fireEvent.change(input, { target: { value: '  新名字  ' } });
    fireEvent.click(screen.getByTestId('neo-rename-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('新名字');
  });
});

describe('NeoRenameModal — 键盘与遮罩', () => {
  it('Enter 提交：回传 trim 后的名字给 onConfirm', () => {
    const { onConfirm } = renderModal();
    const input = screen.getByTestId('neo-rename-input');
    fireEvent.change(input, { target: { value: '  新名字  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('新名字');
    expect(onConfirm.mock.calls[0][0]).toBe('新名字');
  });

  it('Esc 关闭 → onClose；不触发 onConfirm', () => {
    const { onConfirm, onClose } = renderModal();
    const input = screen.getByTestId('neo-rename-input');
    fireEvent.change(input, { target: { value: '新名字' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('遮罩点击关闭（内层卡片点击不关）', () => {
    const { onClose } = renderModal();
    // 点击遮罩本体（mask 是 dialog 的父节点）
    fireEvent.click(screen.getByTestId('neo-rename-modal').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('取消钮关闭', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('neo-rename-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('NeoRenameModal — busy / error', () => {
  it('busy：输入框与两钮 disabled，Enter/Esc/遮罩均失效', () => {
    const { onConfirm, onClose } = renderModal({ busy: true });
    const input = screen.getByTestId('neo-rename-input');
    expect(input).toBeDisabled();
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    expect(screen.getByTestId('neo-rename-cancel')).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('neo-rename-modal').parentElement!);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('error 行内红条（role=alert）渲染', () => {
    renderModal({ error: '操作失败，请重试' });
    const err = screen.getByTestId('neo-rename-error');
    expect(err).toBeInTheDocument();
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveTextContent('操作失败，请重试');
  });

  it('自定义确认/取消文案生效', () => {
    renderModal({ confirmLabel: '保存', cancelLabel: '返回' });
    expect(screen.getByTestId('neo-rename-confirm')).toHaveTextContent('保存');
    expect(screen.getByTestId('neo-rename-cancel')).toHaveTextContent('返回');
  });
});

// busy 弹窗恢复后确认钮恢复可点（busy 复位 → 父层可重试，真实 API 失败场景）。
describe('NeoRenameModal — busy 复位恢复', () => {
  it('busy true → false 后确认钮恢复可点，可再次提交', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <NeoRenameModal
        title="重命名项目"
        initial="氢能官网"
        busy
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('neo-rename-confirm')).toBeDisabled();
    rerender(
      <NeoRenameModal
        title="重命名项目"
        initial="氢能官网"
        busy={false}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const input = screen.getByTestId('neo-rename-input');
    fireEvent.change(input, { target: { value: '新名字' } });
    fireEvent.click(screen.getByTestId('neo-rename-confirm'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新名字'));
  });
});

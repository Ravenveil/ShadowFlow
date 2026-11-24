import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { PersonalTeamToggle } from '../chat-home/PersonalTeamToggle';

describe('PersonalTeamToggle', () => {
  it('渲染「个人」「团队」两个选项', () => {
    render(<PersonalTeamToggle view="team" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '个人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '团队' })).toBeInTheDocument();
  });

  it('当前视图标 aria-pressed=true', () => {
    render(<PersonalTeamToggle view="personal" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '个人' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '团队' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('点「个人」回调 personal', () => {
    const onChange = vi.fn();
    render(<PersonalTeamToggle view="team" onChange={onChange} />);
    screen.getByRole('button', { name: '个人' }).click();
    expect(onChange).toHaveBeenCalledWith('personal');
  });
});

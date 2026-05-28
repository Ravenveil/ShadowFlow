/**
 * GroupSettingsModalFB.test.tsx — Stream I
 *
 * 覆盖 5 区段 mount + Esc 关 + overlay 关 + toggle flip 回调 + KV row 回调 + danger 回调
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  GroupSettingsModalFB,
  type GsetMember,
  type GsetSettings,
} from './GroupSettingsModalFB';

const MEMBERS: GsetMember[] = [
  { id: 'm1', name: '读读', role: 'Reader', avatarColor: 'b', online: true },
  { id: 'm2', name: '阿批', role: 'Critic', avatarColor: 'r', online: true },
  { id: 'm3', name: '查查', role: 'Cite-checker', avatarColor: 'g', online: true },
  { id: 'm4', name: '写写', role: 'Writer', avatarColor: 'p', online: true },
  { id: 'm5', name: '审审', role: 'Reviewer', avatarColor: 'o', online: false },
];

const SETTINGS: GsetSettings = {
  muted: false,
  pinned: true,
  folded: false,
  showNickname: true,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof GroupSettingsModalFB>> = {}) {
  const onClose = vi.fn();
  const onToggleSetting = vi.fn();
  const onEditField = vi.fn();
  const onInviteMember = vi.fn();
  const onViewAllMembers = vi.fn();
  const onArchive = vi.fn();
  const onLeave = vi.fn();
  const utils = render(
    <GroupSettingsModalFB
      open
      onClose={onClose}
      groupName="论文深读小队"
      agentCount={5}
      onlineCount={4}
      startedAt="09:14"
      avatarEmoji="📜"
      members={MEMBERS}
      totalMembers={12}
      onInviteMember={onInviteMember}
      onViewAllMembers={onViewAllMembers}
      groupNickname="论文深读小队"
      announcement="目标：复审 PaperMind 2026.10，输出可发版 v3"
      myNickname="张明"
      isOwner
      onEditField={onEditField}
      settings={SETTINGS}
      onToggleSetting={onToggleSetting}
      onArchive={onArchive}
      onLeave={onLeave}
      {...overrides}
    />
  );
  return {
    ...utils,
    onClose,
    onToggleSetting,
    onEditField,
    onInviteMember,
    onViewAllMembers,
    onArchive,
    onLeave,
  };
}

describe('GroupSettingsModalFB', () => {
  it('5 区段都 mount：card / members / KV / toggles / danger', () => {
    renderModal();

    // 1) group card —— 群名同时出现在 card 标题和「群昵称」KV row 默认值
    expect(screen.getAllByText('论文深读小队').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/5 个 agent · 4 在线 · 启动于 09:14/)).toBeTruthy();

    // 2) members grid（5 名 + 邀请按钮）
    expect(screen.getByText('读读')).toBeTruthy();
    expect(screen.getByText('Reader')).toBeTruthy();
    expect(screen.getByText('审审')).toBeTruthy();
    expect(screen.getByText('5 / 12')).toBeTruthy();
    expect(screen.getByText('查看全部 ▸')).toBeTruthy();
    expect(screen.getByText('邀请')).toBeTruthy();

    // 3) KV rows
    expect(screen.getByText('群昵称')).toBeTruthy();
    expect(screen.getByText('群公告')).toBeTruthy();
    expect(screen.getByText('我的昵称')).toBeTruthy();
    expect(screen.getByText('OWNER')).toBeTruthy();
    expect(screen.getByText('查找聊天内容')).toBeTruthy();

    // 4) toggles
    expect(screen.getByText('消息免打扰')).toBeTruthy();
    expect(screen.getByText('置顶聊天')).toBeTruthy();
    expect(screen.getByText('折叠该群')).toBeTruthy();
    expect(screen.getByText('不显示在最近会话顶部')).toBeTruthy();
    expect(screen.getByText('显示成员昵称')).toBeTruthy();

    // 5) danger zone
    expect(screen.getByText('归档群聊')).toBeTruthy();
    expect(screen.getByText('退出群聊')).toBeTruthy();
  });

  it('Escape 键关闭 modal', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('✕ 按钮关闭 modal', () => {
    const { onClose } = renderModal();
    const closeBtn = screen.getByRole('button', { name: /关闭/ });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggle 行点击触发 onToggleSetting（modal 不关）', () => {
    const { onClose, onToggleSetting } = renderModal();
    fireEvent.click(screen.getByText('消息免打扰'));
    expect(onToggleSetting).toHaveBeenCalledWith('muted');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('KV row 点击触发 onEditField（modal 不关）', () => {
    const { onClose, onEditField } = renderModal();
    fireEvent.click(screen.getByText('群公告'));
    expect(onEditField).toHaveBeenCalledWith('announcement');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('查看全部 / 邀请 / 归档 / 退出 按钮回调', () => {
    const { onViewAllMembers, onInviteMember, onArchive, onLeave } = renderModal();
    fireEvent.click(screen.getByText('查看全部 ▸'));
    fireEvent.click(screen.getByText('邀请'));
    fireEvent.click(screen.getByText('归档群聊'));
    fireEvent.click(screen.getByText('退出群聊'));
    expect(onViewAllMembers).toHaveBeenCalledTimes(1);
    expect(onInviteMember).toHaveBeenCalledTimes(1);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('open=false 时 overlay 不带 open class（仍渲染以做动画）', () => {
    const { container } = renderModal({ open: false });
    const overlay = container.querySelector('[data-overlay="gset"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.className).not.toMatch(/\bopen\b/);
  });

  it('不传 avatarEmoji 时用群名首字兜底', () => {
    renderModal({ avatarEmoji: undefined, groupName: '小分队' });
    // 群头像装饰节点 aria-hidden, 用文本断言（避免空 className 在 jsdom 下不稳定）
    expect(screen.getByText('小')).toBeTruthy();
  });
});

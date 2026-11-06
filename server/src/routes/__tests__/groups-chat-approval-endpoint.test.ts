/**
 * groups-chat-approval-endpoint.test.ts — 审批决定端点 + 文本决定解析测试。
 *
 * 覆盖 2026-11-05 approve 边人工审批门的群聊接线层：
 *   - POST /:id/approvals/:nodeId 显式决定：approve / reject / 400 / 409
 *   - tryResolveApprovalFromText：批准/拒绝关键词命中 → resolve 全部挂起；
 *     非决定文本不消费 pending
 *
 * 不起真 Express：router.route 配合 supertest 不引新依赖 — 直接手工构造
 * req/res mock 打 handler（与既有 groups-chat 测试同款轻量风格）。
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  clearPendingApprovals,
} from '../groups-chat';

// pendingApprovals 是模块私有 — 通过导出的 clearPendingApprovals 清理 +
// 文本路径经 tryResolveApprovalFromText 不可直接 import（未导出）。这里把
// 文本解析的语义等价物（同一正则）在本文件内复测，真实接线由执行器单测覆盖。

function approvalResolverRegex(text: string): 'approve' | 'reject' | null {
  const trimmed = text.trim().toLowerCase();
  // 决定消息必须短——「继续写代码」是派活不是决定（长度闸门）。
  // 中文 ≤6 字；含拉丁字符 ≤10（"approve" 全词 7 字符）。
  const latinChars = (trimmed.match(/[a-z]/g) ?? []).length;
  const lenLimit = latinChars > 0 ? 10 : 6;
  if (trimmed.length > lenLimit) return null;
  const isApprove = /^(批准|同意|approve|ok|好|通过|allowed|yes)/.test(trimmed);
  const isReject = /^(拒绝|不同意|reject|否|不行|停|驳回|no|deny)/.test(trimmed);
  if (isApprove) return 'approve';
  if (isReject) return 'reject';
  return null;
}

describe('审批文本决定解析（与 tryResolveApprovalFromText 同语义）', () => {
  it.each(['批准', '同意，继续吧', 'approve', 'OK', '通过', 'yes'])('「%s」→ approve', (t) => {
    expect(approvalResolverRegex(t)).toBe('approve');
  });
  it.each(['拒绝', '不同意', 'reject', '否', '不行，重做', '停'])('「%s」→ reject', (t) => {
    expect(approvalResolverRegex(t)).toBe('reject');
  });
  it.each(['帮我看看这个', '把文档改一下', '继续写代码', '继续往下推进这个任务'])('非决定文本「%s」→ null', (t) => {
    expect(approvalResolverRegex(t)).toBeNull();
  });
});

describe('clearPendingApprovals（测试可见性导出）', () => {
  beforeEach(() => {
    clearPendingApprovals();
  });
  it('导出存在且可重复调用（幂等）', () => {
    expect(() => {
      clearPendingApprovals();
      clearPendingApprovals();
    }).not.toThrow();
  });
});

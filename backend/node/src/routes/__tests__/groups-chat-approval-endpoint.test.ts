/**
 * groups-chat-approval-endpoint.test.ts — 审批决定三条路径回归测试。
 *
 * 覆盖 2026-11-05 approve 边人工审批门的群聊接线层（2026-11-07 补全）：
 *   - parseApprovalDecision：会话短文本决定解析——批准词/拒绝词、长度闸门
 *     防误吞派活（「继续写代码」不吞）、「继续」因歧义不在词表
 *   - tryResolveApprovalFromText：组内全部挂起同决、跨组隔离、非决定文本不消费
 *   - approvalDecisionHandler（POST /:id/approvals/:nodeId）：400 BAD_DECISION /
 *     409 NO_PENDING / 200 approve / 200 reject，决定后二次调用 409（幂等）
 *   - swapDagRun 换轮拒收场：上一轮挂起审批视作拒绝，不悬挂；他组不受影响
 *   - registerPendingApproval 30 分钟兜底超时 → 自动拒绝（fake timers）
 *
 * 不起真 Express：handler 为导出函数，手工构造 req/res mock 直打。
 * 此前本文件用「同正则副本」复测文本解析——双实现会漂移，现直打真实现。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  approvalDecisionHandler,
  clearPendingApprovals,
  parseApprovalDecision,
  parseApprovalVerdict,
  registerPendingApproval,
  swapDagRun,
  tryResolveApprovalFromText,
} from '../groups/groups-chat';

function settledFlag(p: Promise<unknown>): { done: boolean } {
  const flag = { done: false };
  void p.then(() => { flag.done = true; });
  return flag;
}

beforeEach(() => {
  clearPendingApprovals();
});

describe('parseApprovalDecision（真实实现）', () => {
  it.each(['批准', '同意', '同意，继续吧', 'approve', 'APPROVE', 'OK', '好', '通过', 'yes'])(
    '「%s」→ approved', (t) => {
      expect(parseApprovalDecision(t)).toBe('approved');
    });
  it.each(['拒绝', '不同意', 'reject', '否', '不行，重做', '停', '驳回', 'no', 'deny'])(
    '「%s」→ rejected', (t) => {
      expect(parseApprovalDecision(t)).toBe('rejected');
    });
  it.each([
    '继续', // 历史决策：歧义词移出批准词表（2026-11-05）
    '继续写代码',
    '帮我看看这个',
    '把文档改一下',
    '继续往下推进这个任务',
    '批准这个方案然后开始执行', // 以「批准」开头但超长 —— 是派活不是决定
    'approve now', // 11 字符 > 拉丁闸门 10
    'please approve this',
  ])('非决定/超长文本「%s」→ null（长度闸门防误吞派活）', (t) => {
    expect(parseApprovalDecision(t)).toBeNull();
  });
  it('大小写与首尾空白不敏感', () => {
    expect(parseApprovalDecision('  Approve  ')).toBe('approved');
    expect(parseApprovalDecision('NO')).toBe('rejected');
  });
});

describe('tryResolveApprovalFromText（组内消费语义）', () => {
  it('组内全部挂起同决 — 一条短文本 resolve 该组全部 pending', async () => {
    const a = registerPendingApproval('g1', 'n1');
    const b = registerPendingApproval('g1', 'n2');
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(true);
    await expect(a).resolves.toEqual({ decision: 'approved' });
    await expect(b).resolves.toEqual({ decision: 'approved' });
    // 已消费 — 再来一条不重复消费
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(false);
  });

  it('跨组隔离 — g2 的决定文本不消费 g1 的挂起', async () => {
    const a = registerPendingApproval('g1', 'n1');
    const f = settledFlag(a);
    expect(tryResolveApprovalFromText('g2', '批准')).toBe(false);
    await Promise.resolve();
    expect(f.done).toBe(false);
    // g1 的挂起仍可被本组文本正常消费
    expect(tryResolveApprovalFromText('g1', '拒绝')).toBe(true);
    await expect(a).resolves.toEqual({ decision: 'rejected' });
  });

  it('非决定文本不消费挂起（防误吞派活）', async () => {
    const a = registerPendingApproval('g1', 'n1');
    expect(tryResolveApprovalFromText('g1', '继续写代码')).toBe(false);
    expect(tryResolveApprovalFromText('g1', '批准这个方案然后开始执行')).toBe(false);
    const f = settledFlag(a);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(tryResolveApprovalFromText('g1', '同意')).toBe(true);
    await expect(a).resolves.toEqual({ decision: 'approved' });
  });

  it('无挂起时任何文本都返回 false，不抛异常', () => {
    expect(tryResolveApprovalFromText('g0', '批准')).toBe(false);
    expect(tryResolveApprovalFromText('g0', '乱说一通')).toBe(false);
  });
});

describe('approvalDecisionHandler（POST /:id/approvals/:nodeId）', () => {
  function mkRes() {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) { out.status = code; return res; },
      json(body: unknown) { out.body = body; return res; },
    };
    return { res, out };
  }
  const mkReq = (body?: unknown) => ({ params: { id: 'g1', nodeId: 'n1' }, body });

  it('非法 decision → 400 BAD_DECISION（缺 body / 未知值都拒）', () => {
    for (const body of [undefined, {}, { decision: 'maybe' }, { decision: 1 }]) {
      const { res, out } = mkRes();
      approvalDecisionHandler(mkReq(body), res);
      expect(out.status).toBe(400);
      expect((out.body as { error: { code: string } }).error.code).toBe('BAD_DECISION');
    }
  });

  it('无挂起 → 409 NO_PENDING_APPROVAL', () => {
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve' }), res);
    expect(out.status).toBe(409);
    expect((out.body as { error: { code: string } }).error.code).toBe('NO_PENDING_APPROVAL');
  });

  it('approve → 200，promise 收 approved，挂起被清（二次调用 409 幂等）', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve' }), res);
    expect(out.status).toBeUndefined();
    expect(out.body).toEqual({ group_id: 'g1', node_id: 'n1', decision: 'approve' });
    await expect(p).resolves.toEqual({ decision: 'approved' });
    const { res: res2, out: out2 } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve' }), res2);
    expect(out2.status).toBe(409);
  });

  it('reject → 200，promise 收 rejected', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'reject' }), res);
    expect(out.status).toBeUndefined();
    await expect(p).resolves.toEqual({ decision: 'rejected' });
  });

  it('nodeId 精确匹配 — n1 的决定不误清 n2 的挂起', async () => {
    const p2 = registerPendingApproval('g1', 'n2');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve' }), res); // 只找 n1（无挂起，409）
    expect(out.status).toBe(409);
    const f = settledFlag(p2);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(true);
    await expect(p2).resolves.toEqual({ decision: 'approved' });
  });
});

describe('swapDagRun 换轮拒收场（决定路径③）', () => {
  it('换轮即把上一轮挂起审批视作拒绝，promise 不悬挂', async () => {
    const a = registerPendingApproval('g1', 'n1');
    const b = registerPendingApproval('g1', 'n2');
    const ac = swapDagRun('g1', new Map());
    expect(ac.signal.aborted).toBe(false);
    await expect(a).resolves.toEqual({ decision: 'rejected' });
    await expect(b).resolves.toEqual({ decision: 'rejected' });
    // 拒收场后无残留挂起
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(false);
  });

  it('他组挂起不受换轮影响，仍可正常决定', async () => {
    const mine = registerPendingApproval('g1', 'n1');
    const other = registerPendingApproval('g2', 'n1');
    swapDagRun('g1', new Map());
    await expect(mine).resolves.toEqual({ decision: 'rejected' });
    const f = settledFlag(other);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(tryResolveApprovalFromText('g2', '批准')).toBe(true);
    await expect(other).resolves.toEqual({ decision: 'approved' });
  });

  it('换轮 abort 上一轮 controller 的既有行为保持（回归）', () => {
    const reg = new Map<string, AbortController>();
    const first = swapDagRun('g1', reg);
    const second = swapDagRun('g1', reg);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(reg.get('g1')).toBe(second);
  });
});

describe('registerPendingApproval 30 分钟兜底超时', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('超时未决定 → 自动 rejected 收场，挂起被清', async () => {
    vi.useFakeTimers();
    const p = registerPendingApproval('g1', 'n1');
    const f = settledFlag(p);
    await Promise.resolve();
    expect(f.done).toBe(false); // 未超时前仍悬挂
    vi.advanceTimersByTime(30 * 60_000);
    await expect(p).resolves.toEqual({ decision: 'rejected' });
    // 超时清挂起 — 文本/端点路径均视为无挂起
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(false);
    const out2: { status?: number } = {};
    approvalDecisionHandler(
      { params: { id: 'g1', nodeId: 'n1' }, body: { decision: 'approve' } },
      { status(code: number) { out2.status = code; return { json: () => {} }; }, json: () => {} },
    );
    expect(out2.status).toBe(409);
  });

  it('30 分钟内已决定 → 超时不再二次收场（幂等）', async () => {
    vi.useFakeTimers();
    const p = registerPendingApproval('g1', 'n1');
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(true);
    await expect(p).resolves.toEqual({ decision: 'approved' });
    vi.advanceTimersByTime(30 * 60_000); // 不抛、不影响后续挂起
    const p2 = registerPendingApproval('g1', 'n2');
    expect(tryResolveApprovalFromText('g1', '拒绝')).toBe(true);
    await expect(p2).resolves.toEqual({ decision: 'rejected' });
  });
});

// ── BE-06 审批意见（2026-11-07）────────────────────────────────────────────

describe('parseApprovalVerdict（决定 + 意见解析，严格版）', () => {
  it.each([
    ['批准', { decision: 'approved' as const }],
    ['同意', { decision: 'approved' as const }],
    ['approve', { decision: 'approved' as const }],
    ['APPROVED', { decision: 'approved' as const }], // 屈折形
    ['好的', { decision: 'approved' as const }], // 轻尾缀
    ['拒绝', { decision: 'rejected' as const }],
    ['不同意', { decision: 'rejected' as const }],
    ['rejected', { decision: 'rejected' as const }],
    ['停！', { decision: 'rejected' as const }], // 标点尾缀
  ])('纯决定短语「%s」→ %o（无意见）', (t, expected) => {
    expect(parseApprovalVerdict(t)).toEqual(expected);
  });

  it.each([
    ['同意，预算砍半', { decision: 'approved' as const, comment: '预算砍半' }],
    ['同意，继续吧', { decision: 'approved' as const, comment: '继续吧' }],
    ['不行，重做', { decision: 'rejected' as const, comment: '重做' }],
    ['approve: go ahead', { decision: 'approved' as const, comment: 'go ahead' }],
    ['拒绝、理由是文案违规', { decision: 'rejected' as const, comment: '理由是文案违规' }],
    ['ok，但先改标题', { decision: 'approved' as const, comment: '但先改标题' }],
  ])('显式分隔符「%s」→ %o（后半句收作意见）', (t, expected) => {
    expect(parseApprovalVerdict(t)).toEqual(expected);
  });

  it.each([
    '拒绝的诱惑', // 决定词开头的整句（无分隔符有余词）— 是派活不是决定
    '停止生成',
    'approve now', // 拉丁余词
    '批准这个方案然后开始执行',
    '批准这个方案，然后开始执行', // 有分隔符但前半句不是纯决定短语
    '同意的话就继续', // 同上
    '继续',
    '帮我看看这个',
    '',
    '，同意', // 分隔符前无决定词
  ])('非决定/派活句「%s」→ null（防误吞，较 parseApprovalDecision 更严）', (t) => {
    expect(parseApprovalVerdict(t)).toBeNull();
  });

  it('意见超 200 字截断；空意见不带 comment 键', () => {
    const long = `批准，${'很'.repeat(300)}`;
    const v = parseApprovalVerdict(long);
    expect(v?.decision).toBe('approved');
    expect(v?.comment?.length).toBe(200);
    // 空意见（分隔符后无内容）→ 只回决定
    expect(parseApprovalVerdict('拒绝:')).toEqual({ decision: 'rejected' });
    expect(parseApprovalVerdict('拒绝，   ')).toEqual({ decision: 'rejected' });
  });
});

describe('tryResolveApprovalFromText — 意见穿线（BE-06）', () => {
  it('带分隔符决定 → comment 随 verdict 穿给执行器', async () => {
    const a = registerPendingApproval('g1', 'n1');
    expect(tryResolveApprovalFromText('g1', '同意，预算砍半')).toBe(true);
    await expect(a).resolves.toEqual({ decision: 'approved', comment: '预算砍半' });
  });

  it('「拒绝的诱惑」类派活句不消费挂起（严格版防误吞）', async () => {
    const a = registerPendingApproval('g1', 'n1');
    expect(tryResolveApprovalFromText('g1', '拒绝的诱惑')).toBe(false);
    expect(tryResolveApprovalFromText('g1', '停止生成')).toBe(false);
    const f = settledFlag(a);
    await Promise.resolve();
    expect(f.done).toBe(false);
    // 仍是纯决定短语才消费
    expect(tryResolveApprovalFromText('g1', '拒绝')).toBe(true);
    await expect(a).resolves.toEqual({ decision: 'rejected' });
  });
});

describe('approvalDecisionHandler — comment 参数（BE-06）', () => {
  function mkRes() {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) { out.status = code; return res; },
      json(body: unknown) { out.body = body; return res; },
    };
    return { res, out };
  }
  const mkReq = (body?: unknown) => ({ params: { id: 'g1', nodeId: 'n1' }, body });

  it('comment 随 verdict 穿给执行器，响应回带意见', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'reject', comment: '文案违规，换角度重写' }), res);
    expect(out.status).toBeUndefined();
    expect(out.body).toEqual({
      group_id: 'g1',
      node_id: 'n1',
      decision: 'reject',
      comment: '文案违规，换角度重写',
    });
    await expect(p).resolves.toEqual({ decision: 'rejected', comment: '文案违规，换角度重写' });
  });

  it('comment 两侧去空白；纯空白意见不带 comment 键', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve', comment: '  可以  ' }), res);
    expect(out.body).toEqual({ group_id: 'g1', node_id: 'n1', decision: 'approve', comment: '可以' });
    await expect(p).resolves.toEqual({ decision: 'approved', comment: '可以' });

    const p2 = registerPendingApproval('g1', 'n2');
    const { res: res2, out: out2 } = mkRes();
    approvalDecisionHandler({ params: { id: 'g1', nodeId: 'n2' }, body: { decision: 'approve', comment: '   ' } }, res2);
    expect(out2.body).toEqual({ group_id: 'g1', node_id: 'n2', decision: 'approve' });
    await expect(p2).resolves.toEqual({ decision: 'approved' });
  });

  it('comment 非字符串或超 500 字 → 400 BAD_COMMENT，挂起不消费', async () => {
    for (const bad of [123, { text: 'x' }, 'あ'.repeat(501)]) {
      const p = registerPendingApproval('g1', 'n1');
      const { res, out } = mkRes();
      approvalDecisionHandler(mkReq({ decision: 'approve', comment: bad }), res);
      expect(out.status).toBe(400);
      expect((out.body as { error: { code: string } }).error.code).toBe('BAD_COMMENT');
      const f = settledFlag(p);
      await Promise.resolve();
      expect(f.done).toBe(false); // 校验失败不动挂起
      clearPendingApprovals();
    }
  });

  it('恰好 500 字的意见放行', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const comment = 'あ'.repeat(500);
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve', comment }), res);
    expect(out.status).toBeUndefined();
    await expect(p).resolves.toEqual({ decision: 'approved', comment });
  });
});

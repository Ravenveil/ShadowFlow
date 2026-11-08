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
  approvalPendingHandler,
  clearPendingApprovals,
  listPendingApprovalItems,
  parseApprovalDecision,
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
    await expect(a).resolves.toBe('approved');
    await expect(b).resolves.toBe('approved');
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
    await expect(a).resolves.toBe('rejected');
  });

  it('非决定文本不消费挂起（防误吞派活）', async () => {
    const a = registerPendingApproval('g1', 'n1');
    expect(tryResolveApprovalFromText('g1', '继续写代码')).toBe(false);
    expect(tryResolveApprovalFromText('g1', '批准这个方案然后开始执行')).toBe(false);
    const f = settledFlag(a);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(tryResolveApprovalFromText('g1', '同意')).toBe(true);
    await expect(a).resolves.toBe('approved');
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
    await expect(p).resolves.toBe('approved');
    const { res: res2, out: out2 } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'approve' }), res2);
    expect(out2.status).toBe(409);
  });

  it('reject → 200，promise 收 rejected', async () => {
    const p = registerPendingApproval('g1', 'n1');
    const { res, out } = mkRes();
    approvalDecisionHandler(mkReq({ decision: 'reject' }), res);
    expect(out.status).toBeUndefined();
    await expect(p).resolves.toBe('rejected');
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
    await expect(p2).resolves.toBe('approved');
  });
});

describe('swapDagRun 换轮拒收场（决定路径③）', () => {
  it('换轮即把上一轮挂起审批视作拒绝，promise 不悬挂', async () => {
    const a = registerPendingApproval('g1', 'n1');
    const b = registerPendingApproval('g1', 'n2');
    const ac = swapDagRun('g1', new Map());
    expect(ac.signal.aborted).toBe(false);
    await expect(a).resolves.toBe('rejected');
    await expect(b).resolves.toBe('rejected');
    // 拒收场后无残留挂起
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(false);
  });

  it('他组挂起不受换轮影响，仍可正常决定', async () => {
    const mine = registerPendingApproval('g1', 'n1');
    const other = registerPendingApproval('g2', 'n1');
    swapDagRun('g1', new Map());
    await expect(mine).resolves.toBe('rejected');
    const f = settledFlag(other);
    await Promise.resolve();
    expect(f.done).toBe(false);
    expect(tryResolveApprovalFromText('g2', '批准')).toBe(true);
    await expect(other).resolves.toBe('approved');
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
    await expect(p).resolves.toBe('rejected');
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
    await expect(p).resolves.toBe('approved');
    vi.advanceTimersByTime(30 * 60_000); // 不抛、不影响后续挂起
    const p2 = registerPendingApproval('g1', 'n2');
    expect(tryResolveApprovalFromText('g1', '拒绝')).toBe(true);
    await expect(p2).resolves.toBe('rejected');
  });
});

// ── 2026-11-09 挂起审批可见化 — GET /:id/approvals/pending 接线 ──────────────
// 根因回归：挂起只活在内存 Map、前端审批 Tab 拉的是 Python 单源 → 审批门永远
// 不可见 → DAG 静默挂 30 分钟。现在 Node 条目带元数据可列、可批/拒闭环。
describe('挂起审批可见化（listPendingApprovalItems / approvalPendingHandler）', () => {
  it('registerPendingApproval meta → 出参对齐前端 PendingApprovalItem，决定后消失', async () => {
    const p = registerPendingApproval('g1', 'agent-content', {
      nodeName: '内容策划师',
      preview: '上游 [总经理] 产出摘要',
    });
    const items = listPendingApprovalItems('g1', 1_000_000);
    expect(items).toHaveLength(1);
    const item = items[0] as Record<string, unknown>;
    expect(item.approval_id).toBe('g1:agent-content');
    expect(item.node_id).toBe('agent-content'); // decideApproval 回投 POST :nodeId 的键
    expect(item.submitter_name).toBe('内容策划师');
    expect(String(item.summary)).toContain('内容策划师');
    expect(item.detail).toBe('上游 [总经理] 产出摘要');
    expect(typeof item.waiting_seconds).toBe('number');
    expect(item.kind).toBe('人工审批门');
    // 决定送达后从列表消失
    expect(tryResolveApprovalFromText('g1', '批准')).toBe(true);
    await expect(p).resolves.toBe('approved');
    expect(listPendingApprovalItems('g1')).toHaveLength(0);
  });

  it('无 meta 回落 nodeId 当展示名（旧调用零改动）', () => {
    registerPendingApproval('g2', 'gate-publish');
    const items = listPendingApprovalItems('g2');
    expect(items).toHaveLength(1);
    expect((items[0] as Record<string, unknown>).submitter_name).toBe('gate-publish');
  });

  it('跨组隔离：只列本组挂起', () => {
    registerPendingApproval('g1', 'n1');
    registerPendingApproval('g2', 'n2');
    expect(listPendingApprovalItems('g1')).toHaveLength(1);
    expect(listPendingApprovalItems('g3')).toHaveLength(0);
  });

  it('waiting_seconds 随注册时刻推进（now 注入控时）', () => {
    registerPendingApproval('g1', 'n1');
    expect(listPendingApprovalItems('g1', 2_000_000)[0].waiting_seconds).toBeGreaterThanOrEqual(0);
    const items = listPendingApprovalItems('g1', Date.now() + 65_000);
    expect((items[0] as Record<string, unknown>).waiting_seconds as number).toBeGreaterThanOrEqual(65);
  });

  it('approvalPendingHandler：Node 侧条目与 Python 注册表合并返回', async () => {
    registerPendingApproval('g1', 'n1', { nodeName: '品牌定稿', preview: '博文《X》' });
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ approval_id: 'py-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));
    try {
      const out: { body?: unknown } = {};
      approvalPendingHandler({ params: { id: 'g1' } }, { json: (b) => { out.body = b; } });
      await vi.waitFor(() => expect(out.body).toBeDefined());
      const items = (out.body as { items: Array<Record<string, unknown>> }).items;
      expect(items).toHaveLength(2);
      expect(items[0].approval_id).toBe('g1:n1');
      expect(items[1].approval_id).toBe('py-1'); // Python runtime 侧（run-sessions）合并可见
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Python 不可达 fail-soft：只回 Node 侧条目', async () => {
    registerPendingApproval('g1', 'n1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    try {
      const out: { body?: unknown } = {};
      approvalPendingHandler({ params: { id: 'g1' } }, { json: (b) => { out.body = b; } });
      await vi.waitFor(() => expect(out.body).toBeDefined());
      expect((out.body as { items: unknown[] }).items).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

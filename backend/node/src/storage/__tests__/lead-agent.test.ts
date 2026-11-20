/**
 * lead-agent.test.ts — 内置主控 agent 的 Node 侧幂等播种（2026-11-20）。
 *
 * 背景：主控原本只由 Python secretary_seed.py 播种，单后端模式不启 Python 就
 * 没有主控，前端首访的「主控会话」指向空 id。本测试锁住三件事：
 *   1. 首次调用真的落库，且 agent_id 是前端约定的固定值（不是 randomUUID）；
 *   2. 第二次调用幂等（created=false，不产生重复记录）；
 *   3. soul 首行可作为 role 摘要（teams-model.roleFromSoul 依赖这一点）。
 *
 * 隔离：chdir 临时目录 + sqlite._resetForTests()，与 groups-store.test.ts 同模式。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import * as sqlite from '../sqlite';
import * as agents from '../agents';
import { LEAD_AGENT_ID, LEAD_AGENT_NAME, LEAD_AGENT_SOUL, ensureLeadAgent } from '../lead-agent';

let origCwd: string;
let tmpDir: string;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-lead-agent-'));
  process.chdir(tmpDir);
  sqlite._resetForTests();
  sqlite.getDb(); // boot schema in the fresh cwd
});

afterEach(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('ensureLeadAgent', () => {
  it('首次播种写入固定 id 的主控', () => {
    expect(agents.listAgents()).toHaveLength(0);

    const res = ensureLeadAgent();

    expect(res.created).toBe(true);
    expect(res.agentId).toBe(LEAD_AGENT_ID);

    const rows = agents.listAgents();
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_id).toBe(LEAD_AGENT_ID);
    expect(rows[0].name).toBe(LEAD_AGENT_NAME);
    expect(rows[0].soul).toBe(LEAD_AGENT_SOUL);
  });

  it('重复调用幂等，不新增记录', () => {
    expect(ensureLeadAgent().created).toBe(true);
    const second = ensureLeadAgent();

    expect(second.created).toBe(false);
    expect(second.agentId).toBe(LEAD_AGENT_ID);
    expect(agents.listAgents()).toHaveLength(1);
  });

  it('soul 首行非空，可作为角色摘要', () => {
    const firstLine = LEAD_AGENT_SOUL.split('\n').find((l) => l.trim().length > 0);

    expect(firstLine).toBeTruthy();
    expect(firstLine?.trim()).toContain('主控');
  });
});

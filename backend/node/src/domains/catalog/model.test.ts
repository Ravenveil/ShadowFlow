import { describe, expect, it } from 'vitest';
import {
  isValidAppId,
  redactBlueprintSnapshot,
  scrubMetadata,
  summaryOf,
  validateBlueprintContract,
} from './model';

describe('app_id 白名单（防路径穿越）', () => {
  it('正常 id 通过', () => {
    expect(isValidAppId('app-auto-research-cloud')).toBe(true);
    expect(isValidAppId('abc_123')).toBe(true);
  });

  it('穿越/空白/NUL 一律拒绝', () => {
    expect(isValidAppId('')).toBe(false);
    expect(isValidAppId('../etc/passwd')).toBe(false);
    expect(isValidAppId('a/b')).toBe(false);
    expect(isValidAppId('a\\b')).toBe(false);
    expect(isValidAppId('a b')).toBe(false);
    expect(isValidAppId('a\u0000b')).toBe(false);
  });
});

describe('快照脱敏（对线安全）', () => {
  it('剥顶层敏感键', () => {
    const out = redactBlueprintSnapshot({
      name: 'arc',
      api_key: 'sk-xxx',
      system_prompt: 'secret prompt',
      private_key: '0xabc',
    });
    expect(out['name']).toBe('arc');
    expect('api_key' in out).toBe(false);
    expect('system_prompt' in out).toBe(false);
    expect('private_key' in out).toBe(false);
  });

  it('穿透 role / role.metadata / sub_agents', () => {
    const out = redactBlueprintSnapshot({
      role_profiles: [
        {
          role_id: 'r1',
          name: '读论文',
          api_key: 'sk-1',
          metadata: { api_key: 'sk-2', note: 'ok' },
          sub_agents: [{ role_id: 'sub', name: '助手', secret: 'x' }],
        },
      ],
    });
    const role = (out['role_profiles'] as Array<Record<string, unknown>>)[0];
    expect('api_key' in role).toBe(false);
    expect((role['metadata'] as Record<string, unknown>)['api_key']).toBeUndefined();
    expect((role['metadata'] as Record<string, unknown>)['note']).toBe('ok');
    const sub = (role['sub_agents'] as Array<Record<string, unknown>>)[0];
    expect('secret' in sub).toBe(false);
    expect(sub['name']).toBe('助手');
  });

  it('tool_policies 的 credentials_ref 打码，knowledge_bindings 也脱敏', () => {
    const out = redactBlueprintSnapshot({
      tool_policies: [{ tool: 'web', credentials_ref: 'vault://x' }],
      knowledge_bindings: [{ kb_id: 'k1', api_key: 'sk' }],
    });
    const tp = (out['tool_policies'] as Array<Record<string, unknown>>)[0];
    expect(tp['credentials_ref']).toBe('[redacted]');
    const kb = (out['knowledge_bindings'] as Array<Record<string, unknown>>)[0];
    expect('api_key' in kb).toBe(false);
    expect(kb['kb_id']).toBe('k1');
  });

  it('metadata 脱敏忽略大小写，含 0g_private_key', () => {
    expect(scrubMetadata({ API_KEY: 'x', '0g_private_key': 'y', keep: 1 })).toEqual({ keep: 1 });
  });

  it('非对象入参 → 空对象（不原样透传）', () => {
    expect(redactBlueprintSnapshot(null)).toEqual({});
    expect(redactBlueprintSnapshot('str')).toEqual({});
    expect(redactBlueprintSnapshot([1, 2])).toEqual({});
  });
});

describe('蓝图契约校验', () => {
  it('缺 name / goal 报顶层错误', () => {
    const errs = validateBlueprintContract({ role_profiles: [{ role_id: 'a', name: 'b' }] });
    expect(errs.top).toContain("field required: 'name'");
    expect(errs.top).toContain("field required: 'goal'");
    expect(errs.roles).toEqual([]);
  });

  it("mode='single' 至少一个 role", () => {
    const errs = validateBlueprintContract({ name: 'n', goal: 'g', mode: 'single', role_profiles: [] });
    expect(errs.top.join('|')).toContain('requires at least one role_profile');
  });

  it("mode='team' 允许零 role（团队模板由 DAG 补）", () => {
    const errs = validateBlueprintContract({ name: 'n', goal: 'g', mode: 'team', role_profiles: [] });
    expect(errs.top).toEqual([]);
  });

  it('role 缺 role_id / name 报逐项错误（同一条目两个缺失各报一条）', () => {
    const errs = validateBlueprintContract({
      name: 'n',
      goal: 'g',
      mode: 'team',
      role_profiles: [{}, { role_id: 'r2' }, 'bad'],
    });
    expect(errs.roles).toEqual([
      "role_profiles[0]: field required: 'role_id'",
      "role_profiles[0]: field required: 'name'",
      "role_profiles[1]: field required: 'name'",
      'role_profiles[2] must be an object',
    ]);
  });

  it('非对象快照直接判错', () => {
    expect(validateBlueprintContract(null).top).toEqual(['blueprint snapshot must be an object']);
  });
});

describe('目录摘要视图', () => {
  it('缺省字段有稳定默认（custom / anonymous / 0）', () => {
    const s = summaryOf({ app_id: 'x' });
    expect(s.app_id).toBe('x');
    expect(s.kit_type).toBe('custom');
    expect(s.author).toBe('anonymous');
    expect(s.fork_count).toBe(0);
    expect(s.forked_from).toBeNull();
  });

  it('mode 与首个 role 的协作契约只在有快照时透传', () => {
    const withSnap = summaryOf({
      app_id: 'arc',
      blueprint_snapshot: {
        mode: 'team',
        role_profiles: [{ collaboration_contract: { handoff: 'dag' } }],
      },
    });
    expect(withSnap.mode).toBe('team');
    expect(withSnap.collaboration_contract).toEqual({ handoff: 'dag' });

    const noSnap = summaryOf({ app_id: 'x' });
    expect('mode' in noSnap).toBe(false);
    expect('collaboration_contract' in noSnap).toBe(false);
  });

  it('scope_hint 存在才写（保持 payload 干净）', () => {
    expect('scope_hint' in summaryOf({ app_id: 'x' })).toBe(false);
    expect(summaryOf({ app_id: 'x', scope_hint: 'team' }).scope_hint).toBe('team');
  });
});

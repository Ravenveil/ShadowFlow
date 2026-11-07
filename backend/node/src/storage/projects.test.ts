/**
 * projects.test.ts — Story 15.16 — Project CRUD smoke test.
 *
 * Run:  npx tsx src/storage/projects.test.ts   (from server/)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log('        detail:', detail);
  }
}

async function inIsolated(
  fn: (mods: {
    projects: typeof import('./projects');
    sqlite: typeof import('./sqlite');
  }) => Promise<void> | void,
): Promise<void> {
  const orig = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-projects-test-'));
  process.chdir(tmp);
  try {
    const sqlite = await import('./sqlite');
    sqlite._resetForTests();
    const projects = await import('./projects');
    await fn({ projects, sqlite });
    sqlite._resetForTests();
  } finally {
    process.chdir(orig);
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log('\n[1] empty list');
  await inIsolated(async ({ projects }) => {
    const list = projects.listProjects();
    check('listProjects() === []', Array.isArray(list) && list.length === 0);
  });

  console.log('\n[2] create + get + list');
  await inIsolated(async ({ projects }) => {
    const p = projects.createProject({ name: 'demo', workspace_path: '/tmp/demo' });
    check('project_id is uuid-ish', /^[0-9a-f-]{36}$/i.test(p.project_id), p.project_id);
    check('name persisted', p.name === 'demo');
    check('workspace_path passes through', p.workspace_path === '/tmp/demo');
    check('created_at iso', /T.*Z$/.test(p.created_at), p.created_at);

    const got = projects.getProject(p.project_id);
    check('getProject returns row', got?.project_id === p.project_id);

    const list = projects.listProjects();
    check('list has 1', list.length === 1);
  });

  console.log('\n[3] default workspace_path under .shadowflow/projects');
  await inIsolated(async ({ projects }) => {
    const p = projects.createProject({ name: 'auto-cwd' });
    check(
      'workspace_path defaults under .shadowflow/projects/<id>',
      p.workspace_path.includes('.shadowflow') &&
        p.workspace_path.endsWith(p.project_id),
      p.workspace_path,
    );
  });

  console.log('\n[4] update');
  await inIsolated(async ({ projects }) => {
    const p = projects.createProject({ name: 'a' });
    // Brief sleep guarantees updated_at moves forward (ISO ms resolution).
    await new Promise((r) => setTimeout(r, 5));
    const updated = projects.updateProject(p.project_id, {
      name: 'a-new',
      skill_id: 'agent-team-blueprint',
    });
    check('update returns row', !!updated);
    check('name updated', updated?.name === 'a-new');
    check('skill_id updated', updated?.skill_id === 'agent-team-blueprint');
    check(
      'updated_at moved forward',
      (updated?.updated_at ?? '') > p.updated_at,
      { before: p.updated_at, after: updated?.updated_at },
    );
  });

  console.log('\n[5] delete + cascade');
  await inIsolated(async ({ projects, sqlite }) => {
    const db = sqlite.getDb();
    const p = projects.createProject({ name: 'doomed' });
    db.prepare(
      `INSERT INTO conversations (conversation_id, project_id, title, created_at, updated_at)
       VALUES ('cz', ?, 'main', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    ).run(p.project_id);

    const ok = projects.deleteProject(p.project_id);
    check('deleteProject returns true', ok);
    check('project gone', projects.getProject(p.project_id) === null);

    const conv = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM conversations WHERE conversation_id='cz'`)
        .get() as { n: number }
    ).n;
    check('conversation cascaded', conv === 0);
  });

  console.log('\n[6] delete missing returns false');
  await inIsolated(async ({ projects }) => {
    check(
      'delete unknown returns false',
      projects.deleteProject('not-a-real-id') === false,
    );
  });

  console.log('\n[7] BE-02 marketing fields round-trip（7 规范字段 + 未识别键捕获袋）');
  await inIsolated(async ({ projects }) => {
    const p = projects.createProject({
      name: 'mkt',
      marketing: {
        customer: '手工艺人工坊',
        goals: { gmv: '10w', channels: ['抖音', '小红书'] },
        cycle: '3个月',
        budget: 50000,
        deliverables: ['短视频20条', '图文30篇'],
        brief: '代运营全案',
        notes: '优先抖音',
        // 未识别键（含 T03 第 7 字段名不确定的任意字段名）——整体捕获不丢
        kpi: 'ROI>=2',
        custom_field: { nested: true },
      },
    });
    check('customer 回读', p.customer === '手工艺人工坊', p.customer);
    check('goals 结构体无损回读', JSON.stringify(p.goals) === JSON.stringify({ gmv: '10w', channels: ['抖音', '小红书'] }), p.goals);
    check('cycle 回读', p.cycle === '3个月', p.cycle);
    check('budget 数值回读', p.budget === 50000, p.budget);
    check('deliverables 数组回读', JSON.stringify(p.deliverables) === JSON.stringify(['短视频20条', '图文30篇']), p.deliverables);
    check('brief 回读', p.brief === '代运营全案', p.brief);
    check('notes 回读', p.notes === '优先抖音', p.notes);
    check('未识别键 kpi 捕获回读', p.kpi === 'ROI>=2', p.kpi);
    check('未识别键 custom_field 结构体回读', JSON.stringify(p.custom_field) === JSON.stringify({ nested: true }), p.custom_field);

    const got = projects.getProject(p.project_id);
    check('getProject 同样平铺回读', got?.customer === '手工艺人工坊' && got?.kpi === 'ROI>=2');

    const list = projects.listProjects();
    check('listProjects 平铺营销字段', list[0]?.brief === '代运营全案');
  });

  console.log('\n[8] BE-02 marketing patch 合并与显式 null 清除');
  await inIsolated(async ({ projects }) => {
    const p = projects.createProject({
      name: 'mkt-patch',
      marketing: { customer: 'A', goals: 'grow', kpi: 'x1', extra_note: 'keep-me' },
    });
    // 局部更新：只覆盖 customer + 新增未识别键；goals/kpi/extra_note 保留
    const u1 = projects.updateProject(p.project_id, {
      marketing: { customer: 'B', region: '华东' },
    });
    check('patch 同键覆盖', u1?.customer === 'B', u1?.customer);
    check('patch 未触碰键保留', u1?.goals === 'grow' && u1?.kpi === 'x1' && u1?.extra_note === 'keep-me');
    check('patch 新增未识别键合并', u1?.region === '华东', u1?.region);

    // 显式 null = 清除（规范字段 + 未识别键同语义）
    const u2 = projects.updateProject(p.project_id, {
      marketing: { goals: null, kpi: null },
    });
    check('显式 null 清除规范字段', u2?.goals === undefined, u2?.goals);
    check('显式 null 清除未识别键', u2?.kpi === undefined, u2?.kpi);
    check('清除不影响其他键', u2?.customer === 'B' && u2?.extra_note === 'keep-me');

    // 补建：老项目（BE-02 前创建、无 marketing 行）patch 不炸且落行
    const legacy = projects.createProject({ name: 'legacy' });
    const u3 = projects.updateProject(legacy.project_id, { marketing: { customer: 'late' } });
    check('无 marketing 行的项目 patch 补建', u3?.customer === 'late', u3?.customer);
  });

  console.log('\n[9] BE-02 workspace 过滤（undefined 不过滤 / null 只匹配未归属 / 字符串严格相等）');
  await inIsolated(async ({ projects }) => {
    projects.createProject({ name: 'w-none' }); // workspace_id=null
    projects.createProject({ name: 'w-a1', workspace_id: 'ws-a' });
    projects.createProject({ name: 'w-a2', workspace_id: 'ws-a' });
    projects.createProject({ name: 'w-b1', workspace_id: 'ws-b' });

    const all = projects.listProjects();
    check('不传 opts 返回全量', all.length === 4, all.length);

    const onlyA = projects.listProjects({ workspace_id: 'ws-a' });
    check('字符串严格相等过滤', onlyA.length === 2 && onlyA.every((p) => p.workspace_id === 'ws-a'), onlyA.length);

    const onlyNone = projects.listProjects({ workspace_id: null });
    check('null 只匹配未归属行', onlyNone.length === 1 && onlyNone[0].name === 'w-none', onlyNone.length);

    const none = projects.listProjects({ workspace_id: 'ws-missing' });
    check('无命中空间返回空', none.length === 0);

    // patch 改空间归属
    const moved = projects.updateProject((onlyA[0].project_id), { workspace_id: 'ws-b' });
    check('patch 可迁移空间归属', moved?.workspace_id === 'ws-b', moved?.workspace_id);
    check('迁移后过滤口径一致', projects.listProjects({ workspace_id: 'ws-a' }).length === 1);
  });

  console.log('\n[10] BE-02 delete 级联营销行');
  await inIsolated(async ({ projects, sqlite }) => {
    const db = sqlite.getDb();
    const p = projects.createProject({ name: 'doomed-mkt', marketing: { customer: 'X', tag: 'y' } });
    check('删除前 marketing 行存在', (() => {
      const n = (db.prepare(`SELECT COUNT(*) AS n FROM marketing_projects WHERE project_id = ?`).get(p.project_id) as { n: number }).n;
      return n === 1;
    })());
    projects.deleteProject(p.project_id);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM marketing_projects WHERE project_id = ?`).get(p.project_id) as { n: number }).n;
    check('delete 级联清除 marketing_projects 行', n === 0, n);
  });

  console.log('\n────────────────────────────────────────');
  console.log(`  ${pass} passed,  ${fail} failed`);
  console.log('────────────────────────────────────────\n');
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('test crashed:', e);
  process.exit(1);
});

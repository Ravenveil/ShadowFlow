/**
 * opc-company.ts — OPC OS company layer（移植自 services/opc_company.py）。
 *
 * 三条硬规则（原样保留）：
 *   1. 员工是可配置、可调用、可追踪的 agent 实例（ID/岗位/权限/模型/成本/绩效）。
 *   2. 每项任务可追到责任人、执行过程、交接记录、成本和交付结果。
 *   3. 风险分级决定谁来批：low 自动放行，medium 部门负责人，high 老板本人。
 *
 * LLM 通路：Python 端 shadowflow.llm 包没有 completion 导出，
 * _llm_complete 恒走 simulated stub。Node 侧同构：恒 simulated，不留假接口。
 */
import * as db from './opc-store';
import type { Row } from './opc-store';

// 模型目录：不同岗位用不同模型，成本与能力都不同。
export const MODEL_CATALOG: Record<string, Row> = {
  'claude-sonnet': { label: 'Claude Sonnet', vendor: 'Anthropic', in_cents: 3.0, out_cents: 15.0, tier: '旗舰' },
  'gpt-4o': { label: 'GPT-4o', vendor: 'OpenAI', in_cents: 2.5, out_cents: 10.0, tier: '旗舰' },
  'gemini-flash': { label: 'Gemini Flash', vendor: 'Google', in_cents: 0.08, out_cents: 0.3, tier: '轻量' },
  'deepseek-chat': { label: 'DeepSeek V3', vendor: 'DeepSeek', in_cents: 0.27, out_cents: 1.1, tier: '性价比' },
  'qwen-max': { label: 'Qwen Max', vendor: 'Alibaba', in_cents: 0.6, out_cents: 1.8, tier: '性价比' },
};

export class CompanyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type JsonLike = any;

function j(value: JsonLike, defaultValue: JsonLike = null): JsonLike {
  const fallback = defaultValue !== null && defaultValue !== undefined ? defaultValue : [];
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function money(cents: JsonLike): number {
  return Math.round(Number(cents) / 100 * 100) / 100;
}

// ------------------------------------------------------------------ 公司

export function createCompany(
  name: string, industry: string, mission: string, ownerName = '老板',
  teamId: string | null = null, cashCents = 0,
): Row {
  const cid = db.newId('co');
  db.x(
    `INSERT INTO companies (id, name, logo, industry, mission, team_id, cash_cents, owner_name, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [cid, name, name.slice(0, 1), industry, mission, teamId, Number(cashCents), ownerName, db.now()],
  );
  return getCompany(cid) as Row;
}

export function getCompany(companyId: string): Row | null {
  return db.q1('SELECT * FROM companies WHERE id = ?', [companyId]);
}

export function listCompanies(): Row[] {
  return db.q('SELECT * FROM companies ORDER BY created_at');
}

export function companyOr404(companyId: string): Row {
  const c = getCompany(companyId);
  if (!c) throw new CompanyError(`公司不存在：${companyId}`, 404);
  return c;
}

// ------------------------------------------------------------------ 组织与员工

export function createDepartment(
  companyId: string, name: string, charter = '', parentId: string | null = null,
  budgetCents = 0, teamId: string | null = null, sort = 0,
): Row {
  const did = db.newId('dept');
  db.x(
    `INSERT INTO departments (id, company_id, name, parent_id, charter, budget_cents, team_id, sort, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [did, companyId, name, parentId, charter, Number(budgetCents), teamId, Number(sort), db.now()],
  );
  return db.q1('SELECT * FROM departments WHERE id = ?', [did]) as Row;
}

export function listDepartments(companyId: string): Row[] {
  return db.q(
    'SELECT * FROM departments WHERE company_id = ? ORDER BY sort, created_at',
    [companyId],
  );
}

export function setDepartmentHead(departmentId: string, employeeId: string): void {
  db.x(
    'UPDATE departments SET head_employee_id = ? WHERE id = ? AND head_employee_id IS NULL',
    [employeeId, departmentId],
  );
}

export function hire(
  companyId: string, name: string, role: string, departmentId: string | null = null,
  title = '', seniority = 'mid', systemPrompt = '', skills: string[] | null = null,
  tools: string[] | null = null, permissions: string[] | null = null,
  modelName = 'gpt-4o', dayRateCents = 1000, employment = 'ai',
): Row {
  if (!MODEL_CATALOG[modelName]) {
    throw new CompanyError(`未知模型：${modelName}`, 422);
  }
  const eid = db.newId('emp');
  db.x(
    `INSERT INTO employees (id, company_id, department_id, name, role, title, avatar, seniority,
                            system_prompt, skills_json, tools_json, permissions_json,
                            model_provider, model_name, status, employment,
                            success_rate, tasks_done, token_cost_cents, day_rate_cents, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      eid, companyId, departmentId, name, role, title || role, name.slice(0, 1), seniority,
      systemPrompt, JSON.stringify(skills ?? []), JSON.stringify(tools ?? []),
      JSON.stringify(permissions ?? []),
      MODEL_CATALOG[modelName].vendor, modelName, 'idle', employment,
      0.0, 0, 0, Number(dayRateCents), db.now(),
    ],
  );
  return getEmployee(eid) as Row;
}

export function getEmployee(employeeId: string): Row | null {
  const e = db.q1('SELECT * FROM employees WHERE id = ?', [employeeId]);
  if (!e) return null;
  for (const k of ['skills_json', 'tools_json', 'permissions_json']) {
    e[k.replace('_json', '')] = j(e[k], []);
  }
  e.model = MODEL_CATALOG[e.model_name || ''] ?? { label: e.model_name || '-' };
  return e;
}

export function roster(companyId: string): Row[] {
  const rows = db.q(
    `SELECT e.*, d.name AS department_name FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.company_id = ? ORDER BY d.sort, e.created_at`,
    [companyId],
  );
  const out: Row[] = [];
  for (const e of rows) {
    e.skills = j(e.skills_json);
    e.tools = j(e.tools_json);
    e.permissions = j(e.permissions_json);
    e.model = MODEL_CATALOG[e.model_name || ''] ?? { label: e.model_name || '-' };
    out.push(e);
  }
  return out;
}

export function fire(employeeId: string, reassignTo: string | null = null): Row {
  const e = getEmployee(employeeId);
  if (!e) throw new CompanyError(`员工不存在：${employeeId}`, 404);
  const openTasks = db.q(
    "SELECT id FROM tasks WHERE assignee_employee_id = ? AND status IN ('todo','running','review')",
    [employeeId],
  );
  if (openTasks.length && !reassignTo) {
    throw new CompanyError(`该员工还有 ${openTasks.length} 项未完成任务，需先指定接手人`, 409);
  }
  if (reassignTo) {
    db.x(
      "UPDATE tasks SET assignee_employee_id = ? WHERE assignee_employee_id = ? AND status IN ('todo','running','review')",
      [reassignTo, employeeId],
    );
  }
  db.x("UPDATE employees SET status = 'offline', employment = 'retired' WHERE id = ?", [employeeId]);
  return { ok: true, reassigned: openTasks.length };
}

export function orgChart(companyId: string): Row {
  const depts = listDepartments(companyId);
  const emps = roster(companyId);
  const byDept = new Map<string, Row[]>();
  for (const e of emps) {
    const key = e.department_id ?? '';
    const list = byDept.get(key) ?? [];
    list.push(e);
    byDept.set(key, list);
  }
  const tree = depts.map((d) => {
    const members = byDept.get(d.id) ?? [];
    const head = members.find((m) => m.id === d.head_employee_id) ?? null;
    return {
      id: d.id,
      name: d.name,
      charter: d.charter ?? null,
      budget: money(d.budget_cents ?? 0),
      head: head ? { id: head.id, name: head.name, title: head.title } : null,
      members: members.map((m) => ({
        id: m.id, name: m.name, title: m.title, avatar: m.avatar,
        status: m.status, model: m.model.label, skills: (m.skills ?? []).slice(0, 3),
      })),
    };
  });
  return { company_id: companyId, departments: tree, headcount: emps.length };
}

// ------------------------------------------------------------------ 项目

export function createProject(
  companyId: string, name: string, goal: string, clientName = '',
  budgetCents = 0, dueAt: string | null = null,
  orderId: string | null = null,
  ownerEmployeeId: string | null = null,
): Row {
  const pid = db.newId('prj');
  const ts = db.now();
  db.x(
    `INSERT INTO opc_projects (id, company_id, name, goal, client_name, owner_employee_id, status,
                               budget_cents, revenue_cents, cost_cents, due_at, order_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [pid, companyId, name, goal, clientName, ownerEmployeeId, 'planning',
      Number(budgetCents), 0, 0, dueAt, orderId, ts, ts],
  );
  return getProject(pid) as Row;
}

export function getProject(projectId: string): Row | null {
  return db.q1('SELECT * FROM opc_projects WHERE id = ?', [projectId]);
}

export function listProjects(companyId: string, limit = 50): Row[] {
  return db.q(
    'SELECT * FROM opc_projects WHERE company_id = ? ORDER BY created_at DESC LIMIT ?',
    [companyId, Number(limit)],
  );
}

function recostProject(projectId: string): void {
  const row = db.q1(
    'SELECT COALESCE(SUM(cost_cents), 0) AS c FROM tasks WHERE project_id = ?',
    [projectId],
  ) as Row;
  db.x('UPDATE opc_projects SET cost_cents = ?, updated_at = ? WHERE id = ?',
    [row.c, db.now(), projectId]);
}

// ------------------------------------------------------------------ 任务协议

export function createTask(
  projectId: string, title: string, brief = '', assignee: string | null = null,
  assigner: string | null = null, dependsOn: string[] | null = null,
  mode = 'pipeline', priority = 'normal', risk = 'medium',
  parentId: string | null = null, dueAt: string | null = null,
): Row {
  const project = getProject(projectId);
  if (!project) throw new CompanyError(`项目不存在：${projectId}`, 404);
  const tid = db.newId('tsk');
  db.x(
    `INSERT INTO tasks (id, project_id, company_id, parent_id, title, brief, assignee_employee_id,
                        assigner_employee_id, status, priority, mode, depends_on_json,
                        cost_cents, due_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      tid, projectId, project.company_id, parentId, title, brief, assignee, assigner,
      'todo', priority, mode, JSON.stringify(dependsOn ?? []), 0, dueAt, db.now(),
    ],
  );
  if (risk === 'medium' || risk === 'high') {
    db.x(
      'UPDATE tasks SET review_json = ? WHERE id = ?',
      [JSON.stringify({ risk, required: true }), tid],
    );
  }
  return getTask(tid) as Row;
}

export function getTask(taskId: string): Row | null {
  const t = db.q1('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!t) return null;
  t.depends_on = j(t.depends_on_json, []);
  t.output = j(t.output_json, null);
  t.handoff = j(t.handoff_json, null);
  t.review = j(t.review_json, null);
  t.input = j(t.input_json, {});
  const emp = t.assignee_employee_id ? getEmployee(t.assignee_employee_id) : null;
  t.assignee = emp
    ? { id: emp.id, name: emp.name, title: emp.title, avatar: emp.avatar }
    : null;
  return t;
}

export function listTasks(opts: {
  project_id?: string | null; company_id?: string | null;
  assignee?: string | null; status?: string | null; limit?: number;
} = {}): Row[] {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const args: any[] = [];
  if (opts.project_id) {
    sql += ' AND project_id = ?';
    args.push(opts.project_id);
  }
  if (opts.company_id) {
    sql += ' AND company_id = ?';
    args.push(opts.company_id);
  }
  if (opts.assignee) {
    sql += ' AND assignee_employee_id = ?';
    args.push(opts.assignee);
  }
  if (opts.status) {
    sql += ' AND status = ?';
    args.push(opts.status);
  }
  sql += ' ORDER BY created_at LIMIT ?';
  args.push(Number(opts.limit ?? 200));
  return db.q(sql, args).map((r) => getTask(r.id) as Row);
}

function depsDone(task: Row): boolean {
  for (const dep of task.depends_on ?? []) {
    const d = db.q1('SELECT status FROM tasks WHERE id = ?', [dep]);
    if (!d || d.status !== 'done') return false;
  }
  return true;
}

export function nextRunnable(projectId: string): Row[] {
  const rows = db.q(
    "SELECT id FROM tasks WHERE project_id = ? AND status = 'todo' ORDER BY created_at",
    [projectId],
  );
  const ready: Row[] = [];
  for (const r of rows) {
    const t = getTask(r.id);
    if (t && depsDone(t)) ready.push(t);
  }
  return ready;
}

export function planProject(projectId: string, playbook: Row[]): Row[] {
  const project = getProject(projectId);
  if (!project) throw new CompanyError(`项目不存在：${projectId}`, 404);
  const byRole = new Map<string, Row>(roster(project.company_id).map((e) => [e.role, e]));
  const created: Record<string, Row> = {};
  for (const item of playbook) {
    const emp = byRole.get(item.role);
    if (!emp) continue;
    const deps = (item.after ?? [])
      .filter((k: string) => created[k])
      .map((k: string) => created[k].id);
    const t = createTask(
      projectId,
      item.title,
      item.brief ?? '',
      emp.id,
      null,
      deps,
      item.mode ?? 'pipeline',
      'normal',
      item.risk ?? 'low',
    );
    created[item.key] = t;
  }
  advanceProject(projectId);
  return Object.values(created).map((t) => getTask(t.id) as Row);
}

export function handoffContext(task: Row): Row[] {
  const blocks: Row[] = [];
  for (const depId of task.depends_on ?? []) {
    const dep = getTask(depId);
    if (!dep) continue;
    const out = dep.output ?? {};
    blocks.push({
      from_task: dep.id,
      from_title: dep.title,
      from_employee: dep.assignee ? dep.assignee.name : null,
      summary: out.summary ?? out.text ?? '',
      artifact: out.artifact ?? null,
    });
  }
  return blocks;
}

function estimateTokens(prompt: string, output: string): [number, number] {
  // 中文约 1.5 字/token，保守估计
  return [Math.round(prompt.length / 1.5), Math.round(output.length / 1.5)];
}

function summarize(text: string, limit = 160): string {
  const line = (text ?? '').split(/\s+/).join(' ');
  return line.slice(0, limit) + (line.length > limit ? '…' : '');
}

function forceAutoApprove(company: Row | null): boolean {
  return (company ?? {}).status === 'demo_auto';
}

/** Python _llm_complete 同构：无 completion 通路 → 恒 simulated stub。 */
function llmComplete(system: string, user: string, meta: Row): { text: string; mode: string } {
  void system;
  void user;
  return {
    text: `[simulated] 已按岗位要求处理任务：${meta.task ?? ''}`,
    mode: 'simulated',
  };
}

export function runTask(taskId: string, force = false): Row {
  const task = getTask(taskId);
  if (!task) throw new CompanyError(`任务不存在：${taskId}`, 404);
  if (task.status === 'done' || task.status === 'cancelled') {
    throw new CompanyError(`任务已${task.status}，不能重复执行`, 409);
  }
  if (!force && !depsDone(task)) {
    throw new CompanyError('上游任务尚未完成，任务被阻塞', 409);
  }

  const emp = task.assignee_employee_id ? getEmployee(task.assignee_employee_id) : null;
  if (!emp) throw new CompanyError('任务没有负责人，先指派员工', 422);
  if (emp.status === 'offline') throw new CompanyError(`${emp.name} 已离职`, 409);

  const project = getProject(task.project_id) as Row;
  const company = getCompany(task.company_id) as Row;

  db.x("UPDATE tasks SET status = 'running', started_at = ? WHERE id = ?", [db.now(), taskId]);
  db.x("UPDATE employees SET status = 'working' WHERE id = ?", [emp.id]);

  const upstream = handoffContext(task);
  const prompt = buildPrompt(company, project, emp, task, upstream, '');

  const result = llmComplete(
    emp.system_prompt || `你是${company.name}的${emp.title}。`,
    prompt,
    {
      role: emp.role,
      task: task.title,
      feedback: (task.review ?? {}).rejected_reason ?? '',
    },
  );
  const text = result.text || '';
  const mode = result.mode ?? 'simulated';

  const [inTok, outTok] = estimateTokens(prompt, text);
  const catalog = MODEL_CATALOG[emp.model_name || ''] ?? { in_cents: 0, out_cents: 0 };
  const modelCost = Math.round((inTok / 1000) * catalog.in_cents + (outTok / 1000) * catalog.out_cents);
  // 工时分摊：一个任务按 1/8 个工作日计
  const laborCost = Math.round((emp.day_rate_cents ?? 0) / 8);
  const cost = modelCost + laborCost;

  const output = {
    text,
    summary: summarize(text),
    mode,
    model: emp.model_name,
    tokens: { in: inTok, out: outTok },
    cost_cents: cost,
    cost_breakdown: { model: modelCost, labor: laborCost },
  };

  // 风险闸门：中高风险任务做完不直接算完，先挂审批
  const risk = (task.review ?? {}).risk ?? 'low';
  const needsApproval = (risk === 'medium' || risk === 'high') && !forceAutoApprove(company);

  db.x(
    `UPDATE tasks SET status = ?, output_json = ?, handoff_json = ?, cost_cents = ?,
                       finished_at = ? WHERE id = ?`,
    [
      needsApproval ? 'review' : 'done',
      JSON.stringify(output),
      JSON.stringify(upstream),
      cost, db.now(), taskId,
    ],
  );
  db.x(
    `UPDATE employees SET tasks_done = tasks_done + 1, token_cost_cents = token_cost_cents + ?,
                          status = ? WHERE id = ?`,
    [cost, needsApproval ? 'awaiting_approval' : 'idle', emp.id],
  );
  db.x(
    `INSERT INTO ledger (id, company_id, project_id, kind, category, amount_cents, description, ref_id, occurred_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [db.newId('led'), task.company_id, project.id, 'expense', '执行成本', cost,
      `${emp.name} · ${task.title}`, taskId, db.now()],
  );
  recostProject(project.id);

  let approval: Row | null = null;
  if (needsApproval) {
    approval = requestApproval({
      company_id: task.company_id,
      project_id: project.id,
      task_id: taskId,
      kind: 'task_delivery',
      title: `${task.title} · 待验收`,
      risk,
      payload: { summary: output.summary, by: emp.name, cost_cents: cost },
      requested_by: emp.id,
    });
  }

  return { task: getTask(taskId), approval, output };
}

function buildPrompt(
  company: Row, project: Row, emp: Row, task: Row,
  upstream: Row[], ctxBlock: string,
): string {
  const parts = [
    `公司：${company.name}（${company.industry ?? ''}）`,
    `项目：${project.name}｜目标：${project.goal ?? ''}`,
    `你的岗位：${emp.title}（${emp.seniority ?? 'mid'}）`,
    `技能：${(emp.skills ?? []).join('、') || '按岗位常规执行'}`,
    `本次任务：${task.title}`,
  ];
  if (task.brief) parts.push(`要求：${task.brief}`);
  if (upstream.length) {
    const lines = upstream.map(
      (u) => `- ${u.from_employee ?? '上游'} 交付《${u.from_title}》：${(u.summary ?? '').slice(0, 120)}`,
    );
    parts.push('上游交接：\n' + lines.join('\n'));
  }
  if (ctxBlock) parts.push('公司知识库：\n' + ctxBlock);
  parts.push('请直接交付可用的工作成果，不要解释过程。');
  return parts.join('\n\n');
}

/** Python run_ready：并行跑当前所有可执行任务。better-sqlite3 同步，天然串行执行。 */
function runReady(projectId: string, workers = 3): Row[] {
  const ready = nextRunnable(projectId);
  if (!ready.length) return [];
  const batch = ready.slice(0, workers);
  const out: Row[] = [];
  for (const t of batch) {
    try {
      out.push(runTask(t.id));
    } catch (err) {
      out.push({ error: err instanceof CompanyError ? err.message : String(err) });
    }
  }
  return out;
}

export function runProject(projectId: string, maxRounds = 12, workers = 3): Row {
  const project = getProject(projectId);
  if (!project) throw new CompanyError(`项目不存在：${projectId}`, 404);
  db.x("UPDATE opc_projects SET status = 'executing', updated_at = ? WHERE id = ?",
    [db.now(), projectId]);

  const rounds: Row[] = [];
  let stopped = 'completed';
  for (let i = 0; i < maxRounds; i++) {
    const batch = runReady(projectId, workers);
    if (!batch.length) break;
    const rows = batch.map((r) => {
      const task = r.task ?? {};
      return {
        task_id: task.id ?? null,
        title: task.title ?? null,
        by: task.assignee ? task.assignee.name : null,
        status: task.status ?? null,
        cost: money(task.cost_cents ?? 0),
        needs_approval: Boolean(r.approval),
        error: r.error ?? null,
      };
    });
    rounds.push(rows);
    if (batch.some((r) => r.approval)) {
      stopped = 'approval';
      break;
    }
  }
  // Python for-else：循环跑满 max_rounds 未 break → stopped = max_rounds
  if (stopped === 'completed' && rounds.length === maxRounds && maxRounds > 0) {
    stopped = 'max_rounds';
  }

  advanceProject(projectId);
  const pending = listApprovals(project.company_id, 'pending')
    .filter((a) => a.project_id === projectId);
  return {
    project: getProject(projectId),
    rounds,
    stopped,
    pending_approvals: pending,
    tasks: listTasks({ project_id: projectId }),
  };
}

// ------------------------------------------------------------------ 审批

export function requestApproval(opts: {
  company_id: string; project_id: string | null; task_id: string | null;
  kind: string; title: string; risk?: string; payload?: Row | null;
  requested_by?: string | null;
}): Row {
  const aid = db.newId('apr');
  db.x(
    `INSERT INTO approvals (id, company_id, project_id, task_id, kind, title, risk, payload_json,
                            requested_by, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [aid, opts.company_id, opts.project_id, opts.task_id, opts.kind, opts.title,
      opts.risk ?? 'medium', JSON.stringify(opts.payload ?? {}), opts.requested_by ?? null,
      'pending', db.now()],
  );
  return getApproval(aid) as Row;
}

export function getApproval(approvalId: string): Row | null {
  const a = db.q1('SELECT * FROM approvals WHERE id = ?', [approvalId]);
  if (a) a.payload = j(a.payload_json, {});
  return a;
}

export function listApprovals(companyId: string, status: string | null = null, limit = 50): Row[] {
  let sql = 'SELECT * FROM approvals WHERE company_id = ?';
  const args: any[] = [companyId];
  if (status) {
    sql += ' AND status = ?';
    args.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(Number(limit));
  return db.q(sql, args).map((a) => ({ ...a, payload: j(a.payload_json, {}) }));
}

export function decideApproval(
  approvalId: string, decision: string, note = '', decidedBy = '老板',
): Row {
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new CompanyError('决定只能是 approved 或 rejected', 422);
  }
  const a = getApproval(approvalId);
  if (!a) throw new CompanyError(`审批不存在：${approvalId}`, 404);
  if (a.status !== 'pending') throw new CompanyError('该审批已处理', 409);

  db.x(
    'UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?',
    [decision, decidedBy, db.now(), note, approvalId],
  );

  if (a.task_id) {
    const task = getTask(a.task_id);
    if (task) {
      if (decision === 'approved') {
        db.x("UPDATE tasks SET status = 'done' WHERE id = ?", [a.task_id]);
        if (task.assignee_employee_id) {
          db.x("UPDATE employees SET status = 'idle' WHERE id = ?", [task.assignee_employee_id]);
        }
      } else {
        // 驳回即返工：任务回 todo，保留上一版产出作为证据
        const review = task.review ?? {};
        review.rejected_reason = note || '验收未通过';
        review.rejected_at = db.now();
        db.x("UPDATE tasks SET status = 'todo', review_json = ? WHERE id = ?",
          [JSON.stringify(review), a.task_id]);
        if (task.assignee_employee_id) {
          db.x("UPDATE employees SET status = 'idle' WHERE id = ?", [task.assignee_employee_id]);
        }
      }
    }
  }

  if (a.project_id) advanceProject(a.project_id);
  return getApproval(approvalId) as Row;
}

export function advanceProject(projectId: string): void {
  const project = getProject(projectId);
  if (!project) return;
  const rows = db.q(
    'SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status',
    [projectId],
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = Number(r.n);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total && (counts.done ?? 0) === total) {
    db.x("UPDATE opc_projects SET status = 'delivered', updated_at = ? WHERE id = ?",
      [db.now(), projectId]);
  } else if (counts.running || counts.review) {
    db.x("UPDATE opc_projects SET status = 'executing', updated_at = ? WHERE id = ?",
      [db.now(), projectId]);
  } else if (project.status === 'planning' && total) {
    db.x("UPDATE opc_projects SET status = 'ready', updated_at = ? WHERE id = ?",
      [db.now(), projectId]);
  }
}

// ------------------------------------------------------------------ 经营数据

export function pnl(companyId: string): Row {
  const income = Number((db.q1(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'income'",
    [companyId],
  ) as Row).s);
  const expense = Number((db.q1(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ledger WHERE company_id = ? AND kind = 'expense'",
    [companyId],
  ) as Row).s);
  const projects = listProjects(companyId, 200);
  const delivered = projects.filter((p) => p.status === 'delivered');
  return {
    revenue: money(income),
    cost: money(expense),
    profit: money(income - expense),
    margin: income ? Math.round(((income - expense) / income) * 1000) / 10 : 0.0,
    projects_total: projects.length,
    projects_delivered: delivered.length,
    avg_project_cost: projects.length ? money(expense / projects.length) : 0,
  };
}

export function dashboard(companyId: string): Row {
  const company = companyOr404(companyId);
  const emps = roster(companyId);
  const projects = listProjects(companyId, 200);
  const tasks = listTasks({ company_id: companyId, limit: 500 });
  const pending = listApprovals(companyId, 'pending');

  const byStatus: Record<string, number> = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  return {
    company,
    pnl: pnl(companyId),
    headcount: {
      total: emps.length,
      working: emps.filter((e) => e.status === 'working').length,
      idle: emps.filter((e) => e.status === 'idle').length,
      awaiting: emps.filter((e) => e.status === 'awaiting_approval').length,
    },
    tasks: { total: tasks.length, by_status: byStatus },
    approvals_pending: pending.length,
    projects: projects.slice(0, 6).map((p) => ({
      id: p.id, name: p.name, status: p.status, client: p.client_name ?? null,
      budget: money(p.budget_cents), cost: money(p.cost_cents),
      revenue: money(p.revenue_cents),
    })),
  };
}

export function addIncome(
  companyId: string, projectId: string | null, amountCents: number,
  description: string, category = '项目收入', refId: string | null = null,
): Row {
  db.x(
    `INSERT INTO ledger (id, company_id, project_id, kind, category, amount_cents, description, ref_id, occurred_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [db.newId('led'), companyId, projectId, 'income', category, Number(amountCents),
      description, refId, db.now()],
  );
  if (projectId) {
    db.x(
      'UPDATE opc_projects SET revenue_cents = revenue_cents + ?, updated_at = ? WHERE id = ?',
      [Number(amountCents), db.now(), projectId],
    );
  }
  return pnl(companyId);
}

export function ledgerEntries(companyId: string, limit = 100): Row[] {
  const rows = db.q(
    'SELECT * FROM ledger WHERE company_id = ? ORDER BY occurred_at DESC LIMIT ?',
    [companyId, Number(limit)],
  );
  for (const r of rows) r.amount = money(r.amount_cents);
  return rows;
}

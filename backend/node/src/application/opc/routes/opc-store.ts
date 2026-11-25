/**
 * opc-store.ts — OPC OS sqlite 存储层（单后端迁移·第三批 opc 域）。
 *
 * 逐表移植自 backend/python/shadowflow/services/opc_store.py：
 * 独立 opc.sqlite 文件（与 app.sqlite 解耦，镜像 Python 的
 * <repo>/.shadowflow/opc.sqlite），legacy↔single 读写同一份数据。
 *
 * 路径解析优先级（对齐 Python opc_store.py）：
 *   1. SHADOWFLOW_OPC_DB — 直接指定 sqlite 文件路径（最高）
 *   2. repoDataDir()/opc.sqlite — SHADOWFLOW_DATA_DIR 或仓库根 .shadowflow
 *      （对齐 Python 的 SHADOWFLOW_HOME/.shadowflow）
 *
 * Python 用单连接 + RLock；Node better-sqlite3 同步 API，单进程内天然串行，
 * 无需加锁。schema 全部 IF NOT EXISTS，首次连接时幂等建表（Python 在
 * server startup 钩子里 db_init()，Node 收口到 getOpcDb() 首连时刻）。
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'node:crypto';
import { repoDataDir } from '../../../storage/repo-root';

export type Row = Record<string, any>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  industry TEXT,
  mission TEXT,
  team_id TEXT,
  currency TEXT DEFAULT 'CNY',
  cash_cents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'operating',
  owner_name TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  head_employee_id TEXT,
  charter TEXT,
  budget_cents INTEGER DEFAULT 0,
  team_id TEXT,
  sort INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  department_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  title TEXT,
  avatar TEXT,
  seniority TEXT,
  system_prompt TEXT,
  skills_json TEXT,
  tools_json TEXT,
  permissions_json TEXT,
  model_provider TEXT,
  model_name TEXT,
  status TEXT DEFAULT 'idle',
  employment TEXT DEFAULT 'ai',
  success_rate REAL DEFAULT 0,
  tasks_done INTEGER DEFAULT 0,
  token_cost_cents INTEGER DEFAULT 0,
  day_rate_cents INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS opc_projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  client_name TEXT,
  owner_employee_id TEXT,
  status TEXT DEFAULT 'planning',
  budget_cents INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  due_at TEXT,
  order_id TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  brief TEXT,
  assignee_employee_id TEXT,
  assigner_employee_id TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'normal',
  mode TEXT DEFAULT 'pipeline',
  depends_on_json TEXT,
  input_json TEXT,
  output_json TEXT,
  handoff_json TEXT,
  review_json TEXT,
  run_id TEXT,
  cost_cents INTEGER DEFAULT 0,
  due_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  risk TEXT DEFAULT 'medium',
  payload_json TEXT,
  requested_by TEXT,
  status TEXT DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT,
  kind TEXT NOT NULL,
  category TEXT,
  amount_cents INTEGER NOT NULL,
  description TEXT,
  ref_id TEXT,
  occurred_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT,
  detail TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'CNY',
  team_id TEXT NOT NULL,
  deliverable TEXT,
  eta_hint TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT,
  buyer_name TEXT,
  contact TEXT,
  requirement TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  pay_provider TEXT,
  pay_txn_id TEXT,
  run_id TEXT,
  project_id TEXT,
  deliverable_json TEXT,
  created_at TEXT,
  paid_at TEXT,
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  ts TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_company ON departments(company_id, sort);
CREATE INDEX IF NOT EXISTS idx_emp_company ON employees(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_opcproj_company ON opc_projects(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_project ON tasks(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_status ON approvals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON ledger(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orderev ON order_events(order_id, seq);
`;

let _db: Database.Database | null = null;

function dbPath(): string {
  const override = (process.env.SHADOWFLOW_OPC_DB ?? '').trim();
  if (override) return path.resolve(override);
  return path.join(repoDataDir(), 'opc.sqlite');
}

export function getOpcDb(): Database.Database {
  if (_db) return _db;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // 与 Python conn() 相同的三条 pragma。
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  _db = db;
  return db;
}

/** Test helper：关句柄，下一个 getOpcDb() 重新按 cwd 解析。 */
export function _resetOpcForTests(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* ignore */
    }
    _db = null;
  }
}

/** 对齐 Python opc_store.now()：本地时间 ISO 前段 + 毫秒。 */
export function now(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.` +
    p(d.getMilliseconds(), 3)
  );
}

/** 对齐 Python new_id：{prefix}_{10 位 hex}。 */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString('hex')}`;
}

export function x(sql: string, args: any[] = []): number | undefined {
  const info = getOpcDb().prepare(sql).run(...args);
  return Number(info.lastInsertRowid);
}

export function q(sql: string, args: any[] = []): Row[] {
  return getOpcDb().prepare(sql).all(...args) as Row[];
}

export function q1(sql: string, args: any[] = []): Row | null {
  const rows = q(sql, args);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- order events

/** Per-order 单调 seq，语义同 backend-poc / Python emit_order。 */
export function emitOrder(orderId: string, type: string, payload: Row = {}): number {
  const row = q1('SELECT COALESCE(MAX(seq), 0) AS s FROM order_events WHERE order_id = ?', [orderId]);
  const seq = (row ? Number(row.s) : 0) + 1;
  x(
    'INSERT INTO order_events (order_id, seq, type, payload, ts) VALUES (?,?,?,?,?)',
    [orderId, seq, type, JSON.stringify(payload ?? {}), now()],
  );
  return seq;
}

export function orderEventsSince(orderId: string, since = 0): Row[] {
  const rows = q(
    'SELECT seq, type, payload, ts FROM order_events WHERE order_id = ? AND seq > ? ORDER BY seq',
    [orderId, Number(since)],
  );
  for (const r of rows) {
    if (typeof r.payload === 'string') {
      try {
        r.payload = JSON.parse(r.payload);
      } catch {
        r.payload = {};
      }
    } else {
      r.payload = {};
    }
  }
  return rows;
}

// -------------------------------------------------------------------- commerce

export function saveProduct(p: Row): Row | null {
  x(
    `INSERT INTO products (id, name, summary, detail, price_cents, currency, team_id,
                           deliverable, eta_hint, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, summary=excluded.summary, detail=excluded.detail,
       price_cents=excluded.price_cents, currency=excluded.currency,
       team_id=excluded.team_id, deliverable=excluded.deliverable,
       eta_hint=excluded.eta_hint, active=excluded.active`,
    [
      p.id, p.name, p.summary ?? '', p.detail ?? '',
      Number(p.price_cents), p.currency ?? 'CNY', p.team_id,
      p.deliverable ?? '', p.eta_hint ?? '', Number(p.active ?? 1),
      p.created_at || now(),
    ],
  );
  return getProduct(p.id);
}

export function getProduct(productId: string): Row | null {
  return q1('SELECT * FROM products WHERE id = ?', [productId]);
}

export function listProducts(activeOnly = true): Row[] {
  let sql = 'SELECT * FROM products';
  if (activeOnly) sql += ' WHERE active = 1';
  return q(sql + ' ORDER BY price_cents');
}

export function createOrder(o: Row): Row | null {
  x(
    `INSERT INTO orders (id, product_id, product_name, buyer_name, contact, requirement,
                         amount_cents, status, pay_provider, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      o.id, o.product_id, o.product_name ?? '', o.buyer_name ?? '',
      o.contact ?? '', o.requirement ?? '', Number(o.amount_cents),
      o.status, o.pay_provider ?? '', o.created_at || now(),
    ],
  );
  return getOrder(o.id);
}

const ORDER_FIELDS = [
  'status', 'pay_provider', 'pay_txn_id', 'run_id', 'project_id',
  'deliverable_json', 'paid_at', 'delivered_at',
];

export function updateOrder(orderId: string, fields: Row): Row | null {
  const keys = Object.keys(fields).filter(
    (k) => ORDER_FIELDS.includes(k) && fields[k] !== undefined,
  );
  if (!keys.length) return getOrder(orderId);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  x(`UPDATE orders SET ${sets} WHERE id = ?`, [...keys.map((k) => fields[k]), orderId]);
  return getOrder(orderId);
}

export function getOrder(orderId: string): Row | null {
  const o = q1('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (o && o.deliverable_json) {
    try {
      o.deliverable = JSON.parse(o.deliverable_json);
    } catch {
      o.deliverable = null;
    }
  }
  return o;
}

export function listOrders(limit = 50): Row[] {
  return q('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?', [Number(limit)]);
}

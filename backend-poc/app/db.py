"""SQLite persistence layer: teams, runs, loop iterations, checkpoints, events, KB."""

import json
import sqlite3
import threading
import time
import uuid

from .config import DB_PATH

_LOCK = threading.RLock()
_CONN = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dag_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  stop_requested INTEGER DEFAULT 0,
  demo_json TEXT,
  result_json TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS run_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  title TEXT,
  agent TEXT,
  status TEXT,
  attempt INTEGER DEFAULT 1,
  round INTEGER,
  output TEXT,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  round INTEGER,
  action TEXT,
  verification TEXT,
  decision TEXT,
  score REAL,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  node_id TEXT,
  label TEXT,
  state TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS kb_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  kind TEXT,
  source TEXT,
  created_at TEXT
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
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orderev ON order_events(order_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_nodes_run ON run_nodes(run_id);
CREATE INDEX IF NOT EXISTS idx_iter_run ON iterations(run_id);

-- ---------------------------------------------------------------- OPC OS：公司 / 组织 / 任务 / 治理
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
CREATE TABLE IF NOT EXISTS projects (
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
CREATE INDEX IF NOT EXISTS idx_dept_company ON departments(company_id, sort);
CREATE INDEX IF NOT EXISTS idx_emp_company ON employees(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_proj_company ON projects(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_project ON tasks(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_status ON approvals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON ledger(company_id, occurred_at);
"""


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()) + ".%03d" % (int(time.time() * 1000) % 1000)


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def conn():
    global _CONN
    if _CONN is None:
        _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
        _CONN.execute("PRAGMA journal_mode=WAL")
        _CONN.execute("PRAGMA synchronous=NORMAL")
    return _CONN


def init():
    with _LOCK:
        c = conn()
        c.executescript(SCHEMA)
        c.commit()
        _migrate()


def _migrate():
    """轻量向前迁移：老库里缺的列补上，不清数据。"""
    try:
        cols = {r["name"] for r in q("PRAGMA table_info(orders)")}
        if "project_id" not in cols:
            x("ALTER TABLE orders ADD COLUMN project_id TEXT")
    except Exception:  # noqa: BLE001 - 迁移失败不该阻止启动
        pass


def x(sql, args=()):
    with _LOCK:
        c = conn()
        cur = c.execute(sql, args)
        c.commit()
        return cur.lastrowid


def q(sql, args=()):
    with _LOCK:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def q1(sql, args=()):
    rows = q(sql, args)
    return rows[0] if rows else None


# ---------------------------------------------------------------- events

def emit(run_id, type_, payload=None):
    """Append an engine event. seq is per-run and monotonic, so SSE can replay by id."""
    with _LOCK:
        row = q1("SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE run_id = ?", (run_id,))
        seq = int(row["s"]) + 1 if row else 1
        x(
            "INSERT INTO events (run_id, seq, type, payload, ts) VALUES (?,?,?,?,?)",
            (run_id, seq, type_, json.dumps(payload or {}, ensure_ascii=False), now()),
        )
    return seq


def events_since(run_id, since=0):
    return q(
        "SELECT seq, type, payload, ts FROM events WHERE run_id = ? AND seq > ? ORDER BY seq",
        (run_id, since),
    )


# ---------------------------------------------------------------- teams

def save_team(team):
    x(
        """INSERT OR REPLACE INTO teams (id, name, description, dag_json, policy_json, version, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (
            team["id"],
            team["name"],
            team.get("description", ""),
            json.dumps(team["dag"], ensure_ascii=False),
            json.dumps(team["policy"], ensure_ascii=False),
            int(team.get("version", 1)),
            now(),
        ),
    )


def get_team(team_id):
    row = q1("SELECT * FROM teams WHERE id = ?", (team_id,))
    if not row:
        return None
    row["dag"] = json.loads(row.pop("dag_json"))
    row["policy"] = json.loads(row.pop("policy_json"))
    return row


def list_teams():
    out = []
    for row in q("SELECT * FROM teams ORDER BY created_at"):
        row["dag"] = json.loads(row.pop("dag_json"))
        row["policy"] = json.loads(row.pop("policy_json"))
        out.append(row)
    return out


# ---------------------------------------------------------------- runs

def create_run(team_id, task, demo=None):
    run_id = new_id("run")
    ts = now()
    x(
        "INSERT INTO runs (id, team_id, task, status, stop_requested, demo_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        (run_id, team_id, task, "queued", 0, json.dumps(demo or {}, ensure_ascii=False), ts, ts),
    )
    return run_id


def get_run(run_id):
    row = q1("SELECT * FROM runs WHERE id = ?", (run_id,))
    if not row:
        return None
    row["demo"] = json.loads(row.pop("demo_json") or "{}")
    row["result"] = json.loads(row.pop("result_json") or "null")
    return row


def update_run(run_id, **fields):
    if not fields:
        return
    fields["updated_at"] = now()
    cols = ", ".join(f"{k} = ?" for k in fields)
    x(f"UPDATE runs SET {cols} WHERE id = ?", tuple(fields.values()) + (run_id,))


def list_runs(limit=20):
    rows = q("SELECT id, team_id, task, status, created_at, updated_at FROM runs ORDER BY created_at DESC LIMIT ?", (limit,))
    return rows


def stop_requested(run_id):
    row = q1("SELECT stop_requested FROM runs WHERE id = ?", (run_id,))
    return bool(row and row["stop_requested"])


# ---------------------------------------------------------------- node attempts

def record_node(run_id, node_id, title, agent, status, attempt, round_, output=None):
    x(
        """INSERT INTO run_nodes (run_id, node_id, title, agent, status, attempt, round, output, started_at, finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (run_id, node_id, title, agent, status, attempt, round_, json.dumps(output, ensure_ascii=False) if output else None, now(), now()),
    )


def node_attempts(run_id):
    return q("SELECT * FROM run_nodes WHERE run_id = ? ORDER BY id", (run_id,))


def latest_outputs(run_id):
    """node_id -> last successful output, used for breakpoint resume."""
    out = {}
    for row in q("SELECT * FROM run_nodes WHERE run_id = ? AND status = 'completed' ORDER BY id", (run_id,)):
        if row["output"]:
            out[row["node_id"]] = json.loads(row["output"])
    return out


def list_run_nodes(run_id):
    return q(
        """SELECT node_id, title, agent, status, attempt, round, output, started_at, finished_at
           FROM run_nodes WHERE run_id = ? ORDER BY id""",
        (run_id,),
    )


# ---------------------------------------------------------------- loop iterations

def record_iteration(run_id, node_id, round_, action, verification, decision, score):
    x(
        "INSERT INTO iterations (run_id, node_id, round, action, verification, decision, score, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (run_id, node_id, round_, action, verification, decision, float(score), now()),
    )


def list_iterations(run_id):
    return q("SELECT * FROM iterations WHERE run_id = ? ORDER BY id", (run_id,))


# ---------------------------------------------------------------- checkpoints

def save_checkpoint(run_id, node_id, label, state):
    x(
        "INSERT INTO checkpoints (run_id, node_id, label, state, created_at) VALUES (?,?,?,?,?)",
        (run_id, node_id, label, json.dumps(state, ensure_ascii=False), now()),
    )


def list_checkpoints(run_id):
    return q("SELECT * FROM checkpoints WHERE run_id = ? ORDER BY id", (run_id,))


# ---------------------------------------------------------------- knowledge base

def upsert_kb(entry):
    x(
        "INSERT OR REPLACE INTO kb_entries (id, title, content, tags, kind, source, created_at) VALUES (?,?,?,?,?,?,?)",
        (
            entry["id"],
            entry["title"],
            entry["content"],
            json.dumps(entry.get("tags", []), ensure_ascii=False),
            entry.get("kind", "term"),
            entry.get("source", "manual"),
            now(),
        ),
    )


def all_kb():
    rows = q("SELECT * FROM kb_entries ORDER BY created_at")
    for r in rows:
        r["tags"] = json.loads(r["tags"] or "[]")
    return rows


# ---------------------------------------------------------------- commerce

def save_product(p):
    x(
        """INSERT INTO products (id, name, summary, detail, price_cents, currency, team_id,
                                 deliverable, eta_hint, active, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, summary=excluded.summary, detail=excluded.detail,
             price_cents=excluded.price_cents, currency=excluded.currency,
             team_id=excluded.team_id, deliverable=excluded.deliverable,
             eta_hint=excluded.eta_hint, active=excluded.active""",
        (
            p["id"], p["name"], p.get("summary", ""), p.get("detail", ""),
            int(p["price_cents"]), p.get("currency", "CNY"), p["team_id"],
            p.get("deliverable", ""), p.get("eta_hint", ""), int(p.get("active", 1)),
            p.get("created_at") or now(),
        ),
    )
    return get_product(p["id"])


def get_product(product_id):
    return q1("SELECT * FROM products WHERE id = ?", (product_id,))


def list_products(active_only=True):
    sql = "SELECT * FROM products"
    if active_only:
        sql += " WHERE active = 1"
    return q(sql + " ORDER BY price_cents")


def create_order(o):
    x(
        """INSERT INTO orders (id, product_id, product_name, buyer_name, contact, requirement,
                               amount_cents, status, pay_provider, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            o["id"], o["product_id"], o.get("product_name", ""), o.get("buyer_name", ""),
            o.get("contact", ""), o.get("requirement", ""), int(o["amount_cents"]),
            o["status"], o.get("pay_provider", ""), o.get("created_at") or now(),
        ),
    )
    return get_order(o["id"])


ORDER_FIELDS = {
    "status", "pay_provider", "pay_txn_id", "run_id", "project_id",
    "deliverable_json", "paid_at", "delivered_at",
}


def update_order(order_id, **fields):
    keys = [k for k in fields if k in ORDER_FIELDS]
    if not keys:
        return get_order(order_id)
    sets = ", ".join(f"{k} = ?" for k in keys)
    x(f"UPDATE orders SET {sets} WHERE id = ?", tuple(fields[k] for k in keys) + (order_id,))
    return get_order(order_id)


def get_order(order_id):
    o = q1("SELECT * FROM orders WHERE id = ?", (order_id,))
    if o and o.get("deliverable_json"):
        try:
            o["deliverable"] = json.loads(o["deliverable_json"])
        except json.JSONDecodeError:
            o["deliverable"] = None
    return o


def order_by_run(run_id):
    return q1("SELECT * FROM orders WHERE run_id = ?", (run_id,))


def list_orders(limit=50):
    return q("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (int(limit),))


def emit_order(order_id, type_, payload=None):
    """Order timeline. Same seq semantics as run events so the buyer page can poll/replay."""
    with _LOCK:
        row = q1("SELECT COALESCE(MAX(seq), 0) AS s FROM order_events WHERE order_id = ?", (order_id,))
        seq = int(row["s"]) + 1 if row else 1
        x(
            "INSERT INTO order_events (order_id, seq, type, payload, ts) VALUES (?,?,?,?,?)",
            (order_id, seq, type_, json.dumps(payload or {}, ensure_ascii=False), now()),
        )
        return seq


def order_events_since(order_id, since=0):
    rows = q(
        "SELECT seq, type, payload, ts FROM order_events WHERE order_id = ? AND seq > ? ORDER BY seq",
        (order_id, int(since)),
    )
    for r in rows:
        try:
            r["payload"] = json.loads(r["payload"])
        except json.JSONDecodeError:
            r["payload"] = {}
    return rows

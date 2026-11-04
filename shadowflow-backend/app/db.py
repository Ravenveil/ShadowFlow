"""SQLite persistence layer: teams, runs, loop iterations, checkpoints, events, KB."""

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from . import bus
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
  scope_services TEXT,
  scope_roles TEXT,
  archived INTEGER DEFAULT 0,
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
  access_key TEXT,
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
-- 客户反馈（v0.4.9）：交付之后客户说「这段不行」，要能变成下一版和下一单的输入。
-- note 存客户原话（不改写、不总结），excerpt 存他圈中的那一段，两者都是证据。
CREATE TABLE IF NOT EXISTS order_feedback (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  project_id TEXT,
  buyer_key TEXT,
  excerpt TEXT,
  note TEXT NOT NULL,
  tags TEXT,
  status TEXT NOT NULL,
  round INTEGER DEFAULT 1,
  result_json TEXT,
  created_at TEXT,
  applied_at TEXT
);
-- 跨任务长期记忆（v0.5.0）：系统在干活过程中自己把经验记下来，下一单自动带进提示词。
-- 与 kb_entries 的区别：知识库是人写的，记忆是系统自动记的「教训/偏好/弱项」。
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  service_id TEXT,
  role TEXT,
  source TEXT,
  source_ref TEXT,
  score REAL DEFAULT 0.6,
  hits INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_company ON memories(company_id, archived);
CREATE INDEX IF NOT EXISTS idx_mem_scope ON memories(company_id, role, service_id);

-- 每日经营简报（v0.5.1）：由调度器定时生成后落库。
-- 以前简报是「打开页面才现算」，老板不打开就没有；现在系统自己每天扫一遍公司状态，
-- 把该做的事写进这张表，人什么时候打开，看到的都是当天那份。
CREATE TABLE IF NOT EXISTS daily_briefs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  brief_date TEXT NOT NULL,          -- YYYY-MM-DD，一天一份（当天重跑会覆盖）
  headline TEXT,
  payload_json TEXT,                 -- 完整简报内容（actions/advice/stats）
  source TEXT,                       -- scheduler / manual
  generated_at TEXT,
  UNIQUE(company_id, brief_date)
);
CREATE INDEX IF NOT EXISTS idx_brief_company ON daily_briefs(company_id, brief_date);

-- 单调序号计数器：替代 MAX(seq)+1 的全表扫描，同时保证并发下不重号
CREATE TABLE IF NOT EXISTS counters (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_fb_order ON order_feedback(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fb_buyer ON order_feedback(buyer_key, created_at);
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
-- 收入按订单幂等：同一 ref_id 只允许记一笔，防止并发回填把营收记成 N 倍。
-- 只约束 income —— expense 是真实消耗，任务重跑本就该记多条。
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_income ON ledger(ref_id) WHERE kind = 'income' AND ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_txn ON orders(pay_txn_id);
"""


def now():
    """毫秒级时间戳。只取一次 time.time()，否则秒与毫秒会来自两个时刻，排序会错乱。"""
    t = time.time()
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(t)) + ".%03d" % int((t % 1) * 1000)


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
        if "access_key" not in cols:
            x("ALTER TABLE orders ADD COLUMN access_key TEXT")
    except Exception:  # noqa: BLE001 - 迁移失败不该阻止启动
        pass

    # 知识库分域（v0.4.8）：老库补列。空串表示「不限」，所以老词条补完仍是全库可见，
    # 行为不变；具体范围由 kb.backfill_scope() 按种子 id 回填。
    try:
        kb_cols = {r["name"] for r in q("PRAGMA table_info(kb_entries)")}
        if "scope_services" not in kb_cols:
            x("ALTER TABLE kb_entries ADD COLUMN scope_services TEXT")
        if "scope_roles" not in kb_cols:
            x("ALTER TABLE kb_entries ADD COLUMN scope_roles TEXT")
        if "archived" not in kb_cols:
            x("ALTER TABLE kb_entries ADD COLUMN archived INTEGER DEFAULT 0")
    except Exception:  # noqa: BLE001
        pass

    # 老订单（加列前创建）没有访问凭据：补发，否则买家链接永远 403
    try:
        with _LOCK:
            c = conn()
            rows = c.execute(
                "SELECT id FROM orders WHERE access_key IS NULL OR access_key = ''"
            ).fetchall()
            for r in rows:
                c.execute(
                    "UPDATE orders SET access_key = ? WHERE id = ?",
                    ("ak_" + uuid.uuid4().hex, r["id"]),
                )
            c.commit()
    except Exception:  # noqa: BLE001
        pass

    # 历史重复收入先并成一条，否则唯一索引建不上（旧版并发回填会重复记账）
    try:
        with _LOCK:
            c = conn()
            c.execute(
                """DELETE FROM ledger WHERE kind = 'income' AND ref_id IS NOT NULL
                   AND id NOT IN (
                     SELECT MIN(id) FROM ledger WHERE kind = 'income' AND ref_id IS NOT NULL GROUP BY ref_id
                   )"""
            )
            c.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_income ON ledger(ref_id)"
                " WHERE kind = 'income' AND ref_id IS NOT NULL"
            )
            c.commit()
            # 项目营收按账本重算，修掉历史多记的部分
            c.execute(
                """UPDATE projects SET revenue_cents = COALESCE(
                     (SELECT SUM(amount_cents) FROM ledger l
                      WHERE l.project_id = projects.id AND l.kind = 'income'), 0)"""
            )
            c.commit()
    except Exception:  # noqa: BLE001
        pass

    # 计数器对齐已有事件，避免迁移后序号从头开始
    try:
        with _LOCK:
            c = conn()
            c.execute("INSERT OR REPLACE INTO counters (scope, key, seq) SELECT 'run', run_id, MAX(seq) FROM events GROUP BY run_id")
            c.execute(
                "INSERT OR REPLACE INTO counters (scope, key, seq)"
                " SELECT 'order', order_id, MAX(seq) FROM order_events GROUP BY order_id"
            )
            c.commit()
    except Exception:  # noqa: BLE001
        pass


def x(sql, args=()):
    with _LOCK:
        c = conn()
        cur = c.execute(sql, args)
        c.commit()
        return cur.lastrowid


def xr(sql, args=()):
    """Execute and return affected row count —— 条件更新的原子性靠它判断。"""
    with _LOCK:
        c = conn()
        cur = c.execute(sql, args)
        c.commit()
        return cur.rowcount


def q(sql, args=()):
    with _LOCK:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def q1(sql, args=()):
    rows = q(sql, args)
    return rows[0] if rows else None


# ---------------------------------------------------------------- events

def _next_seq(scope, key):
    """单调递增序号。一条语句完成自增，避免 MAX(seq) 全表扫描与并发重号。"""
    with _LOCK:
        c = conn()
        try:
            cur = c.execute(
                "INSERT INTO counters (scope, key, seq) VALUES (?,?,1)"
                " ON CONFLICT(scope, key) DO UPDATE SET seq = seq + 1 RETURNING seq",
                (scope, key),
            )
            seq = int(cur.fetchone()[0])
        except sqlite3.OperationalError:  # 老版本 SQLite 无 RETURNING
            c.execute(
                "INSERT INTO counters (scope, key, seq) VALUES (?,?,1)"
                " ON CONFLICT(scope, key) DO UPDATE SET seq = seq + 1",
                (scope, key),
            )
            seq = int(c.execute("SELECT seq FROM counters WHERE scope = ? AND key = ?", (scope, key)).fetchone()[0])
        c.commit()
        return seq


def emit(run_id, type_, payload=None):
    """Append an engine event. seq is per-run and monotonic, so SSE can replay by id."""
    with _LOCK:
        seq = _next_seq("run", run_id)
        c = conn()
        c.execute(
            "INSERT INTO events (run_id, seq, type, payload, ts) VALUES (?,?,?,?,?)",
            (run_id, seq, type_, json.dumps(payload or {}, ensure_ascii=False), now()),
        )
        c.commit()
    # 顺手广播：页面正在听就不用等下一次轮询
    bus.publish(type_, payload, run_id=run_id)
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
        "INSERT OR REPLACE INTO kb_entries (id, title, content, tags, kind, source, "
        "scope_services, scope_roles, archived, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            entry["id"],
            entry["title"],
            entry["content"],
            json.dumps(entry.get("tags", []), ensure_ascii=False),
            entry.get("kind", "term"),
            entry.get("source", "manual"),
            _join_scope(entry.get("scope_services")),
            _join_scope(entry.get("scope_roles")),
            1 if entry.get("archived") else 0,
            now(),
        ),
    )


def _join_scope(value):
    """适用范围统一存成逗号串：既能接 `["svc_content"]` 也能接 `"svc_content,svc_x"`。"""
    if not value:
        return ""
    if isinstance(value, str):
        parts = value.split(",")
    else:
        parts = list(value)
    return ",".join(str(p).strip() for p in parts if str(p).strip())


def set_kb_scope(entry_id, services=None, roles=None, archived=None):
    sets, args = [], []
    if services is not None:
        sets.append("scope_services = ?")
        args.append(_join_scope(services))
    if roles is not None:
        sets.append("scope_roles = ?")
        args.append(_join_scope(roles))
    if archived is not None:
        sets.append("archived = ?")
        args.append(1 if archived else 0)
    if not sets:
        return 0
    args.append(entry_id)
    return x("UPDATE kb_entries SET " + ", ".join(sets) + " WHERE id = ?", tuple(args))


def all_kb():
    rows = q("SELECT * FROM kb_entries ORDER BY created_at")
    for r in rows:
        r["tags"] = json.loads(r["tags"] or "[]")
        # 适用范围对外一律给数组，前端不用再 split 逗号串
        r["scope_services"] = [s for s in (r.get("scope_services") or "").split(",") if s]
        r["scope_roles"] = [s for s in (r.get("scope_roles") or "").split(",") if s]
        r["archived"] = bool(r.get("archived"))
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
                               amount_cents, status, pay_provider, access_key, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            o["id"], o["product_id"], o.get("product_name", ""), o.get("buyer_name", ""),
            o.get("contact", ""), o.get("requirement", ""), int(o["amount_cents"]),
            o["status"], o.get("pay_provider", ""), o.get("access_key", ""), o.get("created_at") or now(),
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


def _decorate_order(o):
    """订单出站前补两个展示字段，省得每个前端各写一次除以 100。"""
    if not o:
        return o
    cents = int(o.get("amount_cents") or 0)
    o["amount"] = round(cents / 100, 2)
    o["amount_text"] = f"¥{cents / 100:.2f}".rstrip("0").rstrip(".")
    if o.get("deliverable_json"):
        try:
            o["deliverable"] = json.loads(o["deliverable_json"])
        except json.JSONDecodeError:
            o["deliverable"] = None
    return o


def get_order(order_id):
    return _decorate_order(q1("SELECT * FROM orders WHERE id = ?", (order_id,)))


def order_by_run(run_id):
    return _decorate_order(q1("SELECT * FROM orders WHERE run_id = ?", (run_id,)))


def list_orders(limit=50):
    return [_decorate_order(o) for o in q("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (int(limit),))]


def emit_order(order_id, type_, payload=None):
    """Order timeline. Same seq semantics as run events so the buyer page can poll/replay."""
    with _LOCK:
        seq = _next_seq("order", order_id)
        c = conn()
        c.execute(
            "INSERT INTO order_events (order_id, seq, type, payload, ts) VALUES (?,?,?,?,?)",
            (order_id, seq, type_, json.dumps(payload or {}, ensure_ascii=False), now()),
        )
        c.commit()
    bus.publish(type_, payload, order_id=order_id)
    return seq


def count_events(run_id):
    """SSE 与详情页只需要计数时别把整张事件表拉进内存。"""
    row = q1("SELECT COUNT(*) AS n FROM events WHERE run_id = ?", (run_id,))
    return int(row["n"]) if row else 0


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


# ---- 客户反馈 ----

FEEDBACK_FIELDS = {"status", "result_json", "applied_at", "tags", "excerpt"}


def create_feedback(f):
    x(
        """INSERT INTO order_feedback (id, order_id, project_id, buyer_key, excerpt, note, tags,
                                      status, round, result_json, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            f["id"], f["order_id"], f.get("project_id") or "", f.get("buyer_key") or "",
            f.get("excerpt") or "", f["note"], json.dumps(f.get("tags") or [], ensure_ascii=False),
            f.get("status") or "open", int(f.get("round") or 1), "", f.get("created_at") or now(),
        ),
    )
    return get_feedback(f["id"])


def update_feedback(fb_id, **fields):
    keys = [k for k in fields if k in FEEDBACK_FIELDS]
    if not keys:
        return get_feedback(fb_id)
    sets = ", ".join(f"{k} = ?" for k in keys)
    x(f"UPDATE order_feedback SET {sets} WHERE id = ?", tuple(fields[k] for k in keys) + (fb_id,))
    return get_feedback(fb_id)


def _decorate_feedback(r):
    if not r:
        return r
    for k in ("tags", "result"):
        raw = r.pop("result_json" if k == "result" else "tags", None)
        try:
            r[k] = json.loads(raw or "[]") if k == "tags" else json.loads(raw or "null")
        except (TypeError, json.JSONDecodeError):
            r[k] = [] if k == "tags" else None
    return r


def get_memory(mem_id):
    row = q1("SELECT * FROM memories WHERE id = ?", (mem_id,))
    if row:
        row["archived"] = bool(row.get("archived"))
    return row


def list_memories(company_id, role="", service_id="", include_archived=False, limit=100):
    sql = "SELECT * FROM memories WHERE company_id = ?"
    args = [company_id]
    if role:
        sql += " AND role = ?"
        args.append(role)
    if service_id:
        sql += " AND service_id = ?"
        args.append(service_id)
    if not include_archived:
        sql += " AND archived = 0"
    sql += " ORDER BY score DESC, updated_at DESC LIMIT ?"
    args.append(int(limit))
    rows = q(sql, tuple(args))
    for r in rows:
        r["archived"] = bool(r.get("archived"))
    return rows


def get_feedback(fb_id):
    return _decorate_feedback(q1("SELECT * FROM order_feedback WHERE id = ?", (fb_id,)))


# ---------------------------------------------------------------- daily briefs

def save_daily_brief(company_id, brief_date, headline, payload, source="scheduler"):
    """写当天简报。同一天重跑会覆盖当天那份（不堆历史噪音）。

    用 INSERT ... ON CONFLICT 而不是先查后写：两个调度器实例同时跑也不会写出两条。
    """
    import json as _json

    with _LOCK:
        c = conn()
        c.execute(
            """INSERT INTO daily_briefs (id, company_id, brief_date, headline, payload_json, source, generated_at)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(company_id, brief_date) DO UPDATE SET
                 headline = excluded.headline,
                 payload_json = excluded.payload_json,
                 source = excluded.source,
                 generated_at = excluded.generated_at""",
            (
                new_id("brf"),
                company_id,
                brief_date,
                headline,
                _json.dumps(payload or {}, ensure_ascii=False),
                source,
                now(),
            ),
        )
        c.commit()
    return get_daily_brief(company_id, brief_date)


def get_daily_brief(company_id, brief_date):
    row = q1(
        "SELECT * FROM daily_briefs WHERE company_id = ? AND brief_date = ?",
        (company_id, brief_date),
    )
    if not row:
        return None
    try:
        row["payload"] = json.loads(row.get("payload_json") or "{}")
    except Exception:  # noqa: BLE001 - 坏数据不该让整个简报接口挂掉
        row["payload"] = {}
    return row


def list_daily_briefs(company_id, limit=30):
    rows = q(
        "SELECT * FROM daily_briefs WHERE company_id = ? ORDER BY brief_date DESC LIMIT ?",
        (company_id, int(limit)),
    )
    for r in rows:
        try:
            r["payload"] = json.loads(r.get("payload_json") or "{}")
        except Exception:  # noqa: BLE001
            r["payload"] = {}
    return rows


def list_feedback(order_id, limit=20):
    rows = q(
        "SELECT * FROM order_feedback WHERE order_id = ? ORDER BY created_at DESC LIMIT ?",
        (order_id, int(limit)),
    )
    return [_decorate_feedback(r) for r in rows]


def feedback_for_buyer(buyer_key, exclude_order="", limit=5, since_days=180):
    """同一个客户以前的意见（不含本单）。

    客户档案是跨单的：这次说「太官方」，下一单就不该再从「尊敬的客户」开头。
    只认近半年的、被采纳过的，隔太久的意见未必还算数。
    """
    if not buyer_key:
        return []
    rows = q(
        "SELECT * FROM order_feedback WHERE buyer_key = ? AND order_id != ?"
        " AND status IN ('applied', 'kept') AND created_at > ?"
        " ORDER BY created_at DESC LIMIT ?",
        (buyer_key, exclude_order or "", _days_ago(since_days), int(limit)),
    )
    return [_decorate_feedback(r) for r in rows]


def _days_ago(days):
    from datetime import datetime, timedelta

    return (datetime.now() - timedelta(days=int(days))).isoformat(timespec="seconds")


def status():
    """库自身的体检：大小、表数、WAL 积压、完整性。给健康检查和运维用。"""
    path = Path(DB_PATH)
    info = {"path": str(path), "size_kb": 0, "tables": 0, "wal_kb": 0, "ok": True}
    try:
        info["size_kb"] = round(path.stat().st_size / 1024, 1)
        wal = path.with_name(path.name + "-wal")
        if wal.exists():
            info["wal_kb"] = round(wal.stat().st_size / 1024, 1)
        info["tables"] = len(q("SELECT name FROM sqlite_master WHERE type = 'table'"))
        info["ok"] = q1("PRAGMA quick_check") is not None
    except Exception as exc:  # noqa: BLE001 - 体检本身不能抛
        info["ok"] = False
        info["error"] = str(exc)
    return info


def checkpoint():
    """把 WAL 合并回主库。演示前拷库、打包、备份都要求主库是完整的。"""
    try:
        with _LOCK:
            conn().execute("PRAGMA wal_checkpoint(TRUNCATE)")
        return True
    except Exception:  # noqa: BLE001 - 检查点失败不影响业务
        return False

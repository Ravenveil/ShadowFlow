"""OPC OS store — sqlite persistence for the company layer (backend-poc port).

Ported from backend-poc/app/db.py (2026-11-04, opc-os-backend 任务):
only the tables the company/order/pay layers need — teams/runs tables stay
in backend-poc (the legacy demo engine); ShadowFlow's own runs live in
run_event_log / session-store, untouched.

Storage: .shadowflow/opc.sqlite (separate from app.sqlite to avoid coupled
migrations; single connection + RLock mirrors backend-poc semantics).

Table groups:
  companies / departments / employees          — 组织与员工
  opc_projects / tasks / approvals / ledger    — 项目 / 任务协议 / 审批 / 账本
  products / orders / order_events             — 商品 / 订单 / 订单时间线

Note: `projects` name collides with server/app.sqlite's conversations-era
`projects` table only in spirit — this store uses its own file, and the
table is named opc_projects defensively anyway.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

# SHADOWFLOW_HOME（可选）：数据根覆盖，测试/多实例部署用；默认仓库根。
# SHADOWFLOW_OPC_DB（可选）：直接指定 sqlite 文件路径，优先级最高。
_HOME = Path(os.environ.get("SHADOWFLOW_HOME") or Path(__file__).resolve().parents[2])
_BASE_DIR = _HOME / ".shadowflow"
_DB_PATH = Path(os.environ["SHADOWFLOW_OPC_DB"]) if os.environ.get("SHADOWFLOW_OPC_DB") else _BASE_DIR / "opc.sqlite"

_LOCK = threading.RLock()
_CONN: Optional[sqlite3.Connection] = None

SCHEMA = """
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
"""


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()) + ".%03d" % (
        int(time.time() * 1000) % 1000
    )


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _CONN = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _CONN.row_factory = sqlite3.Row
        _CONN.execute("PRAGMA journal_mode=WAL")
        _CONN.execute("PRAGMA synchronous=NORMAL")
        _CONN.execute("PRAGMA busy_timeout=5000")
    return _CONN


def init() -> None:
    with _LOCK:
        c = conn()
        c.executescript(SCHEMA)
        c.commit()


def x(sql: str, args: Tuple = ()) -> Optional[int]:
    with _LOCK:
        c = conn()
        cur = c.execute(sql, args)
        c.commit()
        return cur.lastrowid


def q(sql: str, args: Tuple = ()) -> List[Dict[str, Any]]:
    with _LOCK:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def q1(sql: str, args: Tuple = ()) -> Optional[Dict[str, Any]]:
    rows = q(sql, args)
    return rows[0] if rows else None


def emit_order(order_id: str, type_: str, payload: Optional[Dict] = None) -> int:
    """Order timeline. Same seq semantics as backend-poc (per-order monotonic)."""
    with _LOCK:
        row = q1(
            "SELECT COALESCE(MAX(seq), 0) AS s FROM order_events WHERE order_id = ?",
            (order_id,),
        )
        seq = int(row["s"]) + 1 if row else 1
        x(
            "INSERT INTO order_events (order_id, seq, type, payload, ts) VALUES (?,?,?,?,?)",
            (order_id, seq, type_, json.dumps(payload or {}, ensure_ascii=False), now()),
        )
        return seq


def order_events_since(order_id: str, since: int = 0) -> List[Dict[str, Any]]:
    rows = q(
        "SELECT seq, type, payload, ts FROM order_events WHERE order_id = ? AND seq > ? ORDER BY seq",
        (order_id, int(since)),
    )
    for r in rows:
        try:
            r["payload"] = json.loads(r["payload"])
        except (TypeError, json.JSONDecodeError):
            r["payload"] = {}
    return rows


# ---------------------------------------------------------------- commerce

def save_product(p: Dict[str, Any]) -> Dict[str, Any]:
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


def get_product(product_id: str) -> Optional[Dict[str, Any]]:
    return q1("SELECT * FROM products WHERE id = ?", (product_id,))


def list_products(active_only: bool = True) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM products"
    if active_only:
        sql += " WHERE active = 1"
    return q(sql + " ORDER BY price_cents")


def create_order(o: Dict[str, Any]) -> Dict[str, Any]:
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


def update_order(order_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    keys = [k for k in fields if k in ORDER_FIELDS]
    if not keys:
        return get_order(order_id)
    sets = ", ".join(f"{k} = ?" for k in keys)
    x(f"UPDATE orders SET {sets} WHERE id = ?", tuple(fields[k] for k in keys) + (order_id,))
    return get_order(order_id)


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    o = q1("SELECT * FROM orders WHERE id = ?", (order_id,))
    if o and o.get("deliverable_json"):
        try:
            o["deliverable"] = json.loads(o["deliverable_json"])
        except json.JSONDecodeError:
            o["deliverable"] = None
    return o


def list_orders(limit: int = 50) -> List[Dict[str, Any]]:
    return q("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", (int(limit),))

"""DAG orchestrator: dispatch, gate, execute, reject, roll back, resume.

This is the layer that makes "多智能体协作稳定输出，为前端演示供好接口" concrete:
every step is an event with a monotonic seq, so any client can replay a run or attach live.
"""

import json
import threading
import time

from . import db, kb, llm
from .config import MAX_ROLLBACKS, STEP_DELAY
from .loop_engine import LoopDepthExceeded, LoopEngine, StopRequested
from .policy import APPROVAL, DENY, ROLES, gate, topo_order

_WORKERS = None
_WORKERS_LOCK = threading.Lock()


def _ensure_pool():
    global _WORKERS
    with _WORKERS_LOCK:
        if _WORKERS is None:
            from concurrent.futures import ThreadPoolExecutor

            _WORKERS = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sf-run")
    return _WORKERS


def submit(run_id, resume=False):
    _ensure_pool().submit(_guarded_execute, run_id, resume)


def _guarded_execute(run_id, resume):
    try:
        Orchestrator(run_id).execute(resume=resume)
    except StopRequested:
        Orchestrator.finish_stopped(run_id)
    except Exception as exc:  # noqa: BLE001
        db.update_run(run_id, status="failed")
        db.emit(run_id, "run.failed", {"error": f"{type(exc).__name__}: {exc}"})


def _role_name(agent):
    return ROLES.get(agent, agent)


class Orchestrator:
    def __init__(self, run_id):
        self.run_id = run_id
        self.run = db.get_run(run_id)
        self.team = db.get_team(self.run["team_id"]) if self.run else None
        self.dag = self.team["dag"]
        self.policy = self.team["policy"]
        self.nodes = {n["id"]: n for n in self.dag["nodes"]}
        self.outputs = {}
        self.attempts = {}
        self.loop = LoopEngine(
            emit=self._emit,
            is_stopped=lambda: db.stop_requested(self.run_id),
            save_checkpoint=lambda node_id, label, state: db.save_checkpoint(self.run_id, node_id, label, state),
            record_iteration=lambda rec: db.record_iteration(
                self.run_id, rec["node_id"], rec["round"], rec["action"], rec["verification"], rec["decision"], rec["score"]
            ),
        )
        for row in db.node_attempts(run_id):
            self.attempts[row["node_id"]] = max(self.attempts.get(row["node_id"], 0), int(row["attempt"] or 1))

    # ---------------------------------------------------------------- events

    def _emit(self, type_, payload):
        db.emit(self.run_id, type_, payload)

    def _stop(self):
        if db.stop_requested(self.run_id):
            raise StopRequested("运行期收到急停指令")

    @staticmethod
    def finish_stopped(run_id):
        db.update_run(run_id, status="stopped")
        db.emit(run_id, "run.stopped", {"reason": "operator_estop", "message": "急停生效，已保存断点，可恢复续跑"})

    # ---------------------------------------------------------------- main

    def execute(self, resume=False):
        if resume:
            self.outputs = db.latest_outputs(self.run_id)
        db.update_run(self.run_id, status="running")
        self._emit(
            "run.started",
            {
                "run_id": self.run_id,
                "team": {"id": self.team["id"], "name": self.team["name"], "version": self.team["version"]},
                "task": self.run["task"],
                "resume": resume,
                "llm": llm.info(),
                "kb": kb.status(),
            },
        )

        order = topo_order(self.dag)
        idx, rollbacks, feedback = 0, 0, ""
        final = {}

        while idx < len(order):
            node = order[idx]
            self._stop()

            if resume and node["id"] in self.outputs and not feedback:
                self._emit("node.skipped", {"node_id": node["id"], "reason": "断点续跑：该节点已完成"})
                idx += 1
                continue

            sender = self._sender_before(order, idx)
            receiver = node.get("agent") or ("delivery" if node.get("type") == "deliver" else "writer")

            if sender:
                decision = gate(self.policy, sender, receiver)
                if decision["mode"] == DENY:
                    self._emit("policy.denied", {**decision, "node_id": node["id"], "effect": "拦截派发，跳过该节点并记录系统消息"})
                    db.record_node(self.run_id, node["id"], node.get("title", node["id"]), receiver, "blocked", self.attempts.get(node["id"], 1), None)
                    idx += 1
                    continue
                if decision["mode"] == APPROVAL:
                    self._emit(
                        "policy.approval_required",
                        {**decision, "node_id": node["id"], "effect": "人工门：演示环境自动放行"},
                    )

            try:
                if node.get("type") == "loop":
                    result = self._run_loop(node, feedback=feedback)
                else:
                    result = self._run_agent(node, attempt=self._next_attempt(node["id"]), feedback=feedback)
            except StopRequested:
                raise
            except LoopDepthExceeded as exc:
                self._emit("run.failed", {"error": str(exc)})
                db.update_run(self.run_id, status="failed")
                return

            # 驳回不是报错，是流程：checkpoint 回滚 + 上游重排
            if result.get("verdict") == "REJECT" and rollbacks < MAX_ROLLBACKS and idx > 0:
                rollbacks += 1
                producer = order[idx - 1]
                self._emit(
                    "node.rejected",
                    {
                        "node_id": node["id"],
                        "title": node.get("title", node["id"]),
                        "agent": result.get("agent"),
                        "risks": result.get("risks", []),
                        "required_changes": result.get("required_changes", []),
                        "rollback_to": producer["id"],
                        "rollback_to_title": producer.get("title", producer["id"]),
                        "attempt": rollbacks,
                    },
                )
                db.record_node(self.run_id, node["id"], node.get("title", node["id"]), receiver, "rejected", self.attempts.get(node["id"], 1), None)
                self._emit(
                    "checkpoint.rollback",
                    {
                        "to": producer["id"],
                        "to_title": producer.get("title", producer["id"]),
                        "label": f"回滚至「{producer.get('title', producer['id'])}」上一轮断点",
                        "attempt": rollbacks,
                        "note": "被拒产出不落库，任务自动重排给上游重试",
                    },
                )
                feedback = "；".join(result.get("required_changes") or []) or "请按驳回意见修订"
                self.outputs.pop(producer["id"], None)
                idx = order.index(producer)
                continue

            self.outputs[node["id"]] = result
            final = result
            db.record_node(
                self.run_id,
                node["id"],
                node.get("title", node["id"]),
                receiver,
                "completed",
                self.attempts.get(node["id"], 1),
                result.get("rounds"),
                {"text": result.get("text", "")[:2000], "score": result.get("score"), "verdict": result.get("verdict")},
            )
            self._emit(
                "node.completed",
                {
                    "node_id": node["id"],
                    "title": node.get("title", node["id"]),
                    "agent": result.get("agent"),
                    "score": result.get("score"),
                    "rounds": result.get("rounds"),
                    "verdict": result.get("verdict"),
                },
            )
            idx += 1

        summary = {
            "deliverable": final.get("text", ""),
            "score": final.get("score"),
            "rollbacks": rollbacks,
            "nodes": len(order),
        }
        db.update_run(self.run_id, status="completed", result_json=json.dumps(summary, ensure_ascii=False))
        self._emit("run.completed", {"run_id": self.run_id, "status": "completed", **summary})

    # ---------------------------------------------------------------- helpers

    def _next_attempt(self, node_id):
        nxt = self.attempts.get(node_id, 0) + 1
        self.attempts[node_id] = nxt
        return nxt

    def _sender_before(self, order, idx):
        """Which role owns the edge arriving at order[idx]."""
        if idx == 0:
            return None
        prev = order[idx - 1]
        if prev.get("type") == "loop":
            body = (prev.get("config") or {}).get("body") or []
            if body:
                return self.nodes[body[-1]].get("agent")
            return "writer"
        return prev.get("agent")

    # ---------------------------------------------------------------- nodes

    def _run_loop(self, node, feedback=""):
        upstream_rejection = bool(feedback)

        def body_executor(child_id, round_no, loop_feedback, outputs):
            child = self.nodes[child_id]
            if child.get("type") == "loop":
                return self.loop.execute(child, depth=2, body_executor=body_executor, seed_feedback=loop_feedback)
            upstream = {k: v for k, v in outputs.items()}
            return self._run_agent(
                child,
                attempt=self.attempts.get(child_id, 1),
                feedback=loop_feedback,
                round_no=round_no,
                upstream=upstream,
                external=upstream_rejection and round_no == 1,
            )

        return self.loop.execute(node, depth=1, body_executor=body_executor, seed_feedback=feedback)

    def _run_agent(self, node, attempt=1, feedback="", round_no=None, upstream=None, external=False):
        self._stop()
        agent = node.get("agent", "writer")
        title = node.get("title", node["id"])
        upstream = upstream if upstream is not None else {k: v for k, v in self.outputs.items()}

        self._emit(
            "node.dispatched",
            {
                "node_id": node["id"],
                "title": title,
                "agent": agent,
                "role_name": _role_name(agent),
                "attempt": attempt,
                "round": round_no,
                "instruction": node.get("instruction", ""),
            },
        )

        query = " ".join([self.run["task"], node.get("instruction", ""), title])
        ctx_block, kb_res = kb.context_block(query, top_k=3)

        system, user = self._prompt(node, upstream, ctx_block, feedback, round_no)
        force_reject = bool(self.run.get("demo", {}).get("reject_once", True)) and agent == "legal" and attempt == 1
        call = llm.complete(
            system,
            user,
            meta={
                "role": agent,
                "task": self.run["task"],
                "kb": kb_res.get("hits", []),
                "round": round_no or 1,
                "feedback": feedback,
                "external_feedback": external,
                "force_reject": force_reject,
            },
        )
        text = call["text"]
        data = None
        stripped = text.strip()
        if stripped.startswith("{"):
            try:
                data = json.loads(stripped)
            except json.JSONDecodeError:
                data = None
        text = self._humanize(agent, text, data)

        citations = [
            {"entry_id": h["entry_id"], "title": h["title"], "score": h["score"], "channel": h["channel"]}
            for h in kb_res.get("hits", [])
        ]

        self._emit(
            "agent.message",
            {
                "node_id": node["id"],
                "agent": agent,
                "role_name": _role_name(agent),
                "title": title,
                "text": text,
                "round": round_no,
                "attempt": attempt,
                "mode": call["mode"],
                "latency_ms": call["latency_ms"],
                "citations": citations,
                "kb_mode": kb_res.get("mode"),
                "data": data,
            },
        )

        if STEP_DELAY:
            time.sleep(STEP_DELAY)

        return {
            "node_id": node["id"],
            "title": title,
            "agent": agent,
            "type": node.get("type", "agent"),
            "text": text,
            "data": data,
            "citations": citations,
            "score": (data or {}).get("score"),
            "verdict": (data or {}).get("verdict"),
            "risks": (data or {}).get("risks", []),
            "required_changes": (data or {}).get("required_changes", []),
            "issues": (data or {}).get("issues", []),
            "round": round_no,
            "status": "completed",
        }

    def _humanize(self, agent, raw_text, data):
        """Turn role JSON into a readable bubble while keeping the raw payload for the client."""
        if not data:
            return raw_text
        if agent == "legal":
            verdict = (data.get("verdict") or "").upper()
            risks = data.get("risks") or []
            changes = data.get("required_changes") or []
            if verdict == "REJECT":
                body = "结论：REJECT —— 驳回上游重写\n风险：" + ("；".join(risks) or "—")
                if changes:
                    body += "\n必须修改：" + "；".join(changes)
                return body
            return "结论：APPROVE —— 复核通过" + (f"\n{data.get('note')}" if data.get("note") else "")
        if agent == "reviewer":
            score = data.get("score")
            issues = data.get("issues") or []
            body = f"得分 {score} · 结论 {'放行' if data.get('verdict') == 'pass' else '退回重写'}"
            if issues:
                body += "\n问题：" + "；".join(issues)
            return body
        return data.get("note") or data.get("summary") or raw_text

    def _prompt(self, node, upstream, ctx_block, feedback, round_no):
        agent = node.get("agent", "writer")
        role = _role_name(agent)
        instruction = node.get("instruction") or ""
        system = (
            f"你是 ShadowFlow 多智能体团队中的「{role}」。"
            "只输出你的本职工作产出，不要复述任务，不要解释你在做什么。"
            "若被要求返回 JSON，则只返回 JSON。"
        )
        lines = [f"团队任务：{self.run['task']}", f"你的节点：{node.get('title', node['id'])}"]
        if instruction:
            lines.append(f"节点职责：{instruction}")
        if upstream:
            lines.append("上游产出：")
            for nid, res in list(upstream.items())[-3:]:
                lines.append(f"- [{res.get('title', nid)}] {(res.get('text') or '')[:220]}")
        if ctx_block:
            lines.append("知识库检索结果（引用时请写标题）：\n" + ctx_block)
        else:
            lines.append("知识库检索结果：无命中，请基于任务本身作答。")
        if feedback:
            lines.append(f"修订要求（务必逐条落实）：{feedback}")
        if round_no and round_no > 1:
            lines.append(f"当前是循环第 {round_no} 轮，请比上一轮更具体、更有据可查。")
        if agent == "reviewer":
            lines.append('输出格式：{"score": 0~1, "verdict": "pass|revise", "issues": ["..."]}')
        if agent == "legal":
            lines.append('输出格式：{"verdict": "APPROVE|REJECT", "risks": ["..."], "required_changes": ["..."]}')
        return system, "\n".join(lines)

"""Loop engine: convergence is an engine primitive, not "run the model a few more times".

Implements deck P6:
  * control.loop is a first-class DAG node whose body returns into the main flow subgraph
  * nesting allowed up to depth 4
  * every round emits an IterationRecord (action / verification / decision) — auditable chain
  * a checkpoint is written each round, so a run can be stopped and resumed (断点续跑)
"""

from .config import LOOP_MAX_DEPTH


class StopRequested(Exception):
    """Raised when the operator hits 急停 between two steps."""


class LoopDepthExceeded(Exception):
    pass


class LoopEngine:
    def __init__(self, emit, is_stopped, save_checkpoint, record_iteration):
        self._emit = emit
        self._is_stopped = is_stopped
        self._save_checkpoint = save_checkpoint
        self._record_iteration = record_iteration

    def execute(self, node, depth=1, body_executor=None, seed_feedback=""):
        """Run one control.loop node.

        body_executor(child_node_id, round_no, feedback, outputs_so_far) -> dict
        seed_feedback carries an upstream rejection into the first round (rollback path).
        """
        if depth > LOOP_MAX_DEPTH:
            raise LoopDepthExceeded(f"循环嵌套深度 {depth} 超过上限 {LOOP_MAX_DEPTH}")

        cfg = node.get("config") or {}
        max_rounds = int(cfg.get("max_rounds", 3))
        target = float(cfg.get("target_score", 0.85))
        body = list(cfg.get("body") or [])
        node_id = node["id"]

        self._emit(
            "loop.started",
            {
                "node_id": node_id,
                "title": node.get("title", node_id),
                "max_rounds": max_rounds,
                "target_score": target,
                "body": body,
                "depth": depth,
            },
        )

        history = []
        score = 0.0
        decision = "max_rounds"
        feedback = seed_feedback or ""
        last_text = ""
        rounds_run = 0

        for round_no in range(1, max_rounds + 1):
            if self._is_stopped():
                raise StopRequested("运行期收到急停指令")
            rounds_run = round_no
            outputs = {}
            for child_id in body:
                if self._is_stopped():
                    raise StopRequested("运行期收到急停指令")
                result = body_executor(child_id, round_no, feedback, outputs)
                outputs[child_id] = result
                if result.get("score") is not None:
                    score = float(result["score"])
                if result.get("text"):
                    last_text = result["text"]

            issues = []
            for res in outputs.values():
                issues.extend(res.get("issues") or [])
            passed = score >= target
            decision = "stop" if passed else "continue"

            verification = (
                f"验证器判定 {score:.2f} vs 阈值 {target:.2f}，{'达标，收敛退出' if passed else '未达标，进入下一轮'}"
            )
            action = f"第 {round_no} 轮执行循环体 {len(body)} 个节点"
            record = {
                "node_id": node_id,
                "round": round_no,
                "action": action,
                "verification": verification,
                "decision": decision,
                "score": round(score, 4),
                "issues": issues,
            }
            history.append(record)
            self._record_iteration(record)
            self._emit("loop.iteration", record)
            self._save_checkpoint(node_id, f"{node.get('title', node_id)} · 第 {round_no} 轮", {"round": round_no, "score": score, "outputs_len": len(outputs)})

            if passed:
                break
            feedback = "；".join(issues[:3]) or "请补充数据来源与可核查证据"

        return {
            "node_id": node_id,
            "title": node.get("title", node_id),
            "type": "loop",
            "text": last_text,
            "score": round(score, 4),
            "rounds": rounds_run,
            "decision": decision,
            "history": history,
            "status": "completed",
        }

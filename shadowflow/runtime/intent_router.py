from dataclasses import dataclass
from typing import Optional


@dataclass
class IntentResult:
    output_type: str    # "answer" | "report" | "review" | "workflow"
    mode: str           # "single" | "team"
    confidence: float
    complexity: int


class IntentRouter:
    """Lightweight goal classifier.

    Only classifies intent — it does NOT pick agents or compose teams.
    Team/agent composition is decided downstream by the Assembler LLM,
    fed with parsed skill content + this classifier's output.
    """

    ANSWER_KW   = ["什么是", "有什么区别", "怎么", "如何", "解释", "what is", "how to", "difference", "是什么"]
    REPORT_KW   = ["调研", "报告", "分析", "research", "report", "survey", "调查", "综述"]
    REVIEW_KW   = ["review", "审查", "评审", "代码review", "code review", "帮我看", "找问题", "review这"]
    WORKFLOW_KW = ["工作流", "流程", "workflow", "pipeline", "自动化", "automation", "可复用"]

    def _keyword_classify(self, goal: str) -> "Optional[IntentResult]":
        g = goal.lower()
        for kw in self.WORKFLOW_KW:
            if kw in g:
                return IntentResult("workflow", "team", 0.88, 3)
        for kw in self.REVIEW_KW:
            if kw in g:
                return IntentResult("review", "team", 0.90, 2)
        for kw in self.REPORT_KW:
            if kw in g:
                return IntentResult("report", "team", 0.87, 4)
        for kw in self.ANSWER_KW:
            if kw in g:
                return IntentResult("answer", "single", 0.85, 1)
        return None

    async def classify(self, goal: str, output_hint: "Optional[str]" = None) -> IntentResult:
        if output_hint and output_hint in ("answer", "report", "review", "workflow"):
            mode = "single" if output_hint == "answer" else "team"
            return IntentResult(output_hint, mode, 1.0, 2)
        result = self._keyword_classify(goal)
        if result:
            return result
        return IntentResult("report", "team", 0.75, 3)

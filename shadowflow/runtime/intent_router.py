from dataclasses import dataclass, field
from typing import Optional, List
import json, re


@dataclass
class AgentConfig:
    title: str
    sub: str          # e.g. "claude-sonnet-4 · t 0.2"
    chips: List[str]  # tool names
    avatar_char: str  # display char like "读" or "R"
    status: str = "pending"


@dataclass
class CoordinatorConfig:
    title: str
    sub: str
    chips: List[str]


@dataclass
class TeamTemplate:
    coordinator: CoordinatorConfig
    agents: List[AgentConfig]
    workflow_mode: str   # "serial" | "parallel"
    filename_hint: str


@dataclass
class IntentResult:
    output_type: str    # "answer" | "report" | "review" | "workflow"
    mode: str           # "single" | "team"
    confidence: float
    complexity: int


class IntentRouter:
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
        # Default fallback
        return IntentResult("report", "team", 0.75, 3)

    def get_team_template(self, output_type: str, goal: str) -> TeamTemplate:
        templates = {
            "answer": TeamTemplate(
                coordinator=CoordinatorConfig(
                    "QA Specialist",
                    "single agent · direct",
                    ["reasoning"],
                ),
                agents=[
                    AgentConfig(
                        "QA Specialist · 直接回答",
                        "claude-sonnet-4 · t 0.1",
                        ["web_search", "calculator"],
                        "Q",
                    )
                ],
                workflow_mode="single",
                filename_hint="qa-agent.yml",
            ),
            "report": TeamTemplate(
                coordinator=CoordinatorConfig(
                    "Research Coordinator",
                    "3 agents · 串行 · policy_gate",
                    ["team_mode", "router", "retry: 3"],
                ),
                agents=[
                    AgentConfig(
                        "Researcher · 信息收集",
                        "claude-sonnet-4 · t 0.2",
                        ["web_search", "arxiv_search"],
                        "研",
                    ),
                    AgentConfig(
                        "Analyst · 深度分析",
                        "claude-opus-4 · t 0.3",
                        ["code_exec", "analysis"],
                        "析",
                    ),
                    AgentConfig(
                        "Writer · 报告撰写",
                        "claude-sonnet-4 · t 0.4",
                        ["write", "format"],
                        "写",
                    ),
                ],
                workflow_mode="serial",
                filename_hint="research-report-team.yml",
            ),
            "review": TeamTemplate(
                coordinator=CoordinatorConfig(
                    "Review Coordinator",
                    "2 agents · 并行 · review_gate",
                    ["team_mode", "parallel", "gate"],
                ),
                agents=[
                    AgentConfig(
                        "Reader · 深度阅读",
                        "claude-sonnet-4 · t 0.2",
                        ["pdf_extract", "highlight"],
                        "读",
                    ),
                    AgentConfig(
                        "Critic · 批判分析",
                        "claude-opus-4 · t 0.3",
                        ["critique", "compare"],
                        "评",
                    ),
                ],
                workflow_mode="parallel",
                filename_hint="code-review-team.yml",
            ),
            "workflow": TeamTemplate(
                coordinator=CoordinatorConfig(
                    "Workflow Designer",
                    "3 agents · 串行 · design_gate",
                    ["team_mode", "router", "design"],
                ),
                agents=[
                    AgentConfig(
                        "Planner · 需求分析",
                        "claude-opus-4 · t 0.2",
                        ["analyze", "diagram"],
                        "划",
                    ),
                    AgentConfig(
                        "Architect · 流程设计",
                        "claude-opus-4 · t 0.3",
                        ["design", "yaml_gen"],
                        "构",
                    ),
                    AgentConfig(
                        "Validator · 质量校验",
                        "claude-sonnet-4 · t 0.1",
                        ["validate", "test"],
                        "验",
                    ),
                ],
                workflow_mode="serial",
                filename_hint="workflow-design-team.yml",
            ),
        }
        return templates.get(output_type, templates["report"])

"""
工作流规划器 (WorkflowPlanner)

智能工作流规划器，能根据用户输入自动生成合适的工作流配置。
"""

import json
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from agentgraph.planner.task_analyzer import TaskAnalyzer, TaskAnalysis
from agentgraph.planner.rules import RuleEngine

logger = logging.getLogger(__name__)

@dataclass
class AgentRecommendation:
    """代理推荐结果"""
    role: str
    tools: List[str]
    priority: int
    reason: str
    confidence: float = 0.0

@dataclass
class WorkflowConfig:
    """工作流配置"""
    name: str
    description: str
    agents: List[str]
    steps: List[str]
    tools: List[str]
    parallel: bool = False
    timeout: Optional[int] = None
    priority: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

class WorkflowPlanner:
    """工作流规划器"""

    def __init__(self, rules_dir: str = "rules", conflict_resolution: str = "highest_priority"):
        """
        初始化工作流规划器

        Args:
            rules_dir: 规则文件目录
            conflict_resolution: 冲突解决策略
        """
        self.task_analyzer = TaskAnalyzer()
        self.rule_engine = RuleEngine(rules_dir, conflict_resolution)
        self._load_workflow_templates()

    def _load_workflow_templates(self):
        """加载工作流模板"""
        self.workflow_templates = {
            "security_audit": {
                "name": "安全审计工作流",
                "description": "执行全面的安全审计和漏洞扫描",
                "default_agents": ["security_expert", "vulnerability_analyzer"],
                "default_steps": ["scanning", "analysis", "reporting"],
                "default_tools": ["nmap", "burpsuite", "nikto"],
                "parallel": True
            },
            "code_review": {
                "name": "代码审查工作流",
                "description": "进行代码质量检查和规范审查",
                "default_agents": ["code_reviewer", "static_analyzer"],
                "default_steps": ["initial_review", "detailed_analysis", "issue_reporting"],
                "default_tools": ["eslint", "pylint", "sonarqube"],
                "parallel": False
            },
            "data_pipeline": {
                "name": "数据管道工作流",
                "description": "构建和优化数据处理管道",
                "default_agents": ["data_engineer", "etl_specialist"],
                "default_steps": ["design", "implementation", "testing", "deployment"],
                "default_tools": ["spark", "airflow", "docker"],
                "parallel": True
            },
            "research": {
                "name": "研究分析工作流",
                "description": "进行深入研究和信息分析",
                "default_agents": ["researcher", "data_scientist"],
                "default_steps": ["data_collection", "analysis", "synthesis", "reporting"],
                "default_tools": ["jira", "confluence", "pandas"],
                "parallel": False
            },
            "coding": {
                "name": "编码开发工作流",
                "description": "进行软件开发和实现",
                "default_agents": ["developer", "programmer"],
                "default_steps": ["planning", "coding", "testing", "review"],
                "default_tools": ["ide", "git", "pytest"],
                "parallel": False
            },
            "documentation": {
                "name": "文档生成工作流",
                "description": "创建和管理技术文档",
                "default_agents": ["technical_writer"],
                "default_steps": ["gathering", "writing", "reviewing", "formatting"],
                "default_tools": ["markdown", "sphinx", "draw.io"],
                "parallel": False
            },
            "testing": {
                "name": "测试工作流",
                "description": "执行软件测试和质量保证",
                "default_agents": ["tester", "qa_engineer"],
                "default_steps": ["test_planning", "test_design", "test_execution", "reporting"],
                "default_tools": ["pytest", "selenium", "junit"],
                "parallel": True
            },
            "debugging": {
                "name": "调试工作流",
                "description": "识别和修复软件问题",
                "default_agents": ["debugger", "troubleshooter"],
                "default_steps": ["reproduction", "analysis", "fixing", "verification"],
                "default_tools": ["chrome_devtools", "gdb", "strace"],
                "parallel": False
            },
            "optimization": {
                "name": "性能优化工作流",
                "description": "优化系统性能和资源使用",
                "default_agents": ["performance_engineer"],
                "default_steps": ["profiling", "analysis", "optimization", "validation"],
                "default_tools": ["perf", "valgrind", "profiler"],
                "parallel": False
            },
            "analysis": {
                "name": "数据分析工作流",
                "description": "进行数据分析和可视化",
                "default_agents": ["data_analyst", "visualization_expert"],
                "default_steps": ["data_preparation", "analysis", "visualization", "reporting"],
                "default_tools": ["pandas", "matplotlib", "seaborn"],
                "parallel": True
            }
        }

    def analyze_input(self, input: str) -> TaskAnalysis:
        """
        分析用户输入

        Args:
            input: 用户输入文本

        Returns:
            任务分析结果
        """
        return self.task_analyzer.analyze(input)

    def recommend_agents(self, analysis: TaskAnalysis) -> List[AgentRecommendation]:
        """
        推荐代理

        Args:
            analysis: 任务分析结果

        Returns:
            代理推荐列表
        """
        recommendations = []

        # 基于任务类型推荐基础代理
        template = self.workflow_templates.get(analysis.task_type.value)
        if template and template['default_agents']:
            for agent in template['default_agents']:
                recommendations.append(AgentRecommendation(
                    role=agent,
                    tools=self._get_agent_tools(agent, analysis),
                    priority=self._calculate_agent_priority(agent, analysis),
                    reason=f"根据任务类型 {analysis.task_type.value} 推荐",
                    confidence=0.8
                ))

        # 基于复杂度添加额外代理
        if analysis.complexity.value == "high":
            recommendations.append(AgentRecommendation(
                role="workflow_coordinator",
                tools=["coordination_tool"],
                priority=95,
                reason="复杂任务需要协调管理",
                confidence=0.9
            ))
        elif analysis.complexity.value == "medium":
            recommendations.append(AgentRecommendation(
                role="assistant",
                tools=["support_tool"],
                priority=70,
                reason="中等复杂度任务需要辅助",
                confidence=0.7
            ))

        # 基于工具需求推荐专业代理
        for tool in analysis.required_tools:
            if "security" in tool.lower() and not any(r.role == "security_expert" for r in recommendations):
                recommendations.append(AgentRecommendation(
                    role="security_expert",
                    tools=[tool],
                    priority=90,
                    reason=f"安全工具 {tool} 需要专家支持",
                    confidence=0.9
                ))

        # 根据实体需求推荐特定代理
        if analysis.key_entities.get('languages'):
            # 多语言项目需要语言专家
            recommendations.append(AgentRecommendation(
                role="language_specialist",
                tools=analysis.key_entities['languages'],
                priority=85,
                reason="多语言项目需要语言专家支持",
                confidence=0.8
            ))

        # 去重并按优先级排序
        unique_recommendations = {}
        for rec in recommendations:
            if rec.role not in unique_recommendations or rec.priority > unique_recommendations[rec.role].priority:
                unique_recommendations[rec.role] = rec

        sorted_recommendations = sorted(unique_recommendations.values(), key=lambda x: x.priority, reverse=True)
        return sorted_recommendations

    def generate_workflow(self, analysis: TaskAnalysis, agents: List[str]) -> WorkflowConfig:
        """
        生成工作流配置

        Args:
            analysis: 任务分析结果
            agents: 代理列表

        Returns:
            工作流配置
        """
        # 获取基础模板
        template = self.workflow_templates.get(analysis.task_type.value)
        if not template:
            template = self.workflow_templates["coding"]

        # 创建基础工作流
        workflow = WorkflowConfig(
            name=template["name"],
            description=template["description"],
            agents=agents.copy(),
            steps=template["default_steps"].copy(),
            tools=template["default_tools"].copy(),
            parallel=template["parallel"],
            timeout=self._calculate_timeout(analysis)
        )

        # 应用规则引擎优化
        workflow_dict = self._workflow_to_dict(workflow)
        enhanced_workflow = self.rule_engine.execute(
            analysis.__dict__,
            workflow_dict
        )
        workflow = self._dict_to_workflow(enhanced_workflow)

        # 添加自定义步骤
        if analysis.requirements.get('validation'):
            workflow.steps.append("validation")
        if analysis.requirements.get('documentation'):
            workflow.steps.append("documentation")

        # 调整步骤顺序
        workflow.steps = self._optimize_step_order(workflow.steps, analysis)

        return workflow

    def optimize_workflow(self, workflow: WorkflowConfig) -> WorkflowConfig:
        """
        优化工作流

        Args:
            workflow: 原始工作流配置

        Returns:
            优化后的工作流配置
        """
        # 1. 合并重复步骤
        unique_steps = []
        seen_steps = set()
        for step in workflow.steps:
            if step not in seen_steps:
                unique_steps.append(step)
                seen_steps.add(step)
        workflow.steps = unique_steps

        # 2. 优化代理负载
        workflow.agents = self._optimize_agent_load(workflow.agents)

        # 3. 添加错误处理步骤
        if "error_handling" not in workflow.steps:
            workflow.steps.insert(1, "error_handling")

        # 4. 添加质量检查
        if "quality_check" not in workflow.steps:
            workflow.steps.append("quality_check")

        # 5. 调整并行策略
        if workflow.parallel and len(workflow.steps) > 6:
            # 步骤太多时减少并行
            workflow.parallel = False

        # 6. 添加监控和日志
        workflow.metadata["monitoring"] = True
        workflow.metadata["logging"] = True
        workflow.metadata["version"] = "1.0.0"

        return workflow

    def _get_agent_tools(self, agent: str, analysis: TaskAnalysis) -> List[str]:
        """获取代理的工具列表"""
        # 根据代理类型返回工具
        tool_mapping = {
            "security_expert": ["nmap", "burpsuite", "nikto"],
            "vulnerability_analyzer": ["nessus", "metasploit"],
            "code_reviewer": ["eslint", "pylint"],
            "static_analyzer": ["sonarqube", "semgrep"],
            "data_engineer": ["spark", "hadoop", "airflow"],
            "etl_specialist": ["pentaho", "informatica"],
            "researcher": ["jira", "confluence", "notion"],
            "data_scientist": ["pandas", "numpy", "scikit-learn"],
            "developer": ["ide", "git", "docker"],
            "programmer": ["editor", "debugger", "profiler"],
            "technical_writer": ["markdown", "sphinx", "draw.io"],
            "tester": ["pytest", "selenium", "junit"],
            "qa_engineer": ["testrail", "postman"],
            "automation_specialist": ["jenkins", "github_actions"],
            "debugger": ["chrome_devtools", "gdb", "strace"],
            "troubleshooter": ["log_analyzer", "performance_monitor"],
            "performance_engineer": ["perf", "valgrind", "dynatrace"],
            "optimization_specialist": ["profiler", "new_relic"],
            "workflow_coordinator": ["coordination_tool", "scheduler"],
            "assistant": ["support_tool", "help_system"],
            "language_specialist": ["linter", "formatter"]
        }
        return tool_mapping.get(agent, ["general_tool"])

    def _calculate_agent_priority(self, agent: str, analysis: TaskAnalysis) -> int:
        """计算代理优先级"""
        priority = 50  # 基础优先级

        # 核心代理高优先级
        if agent in ["security_expert", "code_reviewer", "developer", "data_engineer"]:
            priority = 80
        # 专业代理次高优先级
        elif agent in ["vulnerability_analyzer", "static_analyzer", "etl_specialist"]:
            priority = 70
        # 支持代理较低优先级
        elif agent in ["assistant", "technical_writer"]:
            priority = 40

        # 根据任务复杂度调整
        if analysis.complexity.value == "high":
            priority += 20
        elif analysis.complexity.value == "low":
            priority -= 10

        return min(priority, 100)

    def _calculate_timeout(self, analysis: TaskAnalysis) -> int:
        """计算超时时间"""
        base_timeout = {
            "security_audit": 3600,  # 1小时
            "code_review": 1800,     # 30分钟
            "data_pipeline": 7200,   # 2小时
            "research": 3600,        # 1小时
            "coding": 5400,          # 1.5小时
            "documentation": 1800,    # 30分钟
            "testing": 3600,         # 1小时
            "debugging": 2400,       # 40分钟
            "optimization": 3000,    # 50分钟
            "analysis": 2400         # 40分钟
        }

        timeout = base_timeout.get(analysis.task_type.value, 3600)

        # 根据复杂度调整
        if analysis.complexity.value == "high":
            timeout = int(timeout * 1.5)
        elif analysis.complexity.value == "low":
            timeout = int(timeout * 0.7)

        # 根据步骤数调整
        timeout += (analysis.estimated_steps - 5) * 300  # 每步5分钟

        return timeout

    def _optimize_step_order(self, steps: List[str], analysis: TaskAnalysis) -> List[str]:
        """优化步骤顺序"""
        # 标准步骤顺序模板
        step_priority = {
            "planning": 10,
            "initial_review": 20,
            "scanning": 20,
            "error_handling": 25,
            "analysis": 30,
            "implementation": 40,
            "coding": 40,
            "testing": 50,
            "validation": 55,
            "reviewing": 60,
            "optimization": 70,
            "documentation": 80,
            "reporting": 90,
            "quality_check": 95
        }

        # 根据任务类型调整优先级
        if analysis.task_type.value == "security_audit":
            step_priority["scanning"] = 15
            step_priority["analysis"] = 25
        elif analysis.task_type.value == "code_review":
            step_priority["initial_review"] = 10
            step_priority["detailed_analysis"] = 30
        elif analysis.task_type.value == "data_pipeline":
            step_priority["design"] = 10
            step_priority["implementation"] = 30
            step_priority["testing"] = 50
            step_priority["deployment"] = 80

        # 排序步骤
        sorted_steps = sorted(steps, key=lambda x: step_priority.get(x, 50))
        return sorted_steps

    def _optimize_agent_load(self, agents: List[str]) -> List[str]:
        """优化代理负载"""
        # 检查是否有重复的角色
        agent_roles = {}
        for agent in agents:
            role = agent.split('_')[0]  # 获取基础角色
            if role in agent_roles:
                agent_roles[role].append(agent)
            else:
                agent_roles[role] = [agent]

        # 合并相似角色
        optimized_agents = []
        for role, agent_list in agent_roles.items():
            if len(agent_list) == 1:
                optimized_agents.append(agent_list[0])
            else:
                # 保留最专业的代理
                optimized_agents.append(sorted(agent_list, key=lambda x: self._get_agent_priority(x, None))[0])

        return optimized_agents

    def _workflow_to_dict(self, workflow: WorkflowConfig) -> Dict[str, Any]:
        """将工作流转换为字典"""
        return {
            "name": workflow.name,
            "description": workflow.description,
            "agents": workflow.agents,
            "steps": workflow.steps,
            "tools": workflow.tools,
            "parallel": workflow.parallel,
            "timeout": workflow.timeout,
            "priority": workflow.priority,
            "metadata": workflow.metadata
        }

    def _dict_to_workflow(self, workflow_dict: Dict[str, Any]) -> WorkflowConfig:
        """将字典转换为工作流"""
        return WorkflowConfig(
            name=workflow_dict.get("name", "Default Workflow"),
            description=workflow_dict.get("description", ""),
            agents=workflow_dict.get("agents", []),
            steps=workflow_dict.get("steps", []),
            tools=workflow_dict.get("tools", []),
            parallel=workflow_dict.get("parallel", False),
            timeout=workflow_dict.get("timeout"),
            priority=workflow_dict.get("priority", 0),
            metadata=workflow_dict.get("metadata", {})
        )

    def save_workflow(self, workflow: WorkflowConfig, filepath: str):
        """保存工作流配置到文件"""
        workflow_dict = self._workflow_to_dict(workflow)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(workflow_dict, f, indent=2, ensure_ascii=False)
        logger.info(f"Workflow saved to {filepath}")

    def load_workflow(self, filepath: str) -> WorkflowConfig:
        """从文件加载工作流配置"""
        with open(filepath, 'r', encoding='utf-8') as f:
            workflow_dict = json.load(f)
        return self._dict_to_workflow(workflow_dict)
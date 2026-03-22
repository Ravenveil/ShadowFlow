"""
规则引擎 (RuleEngine)

从 YAML 加载规则，执行规则匹配和优先级处理。
"""

import yaml
import logging
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, field
from pathlib import Path
import json

logger = logging.getLogger(__name__)

@dataclass
class Rule:
    """规则定义"""
    id: str
    name: str
    description: str
    condition: Dict[str, Any]  # 匹配条件
    actions: List[Dict[str, Any]]  # 执行动作
    priority: int = 0
    enabled: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)

class RuleEngine:
    """规则引擎"""

    def __init__(self, rules_dir: str = "rules", conflict_resolution: str = "highest_priority"):
        """
        初始化规则引擎

        Args:
            rules_dir: 规则文件目录
            conflict_resolution: 冲突解决策略 ("highest_priority", "first_match", "all")
        """
        self.rules_dir = Path(rules_dir)
        self.conflict_resolution = conflict_resolution
        self.rules: List[Rule] = []
        self._load_rules()

    def _load_rules(self):
        """加载所有规则"""
        if not self.rules_dir.exists():
            logger.warning(f"Rules directory not found: {self.rules_dir}")
            return

        # 创建默认规则目录
        self.rules_dir.mkdir(parents=True, exist_ok=True)

        # 加载默认规则
        self._load_default_rules()

        # 加载用户自定义规则
        for rule_file in self.rules_dir.glob("*.yaml"):
            self._load_rule_file(rule_file)

        # 按优先级排序
        self.rules.sort(key=lambda x: x.priority, reverse=True)

    def _load_default_rules(self):
        """加载默认规则"""
        default_rules = [
            {
                'id': 'security_high_priority',
                'name': '安全审计高优先级',
                'description': '安全审计任务获得更高优先级',
                'condition': {
                    'task_type': 'security_audit',
                    'complexity': {'in': ['high', 'medium']}
                },
                'actions': [
                    {'type': 'priority_adjust', 'value': 10}
                ],
                'priority': 100
            },
            {
                'id': 'complex_task_coordinator',
                'name': '复杂任务协调器',
                'description': '复杂任务自动添加协调器',
                'condition': {
                    'complexity': 'high'
                },
                'actions': [
                    {'type': 'add_agent', 'agent': 'workflow_coordinator'}
                ],
                'priority': 90
            },
            {
                'id': 'code_review_quality_check',
                'name': '代码审查质量检查',
                'description': '代码审查任务添加质量检查步骤',
                'condition': {
                    'task_type': 'code_review'
                },
                'actions': [
                    {'type': 'add_step', 'step': 'quality_check', 'position': 'after'}
                ],
                'priority': 80
            },
            {
                'id': 'data_pipeline_parallel',
                'name': '数据管道并行处理',
                'description': '数据管道任务启用并行处理',
                'condition': {
                    'task_type': 'data_pipeline',
                    'estimated_steps': {'>=': 5}
                },
                'actions': [
                    {'type': 'enable_parallel', 'value': True}
                ],
                'priority': 85
            },
            {
                'id': 'documentation_auto_generate',
                'name': '文档自动生成',
                'description': '技术任务自动生成文档',
                'condition': {
                    'task_type': {'in': ['coding', 'code_review', 'data_pipeline']}
                },
                'actions': [
                    {'type': 'add_agent', 'agent': 'technical_writer'}
                ],
                'priority': 70
            }
        ]

        for rule_data in default_rules:
            rule = Rule(
                id=rule_data['id'],
                name=rule_data['name'],
                description=rule_data['description'],
                condition=rule_data['condition'],
                actions=rule_data['actions'],
                priority=rule_data['priority']
            )
            self.rules.append(rule)

        # 保存默认规则到文件
        if not (self.rules_dir / "default_rules.yaml").exists():
            with open(self.rules_dir / "default_rules.yaml", 'w', encoding='utf-8') as f:
                yaml.dump(default_rules, f, default_flow_style=False, allow_unicode=True)

    def _load_rule_file(self, rule_file: Path):
        """加载单个规则文件"""
        try:
            with open(rule_file, 'r', encoding='utf-8') as f:
                rules_data = yaml.safe_load(f)

            if isinstance(rules_data, list):
                for rule_data in rules_data:
                    self._create_rule_from_dict(rule_data)
            elif isinstance(rules_data, dict):
                self._create_rule_from_dict(rules_data)

        except Exception as e:
            logger.error(f"Failed to load rule file {rule_file}: {e}")

    def _create_rule_from_dict(self, rule_data: Dict[str, Any]):
        """从字典创建规则"""
        rule = Rule(
            id=rule_data.get('id', f"rule_{len(self.rules)}"),
            name=rule_data.get('name', 'Unnamed Rule'),
            description=rule_data.get('description', ''),
            condition=rule_data.get('condition', {}),
            actions=rule_data.get('actions', []),
            priority=rule_data.get('priority', 0),
            enabled=rule_data.get('enabled', True),
            metadata=rule_data.get('metadata', {})
        )
        self.rules.append(rule)

    def execute(self, analysis: Dict[str, Any], base_workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行规则引擎

        Args:
            analysis: 任务分析结果
            base_workflow: 基础工作流

        Returns:
            处理后的工作流和应用的规则
        """
        workflow = base_workflow.copy()
        applied_rules = []

        # 找到匹配的规则
        matched_rules = self._match_rules(analysis, workflow)

        # 根据冲突解决策略处理规则
        if matched_rules:
            if self.conflict_resolution == "highest_priority":
                # 只应用最高优先级的规则
                rule = matched_rules[0]
                self._apply_rule(rule, workflow, analysis)
                applied_rules.append(rule.id)
            elif self.conflict_resolution == "first_match":
                # 应用第一个匹配的规则
                rule = matched_rules[0]
                self._apply_rule(rule, workflow, analysis)
                applied_rules.append(rule.id)
            elif self.conflict_resolution == "all":
                # 应用所有匹配的规则
                for rule in matched_rules:
                    if rule.enabled:
                        self._apply_rule(rule, workflow, analysis)
                        applied_rules.append(rule.id)

        # 更新元数据
        workflow['metadata'] = workflow.get('metadata', {})
        workflow['metadata']['applied_rules'] = applied_rules
        workflow['metadata']['rules_processed'] = len(matched_rules)

        return workflow

    def _match_rules(self, analysis: Dict[str, Any], workflow: Dict[str, Any]) -> List[Rule]:
        """匹配规则"""
        matched_rules = []

        for rule in self.rules:
            if not rule.enabled:
                continue

            if self._match_condition(rule.condition, analysis, workflow):
                matched_rules.append(rule)

        return matched_rules

    def _match_condition(self, condition: Dict[str, Any], analysis: Dict[str, Any], workflow: Dict[str, Any]) -> bool:
        """匹配条件"""
        for key, expected_value in condition.items():
            # 从分析或工作流中获取实际值
            actual_value = None
            if key in analysis:
                actual_value = analysis[key]
            elif key in workflow:
                actual_value = workflow.get(key)

            if actual_value is None:
                return False

            # 处理不同的条件类型
            if isinstance(expected_value, dict):
                # 操作符条件
                for op, value in expected_value.items():
                    if not self._evaluate_operator(actual_value, op, value):
                        return False
            else:
                # 简单相等
                if actual_value != expected_value:
                    return False

        return True

    def _evaluate_operator(self, actual: Any, operator: str, expected: Any) -> bool:
        """评估操作符"""
        try:
            if operator == '==':
                return actual == expected
            elif operator == '!=':
                return actual != expected
            elif operator == '>':
                return actual > expected
            elif operator == '>=':
                return actual >= expected
            elif operator == '<':
                return actual < expected
            elif operator == '<=':
                return actual <= expected
            elif operator == 'in':
                return actual in expected
            elif operator == 'contains':
                return str(expected).lower() in str(actual).lower()
            elif operator == 'startswith':
                return str(actual).startswith(str(expected))
            elif operator == 'endswith':
                return str(actual).endswith(str(expected))
            elif operator == 'regex':
                import re
                return bool(re.search(str(expected), str(actual)))
            else:
                logger.warning(f"Unknown operator: {operator}")
                return False
        except Exception as e:
            logger.error(f"Error evaluating operator {operator}: {e}")
            return False

    def _apply_rule(self, rule: Rule, workflow: Dict[str, Any], analysis: Dict[str, Any]):
        """应用规则"""
        logger.info(f"Applying rule: {rule.name}")

        for action in rule.actions:
            action_type = action.get('type')

            if action_type == 'priority_adjust':
                # 调整优先级
                value = action.get('value', 0)
                if 'priority' in workflow:
                    workflow['priority'] = workflow.get('priority', 0) + value
                else:
                    workflow['priority'] = value

            elif action_type == 'add_agent':
                # 添加代理
                agent = action.get('agent')
                if agent:
                    if 'agents' not in workflow:
                        workflow['agents'] = []
                    if agent not in workflow['agents']:
                        workflow['agents'].append(agent)

            elif action_type == 'remove_agent':
                # 移除代理
                agent = action.get('agent')
                if agent and 'agents' in workflow:
                    if agent in workflow['agents']:
                        workflow['agents'].remove(agent)

            elif action_type == 'add_step':
                # 添加步骤
                step = action.get('step')
                position = action.get('position', 'end')
                if step and 'steps' in workflow:
                    steps = workflow['steps']
                    if position == 'beginning':
                        steps.insert(0, step)
                    else:
                        steps.append(step)

            elif action_type == 'remove_step':
                # 移除步骤
                step = action.get('step')
                if step and 'steps' in workflow:
                    if step in workflow['steps']:
                        workflow['steps'].remove(step)

            elif action_type == 'enable_parallel':
                # 启用并行处理
                value = action.get('value', True)
                workflow['parallel'] = value

            elif action_type == 'set_complexity':
                # 设置复杂度
                complexity = action.get('complexity')
                if complexity:
                    workflow['complexity'] = complexity

            elif action_type == 'add_tool':
                # 添加工具
                tool = action.get('tool')
                if tool:
                    if 'tools' not in workflow:
                        workflow['tools'] = []
                    if tool not in workflow['tools']:
                        workflow['tools'].append(tool)

            elif action_type == 'set_timeout':
                # 设置超时时间
                timeout = action.get('timeout')
                if timeout:
                    workflow['timeout'] = timeout

    def add_rule(self, rule: Rule):
        """添加规则"""
        self.rules.append(rule)
        self.rules.sort(key=lambda x: x.priority, reverse=True)

    def remove_rule(self, rule_id: str):
        """移除规则"""
        self.rules = [r for r in self.rules if r.id != rule_id]

    def get_rule(self, rule_id: str) -> Optional[Rule]:
        """获取规则"""
        return next((r for r in self.rules if r.id == rule_id), None)

    def list_rules(self, enabled_only: bool = False) -> List[Rule]:
        """列出所有规则"""
        if enabled_only:
            return [r for r in self.rules if r.enabled]
        return self.rules

    def reload_rules(self):
        """重新加载所有规则"""
        self.rules = []
        self._load_rules()
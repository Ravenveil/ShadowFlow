"""
任务分析器 (TaskAnalyzer)

分析用户输入，识别任务类型、复杂度和所需工具。
"""

import re
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Any
from enum import Enum

logger = logging.getLogger(__name__)

class TaskType(Enum):
    """任务类型枚举"""
    SECURITY_AUDIT = "security_audit"
    CODE_REVIEW = "code_review"
    DATA_PIPELINE = "data_pipeline"
    RESEARCH = "research"
    CODING = "coding"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    DEBUGGING = "debugging"
    OPTIMIZATION = "optimization"
    ANALYSIS = "analysis"
    OTHER = "other"

class Complexity(Enum):
    """复杂度枚举"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

@dataclass
class TaskAnalysis:
    """任务分析结果"""
    task_type: TaskType
    complexity: Complexity
    required_tools: List[str] = field(default_factory=list)
    suggested_agents: List[str] = field(default_factory=list)
    estimated_steps: int = 5
    key_entities: Dict[str, Any] = field(default_factory=dict)
    requirements: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    raw_input: str = ""

    def __post_init__(self):
        """计算置信度"""
        if not self.confidence:
            self._calculate_confidence()

    def _calculate_confidence(self):
        """根据分析结果计算置信度"""
        score = 0.5  # 基础分数

        # 根据任务类型调整
        type_scores = {
            TaskType.SECURITY_AUDIT: 0.8,
            TaskType.CODE_REVIEW: 0.7,
            TaskType.DATA_PIPELINE: 0.7,
            TaskType.RESEARCH: 0.6,
            TaskType.CODING: 0.8,
            TaskType.DOCUMENTATION: 0.6,
            TaskType.TESTING: 0.7,
            TaskType.DEBUGGING: 0.7,
            TaskType.OPTIMIZATION: 0.6,
            TaskType.ANALYSIS: 0.7,
            TaskType.OTHER: 0.4,
        }
        score += type_scores.get(self.task_type, 0.5) - 0.5

        # 根据工具明确性调整
        if self.required_tools:
            score += min(len(self.required_tools) * 0.05, 0.15)

        # 根据实体识别调整
        entity_score = min(len(self.key_entities) * 0.03, 0.1)
        score += entity_score

        # 根据要求明确性调整
        if self.requirements:
            score += min(len(self.requirements) * 0.02, 0.1)

        self.confidence = min(max(score, 0.1), 1.0)

class TaskAnalyzer:
    """任务分析器"""

    def __init__(self):
        """初始化分析器"""
        self._load_patterns()
        self._load_tool_mapping()

    def _load_patterns(self):
        """加载任务模式"""
        self.patterns = {
            TaskType.SECURITY_AUDIT: {
                'keywords': ['安全', 'audit', '漏洞', 'vulnerability', '渗透', 'penetration', '安全审计', '风险评估', 'security'],
                'indicators': ['扫描', '扫描工具', 'nmap', 'burp', 'nessus', '漏洞', 'exploit', 'cve', '安全报告'],
                'complexity_patterns': ['深度', '全面', '完整', 'comprehensive', 'deep', 'thorough']
            },
            TaskType.CODE_REVIEW: {
                'keywords': ['代码审查', 'code review', 'review', '静态分析', 'static analysis', '质量检查', 'quality'],
                'indicators': ['lint', 'eslint', 'pylint', '代码规范', '风格检查', '重构', 'refactor'],
                'complexity_patterns': ['严格', 'strict', '详细', 'detailed', '全面', 'comprehensive']
            },
            TaskType.DATA_PIPELINE: {
                'keywords': ['数据管道', 'data pipeline', '数据流', 'etl', '数据转换', '数据清洗', '数据导入'],
                'indicators': ['spark', 'hadoop', 'airflow', 'pipeline', 'workflow', 'batch', 'streaming'],
                'complexity_patterns': ['复杂', 'complex', '大规模', 'large scale', '高并发', 'high throughput']
            },
            TaskType.RESEARCH: {
                'keywords': ['研究', 'research', '调研', '探索', 'exploration', '分析', 'analysis'],
                'indicators': ['文献', 'paper', '论文', '报告', '总结', '综述', '调查'],
                'complexity_patterns': ['深入', 'in-depth', '系统', 'systematic', '全面', 'comprehensive']
            },
            TaskType.CODING: {
                'keywords': ['编码', 'coding', '开发', 'development', '实现', 'implement', '编写'],
                'indicators': ['函数', 'function', '类', 'class', '方法', 'method', '模块', 'module'],
                'complexity_patterns': ['复杂', 'complex', '高性能', 'high performance', '可扩展', 'scalable']
            },
            TaskType.DOCUMENTATION: {
                'keywords': ['文档', 'documentation', '文档化', '说明', 'guide', '手册', '教程'],
                'indicators': ['readme', 'api doc', '使用指南', '部署文档', '设计文档'],
                'complexity_patterns': ['详细', 'detailed', '完整', 'complete', '全面', 'comprehensive']
            },
            TaskType.TESTING: {
                'keywords': ['测试', 'testing', 'case', '用例', '单元测试', 'unit test', '集成测试', 'integration'],
                'indicators': ['test', 'pytest', 'jest', 'mocha', 'coverage', 'mock', 'stub'],
                'complexity_patterns': ['全面', 'comprehensive', '自动化', 'automated', '回归', 'regression']
            },
            TaskType.DEBUGGING: {
                'keywords': ['调试', 'debug', 'bug', '错误', 'error', '问题', 'issue', '故障', 'fault'],
                'indicators': ['日志', 'log', 'trace', 'stack trace', '断点', 'breakpoint', '重现', 'reproduce'],
                'complexity_patterns': ['复杂', 'complex', '疑难', 'difficult', '深层', 'deep']
            },
            TaskType.OPTIMIZATION: {
                'keywords': ['优化', 'optimization', '性能', 'performance', '调优', 'tuning', '改进', 'improvement'],
                'indicators': ['瓶颈', 'bottleneck', '内存', 'memory', 'cpu', '响应时间', 'response time'],
                'complexity_patterns': ['深度', 'deep', '系统级', 'system level', '全方位', 'comprehensive']
            },
            TaskType.ANALYSIS: {
                'keywords': ['分析', 'analysis', '统计', 'statistics', '报告', 'report', '图表', 'chart'],
                'indicators': ['数据挖掘', 'data mining', '可视化', 'visualization', '趋势', 'trend'],
                'complexity_patterns': ['深度', 'deep', '复杂', 'complex', '多维度', 'multi-dimensional']
            }
        }

    def _load_tool_mapping(self):
        """加载工具映射"""
        self.tool_mapping = {
            TaskType.SECURITY_AUDIT: ['nmap', 'burpsuite', 'nessus', 'metasploit', 'sqlmap', 'nikto', 'gobuster'],
            TaskType.CODE_REVIEW: ['eslint', 'pylint', 'sonarqube', 'bandit', 'semgrep', 'codacy'],
            TaskType.DATA_PIPELINE: ['spark', 'hadoop', 'airflow', 'kafka', 'rabbitmq', 'docker', 'kubernetes'],
            TaskType.RESEARCH: ['jira', 'confluence', 'notion', 'google scholar', 'arxiv', 'github'],
            TaskType.CODING: ['ide', 'editor', 'git', 'docker', 'webpack', 'vite', 'pip', 'npm'],
            TaskType.DOCUMENTATION: ['markdown', 'sphinx', 'doxygen', 'swagger', 'postman', 'draw.io'],
            TaskType.TESTING: ['pytest', 'jest', 'mocha', 'selenium', 'cypress', 'junit', 'testng'],
            TaskType.DEBUGGING: ['chrome devtools', 'vscode debugger', 'gdb', 'lldb', 'strace', 'tcpdump'],
            TaskType.OPTIMIZATION: ['perf', 'valgrind', 'profiler', 'dynatrace', 'new relic', 'prometheus'],
            TaskType.ANALYSIS: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'scikit-learn', 'jupyter']
        }

    def analyze(self, input: str) -> TaskAnalysis:
        """分析用户输入，返回任务分析结果"""
        # 使用默认值创建基础分析对象
        analysis = TaskAnalysis(
            raw_input=input,
            task_type=TaskType.OTHER,
            complexity=Complexity.MEDIUM
        )

        # 1. 识别任务类型
        analysis.task_type = self._identify_task_type(input)

        # 2. 评估复杂度
        analysis.complexity = self._assess_complexity(input, analysis.task_type)

        # 3. 提取所需工具
        analysis.required_tools = self._extract_tools(input, analysis.task_type)

        # 4. 建议代理
        analysis.suggested_agents = self._suggest_agents(analysis)

        # 5. 估计步骤数
        analysis.estimated_steps = self._estimate_steps(analysis)

        # 6. 提取实体和要求
        analysis.key_entities, analysis.requirements = self._extract_entities_requirements(input)

        return analysis

    def _identify_task_type(self, input: str) -> TaskType:
        """识别任务类型"""
        input_lower = input.lower()
        max_score = 0
        best_match = TaskType.OTHER

        # 计算每个任务类型的匹配分数
        for task_type, patterns in self.patterns.items():
            score = 0

            # 关键词匹配
            keyword_score = len([kw for kw in patterns['keywords'] if kw in input_lower])
            score += keyword_score * 3

            # 指示词匹配
            indicator_score = len([kw for kw in patterns['indicators'] if kw in input_lower])
            score += indicator_score * 2

            # 更新最佳匹配
            if score > max_score:
                max_score = score
                best_match = task_type

        # 设置最小阈值
        if max_score >= 3:
            return best_match
        elif '安全' in input or 'security' in input_lower:
            return TaskType.SECURITY_AUDIT
        elif '代码' in input or 'code' in input_lower:
            return TaskType.CODE_REVIEW
        elif '数据' in input or 'data' in input_lower:
            return TaskType.DATA_PIPELINE
        elif '测试' in input or 'test' in input_lower:
            return TaskType.TESTING
        elif '调试' in input or 'debug' in input_lower:
            return TaskType.DEBUGGING
        elif '优化' in input or 'optimization' in input_lower:
            return TaskType.OPTIMIZATION
        else:
            return TaskType.OTHER

    def _assess_complexity(self, input: str, task_type: TaskType) -> Complexity:
        """评估任务复杂度"""
        input_lower = input.lower()

        # 检查复杂度指示词
        complexity_patterns = self.patterns.get(task_type, {}).get('complexity_patterns', [])
        if any(pattern in input_lower for pattern in complexity_patterns):
            return Complexity.HIGH

        # 基于输入长度和特定关键词判断
        if len(input) > 500:
            # 长输入且包含复杂度指示词
            if any(word in input_lower for word in ['深度', '全面', '系统级', 'comprehensive', 'detailed', 'in-depth']):
                return Complexity.HIGH
            elif any(word in input_lower for word in ['简单', '基础', 'basic']):
                return Complexity.LOW
            else:
                return Complexity.MEDIUM
        elif len(input) < 100:
            # 短输入
            if 'quick' in input_lower or '简单' in input:
                return Complexity.LOW
            else:
                return Complexity.MEDIUM
        else:
            # 中等长度输入
            if any(word in input_lower for word in ['中等', '一般', 'normal']):
                return Complexity.MEDIUM
            elif any(word in input_lower for word in ['简单', '基础', 'basic']):
                return Complexity.LOW
            else:
                return Complexity.MEDIUM

    def _extract_tools(self, input: str, task_type: TaskType) -> List[str]:
        """提取所需工具"""
        tools = []
        input_lower = input.lower()

        # 直接提到的工具
        mentioned_tools = re.findall(r'\b([\w\-]+\.(com|org|io)|[\w\-]+)\b', input_lower)
        for tool in mentioned_tools:
            tool_name = tool[0] if isinstance(tool, tuple) else tool
            if any(tool_name in t for t in self.tool_mapping.get(task_type, [])):
                tools.append(tool_name)

        # 基于任务类型推荐工具
        recommended_tools = self.tool_mapping.get(task_type, [])

        # 去重并返回
        return list(set(tools + recommended_tools))

    def _suggest_agents(self, analysis: TaskAnalysis) -> List[str]:
        """建议代理"""
        agents = []

        # 基于任务类型
        if analysis.task_type == TaskType.SECURITY_AUDIT:
            agents.extend(['security_expert', 'vulnerability_analyzer', 'penetration_tester'])
        elif analysis.task_type == TaskType.CODE_REVIEW:
            agents.extend(['code_reviewer', 'quality_assurance', 'static_analyzer'])
        elif analysis.task_type == TaskType.DATA_PIPELINE:
            agents.extend(['data_engineer', 'etl_specialist', 'pipeline_architect'])
        elif analysis.task_type == TaskType.RESEARCH:
            agents.extend(['researcher', 'analyst', 'data_scientist'])
        elif analysis.task_type == TaskType.CODING:
            agents.extend(['developer', 'programmer', 'software_engineer'])
        elif analysis.task_type == TaskType.DOCUMENTATION:
            agents.extend(['technical_writer', 'documentarian', 'content_creator'])
        elif analysis.task_type == TaskType.TESTING:
            agents.extend(['tester', 'qa_engineer', 'automation_specialist'])
        elif analysis.task_type == TaskType.DEBUGGING:
            agents.extend(['debugger', 'troubleshooter', 'diagnostic_expert'])
        elif analysis.task_type == TaskType.OPTIMIZATION:
            agents.extend(['performance_engineer', 'optimization_specialist', 'tuning_expert'])
        elif analysis.task_type == TaskType.ANALYSIS:
            agents.extend(['data_analyst', 'business_analyst', 'visualization_expert'])

        # 基于复杂度调整
        if analysis.complexity == Complexity.HIGH:
            # 复杂任务增加协调代理
            agents.append('workflow_coordinator')
            agents.append('quality_manager')
        elif analysis.complexity == Complexity.LOW:
            # 简单任务精简代理
            agents = agents[:2] if len(agents) > 2 else agents

        return list(set(agents))

    def _estimate_steps(self, analysis: TaskAnalysis) -> int:
        """估计步骤数"""
        base_steps = {
            TaskType.SECURITY_AUDIT: 6,
            TaskType.CODE_REVIEW: 4,
            TaskType.DATA_PIPELINE: 8,
            TaskType.RESEARCH: 5,
            TaskType.CODING: 5,
            TaskType.DOCUMENTATION: 4,
            TaskType.TESTING: 4,
            TaskType.DEBUGGING: 5,
            TaskType.OPTIMIZATION: 6,
            TaskType.ANALYSIS: 4,
            TaskType.OTHER: 5
        }

        steps = base_steps.get(analysis.task_type, 5)

        # 根据复杂度调整
        if analysis.complexity == Complexity.LOW:
            steps = max(3, steps - 1)
        elif analysis.complexity == Complexity.HIGH:
            steps += 2

        # 根据工具数量调整
        if len(analysis.required_tools) > 3:
            steps += 1

        return steps

    def _extract_entities_requirements(self, input: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """提取实体和要求"""
        entities = {}
        requirements = {}

        # 提取编程语言
        languages = re.findall(r'\b(python|java|javascript|typescript|go|rust|c\+\+|c#|php|ruby|swift|kotlin)\b', input.lower())
        if languages:
            entities['languages'] = list(set(languages))

        # 提取框架
        frameworks = re.findall(r'\b(django|flask|spring|react|vue|angular|express|fastapi|next\.js|nuxt\.js)\b', input.lower())
        if frameworks:
            entities['frameworks'] = list(set(frameworks))

        # 提取数据库
        databases = re.findall(r'\b(mysql|postgresql|mongodb|redis|elasticsearch|oracle|sqlite|cassandra)\b', input.lower())
        if databases:
            entities['databases'] = list(set(databases))

        # 提取操作系统
        oses = re.findall(r'\b(linux|windows|macos|ubuntu|centos|debian)\b', input.lower())
        if oses:
            entities['operating_systems'] = list(set(oses))

        # 提取具体要求
        if any(word in input for word in ['完整', '全部', 'all', 'complete']):
            requirements['completeness'] = 'full'

        if any(word in input for word in ['快速', 'quick', 'fast']):
            requirements['speed'] = 'high'

        if any(word in input for word in ['详细', 'detailed', 'comprehensive']):
            requirements['detail'] = 'high'

        if any(word in input for word in ['测试', 'test', '验证', 'validate']):
            requirements['validation'] = 'required'

        if any(word in input for word in ['报告', 'report', '文档', 'document']):
            requirements['documentation'] = 'required'

        return entities, requirements
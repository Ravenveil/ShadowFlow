"""
工作流规划器使用示例
"""

from agentgraph.planner import TaskAnalyzer, WorkflowPlanner, RuleEngine

def main():
    # 初始化规划器
    planner = WorkflowPlanner()

    # 示例1: 安全审计任务
    print("=== 示例1: 安全审计任务 ===")
    input_text = "对电商平台进行全面的安全审计，包括SQL注入、XSS漏洞扫描，并生成详细的安全报告"
    analysis = planner.analyze_input(input_text)
    print(f"任务类型: {analysis.task_type.value}")
    print(f"复杂度: {analysis.complexity.value}")
    print(f"所需工具: {analysis.required_tools}")
    print(f"建议代理: {analysis.suggested_agents}")
    print(f"估计步骤: {analysis.estimated_steps}")
    print(f"置信度: {analysis.confidence:.2f}")
    print()

    # 推荐代理
    recommendations = planner.recommend_agents(analysis)
    print("代理推荐:")
    for rec in recommendations:
        print(f"  - {rec.role} (优先级: {rec.priority}): {rec.reason}")
    print()

    # 生成工作流
    agents = [rec.role for rec in recommendations[:3]]  # 选择前3个推荐的代理
    workflow = planner.generate_workflow(analysis, agents)
    print("生成的工作流:")
    print(f"  名称: {workflow.name}")
    print(f"  代理: {workflow.agents}")
    print(f"  步骤: {workflow.steps}")
    print(f"  工具: {workflow.tools}")
    print(f"  并行: {workflow.parallel}")
    print(f"  超时: {workflow.timeout}秒")
    print()

    # 优化工作流
    optimized_workflow = planner.optimize_workflow(workflow)
    print("优化后的工作流:")
    print(f"  步骤: {optimized_workflow.steps}")
    print(f"  元数据: {optimized_workflow.metadata}")
    print()

    # 示例2: 代码审查任务
    print("=== 示例2: 代码审查任务 ===")
    input_text = "审查React项目的代码质量，检查代码规范、潜在bug和性能问题"
    analysis = planner.analyze_input(input_text)
    print(f"任务类型: {analysis.task_type.value}")
    print(f"复杂度: {analysis.complexity.value}")
    print(f"所需工具: {analysis.required_tools}")
    print()

    # 生成工作流
    recommendations = planner.recommend_agents(analysis)
    agents = [rec.role for rec in recommendations[:2]]
    workflow = planner.generate_workflow(analysis, agents)
    optimized_workflow = planner.optimize_workflow(workflow)
    print("代码审查工作流:")
    print(f"  名称: {optimized_workflow.name}")
    print(f"  代理: {optimized_workflow.agents}")
    print(f"  步骤: {optimized_workflow.steps}")
    print()

    # 示例3: 复杂数据管道
    print("=== 示例3: 复杂数据管道 ===")
    input_text = "构建一个大规模的数据处理管道，使用Spark进行ETL，需要支持实时和批量处理，并进行性能优化"
    analysis = planner.analyze_input(input_text)
    print(f"任务类型: {analysis.task_type.value}")
    print(f"复杂度: {analysis.complexity.value}")
    print(f"所需工具: {analysis.required_tools}")
    print(f"关键实体: {analysis.key_entities}")
    print()

    # 生成并保存工作流
    recommendations = planner.recommend_agents(analysis)
    agents = [rec.role for rec in recommendations]
    workflow = planner.generate_workflow(analysis, agents)
    optimized_workflow = planner.optimize_workflow(workflow)

    # 保存工作流
    planner.save_workflow(optimized_workflow, "data_pipeline_workflow.json")
    print("数据管道工作流已保存到 data_pipeline_workflow.json")
    print(f"  名称: {optimized_workflow.name}")
    print(f"  代理: {optimized_workflow.agents}")
    print(f"  步骤: {optimized_workflow.steps}")
    print(f"  并行处理: {optimized_workflow.parallel}")

if __name__ == "__main__":
    main()
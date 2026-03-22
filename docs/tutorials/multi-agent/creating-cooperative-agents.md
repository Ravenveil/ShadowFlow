# Creating Cooperative Agents

> Legacy Tutorial Notice
>
> 本教程主要反映旧的多智能体 workflow 结构，仍包含 legacy 字段与旧能力设定，例如 `memory.backend`、`to: "output"`、`parallel_execution`。
> 它当前不属于 Phase 1 canonical runtime contract 的权威教程。
>
> 当前主线请优先阅读：
>
> - `docs/CORE_CHARTER.md`
> - `docs/RUNTIME_CONTRACT_SPEC.md`
> - `docs/WORKFLOW_SCHEMA.md`
> - `docs/tutorials/getting-started/your-first-workflow.md`

This tutorial teaches you how to create multiple agents that work together to accomplish complex tasks.

## Overview

Multi-agent workflows allow you to:
- Leverage specialized skills
- Parallelize work
- Handle complex processes
- Scale with your needs

## Prerequisites

- Completed [Your First Workflow](../getting-started/your-first-workflow.md)
- Understanding of basic AgentGraph concepts

## Step 1: Understanding Agent Cooperation

Agents cooperate by:
1. **Specializing** in specific tasks
2. **Passing data** to each other
3. **Making decisions** based on context
4. **Handling failures** gracefully

## Step 2: Content Creation Pipeline

Let's build a content creation pipeline with three specialized agents.

### Create the Workflow

```yaml
# content-pipeline.yaml
name: "content-creation-pipeline"
description: "Multi-agent content creation workflow"
memory:
  backend: "sqlite"
  scope: "user"

nodes:
  # Researcher Agent
  - id: researcher
    type: "agent"
    config:
      name: "Research Specialist"
      role: "Expert researcher"
      prompt: |
        You research topics thoroughly and provide comprehensive information.

        Your task:
        1. Gather current information
        2. Identify key facts and trends
        3. Find supporting evidence
        4. Note different perspectives

        Output: Structured research report
      tools:
        - "web-search"
        - "document-analysis"
      max_tokens: 3000

  # Writer Agent
  - id: writer
    type: "agent"
    config:
      name: "Content Writer"
      role: "Creative writer"
      prompt: |
        You create engaging content based on research.

        Guidelines:
        1. Start with a compelling hook
        2. Use clear, accessible language
        3. Support claims with evidence
        4. Keep paragraphs short
        5. End with a conclusion

        Output: Well-structured article
      tools:
        - "style-analyzer"
      max_tokens: 4000

  # Editor Agent
  - id: editor
    type: "agent"
    config:
      name: "Quality Editor"
      role: "Editor-in-chief"
      prompt: |
        You review and polish content for quality.

        Checks:
        1. Factual accuracy
        2. Grammar and spelling
        3. Readability and flow
        4. Engagement level
        5. Target audience fit

        Output: Polished final version with feedback
      tools:
        - "grammar-checker"
        - "readability-score"
      max_tokens: 2000

edges:
  # Research -> Writing
  - from: researcher
    to: writer
    type: "conditional"
    condition: "${research.complete}"

  # Writing -> Editing
  - from: writer
    to: editor
    type: "conditional"
    condition: "true"

  # Editing -> Output
  - from: editor
    to: "output"
    type: "final"

# Settings
timeout: 600
max_retries: 2
```

### Run the Workflow

```bash
agentgraph run -w content-pipeline.yaml -i "Write about renewable energy"
```

## Step 3: Parallel Agent Execution

Let's create a workflow where agents work in parallel.

```yaml
# parallel-workflow.yaml
name: "parallel-processing"
description: "Parallel data processing workflow"
memory:
  backend: "sqlite"
  scope: "user"

nodes:
  # Data Collector 1
  - id: collector_1
    type: "agent"
    config:
      name: "Financial Data Collector"
      role: "Financial analyst"
      prompt: |
        Collect financial market data.

        Focus on:
        - Stock prices
        - Trading volume
        - Market trends

        Output: Financial data summary
      tools:
        - "market-data-api"
    config:
      parallel: true

  # Data Collector 2
  - id: collector_2
    type: "agent"
    config:
      name: "Social Media Collector"
      role: "Social media analyst"
      prompt: |
        Collect social media sentiment.

        Focus on:
        - Brand mentions
        - Sentiment analysis
        - Trending topics

        Output: Social media analysis
      tools:
        - "social-media-api"
    config:
      parallel: true

  # Data Aggregator
  - id: aggregator
    type: "agent"
    config:
      name: "Market Analyst"
      role: "Market researcher"
      prompt: |
        Combine data sources for comprehensive analysis.

        Tasks:
        1. Merge financial and social data
        2. Identify correlations
        3. Generate insights
        4. Make recommendations

        Output: Market analysis report
      tools: []

edges:
  # Parallel execution
  - from: collector_1
    to: aggregator
    type: "data"
    condition: "${collector_1.complete}"

  - from: collector_2
    to: aggregator
    type: "data"
    condition: "${collector_2.complete}"

  - from: aggregator
    to: "output"
    type: "final"

# Settings
parallel_execution: true
max_concurrent_agents: 5
```

## Step 4: Conditional Routing

Create workflows that make decisions based on agent outputs.

```yaml
# conditional-workflow.yaml
name: "smart-routing"
description: "Workflow with conditional routing"
memory:
  backend: "sqlite"
  scope: "user"

nodes:
  # Initial Analysis
  - id: analyzer
    type: "agent"
    config:
      name: "Content Analyzer"
      role: "Content specialist"
      prompt: |
        Analyze the input to determine processing needs.

        Check:
        1. Topic complexity
        2. Required expertise
        3. Expected output length
        4. Special requirements

        Output: Analysis with routing decision
      tools: []

  # Simple Handler
  - id: simple_handler
    type: "agent"
    config:
      name: "Simple Handler"
      role: "Basic processor"
      prompt: |
        Handle straightforward tasks efficiently.

        Keep responses:
        - Direct
        - Concise
        - Action-oriented

        Output: Simple, clear response
      tools: []

  # Complex Handler
  - id: complex_handler
    type: "agent"
    config:
      name: "Complex Handler"
      role: "Advanced processor"
      prompt: |
        Handle complex, detailed tasks thoroughly.

        Provide:
        - Comprehensive analysis
        - Detailed explanations
        - Multiple perspectives

        Output: In-depth response
      tools:
        - "deep-research"
        - "data-visualization"

  # Review Agent
  - id: reviewer
    type: "agent"
    config:
      name: "Quality Reviewer"
      role: "Quality assurance"
      prompt: |
        Review the output for quality and completeness.

        Ensure:
        1. Accuracy
        2. Relevance
        3. Completeness
        4. Clarity

        Output: Final review
      tools: []

edges:
  # Analysis -> Simple (if simple task)
  - from: analyzer
    to: simple_handler
    type: "conditional"
    condition: "${analysis.complexity == 'low'}"

  # Analysis -> Complex (if complex task)
  - from: analyzer
    to: complex_handler
    type: "conditional"
    condition: "${analysis.complexity == 'high'}"

  # All paths -> Review
  - from: simple_handler
    to: reviewer
    type: "conditional"
    condition: "true"

  - from: complex_handler
    to: reviewer
    type: "conditional"
    condition: "true"

  # Review -> Output
  - from: reviewer
    to: "output"
    type: "final"
```

## Step 5: Agent Communication Patterns

### Pattern 1: Sequential Pipeline

```
Agent 1 -> Agent 2 -> Agent 3 -> Output
```

Best for: Linear processes where each step depends on the previous one.

### Pattern 2: Parallel Processing

```
        -> Agent 2 ->
Input ->             -> Output
        -> Agent 3 ->
```

Best for: Independent tasks that can run simultaneously.

### Pattern 3: Fan-Out/Fan-In

```
        -> Agent 2 ->
Input ->             -> Agent 4 -> Output
        -> Agent 3 ->
```

Best for: Scatter-gather patterns.

### Pattern 4: Conditional Routing

```
Input -> Analyzer -> [Simple/Complex] -> Review -> Output
```

Best for: Decision-based workflows.

## Best Practices

### 1. Agent Design
- Keep agents focused and specialized
- Define clear responsibilities
- Set appropriate token limits
- Choose the right tools

### 2. Error Handling
- Add error detection nodes
- Implement retry logic
- Set reasonable timeouts
- Monitor agent performance

### 3. Performance Optimization
- Use parallel execution where possible
- Cache intermediate results
- Monitor memory usage
- Set appropriate timeouts

### 4. Quality Assurance
- Add review agents
- Implement validation checks
- Maintain consistency in prompts
- Track success rates

## Example: E-commerce Order Processing

```yaml
# ecommerce-fulfillment.yaml
name: "ecommerce-fulfillment"
description: "E-commerce order processing workflow"

nodes:
  # Order Validator
  - id: validator
    type: "agent"
    config:
      name: "Order Validator"
      role: "Order processing specialist"
      prompt: |
        Validate orders for completeness and accuracy.

        Check:
        - Customer information
        - Payment status
        - Inventory availability
        - Shipping rules

        Output: Validation result
      tools:
        - "inventory-check"
        - "payment-processor"

  # Inventory Checker
  - id: inventory
    type: "agent"
    config:
      name: "Inventory Manager"
      role: "Inventory specialist"
      prompt: |
        Check and update inventory.

        Tasks:
        - Reserve items
        - Update stock levels
        - Flag shortages
        - Schedule restocks

        Output: Inventory status
      tools:
        - "inventory-api"

  # Shipping Coordinator
  - id: shipping
    type: "agent"
    config:
      name: "Shipping Coordinator"
      role: "Logistics expert"
      prompt: |
        Arrange shipping and delivery.

        Process:
        - Select carrier
        - Calculate shipping cost
        - Generate tracking number
        - Schedule pickup

        Output: Shipping details
      tools:
        - "shipping-api"

  # Customer Notification
  - id: notification
    type: "agent"
    config:
      name: "Customer Service"
      role: "Customer communications"
      prompt: |
        Notify customers about order status.

        Include:
        - Order confirmation
        - Expected delivery date
        - Tracking information
        - Support contact

        Output: Customer message
      tools:
        - "email-service"
        - "sms-service"

edges:
  # Sequential processing
  - from: validator
    to: inventory
    type: "conditional"
    condition: "${validation.passed}"

  - from: inventory
    to: shipping
    type: "conditional"
    condition: "${inventory.available}"

  - from: shipping
    to: notification
    type: "data"

  - from: notification
    to: "output"
    type: "final"
```

## Troubleshooting

### Common Issues

1. **Agents Not Communicating**
   - Check edge conditions
   - Verify data formats
   - Ensure proper state sharing

2. **Performance Bottlenecks**
   - Enable parallel execution
   - Reduce token limits
   - Cache results

3. **Poor Output Quality**
   - Review agent prompts
   - Add validation steps
   - Consider adding a review agent

## Next Steps

- [Advanced Error Handling](../advanced/error-handling.md)
- [Custom Tools Development](../advanced/custom-tools.md)
- [Performance Optimization](../advanced/performance.md)

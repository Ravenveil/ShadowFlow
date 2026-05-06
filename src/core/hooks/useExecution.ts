// ============================================================================
// 执行 Hook - 协调前端 UI 与后端 Agent 执行
// ============================================================================

import { useState, useCallback } from 'react';
import { useWorkflow } from '../stores/workflowStore';
import { runWorkflow, RunWorkflowRequest } from '../api/workflow';
import { MemoryType } from '../types/river';

export function useExecution() {
  const workflow = useWorkflow();
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (input: string) => {
    if (workflow.isRunning) return;

    setError(null);
    workflow.startRun();
    workflow.setRunProgress(10); // 初始进度

    try {
      const request: RunWorkflowRequest = {
        workflow_id: 'current_workflow',
        input,
        nodes: workflow.nodes,
        edges: workflow.edges,
      };

      // 1. 将输入注入“河流” (River Stream)
      workflow.pour({
        type: 'context',
        content: `User Input: ${input}`,
        sourceNodeId: 'user',
        importance: 1.0,
        metadata: { timestamp: new Date().toISOString() }
      });

      // 2. 调用后端执行
      const response = await runWorkflow(request);

      if (response.status === 'error') {
        setError(response.error || 'Execution failed');
        workflow.stopRun();
        return;
      }

      // 3. 处理执行步骤并实时“灌溉”河流
      for (const step of response.steps) {
        // 更新节点状态
        workflow.updateNode(step.agent_id, { status: 'success' });
        
        // 注入推理日志到河流
        workflow.pour({
          type: 'working',
          content: step.reasoning,
          sourceNodeId: step.agent_id,
          importance: 0.8,
          metadata: { 
            confidence: step.confidence,
            tool_calls: step.tool_calls 
          }
        });

        // 注入结果到河流
        workflow.pour({
          type: 'execution',
          content: step.output,
          sourceNodeId: step.agent_id,
          importance: 0.9,
          metadata: { timestamp: step.timestamp }
        });
      }

      workflow.setRunProgress(100);
      
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      workflow.stopRun();
    }
  }, [workflow]);

  return {
    execute,
    isRunning: workflow.isRunning,
    progress: workflow.runProgress,
    error,
    clearError: () => setError(null),
  };
}

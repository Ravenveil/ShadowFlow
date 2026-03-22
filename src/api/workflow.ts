// ============================================================================
// 工作流 API 客户端 - 前后端通信桥梁
// ============================================================================

import { WorkflowNode, WorkflowEdge } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export interface RunWorkflowRequest {
  workflow_id: string;
  input: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  user_id?: string;
  config?: Record<string, any>;
}

export interface AgentStep {
  agent_id: string;
  output: string;
  reasoning: string;
  confidence: number;
  tool_calls: any[];
  timestamp: string;
}

export interface RunWorkflowResponse {
  result: string;
  steps: AgentStep[];
  metadata: Record<string, any>;
  status: 'success' | 'error';
  error?: string;
}

/**
 * 运行工作流
 */
export async function runWorkflow(request: RunWorkflowRequest): Promise<RunWorkflowResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/workflow/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to run workflow');
    }

    return await response.json();
  } catch (error: any) {
    console.error('API Error:', error);
    return {
      result: '',
      steps: [],
      metadata: {},
      status: 'error',
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * 检查健康状态
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

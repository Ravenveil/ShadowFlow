/**
 * Branch Executor 测试
 */

import { BranchExecutor } from '../decision/branch-executor';
import { NodeContext } from '../../types/node.types';

// Mock node definition
const mockNode = {
  id: 'branch',
  category: 'decision' as const,
  name: { en: 'Branch', zh: '分支' },
  description: { en: 'Conditional branch', zh: '条件分支' },
  icon: '🔀',
  inputs: [],
  outputs: []
};

describe('BranchExecutor', () => {
  describe('execute', () => {
    it('should evaluate simple condition with matching value', async () => {
      const executor = new BranchExecutor(mockNode);

      const context: NodeContext = {
        state: {
          workflowId: 'test-workflow',
          variables: {},
          executionHistory: [],
          llmClient: null as any,
          agentPool: null as any,
          mcpRegistry: null as any,
          eventBus: null as any
        },
        inputs: {
          data: { status: 'completed' }
        },
        config: {
          condition_type: 'simple',
          variable: 'status',
          value: 'completed'
        },
        metadata: {
          nodeId: 'branch',
          nodeType: 'branch',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.branch_result).toBe(true);
      expect(result.outputs.branch_taken).toBe('true');
    });

    it('should evaluate simple condition with non-matching value', async () => {
      const executor = new BranchExecutor(mockNode);

      const context: NodeContext = {
        state: {
          workflowId: 'test-workflow',
          variables: {},
          executionHistory: [],
          llmClient: null as any,
          agentPool: null as any,
          mcpRegistry: null as any,
          eventBus: null as any
        },
        inputs: {
          data: { status: 'pending' }
        },
        config: {
          condition_type: 'simple',
          variable: 'status',
          value: 'completed'
        },
        metadata: {
          nodeId: 'branch',
          nodeType: 'branch',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.branch_result).toBe(false);
      expect(result.outputs.branch_taken).toBe('false');
    });

    it('should evaluate comparison condition', async () => {
      const executor = new BranchExecutor(mockNode);

      const context: NodeContext = {
        state: {
          workflowId: 'test-workflow',
          variables: {},
          executionHistory: [],
          llmClient: null as any,
          agentPool: null as any,
          mcpRegistry: null as any,
          eventBus: null as any
        },
        inputs: {
          data: { score: 85 }
        },
        config: {
          condition_type: 'comparison',
          variable: 'score',
          operator: '>=',
          value: 80
        },
        metadata: {
          nodeId: 'branch',
          nodeType: 'branch',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.branch_result).toBe(true);
    });

    it('should handle nested variable paths', async () => {
      const executor = new BranchExecutor(mockNode);

      const context: NodeContext = {
        state: {
          workflowId: 'test-workflow',
          variables: {},
          executionHistory: [],
          llmClient: null as any,
          agentPool: null as any,
          mcpRegistry: null as any,
          eventBus: null as any
        },
        inputs: {
          data: {
            result: {
              status: 'success'
            }
          }
        },
        config: {
          condition_type: 'simple',
          variable: 'result.status',
          value: 'success'
        },
        metadata: {
          nodeId: 'branch',
          nodeType: 'branch',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.branch_result).toBe(true);
    });
  });
});

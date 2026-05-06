/**
 * Receive Executor 测试
 */

import { ReceiveExecutor } from '../input/receive-executor';
import { NodeContext } from '../../types/node.types';

// Mock node definition
const mockNode = {
  id: 'receive',
  category: 'input' as const,
  name: { en: 'Receive', zh: '接收' },
  description: { en: 'Receive and parse input', zh: '接收并解析输入数据' },
  icon: '📥',
  inputs: [
    { name: 'raw_input', type: 'string', required: true, description: { en: 'Raw input', zh: '原始输入' } }
  ],
  outputs: []
};

describe('ReceiveExecutor', () => {
  describe('execute', () => {
    it('should parse JSON input', async () => {
      const executor = new ReceiveExecutor(mockNode);

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
          raw_input: JSON.stringify({ name: 'test', value: 42 })
        },
        config: {
          parser: 'json'
        },
        metadata: {
          nodeId: 'receive',
          nodeType: 'receive',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.parsed_task.type).toBe('json');
      expect(result.outputs.parsed_task.data.name).toBe('test');
    });

    it('should auto-detect input type', async () => {
      const executor = new ReceiveExecutor(mockNode);

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
          raw_input: JSON.stringify({ test: 'data' })
        },
        config: {
          parser: 'auto'
        },
        metadata: {
          nodeId: 'receive',
          nodeType: 'receive',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.parsed_task.type).toBe('json');
    });

    it('should handle text input', async () => {
      const executor = new ReceiveExecutor(mockNode);

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
          raw_input: 'This is a plain text input'
        },
        config: {
          parser: 'text'
        },
        metadata: {
          nodeId: 'receive',
          nodeType: 'receive',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs.parsed_task.type).toBe('text');
      expect(result.outputs.parsed_task.data.description).toBe('This is a plain text input');
    });
  });

  describe('validateInputs', () => {
    it('should fail when raw_input is missing', async () => {
      const executor = new ReceiveExecutor(mockNode);

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
        inputs: {},
        config: {},
        metadata: {
          nodeId: 'receive',
          nodeType: 'receive',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use default value for optional inputs', async () => {
      const executor = new ReceiveExecutor(mockNode);

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
          raw_input: 'test'
        },
        config: {
          extract_entities: true
        },
        metadata: {
          nodeId: 'receive',
          nodeType: 'receive',
          executionId: 'test-exec',
          startTime: new Date()
        }
      };

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
    });
  });
});

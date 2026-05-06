/**
 * 节点执行器基类
 * 提供所有节点执行器的通用功能
 */

import {
  INode,
  NodeContext,
  NodeResult,
  PortDefinition,
  WorkflowState,
  IRiverMemoryAccess,
  IMemoryChunk,
  IMemoryFilter,
  IPattern,
  IPatternFilter,
  ICheckpointSummary,
  MemoryType
} from '../types/node.types';

/**
 * 执行错误类
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly nodeId: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * 输入验证错误
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends Error {
  constructor(message: string, public readonly timeout: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 节点执行器基类
 */
export abstract class BaseNodeExecutor {
  protected node: INode;
  protected startTime: Date;

  constructor(node: INode) {
    this.node = node;
    this.startTime = new Date();
  }

  /**
   * 验证输入
   * 检查必需端口和类型
   */
  protected validateInputs(inputs: Record<string, any>): void {
    for (const port of this.node.inputs) {
      // 检查必需端口
      if (port.required && !(port.name in inputs)) {
        if (port.defaultValue !== undefined) {
          inputs[port.name] = this.deepClone(port.defaultValue);
        } else {
          throw new ValidationError(
            `Missing required input: ${port.name}`,
            port.name,
            undefined
          );
        }
      }

      // 检查类型（如果值存在）
      if (inputs[port.name] !== undefined && port.type !== 'any') {
        this.validateType(port.name, inputs[port.name], port.type);
      }
    }
  }

  /**
   * 验证单个输入类型
   */
  protected validateType(fieldName: string, value: any, expectedType: string): void {
    const typeMap: Record<string, (v: any) => boolean> = {
      string: (v) => typeof v === 'string',
      number: (v) => typeof v === 'number' && !isNaN(v),
      boolean: (v) => typeof v === 'boolean',
      object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      array: (v) => Array.isArray(v),
      any: () => true,
      file: (v) => typeof v === 'string' || (typeof v === 'object' && v?.path),
      json: (v) => {
        if (typeof v === 'string') {
          try {
            JSON.parse(v);
            return true;
          } catch {
            return false;
          }
        }
        return typeof v === 'object' && v !== null;
      }
    };

    const validator = typeMap[expectedType];
    if (!validator || !validator(value)) {
      throw new ValidationError(
        `Invalid type for ${fieldName}: expected ${expectedType}, got ${typeof value}`,
        fieldName,
        value
      );
    }
  }

  /**
   * 验证配置
   */
  protected validateConfig(config: Record<string, any>): void {
    if (!this.node.configSchema) {
      return;
    }

    const schema = this.node.configSchema;
    const properties = schema.properties || {};
    const required = schema.required || [];

    // 检查必需配置
    for (const prop of required) {
      if (!(prop in config)) {
        // 使用默认值
        if (properties[prop]?.default !== undefined) {
          config[prop] = this.deepClone(properties[prop].default);
        } else {
          throw new ValidationError(
            `Missing required config: ${prop}`,
            prop,
            undefined
          );
        }
      }
    }
  }

  /**
   * 包装执行结果 - 成功
   */
  protected success(
    outputs: Record<string, any>,
    warnings: string[] = []
  ): NodeResult {
    const duration = Date.now() - this.startTime.getTime();
    return {
      success: true,
      outputs,
      metadata: {
        duration,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    };
  }

  /**
   * 包装执行结果 - 失败
   */
  protected failure(error: Error, outputs: Record<string, any> = {}): NodeResult {
    const duration = Date.now() - this.startTime.getTime();
    return {
      success: false,
      outputs,
      error,
      metadata: { duration }
    };
  }

  /**
   * 深度克隆对象
   */
  protected deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * 执行超时包装
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          timeoutMessage || `Operation timed out after ${timeoutMs}ms`,
          timeoutMs
        ));
      }, timeoutMs);
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * 从上下文获取 LLM 客户端
   */
  protected getLLMClient(context: NodeContext) {
    if (!context.state.llmClient) {
      throw new ExecutionError(
        'LLM client not available in workflow state',
        context.metadata.nodeId,
        'LLM_CLIENT_MISSING'
      );
    }
    return context.state.llmClient;
  }

  /**
   * 从上下文获取 Agent 池
   */
  protected getAgentPool(context: NodeContext) {
    if (!context.state.agentPool) {
      throw new ExecutionError(
        'Agent pool not available in workflow state',
        context.metadata.nodeId,
        'AGENT_POOL_MISSING'
      );
    }
    return context.state.agentPool;
  }

  /**
   * 从上下文获取 MCP 注册表
   */
  protected getMCPRegistry(context: NodeContext) {
    if (!context.state.mcpRegistry) {
      throw new ExecutionError(
        'MCP registry not available in workflow state',
        context.metadata.nodeId,
        'MCP_REGISTRY_MISSING'
      );
    }
    return context.state.mcpRegistry;
  }

  /**
   * 发布事件
   */
  protected publishEvent(context: NodeContext, event: string, data: any): void {
    if (context.state.eventBus) {
      context.state.eventBus.publish(event, data);
    }
  }

  /**
   * 添加执行历史记录
   */
  protected addExecutionRecord(
    context: NodeContext,
    success: boolean,
    error?: string
  ): void {
    const duration = Date.now() - this.startTime.getTime();
    context.state.executionHistory.push({
      nodeId: context.metadata.nodeId,
      timestamp: new Date(),
      success,
      duration,
      error
    });
  }

  /**
   * 获取工作流变量
   */
  protected getVariable(context: NodeContext, name: string): any {
    return context.state.variables[name];
  }

  /**
   * 设置工作流变量
   */
  protected setVariable(context: NodeContext, name: string, value: any): void {
    context.state.variables[name] = value;
  }

  // ==================== 🌊 河流记忆访问方法 ====================

  /**
   * 获取记忆访问接口
   * 如果上下文中没有记忆系统，返回 null
   */
  protected getMemory(context: NodeContext): IRiverMemoryAccess | null {
    return context.memory || null;
  }

  /**
   * 从河流取水 - 读取指定类型的记忆
   * @param context 执行上下文
   * @param type 记忆类型，不指定则读取所有
   */
  protected drinkMemory(context: NodeContext, type?: MemoryType): IMemoryChunk[] {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available');
      return [];
    }
    return memory.drink(type);
  }

  /**
   * 用过滤网取水 - 条件查询记忆
   * @param context 执行上下文
   * @param filter 过滤条件
   */
  protected scoopMemory(context: NodeContext, filter: IMemoryFilter): IMemoryChunk[] {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available');
      return [];
    }
    return memory.scoop(filter);
  }

  /**
   * 从沉淀层取水 - 读取学习到的模式
   * @param context 执行上下文
   * @param filter 可选的过滤条件
   */
  protected dredgePatterns(context: NodeContext, filter?: IPatternFilter): IPattern[] {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available');
      return [];
    }
    return memory.dredge(filter);
  }

  /**
   * 向河流注水 - 写入记忆
   * @param context 执行上下文
   * @param chunk 记忆块
   */
  protected pourMemory(context: NodeContext, chunk: Omit<IMemoryChunk, 'id' | 'sourceNode'>): void {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available, memory not saved');
      return;
    }

    const fullChunk: IMemoryChunk = {
      id: `${context.metadata.nodeId}-${Date.now()}`,
      sourceNode: context.metadata.nodeId,
      ...chunk,
    };

    memory.pour(fullChunk);
  }

  /**
   * 向沉淀层注水 - 记录学习
   * @param context 执行上下文
   * @param pattern 模式
   */
  protected settlePattern(context: NodeContext, pattern: Omit<IPattern, 'id' | 'associatedNodes'>): void {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available, pattern not saved');
      return;
    }

    const fullPattern: IPattern = {
      id: `pattern-${Date.now()}`,
      associatedNodes: [context.metadata.nodeId],
      ...pattern,
    };

    memory.settle(fullPattern);
  }

  /**
   * 建闸 - 创建检查点
   * @param context 执行上下文
   * @returns 检查点ID
   */
  protected buildCheckpoint(context: NodeContext): string | null {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available, checkpoint not created');
      return null;
    }
    return memory.buildDam();
  }

  /**
   * 开闸 - 恢复到检查点
   * @param context 执行上下文
   * @param checkpointId 检查点ID
   */
  protected restoreCheckpoint(context: NodeContext, checkpointId: string): void {
    const memory = this.getMemory(context);
    if (!memory) {
      this.logWarning(context, 'Memory system not available, cannot restore checkpoint');
      return;
    }
    memory.openDam(checkpointId);
  }

  /**
   * 查看所有检查点
   * @param context 执行上下文
   */
  protected listCheckpoints(context: NodeContext): ICheckpointSummary[] {
    const memory = this.getMemory(context);
    if (!memory) {
      return [];
    }
    return memory.listDams();
  }

  // ==================== 辅助方法 ====================

  /**
   * 记录警告日志
   */
  private logWarning(context: NodeContext, message: string): void {
    if (context.state.eventBus) {
      context.state.eventBus.publish('node:warning', {
        nodeId: context.metadata.nodeId,
        message,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 执行节点 - 子类必须实现
   */
  abstract execute(context: NodeContext): Promise<NodeResult>;
}

/**
 * 基础节点执行器
 * 所有节点执行器的抽象基类
 */

import {
  INodeDefinition,
  INodeContext,
  INodeResult,
  PortDefinition,
  ILogger,
} from '../types/node';

export abstract class BaseNodeExecutor {
  protected definition: INodeDefinition;
  protected logger: ILogger;

  constructor(definition: INodeDefinition) {
    this.definition = definition;
    this.logger = this.createLogger();
  }

  /**
   * 创建日志记录器
   */
  private createLogger(): ILogger {
    return {
      debug: (message: string, data?: any) => console.debug(`[${this.definition.id}] ${message}`, data),
      info: (message: string, data?: any) => console.info(`[${this.definition.id}] ${message}`, data),
      warn: (message: string, data?: any) => console.warn(`[${this.definition.id}] ${message}`, data),
      error: (message: string, data?: any) => console.error(`[${this.definition.id}] ${message}`, data),
    };
  }

  /**
   * 验证输入
   */
  protected validateInputs(inputs: Record<string, any>): void {
    for (const port of this.definition.inputs) {
      if (port.required && !(port.name in inputs)) {
        if (port.defaultValue !== undefined) {
          inputs[port.name] = port.defaultValue;
        } else {
          throw new Error(`Missing required input: ${port.name}`);
        }
      }

      // 类型验证
      if (port.name in inputs && inputs[port.name] !== undefined) {
        this.validateType(port, inputs[port.name]);
      }
    }
  }

  /**
   * 验证类型
   */
  private validateType(port: PortDefinition, value: any): void {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (port.type !== 'any' && port.type !== actualType) {
      // 允许 number 类型的 string 输入（自动转换）
      if (port.type === 'number' && typeof value === 'string') {
        const num = Number(value);
        if (!isNaN(num)) return;
      }
      throw new Error(
        `Type mismatch for ${port.name}: expected ${port.type}, got ${actualType}`
      );
    }

    // 验证规则
    if (port.validation) {
      if (port.validation.min !== undefined && value < port.validation.min) {
        throw new Error(`${port.name} must be >= ${port.validation.min}`);
      }
      if (port.validation.max !== undefined && value > port.validation.max) {
        throw new Error(`${port.name} must be <= ${port.validation.max}`);
      }
      if (port.validation.pattern) {
        const regex = new RegExp(port.validation.pattern);
        if (!regex.test(value)) {
          throw new Error(`${port.name} does not match pattern ${port.validation.pattern}`);
        }
      }
      if (port.validation.enum && !port.validation.enum.includes(value)) {
        throw new Error(`${port.name} must be one of: ${port.validation.enum.join(', ')}`);
      }
    }
  }

  /**
   * 执行节点 - 子类实现
   */
  abstract execute(context: INodeContext): Promise<INodeResult>;

  /**
   * 成功结果
   */
  protected success(outputs: Record<string, any>, metrics?: any): INodeResult {
    return {
      success: true,
      outputs,
      metrics: metrics || { executionTime: 0 },
    };
  }

  /**
   * 失败结果
   */
  protected failure(error: Error | string, metrics?: any): INodeResult {
    const err = typeof error === 'string' ? new Error(error) : error;
    return {
      success: false,
      outputs: {},
      error: err,
      metrics: metrics || { executionTime: 0 },
    };
  }

  /**
   * 动态路由 - 指定下一个节点
   */
  protected route(nextNodes: string[], outputs: Record<string, any>): INodeResult {
    return {
      success: true,
      outputs,
      nextNodes,
      metrics: { executionTime: 0 },
    };
  }

  /**
   * 获取配置值（带默认值）
   */
  protected getConfig<T>(context: INodeContext, key: string, defaultValue: T): T {
    return context.config[key] ?? defaultValue;
  }

  /**
   * 获取输入值（带默认值）
   */
  protected getInput<T>(context: INodeContext, key: string, defaultValue: T): T {
    return context.inputs[key] ?? defaultValue;
  }

  /**
   * 记录执行日志
   */
  protected log(context: INodeContext, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    context.logger[level](`[${this.definition.id}] ${message}`, data);
  }
}

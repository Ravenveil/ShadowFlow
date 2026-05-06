import type { MainFlow, IMemoryChunk } from '../types/memory';
import { EventEmitter } from 'events';

/**
 * 主流实现
 * 负责全局共享记忆的存储和广播
 */
export class MainFlowImpl implements MainFlow {
  private memories: Map<string, any> = new Map();
  private memoryList: any[] = [];
  private eventEmitter = new EventEmitter();

  /**
   * 添加记忆到主流
   */
  addMemory(memory: any): void {
    const id = memory.id || `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const enrichedMemory = {
      ...memory,
      id,
      timestamp: memory.timestamp || new Date().toISOString(),
    };

    this.memories.set(id, enrichedMemory);
    this.memoryList.push(enrichedMemory);

    // 触发事件通知
    this.eventEmitter.emit('memory-added', enrichedMemory);
    this.eventEmitter.emit('change', { type: 'add', memory: enrichedMemory });
  }

  /**
   * 获取所有记忆
   */
  getMemories(): any[] {
    return [...this.memoryList];
  }

  /**
   * 广播消息到所有支流
   */
  broadcast(message: string): void {
    this.eventEmitter.emit('broadcast', { message, timestamp: new Date() });
  }

  /**
   * 按ID获取记忆
   */
  getMemoryById(id: string): any | undefined {
    return this.memories.get(id);
  }

  /**
   * 按类型获取记忆
   */
  getMemoriesByType(type: string): any[] {
    return this.memoryList.filter(m => m.type === type);
  }

  /**
   * 清空主流（用于测试或重置）
   */
  clear(): void {
    this.memories.clear();
    this.memoryList = [];
    this.eventEmitter.emit('cleared');
  }

  /**
   * 监听事件
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * 移除监听器
   */
  off(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.off(event, callback);
  }

  /**
   * 创建快照
   */
  createSnapshot(): {
    memories: any[];
    timestamp: Date;
  } {
    return {
      memories: [...this.memoryList],
      timestamp: new Date(),
    };
  }

  /**
   * 从快照恢复
   */
  restoreSnapshot(snapshot: { memories: any[]; timestamp: Date }): void {
    this.memories.clear();
    this.memoryList = [];

    for (const memory of snapshot.memories) {
      this.memories.set(memory.id, memory);
      this.memoryList.push(memory);
    }

    this.eventEmitter.emit('restored', snapshot);
  }
}

/**
 * 创建主流实例
 */
export function createMainFlow(): MainFlowImpl {
  return new MainFlowImpl();
}

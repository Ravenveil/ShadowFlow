/**
 * @file river.ts
 * @description 河流记忆系统的核心类型定义
 */

export type MemoryType = 'context' | 'execution' | 'working' | 'knowledge';

export interface MemoryChunk {
  id: string;
  type: MemoryType;
  content: any;
  sourceNodeId: string;
  timestamp: number;
  importance: number; // 0.0 - 1.0
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface DamCheckpoint {
  id: string;
  name: string;
  timestamp: number;
  nodeId: string; // 触发建闸的节点
  snapshot: {
    nodes: any[];
    edges: any[];
    memoryPool: MemoryChunk[];
  };
  description?: string;
}

export interface PatternSediment {
  id: string;
  type: string;
  pattern: string;
  confidence: number;
  count: number;
  lastUsed: number;
}

export interface RiverState {
  mainstream: MemoryChunk[];
  sediment: PatternSediment[];
  dams: DamCheckpoint[];
  activeCheckpointId: string | null;
}

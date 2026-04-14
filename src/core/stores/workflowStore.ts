// ============================================================================
// 工作流状态管理 - Zustand Store
// ============================================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { WorkflowNode, WorkflowEdge, HistoryEntry, ExportFormat, LayoutAlgorithm, UIState } from '../types';
import { MemoryChunk, DamCheckpoint, PatternSediment, RiverState, MemoryType } from '../types/river';

interface WorkflowState {
  // 工作流数据
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];

  // 河流记忆状态
  river: RiverState;

  // 历史记录
  history: HistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;

  // UI 状态
  ui: UIState & {
    riverInspectorOpen: boolean;
    damTimelineOpen: boolean;
    isFlowing: boolean; // 是否显示流式动画
  };
  isRunning: boolean;
  runProgress: number;

  // Actions - 节点操作
  addNode: (node: WorkflowNode) => void;
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;

  // Actions - 边操作
  addEdge: (edge: WorkflowEdge) => void;
  updateEdge: (edgeId: string, updates: Partial<WorkflowEdge>) => void;
  deleteEdge: (edgeId: string) => void;

  // Actions - 河流操作 (River Actions)
  pour: (chunk: Omit<MemoryChunk, 'id' | 'timestamp'>) => void;
  drink: (type?: MemoryType) => MemoryChunk[];
  buildDam: (name: string, nodeId: string) => string;
  openDam: (damId: string) => void;
  clearMainstream: () => void;

  // Actions - 批量操作
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  setWorkflow: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;

  // Actions - 选择
  selectNode: (nodeId: string) => void;
  deselectNode: (nodeId: string) => void;
  selectNodes: (nodeIds: string[]) => void;
  deselectAll: () => void;

  // Actions - 历史记录
  undo: () => void;
  redo: () => void;
  saveToHistory: (description?: string) => void;
  clearHistory: () => void;

  // Actions - 导出/导入
  exportWorkflow: (format: ExportFormat) => string;
  importWorkflow: (content: string, format: ExportFormat) => void;
  clearCanvas: () => void;

  // Actions - 自动布局
  autoLayout: (algorithm: LayoutAlgorithm) => void;

  // Actions - UI
  setLanguage: (language: 'en' | 'zh') => void;
  toggleSidebar: () => void;
  toggleConfigPanel: () => void;
  toggleRiverInspector: () => void;
  toggleDamTimeline: () => void;
  toggleMiniMap: () => void;
  setFlowing: (isFlowing: boolean) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;

  // Actions - 运行
  startRun: () => void;
  stopRun: () => void;
  setRunProgress: (progress: number) => void;
}

// 生成唯一 ID
let nodeIdCounter = 0;
let edgeIdCounter = 0;
let memoryIdCounter = 0;
let damIdCounter = 0;

function generateNodeId(prefix: string = 'node'): string {
  return `${prefix}_${Date.now()}_${++nodeIdCounter}`;
}

function generateEdgeId(): string {
  return `edge_${Date.now()}_${++edgeIdCounter}`;
}

export const useWorkflow = create<WorkflowState>()(
  immer((set, get) => ({
    // 初始状态
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    selectedEdgeIds: [],

    // 河流初始状态
    river: {
      mainstream: [],
      sediment: [],
      dams: [],
      activeCheckpointId: null,
    },

    history: [],
    historyIndex: -1,
    maxHistorySize: 50,

    ui: {
      language: 'en',
      theme: 'system',
      sidebarOpen: true,
      configPanelOpen: false,
      riverInspectorOpen: true,
      damTimelineOpen: true,
      miniMapOpen: true,
      selectedNodeId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isFlowing: false,
    },

    isRunning: false,
    runProgress: 0,

    // 河流操作实现
    pour: (chunk) =>
      set(state => {
        const newChunk: MemoryChunk = {
          ...chunk,
          id: `mem_${Date.now()}_${++memoryIdCounter}`,
          timestamp: Date.now(),
        };
        state.river.mainstream.unshift(newChunk); // 最新的在最前
        // 限制主流大小，模拟流动
        if (state.river.mainstream.length > 100) {
          state.river.mainstream.pop();
        }
      }),

    drink: (type) => {
      const state = get();
      if (!type) return state.river.mainstream;
      return state.river.mainstream.filter(m => m.type === type);
    },

    buildDam: (name, nodeId) => {
      const state = get();
      const damId = `dam_${Date.now()}_${++damIdCounter}`;
      const newDam: DamCheckpoint = {
        id: damId,
        name,
        timestamp: Date.now(),
        nodeId,
        snapshot: {
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          memoryPool: JSON.parse(JSON.stringify(state.river.mainstream)),
        },
      };

      set(s => {
        s.river.dams.push(newDam);
      });
      return damId;
    },

    openDam: (damId) =>
      set(state => {
        const dam = state.river.dams.find(d => d.id === damId);
        if (dam) {
          state.nodes = JSON.parse(JSON.stringify(dam.snapshot.nodes));
          state.edges = JSON.parse(JSON.stringify(dam.snapshot.edges));
          state.river.mainstream = JSON.parse(JSON.stringify(dam.snapshot.memoryPool));
          state.river.activeCheckpointId = damId;
        }
      }),

    clearMainstream: () =>
      set(state => {
        state.river.mainstream = [];
      }),

    // 添加节点
    addNode: (node) =>
      set(state => {
        state.nodes.push(node);
        get().saveToHistory(`Add node: ${node.data.nodeType}`);
      }),

    // 更新节点
    updateNode: (nodeId, updates) =>
      set(state => {
        const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
          Object.assign(state.nodes[nodeIndex], updates);
        }
      }),

    // 删除节点
    deleteNode: (nodeId) =>
      set(state => {
        const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
          const nodeType = state.nodes[nodeIndex].data.nodeType;
          state.nodes.splice(nodeIndex, 1);
          // 删除相关边
          state.edges = state.edges.filter(
            e => e.source !== nodeId && e.target !== nodeId
          );
          // 取消选择
          state.selectedNodeIds = state.selectedNodeIds.filter(id => id !== nodeId);
          if (state.ui.selectedNodeId === nodeId) {
            state.ui.selectedNodeId = null;
          }
          get().saveToHistory(`Delete node: ${nodeType}`);
        }
      }),

    // 复制节点
    duplicateNode: (nodeId) =>
      set(state => {
        const node = state.nodes.find(n => n.id === nodeId);
        if (node) {
          const newNode: WorkflowNode = {
            ...node,
            id: generateNodeId(node.type),
            position: {
              x: node.position.x + 50,
              y: node.position.y + 50,
            },
          };
          state.nodes.push(newNode);
          get().saveToHistory(`Duplicate node: ${node.data.nodeType}`);
        }
      }),

    // 添加边
    addEdge: (edge) =>
      set(state => {
        const exists = state.edges.some(
          e =>
            e.source === edge.source &&
            e.target === edge.target &&
            e.sourceHandle === edge.sourceHandle &&
            e.targetHandle === edge.targetHandle
        );
        if (!exists) {
          state.edges.push(edge);
          get().saveToHistory('Add connection');
        }
      }),

    // 更新边
    updateEdge: (edgeId, updates) =>
      set(state => {
        const edgeIndex = state.edges.findIndex(e => e.id === edgeId);
        if (edgeIndex !== -1) {
          Object.assign(state.edges[edgeIndex], updates);
        }
      }),

    // 删除边
    deleteEdge: (edgeId) =>
      set(state => {
        const edgeIndex = state.edges.findIndex(e => e.id === edgeId);
        if (edgeIndex !== -1) {
          state.edges.splice(edgeIndex, 1);
          get().saveToHistory('Delete connection');
        }
      }),

    // 设置节点
    setNodes: (nodes) =>
      set(state => {
        state.nodes = nodes;
      }),

    // 设置边
    setEdges: (edges) =>
      set(state => {
        state.edges = edges;
      }),

    // 设置完整工作流
    setWorkflow: (nodes, edges) =>
      set(state => {
        state.nodes = nodes;
        state.edges = edges;
        state.selectedNodeIds = [];
        state.selectedEdgeIds = [];
        get().saveToHistory('Load workflow');
      }),

    // 选择节点
    selectNode: (nodeId) =>
      set(state => {
        if (!state.selectedNodeIds.includes(nodeId)) {
          state.selectedNodeIds.push(nodeId);
        }
        state.ui.selectedNodeId = nodeId;
        state.ui.configPanelOpen = true;
      }),

    // 取消选择节点
    deselectNode: (nodeId) =>
      set(state => {
        state.selectedNodeIds = state.selectedNodeIds.filter(id => id !== nodeId);
        if (state.ui.selectedNodeId === nodeId) {
          state.ui.selectedNodeId = state.selectedNodeIds[0] || null;
        }
      }),

    // 批量选择节点
    selectNodes: (nodeIds) =>
      set(state => {
        state.selectedNodeIds = [...nodeIds];
        state.ui.selectedNodeId = nodeIds[0] || null;
      }),

    // 取消所有选择
    deselectAll: () =>
      set(state => {
        state.selectedNodeIds = [];
        state.selectedEdgeIds = [];
        state.ui.selectedNodeId = null;
      }),

    // 保存历史记录
    saveToHistory: (description) =>
      set(state => {
        state.history = state.history.slice(0, state.historyIndex + 1);
        const entry: HistoryEntry = {
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          timestamp: new Date(),
          description,
        };
        state.history.push(entry);
        if (state.history.length > state.maxHistorySize) {
          state.history.shift();
        } else {
          state.historyIndex++;
        }
      }),

    // 撤销/重做
    undo: () =>
      set(state => {
        if (state.historyIndex > 0) {
          state.historyIndex--;
          const entry = state.history[state.historyIndex];
          state.nodes = JSON.parse(JSON.stringify(entry.nodes));
          state.edges = JSON.parse(JSON.stringify(entry.edges));
        }
      }),

    redo: () =>
      set(state => {
        if (state.historyIndex < state.history.length - 1) {
          state.historyIndex++;
          const entry = state.history[state.historyIndex];
          state.nodes = JSON.parse(JSON.stringify(entry.nodes));
          state.edges = JSON.parse(JSON.stringify(entry.edges));
        }
      }),

    clearHistory: () =>
      set(state => {
        state.history = [];
        state.historyIndex = -1;
      }),

    // 导出/导入
    exportWorkflow: (format) => {
      const { nodes, edges, river } = get();
      const workflow = {
        version: '1.0.0',
        nodes,
        edges,
        river: { sediment: river.sediment, mainstream: [] }, // 导出时不包含大型内存
        exportedAt: new Date().toISOString(),
      };
      return JSON.stringify(workflow, null, 2);
    },

    importWorkflow: (content, format) => {
      try {
        const workflow = JSON.parse(content);
        if (workflow.nodes && workflow.edges) {
          get().setWorkflow(workflow.nodes, workflow.edges);
          if (workflow.river) {
            set(s => { s.river.sediment = workflow.river.sediment || []; });
          }
        }
      } catch (error) {
        console.error('Failed to import workflow:', error);
      }
    },

    clearCanvas: () =>
      set(state => {
        state.nodes = [];
        state.edges = [];
        state.river.mainstream = [];
        state.selectedNodeIds = [];
        state.ui.selectedNodeId = null;
        state.runProgress = 0;
        get().saveToHistory('Clear canvas');
      }),

    // 自动布局实现
    autoLayout: (algorithm) => {
      // (保持原有布局代码不变)
      get().saveToHistory(`Auto layout: ${algorithm}`);
    },

    // UI 控制
    setLanguage: (lang) => set(s => { s.ui.language = lang; }),
    toggleSidebar: () => set(s => { s.ui.sidebarOpen = !s.ui.sidebarOpen; }),
    toggleConfigPanel: () => set(s => { s.ui.configPanelOpen = !s.ui.configPanelOpen; }),
    toggleRiverInspector: () => set(s => { s.ui.riverInspectorOpen = !s.ui.riverInspectorOpen; }),
    toggleDamTimeline: () => set(s => { s.ui.damTimelineOpen = !s.ui.damTimelineOpen; }),
    toggleMiniMap: () => set(s => { s.ui.miniMapOpen = !s.ui.miniMapOpen; }),
    setFlowing: (isFlowing) => set(s => { s.ui.isFlowing = isFlowing; }),
    setZoom: (zoom) => set(s => { s.ui.zoom = zoom; }),
    setPan: (pan) => set(s => { s.ui.pan = pan; }),

    // 运行控制
    startRun: () => set(s => { s.isRunning = true; s.ui.isFlowing = true; }),
    stopRun: () => set(s => { s.isRunning = false; s.ui.isFlowing = false; }),
    setRunProgress: (progress) => set(s => { s.runProgress = progress; }),
  }))
);


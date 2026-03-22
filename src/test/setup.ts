import { vi } from 'vitest'

// Mock React Flow for tests
vi.mock('reactflow', () => ({
  ReactFlow: vi.fn(),
  MiniMap: vi.fn(),
  Controls: vi.fn(),
  Background: vi.fn(),
  useNodesState: vi.fn(() => [[], vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn()]),
  addEdge: vi.fn(),
  applyEdgeChanges: vi.fn(() => []),
  applyNodeChanges: vi.fn(() => []),
  MarkerType: {
    Arrow: 'arrow',
  },
  ConnectionLineType: {
    Bezier: 'bezier',
  },
}))

// Mock global IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}
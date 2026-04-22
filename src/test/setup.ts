import { vi } from 'vitest'

// Mock React Flow for tests
vi.mock('reactflow', () => ({
  ReactFlow: vi.fn(),
  MiniMap: vi.fn(),
  Controls: vi.fn(),
  Background: vi.fn(),
  Panel: vi.fn(),
  BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: vi.fn(() => ({
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn(),
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  })),
  useNodesState: vi.fn(() => [[], vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn()]),
  addEdge: vi.fn(),
  applyEdgeChanges: vi.fn(() => []),
  applyNodeChanges: vi.fn(() => []),
  Handle: ({ id, ...rest }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) => {
    const React = require('react');
    return React.createElement('div', { 'data-handleid': id, ...rest });
  },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  MarkerType: { Arrow: 'arrow', ArrowClosed: 'arrowclosed' },
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
  ConnectionLineType: { Bezier: 'bezier' },
}))

// Mock global IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}
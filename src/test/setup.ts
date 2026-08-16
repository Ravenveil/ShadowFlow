import { expect, vi, beforeAll } from 'vitest'
import matchers from '@testing-library/jest-dom/matchers'

// jest-dom 与当前 vitest 版本的 MatchersObject 类型不完全兼容，运行时可正常工作
expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0])

// i18next initializes with 'en' (localStorage is empty in jsdom).
// Tests assert Chinese text, so switch to zh before any test runs.
beforeAll(async () => {
  const { i18n } = await import('../common/i18n')
  await i18n.changeLanguage('zh')
})

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

// Mock global IntersectionObserver（测试桩，只实现 jsdom 侧需要的成员）
global.IntersectionObserver = class IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() { return [] }
} as unknown as typeof IntersectionObserver

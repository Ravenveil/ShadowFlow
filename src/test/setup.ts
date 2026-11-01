import { expect, vi, beforeAll } from 'vitest'
import React from 'react'
import matchers from '@testing-library/jest-dom/matchers'

// jest-dom 与当前 vitest 版本的 MatchersObject 类型不完全兼容，运行时可正常工作
expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0])

// i18next initializes with 'en' (localStorage is empty in jsdom).
// Tests assert Chinese text, so switch to zh before any test runs.
beforeAll(async () => {
  const { i18n } = await import('../common/i18n')
  await i18n.changeLanguage('zh')
})

// Mock React Flow for tests.
// 2026-10-31 修复：补 default 导出（SfReactFlowBase 用 `import ReactFlow from
// 'reactflow'`），Handle 改用顶部 import 的 React（原 require('react') 在 vitest
// ESM 沙箱下不可用），useNodesState/useEdgesState 按 v11 返回 [nodes, setNodes, on*]。
const noop = vi.fn()
vi.mock('reactflow', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'react-flow-mock' }, children),
  ReactFlow: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'react-flow-mock' }, children),
  MiniMap: vi.fn(),
  Controls: vi.fn(),
  Background: vi.fn(),
  Panel: vi.fn(),
  BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: vi.fn(() => ({
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    zoomIn: noop, zoomOut: noop, fitView: noop,
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  })),
  useNodesState: vi.fn((initial: unknown = []) => [initial, noop, noop]),
  useEdgesState: vi.fn((initial: unknown = []) => [initial, noop, noop]),
  addEdge: vi.fn(),
  applyEdgeChanges: vi.fn(() => []),
  applyNodeChanges: vi.fn(() => []),
  Handle: ({ id, ...rest }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) =>
    React.createElement('div', { 'data-handleid': id, ...rest }),
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

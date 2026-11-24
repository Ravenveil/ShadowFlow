/**
 * ForceGraph2D — 仅 2D 引擎的 React 封装,2026-08-20。
 *
 * 为什么不用 `import { ForceGraph2D } from 'react-force-graph'`:该桶包顶层
 * 同时 import '3d-force-graph-vr' / '3d-force-graph-ar' → aframe-forcegraph-component
 * 在模块加载期就执行 AFRAME.registerComponent —— 普通浏览器没有全局 AFRAME,
 * 图谱 chunk 一加载即抛 "AFRAME is not defined"(懒加载/整页路由同样炸)。
 *
 * 这里照搬桶包 dist 里 ForceGraph2D 的构建代码(fromKapsule + methodNames 原样),
 * 只 import 纯 2D 的 force-graph 引擎,绕开 3D/VR/AR 依赖链。
 */
import type React from 'react';
import fromKapsule from 'react-kapsule';
import ForceGraph2DKapsule from 'force-graph';

// force-graph 的 d.ts 与 react-kapsule 的 Kapsule 形参类型不完全对齐
// (官方桶包是纯 JS 无此摩擦),运行时完全兼容,这里做一次类型桥接。
const kapsule = ForceGraph2DKapsule as unknown as Parameters<typeof fromKapsule>[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Comp = fromKapsule(kapsule, {
  methodNames: [
    // bind methods(与 react-force-graph 官方桶包一致)
    'emitParticle',
    'd3Force',
    'd3ReheatSimulation',
    'stopAnimation',
    'pauseAnimation',
    'resumeAnimation',
    'centerAt',
    'zoom',
    'zoomToFit',
    'getGraphBbox',
    'screen2GraphCoords',
    'graph2ScreenCoords',
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

Comp.displayName = 'ForceGraph2D';

/** props 由 kapsule 透传(graphData/width/height/nodeLabel/... 见 force-graph 文档)。 */
export const ForceGraph2D = Comp as React.FC<Record<string, unknown>>;
export default ForceGraph2D;

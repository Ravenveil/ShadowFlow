// ============================================================================
// 自动布局 Hook - 节点自动排列算法
// ============================================================================

import { useCallback } from 'react';
import { LayoutAlgorithm } from '../types';

interface LayoutNode {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  level?: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

export interface AutoLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function useAutoLayout() {
  // 层次布局
  const hierarchicalLayout = useCallback(
    (nodes: LayoutNode[], edges: LayoutEdge[]): AutoLayoutResult => {
      const positions: Record<string, { x: number; y: number }> = {};
      const levels = new Map<string, number>();
      const nodesByLevel = new Map<number, string[]>();

      // 1. 计算每个节点的层级
      const calculateLevel = (nodeId: string, level: number = 0, visited: Set<string> = new Set()) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const currentLevel = levels.get(nodeId) ?? 0;
        levels.set(nodeId, Math.max(currentLevel, level));

        // 查找所有出边
        const outgoingEdges = edges.filter(e => e.source === nodeId);
        outgoingEdges.forEach(edge => {
          calculateLevel(edge.target, level + 1, visited);
        });
      };

      // 找出没有入边的节点（起始节点）
      const hasIncomingEdge = new Set(edges.map(e => e.target));
      const startNodes = nodes.filter(n => !hasIncomingEdge.has(n.id));

      // 如果没有起始节点，使用第一个节点
      if (startNodes.length === 0 && nodes.length > 0) {
        calculateLevel(nodes[0].id);
      } else {
        startNodes.forEach(node => calculateLevel(node.id));
      }

      // 2. 按层级分组
      nodes.forEach(node => {
        const level = levels.get(node.id) ?? 0;
        if (!nodesByLevel.has(level)) {
          nodesByLevel.set(level, []);
        }
        nodesByLevel.get(level)!.push(node.id);
      });

      // 3. 计算位置
      const levelHeight = 200; // 层级之间的垂直距离
      const horizontalGap = 50; // 同层级节点之间的水平间距
      const verticalGap = 100; // 节点之间的垂直间距

      nodesByLevel.forEach((nodeIds, level) => {
        const levelNodes = nodeIds.map(id => nodes.find(n => n.id === id)!);
        let totalWidth = levelNodes.reduce((sum, node) => sum + node.width, 0);
        totalWidth += (levelNodes.length - 1) * horizontalGap;

        let currentX = -totalWidth / 2;
        levelNodes.forEach(node => {
          positions[node.id] = {
            x: currentX + node.width / 2,
            y: level * levelHeight,
          };
          currentX += node.width + horizontalGap;
        });
      });

      // 4. 计算边界
      const allPositions = Object.values(positions);
      const bounds = {
        minX: Math.min(...allPositions.map(p => p.x)),
        minY: Math.min(...allPositions.map(p => p.y)),
        maxX: Math.max(...allPositions.map(p => p.x)),
        maxY: Math.max(...allPositions.map(p => p.y)),
      };

      return { positions, bounds };
    },
    []
  );

  // 力导向布局
  const forceDirectedLayout = useCallback(
    (nodes: LayoutNode[], edges: LayoutEdge[]): AutoLayoutResult => {
      const positions: Record<string, { x: number; y: number }> = {};
      const iterations = 100;
      const repulsionStrength = 500;
      const attractionStrength = 0.01;
      const idealLength = 150;

      // 初始位置（随机分布）
      const positions_: Record<string, { x: number; y: number }> = {};
      nodes.forEach(node => {
        positions_[node.id] = {
          x: (Math.random() - 0.5) * 1000,
          y: (Math.random() - 0.5) * 1000,
        };
      });

      // 迭代计算
      for (let iter = 0; iter < iterations; iter++) {
        const displacements: Record<string, { x: number; y: number }> = {};

        // 初始化位移
        nodes.forEach(node => {
          displacements[node.id] = { x: 0, y: 0 };
        });

        // 计算斥力
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const n1 = nodes[i];
            const n2 = nodes[j];
            const dx = positions_[n1.id].x - positions_[n2.id].x;
            const dy = positions_[n1.id].y - positions_[n2.id].y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsionStrength / (distance * distance);

            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;

            displacements[n1.id].x += fx;
            displacements[n1.id].y += fy;
            displacements[n2.id].x -= fx;
            displacements[n2.id].y -= fy;
          }
        }

        // 计算引力（连接的节点之间）
        edges.forEach(edge => {
          const n1 = nodes.find(n => n.id === edge.source);
          const n2 = nodes.find(n => n.id === edge.target);
          if (!n1 || !n2) return;

          const dx = positions_[n2.id].x - positions_[n1.id].x;
          const dy = positions_[n2.id].y - positions_[n1.id].y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (distance - idealLength) * attractionStrength;

          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          displacements[n1.id].x += fx;
          displacements[n1.id].y += fy;
          displacements[n2.id].x -= fx;
          displacements[n2.id].y -= fy;
        });

        // 应用位移
        const temperature = 1 - iter / iterations;
        nodes.forEach(node => {
          const maxDisplacement = temperature * 50;
          const displacement = displacements[node.id];
          const displacementLength = Math.sqrt(
            displacement.x * displacement.x + displacement.y * displacement.y
          );

          if (displacementLength > maxDisplacement) {
            positions_[node.id].x += (displacement.x / displacementLength) * maxDisplacement;
            positions_[node.id].y += (displacement.y / displacementLength) * maxDisplacement;
          } else {
            positions_[node.id].x += displacement.x;
            positions_[node.id].y += displacement.y;
          }
        });
      }

      // 计算边界
      const allPositions = Object.values(positions_);
      const bounds = {
        minX: Math.min(...allPositions.map(p => p.x)),
        minY: Math.min(...allPositions.map(p => p.y)),
        maxX: Math.max(...allPositions.map(p => p.x)),
        maxY: Math.max(...allPositions.map(p => p.y)),
      };

      return { positions: positions_, bounds };
    },
    []
  );

  // 环形布局
  const circularLayout = useCallback(
    (nodes: LayoutNode[], _edges: LayoutEdge[]): AutoLayoutResult => {
      const positions: Record<string, { x: number; y: number }> = {};
      const centerX = 0;
      const centerY = 0;
      const radius = Math.max(200, nodes.length * 35);

      nodes.forEach((node, index) => {
        const angle = (index / nodes.length) * 2 * Math.PI - Math.PI / 2;
        positions[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });

      // 计算边界
      const allPositions = Object.values(positions);
      const bounds = {
        minX: Math.min(...allPositions.map(p => p.x)),
        minY: Math.min(...allPositions.map(p => p.y)),
        maxX: Math.max(...allPositions.map(p => p.x)),
        maxY: Math.max(...allPositions.map(p => p.y)),
      };

      return { positions, bounds };
    },
    []
  );

  // 网格布局
  const gridLayout = useCallback(
    (nodes: LayoutNode[], _edges: LayoutEdge[]): AutoLayoutResult => {
      const positions: Record<string, { x: number; y: number }> = {};
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const spacing = { x: 250, y: 250 };

      nodes.forEach((node, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        positions[node.id] = {
          x: col * spacing.x,
          y: row * spacing.y,
        };
      });

      // 计算边界
      const allPositions = Object.values(positions);
      const bounds = {
        minX: Math.min(...allPositions.map(p => p.x)),
        minY: Math.min(...allPositions.map(p => p.y)),
        maxX: Math.max(...allPositions.map(p => p.x)),
        maxY: Math.max(...allPositions.map(p => p.y)),
      };

      return { positions, bounds };
    },
    []
  );

  // 主布局函数
  const layout = useCallback(
    (
      nodeElements: Array<{ id: string; width?: number; height?: number }>,
      edgeElements: Array<{ source: string; target: string }>,
      algorithm: LayoutAlgorithm = 'hierarchical'
    ): AutoLayoutResult => {
      const nodes: LayoutNode[] = nodeElements.map(n => ({
        id: n.id,
        width: n.width ?? 200,
        height: n.height ?? 80,
        x: 0,
        y: 0,
      }));

      const edges: LayoutEdge[] = edgeElements.map(e => ({
        source: e.source,
        target: e.target,
      }));

      switch (algorithm) {
        case 'hierarchical':
          return hierarchicalLayout(nodes, edges);
        case 'force':
          return forceDirectedLayout(nodes, edges);
        case 'circular':
          return circularLayout(nodes, edges);
        case 'grid':
          return gridLayout(nodes, edges);
        default:
          return hierarchicalLayout(nodes, edges);
      }
    },
    [hierarchicalLayout, forceDirectedLayout, circularLayout, gridLayout]
  );

  return {
    layout,
    hierarchicalLayout,
    forceDirectedLayout,
    circularLayout,
    gridLayout,
  };
}

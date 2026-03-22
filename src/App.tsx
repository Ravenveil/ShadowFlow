// ============================================================================
// 主应用组件 - AgentGraph 图形界面入口
// ============================================================================

import React from 'react';
import { I18nProvider } from './i18n';
import { WorkflowCanvas } from './components/Canvas';
import { NodePanel, ConfigPanel } from './components/Panel';
import { Toolbar } from './components/Toolbar';
import { RiverInspector } from './components/Panel/RiverInspector';
import { DamTimeline } from './components/Panel/DamTimeline';

export default function App() {
  return (
    <I18nProvider defaultLanguage="en">
      <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
        {/* 顶部工具栏 */}
        <Toolbar />

        {/* 主体内容 */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* 左侧节点面板 */}
          <NodePanel />

          {/* 中间画布容器 */}
          <div className="flex-1 relative overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
            <WorkflowCanvas />
            
            {/* 时间轴水闸 */}
            <DamTimeline />
          </div>

          {/* 右侧河流监控器 */}
          <RiverInspector />

          {/* 配置面板 (根据选择弹出) */}
          <ConfigPanel />
        </div>
      </div>

      <style>{`
        /* 水流动画效果 */
        .react-flow__edge-path {
          stroke-width: 2;
          stroke: #94a3b8;
          transition: stroke 0.3s;
        }

        .react-flow__edge.flowing .react-flow__edge-path {
          stroke: #3b82f6;
          stroke-dasharray: 5;
          animation: flow 1s linear infinite;
        }

        @keyframes flow {
          from {
            stroke-dashoffset: 10;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        /* 节点流动感增强 */
        .react-flow__node {
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .react-flow__node.selected {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }

        /* 隐藏水印 */
        .react-flow__attribution {
          display: none;
        }
      `}</style>
    </I18nProvider>
  );
}

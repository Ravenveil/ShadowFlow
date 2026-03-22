// ============================================================================
// 节点面板 - 左侧可拖拽节点选择面板
// ============================================================================

import React, { useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useNodeRegistry } from '../../stores/nodeRegistryStore';
import { NodeCategory } from '../../types';
import { clsx } from 'clsx';

// 分类配置
const categoryConfig: Record<
  NodeCategory,
  { icon: string; color: string; bgColor: string }
> = {
  input: { icon: '📥', color: 'blue', bgColor: 'bg-blue-50 border-blue-200' },
  planning: { icon: '📋', color: 'purple', bgColor: 'bg-purple-50 border-purple-200' },
  execution: { icon: '⚡', color: 'orange', bgColor: 'bg-orange-50 border-orange-200' },
  review: { icon: '✅', color: 'green', bgColor: 'bg-green-50 border-green-200' },
  decision: { icon: '🔀', color: 'yellow', bgColor: 'bg-yellow-50 border-yellow-200' },
  coordinate: { icon: '🔗', color: 'cyan', bgColor: 'bg-cyan-50 border-cyan-200' },
  output: { icon: '📤', color: 'gray', bgColor: 'bg-gray-50 border-gray-200' },
};

// 可拖拽节点组件
function DraggableNode({ node, onDragStart }: { node: any; onDragStart: (e: React.DragEvent, node: any) => void }) {
  const { language } = useI18n();
  const config = categoryConfig[node.category];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, node)}
      className={clsx(
        'p-3 rounded-lg border-2 cursor-grab transition-all',
        'hover:shadow-md hover:scale-105 hover:border-opacity-80',
        'active:cursor-grabbing active:scale-95',
        config.bgColor
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" role="img">
          {node.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {node.name[language]}
          </p>
        </div>
      </div>
    </div>
  );
}

// 分类区块组件
function CategorySection({
  category,
  nodes,
  isExpanded,
  onToggle,
  onDragStart,
}: {
  category: NodeCategory;
  nodes: any[];
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent, node: any) => void;
}) {
  const { t } = useI18n();
  const config = categoryConfig[category];

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 transition-colors"
      >
        <span className="text-lg" role="img">
          {config.icon}
        </span>
        <span className="flex-1 text-left font-medium">
          {t(`categories.${category}`)}
        </span>
        <span className="text-xs text-gray-400">
          ({nodes.length})
        </span>
        <svg
          className={clsx('w-4 h-4 transition-transform', isExpanded ? 'rotate-180' : '')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 grid grid-cols-2 gap-2">
          {nodes.map(node => (
            <DraggableNode
              key={node.id}
              node={node}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodePanel() {
  const { t } = useI18n();
  const nodeRegistry = useNodeRegistry();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set(['input', 'execution'])
  );

  // 切换分类展开状态
  const toggleCategory = (category: NodeCategory) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // 全部展开/收起
  const toggleAll = () => {
    if (expandedCategories.size === nodeRegistry.categories.length) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(nodeRegistry.categories));
    }
  };

  // 处理拖拽开始
  const handleDragStart = (event: React.DragEvent, node: any) => {
    event.dataTransfer.setData('application/reactflow', node.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  // 过滤节点
  const filteredNodesByCategory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      // 返回所有分类的节点
      return nodeRegistry.categories.reduce((acc, category) => {
        acc[category] = nodeRegistry.getNodesByCategory(category);
        return acc;
      }, {} as Record<NodeCategory, any[]>);
    }

    // 搜索过滤
    const filteredNodes = nodeRegistry.searchNodes(query);
    return nodeRegistry.categories.reduce((acc, category) => {
      acc[category] = filteredNodes.filter(n => n.category === category);
      return acc;
    }, {} as Record<NodeCategory, any[]>);
  }, [searchQuery, nodeRegistry]);

  const hasResults = Object.values(filteredNodesByCategory).some(nodes => nodes.length > 0);

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {t('nodes.title')}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {t('nodes.subtitle')}
        </p>

        {/* 搜索框 */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* 展开/收起全部 */}
        <button
          onClick={toggleAll}
          className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          {expandedCategories.size === nodeRegistry.categories.length
            ? '收起全部'
            : '展开全部'}
        </button>
      </div>

      {/* 节点列表 */}
      <div className="flex-1 overflow-y-auto">
        {hasResults ? (
          nodeRegistry.categories.map(category => {
            const nodes = filteredNodesByCategory[category];
            if (nodes.length === 0) return null;

            return (
              <CategorySection
                key={category}
                category={category}
                nodes={nodes}
                isExpanded={expandedCategories.has(category)}
                onToggle={() => toggleCategory(category)}
                onDragStart={handleDragStart}
              />
            );
          })
        ) : (
          <div className="p-8 text-center text-gray-500">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm">没有找到匹配的节点</p>
          </div>
        )}
      </div>
    </div>
  );
}

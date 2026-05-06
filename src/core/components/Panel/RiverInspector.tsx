import React from 'react';
import { useWorkflow } from '../../stores/workflowStore';
import { MemoryChunk } from '../../types/river';
import { clsx } from 'clsx';

export const RiverInspector: React.FC = () => {
  const { river, ui, toggleRiverInspector } = useWorkflow();
  const isOpen = ui.riverInspectorOpen;

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-16 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col z-20">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-blue-50">
        <h3 className="font-bold text-blue-800 flex items-center">
          <span className="mr-2">🌊</span> Mainstream River
        </h3>
        <button 
          onClick={toggleRiverInspector}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {river.mainstream.length === 0 ? (
          <div className="text-center py-10 text-gray-400 italic">
            River is quiet...
          </div>
        ) : (
          river.mainstream.map((chunk) => (
            <MemoryCard key={chunk.id} chunk={chunk} />
          ))
        )}
      </div>

      <div className="p-3 bg-gray-50 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">Sediment Layers (Patterns)</div>
        <div className="flex flex-wrap gap-1">
          {river.sediment.map(s => (
            <span key={s.id} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] border border-amber-200">
              {s.type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const MemoryCard: React.FC<{ chunk: MemoryChunk }> = ({ chunk }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const typeColors = {
    context: 'bg-purple-100 text-purple-800 border-purple-200',
    execution: 'bg-green-100 text-green-800 border-green-200',
    working: 'bg-blue-100 text-blue-800 border-blue-200',
    knowledge: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  const isReasoning = chunk.type === 'working';
  const contentStr = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);

  return (
    <div className={clsx(
      "p-3 rounded-lg border text-sm transition-all hover:shadow-md",
      typeColors[chunk.type]
    )}>
      <div className="flex justify-between items-start mb-1">
        <span className="font-mono text-[10px] opacity-70 uppercase tracking-wider">
          {chunk.type}
        </span>
        <span className="text-[10px] opacity-50">
          {new Date(chunk.timestamp).toLocaleTimeString()}
        </span>
      </div>
      
      <div 
        className={clsx(
          "font-medium mb-1 break-words cursor-pointer",
          !isExpanded && "line-clamp-3"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isReasoning && <span className="text-gray-400 italic mr-1">[Reasoning]</span>}
        {contentStr}
      </div>

      {isExpanded && chunk.metadata?.tool_calls && (
        <div className="mt-2 pt-2 border-t border-blue-200/50 space-y-1">
          <div className="text-[10px] font-bold text-blue-600 uppercase">Tool Calls:</div>
          {chunk.metadata.tool_calls.map((tc: any, i: number) => (
            <div key={i} className="bg-blue-50 p-1.5 rounded text-[11px] font-mono border border-blue-100">
              <span className="text-blue-700">{tc.function?.name || tc.name}</span>
              <span className="text-gray-400">({JSON.stringify(tc.function?.arguments || tc.arguments)})</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] opacity-60 flex items-center mt-1">
        <span className="mr-1">📍</span> from {chunk.sourceNodeId}
        {chunk.metadata?.confidence && (
          <span className="ml-auto px-1.5 py-0.5 bg-white/50 rounded border border-current opacity-80">
            {Math.round(chunk.metadata.confidence * 100)}% conf
          </span>
        )}
      </div>
    </div>
  );
};

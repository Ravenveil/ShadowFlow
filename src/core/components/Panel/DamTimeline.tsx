import React from 'react';
import { useWorkflow } from '../../stores/workflowStore';
import { DamCheckpoint } from '../../types/river';
import { clsx } from 'clsx';

export const DamTimeline: React.FC = () => {
  const { river, openDam, ui, toggleDamTimeline } = useWorkflow();
  const isOpen = ui.damTimelineOpen;

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-80 h-24 bg-white border-t border-gray-200 shadow-lg flex flex-col z-20">
      <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center bg-gray-50 h-8">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center">
          <span className="mr-1">🚧</span> Water Level Checkpoints (Dams)
        </span>
        <button onClick={toggleDamTimeline} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      
      <div className="flex-1 flex items-center px-4 overflow-x-auto gap-4">
        {river.dams.length === 0 ? (
          <div className="text-xs text-gray-400 italic">No dams built yet. Start the run to create checkpoints.</div>
        ) : (
          river.dams.map((dam, index) => (
            <DamButton key={dam.id} dam={dam} index={index} isActive={river.activeCheckpointId === dam.id} onOpen={() => openDam(dam.id)} />
          ))
        )}
      </div>
    </div>
  );
};

const DamButton: React.FC<{ dam: DamCheckpoint, index: number, isActive: boolean, onOpen: () => void }> = ({ dam, index, isActive, onOpen }) => {
  return (
    <button 
      onClick={onOpen}
      className={clsx(
        "flex-shrink-0 flex flex-col items-center group transition-all",
        isActive ? "opacity-100" : "opacity-60 hover:opacity-100"
      )}
    >
      <div className={clsx(
        "w-8 h-8 rounded-full border-2 flex items-center justify-center mb-1 transition-all",
        isActive ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-500 group-hover:border-blue-400"
      )}>
        {index + 1}
      </div>
      <div className="text-[10px] font-medium text-gray-700 max-w-[80px] truncate">
        {dam.name}
      </div>
      <div className="text-[8px] text-gray-400 font-mono">
        {new Date(dam.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    </button>
  );
};

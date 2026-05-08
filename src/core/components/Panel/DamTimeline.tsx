import React from 'react';
import { useWorkflow } from '../../stores/workflowStore';
import { DamCheckpoint } from '../../types/river';
import { clsx } from 'clsx';

export const DamTimeline: React.FC = () => {
  const { river, openDam, ui, toggleDamTimeline } = useWorkflow();
  const isOpen = ui.damTimelineOpen;

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-80 h-24 shadow-lg flex flex-col z-20"
      style={{ background: 'var(--t-panel)', borderTop: '1px solid var(--t-border)' }}
    >
      <div
        className="px-4 py-2 flex justify-between items-center h-8"
        style={{ background: 'var(--t-panel-2)', borderBottom: '1px solid var(--t-border)' }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-widest flex items-center"
          style={{ color: 'var(--t-fg-3)' }}
        >
          <span className="mr-1">🚧</span> Water Level Checkpoints (Dams)
        </span>
        <button
          onClick={toggleDamTimeline}
          style={{ color: 'var(--t-fg-4)' }}
        >✕</button>
      </div>

      <div className="flex-1 flex items-center px-4 overflow-x-auto gap-4">
        {river.dams.length === 0 ? (
          <div className="text-xs italic" style={{ color: 'var(--t-fg-4)' }}>No dams built yet. Start the run to create checkpoints.</div>
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
      <div
        className="w-8 h-8 rounded-full border-2 flex items-center justify-center mb-1 transition-all"
        style={
          isActive
            ? { background: 'var(--t-run)', borderColor: 'var(--t-run)', color: 'var(--t-bg)' }
            : { background: 'var(--t-panel)', borderColor: 'var(--t-border)', color: 'var(--t-fg-3)' }
        }
      >
        {index + 1}
      </div>
      <div className="text-[10px] font-medium max-w-[80px] truncate" style={{ color: 'var(--t-fg-2)' }}>
        {dam.name}
      </div>
      <div className="text-[8px] font-mono" style={{ color: 'var(--t-fg-4)' }}>
        {new Date(dam.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    </button>
  );
};

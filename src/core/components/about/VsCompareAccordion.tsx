import { useState, useCallback } from 'react';
import { VS_COMPARE_DATA, type VsCompareItem } from '../../constants/vsCompareData';

interface AccordionItemProps {
  item: VsCompareItem;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}

function AccordionItem({ item, isOpen, onToggle, index }: AccordionItemProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onToggle();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onToggle();
      }
    },
    [isOpen, onToggle],
  );

  return (
    <div
      className="border-b border-sf-border last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <button
        id={`vs-btn-${item.id}`}
        aria-expanded={isOpen}
        aria-controls={`vs-panel-${item.id}`}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-150 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sf-accent"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 font-mono text-[10px] text-sf-fg4 tabular-nums"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <span className="font-semibold text-white/90 text-sm">
              vs {item.target}
            </span>
            <span className="ml-2 text-sf-fg4 text-sm hidden sm:inline">
              — {item.oneLiner}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 ml-4 text-sf-accent transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          +
        </span>
      </button>

      <div
        id={`vs-panel-${item.id}`}
        role="region"
        aria-labelledby={`vs-btn-${item.id}`}
        hidden={!isOpen}
        className="overflow-hidden"
      >
        <div className="px-5 pb-5 pt-0">
          <p className="font-mono text-xs text-sf-accent mb-2">{item.oneLiner}</p>
          <p className="text-sm leading-relaxed text-sf-fg2">{item.detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function VsCompareAccordion() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div
      className="rounded-sf border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}
    >
      {VS_COMPARE_DATA.map((item, index) => (
        <AccordionItem
          key={item.id}
          item={item}
          isOpen={openId === item.id}
          onToggle={() => toggle(item.id)}
          index={index}
        />
      ))}
    </div>
  );
}

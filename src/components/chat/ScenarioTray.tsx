import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatOptional, ScenarioAssumption } from '../../context/ChatContext';
import { ScenarioChange } from '../../core/ai/world';
import { describeChange } from '../../core/ai/toolkit';
import { usePlannerStore } from '../../store/usePlannerStore';

export interface ScenarioTrayProps {
  assumptions?: (ScenarioAssumption | ScenarioChange)[];
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

interface NormalizedAssumption {
  id: string;
  label: string;
  enabled: boolean;
}

export const ScenarioTray: React.FC<ScenarioTrayProps> = ({
  assumptions: propAssumptions,
  onToggle: propOnToggle,
  onRemove: propOnRemove,
  className,
}) => {
  const chat = useChatOptional();
  const { accounts, events } = usePlannerStore();

  const rawAssumptions = propAssumptions ?? chat?.scenarioAssumptions ?? [];
  const handleToggle = propOnToggle ?? chat?.toggleAssumption;
  const handleRemove = propOnRemove ?? chat?.removeAssumption;

  if (!rawAssumptions || rawAssumptions.length === 0) {
    return null;
  }

  const items: NormalizedAssumption[] = rawAssumptions.map((item, idx) => {
    const rawId = (item as any).id;
    const id = typeof rawId === 'string' && rawId ? rawId : `change-${idx}`;

    let label: string = (item as any).label || (item as any).note || '';
    if (!label) {
      if ((item as any).type) {
        label = describeChange(item as ScenarioChange, accounts, events);
      } else {
        label = `Assumption ${idx + 1}`;
      }
    }

    const enabled = (item as any).enabled !== false;
    return { id, label, enabled };
  });

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 py-1.5 px-3 bg-muted/40 border-b border-border/50 text-xs shrink-0',
        className
      )}
      data-testid="scenario-tray"
    >
      <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mr-1 select-none">
        <Sparkles className="w-3 h-3 text-primary" />
        <span>Scenario Tray:</span>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs transition-colors',
            item.enabled
              ? 'bg-secondary text-secondary-foreground border-secondary shadow-2xs'
              : 'bg-muted/40 text-muted-foreground border-border/40 line-through opacity-70'
          )}
          data-testid={`scenario-chip-${item.id}`}
        >
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={() => handleToggle?.(item.id)}
            data-testid={`scenario-toggle-${item.id}`}
            aria-label={`Toggle ${item.label}`}
            className="rounded border-border text-primary focus:ring-primary w-3 h-3 cursor-pointer"
          />
          <span
            className="font-medium select-none truncate max-w-[220px]"
            title={item.label}
          >
            {item.label}
          </span>
          <button
            type="button"
            onClick={() => handleRemove?.(item.id)}
            data-testid={`scenario-remove-${item.id}`}
            aria-label={`Remove ${item.label}`}
            className="p-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};

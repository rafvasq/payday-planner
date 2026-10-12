import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlannerStore } from '@/store/usePlannerStore';
import { snapshotId, PlannerWorld } from '@/core/ai/world';
import { format } from 'date-fns';

export interface StalenessPillProps {
  messageSnapshotId?: string;
  message?: {
    snapshotId?: string;
    snapshot_id?: string;
    content?: string;
    [key: string]: any;
  };
  currentSnapshotId?: string;
  onRefresh?: () => void;
  className?: string;
}

/**
 * Computes current snapshot ID from store if not explicitly passed.
 */
export function getPlannerSnapshotId(): string {
  try {
    const storeState =
      typeof (usePlannerStore as any).getState === 'function'
        ? (usePlannerStore as any).getState()
        : {};
    const currentAccounts = storeState.accounts || [];
    const currentEvents = storeState.events || [];
    const currentExecuted = storeState.executedEvents || {};
    const currentReflectToday = !!storeState.startingBalancesReflectToday;
    const world: PlannerWorld = {
      accounts: currentAccounts,
      events: currentEvents,
      executedEvents: currentExecuted,
      balancesReflectToday: currentReflectToday,
      today: format(new Date(), 'yyyy-MM-dd'),
    };
    return snapshotId(world, []);
  } catch {
    return '';
  }
}

export const StalenessPill: React.FC<StalenessPillProps> = ({
  messageSnapshotId,
  message,
  currentSnapshotId,
  onRefresh,
  className,
}) => {
  const msgSnapId = messageSnapshotId ?? message?.snapshotId ?? message?.snapshot_id;
  const activeSnapId = currentSnapshotId ?? getPlannerSnapshotId();

  // If no snapshot ID on message or snapshots match, it is not stale
  if (!msgSnapId || !activeSnapId || msgSnapId === activeSnapId) {
    return null;
  }

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRefresh?.();
  };

  return (
    <div
      data-testid="staleness-pill"
      onClick={handleRefreshClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRefresh?.();
        }
      }}
      title="Plan changed since this answer · Click to refresh"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border shadow-xs transition-colors cursor-pointer select-none',
        'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25 hover:bg-amber-500/15',
        className
      )}
    >
      <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <span>Plan changed since this answer · </span>
      <button
        type="button"
        onClick={handleRefreshClick}
        className="font-semibold underline hover:text-amber-950 dark:hover:text-amber-100 transition-colors cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
};

import React from 'react';
import { cn } from '@/lib/utils';
import { FigureClassification } from '@/core/ai/provenance';

export interface GroundingBadgeProps {
  totalFigures?: number;
  unverifiedCount?: number;
  summary?: {
    totalFigures: number;
    unverifiedCount: number;
  };
  figures?: FigureClassification[];
  className?: string;
}

export const GroundingBadge: React.FC<GroundingBadgeProps> = ({
  totalFigures: totalFiguresProp,
  unverifiedCount: unverifiedCountProp,
  summary,
  figures: _figures,
  className,
}) => {
  const total = summary?.totalFigures ?? totalFiguresProp ?? 0;
  const unverified = summary?.unverifiedCount ?? unverifiedCountProp ?? 0;

  if (total === 0) {
    return null;
  }

  if (unverified === 0) {
    return (
      <div
        data-testid="grounding-badge-verified"
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border select-none',
          'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60',
          className
        )}
      >
        <span className="font-bold text-teal-600 dark:text-teal-400" aria-hidden="true">
          ✓
        </span>
        <span>
          {total} {total === 1 ? 'figure' : 'figures'} · all engine-verified
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="grounding-badge-unverified"
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border select-none',
        'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
        className
      )}
    >
      <span className="font-bold text-amber-600 dark:text-amber-400" aria-hidden="true">
        ⚠
      </span>
      <span>
        {unverified} unverified {unverified === 1 ? 'figure' : 'figures'}
      </span>
    </div>
  );
};

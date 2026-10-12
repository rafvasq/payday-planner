import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FigureClass, FigureClassification } from '@/core/ai/provenance';

export interface FigureChipProps {
  rawText?: string;
  figure?: string;
  cents?: number;
  classification?: FigureClass;
  sourceLabel?: string;
  formula?: string;
  classificationData?: FigureClassification;
  className?: string;
}

export const FigureChip: React.FC<FigureChipProps> = ({
  rawText: rawTextProp,
  figure,
  cents: _cents,
  classification: classificationProp,
  sourceLabel: sourceLabelProp,
  formula: formulaProp,
  classificationData,
  className,
}) => {
  const [open, setOpen] = useState(false);

  const rawText = classificationData?.rawText ?? rawTextProp ?? figure ?? '';
  const classification = classificationData?.classification ?? classificationProp ?? 'unverified';
  const sourceLabel = classificationData?.sourceLabel ?? sourceLabelProp;
  const formula = classificationData?.formula ?? formulaProp;

  let styleClasses = '';
  let popoverContent: React.ReactNode = null;
  let cue: React.ReactNode = null;

  switch (classification) {
    case 'engine':
      styleClasses =
        'text-teal-700 dark:text-teal-300 font-mono border-b border-dotted border-teal-500 cursor-pointer';
      popoverContent = (
        <div className="space-y-1">
          <div className="font-semibold text-teal-700 dark:text-teal-300">Engine figure:</div>
          <div className="text-muted-foreground">{sourceLabel || 'Verified from plan projection'}</div>
        </div>
      );
      break;

    case 'derived':
      styleClasses =
        'text-teal-700 dark:text-teal-300 font-mono border-b border-dotted border-teal-500 cursor-pointer inline-flex items-center gap-0.5';
      cue = (
        <span className="text-xs font-bold leading-none select-none text-teal-600 dark:text-teal-400" aria-hidden="true">
          ✓
        </span>
      );
      popoverContent = (
        <div className="space-y-1">
          <div className="font-semibold text-teal-700 dark:text-teal-300">Derived:</div>
          <div className="font-mono text-muted-foreground">{formula || rawText}</div>
        </div>
      );
      break;

    case 'user_stated':
      styleClasses =
        'text-foreground/90 font-mono border-b border-muted-foreground/40 cursor-pointer';
      popoverContent = (
        <div>
          <div className="text-muted-foreground">{sourceLabel || 'Stated in conversation'}</div>
        </div>
      );
      break;

    case 'unverified':
    default:
      styleClasses =
        'text-amber-700 dark:text-amber-400 font-mono border-b border-dashed border-amber-500 cursor-pointer inline-flex items-center gap-0.5';
      cue = (
        <span className="text-xs font-bold leading-none select-none text-amber-600 dark:text-amber-400" aria-hidden="true">
          ⚠
        </span>
      );
      popoverContent = (
        <div className="space-y-1 text-amber-700 dark:text-amber-400">
          <div>⚠️ Not produced by engine — treat with caution</div>
        </div>
      );
      break;
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(styleClasses, className)}
          aria-label={`${rawText} (${classification})`}
        >
          {cue ? (
            <>
              <span className={styleClasses} tabIndex={0} onKeyDown={handleKeyDown}>
                {rawText}
              </span>
              {cue}
            </>
          ) : (
            rawText
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto max-w-xs text-xs p-2.5 shadow-md z-50 pointer-events-none"
      >
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
};

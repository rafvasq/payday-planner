import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ResizeDirection } from '@/hooks/useFloatingDimensions';

export interface ResizeHandleProps {
  direction: ResizeDirection;
  onStartResize: (direction: ResizeDirection, clientX: number, clientY: number) => void;
  className?: string;
}

const directionStyles: Record<ResizeDirection, string> = {
  left: 'absolute top-0 left-0 w-2 h-full cursor-ew-resize hover:bg-primary/20 transition-colors z-30',
  top: 'absolute top-0 left-0 h-2 w-full cursor-ns-resize hover:bg-primary/20 transition-colors z-30',
  'top-left':
    'absolute top-0 left-0 w-4 h-4 cursor-nwse-resize hover:bg-primary/30 rounded-tl-2xl transition-colors z-40',
};

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onStartResize,
  className,
}) => {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onStartResize(direction, e.clientX, e.clientY);
    },
    [direction, onStartResize]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={direction === 'left' ? 'vertical' : 'horizontal'}
      aria-label={`Resize chat window from ${direction}`}
      data-testid={`resize-handle-${direction}`}
      className={cn(directionStyles[direction], className)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
};

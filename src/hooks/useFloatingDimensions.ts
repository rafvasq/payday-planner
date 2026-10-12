import { useState, useEffect, useCallback, useRef } from 'react';

export type ResizeDirection = 'left' | 'top' | 'top-left';

export interface FloatingBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface FloatingDimensionsState {
  width: number;
  height: number;
  isMaximized: boolean;
  isMobile: boolean;
  isDraggingOrResizing: boolean;
  setWidth: (width: number) => void;
  setHeight: (height: number) => void;
  toggleMaximize: () => void;
  startResize: (direction: ResizeDirection, clientX: number, clientY: number) => void;
  resetToDefaults: () => void;
}

export const FLOATING_STORAGE_KEY = 'payday_chat_floating_dimensions';
const MOBILE_BREAKPOINT = 640; // Tailwind 'sm'
const MAX_WIDTH = 840;
const MAX_HEIGHT = 800;
const RESIZE_DEBOUNCE_MS = 60;

/** Compute viewport-aware bounds for the floating window. */
export function computeBounds(winW: number, winH: number): FloatingBounds {
  const minWidth = Math.min(360, Math.max(0, winW - 16));
  const maxWidth = Math.max(minWidth, Math.min(MAX_WIDTH, winW - 32));
  const minHeight = Math.min(420, Math.max(0, winH - 48));
  const maxHeight = Math.max(minHeight, Math.min(MAX_HEIGHT, winH - 32));
  return { minWidth, maxWidth, minHeight, maxHeight };
}

/** Clamp a width/height pair into the viewport-aware bounds. */
export function clampDimensions(
  w: number,
  h: number,
  winW: number,
  winH: number
): { width: number; height: number } {
  const b = computeBounds(winW, winH);
  return {
    width: Math.min(Math.max(b.minWidth, Math.round(w)), b.maxWidth),
    height: Math.min(Math.max(b.minHeight, Math.round(h)), b.maxHeight),
  };
}

const viewport = () => ({
  w: typeof window !== 'undefined' ? window.innerWidth : 1024,
  h: typeof window !== 'undefined' ? window.innerHeight : 768,
});

export function useFloatingDimensions(
  defaultWidth = 480,
  defaultHeight = 640
): FloatingDimensionsState {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => {
    const { w, h } = viewport();
    try {
      const saved = localStorage.getItem(FLOATING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          return clampDimensions(parsed.width, parsed.height, w, h);
        }
      }
    } catch {
      // ignore storage errors
    }
    return clampDimensions(defaultWidth, defaultHeight, w, h);
  });

  const [isMaximized, setIsMaximized] = useState(false);
  const [isMobile, setIsMobile] = useState(() => viewport().w < MOBILE_BREAKPOINT);
  const [isDraggingOrResizing, setIsDraggingOrResizing] = useState(false);

  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  const resizeRef = useRef<{
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const persist = useCallback((d: { width: number; height: number }) => {
    try {
      localStorage.setItem(FLOATING_STORAGE_KEY, JSON.stringify(d));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Debounced window-resize re-clamping
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const { w, h } = viewport();
        setIsMobile(w < MOBILE_BREAKPOINT);
        setDimensions((prev) => {
          const c = clampDimensions(prev.width, prev.height, w, h);
          return c.width === prev.width && c.height === prev.height ? prev : c;
        });
      }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const updateAndPersist = useCallback(
    (w: number, h: number) => {
      const { w: vw, h: vh } = viewport();
      const c = clampDimensions(w, h, vw, vh);
      setDimensions(c);
      persist(c);
    },
    [persist]
  );

  const startResize = useCallback(
    (direction: ResizeDirection, clientX: number, clientY: number) => {
      resizeRef.current = {
        direction,
        startX: clientX,
        startY: clientY,
        startW: dimensionsRef.current.width,
        startH: dimensionsRef.current.height,
      };
      setIsDraggingOrResizing(true);
    },
    []
  );

  useEffect(() => {
    if (!isDraggingOrResizing) return;

    const onMove = (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      let newW = r.startW;
      let newH = r.startH;
      // Window is anchored bottom-right: dragging left/up grows it.
      if (r.direction === 'left' || r.direction === 'top-left') newW = r.startW + (r.startX - e.clientX);
      if (r.direction === 'top' || r.direction === 'top-left') newH = r.startH + (r.startY - e.clientY);
      const { w, h } = viewport();
      setDimensions(clampDimensions(newW, newH, w, h));
    };

    const onUp = () => {
      if (resizeRef.current) {
        persist(dimensionsRef.current);
        resizeRef.current = null;
      }
      setIsDraggingOrResizing(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDraggingOrResizing, persist]);

  const toggleMaximize = useCallback(() => setIsMaximized((p) => !p), []);

  const resetToDefaults = useCallback(() => {
    updateAndPersist(defaultWidth, defaultHeight);
    setIsMaximized(false);
  }, [defaultWidth, defaultHeight, updateAndPersist]);

  return {
    width: dimensions.width,
    height: dimensions.height,
    isMaximized,
    isMobile,
    isDraggingOrResizing,
    setWidth: (w: number) => updateAndPersist(w, dimensionsRef.current.height),
    setHeight: (h: number) => updateAndPersist(dimensionsRef.current.width, h),
    toggleMaximize,
    startResize,
    resetToDefaults,
  };
}

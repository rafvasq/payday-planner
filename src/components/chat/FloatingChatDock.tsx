import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useChatOptional } from '@/context/ChatContext';
import { useFloatingDimensions } from '@/hooks/useFloatingDimensions';
import { ResizeHandle } from '@/components/chat/ResizeHandle';
import { ChatPanel } from '@/components/ChatPanel';

export interface FloatingChatDockProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isStreaming?: boolean;
  stopStreaming?: () => void;
}

/**
 * Non-modal floating chat window. Rendered through a portal into document.body inside a
 * `pointer-events-none` viewport ring so every click outside the window reaches the page.
 * No backdrop, scroll lock, focus trap, or outside-click dismissal.
 */
export const FloatingChatDock: React.FC<FloatingChatDockProps> = ({
  isOpen,
  onOpenChange,
  isStreaming = false,
  stopStreaming,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const chatContext = useChatOptional();
  const fallbackDims = useFloatingDimensions();
  const floatingDims = chatContext?.floatingDims ?? fallbackDims;
  const { width, height, isMaximized, isMobile, isDraggingOrResizing, startResize, toggleMaximize } = floatingDims;

  // Remember the page element focused before opening so we can restore it on close.
  useEffect(() => {
    if (isOpen) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        lastFocusRef.current = active;
      }
      return () => {
        const el = lastFocusRef.current;
        lastFocusRef.current = null;
        if (el && document.contains(el)) el.focus?.();
      };
    }
  }, [isOpen]);

  // Escape arbitration: only act when focus is inside the chat window.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const win = windowRef.current;
      if (!win || !win.contains(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isStreaming) {
        stopStreaming?.();
      } else {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isStreaming, stopStreaming, onOpenChange]);

  const windowStyle: React.CSSProperties = isMobile
    ? { width: 'calc(100vw - 1rem)', height: 'calc(100dvh - 5rem)', bottom: '1rem', right: '0.5rem' }
    : isMaximized
      ? { width: `${width}px`, height: '100dvh', bottom: 0, right: 0, borderRight: 0, borderTop: 0, borderBottom: 0 }
      : { width: `${width}px`, height: `${height}px`, bottom: '1.5rem', right: '1.5rem' };

  const portal =
    isOpen && typeof document !== 'undefined'
      ? ReactDOM.createPortal(
          <div
            data-testid="floating-chat-ring"
            className="fixed inset-0 z-40 pointer-events-none overflow-hidden"
          >
            <div
              ref={windowRef}
              role="dialog"
              aria-modal="false"
              aria-label="AI Financial Assistant"
              data-testid="floating-chat-window"
              style={windowStyle}
              className={cn(
                'absolute flex flex-col pointer-events-auto border border-border bg-background overflow-hidden',
                !isMaximized ? 'rounded-2xl shadow-2xl' : 'shadow-none border-y-0 border-r-0',
                isDraggingOrResizing && 'select-none'
              )}
            >
              {!isMobile && !isMaximized && (
                <>
                  <ResizeHandle direction="left" onStartResize={startResize} />
                  <ResizeHandle direction="top" onStartResize={startResize} />
                  <ResizeHandle direction="top-left" onStartResize={startResize} />
                </>
              )}
              {!isMobile && isMaximized && (
                <ResizeHandle direction="left" onStartResize={startResize} />
              )}
              <h2 className="sr-only">AI Financial Assistant</h2>
              <ChatPanel
                mode="floating"
                onClose={() => onOpenChange(false)}
                onMinimize={() => onOpenChange(false)}
                isMaximized={isMaximized}
                onToggleMaximize={isMobile ? undefined : toggleMaximize}
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => onOpenChange(true)}
          size="icon"
          aria-label="Open AI Financial Chat"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Bot className="h-6 w-6" />
          {isStreaming && (
            <span className="absolute top-1 right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          )}
        </Button>
      )}
      {portal}
    </>
  );
};

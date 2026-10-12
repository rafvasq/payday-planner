import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useChat } from '@/context/ChatContext';
import { FloatingChatDock } from '@/components/chat/FloatingChatDock';

export const ChatFAB: React.FC = () => {
  const location = useLocation();
  const { isOpen, setIsOpen, toggleOpen, isStreaming, handleStop } = useChat();

  // Global ⌘J / Ctrl+J shortcut toggles the copilot.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleOpen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleOpen]);

  if (location.pathname.startsWith('/intelligence/chat')) {
    return null;
  }

  return (
    <FloatingChatDock
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      isStreaming={isStreaming}
      stopStreaming={handleStop}
    />
  );
};

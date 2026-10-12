import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Search, Zap } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { findNavItem, findNavSection } from '@/app/navigation';
import { useCommandPalette } from '@/app/command-palette';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useChatOptional } from '@/context/ChatContext';

export function HeaderBar() {
  const location = useLocation();
  const { setOpen: openCommandPalette } = useCommandPalette();
  const { setQuickCheckInOpen } = usePlannerStore();
  const chat = useChatOptional();
  const onChatRoute = location.pathname.startsWith('/intelligence/chat');

  const currentItem = findNavItem(location.pathname);
  const currentSection = findNavSection(location.pathname);

  return (
    <header className="flex h-12 items-center gap-2 bg-background/95 backdrop-blur-sm border-b border-border/70 px-4 sticky top-0 z-30">
      {/* Sidebar toggle (mobile + collapsed) */}
      <SidebarTrigger className="-ml-1 h-7 w-7 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs">
        {currentSection && (
          <>
            <span className="text-muted-foreground font-medium">
              {currentSection.label}
            </span>
            <span className="text-muted-foreground/40 font-mono text-[10px]">/</span>
          </>
        )}
        <span className="font-semibold text-foreground tracking-tight">{currentItem?.label ?? 'Payday'}</span>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search / Command trigger (Baseten & Kong style) */}
      <button
        type="button"
        onClick={() => openCommandPalette(true)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground bg-muted/30 hover:bg-muted/60 border border-border/60 hover:border-border rounded-md transition-all mr-2"
      >
        <Search className="h-3.5 w-3.5 opacity-70" />
        <span className="font-sans text-[11px] text-muted-foreground/90">Search or jump to...</span>
        <kbd className="ml-1.5">⌘K</kbd>
      </button>

      {/* Quick Check-In */}
      <Button
        variant="default"
        size="sm"
        className="h-7 px-2.5 text-xs font-semibold gap-1.5 shadow-none"
        onClick={() => setQuickCheckInOpen(true)}
      >
        <Zap className="h-3.5 w-3.5 text-signal" />
        <span className="hidden sm:inline">Quick Check-in</span>
      </Button>
    </header>
  );
}

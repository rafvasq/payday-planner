import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Zap } from 'lucide-react';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { findNavItem, findNavSection } from '@/app/navigation';
import { useCommandPalette } from '@/app/command-palette';
import { usePlannerStore } from '@/store/usePlannerStore';

export function HeaderBar() {
  const location = useLocation();
  const { setOpen: openCommandPalette } = useCommandPalette();
  const { setQuickCheckInOpen } = usePlannerStore();

  const currentItem = findNavItem(location.pathname);
  const currentSection = findNavSection(location.pathname);

  return (
    <header className="flex h-14 items-center gap-2 bg-background px-4">
      {/* Sidebar toggle (mobile + collapsed) */}
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {currentSection && (
          <>
            <span className="text-muted-foreground">
              {currentSection.label}
            </span>
            <span className="text-muted-foreground">/</span>
          </>
        )}
        <span className="font-medium">{currentItem?.label ?? 'Payday'}</span>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search trigger */}
      <Button
        variant="outline"
        size="sm"
        className="hidden md:flex items-center gap-2 text-muted-foreground"
        onClick={() => openCommandPalette(true)}
      >
        <Search className="h-4 w-4" />
        <span className="text-xs">Quick search...</span>
        <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Mobile search (icon only) */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => openCommandPalette(true)}
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* Quick Check-In */}
      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        onClick={() => setQuickCheckInOpen(true)}
      >
        <Zap className="h-4 w-4" />
        <span className="hidden sm:inline">Quick Check-in</span>
      </Button>
    </header>
  );
}

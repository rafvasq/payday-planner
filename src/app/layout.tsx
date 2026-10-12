import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/nav/app-sidebar';
import { HeaderBar } from '@/components/shared/header-bar';
import { CommandPaletteProvider } from '@/app/command-palette';
import { QuickCheckInModal } from '@/components/QuickCheckInModal';
import { ChatProvider } from '@/context/ChatContext';
import { ChatFAB } from '@/components/ChatFAB';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import { useChat } from '@/context/ChatContext';

export function AppLayoutContent() {
  const { pathname } = useLocation();
  const { isOpen, floatingDims } = useChat();
  const isDocked = isOpen && floatingDims.isMaximized && !floatingDims.isMobile;

  return (
    <>
      <CommandPaletteProvider>
        <AppSidebar />
        <SidebarInset style={{ marginRight: isDocked ? floatingDims.width : 0 }}>
          <HeaderBar />
          <main
              className="flex-1 min-h-0 p-4 sm:p-6 lg:p-8 overflow-auto bg-background"
            >
              <div
                className="mx-auto w-full max-w-7xl space-y-6"
              >
                <Outlet />
              </div>
            </main>

          </SidebarInset>

          {/* Global overlays & notifications */}
          <QuickCheckInModal />
          <ChatFAB />
          <Toaster position="bottom-right" richColors />
      </CommandPaletteProvider>
    </>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <ChatProvider>
        <AppLayoutContent />
      </ChatProvider>
    </SidebarProvider>
  );
}

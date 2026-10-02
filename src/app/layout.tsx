import React from 'react';
import { Outlet } from 'react-router-dom';

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/nav/app-sidebar';
import { HeaderBar } from '@/components/shared/header-bar';
import { CommandPaletteProvider } from '@/app/command-palette';
import { QuickCheckInModal } from '@/components/QuickCheckInModal';

export function AppLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <CommandPaletteProvider>
        <AppSidebar />
        <SidebarInset>
          <HeaderBar />
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </SidebarInset>

        {/* Global overlays */}
        <QuickCheckInModal />
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Bot,
  Settings,
  Users,
  Zap,
  Clipboard,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { NAV_SECTIONS, type NavSection, type NavItem } from '@/app/navigation';
import { useSettingsStore } from '@/store/useSettingsStore';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

/* Section component */

function NavSectionGroup({ section }: { section: NavSection }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2">
        {section.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => (
            <NavItemButton key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/* Item button */

function NavItemButton({ item }: { item: NavItem }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.label}
        onClick={() => navigate(item.path)}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}


/* Main sidebar */

export function AppSidebar() {
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      {/* Header / Branding */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => navigate('/overview/dashboard')}
              className="hover:bg-sidebar-accent/50 transition-colors"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-foreground text-background font-bold text-sm shadow-sm ring-1 ring-border/50">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4.5 text-signal"
                >
                  <path d="M4 19V5a2 2 0 0 1 2-2h4a4 4 0 0 1 4 4v12" />
                  <path d="M14 11h6" />
                  <path d="M17 8l3 3-3 3" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold tracking-tight text-sm">Payday</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-signal/15 text-signal font-semibold">
                    PRO
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
                  Financial Console
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Navigation sections */}
      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
          <NavSectionGroup key={section.id} section={section} />
        ))}
      </SidebarContent>

      <SidebarSeparator />

      {/* Telemetry status & footer */}
      <SidebarFooter className="gap-1 p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="px-2.5 py-1.5 flex items-center justify-between min-w-0 text-[11px] text-muted-foreground bg-muted/30 rounded-md border border-border/40 mb-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-transparent transition-all select-none cursor-default">
              <div className="flex items-center gap-2 font-mono text-[10px] min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold text-foreground/80 truncate group-data-[collapsible=icon]:hidden">
                  Local Engine
                </span>
              </div>
              <span className="text-[9px] font-mono text-signal font-medium uppercase tracking-wider shrink-0 ml-1.5 group-data-[collapsible=icon]:hidden">
                Ready
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-mono text-xs">Local Engine: Ready (Browser WASM)</p>
          </TooltipContent>
        </Tooltip>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Configuration"
              onClick={() => navigate('/settings/providers')}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
              <span>Configuration</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

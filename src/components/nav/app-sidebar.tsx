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
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                dY',
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Payday</span>
                <span className="text-xs text-muted-foreground">
                  Financial Planner
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

      {/* Context switchers (footer) */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Configuration"
              onClick={() => navigate('/settings/providers')}
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

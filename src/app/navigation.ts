import {
  LayoutDashboard,
  GitFork,
  Building2,
  Calendar,
  CalendarDays,
  LineChart,
  BarChart3,
  ClipboardCopy,
  ArrowLeftRight,
  Archive,
  type LucideIcon,
} from 'lucide-react';

/* ── Route definition ───────────────────────────────────────── */

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/* ── Navigation hierarchy ───────────────────────────────────── */

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        path: '/overview/dashboard',
      },
      {
        id: 'flow-diagram',
        label: 'Flow Diagram',
        icon: GitFork,
        path: '/overview/flow-diagram',
      },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    items: [
      {
        id: 'accounts',
        label: 'Accounts',
        icon: Building2,
        path: '/planner/accounts',
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        path: '/planner/events',
      },
      {
        id: 'timeline',
        label: 'Timeline',
        icon: CalendarDays,
        path: '/planner/timeline',
      },
      {
        id: 'projections',
        label: 'Projections',
        icon: LineChart,
        path: '/planner/projections',
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      {
        id: 'analysis',
        label: 'Spending Analysis',
        icon: BarChart3,
        path: '/intelligence/analysis',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        id: 'import-export',
        label: 'Import / Export',
        icon: ArrowLeftRight,
        path: '/data/import-export',
      },
      {
        id: 'backup',
        label: 'Backup',
        icon: Archive,
        path: '/data/backup',
      },
      {
        id: 'prompt-export',
        label: 'Prompt Export',
        icon: ClipboardCopy,
        path: '/data/prompt-export',
      },
    ],
  },
];

/* ── Flat helpers ───────────────────────────────────────────── */

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const DEFAULT_PATH = '/overview/dashboard';

export function findNavItem(path: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.path === path);
}

export function findNavSection(path: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.path === path));
}

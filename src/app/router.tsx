import React from 'react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';

import { AppLayout } from '@/app/layout';

/* ── Existing components (Phase 2 — direct reuse for now) ──── */
import { Dashboard } from '@/components/Dashboard';
import { AccountsManager } from '@/components/AccountsManager';
import { EventsManager } from '@/components/EventsManager';
import { TimelineChecklist } from '@/components/TimelineChecklist';
import { FlowDiagram } from '@/components/FlowDiagram';
import { AnalysisTab } from '@/components/AnalysisTab';
import { ExportImport } from '@/components/ExportImport';

/* ── Placeholder pages for new views ───────────────────────── */

function ProjectionsPage() {
  // For now, reuse the ProjectionChart from Dashboard context
  // Will be replaced with a dedicated full-width view
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Projections</h1>
      <p className="text-muted-foreground">
        Dedicated projection view coming soon. Use the Dashboard for now.
      </p>
    </div>
  );
}

import { ProviderSettings } from '@/components/ProviderSettings';
import { ChatPanel } from '@/components/ChatPanel';

function PromptExportPage() {
  // Reuses ExportImport for now — the clipboard prompt workflow lives here
  return <ExportImport />;
}

function BackupPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Backup</h1>
      <p className="text-muted-foreground">
        Snapshot management coming soon.
      </p>
    </div>
  );
}

function ProvidersPage() {
  return <ProviderSettings />;
}

function PreferencesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground">
        Preferences coming soon.
      </p>
    </div>
  );
}

/* ── Router ─────────────────────────────────────────────────── */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      /* Redirect root to dashboard */
      { index: true, element: <Navigate to="/overview/dashboard" replace /> },

      /* Overview */
      { path: 'overview/dashboard', element: <Dashboard /> },
      { path: 'overview/flow-diagram', element: <FlowDiagram /> },

      /* Planner */
      { path: 'planner/accounts', element: <AccountsManager /> },
      { path: 'planner/events', element: <EventsManager /> },
      { path: 'planner/timeline', element: <TimelineChecklist /> },
      { path: 'planner/projections', element: <ProjectionsPage /> },

      /* Intelligence */
      { path: 'intelligence/analysis', element: <AnalysisTab /> },

      /* Data */
      { path: 'data/import-export', element: <ExportImport /> },
      { path: 'data/backup', element: <BackupPage /> },
      { path: 'data/prompt-export', element: <PromptExportPage /> },

      /* Settings */
      { path: 'settings/providers', element: <ProvidersPage /> },
      { path: 'settings/preferences', element: <PreferencesPage /> },

      /* Catch-all → dashboard */
      { path: '*', element: <Navigate to="/overview/dashboard" replace /> },
    ],
  },
]);

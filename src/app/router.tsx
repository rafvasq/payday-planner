import { lazy } from 'react';
import {
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';

import { AppLayout } from '@/app/layout';

/* ── Lazy-loaded components (Route-level code splitting) ───── */
const Dashboard = lazy(() => import('@/components/Dashboard').then(m => ({ default: m.Dashboard })));
const AccountsManager = lazy(() => import('@/components/AccountsManager').then(m => ({ default: m.AccountsManager })));
const EventsManager = lazy(() => import('@/components/EventsManager').then(m => ({ default: m.EventsManager })));
const TimelineChecklist = lazy(() => import('@/components/TimelineChecklist').then(m => ({ default: m.TimelineChecklist })));
const FlowDiagram = lazy(() => import('@/components/FlowDiagram').then(m => ({ default: m.FlowDiagram })));
const AnalysisTab = lazy(() => import('@/components/AnalysisTab').then(m => ({ default: m.AnalysisTab })));
const ExportImport = lazy(() => import('@/components/ExportImport').then(m => ({ default: m.ExportImport })));
const ProviderSettings = lazy(() => import('@/components/ProviderSettings').then(m => ({ default: m.ProviderSettings })));

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

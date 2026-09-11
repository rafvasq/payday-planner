import React from 'react';
import { usePlannerStore } from './store/usePlannerStore';
import { Header } from './components/Header';
import { QuickCheckInModal } from './components/QuickCheckInModal';
import { Dashboard } from './components/Dashboard';
import { AccountsManager } from './components/AccountsManager';
import { EventsManager } from './components/EventsManager';
import { TimelineChecklist } from './components/TimelineChecklist';
import { FlowDiagram } from './components/FlowDiagram';
import { ExportImport } from './components/ExportImport';
import {
  LayoutDashboard,
  Building2,
  Calendar,
  CalendarDays,
  GitFork,
  Download,
} from 'lucide-react';

const TABS = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Accounts', label: 'Accounts', icon: Building2 },
  { id: 'Events', label: 'Events', icon: Calendar },
  { id: 'Timeline', label: 'Timeline', icon: CalendarDays },
  { id: 'Flow Diagram', label: 'Flow Diagram', icon: GitFork },
  { id: 'Export', label: 'Export & Import', icon: Download },
];

export const App: React.FC = () => {
  const { activeTab, setActiveTab, accounts, events } = usePlannerStore();

  const liquid = accounts
    .filter((a) => ['chequing', 'savings', 'investment'].includes(a.type))
    .reduce((sum, a) => sum + a.balance, 0);

  const reEquity = accounts
    .filter((a) => a.type === 'liability' && (a.market_value || 0) > 0)
    .reduce((sum, a) => sum + ((a.market_value || 0) - a.balance), 0);

  const nakedLiab = accounts
    .filter((a) => a.type === 'liability' && (a.market_value || 0) === 0)
    .reduce((sum, a) => sum + a.balance, 0);

  const debt = accounts
    .filter((a) => a.type === 'debt')
    .reduce((sum, a) => sum + a.balance, 0);

  const netWorth = liquid + reEquity - nakedLiab - debt;
  const activeEventsCount = events.filter((e) => e.active).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <Header />

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-[#F5F7FB] border-r border-ink-200 p-4 shrink-0 flex flex-col justify-between space-y-6">
          <nav className="space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-xs font-bold'
                      : 'text-ink-700 hover:bg-ink-200/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sidebar Financial Summary */}
          <div className="bg-white border border-ink-200 rounded-xl p-3.5 shadow-2xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Net Worth
            </span>
            <div className="text-xl font-extrabold text-ink-900">
              ${netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-ink-400 font-medium">
              {accounts.length} accounts · {activeEventsCount} active events
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
          {activeTab === 'Dashboard' && <Dashboard />}
          {activeTab === 'Accounts' && <AccountsManager />}
          {activeTab === 'Events' && <EventsManager />}
          {activeTab === 'Timeline' && <TimelineChecklist />}
          {activeTab === 'Flow Diagram' && <FlowDiagram />}
          {activeTab === 'Export' && <ExportImport />}
        </main>
      </div>

      <QuickCheckInModal />
    </div>
  );
};

export default App;

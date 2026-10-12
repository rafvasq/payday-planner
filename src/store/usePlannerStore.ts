import { create } from 'zustand';
import {
  Member,
  Account,
  Event,
} from '../core/models';
import {
  defaultMembers,
  defaultAccounts,
  defaultEvents,
  blueprintToJson,
  jsonToBlueprint,
} from '../core/serialization';
import { format, startOfMonth } from 'date-fns';

const STORAGE_KEY = 'payday_blueprint';
const EXECUTION_STORAGE_KEY = 'payday_executed_checklist';

export interface BlueprintSnapshot {
  accounts: Account[];
  events: Event[];
  executedEvents: Record<string, boolean>;
  timestamp: number;
  description?: string;
}

interface PlannerState {
  members: Member[];
  accounts: Account[];
  events: Event[];
  executedEvents: Record<string, boolean>; // key: `${date}_${eventId}`
  quickCheckInOpen: boolean;
  startingBalancesReflectToday: boolean;
  recentSpendingSummary: string | null;
  parsedTransactions: any[];
  analysisLogs: string[];
  uploadedFiles: Array<{ id: string, name: string, count: number, startDate?: Date, endDate?: Date }>;
  analysisStartDate: string;
  analysisEndDate: string;

  // Actions
  setQuickCheckInOpen: (open: boolean) => void;
  setStartingBalancesReflectToday: (reflectToday: boolean) => void;
  setRecentSpendingSummary: (summary: string | null) => void;
  setParsedTransactions: (txs: any[]) => void;
  setAnalysisLogs: (logs: string[]) => void;
  setAnalysisStartDate: (date: string) => void;
  setAnalysisEndDate: (date: string) => void;
  setUploadedFiles: (files: Array<{ id: string, name: string, count: number, startDate?: Date, endDate?: Date }>) => void;
  addUploadedFile: (file: { id: string, name: string, count: number, startDate?: Date, endDate?: Date }) => void;
  removeUploadedFile: (id: string) => void;
  
  // Member actions
  updateMemberName: (id: string, name: string) => void;

  // Account actions
  addAccount: (account: Account) => void;
  updateAccount: (id: string, account: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  quickUpdateBalances: (newBalances: Record<string, number>) => void;

  // Event actions
  addEvent: (event: Event) => void;
  updateEvent: (id: string, event: Partial<Event>) => void;
  deleteEvent: (id: string) => void;
  toggleExecutedEvent: (dateStr: string, eventId: string) => void;

  // Blueprint actions
  importBlueprintJson: (jsonStr: string) => void;
  getBlueprintJson: (options?: { minified?: boolean; compactIds?: boolean }) => string;
  applyBlueprintChanges: (newAccounts: Account[], newEvents: Event[], executedOverrides: Record<string, boolean>) => void;
  applyBlueprintChangesWithSnapshot: (
    newAccounts: Account[],
    newEvents: Event[],
    executedOverrides: Record<string, boolean>,
    description?: string
  ) => BlueprintSnapshot;
  restoreBlueprintSnapshot: (snapshot: BlueprintSnapshot) => void;
  resetToDefaults: () => void;
}

function loadInitialBlueprint(): { members: Member[]; accounts: Account[]; events: Event[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const bp = jsonToBlueprint(raw);
      if (bp.members.length > 0 || bp.accounts.length > 0 || bp.events.length > 0) {
        return bp;
      }
    }
  } catch (e) {
    console.error('Failed to load blueprint from localStorage:', e);
  }
  return {
    members: defaultMembers(),
    accounts: defaultAccounts(),
    events: defaultEvents(),
  };
}

function loadInitialExecuted(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveState(state: { members: Member[]; accounts: Account[]; events: Event[] }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      blueprintToJson(state, { minified: true, compactIds: false })
    );
  } catch (e) {
    console.error('Failed to save blueprint to localStorage:', e);
  }
}

function saveExecuted(executed: Record<string, boolean>) {
  try {
    localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(executed));
  } catch (e) {}
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const initial = loadInitialBlueprint();
  const initialExecuted = loadInitialExecuted();

  return {
    members: initial.members,
    accounts: initial.accounts,
    events: initial.events,
    executedEvents: initialExecuted,
    quickCheckInOpen: false,
    startingBalancesReflectToday: true,
    recentSpendingSummary: null,
    parsedTransactions: [],
    analysisLogs: [],
    uploadedFiles: [],
    analysisStartDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    analysisEndDate: format(new Date(), 'yyyy-MM-dd'),

    setQuickCheckInOpen: (open) => set({ quickCheckInOpen: open }),
    setStartingBalancesReflectToday: (reflectToday) =>
      set({ startingBalancesReflectToday: reflectToday }),
    setRecentSpendingSummary: (summary) => set({ recentSpendingSummary: summary }),
    setParsedTransactions: (txs) => set({ parsedTransactions: txs }),
    setAnalysisLogs: (logs) => set({ analysisLogs: logs }),
    setAnalysisStartDate: (date) => set({ analysisStartDate: date }),
    setAnalysisEndDate: (date) => set({ analysisEndDate: date }),
    setUploadedFiles: (files) => set({ uploadedFiles: files }),
    addUploadedFile: (file) => set((state) => ({ uploadedFiles: [...state.uploadedFiles, file] })),
    removeUploadedFile: (id) => set((state) => ({ 
      uploadedFiles: state.uploadedFiles.filter(f => f.id !== id),
      parsedTransactions: state.parsedTransactions.filter(tx => tx.fileId !== id)
    })),

    updateMemberName: (id, name) => {
      set((state) => {
        const nextMembers = state.members.map((m) =>
          m.id === id ? { ...m, name } : m
        );
        saveState({ ...state, members: nextMembers });
        return { members: nextMembers };
      });
    },

    addAccount: (account) => {
      set((state) => {
        const nextAccounts = [...state.accounts, account];
        saveState({ ...state, accounts: nextAccounts });
        return { accounts: nextAccounts };
      });
    },

    updateAccount: (id, updated) => {
      set((state) => {
        const nextAccounts = state.accounts.map((a) =>
          a.id === id ? { ...a, ...updated } : a
        );
        saveState({ ...state, accounts: nextAccounts });
        return { accounts: nextAccounts };
      });
    },

    deleteAccount: (id) => {
      set((state) => {
        const nextAccounts = state.accounts.filter((a) => a.id !== id);
        // Cascade null to referencing events
        const nextEvents = state.events.map((e) => ({
          ...e,
          from_account_id: e.from_account_id === id ? null : e.from_account_id,
          to_account_id: e.to_account_id === id ? null : e.to_account_id,
        }));
        saveState({ members: state.members, accounts: nextAccounts, events: nextEvents });
        return { accounts: nextAccounts, events: nextEvents };
      });
    },

    quickUpdateBalances: (newBalances) => {
      set((state) => {
        const nextAccounts = state.accounts.map((a) =>
          a.id in newBalances ? { ...a, balance: newBalances[a.id] } : a
        );
        saveState({ ...state, accounts: nextAccounts });
        return { accounts: nextAccounts };
      });
    },

    addEvent: (event) => {
      set((state) => {
        const nextEvents = [...state.events, event];
        saveState({ ...state, events: nextEvents });
        return { events: nextEvents };
      });
    },

    updateEvent: (id, updated) => {
      set((state) => {
        const nextEvents = state.events.map((e) =>
          e.id === id ? { ...e, ...updated } : e
        );
        saveState({ ...state, events: nextEvents });
        return { events: nextEvents };
      });
    },

    deleteEvent: (id) => {
      set((state) => {
        const nextEvents = state.events.filter((e) => e.id !== id);
        saveState({ ...state, events: nextEvents });
        return { events: nextEvents };
      });
    },

    toggleExecutedEvent: (dateStr, eventId) => {
      set((state) => {
        const key = `${dateStr}_${eventId}`;
        const nextExecuted = {
          ...state.executedEvents,
          [key]: !state.executedEvents[key],
        };
        saveExecuted(nextExecuted);
        return { executedEvents: nextExecuted };
      });
    },

    importBlueprintJson: (jsonStr) => {
      const parsed = jsonToBlueprint(jsonStr);
      saveState(parsed);
      set({
        members: parsed.members,
        accounts: parsed.accounts,
        events: parsed.events,
      });
    },

    applyBlueprintChanges: (newAccounts, newEvents, executedOverrides) => {
      set((state) => {
        saveState({ members: state.members, accounts: newAccounts, events: newEvents });
        const nextExecuted = { ...state.executedEvents, ...executedOverrides };
        saveExecuted(nextExecuted);
        return {
          accounts: newAccounts,
          events: newEvents,
          executedEvents: nextExecuted,
        };
      });
    },

    applyBlueprintChangesWithSnapshot: (newAccounts, newEvents, executedOverrides, description) => {
      const curr = get();
      const snapshot: BlueprintSnapshot = {
        accounts: JSON.parse(JSON.stringify(curr.accounts)),
        events: JSON.parse(JSON.stringify(curr.events)),
        executedEvents: { ...curr.executedEvents },
        timestamp: Date.now(),
        description,
      };
      saveState({ members: curr.members, accounts: newAccounts, events: newEvents });
      const nextExecuted = { ...curr.executedEvents, ...executedOverrides };
      saveExecuted(nextExecuted);
      set({
        accounts: newAccounts,
        events: newEvents,
        executedEvents: nextExecuted,
      });
      return snapshot;
    },

    restoreBlueprintSnapshot: (snapshot) => {
      const curr = get();
      saveState({ members: curr.members, accounts: snapshot.accounts, events: snapshot.events });
      saveExecuted(snapshot.executedEvents);
      set({
        accounts: snapshot.accounts,
        events: snapshot.events,
        executedEvents: snapshot.executedEvents,
      });
    },

    getBlueprintJson: (options) => {
      const { members, accounts, events } = get();
      return blueprintToJson({ members, accounts, events }, options);
    },

    resetToDefaults: () => {
      const defaults = {
        members: defaultMembers(),
        accounts: defaultAccounts(),
        events: defaultEvents(),
      };
      saveState(defaults);
      set(defaults);
    },
  };
});

import { create } from 'zustand';
import {
  Member,
  Account,
  Event,
  Blueprint,
} from '../core/models';
import {
  defaultMembers,
  defaultAccounts,
  defaultEvents,
  blueprintToJson,
  jsonToBlueprint,
} from '../core/serialization';

const STORAGE_KEY = 'payday_blueprint';
const EXECUTION_STORAGE_KEY = 'payday_executed_checklist';

interface PlannerState {
  members: Member[];
  accounts: Account[];
  events: Event[];
  executedEvents: Record<string, boolean>; // key: `${date}_${eventId}`
  activeTab: string;
  quickCheckInOpen: boolean;
  startingBalancesReflectToday: boolean;

  // Actions
  setActiveTab: (tab: string) => void;
  setQuickCheckInOpen: (open: boolean) => void;
  setStartingBalancesReflectToday: (reflectToday: boolean) => void;
  
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
    activeTab: 'Dashboard',
    quickCheckInOpen: false,
    startingBalancesReflectToday: true,

    setActiveTab: (tab) => set({ activeTab: tab }),
    setQuickCheckInOpen: (open) => set({ quickCheckInOpen: open }),
    setStartingBalancesReflectToday: (reflectToday) =>
      set({ startingBalancesReflectToday: reflectToday }),

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

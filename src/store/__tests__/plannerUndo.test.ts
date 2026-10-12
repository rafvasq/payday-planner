import { describe, it, expect, beforeEach } from 'vitest';
import { usePlannerStore } from '../usePlannerStore';
import { Account, Event } from '../../core/models';

describe('usePlannerStore — Snapshot & Undo System', () => {
  const initialAccount: Account = {
    id: 'acc-1',
    name: 'Main Chequing',
    type: 'chequing',
    owner: 'member-1',
    balance: 1500,
    target_floor: 500,
  };

  const initialEvent: Event = {
    id: 'evt-1',
    name: 'Rent',
    amount: 1000,
    event_type: 'outflow',
    anchor_date: '2026-10-01',
    frequency: 'monthly',
    from_account_id: 'acc-1',
    to_account_id: null,
    active: true,
    execution: 'auto',
    weekend_shift: 'none',
  };

  beforeEach(() => {
    localStorage.clear();
    const store = usePlannerStore.getState();
    store.resetToDefaults();
    usePlannerStore.setState({
      accounts: [initialAccount],
      events: [initialEvent],
      executedEvents: { '2026-10-01_evt-1': true },
    });
  });

  it('captures a deep snapshot before applying blueprint changes', () => {
    const store = usePlannerStore.getState();

    const modifiedAccounts: Account[] = [
      { ...initialAccount, balance: 2500 },
    ];
    const modifiedEvents: Event[] = [
      { ...initialEvent, amount: 1200 },
    ];
    const overrides = { '2026-10-02_evt-2': true };

    const snapshot = store.applyBlueprintChangesWithSnapshot(
      modifiedAccounts,
      modifiedEvents,
      overrides,
      'Test Modification'
    );

    // Verify returned snapshot contents match pre-modification state
    expect(snapshot.description).toBe('Test Modification');
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.accounts).toEqual([initialAccount]);
    expect(snapshot.events).toEqual([initialEvent]);
    expect(snapshot.executedEvents).toEqual({ '2026-10-01_evt-1': true });

    // Verify current state reflects applied changes
    const updatedState = usePlannerStore.getState();
    expect(updatedState.accounts[0].balance).toBe(2500);
    expect(updatedState.events[0].amount).toBe(1200);
    expect(updatedState.executedEvents['2026-10-02_evt-2']).toBe(true);
    expect(updatedState.executedEvents['2026-10-01_evt-1']).toBe(true);
  });

  it('restores state accurately from snapshot (undo operation)', () => {
    const store = usePlannerStore.getState();

    const newAccount: Account = {
      id: 'acc-2',
      name: 'Emergency Savings',
      type: 'savings',
      owner: 'member-1',
      balance: 5000,
      target_floor: 1000,
    };

    const snapshot = store.applyBlueprintChangesWithSnapshot(
      [initialAccount, newAccount],
      [],
      { '2026-10-05_evt-99': true },
      'Added Savings and removed Rent'
    );

    // Verify intermediate state
    expect(usePlannerStore.getState().accounts.length).toBe(2);
    expect(usePlannerStore.getState().events.length).toBe(0);

    // Restore snapshot
    usePlannerStore.getState().restoreBlueprintSnapshot(snapshot);

    // Verify complete restoration
    const restoredState = usePlannerStore.getState();
    expect(restoredState.accounts).toEqual([initialAccount]);
    expect(restoredState.events).toEqual([initialEvent]);
    expect(restoredState.executedEvents).toEqual({ '2026-10-01_evt-1': true });
    expect(restoredState.executedEvents['2026-10-05_evt-99']).toBeUndefined();
  });

  it('ensures snapshots are immutable deep copies unaffected by future store mutations', () => {
    const store = usePlannerStore.getState();

    const snapshot = store.applyBlueprintChangesWithSnapshot(
      [{ ...initialAccount, balance: 3000 }],
      [initialEvent],
      {},
      'First snapshot'
    );

    // Further mutate store
    usePlannerStore.getState().updateAccount('acc-1', { balance: 9999 });
    usePlannerStore.getState().addEvent({
      id: 'evt-2',
      name: 'Groceries',
      amount: 150,
      event_type: 'outflow',
      anchor_date: '2026-10-03',
      frequency: 'weekly',
      from_account_id: 'acc-1',
      to_account_id: null,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    });

    // Verify snapshot values remain untouched
    expect(snapshot.accounts[0].balance).toBe(1500);
    expect(snapshot.events.length).toBe(1);

    // Restoring reverts mutations
    usePlannerStore.getState().restoreBlueprintSnapshot(snapshot);
    expect(usePlannerStore.getState().accounts[0].balance).toBe(1500);
    expect(usePlannerStore.getState().events.length).toBe(1);
  });

  it('persists restored snapshot state to localStorage', () => {
    const store = usePlannerStore.getState();
    const snapshot = store.applyBlueprintChangesWithSnapshot(
      [{ ...initialAccount, balance: 4000 }],
      [],
      { 'override-1': true },
      'Snapshot before persistence check'
    );

    // Restore snapshot
    usePlannerStore.getState().restoreBlueprintSnapshot(snapshot);

    // Check localStorage
    const savedBlueprintRaw = localStorage.getItem('payday_blueprint');
    expect(savedBlueprintRaw).not.toBeNull();
    const savedBlueprint = JSON.parse(savedBlueprintRaw!);
    expect(savedBlueprint.accounts[0].balance).toBe(1500);
    expect(savedBlueprint.events[0].id).toBe('evt-1');

    const savedChecklistRaw = localStorage.getItem('payday_executed_checklist');
    expect(savedChecklistRaw).not.toBeNull();
    const savedChecklist = JSON.parse(savedChecklistRaw!);
    expect(savedChecklist['2026-10-01_evt-1']).toBe(true);
    expect(savedChecklist['override-1']).toBeUndefined();
  });
});

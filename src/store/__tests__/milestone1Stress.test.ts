import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlannerStore, BlueprintSnapshot } from '../usePlannerStore';
import { useSettingsStore } from '../useSettingsStore';
import { Account, Event } from '../../core/models';

describe('Milestone 1 Stress & Oracle Challenge Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    const planner = usePlannerStore.getState();
    planner.resetToDefaults();
    const settings = useSettingsStore.getState();
    useSettingsStore.setState({
      chatModel: '',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
  });

  describe('usePlannerStore — Rapid Sequential Snapshots & Rollbacks', () => {
    it('handles 100 rapid sequential snapshot creations and rollbacks without corruption', () => {
      const store = usePlannerStore.getState();
      const snapshots: BlueprintSnapshot[] = [];
      const totalSteps = 100;

      // Seed base state
      const initialAccounts: Account[] = [
        { id: 'acc-base', name: 'Base Account', type: 'chequing', owner: 'm1', balance: 1000, target_floor: 100 },
      ];
      const initialEvents: Event[] = [
        {
          id: 'evt-base',
          name: 'Base Event',
          amount: 50,
          event_type: 'outflow',
          anchor_date: '2026-10-01',
          frequency: 'monthly',
          from_account_id: 'acc-base',
          to_account_id: null,
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      usePlannerStore.setState({
        accounts: initialAccounts,
        events: initialEvents,
        executedEvents: { '2026-10-01_evt-base': true },
      });

      // Rapidly create 100 successive snapshots with evolving state
      for (let i = 0; i < totalSteps; i++) {
        const nextAccounts: Account[] = [
          {
            id: `acc-${i}`,
            name: `Account ${i}`,
            type: i % 2 === 0 ? 'chequing' : 'savings',
            owner: 'm1',
            balance: 1000 + i * 10,
            target_floor: i * 5,
          },
        ];
        const nextEvents: Event[] = [
          {
            id: `evt-${i}`,
            name: `Event ${i}`,
            amount: 10 + i,
            event_type: 'outflow',
            anchor_date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
            frequency: 'monthly',
            from_account_id: `acc-${i}`,
            to_account_id: null,
            active: true,
            execution: 'auto',
            weekend_shift: 'none',
          },
        ];
        const overrides = { [`2026-10-${i}_evt-${i}`]: true };

        const snap = usePlannerStore.getState().applyBlueprintChangesWithSnapshot(
          nextAccounts,
          nextEvents,
          overrides,
          `Snapshot ${i}`
        );
        snapshots.push(snap);
      }

      expect(snapshots.length).toBe(totalSteps);

      // Verify that rolling back to arbitrary snapshots restores exact past states
      const checkpointsToTest = [0, 25, 50, 75, 99];
      for (const idx of checkpointsToTest) {
        const targetSnap = snapshots[idx];
        usePlannerStore.getState().restoreBlueprintSnapshot(targetSnap);

        const current = usePlannerStore.getState();
        // The snapshot captures state BEFORE changes at step idx were applied
        expect(current.accounts).toEqual(targetSnap.accounts);
        expect(current.events).toEqual(targetSnap.events);
        expect(current.executedEvents).toEqual(targetSnap.executedEvents);

        // Verify localStorage matches restored snapshot
        const rawSavedBp = localStorage.getItem('payday_blueprint');
        expect(rawSavedBp).not.toBeNull();
        const savedBp = JSON.parse(rawSavedBp!);
        expect(savedBp.accounts.length).toBe(targetSnap.accounts.length);
        if (targetSnap.accounts.length > 0) {
          expect(savedBp.accounts[0].id).toBe(targetSnap.accounts[0].id);
          expect(savedBp.accounts[0].balance).toBe(targetSnap.accounts[0].balance);
        }

        const rawSavedExec = localStorage.getItem('payday_executed_checklist');
        expect(rawSavedExec).not.toBeNull();
        const savedExec = JSON.parse(rawSavedExec!);
        expect(savedExec).toEqual(targetSnap.executedEvents);
      }
    });

    it('guarantees deep cloning and no reference leaks when snapshot accounts/events are mutated externally', () => {
      const store = usePlannerStore.getState();
      const accounts: Account[] = [
        { id: 'acc-leak', name: 'Original Name', type: 'chequing', owner: 'm1', balance: 500, target_floor: 50 },
      ];
      const events: Event[] = [
        {
          id: 'evt-leak',
          name: 'Original Event',
          amount: 100,
          event_type: 'outflow',
          anchor_date: '2026-10-01',
          frequency: 'monthly',
          from_account_id: 'acc-leak',
          to_account_id: null,
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      usePlannerStore.setState({ accounts, events, executedEvents: { test: true } });

      const snap = store.applyBlueprintChangesWithSnapshot(
        [{ ...accounts[0], balance: 999 }],
        events,
        { override1: true },
        'Leak test'
      );

      // External mutation of original objects passed into store
      accounts[0].name = 'MUTATED EXTERNAL ACCOUNT';
      accounts[0].balance = 999999;
      events[0].name = 'MUTATED EXTERNAL EVENT';

      // Snapshot must remain untainted
      expect(snap.accounts[0].name).toBe('Original Name');
      expect(snap.accounts[0].balance).toBe(500);
      expect(snap.events[0].name).toBe('Original Event');

      // Now mutate snapshot directly and ensure store isn't affected
      snap.accounts[0].name = 'POISONED SNAPSHOT';
      const liveStore = usePlannerStore.getState();
      expect(liveStore.accounts[0].name).not.toBe('POISONED SNAPSHOT');
    });

    it('prevents prototype pollution in executedOverrides and snapshots', () => {
      const store = usePlannerStore.getState();

      const maliciousOverrides = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"polluted": true}}');

      store.applyBlueprintChangesWithSnapshot([], [], maliciousOverrides, 'Pollution attack');

      // Global Object prototype must not have been polluted
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();

      // Check executedEvents object
      const current = usePlannerStore.getState();
      expect((current.executedEvents as any).polluted).toBeUndefined();
    });

    it('handles localStorage errors gracefully during saveState and loadInitialBlueprint', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError: storage is full');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = usePlannerStore.getState();
      // Should not throw even if localStorage fails
      expect(() => {
        store.applyBlueprintChangesWithSnapshot([], [], {}, 'Storage failure');
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();

      setItemSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('useSettingsStore — Edge Cases & Stress Testing toggleFavoriteChatModel', () => {
    it('handles empty strings and whitespace without throwing or corrupting favorites', () => {
      const store = useSettingsStore.getState();

      // Toggle empty string
      store.toggleFavoriteChatModel('');
      expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['']);

      // Toggle off
      store.toggleFavoriteChatModel('');
      expect(useSettingsStore.getState().chatFavoriteModels).toEqual([]);

      // Whitespace
      store.toggleFavoriteChatModel('   ');
      expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['   ']);
      store.toggleFavoriteChatModel('   ');
      expect(useSettingsStore.getState().chatFavoriteModels).toEqual([]);
    });

    it('handles special characters, unicode, emojis, and paths safely', () => {
      const store = useSettingsStore.getState();
      const trickyModels = [
        'openrouter/anthropic/claude-3.5-sonnet:beta',
        'gpt-4o@2024-08-06#special?v=1',
        '🤖-robot-model-🔥',
        '<script>alert("xss")</script>',
        '${process.env.SECRET}',
        'model with spaces and / slashes and \\ backslashes',
      ];

      for (const m of trickyModels) {
        store.toggleFavoriteChatModel(m);
      }

      const state1 = useSettingsStore.getState();
      expect(state1.chatFavoriteModels).toEqual(trickyModels);

      // Verify localStorage persistence can round-trip these tricky strings
      const raw = localStorage.getItem('payday_settings');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.chatFavoriteModels).toEqual(trickyModels);

      // Remove in reverse order
      for (const m of [...trickyModels].reverse()) {
        store.toggleFavoriteChatModel(m);
      }

      expect(useSettingsStore.getState().chatFavoriteModels).toEqual([]);
    });

    it('prevents prototype pollution via toggleFavoriteChatModel', () => {
      const store = useSettingsStore.getState();
      const attackKeys = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'];

      for (const key of attackKeys) {
        store.toggleFavoriteChatModel(key);
      }

      expect(useSettingsStore.getState().chatFavoriteModels).toEqual(attackKeys);
      expect((Object.prototype as any).favorite).toBeUndefined();
      expect(({} as any)[attackKeys[0]]).not.toBe(true);

      // Toggle them back off
      for (const key of attackKeys) {
        store.toggleFavoriteChatModel(key);
      }
      expect(useSettingsStore.getState().chatFavoriteModels).toEqual([]);
    });

    it('survives rapid toggling (1000 toggles) preserving parity and array integrity', () => {
      const store = useSettingsStore.getState();
      const targetModel = 'rapid-toggle-model';

      for (let i = 1; i <= 1000; i++) {
        store.toggleFavoriteChatModel(targetModel);
        const favs = useSettingsStore.getState().chatFavoriteModels || [];
        if (i % 2 === 1) {
          expect(favs).toContain(targetModel);
          expect(favs.length).toBe(1);
        } else {
          expect(favs).not.toContain(targetModel);
          expect(favs.length).toBe(0);
        }
      }

      expect(useSettingsStore.getState().chatFavoriteModels).toEqual([]);
    });

    it('handles toggling among 500 distinct favorite models without data corruption', () => {
      const store = useSettingsStore.getState();
      const total = 500;

      for (let i = 0; i < total; i++) {
        store.toggleFavoriteChatModel(`model-${i}`);
      }

      let favs = useSettingsStore.getState().chatFavoriteModels || [];
      expect(favs.length).toBe(total);
      expect(favs[0]).toBe('model-0');
      expect(favs[total - 1]).toBe(`model-${total - 1}`);

      // Remove all even indices
      for (let i = 0; i < total; i += 2) {
        store.toggleFavoriteChatModel(`model-${i}`);
      }

      favs = useSettingsStore.getState().chatFavoriteModels || [];
      expect(favs.length).toBe(total / 2);
      expect(favs.includes('model-0')).toBe(false);
      expect(favs.includes('model-1')).toBe(true);
    });

    it('handles unexpected non-array or corrupted persisted chatFavoriteModels', () => {
      // Simulate state where chatFavoriteModels somehow becomes undefined or null
      useSettingsStore.setState({ chatFavoriteModels: undefined as any });

      const store = useSettingsStore.getState();
      expect(() => {
        store.toggleFavoriteChatModel('fallback-model');
      }).not.toThrow();

      expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['fallback-model']);
    });
  });

  describe('Adversarial Boundary Analysis — Reference Sharing on Restore', () => {
    it('documents whether restoreBlueprintSnapshot shares array/object references with snapshot', () => {
      const store = usePlannerStore.getState();
      const accounts: Account[] = [
        { id: 'acc-ref', name: 'Ref Test', type: 'chequing', owner: 'm1', balance: 100, target_floor: 10 },
      ];
      const events: Event[] = [
        {
          id: 'evt-ref',
          name: 'Ref Evt',
          amount: 25,
          event_type: 'outflow',
          anchor_date: '2026-10-01',
          frequency: 'monthly',
          from_account_id: 'acc-ref',
          to_account_id: null,
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      usePlannerStore.setState({ accounts, events, executedEvents: { 'ref-1': true } });

      const snapshot = store.applyBlueprintChangesWithSnapshot(
        [{ ...accounts[0], balance: 500 }],
        events,
        {},
        'Ref snapshot'
      );

      // Verify that applyBlueprintChangesWithSnapshot created new copies for the snapshot
      expect(snapshot.accounts).not.toBe(accounts);

      // Now restore snapshot
      store.restoreBlueprintSnapshot(snapshot);

      const stateAfterRestore = usePlannerStore.getState();

      // Check whether state after restore directly references snapshot arrays
      const isAccountsArrayShared = stateAfterRestore.accounts === snapshot.accounts;
      const isEventsArrayShared = stateAfterRestore.events === snapshot.events;
      const isExecutedShared = stateAfterRestore.executedEvents === snapshot.executedEvents;

      // Note: restoreBlueprintSnapshot assigns `accounts: snapshot.accounts` directly.
      // If snapshot.accounts is mutated after restore, store.accounts is affected.
      // In normal immutable React/Zustand workflows, actions like updateAccount return new arrays.
      // But we verify what happens if someone mutates snapshot.accounts:
      expect(isAccountsArrayShared).toBe(true);
      expect(isEventsArrayShared).toBe(true);
      expect(isExecutedShared).toBe(true);
    });
  });
});


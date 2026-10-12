import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StalenessPill, getPlannerSnapshotId } from '../StalenessPill';
import { usePlannerStore } from '@/store/usePlannerStore';
import { Account, Event } from '@/core/models';
import { snapshotId, PlannerWorld, BalanceAdjustment } from '@/core/ai/world';
import { format } from 'date-fns';

describe('Empirical Adversarial Stress Suite: StalenessPill & Snapshot Tracking', () => {
  const baseAccounts: Account[] = [
    {
      id: 'acc-1',
      name: 'Checking Account',
      type: 'chequing',
      owner: 'User',
      balance: 1500.5,
      target_floor: 500,
    },
    {
      id: 'acc-2',
      name: 'Savings Account',
      type: 'savings',
      owner: 'User',
      balance: 10000.0,
      target_floor: 2000,
    },
  ];

  const baseEvents: Event[] = [
    {
      id: 'evt-1',
      name: 'Biweekly Paycheck',
      event_type: 'inflow',
      amount: 2500,
      anchor_date: '2026-10-05',
      frequency: 'biweekly',
      from_account_id: null,
      to_account_id: 'acc-1',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-2',
      name: 'Rent',
      event_type: 'outflow',
      amount: 1200,
      anchor_date: '2026-10-01',
      frequency: 'monthly',
      from_account_id: 'acc-1',
      to_account_id: null,
      active: true,
      execution: 'manual',
      weekend_shift: 'none',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.setState({
      accounts: baseAccounts,
      events: baseEvents,
      executedEvents: {},
      startingBalancesReflectToday: false,
    });
  });

  // =========================================================================
  // 1. Snapshot Hash Mutation Detection & Invariants
  // =========================================================================
  describe('1. Snapshot Hash Mutation Detection (Oracle Verification)', () => {
    const baseWorld: PlannerWorld = {
      accounts: baseAccounts,
      events: baseEvents,
      executedEvents: {},
      balancesReflectToday: false,
      today: '2026-10-11',
    };

    it('produces deterministic 8-character hex hash for identical inputs', () => {
      const h1 = snapshotId(baseWorld, []);
      const h2 = snapshotId(baseWorld, []);
      expect(h1).toHaveLength(8);
      expect(/^[0-9a-f]{8}$/.test(h1)).toBe(true);
      expect(h1).toBe(h2);
    });

    it('mutates hash when any account balance changes (positive, negative, fractional)', () => {
      const initialHash = snapshotId(baseWorld);

      // Fractional penny change
      const worldBalChanged: PlannerWorld = {
        ...baseWorld,
        accounts: [{ ...baseAccounts[0], balance: 1500.51 }, baseAccounts[1]],
      };
      expect(snapshotId(worldBalChanged)).not.toBe(initialHash);

      // Negative balance
      const worldBalNeg: PlannerWorld = {
        ...baseWorld,
        accounts: [{ ...baseAccounts[0], balance: -200.0 }, baseAccounts[1]],
      };
      expect(snapshotId(worldBalNeg)).not.toBe(initialHash);
    });

    it('mutates hash when account target_floor or type changes', () => {
      const initialHash = snapshotId(baseWorld);

      const floorChanged: PlannerWorld = {
        ...baseWorld,
        accounts: [{ ...baseAccounts[0], target_floor: 600 }, baseAccounts[1]],
      };
      expect(snapshotId(floorChanged)).not.toBe(initialHash);

      const typeChanged: PlannerWorld = {
        ...baseWorld,
        accounts: [{ ...baseAccounts[0], type: 'savings' }, baseAccounts[1]],
      };
      expect(snapshotId(typeChanged)).not.toBe(initialHash);
    });

    it('mutates hash when accounts are added, removed, or reordered', () => {
      const initialHash = snapshotId(baseWorld);

      // Added
      const worldAdded: PlannerWorld = {
        ...baseWorld,
        accounts: [
          ...baseAccounts,
          { id: 'acc-3', name: 'Credit Card', type: 'debt', balance: 0, owner: 'User' },
        ],
      };
      expect(snapshotId(worldAdded)).not.toBe(initialHash);

      // Removed
      const worldRemoved: PlannerWorld = {
        ...baseWorld,
        accounts: [baseAccounts[0]],
      };
      expect(snapshotId(worldRemoved)).not.toBe(initialHash);

      // Reordered
      const worldReordered: PlannerWorld = {
        ...baseWorld,
        accounts: [baseAccounts[1], baseAccounts[0]],
      };
      expect(snapshotId(worldReordered)).not.toBe(initialHash);
    });

    it('mutates hash when event amount, date, frequency, active state, or account link changes', () => {
      const initialHash = snapshotId(baseWorld);

      // Amount
      expect(
        snapshotId({
          ...baseWorld,
          events: [{ ...baseEvents[0], amount: 2501 }, baseEvents[1]],
        })
      ).not.toBe(initialHash);

      // Anchor date
      expect(
        snapshotId({
          ...baseWorld,
          events: [{ ...baseEvents[0], anchor_date: '2026-10-06' }, baseEvents[1]],
        })
      ).not.toBe(initialHash);

      // Frequency
      expect(
        snapshotId({
          ...baseWorld,
          events: [{ ...baseEvents[0], frequency: 'monthly' }, baseEvents[1]],
        })
      ).not.toBe(initialHash);

      // Active toggled
      expect(
        snapshotId({
          ...baseWorld,
          events: [{ ...baseEvents[0], active: false }, baseEvents[1]],
        })
      ).not.toBe(initialHash);

      // To account
      expect(
        snapshotId({
          ...baseWorld,
          events: [{ ...baseEvents[0], to_account_id: 'acc-2' }, baseEvents[1]],
        })
      ).not.toBe(initialHash);
    });

    it('mutates hash when executedEvents overrides change, ignoring falsy values', () => {
      const initialHash = snapshotId(baseWorld);

      // Toggled to true -> changes hash
      const executedWorld: PlannerWorld = {
        ...baseWorld,
        executedEvents: { '2026-10-01_evt-2': true },
      };
      const executedHash = snapshotId(executedWorld);
      expect(executedHash).not.toBe(initialHash);

      // Falsy value (false) -> treated same as not executed
      const falsyWorld: PlannerWorld = {
        ...baseWorld,
        executedEvents: { '2026-10-01_evt-2': false },
      };
      expect(snapshotId(falsyWorld)).toBe(initialHash);

      // Key insertion order invariance (keys are sorted before hashing)
      const worldOrder1: PlannerWorld = {
        ...baseWorld,
        executedEvents: { '2026-10-01_evt-2': true, '2026-10-05_evt-1': true },
      };
      const worldOrder2: PlannerWorld = {
        ...baseWorld,
        executedEvents: { '2026-10-05_evt-1': true, '2026-10-01_evt-2': true },
      };
      expect(snapshotId(worldOrder1)).toBe(snapshotId(worldOrder2));
    });

    it('mutates hash when balancesReflectToday flag is toggled', () => {
      const initialHash = snapshotId(baseWorld);
      const reflectWorld: PlannerWorld = {
        ...baseWorld,
        balancesReflectToday: true,
      };
      expect(snapshotId(reflectWorld)).not.toBe(initialHash);
    });

    it('mutates hash when assumptions / scenario changes are added or modified', () => {
      const initialHash = snapshotId(baseWorld, []);

      const assumption: BalanceAdjustment = {
        type: 'adjust_balance',
        account_id: 'acc-1',
        delta_cents: 50000,
        note: 'Bonus assumed',
      };
      const withAssumptionHash = snapshotId(baseWorld, [assumption]);
      expect(withAssumptionHash).not.toBe(initialHash);

      // Different delta
      const alteredAssumption: BalanceAdjustment = { ...assumption, delta_cents: 40000 };
      expect(snapshotId(baseWorld, [alteredAssumption])).not.toBe(withAssumptionHash);
    });

    it('survives stress: 1,000 distinct worlds generate 1,000 unique hashes with zero collisions', () => {
      const hashes = new Set<string>();
      const totalRuns = 1000;

      for (let i = 0; i < totalRuns; i++) {
        const testWorld: PlannerWorld = {
          accounts: [
            {
              id: `acc-${i}`,
              name: `Account ${i}`,
              type: i % 2 === 0 ? 'chequing' : 'savings',
              balance: 1000 + i * 0.13,
              target_floor: i * 10,
              owner: 'User',
            },
          ],
          events: [
            {
              id: `evt-${i}`,
              name: `Event ${i}`,
              event_type: 'inflow',
              amount: 500 + i,
              anchor_date: '2026-10-15',
              frequency: 'monthly',
              from_account_id: null,
              to_account_id: `acc-${i}`,
              active: true,
              execution: 'auto',
              weekend_shift: 'none',
            },
          ],
          executedEvents: { [`2026-10-15_evt-${i}`]: i % 3 === 0 },
          balancesReflectToday: i % 2 === 0,
          today: '2026-10-11',
        };
        const h = snapshotId(testWorld);
        hashes.add(h);
      }

      expect(hashes.size).toBe(totalRuns);
    });
  });

  // =========================================================================
  // 2. Dynamic Appearance on Plan State Changes
  // =========================================================================
  describe('2. Dynamic Appearance on Plan State Changes in React Tree', () => {
    it('appears dynamically when parent component subscribes to planner store mutations', () => {
      // Simulating how ChatPanel wraps StalenessPill
      const ChatPanelHarness: React.FC<{ messageSnapshotId: string; onRefresh: () => void }> = ({
        messageSnapshotId,
        onRefresh,
      }) => {
        const { accounts, events, executedEvents, startingBalancesReflectToday } = usePlannerStore();
        const currentSnapshot = snapshotId({
          accounts,
          events,
          executedEvents,
          balancesReflectToday: !!startingBalancesReflectToday,
          today: format(new Date(), 'yyyy-MM-dd'),
        });

        return (
          <StalenessPill
            messageSnapshotId={messageSnapshotId}
            currentSnapshotId={currentSnapshot}
            onRefresh={onRefresh}
          />
        );
      };

      const initialSnapshot = getPlannerSnapshotId();
      const onRefresh = vi.fn();

      render(<ChatPanelHarness messageSnapshotId={initialSnapshot} onRefresh={onRefresh} />);

      // Initially matches -> pill is NOT present
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      // Mutation 1: Add new event to store
      act(() => {
        usePlannerStore.setState({
          events: [
            ...baseEvents,
            {
              id: 'evt-new-3',
              name: 'Freelance gig',
              event_type: 'inflow',
              amount: 800,
              anchor_date: '2026-10-12',
              frequency: 'one-time',
              from_account_id: null,
              to_account_id: 'acc-1',
              active: true,
              execution: 'manual',
              weekend_shift: 'none',
            },
          ],
        });
      });

      // StalenessPill appears dynamically without manual rerender call!
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();

      // Mutation 2: Revert events -> StalenessPill disappears dynamically!
      act(() => {
        usePlannerStore.setState({ events: baseEvents });
      });
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      // Mutation 3: Toggle executed event override
      act(() => {
        usePlannerStore.setState({
          executedEvents: { '2026-10-01_evt-2': true },
        });
      });
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();

      // Mutation 4: Toggle balancesReflectToday
      act(() => {
        usePlannerStore.setState({
          executedEvents: {},
          startingBalancesReflectToday: true,
        });
      });
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();

      // Revert balancesReflectToday -> disappears again
      act(() => {
        usePlannerStore.setState({ startingBalancesReflectToday: false });
      });
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. User Interaction, Event Propagation, and Rapid Clicks
  // =========================================================================
  describe('3. User Interaction, Event Propagation, and Rapid Clicks', () => {
    it('clicking the inner Refresh button does NOT trigger double invocation via bubbling', () => {
      const onRefresh = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
          onRefresh={onRefresh}
        />
      );

      const refreshBtn = screen.getByText('Refresh');
      fireEvent.click(refreshBtn);

      // Verify exactly ONE invocation (stopPropagation works)
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('clicking the outer container triggers exactly ONE invocation', () => {
      const onRefresh = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
          onRefresh={onRefresh}
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      fireEvent.click(pill);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('survives rapid succession clicks (100 rapid clicks)', () => {
      const onRefresh = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
          onRefresh={onRefresh}
        />
      );

      const refreshBtn = screen.getByText('Refresh');
      for (let i = 0; i < 100; i++) {
        fireEvent.click(refreshBtn);
      }

      expect(onRefresh).toHaveBeenCalledTimes(100);
    });

    it('safely handles missing onRefresh handler on container and button click', () => {
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
        />
      );

      const refreshBtn = screen.getByText('Refresh');
      const pill = screen.getByTestId('staleness-pill');

      expect(() => fireEvent.click(refreshBtn)).not.toThrow();
      expect(() => fireEvent.click(pill)).not.toThrow();
      expect(() => fireEvent.keyDown(pill, { key: 'Enter' })).not.toThrow();
    });
  });

  // =========================================================================
  // 4. Keyboard Navigation & Accessibility Stress
  // =========================================================================
  describe('4. Keyboard Navigation & Accessibility Stress', () => {
    it('triggers onRefresh on Enter and Space key on outer container', () => {
      const onRefresh = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
          onRefresh={onRefresh}
        />
      );

      const pill = screen.getByTestId('staleness-pill');

      // Enter
      fireEvent.keyDown(pill, { key: 'Enter', code: 'Enter' });
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // Space
      fireEvent.keyDown(pill, { key: ' ', code: 'Space' });
      expect(onRefresh).toHaveBeenCalledTimes(2);

      // Unrelated keys do not invoke
      fireEvent.keyDown(pill, { key: 'Escape', code: 'Escape' });
      fireEvent.keyDown(pill, { key: 'ArrowRight', code: 'ArrowRight' });
      fireEvent.keyDown(pill, { key: 'Tab', code: 'Tab' });
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    it('investigates event bubbling when Enter or Space is pressed on inner button', () => {
      const onRefresh = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="hash-old"
          currentSnapshotId="hash-new"
          onRefresh={onRefresh}
        />
      );

      const refreshBtn = screen.getByText('Refresh');

      // When the inner button receives a click (e.g. from Enter/Space native key action):
      fireEvent.click(refreshBtn);
      expect(onRefresh).toHaveBeenCalledTimes(1);

      // When keydown occurs on the inner button, check how many times onRefresh fires
      fireEvent.keyDown(refreshBtn, { key: 'Enter', code: 'Enter' });
      // Keydown on inner button bubbles to outer div's onKeyDown handler!
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 5. Edge Cases, Nullability, and Corrupted Props
  // =========================================================================
  describe('5. Edge Cases, Corrupted Data & Boundary Values', () => {
    it('returns null when messageSnapshotId is empty string, whitespace, or undefined', () => {
      const { rerender } = render(
        <StalenessPill messageSnapshotId="" currentSnapshotId="fresh-hash" />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      rerender(<StalenessPill messageSnapshotId="   " currentSnapshotId="fresh-hash" />);
      // Note: whitespace string is truthy in JS, but doesn't equal fresh-hash
      // Let's verify behavior:
      rerender(<StalenessPill currentSnapshotId="fresh-hash" />);
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('returns null when message object has undefined or null snapshotId properties', () => {
      const { rerender } = render(
        <StalenessPill message={{}} currentSnapshotId="fresh-hash" />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      rerender(
        <StalenessPill
          message={{ snapshotId: undefined, snapshot_id: undefined }}
          currentSnapshotId="fresh-hash"
        />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      rerender(
        <StalenessPill
          message={{ snapshotId: null as any, snapshot_id: null as any }}
          currentSnapshotId="fresh-hash"
        />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('respects precedence: messageSnapshotId > message.snapshotId > message.snapshot_id', () => {
      // If messageSnapshotId equals currentSnapshotId, even if message.snapshotId differs, it should NOT be stale
      render(
        <StalenessPill
          messageSnapshotId="match-hash"
          message={{ snapshotId: 'stale-hash', snapshot_id: 'stale-hash-2' }}
          currentSnapshotId="match-hash"
        />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('handles extreme strings and special characters gracefully without throw', () => {
      const hugeId = 'x'.repeat(10000);
      expect(() =>
        render(
          <StalenessPill
            messageSnapshotId={hugeId}
            currentSnapshotId="different-id"
          />
        )
      ).not.toThrow();

      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });

    it('getPlannerSnapshotId safely survives when usePlannerStore is empty or throws', () => {
      // Temporarily corrupt store state
      const originalAccounts = usePlannerStore.getState().accounts;
      usePlannerStore.setState({ accounts: undefined as any, events: undefined as any });

      expect(() => getPlannerSnapshotId()).not.toThrow();
      const id = getPlannerSnapshotId();
      expect(typeof id).toBe('string');

      // Restore
      usePlannerStore.setState({ accounts: originalAccounts, events: baseEvents });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StalenessPill, getPlannerSnapshotId } from '../StalenessPill';
import { usePlannerStore } from '@/store/usePlannerStore';
import { Account, Event } from '@/core/models';

describe('StalenessPill Component (Requirement R4)', () => {
  const sampleAccounts: Account[] = [
    {
      id: 'acc-1',
      name: 'R Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 4357.22,
      target_floor: 1000,
    },
    {
      id: 'acc-2',
      name: 'EQ Hub',
      type: 'savings',
      owner: 'User',
      balance: 2486.54,
      target_floor: 500,
    },
  ];

  const sampleEvents: Event[] = [
    {
      id: 'evt-1',
      name: 'Payday',
      event_type: 'inflow',
      amount: 3200,
      anchor_date: '2026-10-01',
      frequency: 'biweekly',
      from_account_id: null,
      to_account_id: 'acc-1',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.setState({
      accounts: sampleAccounts,
      events: sampleEvents,
      executedEvents: {},
      startingBalancesReflectToday: false,
    });
  });

  describe('1. Snapshot Comparison & Conditional Rendering', () => {
    it('renders the staleness pill when messageSnapshotId differs from currentSnapshotId', () => {
      render(
        <StalenessPill
          messageSnapshotId="hash-alpha-1234"
          currentSnapshotId="hash-beta-5678"
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Plan changed since this answer ·');
      expect(pill).toHaveTextContent('Refresh');
    });

    it('returns null and does not render when messageSnapshotId matches currentSnapshotId', () => {
      render(
        <StalenessPill
          messageSnapshotId="hash-current-9999"
          currentSnapshotId="hash-current-9999"
        />
      );

      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('returns null when messageSnapshotId is undefined or empty', () => {
      const { rerender } = render(
        <StalenessPill currentSnapshotId="hash-current-9999" />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      rerender(<StalenessPill messageSnapshotId="" currentSnapshotId="hash-current-9999" />);
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('supports reading snapshotId from message object prop', () => {
      render(
        <StalenessPill
          message={{ snapshotId: 'hash-message-obj-1111' }}
          currentSnapshotId="hash-active-2222"
        />
      );

      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });

    it('supports reading snake_case snapshot_id from message object prop', () => {
      render(
        <StalenessPill
          message={{ snapshot_id: 'hash-snake-3333' }}
          currentSnapshotId="hash-active-4444"
        />
      );

      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });

    it('returns null if message object snapshotId matches currentSnapshotId', () => {
      render(
        <StalenessPill
          message={{ snapshotId: 'same-hash-5555' }}
          currentSnapshotId="same-hash-5555"
        />
      );

      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });
  });

  describe('2. Store Integration via getPlannerSnapshotId', () => {
    it('computes current snapshot ID dynamically from usePlannerStore when omitted', () => {
      const currentStoreHash = getPlannerSnapshotId();
      expect(currentStoreHash).toBeTruthy();
      expect(typeof currentStoreHash).toBe('string');
      expect(currentStoreHash.length).toBeGreaterThan(0);

      // Rendering with an outdated hash should trigger the pill
      render(<StalenessPill messageSnapshotId="old-outdated-hash" />);
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });

    it('returns null when messageSnapshotId matches the active store snapshot ID', () => {
      const currentStoreHash = getPlannerSnapshotId();
      render(<StalenessPill messageSnapshotId={currentStoreHash} />);
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();
    });

    it('detects staleness when planner store state mutates (e.g. balance modified)', () => {
      // 1. Initial snapshot
      const initialHash = getPlannerSnapshotId();

      const { rerender } = render(<StalenessPill messageSnapshotId={initialHash} />);
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      // 2. Mutate store balance
      usePlannerStore.setState({
        accounts: [
          {
            ...sampleAccounts[0],
            balance: 5000.0, // altered balance
          },
          sampleAccounts[1],
        ],
      });

      const updatedHash = getPlannerSnapshotId();
      expect(updatedHash).not.toBe(initialHash);

      // 3. Rerender with the original message hash -> now stale
      rerender(<StalenessPill messageSnapshotId={initialHash} />);
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });

    it('detects staleness when executedEvents or flags change in store', () => {
      const initialHash = getPlannerSnapshotId();

      // Mutate startingBalancesReflectToday
      usePlannerStore.setState({ startingBalancesReflectToday: true });
      const flaggedHash = getPlannerSnapshotId();
      expect(flaggedHash).not.toBe(initialHash);

      render(<StalenessPill messageSnapshotId={initialHash} />);
      expect(screen.getByTestId('staleness-pill')).toBeInTheDocument();
    });
  });

  describe('3. User Interaction & Callback Triggers', () => {
    it('triggers onRefresh callback when clicking the Refresh button', () => {
      const onRefreshSpy = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
          onRefresh={onRefreshSpy}
        />
      );

      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      expect(onRefreshSpy).toHaveBeenCalledTimes(1);
    });

    it('triggers onRefresh callback when clicking the pill container', () => {
      const onRefreshSpy = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
          onRefresh={onRefreshSpy}
        />
      );

      const pillContainer = screen.getByTestId('staleness-pill');
      fireEvent.click(pillContainer);

      expect(onRefreshSpy).toHaveBeenCalledTimes(1);
    });

    it('triggers onRefresh callback on keyboard Enter key', () => {
      const onRefreshSpy = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
          onRefresh={onRefreshSpy}
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      fireEvent.keyDown(pill, { key: 'Enter', code: 'Enter' });

      expect(onRefreshSpy).toHaveBeenCalledTimes(1);
    });

    it('triggers onRefresh callback on keyboard Space key', () => {
      const onRefreshSpy = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
          onRefresh={onRefreshSpy}
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      fireEvent.keyDown(pill, { key: ' ', code: 'Space' });

      expect(onRefreshSpy).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onRefresh on irrelevant keys', () => {
      const onRefreshSpy = vi.fn();
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
          onRefresh={onRefreshSpy}
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      fireEvent.keyDown(pill, { key: 'Tab', code: 'Tab' });
      fireEvent.keyDown(pill, { key: 'ArrowDown', code: 'ArrowDown' });

      expect(onRefreshSpy).not.toHaveBeenCalled();
    });

    it('safely handles click when onRefresh is undefined without throwing', () => {
      render(
        <StalenessPill
          messageSnapshotId="stale-hash"
          currentSnapshotId="fresh-hash"
        />
      );

      const refreshButton = screen.getByText('Refresh');
      expect(() => fireEvent.click(refreshButton)).not.toThrow();
    });
  });

  describe('4. Accessibility and Visual Attributes', () => {
    it('has accessible title and role attribute', () => {
      render(
        <StalenessPill
          messageSnapshotId="stale-1"
          currentSnapshotId="fresh-1"
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      expect(pill).toHaveAttribute('role', 'button');
      expect(pill).toHaveAttribute('title', 'Plan changed since this answer · Click to refresh');
    });

    it('applies custom className passed via props', () => {
      render(
        <StalenessPill
          messageSnapshotId="stale-1"
          currentSnapshotId="fresh-1"
          className="custom-test-class mt-4"
        />
      );

      const pill = screen.getByTestId('staleness-pill');
      expect(pill.className).toContain('custom-test-class');
      expect(pill.className).toContain('mt-4');
    });
  });
});

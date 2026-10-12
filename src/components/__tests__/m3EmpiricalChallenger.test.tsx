import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MiniBalanceChart, MiniBalancePoint } from '../MiniBalanceChart';
import { SimulationCard } from '../SimulationCard';
import { usePlannerStore } from '../../store/usePlannerStore';
import { Account, Event } from '../../core/models';
import { BlueprintChange } from '../../core/tools';
import { toast, Toaster } from '../ui/sonner';
import { format, addDays } from 'date-fns';

// Mock ResponsiveContainer for Recharts JSDOM compatibility
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => {
      if (React.isValidElement(children)) {
        return (
          <div className="recharts-responsive-container" style={{ width: 400, height: 120 }}>
            {React.cloneElement(children as any, { width: 400, height: 120 })}
          </div>
        );
      }
      return null;
    },
  };
});

describe('Milestone 3 Empirical Challenger: Rich Simulation Cards & MiniBalanceChart', () => {
  const sampleAccounts: Account[] = [
    {
      id: 'acc-chequing',
      name: 'Primary Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 2500,
      interest_rate: 0,
      target_floor: 500,
    },
    {
      id: 'acc-savings',
      name: 'High Interest Savings',
      type: 'savings',
      owner: 'User',
      balance: 15000,
      interest_rate: 3.5,
      target_floor: 2000,
    },
    {
      id: 'acc-visa',
      name: 'Platinum Visa',
      type: 'debt',
      owner: 'User',
      balance: -3200,
      interest_rate: 19.99,
      target_floor: 0,
    },
    {
      id: 'acc-loc',
      name: 'Line of Credit',
      type: 'debt',
      owner: 'User',
      balance: -10000,
      interest_rate: 7.2,
      target_floor: 0,
    },
  ];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const futureDateStr = format(addDays(new Date(), 8), 'yyyy-MM-dd');

  const sampleEvents: Event[] = [
    {
      id: 'evt-payday',
      name: 'Bi-weekly Payday',
      event_type: 'inflow',
      amount: 3200,
      from_account_id: null,
      to_account_id: 'acc-chequing',
      frequency: 'one-time',
      anchor_date: futureDateStr,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-car-loan',
      name: 'Car Loan',
      event_type: 'outflow',
      amount: 450,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: futureDateStr,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.setState({
      accounts: JSON.parse(JSON.stringify(sampleAccounts)),
      events: JSON.parse(JSON.stringify(sampleEvents)),
      executedEvents: {},
    });
    vi.clearAllMocks();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. <MiniBalanceChart> Boundary Invariants & Stress Testing', () => {
    it('concurrently renders multiple MiniBalanceChart instances across distinct accounts without interference', () => {
      render(
        <div data-testid="multi-chart-wrapper">
          {sampleAccounts.map((acc) => (
            <MiniBalanceChart
              key={acc.id}
              accountId={acc.id}
              accountName={acc.name}
              accounts={sampleAccounts}
              events={sampleEvents}
              changes={[]}
            />
          ))}
        </div>
      );

      // Verify each account container is present
      for (const acc of sampleAccounts) {
        const chart = screen.getByTestId(`mini-balance-chart-${acc.id}`);
        expect(chart).toBeInTheDocument();
        expect(within(chart).getByText(acc.name)).toBeInTheDocument();
        expect(within(chart).getByText('Baseline')).toBeInTheDocument();
        expect(within(chart).getByText('Simulated')).toBeInTheDocument();
      }
    });

    it('handles extreme and boundary balances: deeply negative debt, huge balances, and exact zero balances', () => {
      const extremePoints: MiniBalancePoint[] = [
        { date: 'Oct 01', baseline: -50000, simulated: -48000 },
        { date: 'Oct 02', baseline: 0, simulated: 0 },
        { date: 'Oct 03', baseline: 1500000, simulated: 1600000 },
        { date: 'Oct 04', baseline: 0.004, simulated: 0.009 },
      ];

      render(
        <MiniBalanceChart
          accountId="acc-extreme"
          accountName="Extreme Balances Account"
          data={extremePoints}
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-extreme');
      expect(container).toBeInTheDocument();
      expect(screen.getByText('Extreme Balances Account')).toBeInTheDocument();
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
    });

    it('falls back to empty placeholder when explicit data array is empty', () => {
      render(
        <MiniBalanceChart
          accountId="acc-empty-data"
          accountName="Empty Data Account"
          data={[]}
        />
      );

      // Falls back to empty notice
      expect(
        screen.getByTestId('mini-balance-chart-empty-acc-empty-data')
      ).toHaveTextContent('No projection data available for Empty Data Account');
    });

    it('falls back to empty placeholder when target account is not present in accounts', () => {
      render(
        <MiniBalanceChart
          accountId="non-existent-account"
          accountName="Ghost Account"
          accounts={sampleAccounts}
          events={sampleEvents}
        />
      );

      expect(
        screen.getByTestId('mini-balance-chart-empty-non-existent-account')
      ).toHaveTextContent('No projection data available for Ghost Account');
    });

    it('gracefully handles empty accounts array [] by showing fallback', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accounts={[]}
          events={[]}
        />
      );

      expect(
        screen.getByTestId('mini-balance-chart-empty-acc-chequing')
      ).toHaveTextContent('No projection data available for acc-chequing');
    });

    it('computes identical curves when changes array is empty (zero changes invariant)', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Primary Chequing"
          accounts={sampleAccounts}
          events={sampleEvents}
          changes={[]}
        />
      );

      const chart = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(chart).toBeInTheDocument();
      expect(chart.querySelector('.recharts-surface')).toBeInTheDocument();
    });

    it('handles unusual daysWindow boundaries: 0, 1, 90, and negative numbers without crashing', () => {
      const windows = [0, 1, 90, -5];

      for (const w of windows) {
        const { unmount } = render(
          <MiniBalanceChart
            accountId="acc-chequing"
            accounts={sampleAccounts}
            events={sampleEvents}
            daysWindow={w}
          />
        );
        unmount();
      }
    });
  });

  describe('2. <SimulationCard> Multi-Account Impact & Edge-Case Payloads', () => {
    it('renders multiple affected accounts with individual impact summaries and embedded charts', () => {
      const multiImpactDiff = {
        diff: {
          affected_accounts: {
            'acc-chequing': {
              name: 'Primary Chequing',
              lowest_balance_before: 500,
              lowest_balance_after: 950,
              lowest_balance_change: 450,
              first_breach_before: '2026-10-10',
              first_breach_after: 'None',
            },
            'acc-savings': {
              name: 'High Interest Savings',
              lowest_balance_before: 15000,
              lowest_balance_after: 15000,
              lowest_balance_change: 0,
              first_breach_before: 'None',
              first_breach_after: 'None',
            },
            'acc-visa': {
              name: 'Platinum Visa',
              lowest_balance_before: -3200,
              lowest_balance_after: -2750,
              lowest_balance_change: 450,
              first_breach_before: '2026-10-12',
              first_breach_after: '2026-10-20',
            },
            'acc-loc': {
              name: 'Line of Credit',
              lowest_balance_before: -10000,
              lowest_balance_after: -10500,
              lowest_balance_change: -500,
              first_breach_before: 'None',
              first_breach_after: '2026-10-15',
            },
          },
        },
        status: 'Simulation succeeded with multi-account impact.',
      };

      const changes: BlueprintChange[] = [
        {
          type: 'skip_event',
          date: futureDateStr,
          event_id: 'evt-car-loan',
        },
      ];

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={multiImpactDiff}
          changes={changes}
          accounts={sampleAccounts}
          events={sampleEvents}
        />
      );

      // Verify all 4 account names are rendered in impact blocks
      expect(screen.getAllByText('Primary Chequing').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('High Interest Savings').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Platinum Visa').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Line of Credit').length).toBeGreaterThanOrEqual(1);

      // Verify embedded MiniBalanceCharts are rendered for all 4 accounts
      expect(screen.getByTestId('mini-balance-chart-acc-chequing')).toBeInTheDocument();
      expect(screen.getByTestId('mini-balance-chart-acc-savings')).toBeInTheDocument();
      expect(screen.getByTestId('mini-balance-chart-acc-visa')).toBeInTheDocument();
      expect(screen.getByTestId('mini-balance-chart-acc-loc')).toBeInTheDocument();

      // Verify color cues: positive (green for Chequing & Visa), negative (red for LOC)
      const positiveChequing = screen.getByText('$950.00');
      expect(positiveChequing).toHaveClass('text-emerald-600');

      const negativeLoc = screen.getByText('-$10,500.00');
      expect(negativeLoc).toHaveClass('text-destructive');
    });

    it('renders gracefully when parsedContent is empty or null', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={{}}
          changes={[]}
          accounts={sampleAccounts}
        />
      );

      expect(screen.getByTestId('simulation-card')).toBeInTheDocument();
      expect(
        screen.getByText('No account balances or floors were impacted by these actions.')
      ).toBeInTheDocument();
    });

    it('renders error banner when parsedContent contains an error and omits charts/collapsible', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={{ error: 'Critical simulation convergence failure' }}
          changes={[]}
        />
      );

      expect(
        screen.getByText('Critical simulation convergence failure')
      ).toBeInTheDocument();
      expect(screen.queryByText('30-Day Outlook')).not.toBeInTheDocument();
      expect(screen.queryByText(/View raw JSON/i)).not.toBeInTheDocument();
    });

    it('renders action descriptions for all 6 supported change types plus unknown type without crashing', () => {
      const allTypeChanges: any[] = [
        { type: 'skip_event', date: '2026-10-10', event_id: 'evt-car-loan' },
        { type: 'pause_event', from_date: '2026-10-01', to_date: '2026-10-31', event_id: 'evt-car-loan' },
        { type: 'move_event', from_date: '2026-10-05', to_date: '2026-10-25', event_id: 'evt-car-loan' },
        { type: 'set_amount', amount_cents: 60000, event_id: 'evt-car-loan' },
        { type: 'pay_debt', amount_cents: 100000, from_account_id: 'acc-chequing', card_id: 'acc-visa' },
        { type: 'add_one_time', amount_cents: 25000, from_account_id: 'acc-chequing', date: '2026-10-15' },
        { type: 'unsupported_custom_change', foo: 'bar' },
      ];

      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          parsedContent={{ diff: { affected_accounts: {} } }}
          changes={allTypeChanges}
          accounts={sampleAccounts}
          events={sampleEvents}
        />
      );

      expect(screen.getByText(/Skip Car Loan on 2026-10-10/i)).toBeInTheDocument();
      expect(screen.getByText(/Pause Car Loan from 2026-10-01 to 2026-10-31/i)).toBeInTheDocument();
      expect(screen.getByText(/Move Car Loan from 2026-10-05 to 2026-10-25/i)).toBeInTheDocument();
      expect(screen.getByText(/Set Car Loan to \$600/i)).toBeInTheDocument();
      expect(screen.getByText(/Pay \$1,000.00 to Platinum Visa from Primary Chequing/i)).toBeInTheDocument();
      expect(screen.getByText(/Add \$250.00 from Primary Chequing on 2026-10-15/i)).toBeInTheDocument();
    });
  });

  describe('3. Collapsible State Transitions & Clipboard Stress', () => {
    const basicDiff = {
      diff: {
        affected_accounts: {
          'acc-chequing': {
            name: 'Primary Chequing',
            lowest_balance_before: 500,
            lowest_balance_after: 950,
          },
        },
      },
    };

    it('executes clean open/close state machine toggles and rapid multi-toggle stress', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={basicDiff}
          changes={[]}
          accounts={sampleAccounts}
        />
      );

      const triggerBtn = screen.getByRole('button', { name: /View raw JSON/i });
      expect(triggerBtn).toBeInTheDocument();
      expect(screen.queryByText(/"lowest_balance_before": 500/)).not.toBeInTheDocument();

      // Open collapsible
      fireEvent.click(triggerBtn);
      expect(screen.getByRole('button', { name: /Hide raw JSON/i })).toBeInTheDocument();
      expect(screen.getByText(/"lowest_balance_before": 500/)).toBeInTheDocument();

      // Close collapsible
      fireEvent.click(triggerBtn);
      expect(screen.getByRole('button', { name: /View raw JSON/i })).toBeInTheDocument();

      // Rapid multi-toggle stress (6 clicks)
      for (let i = 0; i < 6; i++) {
        fireEvent.click(triggerBtn);
      }
      // After 6 additional clicks, state should be back to closed
      expect(screen.getByRole('button', { name: /View raw JSON/i })).toBeInTheDocument();
    });

    it('interacts with clipboard, supports timer reversion to "Copy", and handles clipboard errors', async () => {
      vi.useFakeTimers();

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={basicDiff}
          changes={[]}
          accounts={sampleAccounts}
        />
      );

      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      expect(copyBtn).toHaveTextContent('Copy');

      // Click copy
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
      const copiedStr = (navigator.clipboard.writeText as any).mock.calls[0][0];
      const parsed = JSON.parse(copiedStr);
      expect(parsed.tool).toBe('simulate');
      expect(parsed.diff.affected_accounts['acc-chequing']).toBeDefined();

      // UI state switches to "Copied"
      expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument();

      // Fast-forward 2000ms
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Reverts to "Copy"
      expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    });

    it('gracefully handles missing clipboard API (e.g. non-secure browser context)', async () => {
      // Set clipboard to undefined
      Object.assign(navigator, { clipboard: undefined });

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={basicDiff}
          changes={[]}
          accounts={sampleAccounts}
        />
      );

      const copyBtn = screen.getByRole('button', { name: /Copy/i });

      // Should not throw
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument();
    });
  });

  describe('4. Apply to Plan, Toast 10s Window, and Full Undo Rollback Cycle', () => {
    it('executes atomic apply -> 10s toast -> undo rollback -> re-apply cycle', async () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');
      const toastInfoSpy = vi.spyOn(toast, 'info');

      const proposalChanges: BlueprintChange[] = [
        {
          type: 'set_amount',
          event_id: 'evt-car-loan',
          amount_cents: 20000, // Change from 450 to 200
        },
      ];

      const proposalPayload = {
        diff: {
          affected_accounts: {
            'acc-chequing': {
              name: 'Primary Chequing',
              lowest_balance_before: 500,
              lowest_balance_after: 750,
            },
          },
        },
      };

      render(
        <>
          <Toaster />
          <SimulationCard
            toolName="propose_blueprint_changes"
            proposalId="p-challenger-1"
            parsedContent={proposalPayload}
            changes={proposalChanges}
            accounts={sampleAccounts}
            events={sampleEvents}
          />
        </>
      );

      // Verify initial pending buttons
      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      expect(applyBtn).toBeInTheDocument();
      expect(rejectBtn).toBeInTheDocument();

      // 1. Click "Apply to Plan"
      act(() => {
        fireEvent.click(applyBtn);
      });

      // Verify store was updated: evt-car-loan amount changed from 450 to 200
      const storeStateAfterApply = usePlannerStore.getState();
      const updatedEvent = storeStateAfterApply.events.find((e) => e.id === 'evt-car-loan');
      expect(updatedEvent?.amount).toBe(200);

      // Verify UI state changed to "Applied to plan"
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();

      // Verify toast was fired with 10s duration and Undo action
      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      const toastCall = toastSuccessSpy.mock.calls[0];
      expect(toastCall[0]).toContain('Applied 1 change(s) to plan');
      const toastOptions = toastCall[1] as any;
      expect(toastOptions.duration).toBe(10000);
      expect(toastOptions.action).toBeDefined();
      expect(toastOptions.action.label).toBe('Undo');

      // 2. Click "Undo" on the toast action
      act(() => {
        toastOptions.action.onClick();
      });

      // Verify store state is reverted back to original: evt-car-loan amount is 450
      const storeStateAfterUndo = usePlannerStore.getState();
      const revertedEvent = storeStateAfterUndo.events.find((e) => e.id === 'evt-car-loan');
      expect(revertedEvent?.amount).toBe(450);

      // Verify UI reverted back to pending buttons
      expect(screen.getByRole('button', { name: /Apply to Plan/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
      expect(screen.queryByText('Changes successfully applied to plan')).not.toBeInTheDocument();

      // Verify undo info toast was emitted
      expect(toastInfoSpy).toHaveBeenCalledWith('Plan changes undone', { duration: 3000 });

      // 3. Re-apply again
      const reApplyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      act(() => {
        fireEvent.click(reApplyBtn);
      });

      const storeStateReapplied = usePlannerStore.getState();
      expect(storeStateReapplied.events.find((e) => e.id === 'evt-car-loan')?.amount).toBe(200);
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
    });

    it('rejects proposal cleanly via React state without legacy DOM mutation hacks', () => {
      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          proposalId="p-challenger-2"
          parsedContent={{ diff: { affected_accounts: {} } }}
          changes={[]}
          accounts={sampleAccounts}
          events={sampleEvents}
        />
      );

      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      act(() => {
        fireEvent.click(rejectBtn);
      });

      // Verify status badge and label
      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check

      // Card remains in DOM and visible (no DOM style.display = 'none')
      const card = screen.getByTestId('simulation-card');
      expect(card).toBeInTheDocument();
      expect(card).not.toHaveStyle({ display: 'none' });
    });
  });
});

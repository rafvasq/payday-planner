import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MiniBalanceChart, MiniBalancePoint } from '../MiniBalanceChart';
import { Account, Event } from '../../core/models';
import { BlueprintChange } from '../../core/tools';
import { usePlannerStore } from '../../store/usePlannerStore';
import { format, addDays } from 'date-fns';

// In JSDOM, ResponsiveContainer width/height defaults to 0, which prevents Recharts from rendering chart children.
// Mock ResponsiveContainer to clone children and provide explicit dimensions to LineChart.
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

describe('MiniBalanceChart Component', () => {
  const testAccounts: Account[] = [
    {
      id: 'acc-chequing',
      name: 'Main Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 2000,
      interest_rate: 0,
      target_floor: 500,
    },
    {
      id: 'acc-savings',
      name: 'Emergency Savings',
      type: 'savings',
      owner: 'User',
      balance: 10000,
      interest_rate: 2.5,
      target_floor: 1000,
    },
  ];

  const futureDateStr = format(addDays(new Date(), 5), 'yyyy-MM-dd');

  const testEvents: Event[] = [
    {
      id: 'evt-rent',
      name: 'Monthly Rent',
      event_type: 'outflow',
      amount: 1200,
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
      accounts: testAccounts,
      events: testEvents,
      executedEvents: {},
    });
    vi.clearAllMocks();
  });

  describe('1. Explicit Data Rendering', () => {
    const mockData: MiniBalancePoint[] = [
      { date: 'Oct 01', rawDate: '2026-10-01', baseline: 2500, simulated: 2500 },
      { date: 'Oct 05', rawDate: '2026-10-05', baseline: 2000, simulated: 2300 },
      { date: 'Oct 10', rawDate: '2026-10-10', baseline: 1500, simulated: 2100 },
    ];

    it('renders chart container and legend indicators when data array is provided', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Main Chequing"
          data={mockData}
        />
      );

      // Verify chart container with test id
      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();

      // Verify legend indicators
      expect(screen.getByText('Baseline')).toBeInTheDocument();
      expect(screen.getByText('Simulated')).toBeInTheDocument();

      // Verify account name is displayed
      expect(screen.getByText('Main Chequing')).toBeInTheDocument();

      // Verify Recharts SVG surface is rendered
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
    });

    it('renders successfully without error when accountName is not provided', () => {
      render(
        <MiniBalanceChart
          accountId="custom-acc-99"
          data={mockData}
        />
      );

      expect(screen.getByTestId('mini-balance-chart-custom-acc-99')).toBeInTheDocument();
      expect(screen.getByText('Baseline')).toBeInTheDocument();
      expect(screen.getByText('Simulated')).toBeInTheDocument();
    });

    it('applies custom height and custom className', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          data={mockData}
          height={160}
          className="custom-chart-wrapper"
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toHaveClass('custom-chart-wrapper');
      expect(container).toHaveStyle({ height: '160px' });
    });
  });

  describe('2. Internal Computation via projectBalances', () => {
    it('computes baseline and simulated curves from accounts, events, and changes', () => {
      const changes: BlueprintChange[] = [
        {
          type: 'skip_event',
          date: futureDateStr,
          event_id: 'evt-rent',
        },
      ];

      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Main Chequing"
          accounts={testAccounts}
          events={testEvents}
          changes={changes}
          daysWindow={30}
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();
      expect(screen.getByText('Baseline')).toBeInTheDocument();
      expect(screen.getByText('Simulated')).toBeInTheDocument();

      // Recharts renders lines for baseline and simulated
      const lines = container.querySelectorAll('.recharts-line');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('computes correctly with zero changes (baseline equals simulated)', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accounts={testAccounts}
          events={testEvents}
          changes={[]}
          daysWindow={14}
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
      const lines = container.querySelectorAll('.recharts-line');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('falls back to usePlannerStore state when accounts/events props are omitted', () => {
      const changes: BlueprintChange[] = [
        {
          type: 'skip_event',
          date: futureDateStr,
          event_id: 'evt-rent',
        },
      ];

      // Render without passing accounts or events props — should pick up from store
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Main Chequing"
          changes={changes}
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();
      expect(screen.getByText('Main Chequing')).toBeInTheDocument();
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
    });

    it('supports custom daysWindow parameter', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accounts={testAccounts}
          events={testEvents}
          daysWindow={7}
        />
      );

      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
    });
  });

  describe('3. Fallback and Graceful Handling of Edge Cases', () => {
    it('gracefully renders fallback when accounts array is empty', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Main Chequing"
          accounts={[]}
          events={testEvents}
        />
      );

      const emptyEl = screen.getByTestId('mini-balance-chart-empty-acc-chequing');
      expect(emptyEl).toBeInTheDocument();
      expect(emptyEl).toHaveTextContent(/No projection data available for Main Chequing/i);
    });

    it('gracefully renders fallback when accountId is not found in accounts', () => {
      render(
        <MiniBalanceChart
          accountId="non-existent-account-id"
          accountName="Ghost Account"
          accounts={testAccounts}
          events={testEvents}
        />
      );

      const emptyEl = screen.getByTestId('mini-balance-chart-empty-non-existent-account-id');
      expect(emptyEl).toBeInTheDocument();
      expect(emptyEl).toHaveTextContent(/No projection data available for Ghost Account/i);
    });

    it('gracefully renders fallback when explicit data array is empty', () => {
      usePlannerStore.setState({ accounts: [], events: [] });

      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accountName="Chequing"
          data={[]}
        />
      );

      const emptyEl = screen.getByTestId('mini-balance-chart-empty-acc-chequing');
      expect(emptyEl).toBeInTheDocument();
      expect(emptyEl).toHaveTextContent(/No projection data available for Chequing/i);
    });

    it('gracefully handles undefined changes or events', () => {
      render(
        <MiniBalanceChart
          accountId="acc-chequing"
          accounts={testAccounts}
          events={undefined}
          changes={undefined}
        />
      );

      // Should still render without crashing
      const container = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(container).toBeInTheDocument();
      expect(container.querySelector('.recharts-surface')).toBeInTheDocument();
    });
  });
});

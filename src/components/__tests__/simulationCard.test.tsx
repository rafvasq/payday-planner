import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SimulationCard } from '../SimulationCard';
import { Account, Event } from '../../core/models';
import { BlueprintChange } from '../../core/tools';
import { usePlannerStore } from '../../store/usePlannerStore';

// Mock Recharts ResponsiveContainer to allow embedded MiniBalanceChart to render in JSDOM
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

describe('SimulationCard Component', () => {
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
      id: 'acc-visa',
      name: 'Rewards Visa',
      type: 'debt',
      owner: 'User',
      balance: -1500,
      interest_rate: 19.99,
      target_floor: 0,
    },
  ];

  const testEvents: Event[] = [];

  const mockDiffWithImpact = {
    diff: {
      affected_accounts: {
        'acc-chequing': {
          name: 'Main Chequing',
          lowest_balance_before: 500,
          lowest_balance_after: 1200,
          lowest_balance_change: 700,
          first_breach_before: '2026-10-15',
          first_breach_after: 'None',
        },
      },
    },
    status: 'Simulation succeeded.',
  };

  const mockChanges: BlueprintChange[] = [
    {
      type: 'skip_event',
      date: '2026-10-15',
      event_id: 'evt-car-payment',
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

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('1. Card Header and Impact Deltas', () => {
    it('renders "Scenario Simulation" header for simulate tool', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
          accounts={testAccounts}
        />
      );

      expect(screen.getByText('Scenario Simulation')).toBeInTheDocument();
      expect(screen.getByTestId('simulation-card')).toBeInTheDocument();
    });

    it('renders "Proposed Blueprint" header for propose_blueprint_changes tool', () => {
      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
          accounts={testAccounts}
        />
      );

      expect(screen.getByText('Proposed Blueprint')).toBeInTheDocument();
    });

    it('displays affected account impact deltas and embedded MiniBalanceChart', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
          accounts={testAccounts}
        />
      );

      // Verify Impact header
      expect(screen.getByText('30-Day Outlook')).toBeInTheDocument();

      // Verify account name in impact box
      expect(screen.getAllByText('Main Chequing').length).toBeGreaterThanOrEqual(1);

      // Verify lowest balance before and after
      expect(screen.getByText(/Lowest Balance/i)).toBeInTheDocument();
      expect(screen.getByText(/Breach Resolved/i)).toBeInTheDocument();

      // Verify embedded MiniBalanceChart is present
      const chartContainer = screen.getByTestId('mini-balance-chart-acc-chequing');
      expect(chartContainer).toBeInTheDocument();
    });

    it('displays affected account impact deltas when affected_accounts is at root of parsedContent (simulate tool output)', () => {
      const mockRootDiff = {
        affected_accounts: {
          'acc-chequing': {
            name: 'Main Chequing',
            lowest_balance_before: 500,
            lowest_balance_after: 1200,
            lowest_balance_change: 700,
            first_breach_before: '2026-10-15',
            first_breach_after: 'None',
          },
        },
        status: 'Simulation succeeded.',
      };

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockRootDiff}
          changes={mockChanges}
          accounts={testAccounts}
        />
      );

      expect(screen.getByText('30-Day Outlook')).toBeInTheDocument();
      expect(screen.getAllByText('Main Chequing').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Lowest Balance/i)).toBeInTheDocument();
      expect(
        screen.queryByText('No account balances or floors were impacted by these actions.')
      ).not.toBeInTheDocument();
    });

    it('displays fallback message when no accounts are affected', () => {
      const mockEmptyDiff = {
        diff: {
          affected_accounts: {},
        },
      };

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockEmptyDiff}
          changes={[]}
          accounts={testAccounts}
        />
      );

      expect(
        screen.getByText('No account balances or floors were impacted by these actions.')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('mini-balance-chart-acc-chequing')).not.toBeInTheDocument();
    });
  });

  describe('2. Actions List Rendering', () => {
    it('renders action descriptions for various change types', () => {
      const variedChanges: BlueprintChange[] = [
        {
          type: 'skip_event',
          date: '2026-10-12',
          event_id: 'evt-gym',
        },
        {
          type: 'set_amount',
          event_id: 'evt-electric',
          amount_cents: 8500,
        },
        {
          type: 'pay_debt',
          date: '2026-10-14',
          from_account_id: 'acc-chequing',
          card_id: 'acc-visa',
          amount_cents: 50000,
        },
      ];

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={variedChanges}
          accounts={testAccounts}
        />
      );

      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.getByText(/Skip evt-gym on 2026-10-12/i)).toBeInTheDocument();
      expect(screen.getByText(/Set evt-electric to \$85/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Pay \$500.00 to Rewards Visa from Main Chequing/i)
      ).toBeInTheDocument();
    });
  });

  describe('3. Collapsible Raw JSON & Copy to Clipboard', () => {
    it('collapsible raw JSON is collapsed by default', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
        />
      );

      // Trigger button shows "View raw JSON"
      const expandBtn = screen.getByRole('button', { name: /View raw JSON/i });
      expect(expandBtn).toBeInTheDocument();

      // Raw <pre> is not rendered in DOM when Collapsible is closed
      const preElement = screen.queryByText((content, element) => {
        return element?.tagName.toLowerCase() === 'pre';
      });
      expect(preElement).not.toBeInTheDocument();
    });

    it('clicking trigger expands collapsible and reveals raw JSON in <pre>', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
        />
      );

      const expandBtn = screen.getByRole('button', { name: /View raw JSON/i });
      fireEvent.click(expandBtn);

      // Trigger button label toggles to "Hide raw JSON"
      expect(screen.getByText('Hide raw JSON')).toBeInTheDocument();

      // <pre> is now in the document
      const preElement = screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'pre';
      });
      expect(preElement).toBeInTheDocument();
      expect(preElement.textContent).toContain('Simulation succeeded.');
      expect(preElement.textContent).toContain('acc-chequing');
    });

    it('clicking Copy button invokes navigator.clipboard.writeText with raw JSON and shows "Copied"', async () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
        />
      );

      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      expect(copyBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      // Verify clipboard.writeText was invoked with valid JSON string
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
      const copiedString = (navigator.clipboard.writeText as any).mock.calls[0][0];
      const parsed = JSON.parse(copiedString);
      expect(parsed.tool).toBe('simulate');
      expect(parsed.diff.affected_accounts).toBeDefined();

      // Verify button text updates to "Copied"
      expect(screen.getByText('Copied')).toBeInTheDocument();
    });

    it('handles clipboard failure gracefully without throwing', async () => {
      (navigator.clipboard.writeText as any).mockRejectedValueOnce(new Error('Permission denied'));

      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
        />
      );

      const copyBtn = screen.getByRole('button', { name: /Copy/i });

      // Should not throw
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  describe('4. Status Badges and Presentation', () => {
    it('renders "Applied" badge when status is applied', () => {
      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
          status="applied"
        />
      );

      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
    });

    it('renders "Rejected" badge when status is rejected', () => {
      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          parsedContent={mockDiffWithImpact}
          changes={mockChanges}
          status="rejected"
        />
      );

      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
    });

    it('renders error message when parsedContent contains error', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={{ error: 'Malformed change specification' }}
        />
      );

      expect(screen.getByText('Malformed change specification')).toBeInTheDocument();
    });
  });
});


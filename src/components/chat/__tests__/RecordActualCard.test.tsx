import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordActualCard } from '../RecordActualCard';
import { ActualView } from '../../../core/ai/toolkit';

describe('RecordActualCard: Milestone 3 Ask-First Transaction Flow', () => {
  const sampleActualView: ActualView = {
    description: 'You transferred $3,200.00 from R Chequing to EQ Hub.',
    transactions: [
      {
        from_account_id: 'chq_r',
        to_account_id: 'eq_hub',
        amount_cents: 320000,
        date: '2026-10-09',
      },
    ],
    transaction_descriptions: ['Transfer $3,200.00 from R Chequing to EQ Hub'],
    adjustments: [
      {
        type: 'adjust_balance',
        account_id: 'chq_r',
        delta_cents: -320000,
        note: 'Transferred out',
      },
      {
        type: 'adjust_balance',
        account_id: 'eq_hub',
        delta_cents: 320000,
        note: 'Transferred in',
      },
    ],
    accounts: [
      {
        id: 'chq_r',
        name: 'R Chequing',
        before_cents: 435722,
        after_cents: 115722,
      },
      {
        id: 'eq_hub',
        name: 'EQ Hub',
        before_cents: 248654,
        after_cents: 568654,
      },
    ],
    risks: ['R Chequing would project -$1,211.92 on Oct 21 (overdraft).'],
  };

  const sampleWithoutRisks: ActualView = {
    ...sampleActualView,
    risks: [],
  };

  const sampleWithOverdraftAccount: ActualView = {
    ...sampleActualView,
    accounts: [
      {
        id: 'chq_r',
        name: 'R Chequing',
        before_cents: 100000,
        after_cents: -50000, // -$500.00 overdraft
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Transaction Details and Layout Rendering', () => {
    it('renders the card header with title and transaction description', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      expect(screen.getByTestId('record-actual-card')).toBeInTheDocument();
      expect(screen.getByText('Recorded Transaction')).toBeInTheDocument();
      expect(
        screen.getByText('You transferred $3,200.00 from R Chequing to EQ Hub.')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/How would you like to reflect this transaction in your plan\?/i)
      ).toBeInTheDocument();
    });

    it('renders transaction bullet item descriptions if provided', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      expect(
        screen.getByText('Transfer $3,200.00 from R Chequing to EQ Hub')
      ).toBeInTheDocument();
    });

    it('displays Action Required badge when status is pending or default', () => {
      render(<RecordActualCard actualView={sampleActualView} status="pending" />);

      expect(screen.getByText('Action Required')).toBeInTheDocument();
    });

    it('gracefully handles missing transaction_descriptions and accounts', () => {
      const minimalView: ActualView = {
        description: 'Single adjustment',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        accounts: [],
        risks: [],
      };

      render(<RecordActualCard actualView={minimalView} />);

      expect(screen.getByText('Single adjustment')).toBeInTheDocument();
      expect(screen.queryByTestId('record-actual-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('risk-callout')).not.toBeInTheDocument();
    });
  });

  describe('2. Before/After Balances Table', () => {
    it('renders the balance preview table with correct headers', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      const table = screen.getByTestId('record-actual-table');
      expect(table).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
      expect(screen.getByText('Change')).toBeInTheDocument();
    });

    it('displays exact before/after balances and delta changes formatted in CAD', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      // Account names
      expect(screen.getByText('R Chequing')).toBeInTheDocument();
      expect(screen.getByText('EQ Hub')).toBeInTheDocument();

      // Before balances
      expect(screen.getByText('$4,357.22')).toBeInTheDocument();
      expect(screen.getByText('$2,486.54')).toBeInTheDocument();

      // After balances
      expect(screen.getByText('$1,157.22')).toBeInTheDocument();
      expect(screen.getByText('$5,686.54')).toBeInTheDocument();

      // Delta changes with signs
      expect(screen.getByText('-$3,200.00')).toBeInTheDocument();
      expect(screen.getByText('+$3,200.00')).toBeInTheDocument();
    });

    it('applies destructive styling when after-balance is negative (overdraft)', () => {
      render(<RecordActualCard actualView={sampleWithOverdraftAccount} />);

      const afterBalanceCell = screen.getByText('-$500.00');
      expect(afterBalanceCell.className).toMatch(/text-destructive/);
    });
  });

  describe('3. New-Risk Alert Callouts', () => {
    it('renders new-risk warning callout when risks array contains items', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      const riskCallout = screen.getByTestId('risk-callout');
      expect(riskCallout).toBeInTheDocument();
      expect(screen.getByText('New Risk Warning')).toBeInTheDocument();
      expect(
        screen.getByText('R Chequing would project -$1,211.92 on Oct 21 (overdraft).')
      ).toBeInTheDocument();
    });

    it('does not render risk alert callout when risks array is empty', () => {
      render(<RecordActualCard actualView={sampleWithoutRisks} />);

      expect(screen.queryByTestId('risk-callout')).not.toBeInTheDocument();
    });
  });

  describe('4. Three Explicit User Choices', () => {
    it('renders all three choice buttons in pending state', () => {
      render(<RecordActualCard actualView={sampleActualView} status="pending" />);

      expect(screen.getByTestId('choice-update-balances')).toHaveTextContent('Update my balances');
      expect(screen.getByTestId('choice-treat-as-landed')).toHaveTextContent(
        "Treat as landed (don't save)"
      );
      expect(screen.getByTestId('choice-already-in-balances')).toHaveTextContent(
        'Already in my balances'
      );
    });

    it('clicking Choice 1 "Update my balances" calls onChoice and transitions to applied', () => {
      const handleChoice = vi.fn();
      render(<RecordActualCard actualView={sampleActualView} onChoice={handleChoice} />);

      const btn = screen.getByTestId('choice-update-balances');
      fireEvent.click(btn);

      expect(handleChoice).toHaveBeenCalledTimes(1);
      expect(handleChoice).toHaveBeenCalledWith('update_balances');

      // Header badge updates
      expect(screen.getByText('Balances Updated')).toBeInTheDocument();

      // Footer updates to applied state message
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();

      // Choice buttons are no longer rendered
      expect(screen.queryByTestId('choice-update-balances')).not.toBeInTheDocument();
    });

    it('clicking Choice 2 "Treat as landed (don\'t save)" calls onChoice and transitions to assumed', () => {
      const handleChoice = vi.fn();
      render(<RecordActualCard actualView={sampleActualView} onChoice={handleChoice} />);

      const btn = screen.getByTestId('choice-treat-as-landed');
      fireEvent.click(btn);

      expect(handleChoice).toHaveBeenCalledTimes(1);
      expect(handleChoice).toHaveBeenCalledWith('treat_as_landed');

      // Header badge updates
      expect(screen.getByText('Assumed Landed')).toBeInTheDocument();

      // Footer updates to assumed state message
      expect(
        screen.getByText('Added to Scenario Tray as active assumption')
      ).toBeInTheDocument();

      // Choice buttons are no longer rendered
      expect(screen.queryByTestId('choice-treat-as-landed')).not.toBeInTheDocument();
    });

    it('clicking Choice 3 "Already in my balances" calls onChoice and transitions to acknowledged', () => {
      const handleChoice = vi.fn();
      render(<RecordActualCard actualView={sampleActualView} onChoice={handleChoice} />);

      const btn = screen.getByTestId('choice-already-in-balances');
      fireEvent.click(btn);

      expect(handleChoice).toHaveBeenCalledTimes(1);
      expect(handleChoice).toHaveBeenCalledWith('already_in_balances');

      // Header badge updates
      expect(screen.getByText('Acknowledged')).toBeInTheDocument();

      // Footer updates to acknowledged state message
      expect(
        screen.getByText('Acknowledged: already reflected in balances')
      ).toBeInTheDocument();

      // Choice buttons are no longer rendered
      expect(screen.queryByTestId('choice-already-in-balances')).not.toBeInTheDocument();
    });
  });

  describe('5. Status Persistence and Controlled Prop Behavior', () => {
    it('renders locked applied state when status="applied" is passed as prop', () => {
      render(<RecordActualCard actualView={sampleActualView} status="applied" />);

      expect(screen.getByText('Balances Updated')).toBeInTheDocument();
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();
      expect(screen.queryByTestId('choice-update-balances')).not.toBeInTheDocument();
    });

    it('renders locked assumed state when status="assumed" is passed as prop', () => {
      render(<RecordActualCard actualView={sampleActualView} status="assumed" />);

      expect(screen.getByText('Assumed Landed')).toBeInTheDocument();
      expect(
        screen.getByText('Added to Scenario Tray as active assumption')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('choice-treat-as-landed')).not.toBeInTheDocument();
    });

    it('renders locked acknowledged state when status="acknowledged" is passed as prop', () => {
      render(<RecordActualCard actualView={sampleActualView} status="acknowledged" />);

      expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      expect(
        screen.getByText('Acknowledged: already reflected in balances')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('choice-already-in-balances')).not.toBeInTheDocument();
    });

    it('updates when prop status changes from pending to applied externally', () => {
      const { rerender } = render(
        <RecordActualCard actualView={sampleActualView} status="pending" />
      );

      expect(screen.getByTestId('choice-update-balances')).toBeInTheDocument();

      rerender(<RecordActualCard actualView={sampleActualView} status="applied" />);

      expect(screen.queryByTestId('choice-update-balances')).not.toBeInTheDocument();
      expect(screen.getByText('Balances Updated')).toBeInTheDocument();
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();
    });

    it('preserves user selection across component re-renders when parent does not override prop', () => {
      const { rerender } = render(
        <RecordActualCard actualView={sampleActualView} />
      );

      // User selects choice 2
      fireEvent.click(screen.getByTestId('choice-treat-as-landed'));
      expect(screen.getByText('Assumed Landed')).toBeInTheDocument();

      // Parent re-renders without specifying status
      rerender(<RecordActualCard actualView={sampleActualView} />);

      expect(screen.getByText('Assumed Landed')).toBeInTheDocument();
      expect(
        screen.getByText('Added to Scenario Tray as active assumption')
      ).toBeInTheDocument();
    });
  });
});

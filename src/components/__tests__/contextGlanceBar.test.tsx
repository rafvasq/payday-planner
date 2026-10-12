import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ContextGlanceBar } from '../ContextGlanceBar';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider } from '../../context/ChatContext';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Account, Event } from '../../core/models';
import { format, addDays } from 'date-fns';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([
      {
        provider_type: 'openai',
        provider_name: 'OpenAI',
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
      },
    ]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('ContextGlanceBar Component', () => {
  const today = new Date();
  const dateIn2Days = format(addDays(today, 2), 'yyyy-MM-dd');
  const dateIn5Days = format(addDays(today, 5), 'yyyy-MM-dd');
  const dateIn8Days = format(addDays(today, 8), 'yyyy-MM-dd');
  const dateIn20Days = format(addDays(today, 20), 'yyyy-MM-dd');

  const testAccounts: Account[] = [
    {
      id: 'acc-chequing',
      name: 'Main Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 3200,
      interest_rate: 0,
      target_floor: 1000,
    },
    {
      id: 'acc-savings',
      name: 'High Interest Savings',
      type: 'savings',
      owner: 'User',
      balance: 15000,
      interest_rate: 3.5,
      target_floor: 5000,
    },
    {
      id: 'acc-investment',
      name: 'TFSA Investment',
      type: 'investment',
      owner: 'User',
      balance: 8500,
      interest_rate: 5.0,
      target_floor: 2000,
    },
    {
      id: 'acc-credit',
      name: 'Visa Infinite',
      type: 'debt',
      owner: 'User',
      balance: 1200,
      interest_rate: 19.99,
      target_floor: 0,
    },
  ];

  const testEvents: Event[] = [
    {
      id: 'evt-hydro',
      name: 'Hydro Bill',
      event_type: 'outflow',
      amount: 145.5,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: dateIn2Days,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-payday',
      name: 'Biweekly Paycheck',
      event_type: 'inflow',
      amount: 2850,
      from_account_id: null,
      to_account_id: 'acc-chequing',
      frequency: 'one-time',
      anchor_date: dateIn5Days,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-internet',
      name: 'Fibre Internet',
      event_type: 'outflow',
      amount: 89.99,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: dateIn8Days,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-distant-bill',
      name: 'Car Insurance Next Month',
      event_type: 'outflow',
      amount: 210,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: dateIn20Days,
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
    useSettingsStore.setState({
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  describe('1. Account Balance & Liquid Aggregation', () => {
    it('renders total liquid balance correctly (sum of chequing, savings, investment)', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      // Total liquid = 3200 (chequing) + 15000 (savings) + 8500 (investment) = 26,700
      // Visa debt (1200) is excluded from liquid assets
      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$26,700.00')).toBeInTheDocument();
    });

    it('renders top liquid account chips in compact view sorted by balance descending', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      const chips = screen.getAllByTestId('glance-account-chip');
      // Compact view shows up to 3 liquid accounts
      expect(chips).toHaveLength(3);

      // 1st: High Interest Savings ($15,000.00)
      expect(chips[0]).toHaveTextContent('High Interest Savings:');
      expect(chips[0]).toHaveTextContent('$15,000.00');

      // 2nd: TFSA Investment ($8,500.00)
      expect(chips[1]).toHaveTextContent('TFSA Investment:');
      expect(chips[1]).toHaveTextContent('$8,500.00');

      // 3rd: Main Chequing ($3,200.00)
      expect(chips[2]).toHaveTextContent('Main Chequing:');
      expect(chips[2]).toHaveTextContent('$3,200.00');
    });

    it('excludes inactive accounts from liquid balance and compact chips', () => {
      const accountsWithInactive: Account[] = [
        ...testAccounts,
        {
          id: 'acc-old',
          name: 'Old Savings',
          type: 'savings',
          owner: 'User',
          balance: 50000,
          interest_rate: 1.0,
          active: false,
        } as any,
      ];

      render(<ContextGlanceBar accounts={accountsWithInactive} events={testEvents} />);

      // Still 26,700.00 because Old Savings is inactive
      expect(screen.getByText('$26,700.00')).toBeInTheDocument();
      expect(screen.queryByText(/Old Savings/i)).not.toBeInTheDocument();
    });

    it('handles negative overdraft balances in liquid aggregation', () => {
      const accountsWithOverdraft: Account[] = [
        {
          id: 'acc-overdraft',
          name: 'Overdrawn Chequing',
          type: 'chequing',
          owner: 'User',
          balance: -350.5,
          interest_rate: 0,
        },
        {
          id: 'acc-emergency',
          name: 'Emergency Savings',
          type: 'savings',
          owner: 'User',
          balance: 1000,
          interest_rate: 2,
        },
      ];

      render(<ContextGlanceBar accounts={accountsWithOverdraft} events={[]} />);

      // Total liquid = 1000 - 350.5 = 649.50
      expect(screen.getByText('$649.50')).toBeInTheDocument();
      expect(screen.getByText('Overdrawn Chequing:')).toBeInTheDocument();
      expect(screen.getByText('-$350.50')).toBeInTheDocument();
    });

    it('applies custom className passed via props', () => {
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          className="custom-test-class"
        />
      );

      const bar = screen.getByTestId('context-glance-bar');
      expect(bar).toHaveClass('custom-test-class');
    });
  });

  describe('2. Upcoming Bills & Paydays (Next 7-14 Days)', () => {
    it('renders upcoming events formatted with date, name, and amount from buildCalendar', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      const eventChips = screen.getAllByTestId('glance-event-chip');
      // Compact view renders up to 2 upcoming events
      expect(eventChips).toHaveLength(2);

      // Event 1: Hydro Bill ($145.50 outflow)
      expect(eventChips[0]).toHaveTextContent('Hydro Bill');
      expect(eventChips[0]).toHaveTextContent('-$145.50');

      // Event 2: Biweekly Paycheck ($2,850.00 inflow)
      expect(eventChips[1]).toHaveTextContent('Biweekly Paycheck');
      expect(eventChips[1]).toHaveTextContent('+$2,850.00');
    });

    it('filters out events outside the 14-day window in compact view', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      // Car Insurance Next Month is 20 days out and should not be in compact strip
      expect(screen.queryByText(/Car Insurance Next Month/i)).not.toBeInTheDocument();
    });

    it('excludes inactive events from upcoming occurrences', () => {
      const eventsWithInactive: Event[] = [
        ...testEvents,
        {
          id: 'evt-cancelled',
          name: 'Cancelled Gym Membership',
          event_type: 'outflow',
          amount: 60,
          from_account_id: 'acc-chequing',
          to_account_id: null,
          frequency: 'one-time',
          anchor_date: dateIn2Days,
          active: false,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      render(<ContextGlanceBar accounts={testAccounts} events={eventsWithInactive} />);

      expect(screen.queryByText(/Cancelled Gym Membership/i)).not.toBeInTheDocument();
    });

    it('renders separator | between account chips and event chips in compact mode', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      expect(screen.getByText('|')).toBeInTheDocument();
    });
  });

  describe('3. Expand / Collapse Toggle', () => {
    it('defaults to compact strip and expands into mini-dashboard on toggle click', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={testEvents} />);

      const toggleBtn = screen.getByTestId('glance-expand-toggle');
      expect(toggleBtn).toHaveAttribute('title', 'Expand context glance');

      // In compact mode, expanded sections are not visible
      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();
      expect(screen.queryByText('Upcoming (Next 14 Days)')).not.toBeInTheDocument();
      expect(screen.queryByText('Suggestions:')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(toggleBtn);

      expect(toggleBtn).toHaveAttribute('title', 'Collapse context glance');
      expect(screen.getByText('Accounts & Target Floors')).toBeInTheDocument();
      expect(screen.getByText('Upcoming (Next 14 Days)')).toBeInTheDocument();
      expect(screen.getByText('Suggestions:')).toBeInTheDocument();

      // Click again to collapse
      fireEvent.click(toggleBtn);

      expect(toggleBtn).toHaveAttribute('title', 'Expand context glance');
      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();
    });

    it('supports controlled expansion via isExpanded and onToggleExpand props', () => {
      const handleToggle = vi.fn();
      const { rerender } = render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          isExpanded={false}
          onToggleExpand={handleToggle}
        />
      );

      const toggleBtn = screen.getByTestId('glance-expand-toggle');
      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();

      fireEvent.click(toggleBtn);
      expect(handleToggle).toHaveBeenCalledTimes(1);

      // Component remains collapsed until parent rerenders with isExpanded={true}
      rerender(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          isExpanded={true}
          onToggleExpand={handleToggle}
        />
      );

      expect(screen.getByText('Accounts & Target Floors')).toBeInTheDocument();
    });
  });

  describe('4. Expanded Mini-Dashboard Details', () => {
    it('renders all accounts with target floors and highlights accounts under floor', () => {
      const accountsWithUnderFloor: Account[] = [
        ...testAccounts,
        {
          id: 'acc-low',
          name: 'Low Emergency Fund',
          type: 'savings',
          owner: 'User',
          balance: 400,
          interest_rate: 1.5,
          target_floor: 850,
        },
      ];

      render(
        <ContextGlanceBar
          accounts={accountsWithUnderFloor}
          events={testEvents}
          isExpanded={true}
        />
      );

      // All active accounts appear in expanded account list
      expect(screen.getByText('Low Emergency Fund')).toBeInTheDocument();
      expect(screen.getByText('Visa Infinite')).toBeInTheDocument();

      // Specific target floor is shown
      expect(screen.getByText('Floor: $850.00')).toBeInTheDocument();
    });

    it('renders all upcoming occurrences up to 6 in expanded mode', () => {
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          isExpanded={true}
        />
      );

      // In expanded mode, Fibre Internet (the 3rd event) is now visible
      expect(screen.getByText('Fibre Internet')).toBeInTheDocument();
      expect(screen.getByText('-$89.99')).toBeInTheDocument();
    });
  });

  describe('5. Interactive Prompts & Quick Actions', () => {
    it('clicking compact account chip calls onSelectPrompt with balance outlook prompt', () => {
      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          onSelectPrompt={handleSelect}
        />
      );

      const chips = screen.getAllByTestId('glance-account-chip');
      fireEvent.click(chips[0]); // High Interest Savings

      expect(handleSelect).toHaveBeenCalledWith(
        'What is my balance outlook for High Interest Savings?'
      );
    });

    it('clicking outflow event chip calls onSelectPrompt with afford check prompt', () => {
      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          onSelectPrompt={handleSelect}
        />
      );

      const eventChips = screen.getAllByTestId('glance-event-chip');
      fireEvent.click(eventChips[0]); // Hydro Bill ($145.50)

      expect(handleSelect).toHaveBeenCalledWith(
        `Can I afford Hydro Bill ($145.50) on ${dateIn2Days}?`
      );
    });

    it('clicking inflow event chip calls onSelectPrompt with budget impact prompt', () => {
      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          onSelectPrompt={handleSelect}
        />
      );

      const eventChips = screen.getAllByTestId('glance-event-chip');
      fireEvent.click(eventChips[1]); // Biweekly Paycheck ($2,850.00)

      expect(handleSelect).toHaveBeenCalledWith(
        `How will Biweekly Paycheck ($2,850.00) on ${dateIn5Days} affect my budget?`
      );
    });

    it('clicking quick-action suggestion chip calls onSelectPrompt with suggestion text', () => {
      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          isExpanded={true}
          onSelectPrompt={handleSelect}
        />
      );

      const suggestionButtons = screen.getAllByTestId('glance-quick-action-chip');
      expect(suggestionButtons.length).toBeGreaterThan(0);

      const weekendChip = suggestionButtons.find((btn) =>
        btn.textContent?.includes('Can I afford $200 this weekend?')
      );
      expect(weekendChip).toBeDefined();

      fireEvent.click(weekendChip!);
      expect(handleSelect).toHaveBeenCalledWith('Can I afford $200 this weekend?');
    });

    it('adapts suggestion chips when an upcoming bill exists', () => {
      render(
        <ContextGlanceBar
          accounts={testAccounts}
          events={testEvents}
          isExpanded={true}
        />
      );

      // Hydro Bill is the first upcoming outflow
      expect(
        screen.getByRole('button', { name: /What if I pay Hydro Bill early\?/i })
      ).toBeInTheDocument();
    });

    it('adapts suggestion chips when an account breaches target floor', () => {
      const breachedAccounts: Account[] = [
        {
          id: 'acc-breached',
          name: 'Breached Chequing',
          type: 'chequing',
          owner: 'User',
          balance: 200,
          target_floor: 500,
        },
      ];

      render(
        <ContextGlanceBar
          accounts={breachedAccounts}
          events={[]}
          isExpanded={true}
        />
      );

      expect(
        screen.getByRole('button', {
          name: /How can I bring Breached Chequing back above target floor\?/i,
        })
      ).toBeInTheDocument();
    });
  });

  describe('6. Fallback to Planner Store', () => {
    it('uses accounts and events from usePlannerStore when props are omitted', () => {
      render(<ContextGlanceBar />);

      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$26,700.00')).toBeInTheDocument();
      expect(screen.getAllByTestId('glance-account-chip')).toHaveLength(3);
    });
  });

  describe('7. Empty States & Graceful Fallbacks', () => {
    it('renders gracefully with empty accounts array without crashing', () => {
      render(<ContextGlanceBar accounts={[]} events={testEvents} />);

      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$0.00')).toBeInTheDocument();
      expect(screen.getByText('No accounts')).toBeInTheDocument();
    });

    it('renders empty message in expanded accounts column when accounts array is empty', () => {
      render(<ContextGlanceBar accounts={[]} events={testEvents} isExpanded={true} />);

      expect(screen.getByText('No active accounts found.')).toBeInTheDocument();
    });

    it('renders gracefully with empty events array without crashing', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={[]} />);

      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$26,700.00')).toBeInTheDocument();
      expect(screen.queryByTestId('glance-event-chip')).not.toBeInTheDocument();
    });

    it('renders empty message in expanded upcoming column when events array is empty', () => {
      render(<ContextGlanceBar accounts={testAccounts} events={[]} isExpanded={true} />);

      expect(
        screen.getByText('No upcoming bills or paydays in the next 14 days.')
      ).toBeInTheDocument();
    });

    it('handles both accounts and events empty without throwing', () => {
      expect(() => {
        render(<ContextGlanceBar accounts={[]} events={[]} isExpanded={true} />);
      }).not.toThrow();

      expect(screen.getByText('$0.00')).toBeInTheDocument();
      expect(screen.getByText('No active accounts found.')).toBeInTheDocument();
      expect(
        screen.getByText('No upcoming bills or paydays in the next 14 days.')
      ).toBeInTheDocument();
    });
  });

  describe('8. Adversarial & Edge Cases', () => {
    it('handles account and event names with special HTML and apostrophe characters', () => {
      const specialAccounts: Account[] = [
        {
          id: 'acc-special',
          name: "Bob & Alice's <Joint> Chequing",
          type: 'chequing',
          owner: 'User',
          balance: 1500,
        },
      ];
      const specialEvents: Event[] = [
        {
          id: 'evt-special',
          name: "Mom's Birthday & Dinner <Gift>",
          event_type: 'outflow',
          amount: 120,
          from_account_id: 'acc-special',
          to_account_id: null,
          frequency: 'one-time',
          anchor_date: dateIn2Days,
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={specialAccounts}
          events={specialEvents}
          onSelectPrompt={handleSelect}
        />
      );

      const accChip = screen.getByTestId('glance-account-chip');
      fireEvent.click(accChip);
      expect(handleSelect).toHaveBeenCalledWith(
        "What is my balance outlook for Bob & Alice's <Joint> Chequing?"
      );

      const evtChip = screen.getByTestId('glance-event-chip');
      fireEvent.click(evtChip);
      expect(handleSelect).toHaveBeenCalledWith(
        `Can I afford Mom's Birthday & Dinner <Gift> ($120.00) on ${dateIn2Days}?`
      );
    });

    it('handles non-liquid only accounts by displaying $0.00 liquid but listing in expanded view', () => {
      const debtAccounts: Account[] = [
        {
          id: 'acc-cc',
          name: 'Credit Card',
          type: 'debt',
          owner: 'User',
          balance: 3000,
        },
        {
          id: 'acc-mortgage',
          name: 'Home Mortgage',
          type: 'liability',
          owner: 'User',
          balance: 450000,
        },
      ];

      render(<ContextGlanceBar accounts={debtAccounts} events={[]} isExpanded={true} />);

      // Liquid balance is 0 because debt and liability are not liquid
      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$0.00')).toBeInTheDocument();

      // But both appear in expanded account breakdown
      expect(screen.getByText('Credit Card')).toBeInTheDocument();
      expect(screen.getByText('Home Mortgage')).toBeInTheDocument();
    });
  });

  describe('9. ChatPanel Integration', () => {
    it('renders header toggle button with toggle-context-glance testid and correct title', async () => {
      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const toggleButton = screen.getByTestId('toggle-context-glance');
      expect(toggleButton).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('title', 'Toggle Context Glance');
    });

    it('ContextGlanceBar is not mounted when showContextGlance is false (default)', async () => {
      useSettingsStore.setState({ showContextGlance: false });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();
    });

    it('clicking header toggle button toggles showContextGlance and mounts ContextGlanceBar', async () => {
      useSettingsStore.setState({ showContextGlance: false });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const toggleButton = screen.getByTestId('toggle-context-glance');
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();

      // Click to enable
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(true);
      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();

      // Click to disable
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(false);
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();
    });

    it('selecting a prompt from ContextGlanceBar populates ChatPanel input textarea', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();

      // Find an account chip inside the glance bar and click it
      const accountChips = screen.getAllByTestId('glance-account-chip');
      expect(accountChips.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(accountChips[0]);
      });

      // The textarea in ChatPanel should now contain the prompt text
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('What is my balance outlook for High Interest Savings?');
    });
  });
});

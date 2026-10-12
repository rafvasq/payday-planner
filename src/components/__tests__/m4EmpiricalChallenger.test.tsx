import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ContextGlanceBar } from '../ContextGlanceBar';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider } from '../../context/ChatContext';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Account, Event, AccountType, EventType } from '../../core/models';
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

describe('Milestone 4 Empirical Challenge Suite: <ContextGlanceBar>', () => {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.setState({
      accounts: [],
      events: [],
      executedEvents: {},
    });
    useSettingsStore.setState({
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. SCALE STRESS: 50+ Accounts & 200+ Events
  // --------------------------------------------------------------------------
  describe('1. Scale Stress: 50+ Accounts and 200+ Events', () => {
    it('successfully renders and calculates totals with 50 accounts without degradation', () => {
      const largeAccounts: Account[] = Array.from({ length: 50 }, (_, i) => {
        const types: AccountType[] = ['chequing', 'savings', 'investment', 'debt', 'liability'];
        const type = types[i % types.length];
        return {
          id: `stress-acc-${i}`,
          name: `Stress Account #${i + 1} (${type})`,
          type,
          owner: `User ${i % 3}`,
          balance: 1000 + i * 500, // 1000, 1500, 2000...
          target_floor: i % 2 === 0 ? 1200 + i * 100 : null,
          active: i % 10 !== 9, // 10% inactive
        } as any;
      });

      // Calculate expected liquid total
      // Liquid types: chequing, savings, investment
      // Active: active !== false
      const liquidTypes = ['chequing', 'savings', 'investment'];
      const expectedLiquidSum = largeAccounts
        .filter((a) => (a as any).active !== false && liquidTypes.includes(a.type))
        .reduce((sum, a) => sum + a.balance, 0);

      render(<ContextGlanceBar accounts={largeAccounts} events={[]} />);

      // Verify liquid balance displayed
      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      const expectedFormatted = expectedLiquidSum.toLocaleString('en-CA', {
        style: 'currency',
        currency: 'CAD',
      });
      expect(screen.getByText(expectedFormatted)).toBeInTheDocument();

      // Compact view must strictly cap top account chips to at most 3
      const accountChips = screen.getAllByTestId('glance-account-chip');
      expect(accountChips.length).toBe(3);

      // Verify top accounts are sorted descending by balance
      const liquidSorted = largeAccounts
        .filter((a) => (a as any).active !== false && liquidTypes.includes(a.type))
        .sort((a, b) => b.balance - a.balance);

      expect(accountChips[0]).toHaveTextContent(liquidSorted[0].name + ':');
      expect(accountChips[1]).toHaveTextContent(liquidSorted[1].name + ':');
      expect(accountChips[2]).toHaveTextContent(liquidSorted[2].name + ':');
    });

    it('successfully builds calendar and displays upcoming occurrences with 200 events', () => {
      const accounts: Account[] = [
        {
          id: 'acc-main',
          name: 'Main Chequing',
          type: 'chequing',
          owner: 'User',
          balance: 5000,
        },
      ];

      // 200 events spread across next 30 days
      const largeEvents: Event[] = Array.from({ length: 200 }, (_, i) => {
        const dayOffset = (i % 25) + 1; // 1 to 25 days ahead
        const types: EventType[] = ['inflow', 'outflow', 'transfer'];
        const evtType = types[i % 2]; // inflow or outflow
        return {
          id: `stress-evt-${i}`,
          name: `Bill/Pay ${i + 1}`,
          event_type: evtType,
          amount: 50 + (i % 100) * 10,
          from_account_id: evtType === 'outflow' ? 'acc-main' : null,
          to_account_id: evtType === 'inflow' ? 'acc-main' : null,
          frequency: 'one-time',
          anchor_date: format(addDays(today, dayOffset), 'yyyy-MM-dd'),
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        };
      });

      render(<ContextGlanceBar accounts={accounts} events={largeEvents} />);

      // Compact view must strictly show at most 2 upcoming events within 14 days
      const eventChips = screen.getAllByTestId('glance-event-chip');
      expect(eventChips.length).toBe(2);

      // Expand to mini-dashboard
      const expandBtn = screen.getByTestId('glance-expand-toggle');
      fireEvent.click(expandBtn);

      // In expanded view, 2 compact chips + 6 expanded column chips = 8 total chips
      const expandedChips = screen.getAllByTestId('glance-event-chip');
      expect(expandedChips.length).toBe(8);
    });

    it('renders 50 accounts in expanded view without DOM or rendering errors', () => {
      const largeAccounts: Account[] = Array.from({ length: 50 }, (_, i) => ({
        id: `acc-exp-${i}`,
        name: `Account Spec ${i + 1}`,
        type: (i % 2 === 0 ? 'chequing' : 'savings') as AccountType,
        owner: 'Tester',
        balance: 1000 + i * 100,
        target_floor: i % 3 === 0 ? 1500 + i * 50 : null,
        active: true,
      }));

      render(<ContextGlanceBar accounts={largeAccounts} events={[]} isExpanded={true} />);

      // In expanded view: 3 top accounts in compact strip + 50 accounts in expanded column = 53 chips
      const chips = screen.getAllByTestId('glance-account-chip');
      expect(chips.length).toBe(53);
      expect(screen.getByText('Account Spec 1')).toBeInTheDocument();
      expect(screen.getByText('Account Spec 50')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 2. EXTREME BALANCE BOUNDARIES (-$1M to +$10M) & CUSTOM CURRENCIES
  // --------------------------------------------------------------------------
  describe('2. Extreme Balance Boundaries & Currency Formatting', () => {
    it('handles extreme negative balances (-$1,000,000.00 and -$50,000,000.00) without crashing', () => {
      const extremeNegativeAccounts: Account[] = [
        {
          id: 'acc-debt-extreme',
          name: 'Super Massive Debt',
          type: 'chequing', // Liquid type but severely in debt
          owner: 'User',
          balance: -1000000,
        },
        {
          id: 'acc-catastrophe',
          name: 'Mega Overdraft Chequing',
          type: 'chequing',
          owner: 'User',
          balance: -50000000,
        },
      ];

      render(<ContextGlanceBar accounts={extremeNegativeAccounts} events={[]} />);

      // Total liquid should sum to -51,000,000
      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('-$51,000,000.00')).toBeInTheDocument();

      const chips = screen.getAllByTestId('glance-account-chip');
      expect(chips[0]).toHaveTextContent('-$1,000,000.00');
      expect(chips[1]).toHaveTextContent('-$50,000,000.00');
    });

    it('handles extreme positive balances (+$10,000,000.00 and +$1,000,000,000.00)', () => {
      const extremePositiveAccounts: Account[] = [
        {
          id: 'acc-mega-wealth',
          name: 'Ultra High Net Worth Trust',
          type: 'investment',
          owner: 'User',
          balance: 10000000,
        },
        {
          id: 'acc-billionaire',
          name: 'Sovereign Wealth Holdings',
          type: 'savings',
          owner: 'User',
          balance: 1000000000,
        },
      ];

      render(<ContextGlanceBar accounts={extremePositiveAccounts} events={[]} />);

      // Total liquid = 1,010,000,000.00
      expect(screen.getByText('Liquid:')).toBeInTheDocument();
      expect(screen.getByText('$1,010,000,000.00')).toBeInTheDocument();

      const chips = screen.getAllByTestId('glance-account-chip');
      expect(chips[0]).toHaveTextContent('$1,000,000,000.00');
      expect(chips[1]).toHaveTextContent('$10,000,000.00');
    });

    it('handles zero balances and floating point micro-cents correctly', () => {
      const precisionAccounts: Account[] = [
        {
          id: 'acc-zero',
          name: 'Zero Balance Account',
          type: 'chequing',
          owner: 'User',
          balance: 0,
        },
        {
          id: 'acc-float',
          name: 'Microcents Account',
          type: 'savings',
          owner: 'User',
          // Floating point addition test: 0.1 + 0.2 = 0.30000000000000004
          balance: 0.1 + 0.2,
        },
      ];

      render(<ContextGlanceBar accounts={precisionAccounts} events={[]} />);

      // Total liquid = 0.30 (appears in both total liquid and account chip)
      const matches = screen.getAllByText('$0.30');
      expect(matches.length).toBe(2);
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    it('correctly handles boundary event amounts in upcoming pills and prompt generators', () => {
      const testAccount: Account = {
        id: 'acc-chq',
        name: 'Everyday Chequing',
        type: 'chequing',
        owner: 'User',
        balance: 10000,
      };

      const boundaryEvents: Event[] = [
        {
          id: 'evt-mega-inflow',
          name: 'Inheritance Inflow',
          event_type: 'inflow',
          amount: 5000000, // $5M
          from_account_id: null,
          to_account_id: 'acc-chq',
          frequency: 'one-time',
          anchor_date: format(addDays(today, 2), 'yyyy-MM-dd'),
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
        {
          id: 'evt-mega-outflow',
          name: 'House Purchase Payment',
          event_type: 'outflow',
          amount: 2500000, // $2.5M
          from_account_id: 'acc-chq',
          to_account_id: null,
          frequency: 'one-time',
          anchor_date: format(addDays(today, 4), 'yyyy-MM-dd'),
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      const handleSelectPrompt = vi.fn();
      render(
        <ContextGlanceBar
          accounts={[testAccount]}
          events={boundaryEvents}
          onSelectPrompt={handleSelectPrompt}
        />
      );

      const eventChips = screen.getAllByTestId('glance-event-chip');
      expect(eventChips[0]).toHaveTextContent('+$5,000,000.00');
      expect(eventChips[1]).toHaveTextContent('-$2,500,000.00');

      // Click inflow chip
      fireEvent.click(eventChips[0]);
      expect(handleSelectPrompt).toHaveBeenCalledWith(
        expect.stringContaining('($5,000,000.00)')
      );

      // Click outflow chip
      fireEvent.click(eventChips[1]);
      expect(handleSelectPrompt).toHaveBeenCalledWith(
        expect.stringContaining('($2,500,000.00)')
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. RAPID EXPAND / COLLAPSE TOGGLE STRESS
  // --------------------------------------------------------------------------
  describe('3. Rapid Expand / Collapse Toggle Stress', () => {
    it('survives 20 rapid expand/collapse toggles in uncontrolled mode without state desync', () => {
      const accounts: Account[] = [
        {
          id: 'acc-1',
          name: 'Test Account',
          type: 'chequing',
          owner: 'User',
          balance: 2000,
        },
      ];

      render(<ContextGlanceBar accounts={accounts} events={[]} />);

      const toggleBtn = screen.getByTestId('glance-expand-toggle');

      // 20 rapid clicks
      for (let i = 0; i < 20; i++) {
        fireEvent.click(toggleBtn);
      }

      // After 20 clicks (even number), it must be back in collapsed mode
      expect(toggleBtn).toHaveAttribute('title', 'Expand context glance');
      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();

      // One more click expands it
      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('title', 'Collapse context glance');
      expect(screen.getByText('Accounts & Target Floors')).toBeInTheDocument();
    });

    it('survives 20 rapid toggles in controlled mode with onToggleExpand', () => {
      const accounts: Account[] = [
        {
          id: 'acc-1',
          name: 'Test Account',
          type: 'chequing',
          owner: 'User',
          balance: 2000,
        },
      ];

      let isExpandedControlled = false;
      const handleToggle = vi.fn(() => {
        isExpandedControlled = !isExpandedControlled;
      });

      const { rerender } = render(
        <ContextGlanceBar
          accounts={accounts}
          events={[]}
          isExpanded={isExpandedControlled}
          onToggleExpand={handleToggle}
        />
      );

      const toggleBtn = screen.getByTestId('glance-expand-toggle');

      for (let i = 0; i < 20; i++) {
        fireEvent.click(toggleBtn);
        rerender(
          <ContextGlanceBar
            accounts={accounts}
            events={[]}
            isExpanded={isExpandedControlled}
            onToggleExpand={handleToggle}
          />
        );
      }

      expect(handleToggle).toHaveBeenCalledTimes(20);
      expect(isExpandedControlled).toBe(false);
      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 4. RAPID PROMPT SELECTION CLICKS & ROUTING STRESS
  // --------------------------------------------------------------------------
  describe('4. Rapid Prompt Selection Clicks & Routing Stress', () => {
    it('accurately dispatches prompts for 30 consecutive clicks across different chips', () => {
      const handleSelectPrompt = vi.fn();

      const accounts: Account[] = [
        {
          id: 'acc-chq',
          name: 'Checking A',
          type: 'chequing',
          owner: 'User',
          balance: 1000,
        },
        {
          id: 'acc-sav',
          name: 'Savings B',
          type: 'savings',
          owner: 'User',
          balance: 5000,
        },
      ];

      const events: Event[] = [
        {
          id: 'evt-rent',
          name: 'Rent Payment',
          event_type: 'outflow',
          amount: 1200,
          from_account_id: 'acc-chq',
          to_account_id: null,
          frequency: 'one-time',
          anchor_date: format(addDays(today, 1), 'yyyy-MM-dd'),
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      render(
        <ContextGlanceBar
          accounts={accounts}
          events={events}
          isExpanded={true}
          onSelectPrompt={handleSelectPrompt}
        />
      );

      // Account chips
      const accChips = screen.getAllByTestId('glance-account-chip');
      // Event chips
      const evtChips = screen.getAllByTestId('glance-event-chip');
      // Suggestion chips
      const suggestionChips = screen.getAllByTestId('glance-quick-action-chip');

      // Click each 10 times in rapid succession
      for (let i = 0; i < 10; i++) {
        fireEvent.click(accChips[0]);
      }
      expect(handleSelectPrompt).toHaveBeenCalledTimes(10);
      expect(handleSelectPrompt).toHaveBeenLastCalledWith(
        'What is my balance outlook for Savings B?'
      );

      for (let i = 0; i < 10; i++) {
        fireEvent.click(evtChips[0]);
      }
      expect(handleSelectPrompt).toHaveBeenCalledTimes(20);

      for (let i = 0; i < 10; i++) {
        fireEvent.click(suggestionChips[0]);
      }
      expect(handleSelectPrompt).toHaveBeenCalledTimes(30);
    });

    it('safely handles special unicode, quotes, and emoji characters in names', () => {
      const specialAccount: Account = {
        id: 'acc-emoji',
        name: '🚀 Crypto & "Moon" Fund (CAD$)',
        type: 'investment',
        owner: 'User',
        balance: 99999.99,
      };

      const specialEvent: Event = {
        id: 'evt-emoji',
        name: '🎉 Birthday Party: "Special Dinner"',
        event_type: 'outflow',
        amount: 350.75,
        from_account_id: 'acc-emoji',
        to_account_id: null,
        frequency: 'one-time',
        anchor_date: format(addDays(today, 3), 'yyyy-MM-dd'),
        active: true,
        execution: 'auto',
        weekend_shift: 'none',
      };

      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={[specialAccount]}
          events={[specialEvent]}
          onSelectPrompt={handleSelect}
        />
      );

      const accChip = screen.getByTestId('glance-account-chip');
      fireEvent.click(accChip);
      expect(handleSelect).toHaveBeenCalledWith(
        'What is my balance outlook for 🚀 Crypto & "Moon" Fund (CAD$)?'
      );

      const evtChip = screen.getByTestId('glance-event-chip');
      fireEvent.click(evtChip);
      expect(handleSelect).toHaveBeenCalledWith(
        expect.stringContaining('Can I afford 🎉 Birthday Party: "Special Dinner"')
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. TARGET FLOOR BREACH & SUGGESTION CHIP ADAPTABILITY
  // --------------------------------------------------------------------------
  describe('5. Target Floor Breach & Suggestion Adaptation', () => {
    it('detects multiple target floor breaches and displays alert icons', () => {
      const breachedAccounts: Account[] = [
        {
          id: 'acc-1',
          name: 'Breached Chequing',
          type: 'chequing',
          owner: 'User',
          balance: 200,
          target_floor: 1000, // Breached by $800
        },
        {
          id: 'acc-2',
          name: 'Breached Savings',
          type: 'savings',
          owner: 'User',
          balance: 50,
          target_floor: 500, // Breached by $450
        },
        {
          id: 'acc-3',
          name: 'Safe Investment',
          type: 'investment',
          owner: 'User',
          balance: 10000,
          target_floor: 2000, // Safe
        },
      ];

      render(<ContextGlanceBar accounts={breachedAccounts} events={[]} isExpanded={true} />);

      // Both breached accounts should show Floor alerts
      expect(screen.getByText('Floor: $1,000.00')).toBeInTheDocument();
      expect(screen.getByText('Floor: $500.00')).toBeInTheDocument();
      expect(screen.getByText('Floor: $2,000.00')).toBeInTheDocument();

      // Suggestion chip must adapt to suggest bringing breached account back above floor
      expect(
        screen.getByRole('button', {
          name: /How can I bring Breached Chequing back above target floor\?/i,
        })
      ).toBeInTheDocument();
    });

    it('generates 30-day balance outlook chip when no upcoming bills exist', () => {
      const accounts: Account[] = [
        {
          id: 'acc-1',
          name: 'Healthy Account',
          type: 'chequing',
          owner: 'User',
          balance: 10000,
          target_floor: 1000,
        },
      ];

      render(<ContextGlanceBar accounts={accounts} events={[]} isExpanded={true} />);

      expect(
        screen.getByRole('button', { name: 'Simulate 30-day balance outlook' })
      ).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 6. CHATPANEL HIGH-FREQUENCY TOGGLE & INTEGRATION TEST
  // --------------------------------------------------------------------------
  describe('6. ChatPanel Header Toggle & Input Integration Under Stress', () => {
    it('survives rapid header toggling in ChatPanel and propagates prompt selection to textarea', async () => {
      usePlannerStore.setState({
        accounts: [
          {
            id: 'acc-chat-test',
            name: 'Everyday Checking',
            type: 'chequing',
            owner: 'User',
            balance: 4500,
            target_floor: 1000,
          },
        ],
        events: [],
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const headerToggle = screen.getByTestId('toggle-context-glance');

      // Rapidly toggle 6 times (on, off, on, off, on, off)
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(headerToggle);
        });
      }

      // showContextGlance should be false after 6 toggles
      expect(useSettingsStore.getState().showContextGlance).toBe(false);
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();

      // Turn it on
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(true);
      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();

      // Click the account chip to insert prompt into input textarea
      const accountChip = screen.getByTestId('glance-account-chip');
      await act(async () => {
        fireEvent.click(accountChip);
      });

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('What is my balance outlook for Everyday Checking?');
    });
  });

  // --------------------------------------------------------------------------
  // 7. EXTREME SCALE (100 ACCOUNTS, 500 EVENTS) & DEFENSIVE RESILIENCE
  // --------------------------------------------------------------------------
  describe('7. Extreme Scale (100 Accounts, 500 Events) & Defensive Resilience', () => {
    it('handles extreme scale of 100 accounts and 500 events without crashing', () => {
      const massiveAccounts: Account[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mega-acc-${i}`,
        name: `Account #${i + 1}`,
        type: 'chequing',
        owner: 'User',
        balance: 1000 + i * 10,
        active: true,
      }));

      const massiveEvents: Event[] = Array.from({ length: 500 }, (_, i) => ({
        id: `mega-evt-${i}`,
        name: `Event #${i + 1}`,
        event_type: i % 3 === 0 ? 'inflow' : i % 3 === 1 ? 'outflow' : 'transfer',
        amount: 25 + (i % 200),
        from_account_id: 'mega-acc-0',
        to_account_id: i % 3 === 0 ? 'mega-acc-0' : null,
        frequency: 'one-time',
        anchor_date: format(addDays(today, (i % 14) + 1), 'yyyy-MM-dd'),
        active: true,
        execution: 'auto',
        weekend_shift: 'none',
      }));

      expect(() => {
        render(
          <ContextGlanceBar
            accounts={massiveAccounts}
            events={massiveEvents}
            isExpanded={true}
          />
        );
      }).not.toThrow();

      // Verify DOM successfully rendered
      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
      expect(screen.getByText('Account #100')).toBeInTheDocument();
    });

    it('safely handles chips clicks when onSelectPrompt is undefined', () => {
      const accounts: Account[] = [
        {
          id: 'acc-safe',
          name: 'Safe Chequing',
          type: 'chequing',
          owner: 'User',
          balance: 2000,
        },
      ];
      const events: Event[] = [
        {
          id: 'evt-safe',
          name: 'Safe Bill',
          event_type: 'outflow',
          amount: 50,
          from_account_id: 'acc-safe',
          to_account_id: null,
          frequency: 'one-time',
          anchor_date: format(addDays(today, 1), 'yyyy-MM-dd'),
          active: true,
          execution: 'auto',
          weekend_shift: 'none',
        },
      ];

      render(<ContextGlanceBar accounts={accounts} events={events} isExpanded={true} />);

      const accChip = screen.getAllByTestId('glance-account-chip')[0];
      const evtChip = screen.getAllByTestId('glance-event-chip')[0];
      const quickChip = screen.getAllByTestId('glance-quick-action-chip')[0];

      // None of these should throw when clicked without handler
      expect(() => fireEvent.click(accChip)).not.toThrow();
      expect(() => fireEvent.click(evtChip)).not.toThrow();
      expect(() => fireEvent.click(quickChip)).not.toThrow();
    });

    it('gracefully handles transfer events in upcoming occurrences', () => {
      const transferAccount: Account = {
        id: 'acc-t1',
        name: 'Chequing',
        type: 'chequing',
        owner: 'User',
        balance: 5000,
      };

      const transferEvent: Event = {
        id: 'evt-transfer',
        name: 'Auto-Transfer to TFSA',
        event_type: 'transfer',
        amount: 500,
        from_account_id: 'acc-t1',
        to_account_id: 'acc-t2',
        frequency: 'one-time',
        anchor_date: format(addDays(today, 2), 'yyyy-MM-dd'),
        active: true,
        execution: 'auto',
        weekend_shift: 'none',
      };

      const handleSelect = vi.fn();
      render(
        <ContextGlanceBar
          accounts={[transferAccount]}
          events={[transferEvent]}
          onSelectPrompt={handleSelect}
        />
      );

      const evtChip = screen.getByTestId('glance-event-chip');
      expect(evtChip).toHaveTextContent('Auto-Transfer to TFSA');
      expect(evtChip).toHaveTextContent('-$500.00');

      fireEvent.click(evtChip);
      expect(handleSelect).toHaveBeenCalledWith(
        expect.stringContaining('Can I afford Auto-Transfer to TFSA ($500.00)')
      );
    });
  });
});


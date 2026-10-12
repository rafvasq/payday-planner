import React, { useMemo } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScenarioTray } from '../ScenarioTray';
import { RecordActualCard } from '../RecordActualCard';
import {
  ChatProvider,
  useChat,
} from '../../../context/ChatContext';
import { usePlannerStore } from '../../../store/usePlannerStore';
import { PlannerWorld, projectWorld } from '../../../core/ai/world';
import { ActualView } from '../../../core/ai/toolkit';
import { api } from '../../../lib/apiClient';

// Mock apiClient to monitor zero LLM calls
vi.mock('../../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('ScenarioTray Layering Adversarial Challenger (Milestone 3)', () => {
  const sampleAccounts = [
    {
      id: 'acc-chequing',
      name: 'Primary Chequing',
      type: 'chequing' as const,
      owner: 'User',
      balance: 2500,
      interest_rate: 0,
      target_floor: 500,
    },
    {
      id: 'acc-savings',
      name: 'High Interest Savings',
      type: 'savings' as const,
      owner: 'User',
      balance: 10000,
      interest_rate: 3.5,
      target_floor: 2000,
    },
    {
      id: 'acc-visa',
      name: 'Platinum Visa',
      type: 'debt' as const,
      owner: 'User',
      balance: -1200,
      interest_rate: 19.99,
      target_floor: 0,
    },
  ];

  const sampleEvents = [
    {
      id: 'evt-rent',
      name: 'Monthly Rent',
      event_type: 'outflow' as const,
      amount: 800,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time' as const,
      anchor_date: '2026-10-15',
      active: true,
      execution: 'auto' as const,
      weekend_shift: 'none' as const,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    act(() => {
      usePlannerStore.setState({
        accounts: sampleAccounts,
        events: sampleEvents,
        executedEvents: {},
        startingBalancesReflectToday: true,
      });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Test harness that integrates ChatContext and executes real projectWorld projections
  const LiveProjectionHarness: React.FC = () => {
    const {
      assumptions,
      scenarioAssumptions,
      addAssumption,
      chatMode,
      setChatMode,
      clearMessages,
    } = useChat();

    const { accounts, events, executedEvents, startingBalancesReflectToday } = usePlannerStore();

    // Compute live deterministic projection using projectWorld layered with active assumptions
    const projectedBalances = useMemo(() => {
      const world: PlannerWorld = {
        accounts,
        events,
        executedEvents,
        balancesReflectToday: startingBalancesReflectToday,
        today: '2026-10-11',
      };
      const proj = projectWorld(world, assumptions, 30);
      const firstDayBalances = proj.points[0]?.balances || {};
      const endDayBalances = proj.points[proj.points.length - 1]?.balances || {};
      return {
        firstDayBalances,
        endDayBalances,
      };
    }, [accounts, events, executedEvents, startingBalancesReflectToday, assumptions]);

    return (
      <div data-testid="live-harness">
        <ScenarioTray />

        <div data-testid="live-chq-start">{projectedBalances.firstDayBalances['acc-chequing']}</div>
        <div data-testid="live-sav-start">{projectedBalances.firstDayBalances['acc-savings']}</div>
        <div data-testid="live-visa-start">{projectedBalances.firstDayBalances['acc-visa']}</div>

        <div data-testid="live-chq-end">{projectedBalances.endDayBalances['acc-chequing']}</div>
        <div data-testid="live-sav-end">{projectedBalances.endDayBalances['acc-savings']}</div>

        <div data-testid="active-assumptions-count">{assumptions.length}</div>
        <div data-testid="total-assumptions-count">{scenarioAssumptions.length}</div>
        <div data-testid="current-chat-mode">{chatMode}</div>

        <button
          data-testid="btn-add-transfer"
          onClick={() =>
            addAssumption('Transfer $1000 Chq -> Sav', [
              { type: 'adjust_balance', account_id: 'acc-chequing', delta_cents: -100000 },
              { type: 'adjust_balance', account_id: 'acc-savings', delta_cents: 100000 },
            ])
          }
        >
          Add Transfer
        </button>

        <button
          data-testid="btn-add-bill"
          onClick={() =>
            addAssumption('Landed bill $300 Chq', {
              type: 'adjust_balance',
              account_id: 'acc-chequing',
              delta_cents: -30000,
            })
          }
        >
          Add Bill
        </button>

        <button
          data-testid="btn-add-skip-rent"
          onClick={() =>
            addAssumption('Skip rent event', {
              type: 'skip_event',
              event_id: 'evt-rent',
              date: '2026-10-15',
            })
          }
        >
          Skip Rent
        </button>

        <button
          data-testid="btn-switch-mode"
          onClick={() => setChatMode(chatMode === 'tactical' ? 'auditor' : 'tactical')}
        >
          Toggle Mode
        </button>

        <button data-testid="btn-clear-chat" onClick={() => clearMessages()}>
          Clear Chat
        </button>
      </div>
    );
  };

  describe('1. Dynamic Layering over projectWorld with ZERO LLM roundtrips', () => {
    it('layers multiple assumptions over projectWorld in real time with 0 LLM calls', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      // Baseline state:
      // Chq initial: 2500, Rent event (-800) scheduled Oct 15 -> Chq end: 1700
      // Sav initial: 10000, Sav end: 10000
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('1700');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('10000');
      expect(screen.getByTestId('live-sav-end')).toHaveTextContent('10000');
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(api.chatStream).toHaveBeenCalledTimes(0);

      // Add Transfer Assumption ($1,000 Chq -> Sav)
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
      });

      // ScenarioTray immediately renders chip
      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      expect(screen.getByText('Transfer $1000 Chq -> Sav')).toBeInTheDocument();

      // Projections immediately reflect transfer without any LLM call
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('700');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('11000');
      expect(screen.getByTestId('live-sav-end')).toHaveTextContent('11000');
      expect(api.chatStream).toHaveBeenCalledTimes(0);

      // Add Bill Assumption ($300 Chq)
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      expect(screen.getByText('Landed bill $300 Chq')).toBeInTheDocument();
      // Combined: Chq starts at 2500 - 1000 - 300 = 1200, ends at 1200 - 800 = 400
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1200');
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('400');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('11000');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });

    it('unchecking an assumption excludes it from active projections immediately', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1200');
      expect(api.chatStream).toHaveBeenCalledTimes(0);

      // Uncheck Transfer assumption
      const transferToggle = screen.getByRole('checkbox', {
        name: /Toggle Transfer \$1000 Chq -> Sav/i,
      });
      expect((transferToggle as HTMLInputElement).checked).toBe(true);

      await act(async () => {
        fireEvent.click(transferToggle);
      });

      // Transfer toggle is now false
      expect((transferToggle as HTMLInputElement).checked).toBe(false);
      // Transfer assumption excluded: only Bill remains!
      // Chq: 2500 - 300 = 2200; Sav: back to baseline 10000
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200');
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('1400');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('10000');
      expect(screen.getByTestId('live-sav-end')).toHaveTextContent('10000');
      // ZERO LLM calls
      expect(api.chatStream).toHaveBeenCalledTimes(0);

      // Uncheck Bill assumption as well
      const billToggle = screen.getByRole('checkbox', {
        name: /Toggle Landed bill \$300 Chq/i,
      });
      await act(async () => {
        fireEvent.click(billToggle);
      });

      // Both unchecked: projection returns exactly to virgin baseline
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('1700');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('10000');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });

    it('re-checking an assumption restores it into active projections immediately', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
      });

      const transferToggle = screen.getByRole('checkbox', {
        name: /Toggle Transfer \$1000 Chq -> Sav/i,
      });

      // Toggle off
      await act(async () => {
        fireEvent.click(transferToggle);
      });
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');
      expect((transferToggle as HTMLInputElement).checked).toBe(false);

      // Toggle back on
      await act(async () => {
        fireEvent.click(transferToggle);
      });

      // Restored immediately
      expect((transferToggle as HTMLInputElement).checked).toBe(true);
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('11000');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });

    it('supports event-skipping assumptions layered over projectWorld', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      // Initially rent is scheduled: Chq end is 1700
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('1700');

      // Add skip rent assumption
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-skip-rent'));
      });

      // With rent skipped, ending balance preserves the 800 -> 2500!
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('2500');

      // Uncheck skip rent
      const skipToggle = screen.getByRole('checkbox', {
        name: /Toggle Skip rent event/i,
      });
      await act(async () => {
        fireEvent.click(skipToggle);
      });

      // Rent is restored in projection -> 1700
      expect(screen.getByTestId('live-chq-end')).toHaveTextContent('1700');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });
  });

  describe('2. Assumption Dismissal Permanence', () => {
    it('dismissing an assumption deletes it permanently from the tray and context', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('2');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1200');

      // Click remove button for Transfer
      const removeTransferBtn = screen.getByRole('button', {
        name: /Remove Transfer \$1000 Chq -> Sav/i,
      });

      await act(async () => {
        fireEvent.click(removeTransferBtn);
      });

      // Transfer chip is permanently gone from DOM
      expect(screen.queryByText('Transfer $1000 Chq -> Sav')).not.toBeInTheDocument();
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('1');
      // Projections reflect permanent removal: only Bill remains
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200');

      // Click remove button for Bill
      const removeBillBtn = screen.getByRole('button', {
        name: /Remove Landed bill \$300 Chq/i,
      });

      await act(async () => {
        fireEvent.click(removeBillBtn);
      });

      // Bill is gone, ScenarioTray unmounts
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('0');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });

    it('dismissing a disabled (unchecked) assumption deletes it cleanly without affecting enabled ones', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      // Disable Transfer
      const transferToggle = screen.getByRole('checkbox', {
        name: /Toggle Transfer \$1000 Chq -> Sav/i,
      });
      await act(async () => {
        fireEvent.click(transferToggle);
      });

      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200'); // Bill active

      // Now dismiss the disabled Transfer
      const removeTransferBtn = screen.getByRole('button', {
        name: /Remove Transfer \$1000 Chq -> Sav/i,
      });
      await act(async () => {
        fireEvent.click(removeTransferBtn);
      });

      // Only Bill remains, and it remains enabled!
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('1');
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('1');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200');
    });
  });

  describe('3. RecordActualCard Integration with Scenario Tray', () => {
    const RecordActualIntegrationHarness: React.FC = () => {
      const { applyRecordActual, recordStatuses, assumptions } = useChat();
      const actualView: ActualView = {
        description: 'Grocery store trip',
        transaction_descriptions: ['Whole Foods $120.00'],
        adjustments: [
          {
            type: 'adjust_balance',
            account_id: 'acc-chequing',
            delta_cents: -12000,
          },
        ],
        transactions: [],
        accounts: [],
        risks: [],
      };

      return (
        <div>
          <ScenarioTray />
          <RecordActualCard
            actualView={actualView}
            status={recordStatuses['test-rec-1'] || 'pending'}
            onChoice={(choice) => applyRecordActual(choice, actualView, 'test-rec-1')}
          />
          <div data-testid="record-status">{recordStatuses['test-rec-1'] || 'pending'}</div>
          <div data-testid="active-assumptions-count">{assumptions.length}</div>
        </div>
      );
    };

    it('"Treat as landed" creates an assumption chip and updates RecordActual status', async () => {
      render(
        <ChatProvider>
          <RecordActualIntegrationHarness />
        </ChatProvider>
      );

      expect(screen.getByTestId('record-status')).toHaveTextContent('pending');
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();

      // Click "Treat as landed (don't save)"
      const treatAsLandedBtn = screen.getByRole('button', {
        name: /Treat as landed/i,
      });

      await act(async () => {
        fireEvent.click(treatAsLandedBtn);
      });

      // Card status transitions to assumed
      expect(screen.getByTestId('record-status')).toHaveTextContent('assumed');
      // ScenarioTray appears with newly created assumption
      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      expect(screen.getByText('Assumed landed: Whole Foods $120.00')).toBeInTheDocument();
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('1');

      // Verify underlying planner store accounts are NOT mutated
      const storeState = usePlannerStore.getState();
      const chq = storeState.accounts.find((a) => a.id === 'acc-chequing');
      expect(chq?.balance).toBe(2500); // Intact!
    });
  });

  describe('4. Persistence across Page Reloads', () => {
    it('persists assumptions and enabled states to localStorage and rehydrates on mount', async () => {
      // First mount
      const { unmount } = render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      // Disable bill
      const billToggle = screen.getByRole('checkbox', {
        name: /Toggle Landed bill \$300 Chq/i,
      });
      await act(async () => {
        fireEvent.click(billToggle);
      });

      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('2');
      // Transfer contains 2 ScenarioChanges (chq adjustment + sav adjustment)
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('2');

      // Unmount simulating page unload
      unmount();

      // Verify raw localStorage contains saved assumptions with their enabled state
      const rawMeta = localStorage.getItem('payday_chat_meta');
      expect(rawMeta).not.toBeNull();
      const meta = JSON.parse(rawMeta!);
      expect(meta.scenarioAssumptions).toHaveLength(2);
      expect(meta.scenarioAssumptions[0].enabled).toBe(true);
      expect(meta.scenarioAssumptions[1].enabled).toBe(false);

      // Re-mount a new ChatProvider instance simulating fresh page load
      await act(async () => {
        render(
          <ChatProvider>
            <LiveProjectionHarness />
          </ChatProvider>
        );
      });

      // Rehydration verified:
      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('2');
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('2');

      // Live projection layers ONLY the enabled assumption (Transfer)
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('11000');

      // The disabled chip renders with line-through styling
      const disabledChip = screen.getByText('Landed bill $300 Chq').closest('div');
      expect(disabledChip?.className).toMatch(/line-through/);
    });

    it('clearMessages purges assumptions and meta from localStorage', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
      });

      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('1');

      // Click clear
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-clear-chat'));
      });

      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('0');
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('0');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');
    });
  });

  describe('5. Chat Mode Isolation (tactical vs auditor)', () => {
    it('isolates scenario assumptions and record statuses between tactical and auditor modes', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      // Mode is tactical
      expect(screen.getByTestId('current-chat-mode')).toHaveTextContent('tactical');

      // Add tactical assumption
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
      });

      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('1');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');

      // Switch to auditor mode
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-switch-mode'));
      });

      expect(screen.getByTestId('current-chat-mode')).toHaveTextContent('auditor');

      // Auditor mode starts clean: 0 assumptions from tactical!
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('0');
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2500');

      // Add assumption in auditor mode
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-bill'));
      });

      expect(screen.getByTestId('total-assumptions-count')).toHaveTextContent('1');
      expect(screen.getByText('Landed bill $300 Chq')).toBeInTheDocument();
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200');

      // Switch BACK to tactical mode
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-switch-mode'));
      });

      expect(screen.getByTestId('current-chat-mode')).toHaveTextContent('tactical');

      // Tactical mode has Transfer and does NOT have Bill!
      expect(screen.getByText('Transfer $1000 Chq -> Sav')).toBeInTheDocument();
      expect(screen.queryByText('Landed bill $300 Chq')).not.toBeInTheDocument();
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');

      // Switch back to auditor mode again
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-switch-mode'));
      });

      expect(screen.getByTestId('current-chat-mode')).toHaveTextContent('auditor');
      // Auditor has Bill and NOT Transfer!
      expect(screen.getByText('Landed bill $300 Chq')).toBeInTheDocument();
      expect(screen.queryByText('Transfer $1000 Chq -> Sav')).not.toBeInTheDocument();
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('2200');
    });
  });

  describe('6. Rapid Stress & Boundary Invariants', () => {
    it('survives rapid consecutive toggles without race conditions or math drift', async () => {
      render(
        <ChatProvider>
          <LiveProjectionHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-add-transfer'));
      });

      const toggle = screen.getByRole('checkbox', {
        name: /Toggle Transfer \$1000 Chq -> Sav/i,
      });

      // Rapidly toggle 10 times
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          fireEvent.click(toggle);
        });
      }

      // Even number of clicks returns to enabled
      expect((toggle as HTMLInputElement).checked).toBe(true);
      expect(screen.getByTestId('live-chq-start')).toHaveTextContent('1500');
      expect(screen.getByTestId('live-sav-start')).toHaveTextContent('11000');
      expect(api.chatStream).toHaveBeenCalledTimes(0);
    });
  });
});

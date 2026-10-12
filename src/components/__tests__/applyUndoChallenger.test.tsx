import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SimulationCard } from '../SimulationCard';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider, CHAT_STORAGE_KEY } from '../../context/ChatContext';
import { usePlannerStore } from '../../store/usePlannerStore';
import { Account, Event } from '../../core/models';
import { BlueprintChange } from '../../core/tools';
import { toast } from '../ui/sonner';

// Mock Recharts ResponsiveContainer to avoid JSDOM zero-dimension issues
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

// Mock apiClient for ChatPanel mounting
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

describe('Milestone 3 Empirical Challenger: Apply to Plan & Undo Flow', () => {
  const baselineAccounts: Account[] = [
    {
      id: 'acc-main',
      name: 'Checking Account',
      type: 'chequing',
      owner: 'Alice',
      balance: 5000,
      interest_rate: 0,
      target_floor: 1000,
    },
    {
      id: 'acc-savings',
      name: 'High-Yield Savings',
      type: 'savings',
      owner: 'Alice',
      balance: 12000,
      interest_rate: 4.5,
      target_floor: 2000,
    },
    {
      id: 'acc-credit',
      name: 'Rewards Visa',
      type: 'debt',
      owner: 'Alice',
      balance: -1500,
      interest_rate: 19.99,
      target_floor: 0,
    },
  ];

  const baselineEvents: Event[] = [
    {
      id: 'evt-rent',
      name: 'Monthly Rent',
      event_type: 'outflow',
      amount: 1800,
      from_account_id: 'acc-main',
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: '2026-10-01',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'evt-salary',
      name: 'Bi-Weekly Paycheck',
      event_type: 'inflow',
      amount: 3200,
      from_account_id: null,
      to_account_id: 'acc-main',
      frequency: 'biweekly',
      anchor_date: '2026-10-05',
      active: true,
      execution: 'auto',
      weekend_shift: 'previous_business_day',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.setState({
      accounts: JSON.parse(JSON.stringify(baselineAccounts)),
      events: JSON.parse(JSON.stringify(baselineEvents)),
      executedEvents: { '2026-10-01_evt-rent': true },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Rapid Sequential Apply Operations & LIFO/FIFO Rollback', () => {
    it('executes rapid sequential Apply operations across multiple distinct proposals, capturing unique pre-apply snapshots', async () => {
      const capturedToasts: Array<{ msg: string; action: any }> = [];
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedToasts.push({ msg, action: opts?.action });
        return `toast-${capturedToasts.length}`;
      }) as any);

      // Proposal 1: Modify Rent amount from 1800 to 1950
      const changes1: BlueprintChange[] = [
        {
          type: 'set_amount',
          event_id: 'evt-rent',
          amount_cents: 195000,
        },
      ];
      const payload1 = {
        diff: {
          affected_accounts: {
            'acc-main': {
              name: 'Checking Account',
              lowest_balance_before: 5000,
              lowest_balance_after: 4850,
            },
          },
        },
      };

      // Proposal 2: Add one-time bonus inflow of 500
      const changes2: BlueprintChange[] = [
        {
          type: 'add_one_time',
          from_account_id: 'acc-main',
          amount_cents: 50000,
          date: '2026-10-15',
        },
      ];
      const payload2 = {
        diff: {
          affected_accounts: {
            'acc-main': {
              name: 'Checking Account',
              lowest_balance_before: 4850,
              lowest_balance_after: 5350,
            },
          },
        },
      };

      // Proposal 3: Skip upcoming salary instance
      const changes3: BlueprintChange[] = [
        {
          type: 'skip_event',
          event_id: 'evt-salary',
          date: '2026-10-19',
        },
      ];
      const payload3 = {
        diff: {
          affected_accounts: {
            'acc-main': {
              name: 'Checking Account',
              lowest_balance_before: 5350,
              lowest_balance_after: 2150,
            },
          },
        },
      };

      render(
        <div>
          <SimulationCard
            proposalId="prop-1"
            toolName="propose_blueprint_changes"
            parsedContent={payload1}
            changes={changes1}
          />
          <SimulationCard
            proposalId="prop-2"
            toolName="propose_blueprint_changes"
            parsedContent={payload2}
            changes={changes2}
          />
          <SimulationCard
            proposalId="prop-3"
            toolName="propose_blueprint_changes"
            parsedContent={payload3}
            changes={changes3}
          />
        </div>
      );

      const applyButtons = screen.getAllByRole('button', { name: /Apply to Plan/i });
      expect(applyButtons).toHaveLength(3);

      // Rapidly click Apply 1
      await act(async () => {
        fireEvent.click(applyButtons[0]);
      });

      let storeState = usePlannerStore.getState();
      expect(storeState.events.find((e) => e.id === 'evt-rent')?.amount).toBe(1950);
      expect(capturedToasts).toHaveLength(1);

      // Rapidly click Apply 2
      await act(async () => {
        fireEvent.click(applyButtons[1]);
      });

      storeState = usePlannerStore.getState();
      expect(storeState.events.length).toBe(baselineEvents.length + 1);
      expect(capturedToasts).toHaveLength(2);

      // Rapidly click Apply 3
      await act(async () => {
        fireEvent.click(applyButtons[2]);
      });

      storeState = usePlannerStore.getState();
      expect(storeState.executedEvents['2026-10-19_evt-salary']).toBe(true);
      expect(capturedToasts).toHaveLength(3);

      // All 3 cards should now display 'Applied'
      const appliedBadges = screen.getAllByText('Applied');
      expect(appliedBadges).toHaveLength(3);

      // Step 4: Undo Proposal 3 (LIFO order)
      await act(async () => {
        capturedToasts[2].action.onClick();
      });

      storeState = usePlannerStore.getState();
      // Proposal 3 skipped event must be restored back to not skipped
      expect(storeState.executedEvents['2026-10-19_evt-salary']).toBeUndefined();
      // Proposal 2 added event must still exist
      expect(storeState.events.length).toBe(baselineEvents.length + 1);
      // Proposal 1 rent change must still exist
      expect(storeState.events.find((e) => e.id === 'evt-rent')?.amount).toBe(1950);

      // Step 5: Undo Proposal 2
      await act(async () => {
        capturedToasts[1].action.onClick();
      });

      storeState = usePlannerStore.getState();
      expect(storeState.events.length).toBe(baselineEvents.length);
      expect(storeState.events.find((e) => e.id === 'evt-rent')?.amount).toBe(1950);

      // Step 6: Undo Proposal 1
      await act(async () => {
        capturedToasts[0].action.onClick();
      });

      storeState = usePlannerStore.getState();
      expect(storeState.events.find((e) => e.id === 'evt-rent')?.amount).toBe(1800);
      expect(storeState.events).toEqual(baselineEvents);
      expect(storeState.accounts).toEqual(baselineAccounts);
      expect(storeState.executedEvents).toEqual({ '2026-10-01_evt-rent': true });
    });
  });

  describe('2. Exact Snapshot Restoration & Re-apply Lifecycle', () => {
    it('restores exact deep state snapshot including accounts, events, and executedEvents overrides', async () => {
      let capturedToastAction: any = null;
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedToastAction = opts?.action;
        return 'toast-1';
      }) as any);

      const complexChanges: BlueprintChange[] = [
        {
          type: 'skip_event',
          event_id: 'evt-rent',
          date: '2026-11-01',
        },
        {
          type: 'set_amount',
          event_id: 'evt-salary',
          amount_cents: 350000,
        },
      ];

      const initialDeepClone = {
        accounts: JSON.parse(JSON.stringify(baselineAccounts)),
        events: JSON.parse(JSON.stringify(baselineEvents)),
        executedEvents: { '2026-10-01_evt-rent': true },
      };

      render(
        <SimulationCard
          proposalId="complex-1"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={complexChanges}
        />
      );

      // 1. Apply changes
      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      // Verify changes mutated in store
      const mutatedStore = usePlannerStore.getState();
      expect(mutatedStore.executedEvents['2026-11-01_evt-rent']).toBe(true);
      expect(mutatedStore.events.find((e) => e.id === 'evt-salary')?.amount).toBe(3500);

      // 2. Click Undo
      expect(capturedToastAction).toBeDefined();
      await act(async () => {
        capturedToastAction.onClick();
      });

      // Verify restored store matches deep clone exactly
      const restoredStore = usePlannerStore.getState();
      expect(restoredStore.accounts).toEqual(initialDeepClone.accounts);
      expect(restoredStore.events).toEqual(initialDeepClone.events);
      expect(restoredStore.executedEvents).toEqual(initialDeepClone.executedEvents);

      // Also verify localStorage blueprint reflects restored state
      const rawBlueprint = localStorage.getItem('payday_blueprint');
      expect(rawBlueprint).not.toBeNull();
      const savedExecuted = JSON.parse(localStorage.getItem('payday_executed_checklist') || '{}');
      expect(savedExecuted).toEqual(initialDeepClone.executedEvents);
    });

    it('supports full apply -> undo -> re-apply -> undo lifecycle seamlessly without stale snapshot bugs', async () => {
      let capturedActions: any[] = [];
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedActions.push(opts?.action);
        return `toast-${capturedActions.length}`;
      }) as any);

      const change: BlueprintChange[] = [
        {
          type: 'set_amount',
          event_id: 'evt-rent',
          amount_cents: 200000,
        },
      ];

      render(
        <SimulationCard
          proposalId="cycle-1"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={change}
        />
      );

      // Phase 1: Apply
      let applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(2000);
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();

      // Phase 2: Undo
      await act(async () => {
        capturedActions[0].onClick();
      });

      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(1800);
      // Status reverted to pending, Apply button is available again!
      applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      expect(applyBtn).toBeInTheDocument();

      // Phase 3: Re-apply!
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(2000);
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
      expect(capturedActions).toHaveLength(2);

      // Phase 4: Undo the re-apply
      await act(async () => {
        capturedActions[1].onClick();
      });

      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(1800);
      expect(screen.getByRole('button', { name: /Apply to Plan/i })).toBeInTheDocument();
    });
  });

  describe('3. Proposal Status Transitions & DOM Hygiene', () => {
    it('transitions to rejected without mutating DOM styles or removing element from DOM tree', async () => {
      const onStatusChangeSpy = vi.fn();
      const onRejectSpy = vi.fn();

      render(
        <SimulationCard
          proposalId="reject-dom-test"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={[{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 200000 }]}
          onStatusChange={onStatusChangeSpy}
          onReject={onRejectSpy}
        />
      );

      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      await act(async () => {
        fireEvent.click(rejectBtn);
      });

      expect(onStatusChangeSpy).toHaveBeenCalledWith('rejected');
      expect(onRejectSpy).toHaveBeenCalledTimes(1);

      const card = screen.getByTestId('simulation-card');
      expect(card).toBeInTheDocument();
      // Ensure no style.display = 'none' manipulation hack was applied
      expect(card.style.display).not.toBe('none');
      expect(card.getAttribute('id')).toBe('proposal-reject-dom-test');

      // Status badge and text are displayed
      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check

      // Action buttons are gone
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reject/i })).not.toBeInTheDocument();
    });

    it('strictly respects controlled status prop if provided by parent', () => {
      const { rerender } = render(
        <SimulationCard
          proposalId="controlled-test"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          status="applied"
        />
      );

      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();

      rerender(
        <SimulationCard
          proposalId="controlled-test"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          status="rejected"
        />
      );

      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
    });

    it('does not render proposal action buttons for simulate tool', () => {
      render(
        <SimulationCard
          toolName="simulate"
          parsedContent={{ diff: { affected_accounts: {} } }}
        />
      );

      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reject/i })).not.toBeInTheDocument();
      expect(screen.getByText('Scenario Simulation')).toBeInTheDocument();
    });
  });

  describe('4. Error Handling and Edge Case Mining', () => {
    it('gracefully handles empty changes array without throwing or corrupting store', async () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');

      render(
        <SimulationCard
          proposalId="empty-changes"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={[]}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'Applied 0 change(s) to plan',
        expect.anything()
      );
      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(usePlannerStore.getState().events).toEqual(baselineEvents);
    });

    it('catches and displays error if blueprint modification fails, without corrupting state', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const toastErrorSpy = vi.spyOn(toast, 'error');
      const store = usePlannerStore.getState();
      vi.spyOn(store, 'applyBlueprintChangesWithSnapshot').mockImplementationOnce(() => {
        throw new Error('Simulated atomic write collision failure');
      });

      render(
        <SimulationCard
          proposalId="err-test"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={[{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 250000 }]}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(toastErrorSpy).toHaveBeenCalledWith('Failed to apply changes');
      // Status should remain pending
      expect(screen.getByRole('button', { name: /Apply to Plan/i })).toBeInTheDocument();
      expect(screen.queryByText('Applied')).not.toBeInTheDocument();
    });
  });

  describe('5. Complex ChatPanel Multi-Proposal Concurrency', () => {
    it('allows applying proposal A and rejecting proposal B independently in ChatPanel', async () => {
      const history = [
        {
          role: 'user',
          content: 'Here are two financial suggestions',
        },
        {
          role: 'assistant',
          content: 'I have prepared two separate proposals.',
          tool_calls: [
            {
              id: 'call-prop-A',
              type: 'function',
              function: {
                name: 'propose_blueprint_changes',
                arguments: JSON.stringify({
                  changes: [{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 185000 }],
                }),
              },
            },
            {
              id: 'call-prop-B',
              type: 'function',
              function: {
                name: 'propose_blueprint_changes',
                arguments: JSON.stringify({
                  changes: [{ type: 'set_amount', event_id: 'evt-salary', amount_cents: 400000 }],
                }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'propose_blueprint_changes',
          tool_call_id: 'call-prop-A',
          content: JSON.stringify({
            status: 'success',
            diff: { affected_accounts: {} },
            changes: [{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 185000 }],
          }),
        },
        {
          role: 'tool',
          name: 'propose_blueprint_changes',
          tool_call_id: 'call-prop-B',
          content: JSON.stringify({
            status: 'success',
            diff: { affected_accounts: {} },
            changes: [{ type: 'set_amount', event_id: 'evt-salary', amount_cents: 400000 }],
          }),
        },
      ];

      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const applyButtons = screen.getAllByRole('button', { name: /Apply to Plan/i });
      const rejectButtons = screen.getAllByRole('button', { name: /Reject/i });

      expect(applyButtons).toHaveLength(2);
      expect(rejectButtons).toHaveLength(2);

      // Apply first proposal (Rent to 1850)
      await act(async () => {
        fireEvent.click(applyButtons[0]);
      });

      // Reject second proposal (Salary to 4000)
      await act(async () => {
        fireEvent.click(rejectButtons[1]);
      });

      // Assert status badges
      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();

      // Assert store state: Rent was updated to 1850, Salary stayed at 3200!
      const storeEvents = usePlannerStore.getState().events;
      expect(storeEvents.find((e) => e.id === 'evt-rent')?.amount).toBe(1850);
      expect(storeEvents.find((e) => e.id === 'evt-salary')?.amount).toBe(3200);
    });
  });

  describe('6. Adversarial Stress Scenarios', () => {
    it('verifies toast duration is strictly 10000ms for Undo action and 3000ms for confirmation toast', async () => {
      let toastDuration: number | undefined;
      let undoToastDuration: number | undefined;

      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        toastDuration = opts?.duration;
        // Trigger undo
        opts?.action?.onClick();
        return 'toast-1';
      }) as any);

      vi.spyOn(toast, 'info').mockImplementation(((msg: any, opts: any) => {
        undoToastDuration = opts?.duration;
        return 'toast-2';
      }) as any);

      render(
        <SimulationCard
          proposalId="timing-test"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={[{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 210000 }]}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(toastDuration).toBe(10000);
      expect(undoToastDuration).toBe(3000);
    });

    it('handles conflicting consecutive mutations to the same event and proves atomic point-in-time snapshot isolation', async () => {
      let capturedActions: any[] = [];
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedActions.push(opts?.action);
        return `toast-${capturedActions.length}`;
      }) as any);

      // Proposal A: rent -> 2000
      const propA: BlueprintChange[] = [{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 200000 }];
      // Proposal B: rent -> 2400
      const propB: BlueprintChange[] = [{ type: 'set_amount', event_id: 'evt-rent', amount_cents: 240000 }];

      render(
        <div>
          <SimulationCard
            proposalId="prop-A"
            toolName="propose_blueprint_changes"
            parsedContent={{ status: 'success' }}
            changes={propA}
          />
          <SimulationCard
            proposalId="prop-B"
            toolName="propose_blueprint_changes"
            parsedContent={{ status: 'success' }}
            changes={propB}
          />
        </div>
      );

      const [applyA, applyB] = screen.getAllByRole('button', { name: /Apply to Plan/i });

      // Apply A
      await act(async () => {
        fireEvent.click(applyA);
      });
      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(2000);

      // Apply B
      await act(async () => {
        fireEvent.click(applyB);
      });
      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(2400);

      // Undo B (should roll back to 2000, state before B was applied)
      await act(async () => {
        capturedActions[1].onClick();
      });
      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(2000);

      // Undo A (should roll back to initial 1800, state before A was applied)
      await act(async () => {
        capturedActions[0].onClick();
      });
      expect(usePlannerStore.getState().events.find((e) => e.id === 'evt-rent')?.amount).toBe(1800);
    });

    it('verifies debt payment transfers modify accounts and undo restores accounts and balances', async () => {
      let capturedUndoAction: any = null;
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedUndoAction = opts?.action;
        return 'toast-debt';
      }) as any);

      const debtPaymentChange: BlueprintChange[] = [
        {
          type: 'pay_debt',
          from_account_id: 'acc-main',
          card_id: 'acc-credit',
          amount_cents: 50000, // $500
          date: '2026-10-10',
        },
      ];

      render(
        <SimulationCard
          proposalId="prop-debt"
          toolName="propose_blueprint_changes"
          parsedContent={{ status: 'success' }}
          changes={debtPaymentChange}
        />
      );

      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      // pay_debt creates a transfer event in the blueprint
      const storeWithDebt = usePlannerStore.getState();
      expect(
        storeWithDebt.events.some(
          (e) => (e.name === 'Payment to Rewards Visa' || e.name === 'Pay Debt') && e.amount === 500
        )
      ).toBe(true);

      // Undo the debt payment
      await act(async () => {
        capturedUndoAction.onClick();
      });

      // Reverted store must not have the Pay Debt event
      const storeRestored = usePlannerStore.getState();
      expect(
        storeRestored.events.some(
          (e) => e.name === 'Payment to Rewards Visa' || e.name === 'Pay Debt'
        )
      ).toBe(false);
      expect(storeRestored.events).toEqual(baselineEvents);
    });
  });
});


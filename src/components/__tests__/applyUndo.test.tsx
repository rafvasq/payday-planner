import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SimulationCard } from '../SimulationCard';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider, CHAT_STORAGE_KEY } from '../../context/ChatContext';
import { usePlannerStore, BlueprintSnapshot } from '../../store/usePlannerStore';
import { Account, Event } from '../../core/models';
import { BlueprintChange } from '../../core/tools';
import { toast, Toaster } from '../ui/sonner';

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

describe('Apply to Plan & Undo Mechanism (applyUndo)', () => {
  const initialAccounts: Account[] = [
    {
      id: 'acc-chequing',
      name: 'Main Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 3000,
      interest_rate: 0,
      target_floor: 500,
    },
  ];

  const initialEvents: Event[] = [
    {
      id: 'evt-gym',
      name: 'Gym Membership',
      event_type: 'outflow',
      amount: 60,
      from_account_id: 'acc-chequing',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: '2026-10-20',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];

  const proposalChanges: BlueprintChange[] = [
    {
      type: 'set_amount',
      event_id: 'evt-gym',
      amount_cents: 9500, // Change amount from 60 to 95
    },
  ];

  const mockProposalPayload = {
    status: 'success',
    diff: {
      affected_accounts: {
        'acc-chequing': {
          name: 'Main Chequing',
          lowest_balance_before: 2940,
          lowest_balance_after: 2905,
          lowest_balance_change: -35,
          first_breach_before: 'None',
          first_breach_after: 'None',
        },
      },
    },
    message: 'Proposal sent to user UI.',
    changes: proposalChanges,
  };

  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.setState({
      accounts: JSON.parse(JSON.stringify(initialAccounts)),
      events: JSON.parse(JSON.stringify(initialEvents)),
      executedEvents: {},
    });
    vi.clearAllMocks();
  });

  describe('1. "Apply to Plan" Execution and Toast Action', () => {
    it('calls applyBlueprintChangesWithSnapshot and fires 10-second toast with "Undo" action', async () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');
      const store = usePlannerStore.getState();
      const applyWithSnapshotSpy = vi.spyOn(store, 'applyBlueprintChangesWithSnapshot');

      render(
        <>
          <Toaster />
          <SimulationCard
            toolName="propose_blueprint_changes"
            proposalId="proposal-1"
            parsedContent={mockProposalPayload}
            changes={proposalChanges}
            accounts={initialAccounts}
            events={initialEvents}
          />
        </>
      );

      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      expect(applyBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(applyBtn);
      });

      // 1. Verify applyBlueprintChangesWithSnapshot was called
      expect(applyWithSnapshotSpy).toHaveBeenCalledTimes(1);

      // 2. Verify store was mutated with new event amount ($95)
      const updatedEvents = usePlannerStore.getState().events;
      const gymEvent = updatedEvents.find((e) => e.id === 'evt-gym');
      expect(gymEvent?.amount).toBe(95);

      // 3. Verify toast.success was called with Undo action
      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      const [toastMsg, toastOpts] = toastSuccessSpy.mock.calls[0];
      expect(toastMsg).toContain('Applied 1 change(s) to plan');
      expect(toastOpts?.duration).toBe(10000);
      expect(toastOpts?.action).toBeDefined();
      expect((toastOpts?.action as any)?.label).toBe('Undo');

      // 4. Verify card UI transitions to 'applied' state
      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.getByText('Changes successfully applied to plan')).toBeInTheDocument();
    });

    it('clicking "Undo" action on toast invokes restoreBlueprintSnapshot and reverts the store', async () => {
      let capturedToastAction: any = null;
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedToastAction = opts?.action;
        return 'toast-id';
      }) as any);
      const toastInfoSpy = vi.spyOn(toast, 'info');

      const store = usePlannerStore.getState();
      const restoreSnapshotSpy = vi.spyOn(store, 'restoreBlueprintSnapshot');

      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          proposalId="proposal-1"
          parsedContent={mockProposalPayload}
          changes={proposalChanges}
          accounts={initialAccounts}
          events={initialEvents}
        />
      );

      // Step 1: Click "Apply to Plan"
      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      expect(usePlannerStore.getState().events[0].amount).toBe(95);
      expect(capturedToastAction).not.toBeNull();
      expect(capturedToastAction.label).toBe('Undo');

      // Step 2: Invoke the Undo action callback
      await act(async () => {
        capturedToastAction.onClick();
      });

      // Verify restoreBlueprintSnapshot was called
      expect(restoreSnapshotSpy).toHaveBeenCalledTimes(1);

      // Verify store was restored back to initial state ($60)
      const restoredEvents = usePlannerStore.getState().events;
      expect(restoredEvents[0].amount).toBe(60);

      // Verify confirmation toast was fired
      expect(toastInfoSpy).toHaveBeenCalledWith('Plan changes undone', expect.anything());

      // Verify card status reverted back to pending (Apply button re-appears)
      expect(screen.getByRole('button', { name: /Apply to Plan/i })).toBeInTheDocument();
    });
  });

  describe('2. "Reject" Proposal Action', () => {
    it('sets proposal status to rejected cleanly without DOM manipulation hacks', async () => {
      const store = usePlannerStore.getState();
      const applyWithSnapshotSpy = vi.spyOn(store, 'applyBlueprintChangesWithSnapshot');
      const onStatusChangeMock = vi.fn();

      render(
        <SimulationCard
          toolName="propose_blueprint_changes"
          proposalId="proposal-1"
          parsedContent={mockProposalPayload}
          changes={proposalChanges}
          accounts={initialAccounts}
          events={initialEvents}
          onStatusChange={onStatusChangeMock}
        />
      );

      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      expect(rejectBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(rejectBtn);
      });

      // 1. Verify status changed to 'rejected'
      expect(onStatusChangeMock).toHaveBeenCalledWith('rejected');
      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check

      // 2. Verify Apply to Plan button is no longer present
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();

      // 3. Verify the store was NOT altered
      expect(applyWithSnapshotSpy).not.toHaveBeenCalled();
      expect(usePlannerStore.getState().events[0].amount).toBe(60);

      // 4. Verify the card remains in the React DOM tree (not hidden via style.display = 'none')
      const card = screen.getByTestId('simulation-card');
      expect(card).toBeInTheDocument();
      expect(card.style.display).not.toBe('none');
    });
  });

  describe('3. ChatPanel Integration with Proposal and Undo', () => {
    it('integrates proposal cards within conversation history and handles apply & reject', async () => {
      const history = [
        {
          role: 'user',
          content: 'Increase my gym membership to $95',
        },
        {
          role: 'assistant',
          content: 'I have proposed updating your gym membership bill.',
          tool_calls: [
            {
              id: 'call-gym-proposal',
              type: 'function',
              function: {
                name: 'propose_blueprint_changes',
                arguments: JSON.stringify({ changes: proposalChanges }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'propose_blueprint_changes',
          tool_call_id: 'call-gym-proposal',
          content: JSON.stringify(mockProposalPayload),
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

      // Simulation card is rendered with Proposed Changes
      expect(screen.getByText('Proposed Blueprint')).toBeInTheDocument();
      const applyBtn = screen.getByRole('button', { name: /Apply to Plan/i });
      expect(applyBtn).toBeInTheDocument();

      // Click Apply to Plan in ChatPanel
      await act(async () => {
        fireEvent.click(applyBtn);
      });

      // Verify store updated
      expect(usePlannerStore.getState().events[0].amount).toBe(95);
      expect(screen.getByText('Applied')).toBeInTheDocument();
    });

    it('rejecting a proposal in ChatPanel marks it rejected via React state without unmounting or DOM hacks', async () => {
      const history = [
        {
          role: 'user',
          content: 'Update gym bill',
        },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call-gym-proposal-2',
              type: 'function',
              function: {
                name: 'propose_blueprint_changes',
                arguments: JSON.stringify({ changes: proposalChanges }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'propose_blueprint_changes',
          tool_call_id: 'call-gym-proposal-2',
          content: JSON.stringify(mockProposalPayload),
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

      const rejectBtn = screen.getByRole('button', { name: /Reject/i });
      await act(async () => {
        fireEvent.click(rejectBtn);
      });

      // Verify card shows Rejected
      expect(screen.getByText('Rejected')).toBeInTheDocument();
      // removed Proposal rejected footer check
      expect(usePlannerStore.getState().events[0].amount).toBe(60);
    });
  });
});

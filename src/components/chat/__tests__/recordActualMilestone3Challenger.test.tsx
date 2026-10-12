import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecordActualCard, ActualChoice } from '../RecordActualCard';
import { ActualView } from '../../../core/ai/toolkit';
import { BalanceAdjustment } from '../../../core/ai/world';
import { ChatProvider, useChat } from '../../../context/ChatContext';
import { usePlannerStore } from '../../../store/usePlannerStore';
import { Account } from '../../../core/models';
import { toast } from '@/components/ui/sonner';
import { api } from '../../../lib/apiClient';

// Mock apiClient for ChatProvider mounting
vi.mock('../../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

// Helper component to access ChatContext methods directly
const ChatContextConsumer: React.FC<{
  onReady: (ctx: ReturnType<typeof useChat>) => void;
}> = ({ onReady }) => {
  const ctx = useChat();
  React.useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return null;
};

describe('Milestone 3 Empirical Challenger: RecordActualCard & 3-Choice Flow', () => {
  const baselineAccounts: Account[] = [
    {
      id: 'chq_r',
      name: 'R Chequing',
      type: 'chequing',
      owner: 'Rafael',
      balance: 4357.22,
      interest_rate: 0,
      target_floor: 1000,
    },
    {
      id: 'eq_hub',
      name: 'EQ Hub',
      type: 'savings',
      owner: 'Rafael',
      balance: 2486.54,
      interest_rate: 2.5,
      target_floor: 0,
    },
    {
      id: 'tfsa_wealth',
      name: 'Wealthsimple TFSA',
      type: 'savings',
      owner: 'Rafael',
      balance: 15000.0,
      interest_rate: 4.0,
      target_floor: 0,
    },
  ];

  const sampleActualView: ActualView = {
    description: 'Transfer $3,200.00 from R Chequing to EQ Hub',
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

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.getProvider as any).mockResolvedValue({
      provider: 'openai',
      analysis_model: 'gpt-4o',
    });
    (api.getModels as any).mockResolvedValue([]);
    usePlannerStore.setState({
      accounts: JSON.parse(JSON.stringify(baselineAccounts)),
      events: [],
      executedEvents: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Suite 1: Choice 1 - "Update my balances" & Snapshot Undo Integrity', () => {
    it('1.1: single account balance mutation updates usePlannerStore to exact dollars', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      const singleExpenseView: ActualView = {
        description: 'Grocery run at Costco',
        transactions: [{ from_account_id: 'chq_r', amount_cents: 15432, date: '2026-10-10' }],
        transaction_descriptions: ['Expense $154.32 from R Chequing'],
        adjustments: [
          { type: 'adjust_balance', account_id: 'chq_r', delta_cents: -15432, note: 'Costco' },
        ],
        accounts: [
          {
            id: 'chq_r',
            name: 'R Chequing',
            before_cents: 435722,
            after_cents: 420290, // 4357.22 - 154.32 = 4202.90
          },
        ],
        risks: [],
      };

      act(() => {
        chatCtx.applyRecordActual('update_balances', singleExpenseView, 'rec-single');
      });

      const updatedAccounts = usePlannerStore.getState().accounts;
      const chq = updatedAccounts.find((a) => a.id === 'chq_r');
      expect(chq?.balance).toBe(4202.9);
      expect(chatCtx.recordStatuses['rec-single']).toBe('applied');
    });

    it('1.2: multi-account transfer simultaneously updates source and destination balances to exact cents', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('update_balances', sampleActualView, 'rec-transfer');
      });

      const accounts = usePlannerStore.getState().accounts;
      const chq = accounts.find((a) => a.id === 'chq_r');
      const eq = accounts.find((a) => a.id === 'eq_hub');
      const tfsa = accounts.find((a) => a.id === 'tfsa_wealth');

      expect(chq?.balance).toBe(1157.22);
      expect(eq?.balance).toBe(5686.54);
      expect(tfsa?.balance).toBe(15000.0); // untouched account remains pristine
      expect(chatCtx.recordStatuses['rec-transfer']).toBe('applied');
    });

    it('1.3: triggers a 10s toast.success with an Undo action', () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('update_balances', sampleActualView, 'rec-toast-test');
      });

      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      const [msg, opts] = toastSuccessSpy.mock.calls[0];
      expect(msg).toContain('Updated balances for "Transfer $3,200.00 from R Chequing to EQ Hub"');
      expect(opts?.duration).toBe(10000);
      expect(opts?.action).toBeDefined();
      expect((opts?.action as any)?.label).toBe('Undo');
    });

    it('1.4: clicking toast Undo invokes restoreBlueprintSnapshot and cleanly reverts balances and status', () => {
      let capturedToastAction: any = null;
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedToastAction = opts?.action;
        return 'toast-1';
      }) as any);
      const toastInfoSpy = vi.spyOn(toast, 'info');

      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      // Perform update
      act(() => {
        chatCtx.applyRecordActual('update_balances', sampleActualView, 'rec-undo-target');
      });

      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'chq_r')?.balance).toBe(
        1157.22
      );
      expect(chatCtx.recordStatuses['rec-undo-target']).toBe('applied');

      // Click Undo action
      expect(capturedToastAction).toBeDefined();
      act(() => {
        capturedToastAction.onClick();
      });

      // Verify exact reversion to baseline
      const reverted = usePlannerStore.getState().accounts;
      expect(reverted.find((a) => a.id === 'chq_r')?.balance).toBe(4357.22);
      expect(reverted.find((a) => a.id === 'eq_hub')?.balance).toBe(2486.54);
      expect(reverted.find((a) => a.id === 'tfsa_wealth')?.balance).toBe(15000.0);

      // Verify status reset to pending and toast.info notification
      expect(chatCtx.recordStatuses['rec-undo-target']).toBe('pending');
      expect(toastInfoSpy).toHaveBeenCalledWith('Balance update undone', { duration: 3000 });
    });

    it('1.5: snapshot deep copy immutability prevents mutation leakage', () => {
      let capturedToastAction: any = null;
      vi.spyOn(toast, 'success').mockImplementation(((msg: any, opts: any) => {
        capturedToastAction = opts?.action;
        return 'toast-2';
      }) as any);

      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('update_balances', sampleActualView, 'rec-immutability');
      });

      // Tamper with the store post-snapshot
      act(() => {
        const accs = usePlannerStore.getState().accounts;
        accs[0].balance = 999999.99;
      });

      // Undo should still restore the true original (4357.22), not the tampered value
      act(() => {
        capturedToastAction.onClick();
      });

      const finalAccs = usePlannerStore.getState().accounts;
      expect(finalAccs.find((a) => a.id === 'chq_r')?.balance).toBe(4357.22);
    });

    it('1.6: falls back to actualView.adjustments delta_cents when actualView.accounts is omitted', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      const viewWithoutAccounts: ActualView = {
        description: 'Interest payout',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [
          {
            type: 'adjust_balance',
            account_id: 'eq_hub',
            delta_cents: 512, // +$5.12
            note: 'Interest',
          },
        ],
        accounts: [], // omitted
        risks: [],
      };

      act(() => {
        chatCtx.applyRecordActual('update_balances', viewWithoutAccounts, 'rec-adj-only');
      });

      const eq = usePlannerStore.getState().accounts.find((a) => a.id === 'eq_hub');
      // 2486.54 + 5.12 = 2491.66
      expect(eq?.balance).toBe(2491.66);
    });

    it('1.7: catches store exceptions and fires toast.error without crashing context', () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');
      vi.spyOn(usePlannerStore.getState(), 'applyBlueprintChangesWithSnapshot').mockImplementationOnce(
        () => {
          throw new Error('Disk quota exceeded');
        }
      );

      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      expect(() => {
        act(() => {
          chatCtx.applyRecordActual('update_balances', sampleActualView, 'rec-fail');
        });
      }).not.toThrow();

      expect(toastErrorSpy).toHaveBeenCalledWith('Failed to update balances');
    });
  });

  describe('Suite 2: Choice 2 - "Treat as landed (don\'t save)" & Scenario Tray Assumptions', () => {
    it('2.1: modifies scenarioAssumptions while leaving usePlannerStore balances 100% UNTOUCHED', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      const storeBefore = JSON.stringify(usePlannerStore.getState().accounts);

      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-landed-1');
      });

      // Verify store is completely unchanged
      const storeAfter = JSON.stringify(usePlannerStore.getState().accounts);
      expect(storeAfter).toBe(storeBefore);

      // Verify scenarioAssumptions received the assumption
      expect(chatCtx.scenarioAssumptions).toHaveLength(1);
      const asmp = chatCtx.scenarioAssumptions[0];
      expect(asmp.id).toBe('assumption-rec-landed-1');
      expect(asmp.enabled).toBe(true);
      expect(asmp.label).toContain('Transfer $3,200.00 from R Chequing to EQ Hub');
      expect(asmp.changes).toEqual(sampleActualView.adjustments);

      // Verify record status
      expect(chatCtx.recordStatuses['rec-landed-1']).toBe('assumed');
    });

    it('2.2: derives active assumptions into context assumptions list for subsequent simulations', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-landed-2');
      });

      // assumptions getter should flatten enabled scenario changes
      expect(chatCtx.assumptions).toHaveLength(2);
      expect((chatCtx.assumptions[0] as BalanceAdjustment).account_id).toBe('chq_r');
      expect((chatCtx.assumptions[1] as BalanceAdjustment).account_id).toBe('eq_hub');
      expect(chatCtx.assumptionLabels).toContain(
        'Assumed landed: Transfer $3,200.00 from R Chequing to EQ Hub'
      );
    });

    it('2.3: deduplicates existing assumption if same recordId is submitted multiple times', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-dedup');
      });
      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-dedup');
      });

      expect(chatCtx.scenarioAssumptions).toHaveLength(1);
      expect(chatCtx.scenarioAssumptions[0].id).toBe('assumption-rec-dedup');
    });

    it('2.4: toggleAssumption disables assumption and removes it from active assumptions', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-toggle');
      });

      expect(chatCtx.assumptions).toHaveLength(2);

      // Disable assumption
      act(() => {
        chatCtx.toggleAssumption('assumption-rec-toggle');
      });

      expect(chatCtx.scenarioAssumptions[0].enabled).toBe(false);
      expect(chatCtx.assumptions).toHaveLength(0);
      expect(chatCtx.assumptionLabels).toHaveLength(0);

      // Re-enable assumption
      act(() => {
        chatCtx.toggleAssumption('assumption-rec-toggle');
      });

      expect(chatCtx.scenarioAssumptions[0].enabled).toBe(true);
      expect(chatCtx.assumptions).toHaveLength(2);
    });

    it('2.5: removeAssumption completely deletes assumption from scenarioAssumptions', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      act(() => {
        chatCtx.applyRecordActual('treat_as_landed', sampleActualView, 'rec-remove');
      });

      expect(chatCtx.scenarioAssumptions).toHaveLength(1);

      act(() => {
        chatCtx.removeAssumption('assumption-rec-remove');
      });

      expect(chatCtx.scenarioAssumptions).toHaveLength(0);
      expect(chatCtx.assumptions).toHaveLength(0);
    });
  });

  describe('Suite 3: Choice 3 - "Already in my balances" Zero-Mutation Invariant', () => {
    it('3.1: leaves usePlannerStore balances and scenarioAssumptions completely untouched', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      const storeSnapshot = JSON.stringify(usePlannerStore.getState().accounts);

      act(() => {
        chatCtx.applyRecordActual('already_in_balances', sampleActualView, 'rec-ack');
      });

      // Planner store is untouched
      expect(JSON.stringify(usePlannerStore.getState().accounts)).toBe(storeSnapshot);

      // Scenario assumptions are untouched (length 0)
      expect(chatCtx.scenarioAssumptions).toHaveLength(0);
      expect(chatCtx.assumptions).toHaveLength(0);

      // Record status is set to acknowledged
      expect(chatCtx.recordStatuses['rec-ack']).toBe('acknowledged');
    });
  });

  describe('Suite 4: Risk Callout Presentation & Stress Cases', () => {
    it('4.1: prominently renders risk-callout when single risk warning is present', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      const callout = screen.getByTestId('risk-callout');
      expect(callout).toBeInTheDocument();
      expect(screen.getByText('New Risk Warning')).toBeInTheDocument();
      expect(
        screen.getByText('R Chequing would project -$1,211.92 on Oct 21 (overdraft).')
      ).toBeInTheDocument();
    });

    it('4.2: renders multiple risk warnings distinctly when multiple risks are flagged', () => {
      const multiRiskView: ActualView = {
        ...sampleActualView,
        risks: [
          'R Chequing would project -$1,211.92 on Oct 21 (overdraft).',
          'EQ Hub dips to $240.00 on Oct 28, below its $500.00 floor.',
          'Rent payment on Nov 01 will fail due to insufficient funds.',
        ],
      };

      render(<RecordActualCard actualView={multiRiskView} />);

      const callout = screen.getByTestId('risk-callout');
      expect(callout).toBeInTheDocument();
      expect(
        screen.getByText('R Chequing would project -$1,211.92 on Oct 21 (overdraft).')
      ).toBeInTheDocument();
      expect(
        screen.getByText('EQ Hub dips to $240.00 on Oct 28, below its $500.00 floor.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Rent payment on Nov 01 will fail due to insufficient funds.')
      ).toBeInTheDocument();
    });

    it('4.3: completely omits risk-callout when risks list is empty', () => {
      const emptyRisksView: ActualView = {
        ...sampleActualView,
        risks: [],
      };

      render(<RecordActualCard actualView={emptyRisksView} />);

      expect(screen.queryByTestId('risk-callout')).not.toBeInTheDocument();
      expect(screen.queryByText('New Risk Warning')).not.toBeInTheDocument();
    });

    it('4.4: safely handles undefined or null risks without runtime errors', () => {
      const undefinedRisksView: ActualView = {
        ...sampleActualView,
        risks: undefined as any,
      };

      render(<RecordActualCard actualView={undefinedRisksView} />);

      expect(screen.queryByTestId('risk-callout')).not.toBeInTheDocument();
    });
  });

  describe('Suite 5: Currency Formatting & Overdraft Destructive Styling', () => {
    it('5.1: formats positive balance change with emerald styling and "+" prefix', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      const posChange = screen.getByText('+$3,200.00');
      expect(posChange).toBeInTheDocument();
      expect(posChange.className).toMatch(/text-emerald-600/);
    });

    it('5.2: formats negative balance change with destructive styling and "-" prefix', () => {
      render(<RecordActualCard actualView={sampleActualView} />);

      const negChange = screen.getByText('-$3,200.00');
      expect(negChange).toBeInTheDocument();
      expect(negChange.className).toMatch(/text-destructive/);
    });

    it('5.3: formats zero delta without "+" or "-" and with muted styling', () => {
      const zeroDeltaView: ActualView = {
        ...sampleActualView,
        accounts: [
          {
            id: 'chq_r',
            name: 'R Chequing',
            before_cents: 100000,
            after_cents: 100000,
          },
        ],
      };

      render(<RecordActualCard actualView={zeroDeltaView} />);

      const zeroCell = screen.getByText('$0.00');
      expect(zeroCell.className).toMatch(/text-muted-foreground/);
    });

    it('5.4: applies destructive styling to after-balance cell when negative (overdraft)', () => {
      const overdraftView: ActualView = {
        ...sampleActualView,
        accounts: [
          {
            id: 'chq_r',
            name: 'R Chequing',
            before_cents: 20000, // $200.00
            after_cents: -30000, // -$300.00
          },
        ],
      };

      render(<RecordActualCard actualView={overdraftView} />);

      const afterCell = screen.getByText('-$300.00');
      expect(afterCell.className).toMatch(/text-destructive/);
    });

    it('5.5: formats cent amounts accurately across large ranges and precision edges', () => {
      const rangeView: ActualView = {
        ...sampleActualView,
        accounts: [
          {
            id: 'acc-cent',
            name: 'One Cent',
            before_cents: 0,
            after_cents: 1, // $0.01
          },
          {
            id: 'acc-large',
            name: 'Large Balance',
            before_cents: 100000000, // $1,000,000.00
            after_cents: 99999999, // $999,999.99
          },
        ],
      };

      render(<RecordActualCard actualView={rangeView} />);

      expect(screen.getByText('$0.01')).toBeInTheDocument();
      expect(screen.getByText('+$0.01')).toBeInTheDocument();
      expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
      expect(screen.getByText('$999,999.99')).toBeInTheDocument();
    });

    it('5.6: applies text-destructive to both after and delta cells when worsening an existing overdraft', () => {
      const worseningOverdraftView: ActualView = {
        ...sampleActualView,
        accounts: [
          {
            id: 'chq_r',
            name: 'R Chequing',
            before_cents: -50000, // -$500.00
            after_cents: -80000, // -$800.00 (delta -$300.00)
          },
        ],
      };

      render(<RecordActualCard actualView={worseningOverdraftView} />);

      const afterCell = screen.getByText('-$800.00');
      const deltaCell = screen.getByText('-$300.00');

      expect(afterCell.className).toMatch(/text-destructive/);
      expect(deltaCell.className).toMatch(/text-destructive/);
    });

    it('5.7: handles multi-way split transfer across 3 accounts with net-zero sum', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
        </ChatProvider>
      );

      const splitView: ActualView = {
        description: 'Split transfer $1,000 out of chequing to EQ ($600) and TFSA ($400)',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [
          { type: 'adjust_balance', account_id: 'chq_r', delta_cents: -100000 },
          { type: 'adjust_balance', account_id: 'eq_hub', delta_cents: 60000 },
          { type: 'adjust_balance', account_id: 'tfsa_wealth', delta_cents: 40000 },
        ],
        accounts: [
          { id: 'chq_r', name: 'R Chequing', before_cents: 435722, after_cents: 335722 },
          { id: 'eq_hub', name: 'EQ Hub', before_cents: 248654, after_cents: 308654 },
          { id: 'tfsa_wealth', name: 'Wealthsimple TFSA', before_cents: 1500000, after_cents: 1540000 },
        ],
        risks: [],
      };

      act(() => {
        chatCtx.applyRecordActual('update_balances', splitView, 'rec-split');
      });

      const accs = usePlannerStore.getState().accounts;
      expect(accs.find((a) => a.id === 'chq_r')?.balance).toBe(3357.22);
      expect(accs.find((a) => a.id === 'eq_hub')?.balance).toBe(3086.54);
      expect(accs.find((a) => a.id === 'tfsa_wealth')?.balance).toBe(15400.0);
    });
  });

  describe('Suite 6: Interactive End-to-End Component Integration', () => {
    it('6.1: clicking "Update my balances" in full interactive card calls applyRecordActual and renders applied badge', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      const handleChoice = vi.fn((choice: ActualChoice) => {
        chatCtx.applyRecordActual(choice, sampleActualView, 'tool-interactive-1');
      });

      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
          <RecordActualCard
            actualView={sampleActualView}
            toolCallId="tool-interactive-1"
            onChoice={handleChoice}
          />
        </ChatProvider>
      );

      const updateBtn = screen.getByTestId('choice-update-balances');
      fireEvent.click(updateBtn);

      expect(handleChoice).toHaveBeenCalledWith('update_balances');
      expect(screen.getByText('Balances Updated')).toBeInTheDocument();
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();

      // Planner store was mutated
      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'chq_r')?.balance).toBe(
        1157.22
      );
    });

    it('6.2: clicking "Treat as landed" in full interactive card adds assumption and renders assumed badge', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      const handleChoice = vi.fn((choice: ActualChoice) => {
        chatCtx.applyRecordActual(choice, sampleActualView, 'tool-interactive-2');
      });

      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
          <RecordActualCard
            actualView={sampleActualView}
            toolCallId="tool-interactive-2"
            onChoice={handleChoice}
          />
        </ChatProvider>
      );

      const treatBtn = screen.getByTestId('choice-treat-as-landed');
      fireEvent.click(treatBtn);

      expect(handleChoice).toHaveBeenCalledWith('treat_as_landed');
      expect(screen.getByText('Assumed Landed')).toBeInTheDocument();
      expect(
        screen.getByText('Added to Scenario Tray as active assumption')
      ).toBeInTheDocument();

      // Planner store accounts are untouched
      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'chq_r')?.balance).toBe(
        4357.22
      );
      // Assumption exists in context
      expect(chatCtx.scenarioAssumptions.find((a) => a.id === 'assumption-tool-interactive-2')).toBeDefined();
    });

    it('6.3: clicking "Already in my balances" in full interactive card renders acknowledged badge with zero mutations', () => {
      let chatCtx!: ReturnType<typeof useChat>;
      const handleChoice = vi.fn((choice: ActualChoice) => {
        chatCtx.applyRecordActual(choice, sampleActualView, 'tool-interactive-3');
      });

      render(
        <ChatProvider>
          <ChatContextConsumer onReady={(c) => (chatCtx = c)} />
          <RecordActualCard
            actualView={sampleActualView}
            toolCallId="tool-interactive-3"
            onChoice={handleChoice}
          />
        </ChatProvider>
      );

      const ackBtn = screen.getByTestId('choice-already-in-balances');
      fireEvent.click(ackBtn);

      expect(handleChoice).toHaveBeenCalledWith('already_in_balances');
      expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      expect(
        screen.getByText('Acknowledged: already reflected in balances')
      ).toBeInTheDocument();

      // No mutations
      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'chq_r')?.balance).toBe(
        4357.22
      );
      expect(chatCtx.scenarioAssumptions).toHaveLength(0);
    });
  });
});

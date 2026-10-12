import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ContextInspector } from '../ContextInspector';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { usePlannerStore } from '@/store/usePlannerStore';
import { Account, Event } from '@/core/models';
import { toast } from '@/components/ui/sonner';

// Mock apiClient for ChatProvider mounting
vi.mock('@/lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('ContextInspector Component (Requirement R4)', () => {
  const sampleAccounts: Account[] = [
    {
      id: 'acc-chq',
      name: 'Main Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 4357.22,
      target_floor: 1000.0,
    },
    {
      id: 'acc-eq',
      name: 'EQ Savings',
      type: 'savings',
      owner: 'User',
      balance: 2486.54,
      target_floor: 3000.0, // Floor is 3000 -> headroom is negative: 2486.54 - 3000 = -513.46
    },
    {
      id: 'acc-invest',
      name: 'TFSA Investment',
      type: 'investment',
      owner: 'User',
      balance: 15000.0,
      target_floor: null, // No floor -> headroom is —
    },
  ];

  const sampleEvents: Event[] = [
    {
      id: 'evt-rent',
      name: 'Rent',
      event_type: 'outflow',
      amount: 1800,
      anchor_date: '2026-10-01',
      frequency: 'monthly',
      from_account_id: 'acc-chq',
      to_account_id: null,
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    usePlannerStore.setState({
      accounts: sampleAccounts,
      events: sampleEvents,
      executedEvents: { '2026-10-01_evt-rent': true },
      startingBalancesReflectToday: true,
    });
  });

  describe('1. Drawer Rendering & Open/Close Toggle Behavior', () => {
    it('renders the drawer when open={true}', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
      expect(screen.getByText('Context Inspector')).toBeInTheDocument();
    });

    it('does not render drawer content when open={false}', () => {
      render(<ContextInspector open={false} />);

      expect(screen.queryByTestId('context-inspector-drawer')).not.toBeInTheDocument();
    });

    it('calls onOpenChange callback when provided', () => {
      const onOpenChangeSpy = vi.fn();
      render(<ContextInspector open={true} onOpenChange={onOpenChangeSpy} />);

      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
      // Test unmount / controlled change
      expect(onOpenChangeSpy).not.toHaveBeenCalled();
    });

    it('derives open state from ChatContext when open prop is omitted', async () => {
      const TestConsumer = () => {
        const { setIsInspectorOpen } = useChat();
        return (
          <div>
            <button onClick={() => setIsInspectorOpen(true)}>Open Inspector</button>
            <ContextInspector />
          </div>
        );
      };

      render(
        <ChatProvider>
          <TestConsumer />
        </ChatProvider>
      );

      // Initially closed
      expect(screen.queryByTestId('context-inspector-drawer')).not.toBeInTheDocument();

      // Click to open
      fireEvent.click(screen.getByText('Open Inspector'));

      await waitFor(() => {
        expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
      });
    });
  });

  describe('2. Metadata & Engine Flags Display', () => {
    it('displays As-of timestamp and Snapshot ID hash', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByText('As-of Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Snapshot ID')).toBeInTheDocument();

      // Snapshot ID is an 8-character hex string
      const snapshotBadge = screen.getByText(/^[0-9a-f]{8}$/i);
      expect(snapshotBadge).toBeInTheDocument();
    });

    it('displays engine flags (balancesReflectToday and executedEvents count)', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByText('Engine Flags')).toBeInTheDocument();
      expect(screen.getByText('balancesReflectToday')).toBeInTheDocument();
      expect(screen.getByText('true')).toBeInTheDocument();

      expect(screen.getByText('executedEvents count')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // 1 executed event
    });
  });

  describe('3. Active Assumptions Display', () => {
    it('displays empty state when no assumptions are present', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByText('Active Assumptions')).toBeInTheDocument();
      expect(
        screen.getByText('No active scenario assumptions layered over projections.')
      ).toBeInTheDocument();
    });

    it('displays active assumptions count and labels when populated in ChatContext', async () => {
      const TestConsumerWithAssumptions = () => {
        const { addAssumption } = useChat();
        return (
          <div>
            <button
              onClick={() => {
                addAssumption('Skip "Vault sweep" Oct 15', [
                  { type: 'skip_event', event_id: 'evt-vault', date: '2026-10-15' },
                ]);
                addAssumption('Assumed landed: $3,200 transfer', [
                  { type: 'adjust_balance', account_id: 'acc-chq', delta_cents: 320000 },
                ]);
              }}
            >
              Seed Assumptions
            </button>
            <ContextInspector open={true} />
          </div>
        );
      };

      render(
        <ChatProvider>
          <TestConsumerWithAssumptions />
        </ChatProvider>
      );

      fireEvent.click(screen.getByText('Seed Assumptions'));

      await waitFor(() => {
        expect(screen.getByText('Skip "Vault sweep" Oct 15')).toBeInTheDocument();
        expect(screen.getByText('Assumed landed: $3,200 transfer')).toBeInTheDocument();
      });
    });
  });

  describe('4. Accounts Table with CAD Balances & Headroom', () => {
    it('renders accounts table headers', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByText('Accounts Table (3)')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Starting (CAD)')).toBeInTheDocument();
      expect(screen.getByText('Floor')).toBeInTheDocument();
      expect(screen.getByText('Headroom')).toBeInTheDocument();
    });

    it('formats account balances in CAD currency', () => {
      render(<ContextInspector open={true} />);

      // Main Chequing
      expect(screen.getByText('Main Chequing')).toBeInTheDocument();
      expect(screen.getByText('$4,357.22')).toBeInTheDocument();
      expect(screen.getByText('$1,000.00')).toBeInTheDocument(); // Target floor

      // Positive headroom: 4357.22 - 1000 = $3,357.22
      expect(screen.getByText('$3,357.22')).toBeInTheDocument();

      // EQ Savings
      expect(screen.getByText('EQ Savings')).toBeInTheDocument();
      expect(screen.getAllByText('$2,486.54').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('$3,000.00')).toBeInTheDocument(); // Target floor

      // Negative headroom (below floor): 2486.54 - 3000 = -$513.46
      const negativeHeadroom = screen.getByText('-$513.46');
      expect(negativeHeadroom).toBeInTheDocument();
      expect(negativeHeadroom.className).toContain('text-destructive');

      // TFSA Investment (no floor)
      expect(screen.getByText('TFSA Investment')).toBeInTheDocument();
      expect(screen.getByText('$15,000.00')).toBeInTheDocument();
      // Renders '—' for missing floor & headroom
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('handles negative overdraft balances cleanly', () => {
      usePlannerStore.setState({
        accounts: [
          {
            id: 'acc-overdrawn',
            name: 'Overdrawn Chequing',
            type: 'chequing',
            owner: 'User',
            balance: -350.5,
            target_floor: 0,
          },
        ],
      });

      render(<ContextInspector open={true} />);

      expect(screen.getByText('Overdrawn Chequing')).toBeInTheDocument();
      expect(screen.getAllByText('-$350.50').length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty accounts list without crashing', () => {
      usePlannerStore.setState({ accounts: [] });
      render(<ContextInspector open={true} />);

      expect(screen.getByText('Accounts Table (0)')).toBeInTheDocument();
    });
  });

  describe('5. FigureChip Provenance Legend Display', () => {
    it('renders the provenance legend with all 4 classifications', () => {
      render(<ContextInspector open={true} />);

      expect(screen.getByText('FigureChip Provenance Legend')).toBeInTheDocument();

      // 1. Engine
      expect(screen.getByText('Engine')).toBeInTheDocument();
      expect(screen.getByText('Exact match from live projection')).toBeInTheDocument();
      expect(screen.getAllByText('$2,486.54').length).toBeGreaterThanOrEqual(1);

      // 2. Derived
      expect(screen.getByText('Derived')).toBeInTheDocument();
      expect(screen.getByText('Arithmetic combination of engine figures')).toBeInTheDocument();
      expect(screen.getByText('$5,686.54')).toBeInTheDocument();

      // 3. User-Stated
      expect(screen.getByText('User-Stated')).toBeInTheDocument();
      expect(screen.getByText('Quoted directly from conversation history')).toBeInTheDocument();
      expect(screen.getByText('$500.00')).toBeInTheDocument();

      // 4. Unverified
      expect(screen.getByText('Unverified')).toBeInTheDocument();
      expect(screen.getByText('Not found in engine output — caution')).toBeInTheDocument();
      expect(screen.getByText('$999.00')).toBeInTheDocument();
    });
  });

  describe('6. Copy Context Button & Clipboard API', () => {
    it('copies formatted JSON context to clipboard on button click', async () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');

      render(<ContextInspector open={true} />);

      const copyBtn = screen.getByRole('button', { name: /Copy context/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledTimes(1);
        const copiedPayload = JSON.parse(writeTextSpy.mock.calls[0][0]);
        expect(copiedPayload).toHaveProperty('as_of');
        expect(copiedPayload).toHaveProperty('snapshot_id');
        expect(copiedPayload.engine_flags).toEqual({
          balancesReflectToday: true,
          executedEventsCount: 1,
        });
        expect(copiedPayload.accounts).toHaveLength(3);
        expect(copiedPayload.accounts[0].name).toBe('Main Chequing');
        expect(copiedPayload.accounts[0].starting_balance_cad).toBe('$4,357.22');

        expect(toastSuccessSpy).toHaveBeenCalledWith('Context copied to clipboard');
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('handles clipboard failure gracefully with toast.error', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Clipboard blocked'));

      render(<ContextInspector open={true} />);

      const copyBtn = screen.getByRole('button', { name: /Copy context/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith('Failed to copy context');
      });
    });
  });

  describe('7. Dynamic Snapshot Hash Reactivity', () => {
    it('updates snapshot ID hash when planner store state changes', () => {
      const { rerender } = render(<ContextInspector open={true} />);

      const initialHashEl = screen.getByText(/^[0-9a-f]{8}$/i);
      const initialHash = initialHashEl.textContent;

      // Mutate planner store
      act(() => {
        usePlannerStore.setState({
          accounts: [
            { ...sampleAccounts[0], balance: 99999.99 },
            sampleAccounts[1],
            sampleAccounts[2],
          ],
        });
      });

      rerender(<ContextInspector open={true} />);

      const updatedHashEl = screen.getByText(/^[0-9a-f]{8}$/i);
      expect(updatedHashEl.textContent).not.toBe(initialHash);
    });

    it('merges custom className prop on drawer', () => {
      render(<ContextInspector open={true} className="custom-inspector-drawer shadow-2xl" />);

      const drawer = screen.getByTestId('context-inspector-drawer');
      expect(drawer.className).toContain('custom-inspector-drawer');
      expect(drawer.className).toContain('shadow-2xl');
    });
  });
});

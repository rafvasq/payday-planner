import React, { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RecordActualCard, ActualChoice, RecordActualStatus } from '../RecordActualCard';
import { ScenarioTray } from '../ScenarioTray';
import { StepTrace, StepDetail } from '../StepTrace';
import { ContextInspector } from '../ContextInspector';
import { StalenessPill, getPlannerSnapshotId } from '../StalenessPill';
import { FigureChip } from '../FigureChip';
import { GroundingBadge } from '../GroundingBadge';
import { ChatPanel } from '../../ChatPanel';
import {
  ChatProvider,
  useChat,
  ChatContextType,
  ChatMessage,
  ScenarioAssumption,
} from '@/context/ChatContext';
import { usePlannerStore } from '@/store/usePlannerStore';
import { Account, Event } from '@/core/models';
import { ActualView, ToolExecution, FigureSource, prettyDate } from '@/core/ai/toolkit';
import { ScenarioChange, snapshotId } from '@/core/ai/world';
import { toast } from '@/components/ui/sonner';

// Mock Sonner toast for inspecting success, error, info calls
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => <div data-testid="mock-toaster" />,
}));

// Mock apiClient to prevent real network calls during ChatProvider mount/streaming
vi.mock('@/lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('Tier 5 Adversarial Coverage Hardening: Chat UI & Context State Audit', () => {
  const sampleAccounts: Account[] = [
    {
      id: 'acc-chequing',
      name: 'Primary Chequing',
      type: 'chequing',
      owner: 'User',
      balance: 2450.5,
      target_floor: 500,
    },
    {
      id: 'acc-savings',
      name: 'High Interest Savings',
      type: 'savings',
      owner: 'User',
      balance: 10200.0,
      target_floor: 2000,
    },
    {
      id: 'acc-credit',
      name: 'Visa Card',
      type: 'debt',
      owner: 'User',
      balance: -450.0,
      target_floor: null,
    },
  ];

  const sampleEvents: Event[] = [
    {
      id: 'evt-rent',
      name: 'Rent',
      event_type: 'outflow',
      amount: 1200,
      anchor_date: '2026-10-01',
      frequency: 'monthly',
      from_account_id: 'acc-chequing',
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
      executedEvents: {},
      startingBalancesReflectToday: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Helper component to capture and interact with ChatContext directly
  const ChatContextSpy: React.FC<{
    onContext: (ctx: ChatContextType) => void;
  }> = ({ onContext }) => {
    const ctx = useChat();
    useEffect(() => {
      onContext(ctx);
    }, [ctx, onContext]);
    return null;
  };

  // ============================================================================
  // SUITE 1: RAPID SEQUENTIAL INTERACTIONS & IN-FLIGHT CONCURRENCY
  // ============================================================================
  describe('Suite 1: Rapid Sequential Interactions & In-Flight Concurrency', () => {
    it('handles 50 rapid sequential toggles and removals in ScenarioTray without race conditions', async () => {
      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
            <ScenarioTray />
          </ChatProvider>
        );
      });

      // Create 5 assumptions
      const ids: string[] = [];
      act(() => {
        for (let i = 0; i < 5; i++) {
          const id = chatContext.addAssumption(`Assumption #${i + 1}`, [
            {
              type: 'adjust_balance',
              account_id: 'acc-chequing',
              delta_cents: (i + 1) * 10000,
            },
          ]);
          ids.push(id);
        }
      });

      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      expect(chatContext.scenarioAssumptions.length).toBe(5);

      // Fire 50 rapid sequential toggles across random items
      act(() => {
        for (let step = 0; step < 50; step++) {
          const targetId = ids[step % ids.length];
          chatContext.toggleAssumption(targetId);
        }
      });

      // 50 toggles across 5 items means each item was toggled 10 times (even -> starts enabled -> remains enabled)
      expect(chatContext.scenarioAssumptions.every((a) => a.enabled)).toBe(true);
      expect(chatContext.assumptions.length).toBe(5);

      // Rapidly toggle one item once more -> becomes disabled
      act(() => {
        chatContext.toggleAssumption(ids[0]);
      });
      expect(chatContext.scenarioAssumptions.find((a) => a.id === ids[0])?.enabled).toBe(false);
      // Flat assumptions array now excludes the disabled item
      expect(chatContext.assumptions.length).toBe(4);

      // Rapidly remove 2 items while toggling another
      act(() => {
        chatContext.removeAssumption(ids[0]);
        chatContext.toggleAssumption(ids[1]);
        chatContext.removeAssumption(ids[4]);
      });

      expect(chatContext.scenarioAssumptions.length).toBe(3);
      expect(chatContext.scenarioAssumptions.find((a) => a.id === ids[0])).toBeUndefined();
      expect(chatContext.scenarioAssumptions.find((a) => a.id === ids[4])).toBeUndefined();
    });

    it('handles concurrent RecordActual choices across multiple in-flight cards without status contamination', async () => {
      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
          </ChatProvider>
        );
      });

      const actualViewA: ActualView = {
        description: 'Grocery store trip',
        transactions: [],
        transaction_descriptions: [],
        risks: [],
        accounts: [{ id: 'acc-chequing', name: 'Chequing', before_cents: 245050, after_cents: 235050 }],
        adjustments: [{ type: 'adjust_balance', account_id: 'acc-chequing', delta_cents: -10000 }],
      };

      const actualViewB: ActualView = {
        description: 'Cheque deposit landed',
        transactions: [],
        transaction_descriptions: [],
        risks: [],
        accounts: [{ id: 'acc-chequing', name: 'Chequing', before_cents: 245050, after_cents: 295050 }],
        adjustments: [{ type: 'adjust_balance', account_id: 'acc-chequing', delta_cents: 50000 }],
      };

      const actualViewC: ActualView = {
        description: 'Already accounted bill',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        risks: [],
        accounts: [{ id: 'acc-chequing', name: 'Chequing', before_cents: 245050, after_cents: 245050 }],
      };

      // Dispatch 3 choices in flight: A updates balances, B assumes landed, C acknowledges
      act(() => {
        chatContext.applyRecordActual('update_balances', actualViewA, 'card-A');
        chatContext.applyRecordActual('treat_as_landed', actualViewB, 'card-B');
        chatContext.applyRecordActual('already_in_balances', actualViewC, 'card-C');
      });

      // Statuses are strictly segregated by card ID
      expect(chatContext.recordStatuses['card-A']).toBe('applied');
      expect(chatContext.recordStatuses['card-B']).toBe('assumed');
      expect(chatContext.recordStatuses['card-C']).toBe('acknowledged');

      // Card A mutated store balance
      const storeAcc = usePlannerStore.getState().accounts.find((a) => a.id === 'acc-chequing');
      expect(storeAcc?.balance).toBe(2350.5);

      // Card B added assumption to scenario tray
      expect(chatContext.scenarioAssumptions.some((a) => a.id === 'assumption-card-B')).toBe(true);

      // Card C made no assumptions and no balance modifications
      expect(chatContext.scenarioAssumptions.some((a) => a.id === 'assumption-card-C')).toBe(false);
    });

    it('interleaves Undo of a balance update while an assumption is active without corrupting tray assumptions', async () => {
      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
          </ChatProvider>
        );
      });

      const actualView: ActualView = {
        description: 'Freelance payment',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        risks: [],
        accounts: [{ id: 'acc-chequing', name: 'Chequing', before_cents: 245050, after_cents: 345050 }],
      };

      // 1. Update balances for Card 1
      act(() => {
        chatContext.applyRecordActual('update_balances', actualView, 'call-1');
      });

      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'acc-chequing')?.balance).toBe(3450.5);
      expect(chatContext.recordStatuses['call-1']).toBe('applied');

      // 2. Add an assumption to ScenarioTray
      act(() => {
        chatContext.addAssumption('Side gig assumed', [
          { type: 'adjust_balance', account_id: 'acc-savings', delta_cents: 20000 },
        ]);
      });
      expect(chatContext.scenarioAssumptions.length).toBe(1);

      // 3. Extract the Undo action from the toast mock
      const toastSuccessCalls = vi.mocked(toast.success).mock.calls;
      const lastCall = toastSuccessCalls[toastSuccessCalls.length - 1];
      expect(lastCall[0]).toContain('Updated balances for "Freelance payment"');
      const undoAction = (lastCall[1] as any)?.action?.onClick;
      expect(typeof undoAction).toBe('function');

      // 4. Trigger Undo
      act(() => {
        undoAction();
      });

      // Balances reverted
      expect(usePlannerStore.getState().accounts.find((a) => a.id === 'acc-chequing')?.balance).toBe(2450.5);
      // Status reverted to pending
      expect(chatContext.recordStatuses['call-1']).toBe('pending');
      // Toast info confirmed
      expect(toast.info).toHaveBeenCalledWith('Balance update undone', expect.anything());
      // The scenario assumption in tray is completely unaffected!
      expect(chatContext.scenarioAssumptions.length).toBe(1);
      expect(chatContext.scenarioAssumptions[0].label).toBe('Side gig assumed');
    });

    it('prevents duplicate action execution when user rapidly double clicks a choice button on RecordActualCard', () => {
      const onChoiceMock = vi.fn();
      const actualView: ActualView = {
        description: 'Dinner expense',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        risks: [],
        accounts: [{ id: 'acc-chequing', name: 'Chequing', before_cents: 245050, after_cents: 240050 }],
      };

      render(
        <RecordActualCard
          actualView={actualView}
          status="pending"
          onChoice={onChoiceMock}
          toolCallId="tc-rapid"
        />
      );

      const updateBtn = screen.getByTestId('choice-update-balances');

      // Rapidly fire 3 clicks in same tick
      act(() => {
        fireEvent.click(updateBtn);
        // After first click, status transitions to applied, removing action buttons
      });

      expect(onChoiceMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('choice-update-balances')).not.toBeInTheDocument();
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SUITE 2: COMPONENT EDGE CASES: MISSING PROPS, EMPTY ARRAYS, NULLISH VALUES
  // ============================================================================
  describe('Suite 2: Component Edge Cases: Missing Props, Empty Arrays & Malformed Values', () => {
    it('renders RecordActualCard gracefully with empty/nullish actualView object', () => {
      // Degenerate actualView with missing optional arrays and properties
      const emptyActualView = {} as ActualView;

      render(<RecordActualCard actualView={emptyActualView} />);

      expect(screen.getByTestId('record-actual-card')).toBeInTheDocument();
      expect(screen.getAllByText('Recorded Transaction').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('record-actual-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('risk-callout')).not.toBeInTheDocument();
    });

    it('renders RecordActualCard table correctly with zero change, negative balances, and negative headroom', () => {
      const edgeActualView: ActualView = {
        description: 'Negative balance overdraft test',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        accounts: [
          {
            id: 'acc-1',
            name: 'Zero Change Account',
            before_cents: 10000,
            after_cents: 10000, // diff = 0
          },
          {
            id: 'acc-2',
            name: 'Overdraft Account',
            before_cents: 5000,
            after_cents: -2500, // diff = -7500, after < 0
          },
          {
            id: 'acc-3',
            name: 'Positive Inflow Account',
            before_cents: 2000,
            after_cents: 8000, // diff = +6000
          },
        ],
        risks: ['Severe overdraft potential in Overdraft Account'],
      };

      render(<RecordActualCard actualView={edgeActualView} status="pending" />);

      expect(screen.getByTestId('record-actual-table')).toBeInTheDocument();
      expect(screen.getByText('Zero Change Account')).toBeInTheDocument();
      expect(screen.getByText('Overdraft Account')).toBeInTheDocument();
      expect(screen.getByText('Positive Inflow Account')).toBeInTheDocument();

      // Zero change text format
      expect(screen.getByText('$0.00')).toBeInTheDocument();
      // Overdraft format
      expect(screen.getByText('-$25.00')).toBeInTheDocument();
      expect(screen.getByText('-$75.00')).toBeInTheDocument();
      // Positive format with '+' prefix
      expect(screen.getByText('+$60.00')).toBeInTheDocument();

      // Risk callout rendered
      expect(screen.getByTestId('risk-callout')).toBeInTheDocument();
      expect(screen.getByText('Severe overdraft potential in Overdraft Account')).toBeInTheDocument();
    });

    it('synchronizes internalStatus when parent prop status transitions (controlled behavior)', () => {
      const actualView: ActualView = {
        description: 'Sync status test',
        transactions: [],
        transaction_descriptions: [],
        adjustments: [],
        accounts: [],
        risks: [],
      };

      const { rerender } = render(
        <RecordActualCard actualView={actualView} status="pending" />
      );
      expect(screen.getByTestId('choice-update-balances')).toBeInTheDocument();

      // Parent updates status prop to 'applied'
      rerender(<RecordActualCard actualView={actualView} status="applied" />);
      expect(screen.queryByTestId('choice-update-balances')).not.toBeInTheDocument();
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();

      // Parent resets status prop back to 'pending'
      rerender(<RecordActualCard actualView={actualView} status="pending" />);
      expect(screen.getByTestId('choice-update-balances')).toBeInTheDocument();
    });

    it('renders ScenarioTray gracefully with degenerate items (missing id, label, note)', () => {
      const degenerateItems: any[] = [
        // Missing id, missing label & note, has type
        {
          type: 'adjust_balance',
          account_id: 'acc-chequing',
          delta_cents: 5000,
          enabled: true,
        },
        // Missing id, missing label, missing note, missing type
        {
          enabled: false,
        },
        // Valid assumption
        {
          id: 'valid-1',
          label: 'Valid Custom Assumption',
          enabled: true,
          changes: [],
        },
      ];

      render(<ScenarioTray assumptions={degenerateItems} />);

      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      // First item generated id 'change-0' and described change label
      expect(screen.getByTestId('scenario-chip-change-0')).toBeInTheDocument();
      // Second item generated id 'change-1' and fallback label 'Assumption 2'
      expect(screen.getByTestId('scenario-chip-change-1')).toBeInTheDocument();
      expect(screen.getByText('Assumption 2')).toBeInTheDocument();
      // Third item rendered
      expect(screen.getByText('Valid Custom Assumption')).toBeInTheDocument();
    });

    it('ScenarioTray returns null for empty or nullish assumptions array without crashing', () => {
      const { container, rerender } = render(<ScenarioTray assumptions={[]} />);
      expect(container.firstChild).toBeNull();

      rerender(<ScenarioTray assumptions={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it('ScenarioTray does not throw when onToggle or onRemove callbacks are undefined', () => {
      const assumptions: ScenarioAssumption[] = [
        { id: 'as-1', label: 'Standalone Assumption', enabled: true, changes: [] },
      ];

      render(<ScenarioTray assumptions={assumptions} />);

      const toggleCheckbox = screen.getByTestId('scenario-toggle-as-1');
      const removeBtn = screen.getByTestId('scenario-remove-as-1');

      // Clicking with no callbacks should not crash
      expect(() => {
        fireEvent.click(toggleCheckbox);
        fireEvent.click(removeBtn);
      }).not.toThrow();
    });

    it('normalizes StepTrace when primitive values (string, number, null, undefined) are passed as step', () => {
      // 1. String primitive
      const { rerender } = render(<StepTrace step={'just a string primitive' as any} />);
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
      expect(screen.getAllByText('Tool activity').length).toBeGreaterThan(0);

      // 2. Number primitive
      rerender(<StepTrace step={9999 as any} />);
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();

      // 3. Null primitive
      rerender(<StepTrace step={null as any} />);
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
    });

    it('normalizes StepTrace when raw.function.arguments contains invalid JSON', () => {
      const malformedStep = {
        name: 'custom_ai_tool',
        function: {
          name: 'custom_ai_tool',
          arguments: '{ this is completely invalid JSON: &*^% }',
        },
      };

      expect(() => {
        render(<StepTrace step={malformedStep} />);
      }).not.toThrow();

      expect(screen.getAllByText('Executed custom_ai_tool').length).toBeGreaterThan(0);
    });

    it('auto-generates accurate natural summaries across all standard tools in StepTrace', () => {
      const steps: StepDetail[] = [
        { name: 'get_snapshot' },
        { name: 'get_schedule', input: { from_date: '2026-10-01', to_date: '2026-10-15' } },
        { name: 'get_schedule', input: {} },
        { name: 'simulate', input: { label: 'Car purchase scenario' } },
        { name: 'simulate', input: {} },
        { name: 'propose_blueprint_changes', input: { label: 'Delay insurance' } },
        { name: 'propose_blueprint_changes', input: {} },
        { name: 'record_actual', input: { description: 'Dinner out' } },
        { name: 'record_actual', input: {} },
        { name: 'unknown_agent_call' },
      ];

      render(<StepTrace steps={steps} defaultExpanded={true} />);

      expect(screen.getByText('Read plan snapshot')).toBeInTheDocument();
      const expectedScheduleSummary = `Checked schedule ${prettyDate('2026-10-01')} – ${prettyDate('2026-10-15')}`;
      expect(screen.getByText(expectedScheduleSummary)).toBeInTheDocument();
      expect(screen.getByText('Checked schedule')).toBeInTheDocument();
      expect(screen.getByText('Simulated "Car purchase scenario"')).toBeInTheDocument();
      expect(screen.getByText('Simulated scenario')).toBeInTheDocument();
      expect(screen.getByText('Proposed "Delay insurance"')).toBeInTheDocument();
      expect(screen.getByText('Proposed plan changes')).toBeInTheDocument();
      expect(screen.getByText('Asked how to record "Dinner out"')).toBeInTheDocument();
      expect(screen.getByText('Recorded transaction')).toBeInTheDocument();
      expect(screen.getByText('Executed unknown_agent_call')).toBeInTheDocument();
    });

    it('renders StepTrace formatted outputs for accounts slice, verdict changes, and errors', () => {
      const complexResultStep: StepDetail = {
        name: 'simulate',
        result: {
          as_of: '2026-10-11',
          overall_status: 'safe',
          verdict_before: 'warning',
          verdict_after: 'safe',
          accounts: [
            { name: 'Chequing', balance: '$2,450.50' },
            { name: 'Savings', balance: '$10,200.00' },
          ],
          events: [{ id: 'evt-1' }, { id: 'evt-2' }],
          error: 'Warning threshold breached',
        },
      };

      render(<StepTrace step={complexResultStep} defaultExpanded={true} />);

      // Expand step details
      const detailsBtn = screen.getByText('Details');
      fireEvent.click(detailsBtn);

      expect(screen.getByText('Formatted Result')).toBeInTheDocument();
      expect(screen.getByText('2026-10-11')).toBeInTheDocument();
      expect(screen.getByText('warning → safe')).toBeInTheDocument();
      expect(screen.getByText('Chequing')).toBeInTheDocument();
      expect(screen.getByText('$2,450.50')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // 2 upcoming events scheduled
      expect(screen.getByText('Error: Warning threshold breached')).toBeInTheDocument();
    });

    it('renders FigureChip and GroundingBadge boundary cases (unknown class, missing values, singular/plural)', () => {
      // 1. FigureChip with missing text & unknown classification
      const { rerender } = render(
        <FigureChip classification={'alien_class' as any} />
      );
      // Defaults to unverified cue ⚠
      expect(screen.getByText('⚠')).toBeInTheDocument();

      // 2. FigureChip keyboard accessibility (Enter / Space toggles popover)
      const chip = screen.getByRole('button');
      fireEvent.keyDown(chip, { key: 'Enter' });
      expect(screen.getByText('⚠️ Not produced by engine — treat with caution')).toBeInTheDocument();

      fireEvent.keyDown(chip, { key: ' ' }); // Space closes
      expect(screen.queryByText('⚠️ Not produced by engine — treat with caution')).not.toBeInTheDocument();

      // 3. GroundingBadge total = 0 returns null
      rerender(<GroundingBadge totalFigures={0} />);
      expect(screen.queryByTestId('grounding-badge-verified')).not.toBeInTheDocument();
      expect(screen.queryByTestId('grounding-badge-unverified')).not.toBeInTheDocument();

      // 4. GroundingBadge singular verified
      rerender(<GroundingBadge totalFigures={1} unverifiedCount={0} />);
      expect(screen.getByTestId('grounding-badge-verified')).toBeInTheDocument();
      expect(screen.getByText('1 figure · all engine-verified')).toBeInTheDocument();

      // 5. GroundingBadge plural unverified
      rerender(<GroundingBadge totalFigures={3} unverifiedCount={2} />);
      expect(screen.getByTestId('grounding-badge-unverified')).toBeInTheDocument();
      expect(screen.getByText('2 unverified figures')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SUITE 3: CLIPBOARD API FAILURES & RECOVERY
  // ============================================================================
  describe('Suite 3: Clipboard API Failures & Recovery in ContextInspector & StepTrace', () => {
    it('catches clipboard rejection in StepTrace developer view and displays toast.error without crashing', async () => {
      // Mock clipboard writeText to reject
      const clipboardError = new Error('Clipboard write access blocked');
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(clipboardError),
        },
      });

      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            rawPayload: { secret: 'data' },
          }}
          defaultExpanded={true}
        />
      );

      // Open developer view
      const devViewToggle = screen.getByTestId('developer-view-toggle');
      fireEvent.click(devViewToggle);

      // Click copy button
      const copyBtn = screen.getByText('Copy');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard');
      // Button still says Copy, does not claim "Copied"
      expect(screen.getByText('Copy')).toBeInTheDocument();
      expect(screen.queryByText('Copied')).not.toBeInTheDocument();

      // Recovery path: clipboard succeeds on subsequent attempt
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(toast.success).toHaveBeenCalledWith('Raw JSON copied to clipboard');
      expect(screen.getByText('Copied')).toBeInTheDocument();
    });

    it('catches clipboard rejection in ContextInspector and displays toast.error without crashing', async () => {
      // Mock clipboard writeText to reject
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      render(<ContextInspector open={true} />);

      const copyContextBtn = screen.getByText('Copy context');
      await act(async () => {
        fireEvent.click(copyContextBtn);
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to copy context');
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();

      // Recovery path
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      await act(async () => {
        fireEvent.click(copyContextBtn);
      });

      expect(toast.success).toHaveBeenCalledWith('Context copied to clipboard');
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('ContextInspector formats accounts table with null floor and negative headroom correctly', () => {
      usePlannerStore.setState({
        accounts: [
          {
            id: 'acc-null-floor',
            name: 'No Floor Account',
            type: 'chequing',
            owner: 'User',
            balance: 500,
            target_floor: null,
          },
          {
            id: 'acc-negative-headroom',
            name: 'Underwater Account',
            type: 'savings',
            owner: 'User',
            balance: 200,
            target_floor: 1000, // headroom: 200 - 1000 = -800
          },
        ],
        executedEvents: { 'evt-1': true, 'evt-2': false, 'evt-3': null as any },
      });

      render(<ContextInspector open={true} />);

      expect(screen.getByText('No Floor Account')).toBeInTheDocument();
      expect(screen.getByText('Underwater Account')).toBeInTheDocument();

      // Floor of acc-null-floor is '—'
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);

      // Underwater account has negative headroom -$800.00
      expect(screen.getByText('-$800.00')).toBeInTheDocument();

      // executedEvents count filters truthy values only -> 1
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SUITE 4: CHAT MODE SYNCHRONIZATION & STATE ISOLATION
  // ============================================================================
  describe('Suite 4: Chat Mode Synchronization & State Isolation (tactical vs auditor)', () => {
    it('completely isolates messages, proposal statuses, and assumptions across tactical and auditor modes', async () => {
      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
          </ChatProvider>
        );
      });

      // 1. Initial mode is tactical
      expect(chatContext.chatMode).toBe('tactical');

      // Populate tactical mode state
      act(() => {
        chatContext.setMessages([
          { role: 'user', content: 'Tactical question about next payday' },
        ]);
        chatContext.setProposalStatus('proposal-tac', 'applied');
        chatContext.setRecordStatus('record-tac', 'applied');
        chatContext.addAssumption('Tactical assumption', [
          { type: 'adjust_balance', account_id: 'acc-chequing', delta_cents: 1000 },
        ]);
      });

      expect(chatContext.messages.length).toBe(1);
      expect(chatContext.proposalStatuses['proposal-tac']).toBe('applied');
      expect(chatContext.recordStatuses['record-tac']).toBe('applied');
      expect(chatContext.scenarioAssumptions.length).toBe(1);

      // 2. Switch mode to auditor
      act(() => {
        chatContext.setChatMode('auditor');
      });

      expect(chatContext.chatMode).toBe('auditor');
      // In auditor mode, tactical history and meta must not bleed in
      expect(chatContext.messages.length).toBe(0);
      expect(chatContext.proposalStatuses['proposal-tac']).toBeUndefined();
      expect(chatContext.recordStatuses['record-tac']).toBeUndefined();
      expect(chatContext.scenarioAssumptions.length).toBe(0);

      // 3. Add auditor-specific state
      act(() => {
        chatContext.setMessages([
          { role: 'user', content: 'Auditor query for past month variance' },
        ]);
        chatContext.setProposalStatus('proposal-audit', 'rejected');
        chatContext.addAssumption('Auditor variance adjustment', [
          { type: 'adjust_balance', account_id: 'acc-savings', delta_cents: -5000 },
        ]);
      });

      expect(chatContext.messages.length).toBe(1);
      expect(chatContext.messages[0].content).toBe('Auditor query for past month variance');
      expect(chatContext.proposalStatuses['proposal-audit']).toBe('rejected');
      expect(chatContext.scenarioAssumptions.length).toBe(1);
      expect(chatContext.scenarioAssumptions[0].label).toBe('Auditor variance adjustment');

      // 4. Switch back to tactical mode
      act(() => {
        chatContext.setChatMode('tactical');
      });

      expect(chatContext.chatMode).toBe('tactical');
      // Tactical state is faithfully restored
      expect(chatContext.messages.length).toBe(1);
      expect(chatContext.messages[0].content).toBe('Tactical question about next payday');
      expect(chatContext.proposalStatuses['proposal-tac']).toBe('applied');
      expect(chatContext.proposalStatuses['proposal-audit']).toBeUndefined();
      expect(chatContext.recordStatuses['record-tac']).toBe('applied');
      expect(chatContext.scenarioAssumptions.length).toBe(1);
      expect(chatContext.scenarioAssumptions[0].label).toBe('Tactical assumption');

      // 5. Purging in tactical mode preserves auditor history in storage
      act(() => {
        chatContext.clearMessages();
      });

      expect(chatContext.messages.length).toBe(0);
      expect(chatContext.scenarioAssumptions.length).toBe(0);

      // Switch back to auditor -> auditor history is still intact!
      act(() => {
        chatContext.setChatMode('auditor');
      });

      expect(chatContext.messages.length).toBe(1);
      expect(chatContext.messages[0].content).toBe('Auditor query for past month variance');
      expect(chatContext.scenarioAssumptions.length).toBe(1);
    });
  });

  // ============================================================================
  // SUITE 5: RE-RENDERING STABILITY, MEMORY LEAK RESISTANCE & WINDOW REGISTRATION
  // ============================================================================
  describe('Suite 5: Re-rendering Stability, Memory Leak Resistance & Window Registration', () => {
    it('manages window._paydayChatContext registration lifecycle cleanly on mount and unmount', async () => {
      expect((window as any)._paydayChatContext).toBeUndefined();

      let unmountFn!: () => void;
      await act(async () => {
        const res = render(
          <ChatProvider>
            <div>Chat Mounted</div>
          </ChatProvider>
        );
        unmountFn = res.unmount;
      });

      // Context is registered on window
      expect((window as any)._paydayChatContext).toBeDefined();
      expect(typeof (window as any)._paydayChatContext.applyRecordActual).toBe('function');
      expect(typeof (window as any)._paydayChatContext.toggleAssumption).toBe('function');

      unmountFn();

      // Cleaned up on unmount
      expect((window as any)._paydayChatContext).toBeUndefined();
    });

    it('survives 20 rapid mount and unmount cycles of ChatProvider without exceptions or memory leaks', async () => {
      for (let i = 0; i < 20; i++) {
        let unmountFn!: () => void;
        await act(async () => {
          const res = render(
            <ChatProvider>
              <div data-testid={`cycle-${i}`}>Cycle {i}</div>
            </ChatProvider>
          );
          unmountFn = res.unmount;
        });
        expect(screen.getByTestId(`cycle-${i}`)).toBeInTheDocument();
        unmountFn();
      }
      expect((window as any)._paydayChatContext).toBeUndefined();
    });

    it('StalenessPill renders when snapshot differs and triggers onRefresh on Enter, Space, and click', () => {
      const onRefreshSpy = vi.fn();
      const currentSnap = 'snap-active-12345';
      const staleSnap = 'snap-stale-99999';

      // 1. Fresh message (snapshot matches) -> null
      const { rerender } = render(
        <StalenessPill
          messageSnapshotId={currentSnap}
          currentSnapshotId={currentSnap}
          onRefresh={onRefreshSpy}
        />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      // 2. Message missing snapshotId -> null
      rerender(
        <StalenessPill
          messageSnapshotId={undefined}
          currentSnapshotId={currentSnap}
          onRefresh={onRefreshSpy}
        />
      );
      expect(screen.queryByTestId('staleness-pill')).not.toBeInTheDocument();

      // 3. Stale message -> renders pill
      rerender(
        <StalenessPill
          messageSnapshotId={staleSnap}
          currentSnapshotId={currentSnap}
          onRefresh={onRefreshSpy}
        />
      );
      const pill = screen.getByTestId('staleness-pill');
      expect(pill).toBeInTheDocument();

      // 4. Mouse click triggers refresh
      fireEvent.click(pill);
      expect(onRefreshSpy).toHaveBeenCalledTimes(1);

      // 5. Keyboard Enter triggers refresh
      fireEvent.keyDown(pill, { key: 'Enter' });
      expect(onRefreshSpy).toHaveBeenCalledTimes(2);

      // 6. Keyboard Space triggers refresh
      fireEvent.keyDown(pill, { key: ' ' });
      expect(onRefreshSpy).toHaveBeenCalledTimes(3);

      // 7. Non-activation keys (Tab, ArrowDown) do NOT trigger refresh
      fireEvent.keyDown(pill, { key: 'Tab' });
      fireEvent.keyDown(pill, { key: 'ArrowDown' });
      expect(onRefreshSpy).toHaveBeenCalledTimes(3);
    });

    it('getPlannerSnapshotId recovers safely if store access throws an error', () => {
      const originalGetState = (usePlannerStore as any).getState;
      (usePlannerStore as any).getState = () => {
        throw new Error('Simulated store corruption');
      };

      try {
        const snap = getPlannerSnapshotId();
        expect(snap).toBe('');
      } finally {
        (usePlannerStore as any).getState = originalGetState;
      }
    });
  });

  // ============================================================================
  // SUITE 6: CHATPANEL INTEGRATION, TOOL DISPATCH & PROVENANCE RENDERING
  // ============================================================================
  describe('Suite 6: ChatPanel Integration, Tool Dispatch & Provenance Rendering', () => {
    it('ChatPanel renders RecordActualCard for record_actual tool messages with choice binding', async () => {
      const recordToolMsg: ChatMessage = {
        role: 'tool',
        name: 'record_actual',
        content: JSON.stringify({ description: 'Costco Wholesale run' }),
        tool_call_id: 'call-costco-99',
        tool_execution: {
          name: 'record_actual',
          summary: 'Recorded transaction',
          ok: true,
          sources: [],
          result: { description: 'Costco Wholesale run' },
          actual: {
            description: 'Costco Wholesale run',
            transactions: [],
            transaction_descriptions: [],
            risks: [],
            accounts: [
              {
                id: 'acc-chequing',
                name: 'Primary Chequing',
                before_cents: 245050,
                after_cents: 215050,
              },
            ],
            adjustments: [
              {
                type: 'adjust_balance',
                account_id: 'acc-chequing',
                delta_cents: -30000,
              },
            ],
          },
        },
      };

      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
            <ChatPanel mode="floating" />
          </ChatProvider>
        );
      });

      act(() => {
        chatContext.setMessages([recordToolMsg]);
      });

      expect(screen.getByTestId('record-actual-card')).toBeInTheDocument();
      expect(screen.getByText('Costco Wholesale run')).toBeInTheDocument();
      expect(screen.getByText('Update my balances')).toBeInTheDocument();

      // Click Update my balances from inside ChatPanel
      act(() => {
        fireEvent.click(screen.getByTestId('choice-update-balances'));
      });

      // Context record status is updated
      expect(chatContext.recordStatuses['call-costco-99']).toBe('applied');
      expect(screen.getByText('Balances updated in plan')).toBeInTheDocument();
    });

    it('ChatPanel renders StepTrace for generic tool calls', async () => {
      const snapshotToolMsg: ChatMessage = {
        role: 'tool',
        name: 'get_snapshot',
        content: JSON.stringify({ accounts: [] }),
        tool_call_id: 'call-snap-1',
        tool_execution: {
          name: 'get_snapshot',
          summary: 'Read plan snapshot',
          ok: true,
          sources: [],
          result: {},
        },
      };

      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
            <ChatPanel mode="floating" />
          </ChatProvider>
        );
      });

      act(() => {
        chatContext.setMessages([snapshotToolMsg]);
      });

      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
      expect(screen.getAllByText('Read plan snapshot').length).toBeGreaterThan(0);
    });

    it('ChatPanel header Context Inspector button toggles inspector drawer open and closed', async () => {
      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel mode="floating" />
          </ChatProvider>
        );
      });

      expect(screen.queryByTestId('context-inspector-drawer')).not.toBeInTheDocument();

      const inspectorBtn = screen.getByTestId('context-inspector-trigger');
      act(() => {
        fireEvent.click(inspectorBtn);
      });

      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
      expect(screen.getByText('Context Inspector')).toBeInTheDocument();
    });

    it('renders assistant prose with automatic FigureChip replacement and grounding badge in footer', async () => {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: 'Your primary balance is $2,450.50 after deducting the expected expenses.',
        snapshotId: 'snap-msg-1',
        sources: [
          {
            cents: 245050,
            label: 'Primary Chequing balance',
          },
        ],
      };

      let chatContext!: ChatContextType;
      await act(async () => {
        render(
          <ChatProvider>
            <ChatContextSpy onContext={(ctx) => (chatContext = ctx)} />
            <ChatPanel mode="page" />
          </ChatProvider>
        );
      });

      act(() => {
        chatContext.setMessages([assistantMsg]);
      });

      // FigureChip rendered inside Markdown prose
      const chip = screen.getByRole('button', { name: /\$2,450\.50/ });
      expect(chip).toBeInTheDocument();

      // Grounding badge rendered in footer
      expect(screen.getByTestId('grounding-badge-verified')).toBeInTheDocument();
      expect(screen.getByText('1 figure · all engine-verified')).toBeInTheDocument();
    });
  });
});

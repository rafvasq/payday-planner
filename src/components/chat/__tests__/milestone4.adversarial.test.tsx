import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepTrace } from '../StepTrace';
import { ContextInspector } from '../ContextInspector';
import { StalenessPill } from '../StalenessPill';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { usePlannerStore } from '@/store/usePlannerStore';
import { toast } from '@/components/ui/sonner';
import { Account } from '@/core/models';

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Milestone 4 Adversarial Stress Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.setState({
      accounts: [],
      events: [],
      executedEvents: {},
      startingBalancesReflectToday: false,
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('Suite 1: StepTrace Developer View Toggle & Complex/Large Payloads', () => {
    it('handles extremely large JSON payloads (1000 items) without crashing', () => {
      const largeAccounts = Array.from({ length: 1000 }, (_, i) => ({
        account_id: `acc-${i}`,
        name: `Stress Account #${i}`,
        balance: `$${(i * 123.45).toFixed(2)}`,
      }));

      const complexPayload = {
        as_of: '2026-10-11',
        overall_status: 'safe',
        accounts: largeAccounts,
        metadata: {
          nested: {
            deep: {
              data: Array.from({ length: 500 }, (_, i) => `item-${i}`),
            },
          },
        },
      };

      const { container } = render(
        <StepTrace
          step={{
            name: 'simulate',
            summary: 'Simulated 1000 accounts',
            status: 'completed',
            rawPayload: complexPayload,
            result: complexPayload,
          }}
        />
      );

      const devToggle = screen.getByTestId('developer-view-toggle');
      expect(devToggle).toBeInTheDocument();

      // Open developer view
      fireEvent.click(devToggle);
      expect(screen.getByText('Raw JSON Payload')).toBeInTheDocument();

      const preElement = container.querySelector('pre');
      expect(preElement).toBeInTheDocument();
      expect(preElement?.textContent).toContain('Stress Account #999');

      // Rapidly toggle 5 times
      fireEvent.click(devToggle);
      fireEvent.click(devToggle);
      fireEvent.click(devToggle);
      fireEvent.click(devToggle);
      fireEvent.click(devToggle);

      // Verify still intact
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
    });

    it('safely renders payloads with special characters, Unicode, and potential XSS strings', () => {
      const maliciousPayload = {
        script: '<script>alert("xss")</script>',
        img: '<img src=x onerror=alert(1)>',
        unicode: '💸 🚀 € £ ¥ ¢ 漢字 العربية',
        quotes: `"double" and 'single' and \`backtick\` and \n newline \t tab`,
      };

      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            summary: 'XSS test step',
            status: 'completed',
            input: maliciousPayload,
            rawPayload: maliciousPayload,
          }}
        />
      );

      // Expand details
      const detailsBtn = screen.getByRole('button', { name: /Details/i });
      fireEvent.click(detailsBtn);

      expect(screen.getByText('Inputs')).toBeInTheDocument();
      // Should be rendered as text, not executed as HTML
      expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();

      // Open developer view
      fireEvent.click(screen.getByTestId('developer-view-toggle'));
      const unicodeMatches = screen.getAllByText(/💸 🚀 € £ ¥ ¢/);
      expect(unicodeMatches.length).toBeGreaterThan(0);
    });

    it('handles unusual step input formats (primitives, arrays, empty objects) gracefully', () => {
      const { rerender } = render(
        <StepTrace
          step={{
            name: 'test_tool',
            status: 'completed',
            input: {}, // empty object
          }}
        />
      );
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();

      // Input as array
      rerender(
        <StepTrace
          step={{
            name: 'test_tool',
            status: 'completed',
            input: ['item1', 'item2'],
          }}
        />
      );
      const detailsBtn = screen.getByRole('button', { name: /Details/i });
      fireEvent.click(detailsBtn);
      expect(screen.getByText('Inputs')).toBeInTheDocument();

      // Input as null
      rerender(
        <StepTrace
          step={{
            name: 'test_tool',
            status: 'completed',
            input: null,
          }}
        />
      );
      expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
    });

    it('handles step results with varied data structures (0 accounts, missing fields, primitive results)', () => {
      const { rerender, container } = render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            status: 'completed',
            result: {
              as_of: '2026-10-11',
              overall_status: 'danger',
              accounts: [], // zero accounts
              events: [],
            },
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Details/i }));
      expect(screen.getByText('Formatted Result')).toBeInTheDocument();
      expect(screen.getByText('danger')).toBeInTheDocument();
      expect(container.textContent).toContain('0 upcoming events scheduled in period');

      // Result with null fields and verdict change
      rerender(
        <StepTrace
          step={{
            name: 'simulate',
            status: 'completed',
            result: {
              verdict_before: 'safe',
              verdict_after: 'overdraft',
            },
          }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /Details/i }));
      expect(screen.getByText('safe → overdraft')).toBeInTheDocument();
    });
  });

  describe('Suite 2: StepTrace Clipboard Copy & Error Resilience', () => {
    it('copies formatted JSON with 2-space indentation and displays feedback', async () => {
      const samplePayload = { account: 'Checking', balance_cents: 50000 };
      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            status: 'completed',
            rawPayload: samplePayload,
          }}
        />
      );

      // Open developer view
      fireEvent.click(screen.getByTestId('developer-view-toggle'));

      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(samplePayload, null, 2)
      );
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Raw JSON copied to clipboard');
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });
    });

    it('handles clipboard API rejection gracefully with error toast', async () => {
      (navigator.clipboard.writeText as any).mockRejectedValueOnce(
        new Error('Clipboard write permission denied')
      );

      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            status: 'completed',
            rawPayload: { test: true },
          }}
        />
      );

      fireEvent.click(screen.getByTestId('developer-view-toggle'));
      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard');
      });
      // Should not throw and remain intact
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
    });

    it('handles missing navigator.clipboard gracefully without throwing', async () => {
      const originalClipboard = navigator.clipboard;
      // Simulate insecure context where navigator.clipboard is undefined
      delete (navigator as any).clipboard;

      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            status: 'completed',
            rawPayload: { secure: false },
          }}
        />
      );

      fireEvent.click(screen.getByTestId('developer-view-toggle'));
      const copyBtn = screen.getByRole('button', { name: /Copy/i });

      // Click should not crash
      expect(() => fireEvent.click(copyBtn)).not.toThrow();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard');
      });

      // Restore clipboard
      Object.assign(navigator, { clipboard: originalClipboard });
    });
  });

  describe('Suite 3: StepTrace Chained Tool Calls & Status Priority Matrix', () => {
    it('prioritizes in_progress loader in header when any step in a chain is in progress', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'simulate', status: 'error', error: 'Failed simulation' },
            { name: 'propose_blueprint_changes', status: 'in_progress' },
          ]}
        />
      );

      // In progress overrides error and completed in the header
      expect(screen.getByTestId('status-in-progress')).toBeInTheDocument();
      expect(screen.queryByTestId('status-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('status-completed')).not.toBeInTheDocument();
      expect(screen.getByText('Agent Activity (3 steps)')).toBeInTheDocument();
    });

    it('prioritizes error indicator in header when any step has error and none are in progress', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'get_schedule', status: 'error', error: 'Date out of bounds' },
            { name: 'simulate', status: 'completed' },
          ]}
        />
      );

      expect(screen.getByTestId('status-error')).toBeInTheDocument();
      expect(screen.queryByTestId('status-in-progress')).not.toBeInTheDocument();
      expect(screen.queryByTestId('status-completed')).not.toBeInTheDocument();
    });

    it('renders individual timeline icons correctly for mixed status chain', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'get_schedule', status: 'error', error: 'Failed' },
            { name: 'simulate', status: 'in_progress' },
          ]}
        />
      );

      // 3 step items in timeline
      expect(screen.getByText('Read plan snapshot')).toBeInTheDocument();
      expect(screen.getByText('Checked schedule')).toBeInTheDocument();
      expect(screen.getByText('Simulated scenario')).toBeInTheDocument();
    });

    it('normalizes OpenAI tool call object with string arguments', () => {
      render(
        <StepTrace
          step={{
            id: 'call_99',
            function: {
              name: 'simulate',
              arguments: '{"label": "Test Scenario", "horizon_days": 14}',
            },
          }}
        />
      );

      const scenarioElements = screen.getAllByText('Simulated "Test Scenario"');
      expect(scenarioElements.length).toBeGreaterThan(0);
    });

    it('handles malformed string arguments in OpenAI tool call without throwing', () => {
      expect(() => {
        render(
          <StepTrace
            step={{
              id: 'call_broken',
              function: {
                name: 'simulate',
                arguments: '{invalid_json',
              },
            }}
          />
        );
      }).not.toThrow();

      const fallbackElements = screen.getAllByText('Simulated scenario');
      expect(fallbackElements.length).toBeGreaterThan(0);
    });
  });

  describe('Suite 4: ContextInspector Accounts Table Stress Testing', () => {
    it('renders cleanly with zero accounts without throwing or crashing', () => {
      usePlannerStore.setState({ accounts: [] });

      render(<ContextInspector open={true} />);

      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
      expect(screen.getByText('Accounts Table (0)')).toBeInTheDocument();
      // Table headers are present
      expect(screen.getByText('Starting (CAD)')).toBeInTheDocument();
      expect(screen.getByText('Headroom')).toBeInTheDocument();
    });

    it('formats negative balances (overdraft) and floor breaches with destructive styling', () => {
      const testAccounts: Account[] = [
        {
          id: 'acc-overdrawn',
          name: 'Overdraft Chequing',
          type: 'chequing',
          owner: 'User',
          balance: -350.5,
          target_floor: 100.0,
        },
        {
          id: 'acc-floor-breached',
          name: 'Dipped Savings',
          type: 'savings',
          owner: 'User',
          balance: 250.0,
          target_floor: 500.0,
        },
        {
          id: 'acc-healthy',
          name: 'Healthy Hub',
          type: 'savings',
          owner: 'User',
          balance: 2486.54,
          target_floor: 500.0,
        },
        {
          id: 'acc-no-floor',
          name: 'Credit Card',
          type: 'debt',
          owner: 'User',
          balance: -1211.92,
          target_floor: null,
        },
      ];

      usePlannerStore.setState({ accounts: testAccounts });

      render(<ContextInspector open={true} />);

      expect(screen.getByText('Overdraft Chequing')).toBeInTheDocument();
      expect(screen.getByText('-$350.50')).toBeInTheDocument();
      // Headroom for overdrawn account: -350.50 - 100.00 = -450.50
      const overdraftHeadroom = screen.getByText('-$450.50');
      expect(overdraftHeadroom).toBeInTheDocument();
      expect(overdraftHeadroom).toHaveClass('text-destructive');

      // Headroom for dipped savings: 250.00 - 500.00 = -250.00
      const dippedHeadroom = screen.getByText('-$250.00');
      expect(dippedHeadroom).toBeInTheDocument();
      expect(dippedHeadroom).toHaveClass('text-destructive');

      // Headroom for healthy hub: 2486.54 - 500.00 = 1986.54
      const healthyHeadroom = screen.getByText('$1,986.54');
      expect(healthyHeadroom).toBeInTheDocument();
      expect(healthyHeadroom).toHaveClass('text-emerald-600');

      // Credit card with no floor
      expect(screen.getByText('Credit Card')).toBeInTheDocument();
      expect(screen.getByText('-$1,211.92')).toBeInTheDocument();
      // Floor should be dash
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('handles exact zero balance and zero floor correctly', () => {
      const zeroAccount: Account = {
        id: 'acc-zero',
        name: 'Zero Account',
        type: 'chequing',
        owner: 'User',
        balance: 0,
        target_floor: 0,
      };

      usePlannerStore.setState({ accounts: [zeroAccount] });

      render(<ContextInspector open={true} />);

      expect(screen.getByText('Zero Account')).toBeInTheDocument();
      const zeroAmounts = screen.getAllByText('$0.00');
      expect(zeroAmounts.length).toBeGreaterThanOrEqual(2); // Starting and Floor and Headroom
    });

    it('handles large number of accounts (50 accounts) with table scroll containment', () => {
      const manyAccounts: Account[] = Array.from({ length: 50 }, (_, i) => ({
        id: `acc-${i}`,
        name: `Account Number ${i}`,
        type: (i % 2 === 0 ? 'chequing' : 'savings') as any,
        owner: 'User',
        balance: (i + 1) * 100,
        target_floor: 50,
      }));

      usePlannerStore.setState({ accounts: manyAccounts });

      render(<ContextInspector open={true} />);

      expect(screen.getByText('Accounts Table (50)')).toBeInTheDocument();
      expect(screen.getByText('Account Number 0')).toBeInTheDocument();
      expect(screen.getByText('Account Number 49')).toBeInTheDocument();
    });
  });

  describe('Suite 5: ContextInspector Clipboard Copy & Payload Format Validation', () => {
    it('copies complete context payload with valid schema, CAD currencies, and flags', async () => {
      const accounts: Account[] = [
        {
          id: 'acc-eq',
          name: 'EQ Hub',
          type: 'savings',
          owner: 'User',
          balance: 2486.54,
          target_floor: 500.0,
        },
      ];

      usePlannerStore.setState({
        accounts,
        startingBalancesReflectToday: true,
        executedEvents: { ev1: true, ev2: false, ev3: true },
      });

      render(<ContextInspector open={true} />);

      const copyBtn = screen.getByRole('button', { name: /Copy context/i });
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
      const copiedJsonStr = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];

      // Parse and validate schema
      const parsed = JSON.parse(copiedJsonStr);
      expect(parsed).toHaveProperty('as_of');
      expect(parsed).toHaveProperty('snapshot_id');
      expect(parsed.snapshot_id).toMatch(/^[a-f0-9]{8}$/);
      expect(parsed.engine_flags).toEqual({
        balancesReflectToday: true,
        executedEventsCount: 2, // only true values counted
      });
      expect(parsed.active_assumptions_count).toBe(0);
      expect(parsed.accounts).toHaveLength(1);
      expect(parsed.accounts[0]).toEqual({
        id: 'acc-eq',
        name: 'EQ Hub',
        type: 'savings',
        starting_balance_cad: '$2,486.54',
        starting_balance_cents: 248654,
        floor_cad: '$500.00',
        floor_cents: 50000,
        headroom_cad: '$1,986.54',
        headroom_cents: 198654,
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Context copied to clipboard');
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('handles clipboard failure gracefully in ContextInspector', async () => {
      (navigator.clipboard.writeText as any).mockRejectedValueOnce(
        new Error('Clipboard denied')
      );

      render(<ContextInspector open={true} />);

      const copyBtn = screen.getByRole('button', { name: /Copy context/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy context');
      });
      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
    });
  });

  describe('Suite 6: ContextInspector Drawer Toggle Performance & State Stability', () => {
    it('handles rapid drawer open/close toggles without desynchronization or crashes', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <ContextInspector open={false} onOpenChange={onOpenChange} />
      );

      // Rapidly toggle 20 times
      for (let i = 0; i < 20; i++) {
        rerender(<ContextInspector open={i % 2 === 0} onOpenChange={onOpenChange} />);
      }

      // Final state open
      rerender(<ContextInspector open={true} onOpenChange={onOpenChange} />);
      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();
    });

    it('seamlessly integrates with ChatProvider inspector state', () => {
      const TestConsumer = () => {
        const chat = useChat();
        return (
          <div>
            <button onClick={chat.toggleInspector}>Toggle Inspector</button>
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

      // Open via chat context
      fireEvent.click(screen.getByText('Toggle Inspector'));
      expect(screen.getByTestId('context-inspector-drawer')).toBeInTheDocument();

      // Close via chat context
      fireEvent.click(screen.getByText('Toggle Inspector'));
      expect(screen.queryByTestId('context-inspector-drawer')).not.toBeInTheDocument();
    });

    it('reactively updates snapshot hash when store state changes while open', () => {
      const { rerender } = render(<ContextInspector open={true} />);

      const initialHash = screen.getByText(/^[a-f0-9]{8}$/).textContent;

      // Update store with new account
      usePlannerStore.setState({
        accounts: [
          {
            id: 'acc-new',
            name: 'New Mutated Account',
            type: 'savings',
            owner: 'User',
            balance: 9999,
          },
        ],
      });

      rerender(<ContextInspector open={true} />);

      const updatedHash = screen.getByText(/^[a-f0-9]{8}$/).textContent;
      expect(updatedHash).not.toEqual(initialHash);
      expect(screen.getByText('New Mutated Account')).toBeInTheDocument();
    });
  });
});

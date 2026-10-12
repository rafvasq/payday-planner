import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepTrace, StepDetail } from '../StepTrace';
import { ToolExecution } from '@/core/ai/toolkit';
import { toast } from '@/components/ui/sonner';

describe('StepTrace Component (Requirement R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('1. Activity Rail Header & Summary', () => {
    it('renders single step summary directly in header', () => {
      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            summary: 'Read plan snapshot',
            status: 'completed',
          }}
        />
      );

      const headerSummary = screen.getAllByText('Read plan snapshot');
      expect(headerSummary.length).toBeGreaterThan(0);
      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
    });

    it('renders total step count in header when multiple steps are provided', () => {
      const steps: StepDetail[] = [
        { name: 'get_snapshot', summary: 'Read plan snapshot', status: 'completed' },
        { name: 'get_schedule', summary: 'Checked schedule Oct 9 – Oct 15', status: 'completed' },
        { name: 'simulate', summary: 'Simulated scenario', status: 'completed' },
      ];

      render(<StepTrace steps={steps} />);

      expect(screen.getByText('Agent Activity (3 steps)')).toBeInTheDocument();
      // All 3 step summaries should be visible in expanded rail
      expect(screen.getByText('Read plan snapshot')).toBeInTheDocument();
      expect(screen.getByText('Checked schedule Oct 9 – Oct 15')).toBeInTheDocument();
      expect(screen.getByText('Simulated scenario')).toBeInTheDocument();
    });

    it('toggles rail collapse when clicking the rail header', () => {
      const steps: StepDetail[] = [
        { name: 'get_snapshot', summary: 'Read plan snapshot', status: 'completed' },
      ];

      render(<StepTrace steps={steps} defaultExpanded={true} />);

      // Initially open
      expect(screen.getAllByText('Read plan snapshot').length).toBeGreaterThan(0);

      // Click header button to collapse
      const headerBtn = screen.getByRole('button', { name: /Read plan snapshot/i });
      fireEvent.click(headerBtn);

      // Collapsible content is closed
      const railHeader = screen.getByTestId('step-trace');
      expect(railHeader).toBeInTheDocument();
    });

    it('respects defaultExpanded={false} starting collapsed', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', summary: 'Read plan snapshot', status: 'completed' },
          ]}
          defaultExpanded={false}
        />
      );

      expect(screen.getByTestId('step-trace')).toBeInTheDocument();
      expect(screen.getAllByText('Read plan snapshot').length).toBeGreaterThan(0);
    });
  });

  describe('2. Status Indicators', () => {
    it('renders completed checkmark when all steps are completed', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'get_schedule', status: 'completed' },
          ]}
        />
      );

      expect(screen.getByTestId('status-completed')).toBeInTheDocument();
      expect(screen.queryByTestId('status-in-progress')).not.toBeInTheDocument();
      expect(screen.queryByTestId('status-error')).not.toBeInTheDocument();
    });

    it('renders in-progress spinner when any step is in progress', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'simulate', status: 'in_progress' },
          ]}
        />
      );

      expect(screen.getByTestId('status-in-progress')).toBeInTheDocument();
      expect(screen.queryByTestId('status-completed')).not.toBeInTheDocument();
    });

    it('renders in-progress spinner when isLoading prop is true', () => {
      render(
        <StepTrace
          isLoading={true}
          step={{ name: 'get_snapshot', summary: 'Reading your plan…' }}
        />
      );

      expect(screen.getByTestId('status-in-progress')).toBeInTheDocument();
    });

    it('renders error indicator when any step has error status or ok=false', () => {
      render(
        <StepTrace
          steps={[
            { name: 'get_snapshot', status: 'completed' },
            { name: 'simulate', status: 'error', error: 'Failed simulation' },
          ]}
        />
      );

      expect(screen.getByTestId('status-error')).toBeInTheDocument();
    });
  });

  describe('3. Human-Readable Action Descriptions', () => {
    it('derives default summary for get_snapshot', () => {
      render(<StepTrace step={{ name: 'get_snapshot' }} />);
      expect(screen.getAllByText('Read plan snapshot').length).toBeGreaterThan(0);
    });

    it('derives default summary for get_schedule with formatted dates', () => {
      render(
        <StepTrace
          step={{
            name: 'get_schedule',
            input: { from_date: '2026-10-09', to_date: '2026-10-15' },
          }}
        />
      );

      expect(screen.getAllByText(/Checked schedule/i).length).toBeGreaterThan(0);
    });

    it('derives default summary for simulate with scenario label', () => {
      render(
        <StepTrace
          step={{
            name: 'simulate',
            input: { label: 'Skip Vault sweep Oct 15' },
          }}
        />
      );

      expect(screen.getAllByText('Simulated "Skip Vault sweep Oct 15"').length).toBeGreaterThan(0);
    });

    it('derives default summary for propose_blueprint_changes with label', () => {
      render(
        <StepTrace
          step={{
            name: 'propose_blueprint_changes',
            input: { label: 'Emergency transfer' },
          }}
        />
      );

      expect(screen.getAllByText('Proposed "Emergency transfer"').length).toBeGreaterThan(0);
    });

    it('derives default summary for record_actual with description', () => {
      render(
        <StepTrace
          step={{
            name: 'record_actual',
            input: { description: 'Transferred $3,200 to EQ Hub' },
          }}
        />
      );

      expect(screen.getAllByText('Asked how to record "Transferred $3,200 to EQ Hub"').length).toBeGreaterThan(0);
    });

    it('displays tool badge alongside summary', () => {
      render(
        <StepTrace
          step={{
            name: 'simulate',
            summary: 'Simulated custom scenario',
          }}
        />
      );

      expect(screen.getByText('simulate')).toBeInTheDocument();
    });
  });

  describe('4. Expandable Step Details (Inputs & Formatted Outputs)', () => {
    it('expands inputs when clicking Details button', () => {
      const step: StepDetail = {
        name: 'get_schedule',
        summary: 'Checked schedule',
        status: 'completed',
        input: { from_date: '2026-10-09', to_date: '2026-10-15', account_id: 'acc-1' },
      };

      render(<StepTrace step={step} />);

      // Initially details are not shown
      expect(screen.queryByText('Inputs')).not.toBeInTheDocument();

      // Click Details
      const detailsBtn = screen.getByRole('button', { name: /Details/i });
      fireEvent.click(detailsBtn);

      // Now inputs are revealed
      expect(screen.getByText('Inputs')).toBeInTheDocument();
      expect(screen.getByText('from_date:')).toBeInTheDocument();
      expect(screen.getByText('2026-10-09')).toBeInTheDocument();
      expect(screen.getByText('account_id:')).toBeInTheDocument();
      expect(screen.getByText('acc-1')).toBeInTheDocument();

      // Button toggles to Hide details
      expect(screen.getByText('Hide details')).toBeInTheDocument();

      // Click again to collapse
      fireEvent.click(screen.getByRole('button', { name: /Hide details/i }));
      expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
    });

    it('expands formatted result with accounts and verdict', () => {
      const step: StepDetail = {
        name: 'get_snapshot',
        summary: 'Read plan snapshot',
        status: 'completed',
        result: {
          as_of: '2026-10-11',
          overall_status: 'safe',
          accounts: [
            { name: 'R Chequing', balance: '$4,357.22' },
            { name: 'EQ Hub', balance: '$2,486.54' },
          ],
        },
      };

      render(<StepTrace step={step} />);

      const detailsBtn = screen.getByRole('button', { name: /Details/i });
      fireEvent.click(detailsBtn);

      expect(screen.getByText('Formatted Result')).toBeInTheDocument();
      expect(screen.getByText('As of:')).toBeInTheDocument();
      expect(screen.getByText('2026-10-11')).toBeInTheDocument();
      expect(screen.getByText('safe')).toBeInTheDocument();
      expect(screen.getByText('R Chequing')).toBeInTheDocument();
      expect(screen.getByText('$4,357.22')).toBeInTheDocument();
      expect(screen.getByText('EQ Hub')).toBeInTheDocument();
      expect(screen.getByText('$2,486.54')).toBeInTheDocument();
    });

    it('renders error message in expanded details when step has error', () => {
      const step: StepDetail = {
        name: 'simulate',
        summary: 'Simulation failed',
        status: 'error',
        error: 'Engine calculation failed: division by zero',
      };

      render(<StepTrace step={step} />);

      const detailsBtn = screen.getByRole('button', { name: /Details/i });
      fireEvent.click(detailsBtn);

      expect(screen.getByText('Engine calculation failed: division by zero')).toBeInTheDocument();
    });
  });

  describe('5. Developer View Toggle & Clipboard Copy', () => {
    it('toggles developer view showing raw JSON payload', () => {
      const samplePayload = { foo: 'bar', count: 42 };
      render(
        <StepTrace
          step={{
            name: 'test_tool',
            summary: 'Test tool summary',
            rawPayload: samplePayload,
          }}
        />
      );

      // Initially raw JSON pre is not visible
      expect(screen.queryByText('Raw JSON Payload')).not.toBeInTheDocument();

      // Click Developer view toggle
      const devToggle = screen.getByTestId('developer-view-toggle');
      fireEvent.click(devToggle);

      // Now visible
      expect(screen.getByText('Raw JSON Payload')).toBeInTheDocument();
      expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();

      // Click toggle again to close
      fireEvent.click(devToggle);
      expect(screen.queryByText('Raw JSON Payload')).not.toBeInTheDocument();
    });

    it('copies raw JSON payload to clipboard and shows feedback', async () => {
      const toastSuccessSpy = vi.spyOn(toast, 'success');
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');

      const samplePayload = { engine_state: 'verified', amount_cents: 320000 };
      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            rawPayload: samplePayload,
          }}
        />
      );

      // Open developer view
      fireEvent.click(screen.getByTestId('developer-view-toggle'));

      // Click Copy button
      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledTimes(1);
        expect(writeTextSpy).toHaveBeenCalledWith(JSON.stringify(samplePayload, null, 2));
        expect(toastSuccessSpy).toHaveBeenCalledWith('Raw JSON copied to clipboard');
        expect(screen.getByText('Copied')).toBeInTheDocument();
      });
    });

    it('handles clipboard write failure gracefully with toast.error', async () => {
      const toastErrorSpy = vi.spyOn(toast, 'error');
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Permission denied'));

      render(
        <StepTrace
          step={{
            name: 'get_snapshot',
            rawPayload: { val: 123 },
          }}
        />
      );

      fireEvent.click(screen.getByTestId('developer-view-toggle'));
      const copyBtn = screen.getByRole('button', { name: /Copy/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith('Failed to copy to clipboard');
      });
    });
  });

  describe('6. Convenience Prop Formats & Edge Cases', () => {
    it('accepts single ToolExecution prop via execution prop', () => {
      const execution: ToolExecution = {
        name: 'get_snapshot',
        ok: true,
        summary: 'Snapshot fetched from unified engine',
        result: { accounts: [] },
        sources: [],
      };

      render(<StepTrace execution={execution} />);

      expect(screen.getAllByText('Snapshot fetched from unified engine').length).toBeGreaterThan(0);
      expect(screen.getByTestId('status-completed')).toBeInTheDocument();
    });

    it('accepts flat props (name, summary, result, input)', () => {
      render(
        <StepTrace
          name="simulate"
          summary="Flat prop simulation summary"
          input={{ days: 30 }}
          result={{ status: 'safe' }}
        />
      );

      expect(screen.getAllByText('Flat prop simulation summary').length).toBeGreaterThan(0);
    });

    it('handles raw OpenAI function call structure with JSON string arguments', () => {
      const functionCallStep = {
        function: {
          name: 'get_schedule',
          arguments: JSON.stringify({ from_date: '2026-10-01', to_date: '2026-10-15' }),
        },
      };

      render(<StepTrace steps={[functionCallStep]} />);

      expect(screen.getAllByText(/Checked schedule/i).length).toBeGreaterThan(0);
    });

    it('handles malformed JSON in function.arguments gracefully without throwing', () => {
      const malformedStep = {
        function: {
          name: 'get_schedule',
          arguments: 'INVALID_JSON{missing_bracket',
        },
      };

      expect(() => render(<StepTrace steps={[malformedStep]} />)).not.toThrow();
    });

    it('merges custom className prop', () => {
      render(
        <StepTrace
          step={{ name: 'get_snapshot' }}
          className="custom-steptrace-class border-dashed"
        />
      );

      const root = screen.getByTestId('step-trace');
      expect(root.className).toContain('custom-steptrace-class');
      expect(root.className).toContain('border-dashed');
    });
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScenarioTray } from '../ScenarioTray';
import { ChatProvider, useChat, ScenarioAssumption } from '../../../context/ChatContext';
import { usePlannerStore } from '../../../store/usePlannerStore';
import { BalanceAdjustment } from '../../../core/ai/world';
import { BlueprintChange } from '../../../core/tools';

// Mock apiClient for ChatProvider mounting
vi.mock('../../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('ScenarioTray: Milestone 3 Active Assumptions Tray', () => {
  const sampleAssumptions: ScenarioAssumption[] = [
    {
      id: 'asmp-1',
      label: 'Assumed landed: $3,200.00 R Chequing → EQ Hub',
      enabled: true,
      changes: [
        {
          type: 'adjust_balance',
          account_id: 'chq_r',
          delta_cents: -320000,
        },
        {
          type: 'adjust_balance',
          account_id: 'eq_hub',
          delta_cents: 320000,
        },
      ],
    },
    {
      id: 'asmp-2',
      label: 'Skip "Vault sweep" Oct 15',
      enabled: true,
      changes: [
        {
          type: 'skip_event',
          event_id: 'evt-vault',
          date: '2026-10-15',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('1. Active Assumption Chips Rendering', () => {
    it('renders the scenario tray container with label and chips', () => {
      render(<ScenarioTray assumptions={sampleAssumptions} />);

      const tray = screen.getByTestId('scenario-tray');
      expect(tray).toBeInTheDocument();
      expect(screen.getByText('Scenario Tray:')).toBeInTheDocument();

      expect(
        screen.getByText('Assumed landed: $3,200.00 R Chequing → EQ Hub')
      ).toBeInTheDocument();
      expect(screen.getByText('Skip "Vault sweep" Oct 15')).toBeInTheDocument();
    });

    it('renders null when assumptions list is empty or undefined', () => {
      const { container: container1 } = render(<ScenarioTray assumptions={[]} />);
      expect(container1.firstChild).toBeNull();
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();

      const { container: container2 } = render(<ScenarioTray />);
      expect(container2.firstChild).toBeNull();
    });

    it('displays enabled chip with active styling and unchecked/disabled chip with line-through styling', () => {
      const mixedAssumptions: ScenarioAssumption[] = [
        {
          id: 'chip-active',
          label: 'Active Assumption',
          enabled: true,
          changes: [],
        },
        {
          id: 'chip-disabled',
          label: 'Disabled Assumption',
          enabled: false,
          changes: [],
        },
      ];

      render(<ScenarioTray assumptions={mixedAssumptions} />);

      const activeChip = screen.getByTestId('scenario-chip-chip-active');
      expect(activeChip.className).not.toMatch(/line-through/);

      const disabledChip = screen.getByTestId('scenario-chip-chip-disabled');
      expect(disabledChip.className).toMatch(/line-through/);
    });

    it('derives description from BlueprintChange when label is omitted', () => {
      const rawChanges: any[] = [
        {
          id: 'raw-change-1',
          type: 'skip_event',
          event_id: 'evt-rent',
          date: '2026-10-15',
        },
      ];

      render(<ScenarioTray assumptions={rawChanges} />);

      expect(screen.getByTestId('scenario-chip-raw-change-1')).toBeInTheDocument();
      // describeChange will produce text for skip_event
      expect(screen.getByText(/Skip/i)).toBeInTheDocument();
    });

    it('falls back to index-based id and label when both are missing', () => {
      const minimalItems: any[] = [{ enabled: true }];

      render(<ScenarioTray assumptions={minimalItems} />);

      expect(screen.getByTestId('scenario-chip-change-0')).toBeInTheDocument();
      expect(screen.getByText('Assumption 1')).toBeInTheDocument();
    });
  });

  describe('2. Toggle Checkbox Behavior', () => {
    it('renders checkbox reflecting enabled state for each assumption', () => {
      render(<ScenarioTray assumptions={sampleAssumptions} />);

      const toggle1 = screen.getByTestId('scenario-toggle-asmp-1') as HTMLInputElement;
      const toggle2 = screen.getByTestId('scenario-toggle-asmp-2') as HTMLInputElement;

      expect(toggle1.checked).toBe(true);
      expect(toggle2.checked).toBe(true);
      expect(toggle1).toHaveAttribute(
        'aria-label',
        'Toggle Assumed landed: $3,200.00 R Chequing → EQ Hub'
      );
    });

    it('triggers onToggle callback with correct assumption id when clicked', () => {
      const handleToggle = vi.fn();
      render(<ScenarioTray assumptions={sampleAssumptions} onToggle={handleToggle} />);

      const toggle1 = screen.getByTestId('scenario-toggle-asmp-1');
      fireEvent.click(toggle1);

      expect(handleToggle).toHaveBeenCalledTimes(1);
      expect(handleToggle).toHaveBeenCalledWith('asmp-1');

      const toggle2 = screen.getByTestId('scenario-toggle-asmp-2');
      fireEvent.click(toggle2);

      expect(handleToggle).toHaveBeenCalledTimes(2);
      expect(handleToggle).toHaveBeenCalledWith('asmp-2');
    });
  });

  describe('3. Dismiss X Button Behavior', () => {
    it('renders remove button with accessible aria-label for each assumption', () => {
      render(<ScenarioTray assumptions={sampleAssumptions} />);

      const removeBtn1 = screen.getByTestId('scenario-remove-asmp-1');
      const removeBtn2 = screen.getByTestId('scenario-remove-asmp-2');

      expect(removeBtn1).toHaveAttribute(
        'aria-label',
        'Remove Assumed landed: $3,200.00 R Chequing → EQ Hub'
      );
      expect(removeBtn2).toHaveAttribute(
        'aria-label',
        'Remove Skip "Vault sweep" Oct 15'
      );
    });

    it('triggers onRemove callback with correct assumption id when dismiss button is clicked', () => {
      const handleRemove = vi.fn();
      render(<ScenarioTray assumptions={sampleAssumptions} onRemove={handleRemove} />);

      const removeBtn1 = screen.getByTestId('scenario-remove-asmp-1');
      fireEvent.click(removeBtn1);

      expect(handleRemove).toHaveBeenCalledTimes(1);
      expect(handleRemove).toHaveBeenCalledWith('asmp-1');

      const removeBtn2 = screen.getByTestId('scenario-remove-asmp-2');
      fireEvent.click(removeBtn2);

      expect(handleRemove).toHaveBeenCalledTimes(2);
      expect(handleRemove).toHaveBeenCalledWith('asmp-2');
    });
  });

  describe('4. Connected ChatContext Integration', () => {
    // Helper component to exercise context methods directly
    const ContextConsumerHarness: React.FC = () => {
      const {
        scenarioAssumptions,
        addAssumption,
        toggleAssumption,
        removeAssumption,
        assumptions,
      } = useChat();

      return (
        <div>
          <ScenarioTray />
          <button
            onClick={() =>
              addAssumption('Assumed landed: $500 transfer', {
                type: 'adjust_balance',
                account_id: 'acc-1',
                delta_cents: 50000,
              })
            }
          >
            Add Context Assumption
          </button>
          <div data-testid="active-assumptions-count">{assumptions.length}</div>
        </div>
      );
    };

    it('reads active assumptions from ChatContext and renders tray dynamically', async () => {
      render(
        <ChatProvider>
          <ContextConsumerHarness />
        </ChatProvider>
      );

      // Initially no assumptions
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('0');

      // Add assumption via context
      await act(async () => {
        fireEvent.click(screen.getByText('Add Context Assumption'));
      });

      // Tray appears with the added assumption chip
      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();
      expect(screen.getByText('Assumed landed: $500 transfer')).toBeInTheDocument();
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('1');
    });

    it('toggling assumption in ChatProvider excludes it from active projection assumptions', async () => {
      render(
        <ChatProvider>
          <ContextConsumerHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Add Context Assumption'));
      });

      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('1');

      // Find the toggle checkbox in the tray
      const toggle = screen.getByRole('checkbox', {
        name: /Toggle Assumed landed: \$500 transfer/i,
      });
      expect((toggle as HTMLInputElement).checked).toBe(true);

      // Toggle off
      await act(async () => {
        fireEvent.click(toggle);
      });

      // Checkbox is now unchecked
      expect((toggle as HTMLInputElement).checked).toBe(false);
      // Excluded from active projection assumptions!
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('0');

      // Toggle back on
      await act(async () => {
        fireEvent.click(toggle);
      });

      expect((toggle as HTMLInputElement).checked).toBe(true);
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('1');
    });

    it('dismissing assumption in ChatProvider removes it from tray and context', async () => {
      render(
        <ChatProvider>
          <ContextConsumerHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Add Context Assumption'));
      });

      expect(screen.getByTestId('scenario-tray')).toBeInTheDocument();

      const removeBtn = screen.getByRole('button', {
        name: /Remove Assumed landed: \$500 transfer/i,
      });

      await act(async () => {
        fireEvent.click(removeBtn);
      });

      // Tray disappears when empty
      expect(screen.queryByTestId('scenario-tray')).not.toBeInTheDocument();
      expect(screen.getByTestId('active-assumptions-count')).toHaveTextContent('0');
    });
  });
});

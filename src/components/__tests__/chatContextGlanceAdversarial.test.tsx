// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatProvider } from '../../context/ChatContext';
import { ChatPanel } from '../ChatPanel';
import { api } from '../../lib/apiClient';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Account, Event } from '../../core/models';
import { format, addDays } from 'date-fns';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test-provider', analysis_model: 'default-model' }),
    getModels: vi.fn().mockResolvedValue([
      {
        provider_name: 'Test Provider',
        provider_type: 'test',
        models: [
          { id: 'default-model', name: 'Default Model' },
        ],
      },
    ]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('Empirical Adversarial Challenge: ChatPanel Context Glance Integration', () => {
  const today = new Date();
  const futureRentStr = format(addDays(today, 3), 'yyyy-MM-dd');
  const futurePaydayStr = format(addDays(today, 5), 'yyyy-MM-dd');

  const sampleAccounts: Account[] = [
    {
      id: 'acc-chq',
      name: 'Main Chequing',
      type: 'chequing',
      owner: 'Alice',
      balance: 2450.75,
      target_floor: 1000,
    },
    {
      id: 'acc-sav',
      name: 'High Interest Savings',
      type: 'savings',
      owner: 'Alice',
      balance: 15200.5,
      target_floor: 5000,
    },
    {
      id: 'acc-inv',
      name: 'TFSA Investment',
      type: 'investment',
      owner: 'Alice',
      balance: 34000.0,
    },
  ];

  const sampleEvents: Event[] = [
    {
      id: 'evt-rent',
      name: 'Monthly Rent',
      event_type: 'outflow',
      amount: 1650.0,
      anchor_date: futureRentStr,
      frequency: 'monthly',
      from_account_id: 'acc-chq',
      to_account_id: null,
      execution: 'auto',
      weekend_shift: 'none',
      active: true,
    },
    {
      id: 'evt-payday',
      name: 'Employer Payday',
      event_type: 'inflow',
      amount: 3200.0,
      anchor_date: futurePaydayStr,
      frequency: 'biweekly',
      from_account_id: null,
      to_account_id: 'acc-chq',
      execution: 'auto',
      weekend_shift: 'none',
      active: true,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.setState({
      accounts: [...sampleAccounts],
      events: [...sampleEvents],
      executedEvents: {},
      uploadedFiles: [],
    });
    useSettingsStore.setState({
      chatModel: 'default-model',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. DYNAMIC MOUNTING & UNMOUNTING STRESS
  // ==========================================================================
  describe('1. Dynamic Mounting & Unmounting Stress', () => {
    it('mounts ContextGlanceBar when showContextGlance is true and unmounts when false', async () => {
      useSettingsStore.setState({ showContextGlance: false });

      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );

      // Initially unmounted
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();

      // Toggle store to true
      await act(async () => {
        useSettingsStore.setState({ showContextGlance: true });
      });

      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();

      // Toggle store back to false
      await act(async () => {
        useSettingsStore.setState({ showContextGlance: false });
      });

      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();
    });

    it('toggles showContextGlance seamlessly via header button and updates visual button state', async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );

      const headerToggle = screen.getByTestId('toggle-context-glance');
      expect(headerToggle).toBeInTheDocument();
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();

      // Click header toggle to open
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(true);
      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
      expect(headerToggle.className).toContain('bg-secondary');

      // Click header toggle to close
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(false);
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();
      expect(headerToggle.className).not.toContain('bg-secondary text-secondary-foreground');
    });

    it('endures rapid multi-toggle stress without state corruption or duplicate DOM nodes', async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );

      const headerToggle = screen.getByTestId('toggle-context-glance');

      // Rapidly toggle 10 times
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          fireEvent.click(headerToggle);
        });
      }

      // After 10 clicks (even number), it should be closed
      expect(useSettingsStore.getState().showContextGlance).toBe(false);
      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();

      // 11th click -> open
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(useSettingsStore.getState().showContextGlance).toBe(true);
      const glanceBars = screen.getAllByTestId('context-glance-bar');
      expect(glanceBars.length).toBe(1); // strictly 1 instance, no duplicates
    });

    it('preserves user input in textarea across glance bar mount and unmount transitions', async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      
      // User types draft text
      fireEvent.change(textarea, { target: { value: 'My custom unfinished draft prompt...' } });
      expect(textarea.value).toBe('My custom unfinished draft prompt...');

      const headerToggle = screen.getByTestId('toggle-context-glance');

      // Mount glance bar
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
      expect(textarea.value).toBe('My custom unfinished draft prompt...');

      // Unmount glance bar
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(screen.queryByTestId('context-glance-bar')).not.toBeInTheDocument();
      expect(textarea.value).toBe('My custom unfinished draft prompt...');
    });

    it('does not disrupt active streaming state when glance bar is toggled', async () => {
      let releaseStream: () => void = () => {};
      const streamPromise = new Promise<void>((res) => {
        releaseStream = res;
      });

      const mockStream = async function* () {
        yield 'Initial streaming chunk...';
        await streamPromise;
        yield ' Final streaming chunk.';
      };
      (api.chatStream as any).mockReturnValue(mockStream());

      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      fireEvent.change(textarea, { target: { value: 'Will this stream break?' } });

      const form = textarea.closest('form')!;
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;

      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Streaming is now in progress
      expect(screen.getByText(/Initial streaming chunk\.\.\./i)).toBeInTheDocument();

      // Toggle glance bar on while streaming
      const headerToggle = screen.getByTestId('toggle-context-glance');
      await act(async () => {
        fireEvent.click(headerToggle);
      });

      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
      expect(screen.getByText(/Initial streaming chunk\.\.\./i)).toBeInTheDocument();

      // Release stream
      await act(async () => {
        releaseStream();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Thinking\.\.\./i)).not.toBeInTheDocument();
        expect(screen.getByText(/Final streaming chunk\./i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Final streaming chunk\./i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. QUICK ACTION CHIPS & SUBMISSION READINESS
  // ==========================================================================
  describe('2. Quick Action Chips & Submission Readiness', () => {
    it('clicking account chip updates input field and enables Send button for immediate submission', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      const mockStream = async function* () {
        yield 'Here is your balance outlook for High Interest Savings.';
      };
      (api.chatStream as any).mockReturnValue(mockStream());

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('');

      // Send button should initially be disabled because input is empty
      const form = textarea.closest('form')!;
      const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitButton).toBeDisabled();

      // Click the High Interest Savings account chip
      const accountChips = screen.getAllByTestId('glance-account-chip');
      const targetAccChip = accountChips.find((c) => c.textContent?.includes('High Interest Savings')) || accountChips[0];
      
      await act(async () => {
        fireEvent.click(targetAccChip);
      });

      // Input is updated
      expect(textarea.value).toBe('What is my balance outlook for High Interest Savings?');
      // Submit button is now enabled
      expect(submitButton).not.toBeDisabled();

      // Submit immediately via button click
      await act(async () => {
        fireEvent.click(submitButton);
      });

      // api.chatStream called with the prompt
      expect(api.chatStream).toHaveBeenCalled();
      const firstArg = (api.chatStream as any).mock.calls[0][0];
      expect(firstArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'What is my balance outlook for High Interest Savings?',
          }),
        ])
      );
    });

    it('clicking outflow event chip updates input and submits via Enter key', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      const mockStream = async function* () {
        yield 'Rent analysis complete.';
      };
      (api.chatStream as any).mockReturnValue(mockStream());

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      const eventChips = screen.getAllByTestId('glance-event-chip');
      expect(eventChips.length).toBeGreaterThan(0);

      const rentChip = eventChips.find((c) => c.textContent?.includes('Monthly Rent')) || eventChips[0];
      
      await act(async () => {
        fireEvent.click(rentChip);
      });

      expect(textarea.value).toMatch(/^Can I afford Monthly Rent/);
      expect(textarea.value).toContain('$1,650.00');

      // Submit via Enter key
      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      });

      expect(api.chatStream).toHaveBeenCalled();
      const firstArg = (api.chatStream as any).mock.calls[0][0];
      expect(firstArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringMatching(/^Can I afford Monthly Rent/),
          }),
        ])
      );
    });

    it('clicking inflow event chip updates input with budget impact question and is ready for send', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      const eventChips = screen.getAllByTestId('glance-event-chip');
      const paydayChip = eventChips.find((c) => c.textContent?.includes('Employer Payday'));

      expect(paydayChip).toBeDefined();

      await act(async () => {
        fireEvent.click(paydayChip!);
      });

      expect(textarea.value).toMatch(/^How will Employer Payday \(\$3,200\.00\)/);
      expect(textarea.value).toContain('affect my budget?');

      const submitButton = textarea.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitButton).not.toBeDisabled();
    });

    it('expanding glance bar exposes quick-action suggestion chips that update input and submit cleanly', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      const mockStream = async function* () {
        yield 'Affordability response.';
      };
      (api.chatStream as any).mockReturnValue(mockStream());

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Expand the glance bar
      const expandToggle = screen.getByTestId('glance-expand-toggle');
      await act(async () => {
        fireEvent.click(expandToggle);
      });

      // Quick action suggestion chips are now visible
      const suggestionChips = screen.getAllByTestId('glance-quick-action-chip');
      expect(suggestionChips.length).toBeGreaterThanOrEqual(2);

      const weekendChip = suggestionChips.find((c) => c.textContent?.includes('$200 this weekend')) || suggestionChips[0];
      const chipText = weekendChip.textContent?.trim() || '';

      await act(async () => {
        fireEvent.click(weekendChip);
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe(chipText);

      // Submit via form
      const submitButton = textarea.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitButton).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(submitButton);
      });

      expect(api.chatStream).toHaveBeenCalled();
      const firstArg = (api.chatStream as any).mock.calls[0][0];
      expect(firstArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: chipText,
          }),
        ])
      );
    });

    it('clicking multiple chips sequentially cleanly replaces the input field without duplication', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      const accountChips = screen.getAllByTestId('glance-account-chip');

      // Click first chip
      await act(async () => {
        fireEvent.click(accountChips[0]);
      });
      const firstText = textarea.value;
      expect(firstText.length).toBeGreaterThan(0);

      // Click second chip
      if (accountChips.length > 1) {
        await act(async () => {
          fireEvent.click(accountChips[1]);
        });
        const secondText = textarea.value;
        expect(secondText).not.toBe(firstText);
        expect(secondText).not.toContain(firstText); // Clean replacement, not concatenated
      }
    });
  });

  // ==========================================================================
  // 3. FLOATING CHAT MODE VS FULL PAGE CHAT MODE
  // ==========================================================================
  describe('3. Floating Chat Mode vs Full Page Chat Mode', () => {
    it('renders clean layout in full page mode with description and minimize button', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      let container: HTMLElement;
      await act(async () => {
        const res = render(
          <MemoryRouter initialEntries={['/intelligence/chat']}>
            <ChatProvider>
              <ChatPanel mode="page" />
            </ChatProvider>
          </MemoryRouter>
        );
        container = res.container;
      });

      // In page mode, description is visible
      expect(
        screen.getByText(/Ask questions about your budget\. The AI has real-time read access/i)
      ).toBeInTheDocument();

      // Glance bar is mounted
      const glanceBar = screen.getByTestId('context-glance-bar');
      expect(glanceBar).toBeInTheDocument();

      // Card has page styling
      const card = container!.querySelector('.rounded-none.sm\\:rounded-xl');
      expect(card).toBeInTheDocument();
    });

    it('renders clean compact layout in floating mode omitting description and offering maximize button', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      let container: HTMLElement;
      await act(async () => {
        const res = render(
          <MemoryRouter initialEntries={['/dashboard']}>
            <ChatProvider>
              <ChatPanel mode="floating" />
            </ChatProvider>
          </MemoryRouter>
        );
        container = res.container;
      });

      // In floating mode, description is NOT rendered to save vertical space
      expect(
        screen.queryByText(/Ask questions about your budget\. The AI has real-time read access/i)
      ).not.toBeInTheDocument();

      // Glance bar is mounted cleanly in floating mode
      const glanceBar = screen.getByTestId('context-glance-bar');
      expect(glanceBar).toBeInTheDocument();

      // Card has borderless floating styling
      const card = container!.querySelector('.shadow-none.border-0.rounded-none.bg-background');
      expect(card).toBeInTheDocument();

      // Header has compact padding py-3 px-4
      const header = container!.querySelector('.py-3.px-4');
      expect(header).toBeInTheDocument();
    });

    it('expands mini-dashboard within floating mode without causing structural layout breaks', async () => {
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <MemoryRouter>
            <ChatProvider>
              <ChatPanel mode="floating" />
            </ChatProvider>
          </MemoryRouter>
        );
      });

      const expandToggle = screen.getByTestId('glance-expand-toggle');
      
      // Expand inside floating mode
      await act(async () => {
        fireEvent.click(expandToggle);
      });

      // Both sections should render within the container
      expect(screen.getByText('Accounts & Target Floors')).toBeInTheDocument();
      expect(screen.getByText('Upcoming (Next 14 Days)')).toBeInTheDocument();
      expect(screen.getByText('Suggestions:')).toBeInTheDocument();

      // Collapse back
      await act(async () => {
        fireEvent.click(expandToggle);
      });

      expect(screen.queryByText('Accounts & Target Floors')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 4. ADVERSARIAL EDGE CASES & INTEGRITY BOUNDARIES
  // ==========================================================================
  describe('4. Adversarial Edge Cases & Integrity Boundaries', () => {
    it('safely handles account and event names with HTML brackets, quotes, and emojis', async () => {
      const weirdAccounts: Account[] = [
        {
          id: 'acc-weird',
          name: '<script>alert("xss")</script> 💰 Savings',
          type: 'savings',
          owner: 'Tester',
          balance: 8888.88,
        },
      ];
      const weirdEvents: Event[] = [
        {
          id: 'evt-weird',
          name: 'Fancy "Dinner" & <Gifts> 🎁',
          event_type: 'outflow',
          amount: 250.0,
          anchor_date: format(addDays(today, 2), 'yyyy-MM-dd'),
          frequency: 'one-time',
          from_account_id: 'acc-weird',
          to_account_id: null,
          execution: 'auto',
          weekend_shift: 'none',
          active: true,
        },
      ];

      usePlannerStore.setState({
        accounts: weirdAccounts,
        events: weirdEvents,
      });
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Verify rendered text doesn't execute script and appears safely
      expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();

      // Click weird account chip
      const accChip = screen.getAllByTestId('glance-account-chip')[0];
      await act(async () => {
        fireEvent.click(accChip);
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('What is my balance outlook for <script>alert("xss")</script> 💰 Savings?');

      // Click weird event chip
      const evtChip = screen.getAllByTestId('glance-event-chip')[0];
      await act(async () => {
        fireEvent.click(evtChip);
      });

      expect(textarea.value).toContain('Fancy "Dinner" & <Gifts> 🎁');
      expect(textarea.value).toContain('$250.00');
    });

    it('renders gracefully when store has zero accounts and zero events', async () => {
      usePlannerStore.setState({
        accounts: [],
        events: [],
      });
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
      expect(screen.getByText('$0.00')).toBeInTheDocument();
      expect(screen.getByText('No accounts')).toBeInTheDocument();

      // Expand with empty state
      const expandToggle = screen.getByTestId('glance-expand-toggle');
      await act(async () => {
        fireEvent.click(expandToggle);
      });

      expect(screen.getByText('No active accounts found.')).toBeInTheDocument();
      expect(screen.getByText('No upcoming bills or paydays in the next 14 days.')).toBeInTheDocument();
    });

    it('handles accounts with target floor breaches and negative balances without breaking layout', async () => {
      const breachedAccounts: Account[] = [
        {
          id: 'acc-overdrawn',
          name: 'Overdrawn Chequing',
          type: 'chequing',
          owner: 'Alice',
          balance: -340.25,
          target_floor: 500.0,
        },
      ];

      usePlannerStore.setState({
        accounts: breachedAccounts,
        events: [],
      });
      useSettingsStore.setState({ showContextGlance: true });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // In compact view: total liquid balance and account pill both show -$340.25
      const balanceSpans = screen.getAllByText('-$340.25');
      expect(balanceSpans.length).toBeGreaterThanOrEqual(1);

      // Expand to view breach floor indicator
      const expandToggle = screen.getByTestId('glance-expand-toggle');
      await act(async () => {
        fireEvent.click(expandToggle);
      });

      expect(screen.getByText('Floor: $500.00')).toBeInTheDocument();
      // Should suggest how to bring back above target floor
      const floorSuggestion = screen.getByText('How can I bring Overdrawn Chequing back above target floor?');
      expect(floorSuggestion).toBeInTheDocument();

      // Click floor suggestion
      await act(async () => {
        fireEvent.click(floorSuggestion);
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('How can I bring Overdrawn Chequing back above target floor?');
    });
  });
});
